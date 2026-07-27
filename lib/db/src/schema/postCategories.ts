import { pgTable, serial, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { postsTable } from "./posts";
import { categoriesTable } from "./categories";

/**
 * Posts ↔ categories many-to-many (added Jul 2026). Every post has one or
 * more rows here; EXACTLY one row per post has `isPrimary = true` (enforced
 * by a partial unique index). The primary category is ALSO mirrored into
 * `posts.category_id` so every legacy read path (joins, breadcrumbs, SEO,
 * `category`/`categorySlug` response fields) keeps working unchanged —
 * writers must keep the two in sync inside one transaction.
 */
export const postCategoriesTable = pgTable(
  "post_categories",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id, { onDelete: "restrict", onUpdate: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [
    uniqueIndex("post_categories_post_category_uq").on(t.postId, t.categoryId),
    // Exactly one primary per post.
    uniqueIndex("post_categories_one_primary_uq").on(t.postId).where(sql`${t.isPrimary}`),
  ],
);

export type PostCategory = typeof postCategoriesTable.$inferSelect;
