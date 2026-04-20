import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const commentsTable = pgTable("post_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id"),
  postSlug: text("post_slug").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Comment = typeof commentsTable.$inferSelect;
