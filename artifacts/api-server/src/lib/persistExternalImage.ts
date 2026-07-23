import sharp from "sharp";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { db, mediaTable } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

/** Who triggered the re-host, for Media-library attribution. */
export interface PersistContext {
  uploaderId?: number | null;
  uploaderName?: string | null;
}

const objectStorageService = new ObjectStorageService();

const MAX_BYTES = 25 * 1024 * 1024; // refuse absurdly large remote files
const FETCH_TIMEOUT_MS = 15_000;
const MAX_WIDTH = 1600;

/**
 * SSRF guard: returns true if `ip` falls inside a private, loopback,
 * link-local, or otherwise non-public range that an external image URL must
 * never be allowed to reach.
 */
function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
    const [a, b] = p;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // "this" network
    if (a === 169 && b === 254) return true; // link-local 169.254/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const lc = ip.toLowerCase();
    if (lc === "::1" || lc === "::") return true; // loopback / unspecified
    if (lc.startsWith("fe80")) return true; // link-local
    if (lc.startsWith("fc") || lc.startsWith("fd")) return true; // unique-local fc00::/7
    // IPv4-mapped (::ffff:a.b.c.d)
    const mapped = lc.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true; // unparseable -> treat as unsafe
}

/**
 * Resolve `hostname` and confirm every resolved address is publicly routable.
 * Mitigates SSRF where an admin-supplied URL points at internal infrastructure.
 */
async function isSafeRemoteHost(hostname: string): Promise<boolean> {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local")) {
    return false;
  }
  // If the host is already an IP literal, check it directly.
  if (isIP(hostname)) return !isPrivateAddress(hostname);
  try {
    const records = await lookup(hostname, { all: true });
    if (records.length === 0) return false;
    return records.every((r) => !isPrivateAddress(r.address));
  } catch {
    return false;
  }
}

/**
 * Returns true when `cover` is an external image URL we should pull onto our
 * own object storage. Local paths ("/covers/..."), already-persisted storage
 * paths ("/api/storage/..."), and URLs on our own domain are left untouched.
 */
export function isExternalImageUrl(cover: unknown): cover is string {
  if (typeof cover !== "string") return false;
  const trimmed = cover.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  let host: string;
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return false;
  }
  // Our own production domain is fine — it already routes through our proxy.
  if (host === "mapletechie.com" || host.endsWith(".mapletechie.com")) {
    return false;
  }
  return true;
}

/**
 * Download an external image, re-encode it to WebP, store it on our object
 * storage, and return the local serving path (e.g. "/api/storage/objects/...").
 *
 * Best-effort: if anything fails (storage not configured, network error,
 * non-image response, ...), the original URL is returned and a warning is
 * logged. Post creation/update must never be blocked by this.
 */
/**
 * Rewrite sanitized article HTML so every <img src="..."> pointing at an
 * external host is downloaded, re-encoded, and served from our own storage.
 * Local/relative paths, our own domain, and already-persisted storage URLs are
 * untouched. Best-effort per image: any failure keeps the original URL, and
 * duplicate URLs are only fetched once. Never throws.
 */
export async function persistExternalImagesInHtml(
  html: string,
  ctx?: PersistContext,
): Promise<string> {
  if (!html || !html.includes("<img")) return html;
  try {
    const srcRe = /(<img\b[^>]*\bsrc=")([^"]+)(")/gi;
    const externals = new Set<string>();
    for (const m of html.matchAll(srcRe)) {
      const src = m[2].replace(/&amp;/g, "&");
      if (isExternalImageUrl(src)) externals.add(src);
    }
    if (externals.size === 0) return html;

    const replacements = new Map<string, string>();
    for (const url of externals) {
      const persisted = await persistExternalImage(url, ctx);
      if (persisted !== url) replacements.set(url, persisted);
    }
    if (replacements.size === 0) return html;

    return html.replace(srcRe, (full, pre: string, src: string, post: string) => {
      const decoded = src.replace(/&amp;/g, "&");
      const persisted = replacements.get(decoded);
      return persisted ? `${pre}${persisted}${post}` : full;
    });
  } catch (err) {
    logger.warn({ err }, "persistExternalImagesInHtml: failed, keeping original HTML");
    return html;
  }
}

/**
 * Derive a readable Media-library filename from the source URL's basename,
 * normalized to the .webp extension we re-encode to.
 */
function mediaFilenameFromUrl(url: string): string {
  let base = "";
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    base = decodeURIComponent(segments[segments.length - 1] ?? "");
  } catch {
    /* fall through to default */
  }
  base = base
    .replace(/\.[a-z0-9]{2,5}$/i, "") // drop original extension
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return `${base || "external-image"}.webp`;
}

/**
 * Best-effort: register a freshly re-hosted image in the Media library so
 * editors can see, reuse, and manage the copy. Skips silently if a row for
 * the same serving URL already exists (dedupes re-saves of the same post).
 */
async function registerInMediaLibrary(
  servingPath: string,
  sourceUrl: string,
  bytes: number,
  ctx?: PersistContext,
): Promise<void> {
  try {
    // media.url is UNIQUE — onConflictDoNothing makes dedupe race-safe.
    await db.insert(mediaTable).values({
      url: servingPath,
      filename: mediaFilenameFromUrl(sourceUrl),
      mimeType: "image/webp",
      size: bytes,
      source: sourceUrl.slice(0, 2000),
      uploaderId: ctx?.uploaderId ?? null,
      uploaderName: ctx?.uploaderName ?? null,
    }).onConflictDoNothing({ target: mediaTable.url });
  } catch (err) {
    logger.warn({ err, servingPath }, "persistExternalImage: media-library registration failed");
  }
}

export async function persistExternalImage(url: string, ctx?: PersistContext): Promise<string> {
  try {
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      logger.warn({ url }, "persistExternalImage: invalid URL");
      return url;
    }
    if (!(await isSafeRemoteHost(hostname))) {
      logger.warn({ url, hostname }, "persistExternalImage: blocked non-public host (SSRF guard)");
      return url;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        // Some hosts (e.g. Wikimedia) reject requests without a UA.
        headers: { "User-Agent": "MapletechieBot/1.0 (+https://mapletechie.com)" },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) {
      logger.warn({ url, status: resp.status }, "persistExternalImage: fetch failed");
      return url;
    }
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      logger.warn({ url, contentType }, "persistExternalImage: not an image response");
      return url;
    }
    const arrayBuf = await resp.arrayBuffer();
    if (arrayBuf.byteLength > MAX_BYTES) {
      logger.warn({ url, bytes: arrayBuf.byteLength }, "persistExternalImage: image too large");
      return url;
    }

    const webp = await sharp(Buffer.from(arrayBuf))
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const putResp = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": "image/webp" },
      body: webp,
    });
    if (!putResp.ok) {
      logger.warn({ url, status: putResp.status }, "persistExternalImage: upload PUT failed");
      return url;
    }

    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    logger.info({ url, objectPath }, "persistExternalImage: stored external cover locally");
    const servingPath = `/api/storage${objectPath}`;
    await registerInMediaLibrary(servingPath, url, webp.byteLength, ctx);
    return servingPath;
  } catch (err) {
    logger.warn({ err, url }, "persistExternalImage: failed, keeping original URL");
    return url;
  }
}
