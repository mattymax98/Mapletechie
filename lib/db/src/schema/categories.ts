import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  postCount: integer("post_count").notNull().default(0),
  color: text("color"),
});

export const defaultCategories = [
  { name: "AI & Machine Learning", slug: "ai-machine-learning", description: "News, tools, and analysis around AI systems.", color: "#f97316" },
  { name: "Gadgets", slug: "gadgets", description: "Phones, wearables, and consumer tech reviews.", color: "#f97316" },
  { name: "Software", slug: "software", description: "Apps, platforms, and software deep dives.", color: "#f97316" },
  { name: "Cybersecurity", slug: "cybersecurity", description: "Security threats, privacy, and protection advice.", color: "#f97316" },
  { name: "Electric Vehicles", slug: "electric-vehicles", description: "EV news, ownership, charging, and future mobility.", color: "#f97316" },
  { name: "Education", slug: "education", description: "Learning, classrooms, and technology in education.", color: "#f97316" },
  { name: "Tech Jobs", slug: "tech-jobs", description: "Hiring trends, roles, and career advice in tech.", color: "#f97316" },
] as const;

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categoriesTable.$inferSelect;
