import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const commentsTable = pgTable("post_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id"),
  postSlug: text("post_slug").notNull(),
  // Optional since Jul 2026: readers may comment anonymously. Nameless
  // comments render as "Anonymous"; email is no longer collected at all.
  name: text("name"),
  email: text("email"),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Comment = typeof commentsTable.$inferSelect;
