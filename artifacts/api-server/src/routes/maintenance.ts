import { Router } from "express";
import { db, postsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { adminAuth, requireRole } from "../middlewares/adminAuth";
import { writeAuditLog } from "../lib/audit";
import { isExternalImageUrl, persistExternalImagesInHtml } from "../lib/persistExternalImage";
import { logger } from "../lib/logger";

const router = Router();

/** Extract the set of external <img> src URLs in an HTML string. */
export function externalImageSrcs(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
    const src = m[1].replace(/&amp;/g, "&");
    if (isExternalImageUrl(src)) out.add(src);
  }
  return out;
}

// Prevent concurrent runs — the backfill downloads and re-encodes images, so
// a double-click on the trigger must not start two overlapping sweeps. A
// Postgres advisory lock makes this safe even across multiple API instances.
const REHOST_LOCK_KEY = 0x7265686f; // arbitrary constant ("reho")

async function tryAcquireRehostLock(): Promise<boolean> {
  const result = await db.execute(
    sql`select pg_try_advisory_lock(${REHOST_LOCK_KEY}) as locked`,
  );
  return (result.rows?.[0] as { locked?: boolean } | undefined)?.locked === true;
}

async function releaseRehostLock(): Promise<void> {
  await db.execute(sql`select pg_advisory_unlock(${REHOST_LOCK_KEY})`);
}

/**
 * One-time backfill: re-host externally-hosted body images in ALL existing
 * posts (any status) onto our own object storage. New/edited posts already
 * get this treatment on save; this closes the gap for the back catalog.
 *
 * Best-effort per image (failures keep the original URL and are reported).
 * Posts whose content doesn't change are not written at all — no updatedAt
 * churn, no audit noise.
 */
router.post(
  "/admin/maintenance/rehost-images",
  adminAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    if (!(await tryAcquireRehostLock())) {
      res.status(409).json({ error: "A re-hosting run is already in progress." });
      return;
    }
    try {
      const user = req.user;
      const persistCtx = {
        uploaderId: user?.id ?? null,
        uploaderName: user?.displayName ?? null,
      };

      // Every post, any status — persistExternalImagesInHtml is a cheap no-op
      // for content without images, and the catalog is small.
      const candidates = await db
        .select({ id: postsTable.id, title: postsTable.title, content: postsTable.content })
        .from(postsTable);

      let postsScanned = 0;
      let postsUpdated = 0;
      let imagesRehosted = 0;
      const stillExternal = new Set<string>();
      const updatedPosts: Array<{ id: number; title: string; images: number }> = [];

      for (const post of candidates) {
        postsScanned += 1;
        const before = externalImageSrcs(post.content);
        if (before.size === 0) continue;

        const newContent = await persistExternalImagesInHtml(post.content, persistCtx);
        const after = externalImageSrcs(newContent);
        for (const url of after) stillExternal.add(url);

        if (newContent === post.content) continue;

        const rehosted = before.size - after.size;
        imagesRehosted += rehosted;
        postsUpdated += 1;
        updatedPosts.push({ id: post.id, title: post.title, images: rehosted });
        await db.update(postsTable).set({ content: newContent }).where(eq(postsTable.id, post.id));
      }

      // One audit entry per run — including no-op runs, so every trigger of
      // this maintenance sweep is traceable.
      await writeAuditLog(req, {
        action: "maintenance.rehost_images",
        entityType: "post",
        entityId: null,
        summary:
          postsUpdated > 0
            ? `Re-hosted ${imagesRehosted} external body image(s) across ${postsUpdated} post(s)`
            : `Image re-hosting sweep ran — nothing to re-host (${postsScanned} post(s) scanned)`,
        details: { updatedPosts, failedUrls: Array.from(stillExternal) },
      });

      logger.info(
        { postsScanned, postsUpdated, imagesRehosted, failed: stillExternal.size },
        "maintenance: rehost-images run finished",
      );
      res.json({
        postsScanned,
        postsUpdated,
        imagesRehosted,
        failedUrls: Array.from(stillExternal),
      });
    } finally {
      await releaseRehostLock().catch((err) =>
        logger.warn({ err }, "maintenance: failed to release rehost advisory lock"),
      );
    }
  },
);

export default router;
