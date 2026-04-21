import { Router } from "express";
import { db, postsTable } from "@workspace/db";
import { and, desc, eq, ilike, or } from "drizzle-orm";

const router = Router();

/**
 * GET /search?q=...&limit=20
 *
 * Server-side search across published posts. Matches title, excerpt, and content
 * (case-insensitive substring). Title matches are ranked highest.
 */
router.get("/search", async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(Number(req.query.limit ?? 20) || 20, 50);

  if (q.length < 2) {
    res.json([]);
    return;
  }

  const pattern = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .select()
    .from(postsTable)
    .where(
      and(
        eq(postsTable.status, "published"),
        or(
          ilike(postsTable.title, pattern),
          ilike(postsTable.excerpt, pattern),
          ilike(postsTable.content, pattern),
          ilike(postsTable.author, pattern),
          ilike(postsTable.category, pattern),
        ),
      ),
    )
    .orderBy(desc(postsTable.publishedAt))
    .limit(limit * 2); // pull a few extras so we can re-rank

  // Simple ranking: title match > excerpt match > content match
  const ql = q.toLowerCase();
  const scored = rows.map((p) => {
    let score = 0;
    if (p.title.toLowerCase().includes(ql)) score += 10;
    if ((p.excerpt || "").toLowerCase().includes(ql)) score += 4;
    if ((p.author || "").toLowerCase().includes(ql)) score += 3;
    if ((p.category || "").toLowerCase().includes(ql)) score += 2;
    if ((p.content || "").toLowerCase().includes(ql)) score += 1;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);

  res.json(scored.slice(0, limit).map(({ p }) => p));
});

export default router;
