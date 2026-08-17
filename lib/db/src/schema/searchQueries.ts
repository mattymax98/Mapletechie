import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";

export const searchQueriesTable = pgTable(
  "search_queries",
  {
    id: serial("id").primaryKey(),
    query: text("query").notNull(),
    path: text("path"),
    sessionId: text("session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdAtIdx: index("search_queries_created_at_idx").on(t.createdAt),
  }),
);

export type SearchQuery = typeof searchQueriesTable.$inferSelect;
