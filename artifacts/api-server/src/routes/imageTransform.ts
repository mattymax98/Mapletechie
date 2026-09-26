import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import sharp from "sharp";
import { isSupportedMaster, MAX_IMAGE_PIXELS } from "../lib/imageLimits";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const ALLOWED_WIDTHS = new Set([400, 800, 1200, 1600, 2400]);
const EXACT_ASPECTS = {
  "16-9": [16, 9],
  "4-3": [4, 3],
  "1-1": [1, 1],
} as const;

export interface ExactCrop {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Return the largest centered crop that has the exact requested ratio without
 * exceeding either the source dimensions or a 2400px long edge. Null means
 * the source is too small to produce even one exact-ratio pixel unit.
 */
export function exactAspectCrop(
  width: number,
  height: number,
  aspect: readonly [number, number],
): ExactCrop | null {
  const [ratioWidth, ratioHeight] = aspect;
  const units = Math.floor(Math.min(width / ratioWidth, height / ratioHeight, 2400 / ratioWidth));
  if (units < 1) return null;
  const cropWidth = ratioWidth * units;
  const cropHeight = ratioHeight * units;
  return {
    left: Math.floor((width - cropWidth) / 2),
    top: Math.floor((height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
}

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
    const transformer = sharp({ limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate() // honour EXIF orientation
      .resize({ width, withoutEnlargement: true, fit: "inside" })
      // quality 92 + smartSubsample keeps fine detail/text edges crisp; the
      // size increase vs q88 is modest and variants are immutable-cached.
      .webp({ quality: 92, smartSubsample: true });

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
 * GET /storage/img-ratio/:ratio/objects/*
 *
 * Produce exact-ratio image variants from the retained original. The crop is
 * centered and keeps the largest exact-ratio pixel window up to 2400px; small
 * sources return 422 rather than being enlarged.
 */
router.get("/storage/img-ratio/:ratio/objects/*path", async (req: Request, res: Response) => {
  try {
    const aspect = EXACT_ASPECTS[req.params.ratio as keyof typeof EXACT_ASPECTS];
    if (!aspect) {
      res.status(400).json({ error: "Ratio must be one of: 16-9, 4-3, 1-1" });
      return;
    }
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectFile = await objectStorageService.getObjectEntityFile(`/objects/${wildcardPath}`);
    const response = await objectStorageService.downloadObject(objectFile);
    if (!response.ok || !response.body) {
      res.status(response.status || 500).end();
      return;
    }

    const source = Buffer.from(await response.arrayBuffer());
    if (source.byteLength > 25 * 1024 * 1024) {
      res.status(413).json({ error: "Image master is too large to transform" });
      return;
    }
    const sourceMetadata = await sharp(source, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
    if (!isSupportedMaster(sourceMetadata.width, sourceMetadata.height)) {
      res.status(422).json({ error: "Image master dimensions exceed the safe transform limit" });
      return;
    }
    // Normalize EXIF orientation before calculating pixel crop coordinates.
    const oriented = await sharp(source, { limitInputPixels: MAX_IMAGE_PIXELS }).rotate().toBuffer();
    const metadata = await sharp(oriented).metadata();
    if (!metadata.width || !metadata.height) {
      res.status(422).json({ error: "Image dimensions are unavailable" });
      return;
    }
    const crop = exactAspectCrop(metadata.width, metadata.height, aspect);
    if (!crop) {
      res.status(422).json({ error: "Source image is too small for this exact-ratio variant" });
      return;
    }

    const output = await sharp(oriented).extract(crop).webp({ quality: 92, smartSubsample: true }).toBuffer();
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Image-Variant", `${req.params.ratio}`);
    res.send(output);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Exact-ratio image transform failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "Exact-ratio image transform failed" });
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
    const transformer = sharp({ limitInputPixels: MAX_IMAGE_PIXELS })
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
