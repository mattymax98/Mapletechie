import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  department: text("department").notNull(),
  location: text("location").notNull(),
  employmentType: text("employment_type").notNull(),
  compensation: text("compensation"),
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  responsibilities: text("responsibilities").notNull(),
  requirements: text("requirements").notNull(),
  niceToHaves: text("nice_to_haves"),
  applyEmail: text("apply_email"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Job = typeof jobsTable.$inferSelect;

export const applicationsTable = pgTable("job_applications", {
  id: serial("id").primaryKey(),
  jobId: serial("job_id").references(() => jobsTable.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  resumeUrl: text("resume_url"),
  portfolioUrl: text("portfolio_url"),
  coverLetter: text("cover_letter").notNull(),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Application = typeof applicationsTable.$inferSelect;
