import { Router } from "express";
import { db, categoriesTable } from "@workspace/db";
import { asc } from "drizzle-orm";

const router = Router();

router.get("/categories", async (req, res): Promise<void> => {
  const categories = await db
    .select()
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.name));
  res.json(categories);
});

export default router;
