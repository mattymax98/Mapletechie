import { Router } from "express";
import { db, contactsTable } from "@workspace/db";
import { SubmitContactBody } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";
import { adminAuth, requirePermission } from "../middlewares/adminAuth";
import { contactLimiter } from "../middlewares/rateLimit";

const router = Router();

router.post("/contact", contactLimiter, async (req, res): Promise<void> => {
  const parsed = SubmitContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.message });
    return;
  }
  await db.insert(contactsTable).values(parsed.data);
  res.json({ success: true, message: "Thank you! We'll be in touch soon." });
});

router.get("/admin/contacts", adminAuth, requirePermission("inbox"), async (_req, res): Promise<void> => {
  const items = await db.select().from(contactsTable).orderBy(desc(contactsTable.createdAt));
  res.json(items);
});

router.delete("/admin/contacts/:id", adminAuth, requirePermission("inbox"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(contactsTable).where(eq(contactsTable.id, id));
  res.status(204).end();
});

export default router;
