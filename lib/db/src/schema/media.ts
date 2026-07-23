import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Media library: a record of every image (or other file) that an editor has
 * saved for reuse. The actual bytes live in object storage; this table just
 * tracks the URL plus authorship/metadata so the admin UI can browse,
 * filter, and pick a previously uploaded asset.
 */
export const mediaTable = pgTable("media", {
  id: serial("id").primaryKey(),
  url: text("url").notNull().unique(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type"),
  size: integer("size"),
  alt: text("alt"),
  /** Where the file came from, e.g. the original external URL for images the
   *  server re-hosted automatically. Null for direct editor uploads. */
  source: text("source"),
  uploaderId: integer("uploader_id"),
  uploaderName: text("uploader_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Media = typeof mediaTable.$inferSelect;
export type InsertMedia = typeof mediaTable.$inferInsert;
