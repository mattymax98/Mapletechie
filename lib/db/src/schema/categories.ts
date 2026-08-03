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
  { name: "News", slug: "news", description: "Breaking industry news, launches, funding, and acquisitions", color: "#e0533f" },
  { name: "Reviews", slug: "reviews", description: "Hands-on reviews of phones, laptops, wearables, and accessories", color: "#f97316" },
  { name: "AI", slug: "ai", description: "LLMs, generative AI, model releases, and AI policy", color: "#e0992e" },
  { name: "Gadgets", slug: "gadgets", description: "Consumer hardware first looks, leaks, and comparisons", color: "#3a9b95" },
  { name: "Software & Apps", slug: "software", description: "OS updates, app launches, dev tools, and productivity", color: "#4f74c4" },
  { name: "Gaming", slug: "gaming", description: "Consoles, PC, mobile games, esports, and game tech", color: "#9b5cc0" },
  { name: "Business & Policy", slug: "business", description: "Big Tech, regulation, antitrust, earnings, and the startup ecosystem", color: "#7a8493" },
  { name: "Canada Tech", slug: "canada-tech", description: "Canadian startups, Shopify, Cohere, CRTC, and the Toronto / Waterloo / Montreal scenes", color: "#c0392b" },
] as const;

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categoriesTable.$inferSelect;
