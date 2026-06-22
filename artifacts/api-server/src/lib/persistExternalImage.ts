import sharp from "sharp";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

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
export async function persistExternalImage(url: string): Promise<string> {
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
      resp = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
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
    return `/api/storage${objectPath}`;
  } catch (err) {
    logger.warn({ err, url }, "persistExternalImage: failed, keeping original URL");
    return url;
  }
}
