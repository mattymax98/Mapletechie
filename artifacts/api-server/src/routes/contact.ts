import { Router } from "express";
import { db, contactsTable } from "@workspace/db";
import { SubmitContactBody } from "@workspace/api-zod";

const router = Router();

router.post("/contact", async (req, res): Promise<void> => {
  const parsed = SubmitContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.message });
    return;
  }
  await db.insert(contactsTable).values(parsed.data);
  res.json({ success: true, message: "Thank you! We'll be in touch soon." });
});

export default router;
