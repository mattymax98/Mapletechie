import { pgTable, boolean, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Site-wide settings. This is a singleton table — there is exactly one row
 * (id = 1). It currently holds the "maintenance mode" switch the admin can
 * flip to take the public site offline (e.g. during a migration or incident)
 * while leaving the admin panel fully usable.
 *
 * Note: an environment variable (MAINTENANCE_MODE) acts as a break-glass
 * override that always wins over this row — see siteSettings.ts in the API
 * server. This table is the normal, UI-controlled switch.
 */
export const siteSettingsTable = pgTable("site_settings", {
  id: integer("id").primaryKey().default(1),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  maintenanceMessage: text("maintenance_message"),
  maintenanceEta: text("maintenance_eta"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
  /** Address that receives contact form submission notifications. */
  notificationEmail: text("notification_email"),
  /** Display name used as sender on outgoing newsletters (e.g. "Mapletechie"). */
  newsletterFromName: text("newsletter_from_name"),
  /** @mapletechie.com address used as the From on outgoing newsletters. */
  newsletterFromAddress: text("newsletter_from_address"),
  /** Reply-to address on outgoing newsletters — connects replies to the admin's inbox. */
  newsletterReplyTo: text("newsletter_reply_to"),
});

export type SiteSettings = typeof siteSettingsTable.$inferSelect;
export type InsertSiteSettings = typeof siteSettingsTable.$inferInsert;
