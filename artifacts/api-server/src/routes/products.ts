import { Router } from "express";
import { db, productsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ListProductsQueryParams, GetProductParams } from "@workspace/api-zod";

const router = Router();

router.get("/products", async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  const category = parsed.success ? parsed.data.category : undefined;
  const featured = parsed.success ? parsed.data.featured : undefined;

  let query = db.select().from(productsTable);

  const products = await db
    .select()
    .from(productsTable)
    .where(
      category
        ? eq(productsTable.category, category)
        : featured === true
        ? eq(productsTable.isFeatured, true)
        : undefined
    )
    .orderBy(desc(productsTable.createdAt));

  const result = products.map((p) => ({
    ...p,
    price: parseFloat(p.price),
    originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
    rating: parseFloat(p.rating),
  }));

  res.json(result);
});

router.get("/products/featured", async (req, res): Promise<void> => {
  const products = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.isFeatured, true))
    .orderBy(desc(productsTable.createdAt))
    .limit(6);

  const result = products.map((p) => ({
    ...p,
    price: parseFloat(p.price),
    originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
    rating: parseFloat(p.rating),
  }));

  res.json(result);
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const parsed = GetProductParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, parsed.data.id));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json({
    ...product,
    price: parseFloat(product.price),
    originalPrice: product.originalPrice ? parseFloat(product.originalPrice) : undefined,
    rating: parseFloat(product.rating),
  });
});

export default router;
