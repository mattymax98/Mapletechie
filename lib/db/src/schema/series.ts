import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const seriesTable = pgTable("series", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  coverImage: text("cover_image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Series = typeof seriesTable.$inferSelect;
export type NewSeries = typeof seriesTable.$inferInsert;
