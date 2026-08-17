/**
 * Object storage abstraction with two backends:
 *
 *   • Replit / GCS  — used when R2_ACCOUNT_ID is NOT set (dev on Replit)
 *   • Cloudflare R2 — used when R2_ACCOUNT_ID IS set  (production / Railway)
 *
 * All public methods return/accept the StorageFile interface so callers
 * (routes, objectAcl) are completely backend-agnostic.
 */

import { Storage, File as GcsFile } from "@google-cloud/storage";
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

// ─── Shared helpers ───────────────────────────────────────────────────────────

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  if (parts.length < 3) {
    throw new Error("Invalid object path: must include at least a bucket name");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

// ─── GCS / Replit backend ─────────────────────────────────────────────────────

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const gcsClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  } as any,
  projectId: "",
});

/** Wraps a GCS File so it satisfies the StorageFile interface. */
class GcsStorageFile implements StorageFile {
  readonly name: string;
  readonly bucket: { readonly name: string };

  constructor(private readonly file: GcsFile) {
    this.name = file.name;
    this.bucket = { name: file.bucket.name };
  }

  exists(): Promise<[boolean]> {
    return this.file.exists();
  }

  async getMetadata(): Promise<[StorageFileMetadata]> {
    const [meta] = await this.file.getMetadata();
    return [
      {
        contentType: meta.contentType as string | undefined,
        size: meta.size as string | number | undefined,
        metadata: meta.metadata as Record<string, string> | undefined,
      },
    ];
  }

  async setMetadata(options: { metadata: Record<string, string> }): Promise<void> {
    await this.file.setMetadata({ metadata: options.metadata });
  }

  createReadStream(): NodeJS.ReadableStream {
    return this.file.createReadStream();
  }
}

async function signGcsObjectURL(opts: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const body = JSON.stringify({
    bucket_name: opts.bucketName,
    object_name: opts.objectName,
    method: opts.method,
    expires_at: new Date(Date.now() + opts.ttlSec * 1000).toISOString(),
  });
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign GCS URL (${response.status}). Make sure you are running on Replit.`,
    );
  }
  const data = (await response.json()) as { signed_url?: string };
  if (!data.signed_url) throw new Error("Sidecar response missing signed_url");
  return data.signed_url;
}

// ─── Cloudflare R2 / S3 backend ───────────────────────────────────────────────

/**
 * S3 / R2 requires all user-metadata keys to be lowercase with no colons.
 * objectAcl.ts reads/writes the key "custom:aclPolicy" (GCS convention).
 * We store it as "aclpolicy" on R2 and re-expose both names on read so
 * objectAcl.ts requires zero changes.
 */
const R2_ACL_KEY = "aclpolicy";
const GCS_ACL_KEY = "custom:aclPolicy";

function sanitizeMetaKey(key: string): string {
  if (key === GCS_ACL_KEY) return R2_ACL_KEY;
  return key.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
}

function buildR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials not configured. " +
        "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.",
    );
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // forcePathStyle keeps URLs as /<bucket>/<key>, matching the existing
    // PRIVATE_OBJECT_DIR / PUBLIC_OBJECT_SEARCH_PATHS path conventions.
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
    // S3 lowercases all user-metadata keys.
    // Re-expose "aclpolicy" under the GCS alias so objectAcl.ts works unchanged.
    const raw = res.Metadata ?? {};
    const metadata: Record<string, string> = { ...raw };
    if (raw[R2_ACL_KEY] !== undefined) {
      metadata[GCS_ACL_KEY] = raw[R2_ACL_KEY];
    }
    return [{ contentType: res.ContentType, size: res.ContentLength, metadata }];
  }

  async setMetadata(options: { metadata: Record<string, string> }): Promise<void> {
    // S3/R2 has no in-place metadata update: copy-to-self with REPLACE directive.
    const [existing] = await this.getMetadata();

    // Sanitize incoming keys and merge with existing (new keys win).
    const merged: Record<string, string> = {};
    for (const [k, v] of Object.entries(existing.metadata ?? {})) {
      if (k === GCS_ACL_KEY) continue; // Skip the read-time alias; keep real keys only.
      merged[k] = v;
    }
    for (const [k, v] of Object.entries(options.metadata)) {
      merged[sanitizeMetaKey(k)] = v;
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

// ─── Public error class ───────────────────────────────────────────────────────

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// ─── ObjectStorageService ─────────────────────────────────────────────────────

export class ObjectStorageService {
  /** true → use Cloudflare R2;  false → use Replit GCS sidecar */
  private readonly useR2: boolean;
  private _r2Client: S3Client | null = null;

  constructor() {
    this.useR2 = !!process.env.R2_ACCOUNT_ID;
  }

  /** Lazily initialised so the missing-credentials error is deferred until
   *  an R2 call is actually made, not at module import time. */
  private get r2(): S3Client {
    if (!this._r2Client) this._r2Client = buildR2Client();
    return this._r2Client;
  }

  // ── env-var accessors ──────────────────────────────────────────────────────

  getPublicObjectSearchPaths(): string[] {
    const raw = process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "";
    const paths = Array.from(
      new Set(
        raw
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p.length > 0),
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

  // ── public API ─────────────────────────────────────────────────────────────

  async searchPublicObject(filePath: string): Promise<StorageFile | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);

      if (this.useR2) {
        const file = new R2StorageFile(this.r2, bucketName, objectName);
        const [exists] = await file.exists();
        if (exists) return file;
      } else {
        const gcsFile = gcsClient.bucket(bucketName).file(objectName);
        const [exists] = await gcsFile.exists();
        if (exists) return new GcsStorageFile(gcsFile);
      }
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
    if (metadata.size != null) {
      headers["Content-Length"] = String(metadata.size);
    }
    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    if (this.useR2) {
      return getSignedUrl(
        this.r2,
        new PutObjectCommand({ Bucket: bucketName, Key: objectName }),
        { expiresIn: 900 },
      );
    }
    return signGcsObjectURL({ bucketName, objectName, method: "PUT", ttlSec: 900 });
  }

  /**
   * Upload a binary buffer directly to object storage (server-side).
   * Returns the normalised /objects/uploads/<uuid> path that can be served
   * via GET /storage/objects/*.
   *
   * Use this instead of getObjectEntityUploadURL() when the upload originates
   * on the server (e.g. admin panel POST proxied through the API) so that the
   * client never needs a cross-origin presigned PUT — which would require R2
   * CORS configuration.
   */
  async putObjectEntity(body: Buffer, contentType: string): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    if (this.useR2) {
      await this.r2.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: objectName,
          Body: body,
          ContentType: contentType,
          ContentLength: body.length,
        }),
      );
    } else {
      // GCS: generate a short-lived presigned PUT URL and upload server-side.
      const signedUrl = await signGcsObjectURL({
        bucketName,
        objectName,
        method: "PUT",
        ttlSec: 900,
      });
      const putRes = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(body.length),
        },
        body: body,
        signal: AbortSignal.timeout(60_000),
      });
      if (!putRes.ok) {
        throw new Error(`GCS PUT failed (${putRes.status})`);
      }
    }

    return `/objects/uploads/${objectId}`;
  }

  async getObjectEntityFile(objectPath: string): Promise<StorageFile> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();

    const parts = objectPath.slice(1).split("/"); // ["objects", ...]
    if (parts.length < 2) throw new ObjectNotFoundError();

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) entityDir += "/";
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);

    if (this.useR2) {
      const file = new R2StorageFile(this.r2, bucketName, objectName);
      const [exists] = await file.exists();
      if (!exists) throw new ObjectNotFoundError();
      return file;
    }

    const gcsFile = gcsClient.bucket(bucketName).file(objectName);
    const [exists] = await gcsFile.exists();
    if (!exists) throw new ObjectNotFoundError();
    return new GcsStorageFile(gcsFile);
  }

  normalizeObjectEntityPath(rawPath: string): string {
    const accountId = process.env.R2_ACCOUNT_ID;
    const isGcs = rawPath.startsWith("https://storage.googleapis.com/");
    const isR2 = !!accountId &&
      rawPath.startsWith(`https://${accountId}.r2.cloudflarestorage.com/`);

    if (!isGcs && !isR2) return rawPath;

    const url = new URL(rawPath);
    // Both GCS and R2 (forcePathStyle) use /<bucket>/<key> pathnames —
    // identical to the PRIVATE_OBJECT_DIR format, so the logic is shared.
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) objectEntityDir += "/";

    if (!rawObjectPath.startsWith(objectEntityDir)) return rawObjectPath;

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
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
