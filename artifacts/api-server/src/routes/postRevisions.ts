import { Router, type Request } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, postsTable, postRevisionsTable, auditLogsTable, type Post } from "@workspace/db";
import { adminAuth } from "../middlewares/adminAuth";
import { automationAuth } from "./automation";
import { cleanText, normalizeSocialEmbeds } from "./posts";
import { validateAutomationImages } from "./automation";
import { writeAuditLog, writeAuditLogForUser } from "../lib/audit";
import { submitToIndexNow, buildPostUrls } from "../lib/indexNow";

const router = Router();
const editable = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  excerpt: z.string().trim().min(1).max(2000).optional(),
  content: z.string().min(1).max(500_000).optional(),
  seoTitle: z.string().max(300).optional(),
  seoDescription: z.string().max(1000).optional(),
}).strict();
const proposal = z.object({
  changes: editable.refine((v) => Object.keys(v).length > 0, "Provide at least one editorial change"),
  updateNote: z.string().trim().max(1000).nullable().optional(),
}).strict();
type Changes = z.infer<typeof editable>;

/** Deliberately excludes routine counters, updated_at, and other non-editorial writes. */
export function editorialFingerprint(post: Post): string {
  return createHash("sha256").update(JSON.stringify([
    post.id, post.status, post.slug, post.publishedAt?.toISOString(),
    post.authorId, post.author, post.authorAvatar,
    post.title, post.excerpt, post.content, post.coverImage, post.coverImageAlt,
    post.categoryId, post.tags, post.ogImage, post.readTime,
    post.rating, post.pros, post.cons, post.verdict,
    post.seriesId, post.seriesPosition, post.clusterId, post.clusterRole,
    post.seoTitle, post.seoDescription, post.contentModifiedAt?.toISOString(),
  ])).digest("hex");
}

function canEdit(user: Request["user"], post: Post): boolean {
  return !!user && (user.role === "admin" || !!user.canEditOthersPosts || post.authorId === user.id);
}
function canApprove(user: Request["user"], post: Post): boolean {
  return canEdit(user, post) && (user?.role === "admin" || user?.canPublishDirectly === true);
}
function validateChanges(input: unknown): { changes: Changes; updateNote: string | null } | { error: string } {
  const parsed = proposal.safeParse(input);
  if (!parsed.success) return { error: parsed.error.message };
  const changes = { ...parsed.data.changes };
  if (!["title", "excerpt", "content"].some((key) => key in changes)) {
    return { error: "A substantive title, summary, or article-body change is required; SEO-only changes do not establish editorial freshness." };
  }
  if (changes.content !== undefined) {
    const normalized = normalizeSocialEmbeds(changes.content, { automation: true });
    if (!normalized.html.trim()) return { error: "Content is empty after sanitization" };
    if (normalized.report.removed > 0) {
      return { error: "The revision contains unsupported, unsafe, or duplicate social embeds. Fix these before proposing an update." };
    }
    const imageError = validateAutomationImages(normalized.html);
    if (imageError) return { error: imageError };
    changes.content = normalized.html;
  }
  if (changes.seoTitle !== undefined) changes.seoTitle = cleanText(changes.seoTitle) ?? "";
  if (changes.seoDescription !== undefined) changes.seoDescription = cleanText(changes.seoDescription) ?? "";
  return { changes, updateNote: parsed.data.updateNote ? cleanText(parsed.data.updateNote) : null };
}

async function findPublished(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const [post] = await db.select().from(postsTable).where(and(eq(postsTable.id, id), eq(postsTable.status, "published")));
  return post ?? null;
}

/** Connector and human submissions share the same strict, review-only path. */
export async function proposePostRevision(
  req: Request, postId: number, input: unknown, source: "connector" | "editor",
): Promise<{ status: number; body: Record<string, unknown> }> {
  const post = await findPublished(postId);
  if (!post) return { status: 404, body: { error: "Published post not found" } };
  if (source === "editor" && !canEdit(req.user, post)) return { status: 403, body: { error: "Forbidden" } };
  const validated = validateChanges(input);
  if ("error" in validated) return { status: 422, body: { error: validated.error } };
  const [revision] = await db.insert(postRevisionsTable).values({
    postId, baseHash: editorialFingerprint(post), changes: validated.changes,
    updateNote: validated.updateNote, source, proposedBy: source === "editor" ? req.user?.id ?? null : null,
  }).returning();
  if (source === "editor") await writeAuditLog(req, {
    action: "post.revision.proposed", entityType: "post", entityId: postId,
    summary: `Proposed revision for "${post.title}"`, details: { revisionId: revision.id },
  });
  else await writeAuditLogForUser(req, null, {
    action: "automation.post.revision.proposed", entityType: "post", entityId: postId,
    summary: `Connector proposed revision for "${post.title}"`, details: { revisionId: revision.id },
  });
  return { status: 201, body: { revision, reviewUrl: `/admin/posts/${postId}/edit` } };
}

router.post("/admin/posts/:id/revisions", adminAuth, async (req, res) => {
  const result = await proposePostRevision(req, Number(req.params.id), req.body, "editor");
  res.status(result.status).json(result.body);
});

router.post("/automation/posts/:id/revisions", automationAuth, async (req, res) => {
  const result = await proposePostRevision(req, Number(req.params.id), req.body, "connector");
  res.status(result.status).json(result.body);
});

router.get("/admin/posts/:id/revisions", adminAuth, async (req, res): Promise<void> => {
  const post = await findPublished(Number(req.params.id));
  if (!post) { res.status(404).json({ error: "Published post not found" }); return; }
  if (!canEdit(req.user, post)) { res.status(403).json({ error: "Forbidden" }); return; }
  const revisions = await db.select().from(postRevisionsTable).where(eq(postRevisionsTable.postId, post.id))
    .orderBy(desc(postRevisionsTable.createdAt));
  res.json({ live: post, revisions: revisions.map((r) => ({
    ...r, stale: editorialFingerprint(post) !== r.baseHash,
  })) });
});

router.put("/admin/posts/:id/revisions/:revisionId", adminAuth, async (req, res): Promise<void> => {
  const post = await findPublished(Number(req.params.id));
  if (!post) { res.status(404).json({ error: "Published post not found" }); return; }
  if (!canApprove(req.user, post)) { res.status(403).json({ error: "Approval permission required" }); return; }
  const [revision] = await db.select().from(postRevisionsTable).where(and(
    eq(postRevisionsTable.id, Number(req.params.revisionId)), eq(postRevisionsTable.postId, post.id),
  ));
  if (!revision || revision.status !== "pending") { res.status(404).json({ error: "Pending revision not found" }); return; }
  if (editorialFingerprint(post) !== revision.baseHash) {
    res.status(409).json({ error: "The live post changed. Reject this proposal and submit a new revision after reviewing the current version." }); return;
  }
  const validated = validateChanges(req.body);
  if ("error" in validated) { res.status(422).json({ error: validated.error }); return; }
  const [saved] = await db.update(postRevisionsTable)
    .set({ changes: validated.changes, updateNote: validated.updateNote })
    .where(and(eq(postRevisionsTable.id, revision.id), eq(postRevisionsTable.status, "pending")))
    .returning();
  res.json(saved);
});

router.post("/admin/posts/:id/revisions/:revisionId/:action", adminAuth, async (req, res): Promise<void> => {
  const { action } = req.params;
  if (action !== "approve" && action !== "reject") { res.status(404).json({ error: "Unknown action" }); return; }
  const postId = Number(req.params.id), revisionId = Number(req.params.revisionId);
  if (!Number.isSafeInteger(postId) || !Number.isSafeInteger(revisionId)) {
    res.status(400).json({ error: "Invalid ID" }); return;
  }
  const outcome = await db.transaction(async (tx) => {
    // Lock the post before reading the revision; concurrent edits/approvals serialize here.
    await tx.execute(sql`SELECT id FROM posts WHERE id = ${postId} FOR UPDATE`);
    const [post] = await tx.select().from(postsTable).where(eq(postsTable.id, postId));
    if (!post || post.status !== "published") return { status: 404, error: "Published post not found" };
    if (!canApprove(req.user, post)) return { status: 403, error: "Approval permission required" };
    const [revision] = await tx.select().from(postRevisionsTable).where(and(
      eq(postRevisionsTable.id, revisionId), eq(postRevisionsTable.postId, postId),
    ));
    if (!revision || revision.status !== "pending") return { status: 404, error: "Pending revision not found" };
    if (action === "approve" && editorialFingerprint(post) !== revision.baseHash)
      return { status: 409, error: "The live post changed. Reject and propose a new revision after reviewing it." };
    if (action === "approve") {
      // Stored proposals were validated on entry; validate again in case of legacy/manual rows.
      const validated = validateChanges({ changes: revision.changes, updateNote: revision.updateNote });
      if ("error" in validated) return { status: 422, error: validated.error };
      const meaningful = (["title", "excerpt", "content"] as const)
        .some((key) => validated.changes[key] !== undefined && validated.changes[key] !== post[key]);
      if (!meaningful) return { status: 422, error: "No editorial changes to approve" };
      await tx.update(postsTable).set({
        ...validated.changes,
        contentModifiedAt: new Date(),
        updateNote: validated.updateNote,
      }).where(eq(postsTable.id, postId));
    }
    await tx.update(postRevisionsTable).set({
      status: action === "approve" ? "approved" : "rejected",
      reviewedAt: new Date(), reviewedBy: req.user!.id,
    }).where(eq(postRevisionsTable.id, revisionId));
    await tx.insert(auditLogsTable).values({
      userId: req.user!.id, username: req.user!.username,
      action: `post.revision.${action === "approve" ? "approved" : "rejected"}`,
      entityType: "post", entityId: String(postId),
      summary: `${action === "approve" ? "Approved" : "Rejected"} revision for "${post.title}"`,
      details: { revisionId, before: action === "approve" ? post : undefined, changes: revision.changes, updateNote: revision.updateNote },
    });
    return { status: 200, post };
  });
  if ("error" in outcome) { res.status(outcome.status).json({ error: outcome.error }); return; }
  if (action === "approve") void submitToIndexNow(buildPostUrls({ slug: outcome.post.slug }));
  res.json({ status: action === "approve" ? "approved" : "rejected" });
});

export default router;