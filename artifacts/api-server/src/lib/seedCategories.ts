import { db, categoriesTable, postsTable } from "@workspace/db";
import { eq, sql, notInArray } from "drizzle-orm";
import { logger } from "./logger";

const CURATED = [
  { name: "News", slug: "news", description: "Breaking industry news, launches, funding, and acquisitions", color: "#e0533f" },
  { name: "Reviews", slug: "reviews", description: "Hands-on reviews of phones, laptops, wearables, and accessories", color: "#f97316" },
  { name: "AI", slug: "ai", description: "LLMs, generative AI, model releases, and AI policy", color: "#e0992e" },
  { name: "Gadgets", slug: "gadgets", description: "Consumer hardware first looks, leaks, and comparisons", color: "#3a9b95" },
  { name: "Software & Apps", slug: "software", description: "OS updates, app launches, dev tools, and productivity", color: "#4f74c4" },
  { name: "Gaming", slug: "gaming", description: "Consoles, PC, mobile games, esports, and game tech", color: "#9b5cc0" },
  { name: "Business & Policy", slug: "business", description: "Big Tech, regulation, antitrust, earnings, and the startup ecosystem", color: "#7a8493" },
  { name: "Canada Tech", slug: "canada-tech", description: "Canadian startups, Shopify, Cohere, CRTC, and the Toronto / Waterloo / Montreal scenes", color: "#c0392b" },
] as const;

const CURATED_SLUGS = CURATED.map((c) => c.slug);

export const CURATED_CATEGORY_SLUGS: readonly string[] = CURATED_SLUGS;

/**
 * Sanity check the schema invariants this module relies on. The denormalized
 * `posts.category` text column and its sync triggers were removed in May
 * 2026 — the FK is the only source of truth for a post's category now, so
 * we just verify the FK constraint is installed.
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
}

/**
 * Idempotently drops the legacy denormalized-category-cache plumbing that
 * used to keep `posts.category` (text) in sync with `categories.name`. The
 * column and these triggers were removed in May 2026; this runs at every
 * boot so upgraded environments (production, staging) get cleaned up
 * automatically without a manual migration step.
 */
async function dropLegacyCategorySyncObjects(): Promise<void> {
  await db.execute(sql`DROP TRIGGER IF EXISTS posts_sync_category_text ON posts`);
  await db.execute(sql`DROP TRIGGER IF EXISTS categories_cascade_rename ON categories`);
  await db.execute(sql`DROP FUNCTION IF EXISTS sync_post_category_text() CASCADE`);
  await db.execute(sql`DROP FUNCTION IF EXISTS cascade_category_rename() CASCADE`);
}

export async function seedCuratedCategories(): Promise<void> {
  await assertCategorySchemaInvariants();
  await dropLegacyCategorySyncObjects();

  try {
    // Upsert curated rows by slug (insert if missing, update name/desc/color
    // if present). Renames cascade through the FK ON UPDATE CASCADE on
    // posts.category_id (categories.id is the only target now), so no
    // separate text cache needs maintaining.
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
          "seedCategories: renamed category",
        );
      }
    }

    // Delete non-curated categories that have no posts. Categories with
    // posts are FK-protected — the DELETE would raise 23503 if a post
    // still references them, so we explicitly guard with a count check
    // and warn instead.
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

    // Recompute postCount for every remaining category through the FK.
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
