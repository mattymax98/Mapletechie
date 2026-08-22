import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { adminAuth } from "../middlewares/adminAuth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function isObjectMissing(error: unknown): boolean {
  if (error instanceof ObjectNotFoundError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.code === "NotFound" ||
    candidate.code === "NoSuchKey"
  );
}

function sendMissingObject(res: Response, message: string): void {
  // Missing uploaded objects must not become a cached 5xx when a post still
  // references an old/deleted image. No-store lets a restored object recover
  // immediately and prevents CDN error caching from masking that recovery.
  res.setHeader("Cache-Control", "no-store");
  res.status(404).json({ error: message });
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload (server-side callers only).
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 *
 * NOTE: This endpoint is intended for server-side callers (AI generation,
 * external image persistence) that PUT from a server context. Browser-based
 * admin panel uploads must use POST /storage/uploads instead, because direct
 * browser PUT to the presigned R2 URL requires CORS configuration that is
 * not available with the current S3 API credentials.
 */
router.post("/storage/uploads/request-url", adminAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

const ACCEPTED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * POST /storage/uploads
 *
 * Server-side upload: the client sends the raw image bytes in the request body.
 * The API server writes them directly to R2/GCS and returns the serving URL.
 *
 * This replaces the old presigned-URL flow (/storage/uploads/request-url +
 * browser PUT) for admin panel uploads. The browser-direct-to-R2 approach
 * requires CORS configuration on the R2 bucket, which the S3 API key cannot
 * set. By proxying through the API server we avoid CORS entirely.
 *
 * Auth: requires a valid admin session token (Bearer).
 * Body: raw image bytes; Content-Type must be image/jpeg, image/png, image/webp,
 *       or image/gif. Max 25 MB.
 */
router.post(
  "/storage/uploads",
  adminAuth,
  express.raw({ limit: "25mb", type: ACCEPTED_UPLOAD_TYPES }),
  async (req: Request, res: Response) => {
    const contentType = (req.headers["content-type"] ?? "").split(";")[0].trim();
    if (!ACCEPTED_UPLOAD_TYPES.includes(contentType)) {
      res.status(400).json({
        error: `Unsupported content type. Accepted: ${ACCEPTED_UPLOAD_TYPES.join(", ")}`,
      });
      return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Request body is empty or not binary data" });
      return;
    }

    try {
      const objectPath = await objectStorageService.putObjectEntity(req.body, contentType);
      const url = `/api/storage${objectPath}`;
      res.json({ url, objectPath });
    } catch (error) {
      req.log.error({ err: error }, "Error uploading object");
      res.status(500).json({ error: "Upload failed" });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      sendMissingObject(res, "File not found");
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (isObjectMissing(error)) {
      sendMissingObject(res, "File not found");
      return;
    }
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // --- Protected route example (uncomment when using replit-auth) ---
    // if (!req.isAuthenticated()) {
    //   res.status(401).json({ error: "Unauthorized" });
    //   return;
    // }
    // const canAccess = await objectStorageService.canAccessObjectEntity({
    //   userId: req.user.id,
    //   objectFile,
    //   requestedPermission: ObjectPermission.READ,
    // });
    // if (!canAccess) {
    //   res.status(403).json({ error: "Forbidden" });
    //   return;
    // }

    // Uploaded objects are immutable (UUID filenames), so persisted post
    // covers can be cached for a week rather than the default 1 hour.
    const ONE_WEEK = 60 * 60 * 24 * 7;
    const response = await objectStorageService.downloadObject(objectFile, ONE_WEEK);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (isObjectMissing(error)) {
      req.log.warn({ err: error }, "Object not found");
      sendMissingObject(res, "Object not found");
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
