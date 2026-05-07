import { db, categoriesTable, postsTable } from "@workspace/db";
import { eq, sql, inArray, notInArray, isNull } from "drizzle-orm";
import { logger } from "./logger";

const CURATED = [
  { name: "News", slug: "news", description: "Breaking industry news, launches, funding, and acquisitions", color: "#ef4444" },
  { name: "Reviews", slug: "reviews", description: "Hands-on reviews of phones, laptops, wearables, and accessories", color: "#f97316" },
  { name: "AI", slug: "ai", description: "LLMs, generative AI, model releases, and AI policy", color: "#8b5cf6" },
  { name: "Gadgets", slug: "gadgets", description: "Consumer hardware first looks, leaks, and comparisons", color: "#06b6d4" },
  { name: "Software & Apps", slug: "software", description: "OS updates, app launches, dev tools, and productivity", color: "#3b82f6" },
  { name: "Gaming", slug: "gaming", description: "Consoles, PC, mobile games, esports, and game tech", color: "#22c55e" },
  { name: "Business & Policy", slug: "business", description: "Big Tech, regulation, antitrust, earnings, and the startup ecosystem", color: "#64748b" },
  { name: "Canada Tech", slug: "canada-tech", description: "Canadian startups, Shopify, Cohere, CRTC, and the Toronto / Waterloo / Montreal scenes", color: "#dc2626" },
] as const;

const CURATED_SLUGS = CURATED.map((c) => c.slug);

export const CURATED_CATEGORY_SLUGS: readonly string[] = CURATED_SLUGS;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Install Postgres triggers that keep `posts.category` (text cache) in sync
 * with the canonical `posts.category_id` FK and with `categories.name`.
 *
 * - Before INSERT/UPDATE on posts: when category_id is set, overwrite
 *   posts.category with the corresponding categories.name.
 * - After UPDATE OF name on categories: cascade the new name into every
 *   post that references the row. This replaces the manual cascade that
 *   used to live in the PUT /admin/categories/:id route and in this seed.
 */
async function installCategorySyncTriggers(): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION sync_post_category_text() RETURNS trigger AS $$
    BEGIN
      IF NEW.category_id IS NOT NULL THEN
        SELECT name INTO NEW.category FROM categories WHERE id = NEW.category_id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await db.execute(sql`DROP TRIGGER IF EXISTS posts_sync_category_text ON posts;`);
  await db.execute(sql`
    CREATE TRIGGER posts_sync_category_text
      BEFORE INSERT OR UPDATE OF category_id ON posts
      FOR EACH ROW EXECUTE FUNCTION sync_post_category_text();
  `);

  await db.execute(sql`
    CREATE OR REPLACE FUNCTION cascade_category_rename() RETURNS trigger AS $$
    BEGIN
      IF NEW.name IS DISTINCT FROM OLD.name THEN
        UPDATE posts SET category = NEW.name WHERE category_id = NEW.id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await db.execute(sql`DROP TRIGGER IF EXISTS categories_cascade_rename ON categories;`);
  await db.execute(sql`
    CREATE TRIGGER categories_cascade_rename
      AFTER UPDATE OF name ON categories
      FOR EACH ROW EXECUTE FUNCTION cascade_category_rename();
  `);
}

/**
 * For every post with a NULL category_id, look up a matching categories row
 * by exact name (case-insensitive), then by slug. If nothing matches, create
 * a new category row using the leftover text as the name so the FK has a
 * valid target. This is the import-safety net referenced by the task title:
 * any post whose category text doesn't resolve gets its own category, and
 * once the FK is populated the seed below can no longer silently delete
 * categories that still have posts referencing them.
 */
async function backfillPostCategoryIds(): Promise<void> {
  const orphans = await db
    .select({ category: postsTable.category })
    .from(postsTable)
    .where(isNull(postsTable.categoryId))
    .groupBy(postsTable.category);

  for (const { category } of orphans) {
    const text = (category ?? "").trim();
    if (!text) continue;

    let [match] = await db
      .select()
      .from(categoriesTable)
      .where(sql`lower(${categoriesTable.name}) = lower(${text})`);

    if (!match) {
      const slug = slugify(text);
      [match] = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.slug, slug));
    }

    if (!match) {
      const slug = slugify(text) || `cat-${Date.now()}`;
      try {
        [match] = await db
          .insert(categoriesTable)
          .values({ name: text, slug, description: null, color: null, postCount: 0 })
          .returning();
        logger.warn(
          { name: text, slug },
          "seedCategories: created placeholder category for orphaned post.category text",
        );
      } catch (err) {
        logger.error({ err, name: text }, "seedCategories: failed to create placeholder category");
        continue;
      }
    }

    // Match on trimmed/lowered text so rows with dirty whitespace or
    // case-mismatched cached values still get linked. Restrict to NULL
    // category_id so we never overwrite an already-resolved FK.
    await db
      .update(postsTable)
      .set({ categoryId: match.id })
      .where(
        sql`${postsTable.categoryId} IS NULL AND lower(btrim(${postsTable.category})) = lower(${text})`,
      );
  }

  // Health check: any remaining NULL category_id means an import or row
  // slipped past the matcher. Fail loudly — the schema's NOT NULL would
  // also catch it on the next push, but this gives a clear, actionable
  // error here at boot.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postsTable)
    .where(isNull(postsTable.categoryId));
  if (count > 0) {
    throw new Error(
      `Backfill incomplete: ${count} post(s) still have NULL category_id. Inspect the posts.category text values and add matching categories.`,
    );
  }
}

/**
 * Sanity check the schema invariants this module relies on. If they're
 * missing (e.g. someone forgot to run `pnpm --filter @workspace/db push`)
 * we want a loud error, not silent corruption — the FK + sync trigger are
 * what make stale categories impossible to bring back via leftover posts.
 */
async function assertCategorySchemaInvariants(): Promise<void> {
  const fkCheck = await db.execute(sql`
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'posts'::regclass
      AND contype = 'f'
      AND conname = 'posts_category_id_categories_id_fk'
    LIMIT 1
  `);
  if (fkCheck.rowCount === 0) {
    throw new Error(
      "posts.category_id FK is missing. Run `pnpm --filter @workspace/db run push` to apply the latest schema before booting.",
    );
  }
  const triggerCheck = await db.execute(sql`
    SELECT tgname FROM pg_trigger
    WHERE tgname IN ('posts_sync_category_text', 'categories_cascade_rename')
  `);
  if (triggerCheck.rowCount !== 2) {
    throw new Error(
      "Category sync triggers are missing — refusing to boot to avoid drifting posts.category cache.",
    );
  }
}

export async function seedCuratedCategories(): Promise<void> {
  // Triggers and backfill must happen before any other category mutation so
  // that subsequent rename/delete logic relies on the FK invariants. Any
  // failure here MUST propagate — the seed is the only place that installs
  // the rename-cascade trigger, and without it the PUT /admin/categories/:id
  // route would silently leave posts.category text stale.
  await installCategorySyncTriggers();
  await backfillPostCategoryIds();
  await assertCategorySchemaInvariants();

  try {

    // Upsert curated rows by slug (insert if missing, update name/desc/color
    // if present). Renames cascade to posts.category via the trigger above —
    // we no longer need a manual UPDATE posts SET category = ... here.
    for (const c of CURATED) {
      const [existing] = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.slug, c.slug));
      if (!existing) {
        await db
          .insert(categoriesTable)
          .values({ name: c.name, slug: c.slug, description: c.description, color: c.color, postCount: 0 });
        continue;
      }
      await db
        .update(categoriesTable)
        .set({ name: c.name, description: c.description, color: c.color })
        .where(eq(categoriesTable.id, existing.id));
      if (existing.name !== c.name) {
        logger.info(
          { slug: c.slug, from: existing.name, to: c.name },
          "seedCategories: renamed category (text cascade handled by trigger)",
        );
      }
    }

    // Delete non-curated categories that have no posts. Categories with
    // posts are now FK-protected — the DELETE below will raise 23503 if a
    // post still references them, so we explicitly guard with a count check
    // and just warn instead of attempting to delete. This is the core of
    // the "stop stale categories from coming back via leftover posts on
    // import" guarantee: as long as a post points at the row, the row
    // cannot vanish.
    const stale = await db
      .select()
      .from(categoriesTable)
      .where(notInArray(categoriesTable.slug, CURATED_SLUGS as unknown as string[]));

    for (const cat of stale) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(postsTable)
        .where(eq(postsTable.categoryId, cat.id));
      if (count === 0) {
        await db.delete(categoriesTable).where(eq(categoriesTable.id, cat.id));
        logger.info({ slug: cat.slug, name: cat.name }, "seedCategories: removed unused stale category");
      } else {
        logger.warn(
          { slug: cat.slug, name: cat.name, postCount: count },
          "seedCategories: keeping non-curated category because posts still reference it; reassign manually",
        );
      }
    }

    // Recompute postCount for every remaining category by joining through
    // category_id (no longer the brittle name match).
    const allCats = await db.select().from(categoriesTable);
    for (const cat of allCats) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(postsTable)
        .where(eq(postsTable.categoryId, cat.id));
      await db
        .update(categoriesTable)
        .set({ postCount: count })
        .where(eq(categoriesTable.id, cat.id));
    }

    logger.info({ count: CURATED.length }, "seedCategories: curated categories ready");
  } catch (err) {
    logger.error({ err }, "seedCategories failed");
  }
}
