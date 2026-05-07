import { Router } from "express";
import { db, postsTable, categoriesTable } from "@workspace/db";
import { and, desc, eq, getTableColumns, ilike, or } from "drizzle-orm";

const router = Router();

/**
 * GET /search?q=...&limit=20
 *
 * Server-side search across published posts. Matches title, excerpt, content,
 * author, and category name (case-insensitive substring). Title matches rank
 * highest. The category text column on posts was dropped — we now filter and
 * read the name through the categories JOIN.
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
    .select({ ...getTableColumns(postsTable), category: categoriesTable.name })
    .from(postsTable)
    .innerJoin(categoriesTable, eq(postsTable.categoryId, categoriesTable.id))
    .where(
      and(
        eq(postsTable.status, "published"),
        or(
          ilike(postsTable.title, pattern),
          ilike(postsTable.excerpt, pattern),
          ilike(postsTable.content, pattern),
          ilike(postsTable.author, pattern),
          ilike(categoriesTable.name, pattern),
        ),
      ),
    )
    .orderBy(desc(postsTable.publishedAt))
    .limit(limit * 2);

  // Simple ranking: title match > excerpt match > author > category > content
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
