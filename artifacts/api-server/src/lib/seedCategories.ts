import { db, categoriesTable, defaultCategories, postsTable, postCategoriesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

// Single source of truth lives in lib/db so both the seed script and the
// schema stay in sync automatically. Do not duplicate this list here.
const CURATED = defaultCategories;

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

/**
 * Retired placeholder slugs that no longer exist on the live site, mapped to
 * the real slug they should be merged into. Posts and post_categories rows are
 * re-pointed to the target before the stale row is deleted, so the operation
 * is safe to re-run on any environment (dev, staging, production).
 */
const RETIRED_SLUG_MAP: Record<string, string> = {
  "ai-machine-learning": "ai",
  "cybersecurity": "news",
  "electric-vehicles": "news",
  "science-space": "news",
};

/**
 * Idempotently retires placeholder categories that no longer exist on the
 * live site. For each retired slug that still exists in the DB:
 *  1. Resolve the replacement category's id.
 *  2. Re-point posts.category_id rows to the replacement.
 *  3. Re-point post_categories rows (respecting the unique constraint and
 *     preserving isPrimary).
 *  4. Delete the now-empty retired category row.
 *
 * Safe to run multiple times and across all environments.
 */
async function retireStaleCategories(): Promise<void> {
  for (const [retiredSlug, replacementSlug] of Object.entries(RETIRED_SLUG_MAP)) {
    const [retired] = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.slug, retiredSlug));
    if (!retired) continue; // already gone

    const [replacement] = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.slug, replacementSlug));
    if (!replacement) {
      logger.warn(
        { retiredSlug, replacementSlug },
        "retireStaleCategories: replacement slug not found, skipping",
      );
      continue;
    }

    await db.transaction(async (tx) => {
      // 1. Re-point posts.category_id (the primary-category FK column).
      await tx
        .update(postsTable)
        .set({ categoryId: replacement.id })
        .where(eq(postsTable.categoryId, retired.id));

      // 2. Re-point post_categories rows.
      //    If the post already has a row for the replacement category, the
      //    retired row is redundant — delete it. Otherwise remap it.
      const retiredPcRows = await tx
        .select()
        .from(postCategoriesTable)
        .where(eq(postCategoriesTable.categoryId, retired.id));

      for (const row of retiredPcRows) {
        const [existing] = await tx
          .select()
          .from(postCategoriesTable)
          .where(
            sql`${postCategoriesTable.postId} = ${row.postId}
            AND ${postCategoriesTable.categoryId} = ${replacement.id}`,
          );

        if (existing) {
          // Post already has a row for the replacement — drop the retired row
          // FIRST so the partial unique index on isPrimary is never violated,
          // then promote the replacement row if the retired one was primary.
          await tx
            .delete(postCategoriesTable)
            .where(eq(postCategoriesTable.id, row.id));
          if (row.isPrimary && !existing.isPrimary) {
            await tx
              .update(postCategoriesTable)
              .set({ isPrimary: true })
              .where(eq(postCategoriesTable.id, existing.id));
          }
        } else {
          await tx
            .update(postCategoriesTable)
            .set({ categoryId: replacement.id })
            .where(eq(postCategoriesTable.id, row.id));
        }
      }

      // 3. Delete the now-empty retired category row.
      await tx
        .delete(categoriesTable)
        .where(eq(categoriesTable.id, retired.id));
    });

    logger.info(
      { retiredSlug, replacementSlug },
      "retireStaleCategories: retired placeholder category",
    );
  }
}

export async function seedCuratedCategories(): Promise<void> {
  await assertCategorySchemaInvariants();
  await dropLegacyCategorySyncObjects();

  // Step 1: Upsert curated rows. Re-throw on failure so retireStaleCategories
  // cannot run against a partially-seeded database with missing replacement slugs.
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
  } catch (err) {
    logger.error({ err }, "seedCategories: curated upsert failed");
    throw err;
  }

  // Step 2: Retire placeholder categories that no longer exist on the live
  // site. Runs after the curated upsert so replacement slugs are guaranteed
  // to exist on any environment — including a fresh database. Errors
  // propagate to the caller so failures surface at startup rather than
  // being silently swallowed.
  await retireStaleCategories();

  // Step 3: Recompute postCount for every remaining category (best-effort).
  try {
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
    logger.error({ err }, "seedCategories: postCount recompute failed");
  }
}
