import { Router } from "express";
import { db, commentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { adminAuth, requirePermission } from "../middlewares/adminAuth";
import { writeAuditLog } from "../lib/audit";
import { commentLimiter } from "../middlewares/rateLimit";

const router = Router();

// Public: list approved comments for a given post slug (?postSlug=...)
router.get("/comments", async (req, res): Promise<void> => {
  const slug = String(req.query.postSlug || "").trim().toLowerCase();
  if (!slug) {
    res.status(400).json({ error: "postSlug required" });
    return;
  }
  const rows = await db
    .select({
      id: commentsTable.id,
      postSlug: commentsTable.postSlug,
      name: commentsTable.name,
      email: commentsTable.email,
      body: commentsTable.body,
      status: commentsTable.status,
      createdAt: commentsTable.createdAt,
    })
    .from(commentsTable)
    .where(and(eq(commentsTable.postSlug, slug), eq(commentsTable.status, "approved")))
    .orderBy(desc(commentsTable.createdAt));
  // Hide email in public response
  res.json(rows.map((r) => ({ ...r, email: null })));
});

// Public: submit a new comment (pending approval)
router.post("/comments", commentLimiter, async (req, res): Promise<void> => {
  const body = req.body || {};
  const slug = String(body.postSlug || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const text = String(body.body || "").trim();
  if (!slug || !name || !email || !text) {
    res.status(400).json({ success: false, message: "Name, email, and comment are required." });
    return;
  }
  if (text.length > 4000) {
    res.status(400).json({ success: false, message: "Comment is too long (max 4000 chars)." });
    return;
  }
  await db.insert(commentsTable).values({
    postSlug: slug.slice(0, 200),
    name: name.slice(0, 100),
    email: email.slice(0, 200),
    body: text,
  });
  res.json({ success: true, message: "Thanks! Your comment will appear once approved." });
});

// Admin: list all comments
router.get("/admin/comments", adminAuth, requirePermission("inbox"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(commentsTable).orderBy(desc(commentsTable.createdAt));
  res.json(rows);
});

// Admin: approve / reject / pending
router.patch("/admin/comments/:id", adminAuth, requirePermission("inbox"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const status = String(req.body?.status || "");
  if (!["pending", "approved", "rejected"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const [updated] = await db.update(commentsTable).set({ status }).where(eq(commentsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await writeAuditLog(req, {
    action: status === "approved" ? "comment.approve" : status === "rejected" ? "comment.reject" : "comment.pending",
    entityType: "comment",
    entityId: id,
    summary: `${status} comment by ${updated.name} on /${updated.postSlug}`,
  });
  res.json(updated);
});

router.delete("/admin/comments/:id", adminAuth, requirePermission("inbox"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db.select().from(commentsTable).where(eq(commentsTable.id, id));
  await db.delete(commentsTable).where(eq(commentsTable.id, id));
  if (existing) {
    await writeAuditLog(req, {
      action: "comment.delete",
      entityType: "comment",
      entityId: id,
      summary: `Deleted comment by ${existing.name} on /${existing.postSlug}`,
    });
  }
  res.status(204).end();
});

export default router;
