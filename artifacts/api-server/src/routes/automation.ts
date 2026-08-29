import { Router, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { db, postsTable, usersTable, automationRequestsTable, seriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { writeAuditLogForUser } from "../lib/audit";
import { validateCoverImage } from "../lib/coverImageValidation";
import { isExternalImageUrl, persistExternalImage, persistExternalImagesInHtml } from "../lib/persistExternalImage";
import { cleanHtml, cleanText } from "./posts";
import {
  resolveCategoriesForWrite,
  syncPostCategories,
  refreshCategoryPostCounts,
} from "../lib/postCategoryHelpers";
import { hashPassword } from "../lib/auth";
import { logger } from "../lib/logger";
import { notifyEditorsOfAutomationDraft } from "../lib/automationDraftNotification";

/**
 * Private automation draft API — lets an external AI client (run and
 * scheduled by an external service) submit blog post DRAFTS. Hard guarantees:
 *
 *  - Bearer-token auth against the AUTOMATION_DRAFT_TOKEN secret (401 otherwise).
 *  - Status is ALWAYS "draft"; there is no code path here that can publish.
 *  - Drafts are attributed to a dedicated bot author account, created on
 *    first use, so editors instantly recognize machine-submitted drafts.
 *  - Requests that try to control status/author/publish time are rejected
 *    with 422 instead of silently ignored — a misbehaving or compromised
 *    client must be visible, not papered over.
 *  - Optional Idempotency-Key header: a repeat request with the same key
 *    returns the original draft instead of creating a duplicate.
 *  - Every call, success or failure, writes an audit-log entry.
 */

const router = Router();

export const BOT_USERNAME = "mapletechie-ai";
const BOT_DISPLAY_NAME = "Mapletechie AI";

// Fields the client may send (camelCase, after normalization).
const ALLOWED_FIELDS = new Set([
  "title",
  "slug",
  "excerpt",
  "content",
  "coverImage",
  "coverImageAlt",
  "tags",
  "readTime",
  "categoryId",
  "category",
  "categories",
  "primaryCategory",
  "seoTitle",
  "seoDescription",
  "seoKeywords",
  "ogImage",
  "rating",
  "pros",
  "cons",
  "verdict",
  "seriesId",
  "seriesPosition",
]);

// Fields that are server-controlled or out of scope for v1. Submitting any of
// them is a 422 — never silently dropped.
const FORBIDDEN_FIELDS = new Set([
  "status",
  "author",
  "authorId",
  "authorAvatar",
  "publishedAt",
  "scheduledFor",
  "isFeatured",
]);

/** Map snake_case payload keys (the agreed external contract) to camelCase. */
const SNAKE_TO_CAMEL: Record<string, string> = {
  cover_image: "coverImage",
  cover_image_alt: "coverImageAlt",
  read_time: "readTime",
  category_id: "categoryId",
  primary_category: "primaryCategory",
  seo_title: "seoTitle",
  seo_description: "seoDescription",
  seo_keywords: "seoKeywords",
  og_image: "ogImage",
  author_id: "authorId",
  author_avatar: "authorAvatar",
  published_at: "publishedAt",
  scheduled_for: "scheduledFor",
  is_featured: "isFeatured",
  series_id: "seriesId",
  series_position: "seriesPosition",
};

function normalizeBody(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[SNAKE_TO_CAMEL[k] ?? k] = v;
  }
  return out;
}

const AUTOMATION_INTERNAL_IMAGE_RE = /^\/(?:api\/storage\/objects|covers)\/[^\s"'<>]+$/i;
const BACKFILL_ALLOWED_FIELDS = new Set(["postId", "slug", "content", "coverImageAlt"]);
const BACKFILL_SNAKE_TO_CAMEL: Record<string, string> = {
  post_id: "postId",
  cover_image_alt: "coverImageAlt",
};

function isSupportedAutomationImageSource(src: string): boolean {
  if (AUTOMATION_INTERNAL_IMAGE_RE.test(src)) return true;
  try {
    const parsed = new URL(src);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && !!parsed.hostname;
  } catch {
    return false;
  }
}

/**
 * Automation clients must provide accessible, editor-compatible image markup.
 * Run this after cleanHtml so unsupported schemes/attributes have already been
 * removed and cannot hide behind malformed source HTML.
 */
export function validateAutomationImages(html: string): string | null {
  const imageTags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (let index = 0; index < imageTags.length; index += 1) {
    const tag = imageTags[index];
    const imageNumber = index + 1;
    const src = tag.match(/\bsrc="([^"]+)"/i)?.[1]?.trim() ?? "";
    const alt = tag.match(/\balt="([^"]*)"/i)?.[1]
      ?.replace(/&(?:nbsp|#160|#xA0);/gi, " ")
      .trim() ?? "";

    if (!src || !isSupportedAutomationImageSource(src)) {
      return `Inline image ${imageNumber} has an unsupported or missing src. Use an http(s) URL, /api/storage/objects/... upload URL, or /covers/... path.`;
    }
    if (!alt) {
      return `Inline image ${imageNumber} is missing meaningful alt text. Every article image must include a non-empty alt attribute.`;
    }
  }
  return null;
}

function normalizeBackfillBody(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[BACKFILL_SNAKE_TO_CAMEL[key] ?? key] = value;
  }
  return out;
}

/** Constant-time bearer-token check against the AUTOMATION_DRAFT_TOKEN secret. */
export function automationAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.AUTOMATION_DRAFT_TOKEN;
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!secret || secret.length < 20) {
    // Fail closed if the secret is missing or suspiciously short.
    logger.error("automation: AUTOMATION_DRAFT_TOKEN missing or too short — endpoint disabled");
    void writeAuditLogForUser(req, null, {
      action: "automation.auth.failed",
      summary: "Automation draft request rejected: AUTOMATION_DRAFT_TOKEN not configured",
    });
    res.status(503).json({ error: "Automation API is not configured" });
    return;
  }
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    void writeAuditLogForUser(req, null, {
      action: "automation.auth.failed",
      summary: "Automation draft request rejected: invalid or missing bearer token",
    });
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/**
 * Find (or create on first use) the dedicated bot author account. The account
 * can never log in: its password is a random 48-byte secret that is hashed and
 * immediately discarded, and it has no admin/editor permissions.
 */
async function getBotUser() {
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, BOT_USERNAME));
  if (existing) return existing;
  const passwordHash = await hashPassword(randomBytes(48).toString("hex"));
  const [created] = await db
    .insert(usersTable)
    .values({
      username: BOT_USERNAME,
      passwordHash,
      displayName: BOT_DISPLAY_NAME,
      bio: "Automated draft author. Posts under this byline were submitted by the Mapletechie draft pipeline and are reviewed by a human editor before publishing.",
      role: "editor",
    })
    .onConflictDoNothing({ target: usersTable.username })
    .returning();
  if (created) return created;
  // Lost a create race — fetch the winner.
  const [row] = await db.select().from(usersTable).where(eq(usersTable.username, BOT_USERNAME));
  return row;
}

function editUrl(postId: number): string {
  const domain = process.env.SITE_DOMAIN || "https://mapletechie.com";
  return `${domain.replace(/\/$/, "")}/admin/posts/${postId}/edit`;
}

export interface DraftCreationResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Update only image-related fields on an existing post. This deliberately
 * avoids the general post update surface: the automation may backfill a live
 * article, but it can never change its author, status, slug, or publish time.
 */
export async function backfillAutomationPostImages(
  req: Request,
  rawBody: Record<string, unknown>,
): Promise<DraftCreationResult> {
  const botUser = await getBotUser();
  if (!botUser) {
    return { status: 500, body: { error: "Could not resolve the bot author account" } };
  }
  const bot = { id: botUser.id, username: botUser.username };
  const fail = async (statusCode: number, error: string): Promise<DraftCreationResult> => {
    await writeAuditLogForUser(req, bot, {
      action: "automation.post.backfill.rejected",
      entityType: "post",
      summary: `Automation image backfill rejected (${statusCode}): ${error}`,
      details: { postId: rawBody.post_id ?? rawBody.postId ?? null, slug: rawBody.slug ?? null },
    });
    return { status: statusCode, body: { error } };
  };

  const body = normalizeBackfillBody(rawBody);
  const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(rawBody, key);
  if (hasOwn("post_id") && hasOwn("postId")) {
    return fail(400, "Provide only one spelling of the target: post_id or postId");
  }
  if (hasOwn("cover_image_alt") && hasOwn("coverImageAlt")) {
    return fail(400, "Provide only one spelling of the cover alt field: cover_image_alt or coverImageAlt");
  }
  const unknown = Object.keys(body).filter((key) => !BACKFILL_ALLOWED_FIELDS.has(key));
  if (unknown.length > 0) {
    return fail(422, `Unknown field(s): ${unknown.join(", ")}`);
  }

  const suppliedPostId = hasOwn("post_id") || hasOwn("postId");
  const suppliedSlug = hasOwn("slug");
  if (suppliedPostId === suppliedSlug) {
    return fail(400, "Provide exactly one target: post_id or slug");
  }

  let target;
  if (suppliedPostId) {
    if (typeof body.postId !== "number" || !Number.isInteger(body.postId) || body.postId <= 0) {
      return fail(400, "Invalid post_id: must be a positive integer");
    }
    [target] = await db.select().from(postsTable).where(eq(postsTable.id, body.postId));
  } else {
    if (typeof body.slug !== "string" || !body.slug.trim()) {
      return fail(400, "Invalid slug: must be a non-empty string");
    }
    [target] = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.slug, String(body.slug).trim().toLowerCase()));
  }
  if (!target) {
    return fail(404, "Post not found");
  }

  const hasContent = Object.prototype.hasOwnProperty.call(body, "content");
  const hasCoverAlt = Object.prototype.hasOwnProperty.call(body, "coverImageAlt");
  if (!hasContent && !hasCoverAlt) {
    return fail(400, "Provide content and/or cover_image_alt to backfill");
  }

  const values: { content?: string; coverImageAlt?: string } = {};
  if (hasCoverAlt) {
    const coverImageAlt = cleanText(body.coverImageAlt);
    if (!coverImageAlt) {
      return fail(400, "cover_image_alt must be meaningful and non-empty");
    }
    if (!target.coverImage) {
      return fail(400, "cover_image_alt cannot be set because this post has no cover image");
    }
    values.coverImageAlt = coverImageAlt;
  }

  let sanitizedContent = "";
  if (hasContent) {
    if (typeof body.content !== "string" || !body.content.trim()) {
      return fail(400, "content must be a non-empty HTML string");
    }
    sanitizedContent = cleanHtml(body.content);
    const inlineImageError = validateAutomationImages(sanitizedContent);
    if (inlineImageError) {
      return fail(400, inlineImageError);
    }
    values.content = await persistExternalImagesInHtml(sanitizedContent, {
      uploaderId: botUser.id,
      uploaderName: botUser.displayName,
    });
  }

  const [updated] = await db
    .update(postsTable)
    .set(values)
    .where(eq(postsTable.id, target.id))
    .returning();
  if (!updated) {
    return fail(404, "Post no longer exists");
  }

  await writeAuditLogForUser(req, bot, {
    action: "automation.post.backfill",
    entityType: "post",
    entityId: target.id,
    summary: `Automation backfilled images on post "${target.title}"`,
    details: {
      updatedFields: Object.keys(values),
      previousAuthorId: target.authorId,
      previousStatus: target.status,
    },
  });

  return {
    status: 200,
    body: {
      id: updated.id,
      slug: updated.slug,
      status: updated.status,
      edit_url: editUrl(updated.id),
      updated_fields: Object.keys(values),
    },
  };
}

/**
 * Core draft-creation logic, shared by the raw HTTP endpoint and the MCP
 * connector. All invariants (draft-only, forbidden fields, idempotency,
 * bot authorship, audit trail) live HERE so both entry points behave
 * identically. `req` is only used for audit-log request metadata.
 */
export async function createAutomationDraft(
  req: Request,
  rawBody: Record<string, unknown>,
  idempotencyKey: string | null,
): Promise<DraftCreationResult> {
  const botUser = await getBotUser();
  if (!botUser) {
    return { status: 500, body: { error: "Could not resolve the bot author account" } };
  }
  const bot = { id: botUser.id, username: botUser.username };

  const fail = async (
    statusCode: number,
    error: string,
    details?: Record<string, unknown>,
  ): Promise<DraftCreationResult> => {
    await writeAuditLogForUser(req, bot, {
      action: "automation.draft.rejected",
      entityType: "post",
      summary: `Automation draft rejected (${statusCode}): ${error}`,
      details: { ...details, idempotencyKey, title: rawBody.title ?? null, slug: rawBody.slug ?? null },
    });
    return { status: statusCode, body: { error } };
  };

  const body = normalizeBody(rawBody);

  // Reject server-controlled fields loudly (422), per the agreed contract.
  const forbidden = Object.keys(body).filter((k) => FORBIDDEN_FIELDS.has(k));
  if (forbidden.length > 0) {
    return fail(
      422,
      `Forbidden field(s): ${forbidden.join(", ")}. The server controls status, author and publish time.`,
      { forbidden },
    );
  }
  const unknown = Object.keys(body).filter((k) => !ALLOWED_FIELDS.has(k));
  if (unknown.length > 0) {
    return fail(422, `Unknown field(s): ${unknown.join(", ")}`, { unknown });
  }

  // Idempotency replay: same key -> return the original draft, create nothing.
  if (idempotencyKey) {
    const [prior] = await db
      .select()
      .from(automationRequestsTable)
      .where(eq(automationRequestsTable.idempotencyKey, idempotencyKey));
    if (prior) {
      const [post] = await db.select().from(postsTable).where(eq(postsTable.id, prior.postId));
      if (post) {
        return { status: 200, body: { id: post.id, status: post.status, slug: post.slug, edit_url: editUrl(post.id), replayed: true } };
      }
      // Draft was deleted since — treat the key as spent.
      return fail(409, "This Idempotency-Key was already used, but the draft it created no longer exists.");
    }
  }

  // Required fields.
  for (const f of ["title", "slug", "content"] as const) {
    if (typeof body[f] !== "string" || !(body[f] as string).trim()) {
      return fail(400, `Missing field: ${f}`);
    }
  }
  // Categories: either `categories` (array of ids/slugs/names, first or
  // `primary_category` is primary) or legacy single `category_id`/`category`.
  const categoryInput = body.categoryId ?? body.category;
  if (body.categories == null && (categoryInput == null || (typeof categoryInput === "string" && !categoryInput.trim()))) {
    return fail(400, "Missing field: category_id (or categories)");
  }
  const resolvedCats = await resolveCategoriesForWrite({
    categories: body.categories,
    category: categoryInput,
    primaryCategory: body.primaryCategory,
  });
  if ("error" in resolvedCats) {
    return fail(400, resolvedCats.error);
  }
  const resolvedCategory = resolvedCats.primary;

  const slug = String(body.slug).trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 200) {
    return fail(400, "Invalid slug: use lowercase letters, digits and hyphens only");
  }
  const [slugClash] = await db.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.slug, slug));
  if (slugClash) {
    return fail(409, `A post with slug "${slug}" already exists`);
  }

  // Optional series placement: validate the series exists and the position is sane.
  let seriesId: number | null = null;
  let seriesPosition: number | null = null;
  if (body.seriesId != null) {
    const sid = body.seriesId;
    if (typeof sid !== "number" || !Number.isInteger(sid) || sid <= 0) {
      return fail(400, "Invalid series_id: must be a positive integer");
    }
    const [series] = await db.select({ id: seriesTable.id }).from(seriesTable).where(eq(seriesTable.id, sid));
    if (!series) {
      return fail(400, `Unknown series_id: ${sid}`);
    }
    seriesId = sid;
    if (body.seriesPosition != null) {
      const pos = body.seriesPosition;
      if (typeof pos !== "number" || !Number.isInteger(pos) || pos <= 0) {
        return fail(400, "Invalid series_position: must be a positive integer");
      }
      seriesPosition = pos;
    }
  } else if (body.seriesPosition != null) {
    return fail(400, "series_position requires series_id");
  }

  const coverError = validateCoverImage(body.coverImage);
  if (coverError) {
    return fail(400, coverError);
  }
  const ogImageError = validateCoverImage(body.ogImage);
  if (ogImageError) {
    return fail(400, ogImageError);
  }
  const coverImageAlt = cleanText(body.coverImageAlt);
  if (body.coverImage && !coverImageAlt) {
    return fail(400, "cover_image_alt is required when cover_image is provided");
  }
  if (!body.coverImage && coverImageAlt) {
    return fail(400, "cover_image_alt requires cover_image");
  }

  const sanitizedContent = cleanHtml(body.content);
  const inlineImageError = validateAutomationImages(sanitizedContent);
  if (inlineImageError) {
    return fail(400, inlineImageError);
  }

  // Re-host external images on our own storage (best-effort, SSRF-guarded).
  const persistCtx = { uploaderId: botUser.id, uploaderName: botUser.displayName };
  let coverImage = typeof body.coverImage === "string" ? body.coverImage : null;
  let ogImage = typeof body.ogImage === "string" ? body.ogImage : null;
  if (isExternalImageUrl(coverImage)) {
    coverImage = await persistExternalImage(coverImage, { ...persistCtx, alt: coverImageAlt });
  }
  if (isExternalImageUrl(ogImage)) ogImage = await persistExternalImage(ogImage, persistCtx);

  const toStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => cleanText(x)).filter((x): x is string => !!x) : [];

  const values = {
    title: String(body.title).trim().slice(0, 300),
    slug,
    excerpt: typeof body.excerpt === "string" ? body.excerpt.trim() : "",
    content: await persistExternalImagesInHtml(sanitizedContent, persistCtx),
    coverImage,
    coverImageAlt,
    categoryId: resolvedCategory.id,
    tags: toStringArray(body.tags),
    author: botUser.displayName,
    authorAvatar: botUser.avatarUrl ?? null,
    authorId: botUser.id,
    readTime: typeof body.readTime === "number" && Number.isFinite(body.readTime)
      ? Math.max(1, Math.min(60, Math.round(body.readTime)))
      : 5,
    isFeatured: false,
    seriesId,
    seriesPosition,
    status: "draft" as const, // always draft; this endpoint cannot publish
    rating:
      typeof body.rating === "number" && !Number.isNaN(body.rating)
        ? Math.max(0, Math.min(5, body.rating))
        : null,
    pros: toStringArray(body.pros),
    cons: toStringArray(body.cons),
    verdict: cleanText(body.verdict),
    seoTitle: cleanText(body.seoTitle),
    seoDescription: cleanText(body.seoDescription),
    seoKeywords: toStringArray(body.seoKeywords),
    ogImage,
    // Drafts are invisible to readers; this timestamp is refreshed by the
    // normal editor flow when a human publishes.
    publishedAt: new Date(),
  };

  // Insert the post and claim the idempotency key in ONE transaction: if two
  // concurrent requests race on the same key, the unique index on the ledger
  // makes exactly one commit; the loser rolls back its post and replays the
  // winner's draft. Without this, both could create drafts before either
  // recorded the key.
  const IDEMPOTENCY_LOST = Symbol("idempotency-lost");
  let inserted;
  try {
    inserted = await db.transaction(async (tx) => {
      const [post] = await tx.insert(postsTable).values(values).returning();
      await syncPostCategories(tx, post.id, resolvedCats.all.map((c) => c.id), resolvedCats.primary.id);
      await refreshCategoryPostCounts(tx, resolvedCats.all.map((c) => c.id));
      if (idempotencyKey) {
        const claimed = await tx
          .insert(automationRequestsTable)
          .values({ idempotencyKey, postId: post.id })
          .onConflictDoNothing({ target: automationRequestsTable.idempotencyKey })
          .returning();
        if (claimed.length === 0) throw IDEMPOTENCY_LOST;
      }
      return post;
    });
  } catch (err) {
    if (err === IDEMPOTENCY_LOST && idempotencyKey) {
      const [prior] = await db
        .select()
        .from(automationRequestsTable)
        .where(eq(automationRequestsTable.idempotencyKey, idempotencyKey));
      if (prior) {
        const [post] = await db.select().from(postsTable).where(eq(postsTable.id, prior.postId));
        if (post) {
          return { status: 200, body: { id: post.id, status: post.status, slug: post.slug, edit_url: editUrl(post.id), replayed: true } };
        }
      }
      return fail(409, "A concurrent request with the same Idempotency-Key won the race; retry to fetch it");
    }
    logger.error({ err }, "automation: draft insert failed");
    return fail(409, "Could not create the draft (possibly a duplicate slug)");
  }

  await writeAuditLogForUser(req, bot, {
    action: "automation.draft.create",
    entityType: "post",
    entityId: inserted.id,
    summary: `Automation created draft "${inserted.title}"`,
    details: { idempotencyKey, snapshot: inserted },
  });

  // Best-effort editor notification — never blocks or fails the response.
  void notifyEditorsOfAutomationDraft({
    postId: inserted.id,
    title: inserted.title,
    excerpt: inserted.excerpt,
    editUrl: editUrl(inserted.id),
  });

  return {
    status: 201,
    body: {
      id: inserted.id,
      status: inserted.status,
      slug: inserted.slug,
      edit_url: editUrl(inserted.id),
    },
  };
}

router.post("/automation/posts/drafts", automationAuth, async (req, res): Promise<void> => {
  const rawBody = (req.body ?? {}) as Record<string, unknown>;
  const idempotencyKeyHeader = req.headers["idempotency-key"];
  const idempotencyKey =
    typeof idempotencyKeyHeader === "string" && idempotencyKeyHeader.trim()
      ? idempotencyKeyHeader.trim().slice(0, 200)
      : null;
  const result = await createAutomationDraft(req, rawBody, idempotencyKey);
  res.status(result.status).json(result.body);
});

router.post("/automation/posts/backfill", automationAuth, async (req, res): Promise<void> => {
  const result = await backfillAutomationPostImages(req, (req.body ?? {}) as Record<string, unknown>);
  res.status(result.status).json(result.body);
});

export default router;
