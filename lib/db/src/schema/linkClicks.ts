import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";

export const linkClicksTable = pgTable(
  "link_clicks",
  {
    id: serial("id").primaryKey(),
    // 'social' | 'outbound'
    linkType: text("link_type").notNull(),
    href: text("href").notNull(),
    postSlug: text("post_slug"),
    sessionId: text("session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdAtIdx: index("link_clicks_created_at_idx").on(t.createdAt),
    postSlugCreatedAtIdx: index("link_clicks_post_slug_created_at_idx").on(t.postSlug, t.createdAt),
  }),
);

export type LinkClick = typeof linkClicksTable.$inferSelect;
