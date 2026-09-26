import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { postsTable } from "./posts";

export const postRevisionsTable = pgTable("post_revisions", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  baseHash: text("base_hash").notNull(),
  changes: jsonb("changes").$type<Record<string, string>>().notNull(),
  updateNote: text("update_note"),
  source: text("source").notNull(),
  status: text("status").notNull().default("pending"),
  proposedBy: integer("proposed_by"),
  reviewedBy: integer("reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});