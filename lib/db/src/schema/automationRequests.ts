import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Idempotency ledger for the private automation draft API
 * (POST /api/automation/posts/drafts).
 *
 * Each successful draft creation that carried an `Idempotency-Key` header
 * records the key here. A repeat request with the same key returns the
 * original draft instead of creating a duplicate — so a flaky network or a
 * retrying client can never double-post a story.
 */
export const automationRequestsTable = pgTable("automation_requests", {
  id: serial("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  postId: integer("post_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AutomationRequest = typeof automationRequestsTable.$inferSelect;
