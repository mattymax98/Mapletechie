import { Router } from "express";
import { db, adInquiriesTable, contactsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { adminAuth, requirePermission } from "../middlewares/adminAuth";
import { applicationsTable, reviewsTable, commentsTable } from "@workspace/db";
import { adInquiryLimiter } from "../middlewares/rateLimit";

const router = Router();

router.post("/advertise", adInquiryLimiter, async (req, res): Promise<void> => {
  const body = req.body || {};
  const companyName = String(body.companyName || "").trim();
  const contactName = String(body.contactName || "").trim();
  const email = String(body.email || "").trim();
  const adType = String(body.adType || "").trim();
  const message = String(body.message || "").trim();
  if (!companyName || !contactName || !email || !adType || !message) {
    res.status(400).json({ success: false, message: "Required fields are missing" });
    return;
  }
  await db.insert(adInquiriesTable).values({
    companyName: companyName.slice(0, 200),
    contactName: contactName.slice(0, 200),
    email: email.slice(0, 200),
    website: body.website ? String(body.website).trim().slice(0, 500) : null,
    adType: adType.slice(0, 100),
    budget: body.budget ? String(body.budget).trim().slice(0, 100) : null,
    message: message.slice(0, 5000),
    creativeUrl: body.creativeUrl ? String(body.creativeUrl).trim().slice(0, 1000) : null,
  });
  res.json({ success: true, message: "Got it. We'll review your inquiry and reply within 2 business days." });
});

router.get("/admin/ad-inquiries", adminAuth, requirePermission("inbox"), async (_req, res): Promise<void> => {
  const inquiries = await db.select().from(adInquiriesTable).orderBy(desc(adInquiriesTable.createdAt));
  res.json(inquiries);
});

router.delete("/admin/ad-inquiries/:id", adminAuth, requirePermission("inbox"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(adInquiriesTable).where(eq(adInquiriesTable.id, id));
  res.status(204).end();
});

router.get("/admin/inbox-counts", adminAuth, requirePermission("inbox"), async (_req, res): Promise<void> => {
  const [apps] = await db.select({ c: sql<number>`count(*)::int` }).from(applicationsTable);
  const [revs] = await db.select({ c: sql<number>`count(*)::int` }).from(reviewsTable).where(eq(reviewsTable.status, "pending"));
  const [ads] = await db.select({ c: sql<number>`count(*)::int` }).from(adInquiriesTable);
  const [contacts] = await db.select({ c: sql<number>`count(*)::int` }).from(contactsTable);
  const [comments] = await db.select({ c: sql<number>`count(*)::int` }).from(commentsTable).where(eq(commentsTable.status, "pending"));
  res.json({
    applications: apps?.c || 0,
    reviews: revs?.c || 0,
    adInquiries: ads?.c || 0,
    contacts: contacts?.c || 0,
    comments: comments?.c || 0,
  });
});

export default router;
