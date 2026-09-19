/**
 * Object storage abstraction backed by Cloudflare R2's S3-compatible API.
 *
 * All public methods return/accept the StorageFile interface so callers
 * (routes, objectAcl) remain backend-agnostic.
 */

import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable, PassThrough } from "stream";
import { randomUUID } from "crypto";
import type { StorageFile, StorageFileMetadata } from "./storageFile";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  if (parts.length < 3) {
    throw new Error("Invalid object path: must include at least a bucket name");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

/**
 * S3/R2 requires user-metadata keys to be lowercase and free of colons.
 * objectAcl.ts uses the public "custom:aclPolicy" alias, so preserve that
 * alias on reads while storing the R2-compatible key.
 */
const R2_ACL_KEY = "aclpolicy";
const ACL_POLICY_ALIAS = "custom:aclPolicy";

function sanitizeMetaKey(key: string): string {
  if (key === ACL_POLICY_ALIAS) return R2_ACL_KEY;
  return key.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
}

function buildR2Client(): S3Client {
  const required = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `R2 storage is not configured. Missing ${missing.join(", ")}. ` +
        "Set all three R2 credentials before using object storage.",
    );
  }

  const accountId = process.env.R2_ACCOUNT_ID as string;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID as string;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string;
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // Keep URLs as /<bucket>/<key>, matching the configured object paths.
    forcePathStyle: true,
  });
}

class R2StorageFile implements StorageFile {
  readonly name: string;
  readonly bucket: { readonly name: string };

  constructor(
    private readonly client: S3Client,
    private readonly bucketName: string,
    private readonly key: string,
  ) {
    this.name = key;
    this.bucket = { name: bucketName };
  }

  async exists(): Promise<[boolean]> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: this.key }),
      );
      return [true];
    } catch (err: any) {
      const status = err.$metadata?.httpStatusCode;
      if (status === 404 || err.name === "NotFound" || err.name === "NoSuchKey") {
        return [false];
      }
      throw err;
    }
  }

  async getMetadata(): Promise<[StorageFileMetadata]> {
    const res = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucketName, Key: this.key }),
    );
    const raw = res.Metadata ?? {};
    const metadata: Record<string, string> = { ...raw };
    if (raw[R2_ACL_KEY] !== undefined) {
      metadata[ACL_POLICY_ALIAS] = raw[R2_ACL_KEY];
    }
    return [{ contentType: res.ContentType, size: res.ContentLength, metadata }];
  }

  async setMetadata(options: { metadata: Record<string, string> }): Promise<void> {
    const [existing] = await this.getMetadata();
    const merged: Record<string, string> = {};
    for (const [key, value] of Object.entries(existing.metadata ?? {})) {
      if (key === ACL_POLICY_ALIAS) continue;
      merged[key] = value;
    }
    for (const [key, value] of Object.entries(options.metadata)) {
      merged[sanitizeMetaKey(key)] = value;
    }

    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucketName,
        Key: this.key,
        CopySource: `${this.bucketName}/${this.key}`,
        Metadata: merged,
        MetadataDirective: "REPLACE",
        ContentType: existing.contentType ?? "application/octet-stream",
      }),
    );
  }

  createReadStream(): NodeJS.ReadableStream {
    const passThrough = new PassThrough();
    this.client
      .send(new GetObjectCommand({ Bucket: this.bucketName, Key: this.key }))
      .then((res) => {
        const body = res.Body;
        if (!body) {
          passThrough.destroy(new Error("Empty R2 response body"));
          return;
        }
        (body as Readable).pipe(passThrough);
      })
      .catch((err) => passThrough.destroy(err));
    return passThrough;
  }
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  private _r2Client: S3Client | null = null;

  /** Delay configuration errors until the first storage operation. */
  private get r2(): S3Client {
    if (!this._r2Client) this._r2Client = buildR2Client();
    return this._r2Client;
  }

  getPublicObjectSearchPaths(): string[] {
    const raw = process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "";
    const paths = Array.from(
      new Set(
        raw
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0),
      ),
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS is not set. " +
          "Set it to a comma-separated list of /<bucket>/<prefix> paths.",
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR ?? "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR is not set. Set it to /<bucket>/<prefix>.",
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<StorageFile | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const file = new R2StorageFile(this.r2, bucketName, objectName);
      const [exists] = await file.exists();
      if (exists) return file;
    }
    return null;
  }

  async downloadObject(
    file: StorageFile,
    cacheTtlSec = 3600,
  ): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream as Readable) as ReadableStream;
    const headers: Record<string, string> = {
      "Content-Type": metadata.contentType ?? "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size != null) headers["Content-Length"] = String(metadata.size);
    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const { bucketName, objectName } = parseObjectPath(
      `${this.getPrivateObjectDir()}/uploads/${randomUUID()}`,
    );
    return getSignedUrl(
      this.r2,
      new PutObjectCommand({ Bucket: bucketName, Key: objectName }),
      { expiresIn: 900 },
    );
  }

  /**
   * Upload a binary buffer directly to object storage and return its serving
   * path. This avoids requiring client-side CORS configuration.
   */
  async putObjectEntity(body: Buffer, contentType: string): Promise<string> {
    const objectId = randomUUID();
    const { bucketName, objectName } = parseObjectPath(
      `${this.getPrivateObjectDir()}/uploads/${objectId}`,
    );
    await this.r2.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectName,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      }),
    );
    return `/objects/uploads/${objectId}`;
  }

  async getObjectEntityFile(objectPath: string): Promise<StorageFile> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) throw new ObjectNotFoundError();

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) entityDir += "/";
    const { bucketName, objectName } = parseObjectPath(`${entityDir}${entityId}`);
    const file = new R2StorageFile(this.r2, bucketName, objectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    const accountId = process.env.R2_ACCOUNT_ID;
    const isR2 =
      !!accountId &&
      rawPath.startsWith(`https://${accountId}.r2.cloudflarestorage.com/`);
    if (!isR2) return rawPath;

    const rawObjectPath = new URL(rawPath).pathname;
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) objectEntityDir += "/";
    if (!rawObjectPath.startsWith(objectEntityDir)) return rawObjectPath;

    return `/objects/${rawObjectPath.slice(objectEntityDir.length)}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) return normalizedPath;
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StorageFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}