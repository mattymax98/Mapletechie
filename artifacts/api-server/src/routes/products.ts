import { Router } from "express";
import { db, productsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ListProductsQueryParams, GetProductParams } from "@workspace/api-zod";
import { adminAuth, requirePermission } from "../middlewares/adminAuth";

const router = Router();

const mapProduct = (p: any) => ({
  ...p,
  price: parseFloat(p.price),
  originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
  rating: parseFloat(p.rating),
  currency: p.currency || "CAD",
});

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

  res.json(products.map(mapProduct));
});

router.get("/products/featured", async (req, res): Promise<void> => {
  const products = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.isFeatured, true))
    .orderBy(desc(productsTable.createdAt))
    .limit(6);

  res.json(products.map(mapProduct));
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
  res.json(mapProduct(product));
});

const SUPPORTED_CURRENCIES = ["CAD","USD","EUR","GBP","AUD","JPY","CNY","INR","NGN","ZAR","BRL","MXN","CHF","SEK","NOK","DKK","NZD","SGD","HKD","KRW"];

function sanitizeProductInput(body: any) {
  const currency = (body.currency || "CAD").toString().toUpperCase().trim();
  return {
    name: String(body.name || "").trim().slice(0, 200),
    description: String(body.description || "").trim().slice(0, 2000),
    price: String(body.price ?? "0"),
    originalPrice: body.originalPrice != null && body.originalPrice !== "" ? String(body.originalPrice) : null,
    currency: SUPPORTED_CURRENCIES.includes(currency) ? currency : "CAD",
    affiliateUrl: String(body.affiliateUrl || "").trim().slice(0, 1000),
    imageUrl: body.imageUrl ? String(body.imageUrl).trim().slice(0, 1000) : null,
    category: String(body.category || "gear").trim().slice(0, 100),
    rating: String(body.rating ?? "4.5"),
    reviewCount: Number(body.reviewCount ?? 0) | 0,
    badge: body.badge ? String(body.badge).trim().slice(0, 50) : null,
    isFeatured: Boolean(body.isFeatured),
  };
}

router.get("/admin/products", adminAuth, requirePermission("shop"), async (_req, res): Promise<void> => {
  const products = await db.select().from(productsTable).orderBy(desc(productsTable.createdAt));
  res.json(products.map(mapProduct));
});

router.post("/admin/products", adminAuth, requirePermission("shop"), async (req, res): Promise<void> => {
  try {
    const data = sanitizeProductInput(req.body);
    if (!data.name || !data.affiliateUrl) {
      res.status(400).json({ error: "Name and affiliate URL are required" });
      return;
    }
    const [created] = await db.insert(productsTable).values(data as any).returning();
    res.status(201).json(mapProduct(created));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create product" });
  }
});

router.put("/admin/products/:id", adminAuth, requirePermission("shop"), async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const data = sanitizeProductInput(req.body);
    const [updated] = await db.update(productsTable).set(data as any).where(eq(productsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(mapProduct(updated));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update product" });
  }
});

router.delete("/admin/products/:id", adminAuth, requirePermission("shop"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.status(204).end();
});

export default router;
