import { getSiteUrl } from "../lib/siteUrl";

/**
 * IndexNow admin routes.
 *
 * POST /api/admin/indexnow/backfill
 *   Admin-only one-time backfill: submits every published article URL (plus
 *   ALL of its category pages, not just the primary) to the IndexNow API so
 *   Bing re-evaluates them all without waiting for its own crawl cycle.
 *   Safe to call multiple times. Submissions are sent in 10,000-URL batches;
 *   the response reports how many URLs were actually dispatched.
 */

import { Router } from "express";
import { db, postsTable, categoriesTable, postCategoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { adminAuth, requireRole } from "../middlewares/adminAuth";
import { submitToIndexNow, isIndexNowConfigured } from "../lib/indexNow";

const router = Router();

const SITE_DOMAIN = getSiteUrl();

router.post(
  "/admin/indexnow/backfill",
  adminAuth,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    // Fail fast with a clear message rather than silently returning a zero count.
    if (!isIndexNowConfigured()) {
      res.status(422).json({
        error: "IndexNow is not configured — set the INDEXNOW_KEY environment variable.",
        configured: false,
      });
      return;
    }

    // Fetch all published posts.
    const posts = await db
      .select({ id: postsTable.id, slug: postsTable.slug })
      .from(postsTable)
      .where(eq(postsTable.status, "published"));

    // Fetch ALL category memberships (primary + secondary) for published posts.
    // Querying the join table directly avoids the primary-only constraint of the
    // posts.category_id mirror and ensures every category page is pinged.
    const memberships = await db
      .select({ categorySlug: categoriesTable.slug })
      .from(postCategoriesTable)
      .innerJoin(categoriesTable, eq(postCategoriesTable.categoryId, categoriesTable.id))
      .innerJoin(postsTable, eq(postCategoriesTable.postId, postsTable.id))
      .where(eq(postsTable.status, "published"));

    // Build the deduplicated URL set.
    const urlSet = new Set<string>();
    for (const post of posts) {
      urlSet.add(`${SITE_DOMAIN}/blog/${post.slug}`);
    }
    for (const m of memberships) {
      if (m.categorySlug) urlSet.add(`${SITE_DOMAIN}/category/${m.categorySlug}`);
    }
    // Include top-level index pages so Bing re-crawls the full site graph.
    urlSet.add(`${SITE_DOMAIN}/`);
    urlSet.add(`${SITE_DOMAIN}/blog`);

    const urlList = [...urlSet];
    const submitted = await submitToIndexNow(urlList);

    res.json({
      submitted,
      attempted: urlList.length,
      postCount: posts.length,
      configured: true,
    });
  },
);

export default router;
