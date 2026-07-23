import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import sharp from "sharp";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const ALLOWED_WIDTHS = new Set([400, 800, 1200, 1600, 2400]);

/**
 * GET /storage/img/:width/objects/*
 *
 * On-demand resize for stored images. Streams the original from object storage,
 * resizes to the requested width with sharp, and serves WebP. The CDN/browser caches it.
 */
router.get("/storage/img/:width/objects/*path", async (req: Request, res: Response) => {
  try {
    const width = Number(req.params.width);
    if (!ALLOWED_WIDTHS.has(width)) {
      res.status(400).json({ error: `Width must be one of: ${[...ALLOWED_WIDTHS].join(", ")}` });
      return;
    }

    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);
    if (!response.ok || !response.body) {
      res.status(response.status || 500).end();
      return;
    }

    const inputStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
    const transformer = sharp()
      .rotate() // honour EXIF orientation
      .resize({ width, withoutEnlargement: true, fit: "inside" })
      .webp({ quality: 88 });

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Image-Variant", `${width}w`);

    inputStream.pipe(transformer).pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Image transform failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "Image transform failed" });
    }
  }
});

/**
 * GET /storage/img-social/objects/*path
 *
 * Social-card crop for stored images: exact 1200x630 (the OG/Twitter
 * recommended size), center-cropped, served as JPEG for maximum crawler
 * compatibility. Used for posts whose editors set a custom uploaded OG image.
 */
router.get("/storage/img-social/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);
    if (!response.ok || !response.body) {
      res.status(response.status || 500).end();
      return;
    }

    const inputStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
    const transformer = sharp()
      .rotate()
      .resize({ width: 1200, height: 630, fit: "cover", position: "centre" })
      .jpeg({ quality: 88, mozjpeg: true });

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Image-Variant", "social-1200x630");

    inputStream.pipe(transformer).pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Social image transform failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "Social image transform failed" });
    }
  }
});

export default router;
