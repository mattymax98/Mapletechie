import { Router, type Request } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, postsTable, postRevisionsTable, auditLogsTable, type Post } from "@workspace/db";
import { adminAuth } from "../middlewares/adminAuth";
import { automationAuth } from "./automation";
import { cleanText, normalizeSocialEmbeds } from "./posts";
import { validateAutomationImages } from "./automation";
import { validateCoverImage } from "../lib/coverImageValidation";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { writeAuditLog, writeAuditLogForUser } from "../lib/audit";
import { submitToIndexNow, buildPostUrls } from "../lib/indexNow";

const router = Router();
const objectStorage = new ObjectStorageService();
const editable = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  excerpt: z.string().trim().min(1).max(2000).optional(),
  content: z.string().min(1).max(500_000).optional(),
  seoTitle: z.string().max(300).optional(),
  seoDescription: z.string().max(1000).optional(),
  coverImage: z.string().trim().min(1).max(2048).optional(),
  coverImageAlt: z.string().trim().min(1).max(1000).optional(),
  ogImage: z.string().trim().min(1).max(2048).optional(),
}).strict();
const proposal = z.object({
  changes: editable.refine((v) => Object.keys(v).length > 0, "Provide at least one editorial change"),
  updateNote: z.string().trim().max(1000).nullable().optional(),
}).strict();
type Changes = z.infer<typeof editable>;

function ownedImagePath(image: string): string | null {
  let path = image;
  if (/^https?:\/\//i.test(image)) {
    let url: URL;
    try { url = new URL(image); } catch { return null; }
    if (!["mapletechie.com", "www.mapletechie.com"].includes(url.hostname.toLowerCase()) || url.search || url.hash) return null;
    path = url.pathname;
  }
  return /^\/(?:api\/storage\/objects|covers)\/[^\s"'<>?#]+$/i.test(path) ? path : null;
}

/** Deliberately excludes routine counters, updated_at, and other non-editorial writes. */
export function editorialFingerprint(post: Post): string {
  return createHash("sha256").update(JSON.stringify([
    post.id, post.status, post.slug, post.publishedAt?.toISOString(), post.scheduledFor?.toISOString(),
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
function validateChanges(input: unknown, post: Post): { changes: Changes; updateNote: string | null } | { error: string } {
  const parsed = proposal.safeParse(input);
  if (!parsed.success) return { error: parsed.error.message };
  const changes = { ...parsed.data.changes };
  if (changes.content !== undefined) {
    const normalized = normalizeSocialEmbeds(changes.content, { automation: true });
    if (!normalized.html.trim()) return { error: "Content is empty after sanitization" };
    if (normalized.report.removed > 0) {
      return { error: "The revision contains unsupported, unsafe, or duplicate social embeds. Fix these before proposing an update." };
    }
    const imageError = validateAutomationImages(normalized.html);
    if (imageError) return { error: imageError };
    const existingSources = new Set([...post.content.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]));
    for (const match of normalized.html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
      if (!existingSources.has(match[1]) && !ownedImagePath(match[1])) {
        return { error: "Upload new article images to Mapletechie before proposing article HTML." };
      }
    }
    changes.content = normalized.html;
  }
  for (const field of ["coverImage", "ogImage"] as const) {
    const image = changes[field];
    if (image === undefined) continue;
    const path = ownedImagePath(image);
    if (!path) {
      return { error: `${field} must be a Mapletechie-owned upload or cover path.` };
    }
    const error = validateCoverImage(path);
    if (error) return { error };
    changes[field] = path;
  }
  if (changes.coverImageAlt !== undefined) {
    changes.coverImageAlt = cleanText(changes.coverImageAlt) ?? "";
    if (!changes.coverImageAlt) return { error: "Cover image alt text must be meaningful." };
  }
  if (changes.coverImage !== undefined && !changes.coverImageAlt && !cleanText(post.coverImageAlt)) {
    return { error: "Cover image alt text is required when replacing a cover without existing alt text." };
  }
  if (changes.coverImageAlt !== undefined && !changes.coverImage && !post.coverImage) {
    return { error: "Cannot set cover image alt text without a cover image." };
  }
  if (changes.seoTitle !== undefined) changes.seoTitle = cleanText(changes.seoTitle) ?? "";
  if (changes.seoDescription !== undefined) changes.seoDescription = cleanText(changes.seoDescription) ?? "";
  return { changes, updateNote: parsed.data.updateNote ? cleanText(parsed.data.updateNote) : null };
}

/** Check actual storage objects, not just the syntactic shape of an upload URL. */
async function verifyReplacementImages(changes: Changes, post: Post): Promise<{ error: string; status: number } | null> {
  const paths = new Set<string>();
  for (const image of [changes.coverImage, changes.ogImage]) {
    if (image?.startsWith("/api/storage/objects/")) paths.add(image);
  }
  if (changes.content !== undefined) {
    const existingSources = new Set([...post.content.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]));
    for (const match of changes.content.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
      if (existingSources.has(match[1])) continue;
      const path = ownedImagePath(match[1]);
      if (path?.startsWith("/api/storage/objects/")) paths.add(path);
    }
  }
  for (const path of paths) {
    try {
      const file = await objectStorage.getObjectEntityFile(path.slice("/api/storage".length));
      const [metadata] = await file.getMetadata();
      if (!metadata.contentType?.toLowerCase().startsWith("image/")) {
        return { status: 422, error: "Replacement upload is not an image." };
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return { status: 422, error: "Replacement image upload was not found. Upload it again before proposing the correction." };
      }
      return { status: 503, error: "Image storage could not be checked. Retry before proposing or approving this correction." };
    }
  }
  return null;
}

async function findRevisable(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const [post] = await db.select().from(postsTable).where(and(eq(postsTable.id, id), sql`${postsTable.status} IN ('published', 'scheduled')`));
  return post ?? null;
}

/** Connector and human submissions share the same strict, review-only path. */
export async function proposePostRevision(
  req: Request, postId: number, input: unknown, source: "connector" | "editor",
): Promise<{ status: number; body: Record<string, unknown> }> {
  const post = await findRevisable(postId);
  if (!post) return { status: 404, body: { error: "Published or scheduled post not found" } };
  if (source === "editor" && !canEdit(req.user, post)) return { status: 403, body: { error: "Forbidden" } };
  const validated = validateChanges(input, post);
  if ("error" in validated) return { status: 422, body: { error: validated.error } };
  const imageError = await verifyReplacementImages(validated.changes, post);
  if (imageError) return { status: imageError.status, body: { error: imageError.error } };
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
  const post = await findRevisable(Number(req.params.id));
  if (!post) { res.status(404).json({ error: "Published or scheduled post not found" }); return; }
  if (!canEdit(req.user, post)) { res.status(403).json({ error: "Forbidden" }); return; }
  const revisions = await db.select().from(postRevisionsTable).where(eq(postRevisionsTable.postId, post.id))
    .orderBy(desc(postRevisionsTable.createdAt));
  res.json({ live: post, revisions: revisions.map((r) => ({
    ...r, stale: editorialFingerprint(post) !== r.baseHash,
  })) });
});

router.put("/admin/posts/:id/revisions/:revisionId", adminAuth, async (req, res): Promise<void> => {
  const post = await findRevisable(Number(req.params.id));
  if (!post) { res.status(404).json({ error: "Published or scheduled post not found" }); return; }
  if (!canApprove(req.user, post)) { res.status(403).json({ error: "Approval permission required" }); return; }
  const [revision] = await db.select().from(postRevisionsTable).where(and(
    eq(postRevisionsTable.id, Number(req.params.revisionId)), eq(postRevisionsTable.postId, post.id),
  ));
  if (!revision || revision.status !== "pending") { res.status(404).json({ error: "Pending revision not found" }); return; }
  if (editorialFingerprint(post) !== revision.baseHash) {
    res.status(409).json({ error: "The live post changed. Reject this proposal and submit a new revision after reviewing the current version." }); return;
  }
  const validated = validateChanges(req.body, post);
  if ("error" in validated) { res.status(422).json({ error: validated.error }); return; }
  const imageError = await verifyReplacementImages(validated.changes, post);
  if (imageError) { res.status(imageError.status).json({ error: imageError.error }); return; }
  const [saved] = await db.update(postRevisionsTable)
    .set({ changes: validated.changes, updateNote: validated.updateNote })
    .where(and(eq(postRevisionsTable.id, revision.id), eq(postRevisionsTable.status, "pending")))
    .returning();
  if (!saved) { res.status(409).json({ error: "This proposal is no longer pending." }); return; }
  if (saved) await writeAuditLog(req, {
    action: "post.revision.edited", entityType: "post", entityId: post.id,
    summary: `Reviewed proposal for "${post.title}"`, details: { revisionId: revision.id, before: revision.changes, after: validated.changes },
  });
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
    if (!post || !["published", "scheduled"].includes(post.status)) return { status: 404, error: "Published or scheduled post not found" };
    if (!canApprove(req.user, post)) return { status: 403, error: "Approval permission required" };
    const [revision] = await tx.select().from(postRevisionsTable).where(and(
      eq(postRevisionsTable.id, revisionId), eq(postRevisionsTable.postId, postId),
    ));
    if (!revision || revision.status !== "pending") return { status: 404, error: "Pending revision not found" };
    if (action === "approve" && editorialFingerprint(post) !== revision.baseHash)
      return { status: 409, error: "The live post changed. Reject and propose a new revision after reviewing it." };
    if (action === "approve") {
      // Stored proposals were validated on entry; validate again in case of legacy/manual rows.
      const validated = validateChanges({ changes: revision.changes, updateNote: revision.updateNote }, post);
      if ("error" in validated) return { status: 422, error: validated.error };
      const imageError = await verifyReplacementImages(validated.changes, post);
      if (imageError) return imageError;
      const changed = Object.fromEntries(Object.entries(validated.changes).filter(([key, value]) =>
        value !== post[key as keyof Post],
      )) as Changes;
      if (!Object.keys(changed).length) return { status: 422, error: "No changes to approve" };
      const meaningful = post.status === "published" && (["title", "excerpt", "content"] as const)
        .some((key) => changed[key] !== undefined);
      await tx.update(postsTable).set({
        ...changed,
        ...(meaningful ? { contentModifiedAt: new Date(), updateNote: validated.updateNote } : {}),
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
  if (action === "approve" && outcome.post.status === "published") void submitToIndexNow(buildPostUrls({ slug: outcome.post.slug }));
  res.json({ status: action === "approve" ? "approved" : "rejected" });
});

export default router;