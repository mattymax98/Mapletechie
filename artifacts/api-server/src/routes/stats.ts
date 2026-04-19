import { Router } from "express";
import { db, postsTable, categoriesTable, productsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/stats/summary", async (req, res): Promise<void> => {
  const [postStats] = await db
    .select({ total: sql<number>`count(*)`, views: sql<number>`sum(${postsTable.viewCount})` })
    .from(postsTable);
  const [catStats] = await db
    .select({ total: sql<number>`count(*)` })
    .from(categoriesTable);
  const [prodStats] = await db
    .select({ total: sql<number>`count(*)` })
    .from(productsTable);

  res.json({
    totalPosts: Number(postStats?.total ?? 0),
    totalCategories: Number(catStats?.total ?? 0),
    totalProducts: Number(prodStats?.total ?? 0),
    totalViews: Number(postStats?.views ?? 0),
  });
});

export default router;
