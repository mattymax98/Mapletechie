import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import sharp from "sharp";
import { db, postsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const WIDTH = 1200;
const HEIGHT = 630;

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharsPerLine) {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  // Add ellipsis if we ran out of room mid-title
  if (lines.length === maxLines) {
    const totalRendered = lines.join(" ").length;
    if (totalRendered < text.length - 3) {
      lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
    }
  }
  return lines;
}

async function fetchCoverBuffer(coverUrl: string | null): Promise<Buffer | null> {
  if (!coverUrl) return null;
  try {
    if (coverUrl.startsWith("/api/storage")) {
      // Internal — pull straight from object storage
      const objectPath = coverUrl.replace(/^\/api\/storage/, "");
      if (!objectPath.startsWith("/objects/")) return null;
      const file = await objectStorage.getObjectEntityFile(objectPath);
      const resp = await objectStorage.downloadObject(file);
      if (!resp.ok || !resp.body) return null;
      const chunks: Buffer[] = [];
      const stream = Readable.fromWeb(resp.body as ReadableStream<Uint8Array>);
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    }
    if (/^https?:\/\//i.test(coverUrl)) {
      const r = await fetch(coverUrl);
      if (!r.ok) return null;
      return Buffer.from(await r.arrayBuffer());
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /og/post/:slug.png
 *
 * Generates a 1200x630 social share card for a published post, composing the
 * cover image (darkened) with the post title and Mapletechie branding.
 */
router.get("/og/post/:slug.png", async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    const [post] = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.slug, slug));
    if (!post) {
      res.status(404).end();
      return;
    }

    const titleLines = wrapText(post.title, 28, 4);
    const category = (post.category || "").toUpperCase();

    // SVG overlay (text + brand bar). Composited on top of cover image or plain bg.
    const lineHeight = 80;
    const textBlockHeight = titleLines.length * lineHeight;
    const startY = HEIGHT - textBlockHeight - 110;
    const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0.2)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.85)"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#shade)"/>
  <rect x="60" y="55" width="56" height="56" fill="#f97316"/>
  <text x="78" y="100" font-family="Georgia, serif" font-size="44" font-weight="700" fill="#0a0a0a">M</text>
  <text x="138" y="98" font-family="Georgia, serif" font-size="36" font-weight="600" fill="#ffffff">Maple<tspan fill="#f97316" font-style="italic">techies.</tspan></text>
  ${category ? `<text x="60" y="${startY - 24}" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="700" fill="#f97316" letter-spacing="3">${escapeXml(category)}</text>` : ""}
  ${titleLines
    .map(
      (line, i) =>
        `<text x="60" y="${startY + (i + 1) * lineHeight - 16}" font-family="Inter, system-ui, sans-serif" font-size="64" font-weight="900" fill="#ffffff">${escapeXml(line)}</text>`,
    )
    .join("\n  ")}
  <rect x="60" y="${HEIGHT - 50}" width="80" height="6" fill="#f97316"/>
  <text x="60" y="${HEIGHT - 18}" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="700" fill="#a1a1aa" letter-spacing="2">MAPLETECHIE.COM</text>
</svg>`);

    const coverBuf = await fetchCoverBuffer(post.coverImage);

    let base: sharp.Sharp;
    if (coverBuf) {
      base = sharp(coverBuf)
        .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" });
    } else {
      base = sharp({
        create: {
          width: WIDTH,
          height: HEIGHT,
          channels: 3,
          background: { r: 9, g: 9, b: 11 },
        },
      });
    }

    const out = await base
      .composite([{ input: svg, top: 0, left: 0 }])
      .png({ compressionLevel: 8 })
      .toBuffer();

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    res.send(out);
  } catch (error) {
    req.log.error({ err: error }, "OG image generation failed");
    if (!res.headersSent) res.status(500).end();
  }
});

export default router;
