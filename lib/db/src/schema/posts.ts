import { pgTable, text, serial, timestamp, integer, boolean, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt").notNull(),
  content: text("content").notNull(),
  coverImage: text("cover_image"),
  // The category for this post. The denormalized `category` text cache and
  // the Postgres sync triggers were dropped in May 2026 — read paths now
  // JOIN `categories.name` through this FK to expose the name.
  categoryId: integer("category_id")
    .notNull()
    .references(() => categoriesTable.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  tags: text("tags").array().notNull().default([]),
  author: text("author").notNull(),
  authorAvatar: text("author_avatar"),
  authorId: integer("author_id"),
  // status: 'draft' | 'scheduled' | 'published'
  status: text("status").notNull().default("published"),
  // When set and status === 'scheduled', the scheduled-publish cron flips
  // the post to 'published' once `scheduledFor <= now()`.
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  seoKeywords: text("seo_keywords").array().notNull().default([]),
  ogImage: text("og_image"),
  readTime: integer("read_time").notNull().default(5),
  viewCount: integer("view_count").notNull().default(0),
  isFeatured: boolean("is_featured").notNull().default(false),
  seriesId: integer("series_id"),
  seriesPosition: integer("series_position"),
  // Optional review toolkit. `rating` is a 0–5 score (one decimal allowed);
  // `pros`/`cons` are bullet lists; `verdict` is the bottom-line summary.
  rating: doublePrecision("rating"),
  pros: text("pros").array().notNull().default([]),
  cons: text("cons").array().notNull().default([]),
  verdict: text("verdict"),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
