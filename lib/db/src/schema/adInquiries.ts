import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const adInquiriesTable = pgTable("ad_inquiries", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  website: text("website"),
  adType: text("ad_type").notNull(),
  budget: text("budget"),
  message: text("message").notNull(),
  creativeUrl: text("creative_url"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdInquiry = typeof adInquiriesTable.$inferSelect;
