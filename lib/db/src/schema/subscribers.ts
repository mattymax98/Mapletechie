import { pgTable, text, serial, timestamp, varchar, integer } from "drizzle-orm/pg-core";

export const subscribersTable = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  status: text("status").notNull().default("pending"),
  confirmToken: varchar("confirm_token", { length: 64 }).notNull(),
  unsubToken: varchar("unsub_token", { length: 64 }).notNull(),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
});

export type Subscriber = typeof subscribersTable.$inferSelect;

export const newsletterSendsTable = pgTable("newsletter_sends", {
  id: serial("id").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  subject: text("subject").notNull(),
  postIds: text("post_ids").notNull().default(""),
  recipientCount: integer("recipient_count").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NewsletterSend = typeof newsletterSendsTable.$inferSelect;
