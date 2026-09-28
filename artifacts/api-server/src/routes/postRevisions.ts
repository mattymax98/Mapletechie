import { Router, type Request } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, notExists, or, sql } from "drizzle-orm";
import { db, postsTable, postRevisionsTable, auditLogsTable, type Post } from "@workspace/db";
import { adminAuth } from "../middlewares/adminAuth";
import { automationAuth } from "./automation";
import { cleanText, normalizeSocialEmbeds } from "./posts";
import { validateAutomationImages } from "./automation";
import { validateCoverImage } from "../lib/coverImageValidation";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { submitToIndexNow, buildPostUrls } from "../lib/indexNow";
import { publicUpdateSummary } from "../lib/publicUpdateHistory";

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
const queueQuery = z.object({
  status: z.literal("pending").default("pending"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
const historyQuery = z.object({
  status: z.enum(["all", "approved", "rejected", "superseded"]).default("all"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(120).optional(),
}).strict();
type Changes = z.infer<typeof editable>;
type HistoryFields = keyof Changes;
type HistoryValues = Partial<Record<HistoryFields, unknown>>;
const historyFields: HistoryFields[] = [
  "title", "excerpt", "content", "coverImage", "coverImageAlt", "ogImage", "seoTitle", "seoDescription",
];
const decisionActions = ["post.revision.approved", "post.revision.rejected", "post.revision.superseded"] as const;
const proposalActions = ["post.revision.proposed", "automation.post.revision.proposed"] as const;

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
function approvalScope(user: Request["user"]): { all: true } | { all: false; authorId: number } | null {
  if (user?.role === "admin") return { all: true };
  if (!user || user.canPublishDirectly !== true) return null;
  return user.canEditOthersPosts ? { all: true } : { all: false, authorId: user.id };
}
function canApprove(user: Request["user"], post: Pick<Post, "authorId">): boolean {
  const scope = approvalScope(user);
  return !!scope && (scope.all || scope.authorId === post.authorId);
}
function historyScope(user: Request["user"]): { all: true } | { all: false; authorId: number } | null {
  if (user?.role === "admin" || user?.canEditOthersPosts) return { all: true };
  return user ? { all: false, authorId: user.id } : null;
}
function editorialSnapshot(post: Post): HistoryValues {
  return Object.fromEntries(historyFields.map((field) => [field, post[field] ?? null])) as HistoryValues;
}
function completePostSnapshot(post: Post): Record<string, unknown> {
  return Object.fromEntries(Object.entries(post).map(([key, value]) => [
    key,
    value instanceof Date ? value.toISOString() : value,
  ]));
}
function pickHistoryValues(value: unknown): HistoryValues | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const selected = Object.fromEntries(historyFields.filter((field) => field in record).map((field) => [field, record[field]]));
  return Object.keys(selected).length ? selected as HistoryValues : null;
}
function historyFieldUnion(...values: unknown[]): HistoryFields[] {
  const fields = new Set<string>();
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const field of historyFields) if (field in value) fields.add(field);
    }
  }
  return historyFields.filter((field) => fields.has(field));
}
function valuesForHistoryFields(
  fields: HistoryFields[],
  preferred: HistoryValues | null,
  fallback: HistoryValues | null,
): HistoryValues | null {
  const values = Object.fromEntries(fields.flatMap((field) => {
    if (preferred && field in preferred) return [[field, preferred[field]]];
    if (fallback && field in fallback) return [[field, fallback[field]]];
    return [];
  })) as HistoryValues;
  return Object.keys(values).length ? values : null;
}
function changedHistoryValues(before: HistoryValues | null, after: HistoryValues | null): HistoryValues | null {
  if (!before || !after) return null;
  const changed = Object.fromEntries(Object.entries(after).filter(([key, value]) =>
    !(key in before) || JSON.stringify(before[key as HistoryFields]) !== JSON.stringify(value),
  ));
  return Object.keys(changed).length ? changed as HistoryValues : null;
}
function auditEvent(
  req: Request,
  user: { id: number; username: string } | null,
  action: string,
  postId: number,
  summary: string,
  details: Record<string, unknown>,
) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = typeof forwarded === "string" && forwarded.length
    ? forwarded.split(",")[0]!.trim()
    : req.ip ?? req.socket?.remoteAddress ?? null;
  return {
    userId: user?.id ?? null,
    username: user?.username ?? null,
    action,
    entityType: "post",
    entityId: String(postId),
    summary,
    details: details as never,
    ip,
    userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
  };
}
function detailsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function numericValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
function proposalActorName(details: Record<string, unknown>, auditUsername: unknown): string | null {
  const proposer = detailsOf(details.proposer);
  const candidates = [
    details.proposerName,
    details.proposedByName,
    proposer.displayName,
    proposer.username,
    details.proposerUsername,
    details.username,
    auditUsername,
  ];
  return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0) ?? null;
}
function isoDate(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "string" && value.length) return value;
  return null;
}
/** Matches posts.ts legacy-history protection: only authored post lifecycle snapshots count. */
function revisablePostPredicate() {
  return sql`(
    ${postsTable.status} IN ('published', 'scheduled')
    OR (
      ${postsTable.status} = 'draft'
      AND (
        ${postsTable.publishedOnceAt} IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM audit_logs
          WHERE audit_logs.entity_type = 'post'
            AND audit_logs.entity_id = ${postsTable.id}::text
            AND audit_logs.action IN ('post.create', 'post.update', 'post.delete', 'post.restore')
            AND (
              audit_logs.details->'snapshot'->>'status' = 'published'
              OR NULLIF(audit_logs.details->'snapshot'->>'publishedOnceAt', '') IS NOT NULL
              OR audit_logs.details->'before'->>'status' = 'published'
              OR NULLIF(audit_logs.details->'before'->>'publishedOnceAt', '') IS NOT NULL
              OR audit_logs.details->'after'->>'status' = 'published'
              OR NULLIF(audit_logs.details->'after'->>'publishedOnceAt', '') IS NOT NULL
            )
        )
      )
    )
  )`;
}
function revisableStatus(post: Pick<Post, "status">): boolean {
  return post.status === "published" || post.status === "scheduled" || post.status === "draft";
}
export function auditPostIdExpression() {
  const value = sql`COALESCE(${auditLogsTable.details}->>'postId', ${auditLogsTable.entityId})`;
  return sql<number | null>`CASE WHEN (${value}) ~ '^[0-9]+$' THEN (${value})::integer ELSE NULL END`;
}
export function auditRevisionIdExpression() {
  const value = sql`${auditLogsTable.details}->>'revisionId'`;
  return sql<number | null>`CASE WHEN (${value}) ~ '^[0-9]+$' THEN (${value})::integer ELSE NULL END`;
}
export function withoutTerminalDecision() {
  return notExists(db.select({ id: auditLogsTable.id }).from(auditLogsTable).where(and(
    inArray(auditLogsTable.action, decisionActions),
    eq(auditRevisionIdExpression(), postRevisionsTable.id),
  )));
}
export function withoutCoveringLaterApproval() {
  return sql`NOT EXISTS (
    SELECT 1
    FROM audit_logs AS later_decision
    JOIN post_revisions AS later_revision
      ON later_revision.id = CASE
        WHEN (later_decision.details->>'revisionId') ~ '^[0-9]+$'
          THEN (later_decision.details->>'revisionId')::integer
        ELSE NULL
      END
    WHERE later_decision.action = 'post.revision.approved'
      AND later_revision.post_id = ${postRevisionsTable.postId}
      AND (
        later_revision.created_at > ${postRevisionsTable.createdAt}
        OR (
          later_revision.created_at = ${postRevisionsTable.createdAt}
          AND later_revision.id > ${postRevisionsTable.id}
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_object_keys(${postRevisionsTable.changes}) AS pending_field(field)
        WHERE NOT (
          COALESCE(later_decision.details->'appliedChanges', later_revision.changes)
          ? pending_field.field
        )
      )
  )`;
}
function decisionStatus(action: string): "approved" | "rejected" | "superseded" | null {
  return action === "post.revision.approved" ? "approved"
    : action === "post.revision.rejected" ? "rejected"
    : action === "post.revision.superseded" ? "superseded" : null;
}
function historyItem(row: any, proposalAudit?: any, relatedAudits: any[] = []) {
  const details = detailsOf(row.audit.details);
  const proposalDetails = detailsOf(proposalAudit?.details);
  const before = detailsOf(details.before);
  const summaryTitle = typeof row.audit.summary === "string"
    ? row.audit.summary.match(/revision for ["“](.*)["”]$/)?.[1]
    : null;
  const revisionId = numericValue(details.revisionId) ?? row.revision?.id ?? null;
  const postId = numericValue(details.postId) ?? numericValue(row.audit.entityId) ?? row.revision?.postId ?? null;
  const status = decisionStatus(row.audit.action);
  const editValues = relatedAudits.flatMap(({ details: editDetails }) => {
    const edit = detailsOf(editDetails);
    return [edit.before, edit.after];
  });
  const computedFields = historyFieldUnion(
    details.originalChanges,
    details.reviewerChanges,
    details.finalChanges,
    details.appliedChanges,
    details.changes,
    proposalDetails.originalChanges,
    proposalDetails.changes,
    ...editValues,
  );
  const recordedFields = Array.isArray(details.fields)
    ? details.fields.filter((field: unknown): field is HistoryFields => typeof field === "string" && historyFields.includes(field as HistoryFields))
    : [];
  const fields = [...new Set([...recordedFields, ...computedFields])];
  const legacySource = proposalAudit?.action === "automation.post.revision.proposed" ? "connector"
    : proposalAudit?.action === "post.revision.proposed" ? "editor" : null;
  return {
    id: revisionId,
    postId,
    title: (typeof details.postTitle === "string" ? details.postTitle : null)
      ?? (typeof proposalDetails.postTitle === "string" ? proposalDetails.postTitle : null)
      ?? (typeof before.title === "string" ? before.title : null)
      ?? row.post?.title
      ?? summaryTitle
      ?? "Untitled article",
    currentStatus: row.post?.status ?? "deleted",
    source: (typeof details.source === "string" ? details.source : null)
      ?? (typeof proposalDetails.source === "string" ? proposalDetails.source : null)
      ?? row.revision?.source
      ?? legacySource,
    proposedByName: proposalActorName(details, null) ?? proposalActorName(proposalDetails, proposalAudit?.username),
    createdAt: (typeof details.proposedAt === "string" ? details.proposedAt : null)
      ?? (typeof proposalDetails.proposedAt === "string" ? proposalDetails.proposedAt : null)
      ?? proposalAudit?.createdAt
      ?? row.revision?.createdAt
      ?? null,
    reviewedByName: status === "superseded" ? null : row.audit.username ?? null,
    supersededByRevisionId: status === "superseded" ? numericValue(details.supersededByRevisionId) : null,
    supersededByName: status === "superseded" ? row.audit.username ?? null : null,
    reviewedAt: (typeof details.reviewedAt === "string" ? details.reviewedAt : null)
      ?? row.audit.createdAt,
    status,
    fields,
    updateNote: (typeof details.updateNote === "string" ? details.updateNote : null)
      ?? row.revision?.updateNote
      ?? (typeof proposalDetails.updateNote === "string" ? proposalDetails.updateNote : null)
      ?? null,
  };
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
  const [post] = await db.select().from(postsTable).where(and(eq(postsTable.id, id), revisablePostPredicate()));
  return post ?? null;
}

/** Connector and human submissions share the same strict, review-only path. */
export async function proposePostRevision(
  req: Request, postId: number, input: unknown, source: "connector" | "editor",
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!Number.isSafeInteger(postId) || postId < 1) return { status: 400, body: { error: "Invalid post ID" } };
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM posts WHERE id = ${postId} FOR UPDATE`);
    const [post] = await tx.select().from(postsTable)
      // The new offline-correction path is for editors; connector proposals
      // keep their existing published/scheduled-only contract.
      .where(and(eq(postsTable.id, postId), source === "editor"
        ? revisablePostPredicate()
        : sql`${postsTable.status} IN ('published', 'scheduled')`));
    if (!post) return { status: 404, error: "Revisable post not found" };
    if (source === "editor" && !canEdit(req.user, post)) return { status: 403, error: "Forbidden" };
    const validated = validateChanges(input, post);
    if ("error" in validated) return { status: 422, error: validated.error };
    if (source === "connector" && post.status === "published" &&
        (["title", "excerpt", "content"] as const).some((key) =>
          validated.changes[key] !== undefined && validated.changes[key] !== post[key]) &&
        (!validated.updateNote || publicUpdateSummary(validated.updateNote) === "Article updated")) {
      return { status: 422, error: "A useful plain-text public update summary is required for a substantive published correction." };
    }
    const imageError = await verifyReplacementImages(validated.changes, post);
    if (imageError) return { status: imageError.status, error: imageError.error };
    const [revision] = await tx.insert(postRevisionsTable).values({
      postId,
      baseHash: editorialFingerprint(post),
      changes: validated.changes,
      updateNote: validated.updateNote,
      source,
      proposedBy: source === "editor" ? req.user?.id ?? null : null,
    }).returning();
    const actor = source === "editor" && req.user
      ? { id: req.user.id, username: req.user.username }
      : null;
    const action = source === "editor" ? "post.revision.proposed" : "automation.post.revision.proposed";
    await tx.insert(auditLogsTable).values(auditEvent(
      req,
      actor,
      action,
      postId,
      `${source === "editor" ? "Proposed" : "Connector proposed"} revision for "${post.title}"`,
      {
        eventVersion: 1,
        revisionId: revision.id,
        postId,
        postTitle: post.title,
        postStatus: post.status,
        authorId: post.authorId,
        authorName: post.author,
        source,
        proposerName: source === "connector"
          ? "Connector"
          : req.user?.displayName || req.user?.username || null,
        proposedAt: isoDate(revision.createdAt),
        before: editorialSnapshot(post),
        postSnapshot: completePostSnapshot(post),
        originalChanges: validated.changes,
        updateNote: validated.updateNote,
      },
    ));
    return { status: 201, revision };
  });
  if ("error" in outcome) return { status: outcome.status, body: { error: outcome.error } };
  return { status: 201, body: { revision: outcome.revision, reviewUrl: `/admin/posts/${postId}/edit` } };
}

router.post("/admin/posts/:id/revisions", adminAuth, async (req, res) => {
  const result = await proposePostRevision(req, Number(req.params.id), req.body, "editor");
  res.status(result.status).json(result.body);
});

router.post("/automation/posts/:id/revisions", automationAuth, async (req, res) => {
  const result = await proposePostRevision(req, Number(req.params.id), req.body, "connector");
  res.status(result.status).json(result.body);
});

router.get("/admin/revisions", adminAuth, async (req, res): Promise<void> => {
  const parsed = queueQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid review queue filters" });
    return;
  }
  const { page, pageSize } = parsed.data;
  res.setHeader("Cache-Control", "private, no-store");
  const scope = approvalScope(req.user);
  if (!scope) {
    res.json({ items: [], total: 0, pendingCount: 0, page, pageSize });
    return;
  }
  // Both SQL queries use the policy backing canApprove; still verify every
  // returned row with canApprove before serializing any article metadata.
  const predicate = and(
    eq(postRevisionsTable.status, "pending"),
    revisablePostPredicate(),
    scope.all ? undefined : eq(postsTable.authorId, scope.authorId),
    withoutTerminalDecision(),
    withoutCoveringLaterApproval(),
  );
  const [totalRow] = await db.select({ value: count() })
    .from(postRevisionsTable)
    .innerJoin(postsTable, eq(postRevisionsTable.postId, postsTable.id))
    .where(predicate);
  const total = totalRow?.value ?? 0;
  const rows = total === 0 ? [] : await db.select({ revision: postRevisionsTable, post: postsTable })
    .from(postRevisionsTable)
    .innerJoin(postsTable, eq(postRevisionsTable.postId, postsTable.id))
    .where(predicate)
    .orderBy(desc(postRevisionsTable.createdAt), desc(postRevisionsTable.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const items = rows.filter(({ post, revision }) =>
    revision.status === "pending" &&
    revisableStatus(post) &&
    canApprove(req.user, post))
    .map(({ post, revision }) => ({
      id: revision.id,
      postId: post.id,
      title: post.title,
      postStatus: post.status,
      publishedAt: post.publishedAt,
      scheduledFor: post.scheduledFor,
      source: revision.source,
      createdAt: revision.createdAt,
      fields: Object.keys(revision.changes),
      stale: editorialFingerprint(post) !== revision.baseHash,
    }));
  res.json({ items, total, pendingCount: total, page, pageSize });
});

router.get("/admin/revisions/history", adminAuth, async (req, res): Promise<void> => {
  const parsed = historyQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid revision history filters" });
    return;
  }
  const { status, page, pageSize, search } = parsed.data;
  res.setHeader("Cache-Control", "private, no-store");
  const scope = historyScope(req.user);
  if (!scope) {
    res.json({ items: [], total: 0, page, pageSize });
    return;
  }

  const postId = auditPostIdExpression();
  const revisionId = auditRevisionIdExpression();
  const filters = [inArray(auditLogsTable.action, decisionActions)];
  if (status !== "all") filters.push(eq(auditLogsTable.action, `post.revision.${status}`));
  if (req.user?.role !== "admin") filters.push(isNotNull(postsTable.id));
  if (!scope.all) filters.push(eq(postsTable.authorId, scope.authorId));
  if (search) {
    const pattern = `%${search}%`;
    const searchPredicate = or(
      ilike(sql<string>`COALESCE(${auditLogsTable.details}->>'postTitle', ${auditLogsTable.details}->'before'->>'title', ${postsTable.title}, ${auditLogsTable.summary}, '')`, pattern),
      ilike(auditLogsTable.entityId, pattern),
    );
    if (searchPredicate) filters.push(searchPredicate);
  }
  const predicate = and(...filters);
  const [totalRow] = await db.select({ value: count() })
    .from(auditLogsTable)
    .leftJoin(postsTable, eq(postsTable.id, postId))
    .where(predicate);
  const total = totalRow?.value ?? 0;
  const rows = total === 0 ? [] : await db.select({
    audit: auditLogsTable,
    post: postsTable,
    revision: postRevisionsTable,
  })
    .from(auditLogsTable)
    .leftJoin(postsTable, eq(postsTable.id, postId))
    .leftJoin(postRevisionsTable, eq(postRevisionsTable.id, revisionId))
    .where(predicate)
    .orderBy(desc(auditLogsTable.createdAt), desc(auditLogsTable.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const visibleRows = rows
    .filter((row) => decisionStatus(row.audit.action) && (scope.all || (row.post && canEdit(req.user, row.post)))
      && (row.post || req.user?.role === "admin"));
  const revisionIds = visibleRows
    .map(({ audit, revision: activeRevision }) =>
      numericValue(detailsOf(audit.details).revisionId) ?? activeRevision?.id ?? null)
    .filter((id): id is number => id !== null);
  const relatedEvents = revisionIds.length ? await db.select({ audit: auditLogsTable })
    .from(auditLogsTable)
    .where(and(
      inArray(auditLogsTable.action, [...proposalActions, "post.revision.edited"]),
      inArray(auditRevisionIdExpression(), revisionIds),
    ))
    .orderBy(asc(auditLogsTable.id)) : [];
  const proposalByRevision = new Map<number, any>();
  const editsByRevision = new Map<number, any[]>();
  for (const { audit } of relatedEvents) {
    const id = numericValue(detailsOf(audit.details).revisionId);
    if (id === null) continue;
    if (proposalActions.includes(audit.action as typeof proposalActions[number])) {
      if (!proposalByRevision.has(id)) proposalByRevision.set(id, audit);
    } else if (audit.action === "post.revision.edited") {
      const edits = editsByRevision.get(id) ?? [];
      edits.push(audit);
      editsByRevision.set(id, edits);
    }
  }
  const items = visibleRows.map((row) => {
    const id = numericValue(detailsOf(row.audit.details).revisionId) ?? row.revision?.id ?? null;
    return historyItem(row, id === null ? undefined : proposalByRevision.get(id), id === null ? [] : editsByRevision.get(id));
  });
  res.json({ items, total, page, pageSize });
});

router.get("/admin/revisions/history/:revisionId", adminAuth, async (req, res): Promise<void> => {
  const revisionId = Number(req.params.revisionId);
  if (!Number.isSafeInteger(revisionId) || revisionId < 1) {
    res.status(400).json({ error: "Invalid revision ID" });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  const revisionIdExpression = auditRevisionIdExpression();
  const postIdExpression = auditPostIdExpression();
  const [decision] = await db.select({
    audit: auditLogsTable,
    post: postsTable,
    revision: postRevisionsTable,
  })
    .from(auditLogsTable)
    .leftJoin(postsTable, eq(postsTable.id, postIdExpression))
    .leftJoin(postRevisionsTable, eq(postRevisionsTable.id, revisionIdExpression))
    .where(and(
      inArray(auditLogsTable.action, decisionActions),
      eq(revisionIdExpression, revisionId),
    ))
    .orderBy(desc(auditLogsTable.id))
    .limit(1);
  if (!decision || !decisionStatus(decision.audit.action)) {
    res.status(404).json({ error: "Revision history entry not found" });
    return;
  }
  const isAdmin = req.user?.role === "admin";
  if (!decision.post && !isAdmin) {
    res.status(404).json({ error: "Revision history entry not found" });
    return;
  }
  if (decision.post && !canEdit(req.user, decision.post)) {
    res.status(404).json({ error: "Revision history entry not found" });
    return;
  }

  const events = await db.select({ audit: auditLogsTable })
    .from(auditLogsTable)
    .where(and(
      inArray(auditLogsTable.action, [...proposalActions, "post.revision.edited"]),
      eq(revisionIdExpression, revisionId),
    ))
    .orderBy(asc(auditLogsTable.id));
  const proposalEvent = events.find(({ audit }) => proposalActions.includes(audit.action as typeof proposalActions[number]));
  const proposalDetails = detailsOf(proposalEvent?.audit.details);
  const decisionDetails = detailsOf(decision.audit.details);
  const isApproved = decision.audit.action === "post.revision.approved";
  const before = pickHistoryValues(proposalDetails.before)
    ?? (isApproved ? pickHistoryValues(decisionDetails.before) : null);
  const proposed = pickHistoryValues(proposalDetails.originalChanges);
  const storedFinal = isApproved
    ? pickHistoryValues(decisionDetails.finalChanges) ?? pickHistoryValues(decisionDetails.changes)
    : null;
  const reviewerEditAudits = events
    .filter(({ audit }) => audit.action === "post.revision.edited")
    .map(({ audit }) => audit);
  const reviewerValues = reviewerEditAudits.flatMap((audit) => {
    const details = detailsOf(audit.details);
    return [details.before, details.after];
  });
  const fieldUnion = historyFieldUnion(
    proposed,
    decisionDetails.originalChanges,
    decisionDetails.reviewerChanges,
    decisionDetails.changes,
    storedFinal,
    decisionDetails.appliedChanges,
    ...reviewerValues,
  );
  const final = isApproved ? valuesForHistoryFields(fieldUnion, storedFinal, before) : null;
  const applied = isApproved
    ? pickHistoryValues(decisionDetails.appliedChanges) ?? changedHistoryValues(before, final)
    : null;
  const reviewerEdits = reviewerEditAudits.map((audit) => {
      const details = detailsOf(audit.details);
      return {
        before: pickHistoryValues(details.before),
        after: pickHistoryValues(details.after),
        reviewedAt: audit.createdAt,
        reviewedByName: audit.username ?? null,
      };
    });
  const item = historyItem(decision, proposalEvent?.audit, reviewerEditAudits);
  res.json({
    ...item,
    before,
    proposed,
    final,
    applied,
    reviewerEdits,
    completeness: {
      before: before !== null,
      proposed: proposed !== null,
      final: final !== null,
    },
  });
});

router.get("/admin/posts/:id/revisions", adminAuth, async (req, res): Promise<void> => {
  const post = await findRevisable(Number(req.params.id));
  if (!post) { res.status(404).json({ error: "Published or scheduled post not found" }); return; }
  if (!canEdit(req.user, post)) { res.status(403).json({ error: "Forbidden" }); return; }
  const revisions = await db.select().from(postRevisionsTable).where(eq(postRevisionsTable.postId, post.id))
    .orderBy(desc(postRevisionsTable.createdAt));
  const revisionIds = revisions.map((revision) => revision.id);
  const terminalAudits = revisionIds.length ? await db.select({
    id: auditLogsTable.id,
    action: auditLogsTable.action,
    details: auditLogsTable.details,
  }).from(auditLogsTable).where(and(
    inArray(auditLogsTable.action, decisionActions),
    inArray(auditRevisionIdExpression(), revisionIds),
  )).orderBy(desc(auditLogsTable.id)) : [];
  const terminalStatusByRevision = new Map<number, Exclude<ReturnType<typeof decisionStatus>, null>>();
  const terminalDetailsByRevision = new Map<number, Record<string, unknown>>();
  for (const audit of terminalAudits) {
    const details = detailsOf(audit.details);
    const id = numericValue(details.revisionId);
    const status = decisionStatus(audit.action);
    if (id !== null && status && !terminalStatusByRevision.has(id)) {
      terminalStatusByRevision.set(id, status);
      terminalDetailsByRevision.set(id, details);
    }
  }
  const effectiveStatus = (revision: typeof revisions[number]) => {
    const terminal = terminalStatusByRevision.get(revision.id);
    if (terminal) return { status: terminal, supersededByRevisionId: null as number | null };
    if (revision.status !== "pending") return { status: revision.status, supersededByRevisionId: null as number | null };
    const revisionFields = Object.keys(revision.changes);
    const laterApproved = revisions.find((candidate) => {
      const candidateStatus = terminalStatusByRevision.get(candidate.id) ?? candidate.status;
      const isLater = candidate.createdAt.getTime() > revision.createdAt.getTime() ||
        (candidate.createdAt.getTime() === revision.createdAt.getTime() && candidate.id > revision.id);
      const decisionDetails = terminalDetailsByRevision.get(candidate.id);
      const appliedChanges = decisionDetails ? detailsOf(decisionDetails.appliedChanges) : {};
      const coveringChanges = Object.keys(appliedChanges).length ? appliedChanges : candidate.changes;
      return candidateStatus === "approved" && isLater &&
        revisionFields.every((field) => Object.hasOwn(coveringChanges, field));
    });
    return laterApproved
      ? { status: "superseded", supersededByRevisionId: laterApproved.id }
      : { status: revision.status, supersededByRevisionId: null as number | null };
  };
  res.json({ live: post, revisions: revisions.map((r) => ({
    ...r,
    ...effectiveStatus(r),
    stale: editorialFingerprint(post) !== r.baseHash,
  })) });
});

router.put("/admin/posts/:id/revisions/:revisionId", adminAuth, async (req, res): Promise<void> => {
  const postId = Number(req.params.id);
  const revisionId = Number(req.params.revisionId);
  if (!Number.isSafeInteger(postId) || postId < 1 || !Number.isSafeInteger(revisionId) || revisionId < 1) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM posts WHERE id = ${postId} FOR UPDATE`);
    const [post] = await tx.select().from(postsTable)
      .where(and(eq(postsTable.id, postId), revisablePostPredicate()));
    if (!post) return { status: 404, error: "Revisable post not found" };
    if (!canApprove(req.user, post)) return { status: 403, error: "Approval permission required" };
    const [revision] = await tx.select().from(postRevisionsTable)
      .where(and(eq(postRevisionsTable.id, revisionId), eq(postRevisionsTable.postId, post.id)))
      .for("update");
    if (!revision || revision.status !== "pending") return { status: 404, error: "Pending revision not found" };
    if (editorialFingerprint(post) !== revision.baseHash) {
      return { status: 409, error: "The live post changed. Reject this proposal and submit a new revision after reviewing the current version." };
    }
    const validated = validateChanges(req.body, post);
    if ("error" in validated) return { status: 422, error: validated.error };
    const imageError = await verifyReplacementImages(validated.changes, post);
    if (imageError) return { status: imageError.status, error: imageError.error };
    const [saved] = await tx.update(postRevisionsTable)
      .set({ changes: validated.changes, updateNote: validated.updateNote })
      .where(and(eq(postRevisionsTable.id, revision.id), eq(postRevisionsTable.status, "pending")))
      .returning();
    if (!saved) return { status: 409, error: "This proposal is no longer pending." };
    await tx.insert(auditLogsTable).values(auditEvent(
      req,
      req.user ? { id: req.user.id, username: req.user.username } : null,
      "post.revision.edited",
      post.id,
      `Reviewed proposal for "${post.title}"`,
      {
        eventVersion: 1,
        revisionId: revision.id,
        postId: post.id,
        before: revision.changes,
        after: validated.changes,
        updateNoteBefore: revision.updateNote,
        updateNoteAfter: validated.updateNote,
      },
    ));
    return { status: 200, revision: saved };
  });
  if ("error" in outcome) {
    res.status(outcome.status).json({ error: outcome.error });
    return;
  }
  res.json(outcome.revision);
});

router.post("/admin/posts/:id/revisions/:revisionId/:action", adminAuth, async (req, res): Promise<void> => {
  const { action } = req.params;
  if (action !== "approve" && action !== "reject") { res.status(404).json({ error: "Unknown action" }); return; }
  if (action === "approve" && req.body?.publishUpdateSummary !== undefined &&
      req.body.publishUpdateSummary !== true && req.body.publishUpdateSummary !== false) {
    res.status(422).json({ error: "Invalid public summary approval" }); return;
  }
  const postId = Number(req.params.id), revisionId = Number(req.params.revisionId);
  if (!Number.isSafeInteger(postId) || !Number.isSafeInteger(revisionId)) {
    res.status(400).json({ error: "Invalid ID" }); return;
  }
  const outcome = await db.transaction(async (tx) => {
    // Lock the post before reading the revision; concurrent edits/approvals serialize here.
    await tx.execute(sql`SELECT id FROM posts WHERE id = ${postId} FOR UPDATE`);
    const [post] = await tx.select().from(postsTable)
      .where(and(eq(postsTable.id, postId), revisablePostPredicate()));
    if (!post) return { status: 404, error: "Revisable post not found" };
    if (!canApprove(req.user, post)) return { status: 403, error: "Approval permission required" };
    const [revision] = await tx.select().from(postRevisionsTable).where(and(
      eq(postRevisionsTable.id, revisionId), eq(postRevisionsTable.postId, postId),
    )).for("update");
    if (!revision || revision.status !== "pending") return { status: 404, error: "Pending revision not found" };
    if (action === "approve" && editorialFingerprint(post) !== revision.baseHash)
      return { status: 409, error: "The live post changed. Reject and propose a new revision after reviewing it." };
    let validatedChanges: Changes | null = null;
    let validatedNote = revision.updateNote;
    let appliedChanges: Changes | null = null;
    let resultingPost = post;
    const reviewedAt = new Date();
    let postUpdate: Partial<Post> | null = null;
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
      if (meaningful && req.body?.publishUpdateSummary === true &&
          publicUpdateSummary(validated.updateNote) === "Article updated") {
        return { status: 422, error: "A safe, specific reader-facing summary is required before publishing it." };
      }
      postUpdate = {
        ...changed,
        ...(meaningful ? { contentModifiedAt: reviewedAt, updateNote: validated.updateNote } : {}),
      };
      validatedChanges = validated.changes;
      validatedNote = validated.updateNote;
      appliedChanges = changed;
    }
    const [transitioned] = await tx.update(postRevisionsTable).set({
      status: action === "approve" ? "approved" : "rejected",
      reviewedAt, reviewedBy: req.user!.id,
    }).where(and(
      eq(postRevisionsTable.id, revisionId),
      eq(postRevisionsTable.status, "pending"),
      withoutTerminalDecision(),
    )).returning();
    if (!transitioned) return { status: 409, error: "This proposal is no longer pending or has already been reviewed." };
    if (postUpdate) {
      const [updatedPost] = await tx.update(postsTable)
        .set(postUpdate)
        .where(eq(postsTable.id, postId))
        .returning();
      if (!updatedPost) throw new Error("Updated article state could not be captured for revision history.");
      resultingPost = updatedPost;
    }
    const revisionEvents = await tx.select({
      action: auditLogsTable.action,
      details: auditLogsTable.details,
    })
      .from(auditLogsTable)
      .where(and(
        inArray(auditLogsTable.action, [...proposalActions, "post.revision.edited"]),
        eq(auditRevisionIdExpression(), revisionId),
      ))
      .orderBy(asc(auditLogsTable.id));
    const proposalAudit = revisionEvents.find(({ action }) => proposalActions.includes(action as typeof proposalActions[number]));
    const proposalDetails = detailsOf(proposalAudit?.details);
    const reviewerChanges = revisionEvents
      .filter(({ action }) => action === "post.revision.edited")
      .map(({ details }) => {
        const edit = detailsOf(details);
        return {
          before: pickHistoryValues(edit.before),
          after: pickHistoryValues(edit.after),
        };
      });
    const before = pickHistoryValues(proposalDetails.before)
      ?? (action === "approve" ? editorialSnapshot(post) : null);
    const originalChanges = pickHistoryValues(proposalDetails.originalChanges);
    const fieldUnion = historyFieldUnion(
      originalChanges,
      revision.changes,
      validatedChanges,
      appliedChanges,
      ...reviewerChanges.flatMap(({ before: editBefore, after }) => [editBefore, after]),
    );
    const finalValues = action === "approve"
      ? valuesForHistoryFields(fieldUnion, validatedChanges, before)
      : null;
    const actor = { id: req.user!.id, username: req.user!.username };
    await tx.insert(auditLogsTable).values(auditEvent(
      req,
      actor,
      `post.revision.${action === "approve" ? "approved" : "rejected"}`,
      postId,
      `${action === "approve" ? "Approved" : "Rejected"} revision for "${post.title}"`,
      {
        eventVersion: 1,
        revisionId,
        postId,
        postTitle: post.title,
        postStatus: post.status,
        publicSummaryApproved: action === "approve" && post.status === "published" &&
          req.body?.publishUpdateSummary === true && appliedChanges !== null &&
          (["title", "excerpt", "content"] as const).some((field) => Object.hasOwn(appliedChanges, field)),
        authorId: post.authorId,
        authorName: post.author,
        source: revision.source,
        proposerName: typeof proposalDetails.proposerName === "string" ? proposalDetails.proposerName : null,
        proposedAt: typeof proposalDetails.proposedAt === "string" ? proposalDetails.proposedAt : isoDate(revision.createdAt),
        reviewedAt: reviewedAt.toISOString(),
        fields: fieldUnion,
        originalChanges,
        reviewerChanges,
        before,
        postSnapshot: proposalDetails.postSnapshot ?? null,
        changes: revision.changes,
        finalChanges: finalValues,
        appliedChanges,
        after: action === "approve" ? editorialSnapshot(resultingPost) : null,
        postAfterSnapshot: action === "approve" ? completePostSnapshot(resultingPost) : null,
        updateNote: action === "approve" ? validatedNote : revision.updateNote,
      },
    ));
    if (action === "approve") {
      // The post lock serializes approvals and proposals for this article. A
      // sibling that was already stale before this decision stays pending for
      // manual review; only this approval's newly invalidated bases are closed.
      const previousHash = editorialFingerprint(post);
      const nextHash = editorialFingerprint(resultingPost);
      if (nextHash !== previousHash) {
        const siblings = await tx.select().from(postRevisionsTable).where(and(
          eq(postRevisionsTable.postId, postId),
          eq(postRevisionsTable.status, "pending"),
          withoutTerminalDecision(),
        )).for("update");
        const approvedFields = new Set(Object.keys(appliedChanges ?? {}));
        for (const sibling of siblings) {
          if (sibling.postId !== postId || sibling.id === revisionId) continue;
          const newlyInvalidatedBase = sibling.baseHash === previousHash && sibling.baseHash !== nextHash;
          const siblingIsOlder = sibling.createdAt.getTime() < revision.createdAt.getTime() ||
            (sibling.createdAt.getTime() === revision.createdAt.getTime() && sibling.id < revision.id);
          const coveredByNewerApproval = siblingIsOlder &&
            Object.keys(sibling.changes).every((field) => approvedFields.has(field as HistoryFields));
          if (!newlyInvalidatedBase && !coveredByNewerApproval) continue;
          // Supersession is a durable terminal audit decision. Keep the legacy
          // row status as pending for compatibility with production databases
          // whose original check constraint only allows pending/approved/rejected.
          // All actionable read paths exclude terminal audit decisions.
          await tx.insert(auditLogsTable).values(auditEvent(
            req, actor, "post.revision.superseded", postId,
            `Automatically superseded revision for "${post.title}"`,
            {
              eventVersion: 1, revisionId: sibling.id, supersededByRevisionId: revisionId,
              supersessionReason: newlyInvalidatedBase
                ? "base-invalidated"
                : "newer-approved-fields-cover-proposal",
              postId, postTitle: post.title, source: sibling.source,
              proposedAt: isoDate(sibling.createdAt), reviewedAt: reviewedAt.toISOString(),
              fields: Object.keys(sibling.changes), changes: sibling.changes,
              updateNote: sibling.updateNote,
            },
          ));
        }
      }
    }
    return { status: 200, post: resultingPost };
  });
  if ("error" in outcome) { res.status(outcome.status).json({ error: outcome.error }); return; }
  if (action === "approve" && outcome.post.status === "published") void submitToIndexNow(buildPostUrls({ slug: outcome.post.slug }));
  res.json({ status: action === "approve" ? "approved" : "rejected" });
});

export default router;
