import { db, postsTable, categoriesTable, postCategoriesTable } from "@workspace/db";
import { eq, inArray, or, sql, desc, asc } from "drizzle-orm";

/**
 * Multi-category support (Jul 2026).
 *
 * Every post has one or more rows in `post_categories`; exactly one is
 * `is_primary`. The primary category is mirrored into `posts.category_id`
 * so legacy read paths (`category` / `categorySlug` response fields,
 * breadcrumbs, SEO) keep working. All write paths must go through
 * `syncPostCategories` so the mirror and the cached
 * `categories.post_count` stay consistent.
 */

export type CategoryRow = typeof categoriesTable.$inferSelect;
export type CategoryRef = { id: number; name: string; slug: string };

// drizzle transaction object (or db itself)
type Tx = Pick<typeof db, "select" | "insert" | "update" | "delete" | "execute">;

/**
 * Resolve an arbitrary category input (id, slug, or name) to a categoriesTable
 * row. Returns null if no match — callers should reject the request in that
 * case so the FK on posts.category_id is never violated.
 */
export async function resolveCategory(input: unknown): Promise<CategoryRow | null> {
  if (input == null) return null;
  if (typeof input === "number" && Number.isFinite(input)) {
    const [row] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, input));
    return row ?? null;
  }
  const text = String(input).trim();
  if (!text) return null;
  const asNum = Number(text);
  if (Number.isInteger(asNum) && asNum > 0) {
    const [row] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, asNum));
    if (row) return row;
  }
  const [row] = await db
    .select()
    .from(categoriesTable)
    .where(
      or(
        eq(categoriesTable.slug, text),
        sql`lower(${categoriesTable.name}) = lower(${text})`,
      ),
    );
  return row ?? null;
}

/**
 * Resolve the category-related fields of a create/update body into a
 * deduped list of category rows plus the primary.
 *
 * Accepted inputs (each entry may be an id, slug, or name):
 * - `categories`: array — the full list of categories for the post.
 * - `category`: single value — legacy shape, equals a one-item list.
 * - `primaryCategory`: optional — which of the list is primary
 *   (defaults to the first entry). Must be one of the selected categories.
 *
 * Returns `{ error }` with a user-facing message on any invalid input.
 */
export async function resolveCategoriesForWrite(body: {
  categories?: unknown;
  category?: unknown;
  primaryCategory?: unknown;
}): Promise<{ error: string } | { all: CategoryRow[]; primary: CategoryRow }> {
  let inputs: unknown[];
  if (Array.isArray(body.categories)) {
    if (body.categories.length === 0) {
      return { error: "categories must contain at least one category" };
    }
    if (body.categories.length > 10) {
      return { error: "categories can contain at most 10 entries" };
    }
    inputs = body.categories;
  } else if (body.categories != null) {
    return { error: "categories must be an array of ids, slugs, or names" };
  } else if (body.category != null) {
    inputs = [body.category];
  } else {
    return { error: "Missing field: category" };
  }

  const all: CategoryRow[] = [];
  const seen = new Set<number>();
  for (const input of inputs) {
    const row = await resolveCategory(input);
    if (!row) return { error: `Unknown category: ${String(input)}` };
    if (!seen.has(row.id)) {
      seen.add(row.id);
      all.push(row);
    }
  }

  let primary = all[0];
  if (body.primaryCategory != null) {
    const row = await resolveCategory(body.primaryCategory);
    if (!row) return { error: `Unknown category: ${String(body.primaryCategory)}` };
    const match = all.find((c) => c.id === row.id);
    if (!match) {
      return { error: `primaryCategory "${row.name}" must be one of the selected categories` };
    }
    primary = match;
  }
  return { all, primary };
}

/** Current category ids for a post (primary first). */
export async function getPostCategoryIds(
  tx: Tx,
  postId: number,
): Promise<{ ids: number[]; primaryId: number | null }> {
  const rows = await tx
    .select({ categoryId: postCategoriesTable.categoryId, isPrimary: postCategoriesTable.isPrimary })
    .from(postCategoriesTable)
    .where(eq(postCategoriesTable.postId, postId))
    .orderBy(desc(postCategoriesTable.isPrimary));
  return {
    ids: rows.map((r) => r.categoryId),
    primaryId: rows.find((r) => r.isPrimary)?.categoryId ?? null,
  };
}

/**
 * Replace a post's category memberships inside a transaction and mirror the
 * primary into posts.category_id. Does NOT refresh postCount — call
 * refreshCategoryPostCounts with the union of old+new ids afterwards
 * (same transaction).
 */
export async function syncPostCategories(
  tx: Tx,
  postId: number,
  categoryIds: number[],
  primaryId: number,
): Promise<void> {
  await tx.delete(postCategoriesTable).where(eq(postCategoriesTable.postId, postId));
  await tx.insert(postCategoriesTable).values(
    categoryIds.map((categoryId) => ({
      postId,
      categoryId,
      isPrimary: categoryId === primaryId,
    })),
  );
  await tx.update(postsTable).set({ categoryId: primaryId }).where(eq(postsTable.id, postId));
}

/**
 * Recompute the cached categories.post_count for the given category ids.
 * A post now counts toward EVERY category it belongs to (join-table
 * membership), not just its primary.
 */
export async function refreshCategoryPostCounts(tx: Tx, categoryIds: Iterable<number>): Promise<void> {
  for (const catId of new Set(categoryIds)) {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(postCategoriesTable)
      .where(eq(postCategoriesTable.categoryId, catId));
    await tx.update(categoriesTable).set({ postCount: row?.count ?? 0 }).where(eq(categoriesTable.id, catId));
  }
}

/** SQL condition: post belongs to the given category (any membership). */
export function postInCategory(categoryId: number) {
  return sql`exists (select 1 from ${postCategoriesTable} where ${postCategoriesTable.postId} = ${postsTable.id} and ${postCategoriesTable.categoryId} = ${categoryId})`;
}

/**
 * Attach a `categories` array (primary first, then alphabetical) to post
 * rows in one batched query. Falls back to the row's own category_id-based
 * fields when a post has no join rows yet (e.g. prod before the startup
 * backfill has run).
 */
export async function attachCategories<
  T extends { id: number; categoryId: number | null; category?: string; categorySlug?: string },
>(posts: T[]): Promise<(T & { categories: CategoryRef[] })[]> {
  if (posts.length === 0) return [];
  const rows = await db
    .select({
      postId: postCategoriesTable.postId,
      isPrimary: postCategoriesTable.isPrimary,
      id: categoriesTable.id,
      name: categoriesTable.name,
      slug: categoriesTable.slug,
    })
    .from(postCategoriesTable)
    .innerJoin(categoriesTable, eq(postCategoriesTable.categoryId, categoriesTable.id))
    .where(inArray(postCategoriesTable.postId, posts.map((p) => p.id)))
    .orderBy(desc(postCategoriesTable.isPrimary), asc(categoriesTable.name));

  const byPost = new Map<number, CategoryRef[]>();
  for (const r of rows) {
    const list = byPost.get(r.postId) ?? [];
    list.push({ id: r.id, name: r.name, slug: r.slug });
    byPost.set(r.postId, list);
  }
  return posts.map((p) => {
    let categories = byPost.get(p.id);
    if (!categories || categories.length === 0) {
      categories =
        p.categoryId != null && p.category && p.categorySlug
          ? [{ id: p.categoryId, name: p.category, slug: p.categorySlug }]
          : [];
    }
    return { ...p, categories };
  });
}

/**
 * Idempotent backfill: give every post lacking join rows a primary
 * membership matching posts.category_id. Runs at server startup so a
 * freshly-migrated production database self-heals without a manual step.
 */
export async function backfillPostCategories(): Promise<void> {
  await db.execute(sql`
    insert into post_categories (post_id, category_id, is_primary)
    select p.id, p.category_id, true
    from posts p
    where p.category_id is not null
      and not exists (select 1 from post_categories pc where pc.post_id = p.id)
    on conflict do nothing
  `);
}
