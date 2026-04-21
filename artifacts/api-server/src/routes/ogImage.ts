import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import sharp from "sharp";
import {
  db,
  postsTable,
  categoriesTable,
  seriesTable,
  usersTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
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
  if (lines.length === maxLines) {
    const totalRendered = lines.join(" ").length;
    if (totalRendered < text.length - 3) {
      lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
    }
  }
  return lines;
}

async function fetchCoverBuffer(coverUrl: string | null | undefined): Promise<Buffer | null> {
  if (!coverUrl) return null;
  try {
    if (coverUrl.startsWith("/api/storage")) {
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

interface OgRenderInput {
  /** Small all-caps label above the title (e.g. "AI & MACHINE LEARNING", "SERIES", "AUTHOR"). */
  kicker?: string | null;
  /** Big page title. */
  title: string;
  /** Optional subtitle below the title (description, byline, etc.). */
  subtitle?: string | null;
  /** Optional cover image. If absent, a dark brand background is used. */
  coverImage?: string | null;
  /** Optional override for the bottom-right URL line (defaults to MAPLETECHIE.COM). */
  footerUrl?: string;
}

/**
 * Renders a 1200x630 PNG share card with consistent Mapletechie branding:
 *   - "M" logo + "Mapletechies." wordmark in the top-left
 *   - optional kicker (orange, uppercase)
 *   - large white title
 *   - optional subtitle (muted)
 *   - mapletechie.com footer with orange accent bar
 *   - cover image (if provided) is darkened and used as the background
 */
async function renderOgImage(input: OgRenderInput): Promise<Buffer> {
  const titleLines = wrapText(input.title, 28, 4);
  const subtitleLines = input.subtitle
    ? wrapText(input.subtitle, 60, 2)
    : [];
  const kicker = (input.kicker || "").toUpperCase();
  const footerUrl = (input.footerUrl || "MAPLETECHIE.COM").toUpperCase();

  const titleLineHeight = 78;
  const subtitleLineHeight = 32;
  const titleBlockHeight = titleLines.length * titleLineHeight;
  const subtitleBlockHeight = subtitleLines.length * subtitleLineHeight;
  const totalBlockHeight = titleBlockHeight + (subtitleBlockHeight ? subtitleBlockHeight + 24 : 0);
  const footerY = HEIGHT - 50;
  const startY = footerY - 70 - totalBlockHeight;

  const titleSvg = titleLines
    .map(
      (line, i) =>
        `<text x="60" y="${startY + (i + 1) * titleLineHeight - 16}" font-family="Inter, system-ui, sans-serif" font-size="62" font-weight="900" fill="#ffffff">${escapeXml(line)}</text>`,
    )
    .join("\n  ");

  const subtitleStartY = startY + titleBlockHeight + 24;
  const subtitleSvg = subtitleLines
    .map(
      (line, i) =>
        `<text x="60" y="${subtitleStartY + (i + 1) * subtitleLineHeight - 8}" font-family="Inter, system-ui, sans-serif" font-size="26" font-weight="500" fill="#d4d4d8">${escapeXml(line)}</text>`,
    )
    .join("\n  ");

  const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0.45)"/>
      <stop offset="55%" stop-color="rgba(0,0,0,0.75)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.95)"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#shade)"/>
  <rect x="60" y="55" width="56" height="56" fill="#f97316"/>
  <text x="78" y="100" font-family="Georgia, serif" font-size="44" font-weight="700" fill="#0a0a0a">M</text>
  <text x="138" y="98" font-family="Georgia, serif" font-size="36" font-weight="600" fill="#ffffff">Maple<tspan fill="#f97316" font-style="italic">techies.</tspan></text>
  ${kicker ? `<text x="60" y="${startY - 24}" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="700" fill="#f97316" letter-spacing="3">${escapeXml(kicker)}</text>` : ""}
  ${titleSvg}
  ${subtitleSvg}
  <rect x="60" y="${footerY}" width="80" height="6" fill="#f97316"/>
  <text x="60" y="${footerY + 32}" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="700" fill="#a1a1aa" letter-spacing="2">${escapeXml(footerUrl)}</text>
</svg>`);

  const coverBuf = await fetchCoverBuffer(input.coverImage);

  let base: sharp.Sharp;
  if (coverBuf) {
    base = sharp(coverBuf).resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" });
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

  return base.composite([{ input: svg, top: 0, left: 0 }]).png({ compressionLevel: 8 }).toBuffer();
}

function sendPng(res: Response, buf: Buffer) {
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
  res.send(buf);
}

function sendError(req: Request, res: Response, err: unknown, label: string) {
  req.log.error({ err }, `OG image generation failed: ${label}`);
  if (!res.headersSent) res.status(500).end();
}

/** GET /api/og/site.png — homepage share card. */
router.get("/og/site.png", async (req, res) => {
  try {
    // Use the most recent featured post's cover (if any) as the homepage backdrop.
    const [featured] = await db
      .select()
      .from(postsTable)
      .where(and(eq(postsTable.isFeatured, true), eq(postsTable.status, "published")))
      .orderBy(desc(postsTable.publishedAt))
      .limit(1);

    const buf = await renderOgImage({
      kicker: "Independent Tech Publication",
      title: "Tech, told straight.",
      subtitle:
        "No press junkets. No hype cycles. Sharp opinion, real reviews, and the context the spec sheets leave out.",
      coverImage: featured?.coverImage ?? null,
    });
    sendPng(res, buf);
  } catch (err) {
    sendError(req, res, err, "site");
  }
});

/** GET /api/og/post/:slug.png — share card for a published post. */
router.get("/og/post/:slug.png", async (req, res) => {
  try {
    const slug = String(req.params.slug);
    const [post] = await db.select().from(postsTable).where(eq(postsTable.slug, slug));
    if (!post) {
      res.status(404).end();
      return;
    }
    const buf = await renderOgImage({
      kicker: post.category,
      title: post.title,
      subtitle: post.excerpt,
      coverImage: post.coverImage,
    });
    sendPng(res, buf);
  } catch (err) {
    sendError(req, res, err, "post");
  }
});

/** GET /api/og/category/:slug.png — share card for a category index page. */
router.get("/og/category/:slug.png", async (req, res) => {
  try {
    const slug = String(req.params.slug);
    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.slug, slug));
    if (!cat) {
      res.status(404).end();
      return;
    }
    // Pick the most recent post in this category for the backdrop.
    const [recent] = await db
      .select()
      .from(postsTable)
      .where(and(eq(postsTable.category, slug), eq(postsTable.status, "published")))
      .orderBy(desc(postsTable.publishedAt))
      .limit(1);

    const buf = await renderOgImage({
      kicker: "Category",
      title: cat.name,
      subtitle: cat.description,
      coverImage: recent?.coverImage ?? null,
    });
    sendPng(res, buf);
  } catch (err) {
    sendError(req, res, err, "category");
  }
});

/** GET /api/og/series/:slug.png — share card for a series. */
router.get("/og/series/:slug.png", async (req, res) => {
  try {
    const slug = String(req.params.slug);
    const [s] = await db.select().from(seriesTable).where(eq(seriesTable.slug, slug));
    if (!s) {
      res.status(404).end();
      return;
    }
    let cover: string | null = s.coverImage;
    if (!cover) {
      const [first] = await db
        .select()
        .from(postsTable)
        .where(and(eq(postsTable.seriesId, s.id), eq(postsTable.status, "published")))
        .orderBy(desc(postsTable.publishedAt))
        .limit(1);
      cover = first?.coverImage ?? null;
    }
    const buf = await renderOgImage({
      kicker: "Series",
      title: s.title,
      subtitle: s.description,
      coverImage: cover,
    });
    sendPng(res, buf);
  } catch (err) {
    sendError(req, res, err, "series");
  }
});

/** GET /api/og/author/:username.png — share card for an author archive. */
router.get("/og/author/:username.png", async (req, res) => {
  try {
    const username = String(req.params.username);
    const [u] = await db.select().from(usersTable).where(eq(usersTable.username, username));
    if (!u) {
      res.status(404).end();
      return;
    }
    const buf = await renderOgImage({
      kicker: "Author",
      title: u.displayName,
      subtitle: u.bio,
      coverImage: u.avatarUrl,
    });
    sendPng(res, buf);
  } catch (err) {
    sendError(req, res, err, "author");
  }
});

/** GET /api/og/tag/:tag.png — share card for a tag archive. */
router.get("/og/tag/:tag.png", async (req, res) => {
  try {
    const tag = String(req.params.tag);
    const buf = await renderOgImage({
      kicker: "Tag",
      title: `#${tag}`,
      subtitle: `Stories on Mapletechie tagged "${tag}".`,
    });
    sendPng(res, buf);
  } catch (err) {
    sendError(req, res, err, "tag");
  }
});

/** GET /api/og/page.png?title=...&subtitle=...&kicker=... — generic share card. */
router.get("/og/page.png", async (req, res) => {
  try {
    const title = String(req.query.title || "Mapletechie").slice(0, 200);
    const subtitle = req.query.subtitle ? String(req.query.subtitle).slice(0, 280) : null;
    const kicker = req.query.kicker ? String(req.query.kicker).slice(0, 60) : null;
    const buf = await renderOgImage({ kicker, title, subtitle });
    sendPng(res, buf);
  } catch (err) {
    sendError(req, res, err, "page");
  }
});

export default router;
