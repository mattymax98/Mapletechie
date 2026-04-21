import { Router } from "express";
import { db, postsTable, seriesTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { adminAuth } from "../middlewares/adminAuth";
import { writeAuditLog } from "../lib/audit";

const router = Router();

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/** Public: list all series. */
router.get("/series", async (_req, res): Promise<void> => {
  const all = await db.select().from(seriesTable).orderBy(asc(seriesTable.title));
  res.json(all);
});

/** Public: a single series + its ordered, published posts. */
router.get("/series/:slug", async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  const [s] = await db.select().from(seriesTable).where(eq(seriesTable.slug, slug));
  if (!s) {
    res.status(404).json({ error: "Series not found" });
    return;
  }
  const posts = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.seriesId, s.id), eq(postsTable.status, "published")))
    .orderBy(asc(postsTable.seriesPosition), asc(postsTable.publishedAt));
  res.json({ series: s, posts });
});

/** Admin: create a series. */
router.post("/admin/series", adminAuth, async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const baseSlug = typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : slugify(title);
  if (!baseSlug) {
    res.status(400).json({
      error: "Could not derive a URL slug from this title. Please use letters or numbers, or pass an explicit `slug`.",
    });
    return;
  }
  // Ensure uniqueness
  let slug = baseSlug;
  let suffix = 2;
  while ((await db.select().from(seriesTable).where(eq(seriesTable.slug, slug))).length > 0) {
    slug = `${baseSlug}-${suffix++}`;
  }
  const [created] = await db
    .insert(seriesTable)
    .values({
      slug,
      title,
      description: typeof body.description === "string" ? body.description : null,
      coverImage: typeof body.coverImage === "string" ? body.coverImage : null,
    })
    .returning();
  await writeAuditLog(req, {
    action: "series.create",
    entityType: "series",
    entityId: created.id,
    summary: `Created series "${created.title}"`,
  });
  res.status(201).json(created);
});

/** Admin: update a series. */
router.put("/admin/series/:id", adminAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = req.body ?? {};
  const update: Partial<typeof seriesTable.$inferInsert> = {};
  if (typeof body.title === "string") update.title = body.title.trim();
  if (typeof body.description === "string") update.description = body.description;
  if (typeof body.coverImage === "string") update.coverImage = body.coverImage;
  if (typeof body.slug === "string" && body.slug.trim()) {
    const newSlug = slugify(body.slug);
    if (!newSlug) {
      res.status(400).json({ error: "Slug must contain letters or numbers." });
      return;
    }
    // Reject duplicates instead of letting the unique-constraint blow up as a 500
    const clash = await db
      .select()
      .from(seriesTable)
      .where(and(eq(seriesTable.slug, newSlug)));
    if (clash.length > 0 && clash[0].id !== id) {
      res.status(409).json({ error: `Slug "${newSlug}" is already in use.` });
      return;
    }
    update.slug = newSlug;
  }

  const [updated] = await db.update(seriesTable).set(update).where(eq(seriesTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Series not found" });
    return;
  }
  await writeAuditLog(req, {
    action: "series.update",
    entityType: "series",
    entityId: id,
    summary: `Updated series "${updated.title}"`,
    details: update as Record<string, unknown>,
  });
  res.json(updated);
});

/** Admin: delete a series (posts keep their content but lose the series link). */
router.delete("/admin/series/:id", adminAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  // Unlink posts first
  await db
    .update(postsTable)
    .set({ seriesId: null, seriesPosition: null })
    .where(eq(postsTable.seriesId, id));
  const [deleted] = await db.delete(seriesTable).where(eq(seriesTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Series not found" });
    return;
  }
  await writeAuditLog(req, {
    action: "series.delete",
    entityType: "series",
    entityId: id,
    summary: `Deleted series "${deleted.title}"`,
  });
  res.json({ ok: true });
});

export default router;
