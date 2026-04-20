import { Router } from "express";
import { db, reviewsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { adminAuth, requirePermission } from "../middlewares/adminAuth";

const router = Router();

router.get("/reviews", async (_req, res): Promise<void> => {
  const reviews = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.status, "approved"))
    .orderBy(desc(reviewsTable.createdAt))
    .limit(100);
  res.json(reviews);
});

router.post("/reviews", async (req, res): Promise<void> => {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const title = String(body.title || "").trim();
  const reviewBody = String(body.body || "").trim();
  const rating = Math.min(5, Math.max(1, Number(body.rating) || 0));
  if (!name || !email || !reviewBody || !rating) {
    res.status(400).json({ success: false, message: "Name, email, review and rating are required (rating 1-5)." });
    return;
  }
  await db.insert(reviewsTable).values({
    name: name.slice(0, 100),
    email: email.slice(0, 200),
    rating,
    title: title ? title.slice(0, 200) : null,
    body: reviewBody.slice(0, 5000),
    postSlug: body.postSlug ? String(body.postSlug).trim().slice(0, 200) : null,
  });
  res.json({ success: true, message: "Thanks for your review! It'll appear after a quick check." });
});

router.get("/admin/reviews", adminAuth, requirePermission("inbox"), async (_req, res): Promise<void> => {
  const reviews = await db.select().from(reviewsTable).orderBy(desc(reviewsTable.createdAt));
  res.json(reviews);
});

router.patch("/admin/reviews/:id", adminAuth, requirePermission("inbox"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const status = String(req.body?.status || "");
  if (!["pending", "approved", "rejected"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const [updated] = await db.update(reviewsTable).set({ status }).where(eq(reviewsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/admin/reviews/:id", adminAuth, requirePermission("inbox"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(reviewsTable).where(eq(reviewsTable.id, id));
  res.status(204).end();
});

export default router;
