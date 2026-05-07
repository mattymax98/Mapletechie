import { Router } from "express";
import { db, categoriesTable, postsTable } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { adminAuth, requirePermission } from "../middlewares/adminAuth";

const router = Router();

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

router.get("/categories", async (_req, res): Promise<void> => {
  const categories = await db
    .select()
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.name));
  res.json(categories);
});

// --- Admin-only CRUD --------------------------------------------------------

router.post(
  "/admin/categories",
  adminAuth,
  requirePermission("categories"),
  async (req, res): Promise<void> => {
    const { name, slug, description, color } = req.body ?? {};
    if (typeof name !== "string" || name.trim().length < 2) {
      res.status(400).json({ error: "Name required (min 2 chars)" });
      return;
    }
    if (color != null && color !== "" && !HEX_COLOR.test(String(color))) {
      res.status(400).json({ error: "Color must be a 6-digit hex like #f97316" });
      return;
    }
    const cleanName = name.trim();
    const cleanSlug =
      typeof slug === "string" && slug.trim() ? slugify(slug) : slugify(cleanName);
    if (cleanSlug.length < 2) {
      res.status(400).json({ error: "Slug must contain letters or numbers" });
      return;
    }

    try {
      const [created] = await db
        .insert(categoriesTable)
        .values({
          name: cleanName,
          slug: cleanSlug,
          description: typeof description === "string" ? description.trim() || null : null,
          color: color ? String(color) : null,
          postCount: 0,
        })
        .returning();
      req.log.info({ categoryId: created.id, name: created.name }, "category.created");
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.code === "23505") {
        res.status(409).json({ error: "A category with that name or slug already exists" });
        return;
      }
      throw err;
    }
  },
);

// Bulk reassign every post from one category name to another. Used by the
// admin UI to clear out stale (non-curated) categories so they can then be
// deleted via the existing DELETE endpoint.
router.post(
  "/admin/categories/reassign-posts",
  adminAuth,
  requirePermission("categories"),
  async (req, res): Promise<void> => {
    const { fromName, toName } = req.body ?? {};
    if (typeof fromName !== "string" || !fromName.trim()) {
      res.status(400).json({ error: "fromName is required" });
      return;
    }
    if (typeof toName !== "string" || !toName.trim()) {
      res.status(400).json({ error: "toName is required" });
      return;
    }
    const from = fromName.trim();
    const to = toName.trim();
    if (from === to) {
      res.status(400).json({ error: "fromName and toName must differ" });
      return;
    }

    const [fromCat] = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.name, from));
    if (!fromCat) {
      res.status(404).json({ error: `Source category "${from}" not found` });
      return;
    }
    const [toCat] = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.name, to));
    if (!toCat) {
      res.status(404).json({ error: `Destination category "${to}" not found` });
      return;
    }

    const movedCount = await db.transaction(async (tx) => {
      // category_id is the source of truth — there's no text cache to keep
      // in sync any more (the column and its triggers were dropped).
      const moved = await tx
        .update(postsTable)
        .set({ categoryId: toCat.id })
        .where(eq(postsTable.categoryId, fromCat.id))
        .returning({ id: postsTable.id });

      const [{ count: fromCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(postsTable)
        .where(eq(postsTable.categoryId, fromCat.id));
      const [{ count: toCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(postsTable)
        .where(eq(postsTable.categoryId, toCat.id));

      await tx
        .update(categoriesTable)
        .set({ postCount: fromCount })
        .where(eq(categoriesTable.id, fromCat.id));
      await tx
        .update(categoriesTable)
        .set({ postCount: toCount })
        .where(eq(categoriesTable.id, toCat.id));

      return moved.length;
    });

    req.log.info(
      { from, to, movedCount, userId: (req as any).user?.id },
      "category.posts.reassigned",
    );
    res.json({ movedCount });
  },
);

router.put(
  "/admin/categories/:id",
  adminAuth,
  requirePermission("categories"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    const { name, slug, description, color } = req.body ?? {};
    const updates: Record<string, unknown> = {};
    let renamedFrom: string | null = null;

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 2) {
        res.status(400).json({ error: "Name must be at least 2 chars" });
        return;
      }
      const cleanName = name.trim();
      if (cleanName !== existing.name) {
        renamedFrom = existing.name;
        updates.name = cleanName;
      }
    }
    if (slug !== undefined) {
      if (typeof slug !== "string") {
        res.status(400).json({ error: "Slug must be a string" });
        return;
      }
      const cleanSlug = slugify(slug);
      if (cleanSlug.length < 2) {
        res.status(400).json({ error: "Slug must contain letters or numbers" });
        return;
      }
      if (cleanSlug !== existing.slug) updates.slug = cleanSlug;
    }
    if (description !== undefined) {
      updates.description =
        typeof description === "string" ? description.trim() || null : null;
    }
    if (color !== undefined) {
      if (color === null || color === "") {
        updates.color = null;
      } else if (typeof color !== "string" || !HEX_COLOR.test(color)) {
        res.status(400).json({ error: "Color must be a 6-digit hex like #f97316" });
        return;
      } else {
        updates.color = color;
      }
    }

    if (Object.keys(updates).length === 0) {
      res.json(existing);
      return;
    }

    try {
      // No cascade is needed — the denormalized `posts.category` text cache
      // was dropped in May 2026, so a rename here only touches the
      // categories row and every read picks up the new name via JOIN.
      const [updated] = await db
        .update(categoriesTable)
        .set(updates)
        .where(eq(categoriesTable.id, id))
        .returning();
      req.log.info(
        { categoryId: id, updates: Object.keys(updates), renamedFrom },
        "category.updated",
      );
      res.json(updated);
    } catch (err: any) {
      if (err?.code === "23505") {
        res.status(409).json({ error: "Another category already uses that name or slug" });
        return;
      }
      throw err;
    }
  },
);

router.delete(
  "/admin/categories/:id",
  adminAuth,
  requirePermission("categories"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, id));
    if (!existing) {
      res.status(204).send();
      return;
    }

    // Block deletion if any post still references this category via the FK.
    // The DB-level ON DELETE RESTRICT would also reject the delete (raising
    // 23503), but checking explicitly lets us return a friendly error with
    // the exact post count.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(postsTable)
      .where(eq(postsTable.categoryId, existing.id));
    if (count > 0) {
      res.status(409).json({
        error: `Cannot delete: ${count} post(s) still use this category. Reassign them first.`,
        postCount: count,
      });
      return;
    }

    await db.delete(categoriesTable).where(eq(categoriesTable.id, id));
    req.log.info({ categoryId: id, name: existing.name }, "category.deleted");
    res.status(204).send();
  },
);

export default router;
