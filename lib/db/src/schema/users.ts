import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

/** An organization the editor works for or belongs to. */
export interface ProfileOrganization {
  name: string;
  url?: string;
}

/** A membership in an organization, optionally under a parent org. */
export interface ProfileMembership {
  name: string;
  parentOrganization?: string;
}

/** A public reference link shown on the author page and used as sameAs. */
export interface ProfileLink {
  label: string;
  url: string;
}

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  twitterUrl: text("twitter_url"),
  linkedinUrl: text("linkedin_url"),
  instagramUrl: text("instagram_url"),
  githubUrl: text("github_url"),
  websiteUrl: text("website_url"),
  // Structured profile fields for Person schema markup on author pages.
  alternateName: text("alternate_name"),
  jobTitle: text("job_title"),
  locationCity: text("location_city"),
  locationRegion: text("location_region"),
  locationCountry: text("location_country"),
  education: jsonb("education").$type<string[]>(),
  knowsAbout: jsonb("knows_about").$type<string[]>(),
  organizations: jsonb("organizations").$type<ProfileOrganization[]>(),
  memberships: jsonb("memberships").$type<ProfileMembership[]>(),
  profileLinks: jsonb("profile_links").$type<ProfileLink[]>(),
  role: text("role").notNull().default("editor"),
  canPublishDirectly: boolean("can_publish_directly").notNull().default(false),
  canManageShop: boolean("can_manage_shop").notNull().default(false),
  canManageJobs: boolean("can_manage_jobs").notNull().default(false),
  canViewInbox: boolean("can_view_inbox").notNull().default(false),
  canManageEditors: boolean("can_manage_editors").notNull().default(false),
  canSendEmail: boolean("can_send_email").notNull().default(false),
  canManageCategories: boolean("can_manage_categories").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export const sessionsTable = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type Session = typeof sessionsTable.$inferSelect;
