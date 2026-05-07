import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, postsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Tech-blog `public/` directory on disk. The api-server bundle ends up at
 * `artifacts/api-server/dist/index.mjs`, so walking up two levels lands at
 * `artifacts/`, and from there the sibling tech-blog artifact's static files
 * live under `tech-blog/public`.
 *
 * Resolved relative to this module so it works whether the server is started
 * from the workspace root (production) or the api-server dir (dev).
 */
const TECH_BLOG_PUBLIC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "tech-blog",
  "public",
);

/**
 * Returns true when `cover` is a local path (starts with `/`) and the file
 * does NOT exist under tech-blog/public. Returns false for absolute http(s)
 * URLs, blank values, or paths that resolve to a real file.
 */
export function isMissingLocalCoverImage(cover: unknown): boolean {
  if (typeof cover !== "string") return false;
  const trimmed = cover.trim();
  if (!trimmed) return false;
  if (!trimmed.startsWith("/")) return false;
  // Strip query string / hash before checking the filesystem.
  const cleanPath = trimmed.split(/[?#]/, 1)[0];
  // Decode %20 etc. and prevent path traversal.
  let decoded: string;
  try {
    decoded = decodeURIComponent(cleanPath);
  } catch {
    return true;
  }
  const normalized = path
    .normalize(decoded)
    .replace(/^[/\\]+/, "");
  const resolved = path.resolve(TECH_BLOG_PUBLIC_DIR, normalized);
  const rel = path.relative(TECH_BLOG_PUBLIC_DIR, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    // Path traversal attempt — treat as missing/invalid.
    return true;
  }
  try {
    return !statSync(resolved).isFile();
  } catch {
    return !existsSync(resolved);
  }
}

/**
 * Validate the incoming cover image before writing it to the DB. Returns an
 * error message when the value is a local path that doesn't resolve, or null
 * when it's safe to save. Remote URLs are always allowed (they may be a CDN
 * we can't reach from this process).
 */
export function validateCoverImage(cover: unknown): string | null {
  if (isMissingLocalCoverImage(cover)) {
    return `Cover image not found: "${String(cover).trim()}". Upload the file or pick a different image.`;
  }
  return null;
}

/**
 * Boot-time sweep: log a warning for every post whose cover_image points at
 * a local path that no longer exists. Logged once per startup so editors and
 * platform operators can spot regressions without poking the DB by hand.
 */
export async function auditPostCoverImages(): Promise<void> {
  try {
    const rows = await db
      .select({
        id: postsTable.id,
        slug: postsTable.slug,
        title: postsTable.title,
        coverImage: postsTable.coverImage,
        status: postsTable.status,
      })
      .from(postsTable);
    const broken = rows.filter((r) => isMissingLocalCoverImage(r.coverImage));
    if (broken.length === 0) {
      logger.info(
        { checked: rows.length, publicDir: TECH_BLOG_PUBLIC_DIR },
        "Cover image audit: all local paths resolve",
      );
      return;
    }
    for (const row of broken) {
      logger.warn(
        {
          postId: row.id,
          slug: row.slug,
          status: row.status,
          coverImage: row.coverImage,
        },
        `Cover image missing on disk for post "${row.title}"`,
      );
    }
    logger.warn(
      { brokenCount: broken.length, checked: rows.length },
      "Cover image audit found posts with missing local cover files",
    );
  } catch (err) {
    logger.error({ err }, "Cover image audit failed");
  }
}
