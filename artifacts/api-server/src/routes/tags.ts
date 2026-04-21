import { Router } from "express";
import { db, postsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";

const router = Router();

/**
 * GET /tags
 *
 * Returns every distinct tag across published posts with usage counts.
 */
router.get("/tags", async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT lower(tag) AS tag, COUNT(*)::int AS count
    FROM ${postsTable}, unnest(${postsTable.tags}) AS tag
    WHERE ${postsTable.status} = 'published'
    GROUP BY lower(tag)
    ORDER BY count DESC, tag ASC
    LIMIT 200
  `);
  res.json(rows.rows ?? rows);
});

/**
 * GET /tags/:tag/posts
 *
 * Published posts that contain the given tag (case-insensitive match).
 */
router.get("/tags/:tag/posts", async (req, res): Promise<void> => {
  const tag = String(req.params.tag).toLowerCase();
  const posts = await db
    .select()
    .from(postsTable)
    .where(
      and(
        eq(postsTable.status, "published"),
        sql`EXISTS (SELECT 1 FROM unnest(${postsTable.tags}) AS t WHERE lower(t) = ${tag})`,
      ),
    )
    .orderBy(desc(postsTable.publishedAt));
  res.json(posts);
});

export default router;
