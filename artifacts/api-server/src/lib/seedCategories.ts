import { db, categoriesTable, postsTable } from "@workspace/db";
import { eq, sql, inArray, notInArray } from "drizzle-orm";
import { logger } from "./logger";

const CURATED = [
  { name: "News", slug: "news", description: "Breaking industry news, launches, funding, and acquisitions", color: "#ef4444" },
  { name: "Reviews", slug: "reviews", description: "Hands-on reviews of phones, laptops, wearables, and accessories", color: "#f97316" },
  { name: "AI", slug: "ai", description: "LLMs, generative AI, model releases, and AI policy", color: "#8b5cf6" },
  { name: "Gadgets", slug: "gadgets", description: "Consumer hardware first looks, leaks, and comparisons", color: "#06b6d4" },
  { name: "Software & Apps", slug: "software", description: "OS updates, app launches, dev tools, and productivity", color: "#3b82f6" },
  { name: "Gaming", slug: "gaming", description: "Consoles, PC, mobile games, esports, and game tech", color: "#22c55e" },
  { name: "Business & Policy", slug: "business", description: "Big Tech, regulation, antitrust, earnings, and the startup ecosystem", color: "#64748b" },
  { name: "Canada Tech", slug: "canada-tech", description: "Canadian startups, Shopify, Cohere, CRTC, and the Toronto / Waterloo / Montreal scenes", color: "#dc2626" },
] as const;

const CURATED_SLUGS = CURATED.map((c) => c.slug);

export const CURATED_CATEGORY_SLUGS: readonly string[] = CURATED_SLUGS;

export async function seedCuratedCategories(): Promise<void> {
  try {
    // Upsert curated rows by slug (insert if missing, update name/desc/color
    // if present). If the curated name differs from the existing row's name,
    // cascade the rename to every post that referenced the old name — same
    // contract as the PUT /admin/categories/:id rename path.
    for (const c of CURATED) {
      await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(categoriesTable)
          .where(eq(categoriesTable.slug, c.slug));
        if (!existing) {
          await tx
            .insert(categoriesTable)
            .values({ name: c.name, slug: c.slug, description: c.description, color: c.color, postCount: 0 });
          return;
        }
        if (existing.name !== c.name) {
          await tx
            .update(postsTable)
            .set({ category: c.name })
            .where(eq(postsTable.category, existing.name));
          logger.info(
            { slug: c.slug, from: existing.name, to: c.name },
            "seedCategories: renamed category and cascaded to posts",
          );
        }
        await tx
          .update(categoriesTable)
          .set({ name: c.name, description: c.description, color: c.color })
          .where(eq(categoriesTable.id, existing.id));
      });
    }

    // Find existing categories whose slug is NOT in the curated list.
    const stale = await db
      .select()
      .from(categoriesTable)
      .where(notInArray(categoriesTable.slug, CURATED_SLUGS as unknown as string[]));

    for (const cat of stale) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(postsTable)
        .where(eq(postsTable.category, cat.name));
      if (count === 0) {
        await db.delete(categoriesTable).where(eq(categoriesTable.id, cat.id));
        logger.info({ slug: cat.slug, name: cat.name }, "seedCategories: removed unused stale category");
      } else {
        logger.warn(
          { slug: cat.slug, name: cat.name, postCount: count },
          "seedCategories: keeping non-curated category because posts still reference it; reassign manually",
        );
      }
    }

    // Recompute postCount for curated rows.
    const curated = await db
      .select()
      .from(categoriesTable)
      .where(inArray(categoriesTable.slug, CURATED_SLUGS as unknown as string[]));
    for (const cat of curated) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(postsTable)
        .where(eq(postsTable.category, cat.name));
      await db
        .update(categoriesTable)
        .set({ postCount: count })
        .where(eq(categoriesTable.id, cat.id));
    }

    logger.info({ count: CURATED.length }, "seedCategories: curated categories ready");
  } catch (err) {
    logger.error({ err }, "seedCategories failed");
  }
}
