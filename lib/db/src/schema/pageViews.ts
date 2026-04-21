import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";

export const pageViewsTable = pgTable(
  "page_views",
  {
    id: serial("id").primaryKey(),
    path: text("path").notNull(),
    postSlug: text("post_slug"),
    category: text("category"),
    country: text("country"),
    countryName: text("country_name"),
    referrer: text("referrer"),
    sessionId: text("session_id"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdAtIdx: index("page_views_created_at_idx").on(t.createdAt),
    pathIdx: index("page_views_path_idx").on(t.path),
    postSlugIdx: index("page_views_post_slug_idx").on(t.postSlug),
  }),
);

export type PageView = typeof pageViewsTable.$inferSelect;
