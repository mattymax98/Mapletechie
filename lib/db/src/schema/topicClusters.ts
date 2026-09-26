import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const topicsTable = pgTable("topics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  introduction: text("introduction").notNull().default(""),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const topicClustersTable = topicsTable;
export type TopicCluster = typeof topicsTable.$inferSelect;
export type NewTopicCluster = typeof topicsTable.$inferInsert;