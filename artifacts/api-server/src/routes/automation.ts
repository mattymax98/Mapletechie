import { Router, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual, randomBytes, createHmac } from "node:crypto";
import {
  db,
  postsTable,
  usersTable,
  categoriesTable,
  postCategoriesTable,
  automationRequestsTable,
  seriesTable,
} from "@workspace/db";
import { asc, desc, eq } from "drizzle-orm";
import { writeAuditLogForUser } from "../lib/audit";
import { validateCoverImage } from "../lib/coverImageValidation";
import {
  collectExternalImageUrls,
  isExternalImageUrl,
  persistExternalImage,
  persistExternalImagesInHtml,
} from "../lib/persistExternalImage";
import { cleanText, normalizeSocialEmbeds } from "./posts";
import {
  resolveCategoriesForWrite,
  syncPostCategories,
  refreshCategoryPostCounts,
} from "../lib/postCategoryHelpers";
import { hashPassword } from "../lib/auth";
import { logger } from "../lib/logger";
import { notifyEditorsOfAutomationDraft } from "../lib/automationDraftNotification";
import { getSiteUrl } from "../lib/siteUrl";

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
const BACKFILL_ALLOWED_FIELDS = new Set([
  "postId",
  "slug",
  "content",
  "coverImage",
  "coverImageAlt",
  "ogImage",
]);
const BACKFILL_SNAKE_TO_CAMEL: Record<string, string> = {
  post_id: "postId",
  cover_image: "coverImage",
  cover_image_alt: "coverImageAlt",
  og_image: "ogImage",
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
  const domain = getSiteUrl();
  return `${domain.replace(/\/$/, "")}/admin/posts/${postId}/edit`;
}

export interface DraftCreationResult {
  status: number;
  body: Record<string, unknown>;
}

/** Stable, public connector representation of a post.  Never expose the
 * database row directly: this keeps camelCase/schema changes out of the MCP
 * contract and makes replay responses indistinguishable from fresh creates. */
export function canonicalMapletechiePost(post: Record<string, any>): Record<string, unknown> {
  const value = (v: unknown) => v instanceof Date ? v.toISOString() : v ?? null;
  const categories = Array.isArray(post.categories)
    ? post.categories.map((category: Record<string, unknown>) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        is_primary: category.is_primary === true || category.isPrimary === true || category.id === post.categoryId,
      }))
    : [];
  return {
    id: post.id, title: post.title, slug: post.slug, excerpt: post.excerpt ?? "",
    content: post.content ?? "", cover_image: value(post.coverImage),
    cover_image_alt: value(post.coverImageAlt), categories,
    tags: post.tags ?? [], author: post.author, author_avatar: value(post.authorAvatar),
    author_id: value(post.authorId), status: post.status,
    scheduled_for: value(post.scheduledFor), seo_title: value(post.seoTitle),
    seo_description: value(post.seoDescription), seo_keywords: post.seoKeywords ?? [],
    og_image: value(post.ogImage), read_time: post.readTime, view_count: post.viewCount,
    is_featured: post.isFeatured, series_id: value(post.seriesId),
    series_position: value(post.seriesPosition), rating: value(post.rating),
    pros: post.pros ?? [], cons: post.cons ?? [], verdict: value(post.verdict),
    embed_report: post.embedReport ?? null,
    published_at: value(post.publishedAt), created_at: value(post.createdAt),
    updated_at: value(post.updatedAt),
  };
}

export function previewSiteUrl(path: string): string {
  const base = getSiteUrl().replace(/^http:/i, "https:").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

const PREVIEW_TTL_SECONDS = 10 * 60;
function previewSecret(): string | null {
  const secret = process.env.PREVIEW_TOKEN_SECRET || process.env.AUTOMATION_DRAFT_TOKEN;
  return secret && secret.length >= 20 ? secret : null;
}
function signPreviewPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
export function issuePostPreviewToken(postId: number, width: number, height: number): { token: string; expiresAt: Date } | null {
  const secret = previewSecret();
  if (!secret) return null;
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_SECONDS * 1000);
  const payload = `${postId}.${Math.floor(expiresAt.getTime() / 1000)}.${width}.${height}`;
  return { token: `${Buffer.from(payload).toString("base64url")}.${signPreviewPayload(payload, secret)}`, expiresAt };
}
export function verifyPostPreviewToken(token: string, postId: number): { width: number; height: number; expiresAt: Date } | null {
  const secret = previewSecret();
  if (!secret) return null;
  const tokenParts = token.split(".");
  if (tokenParts.length !== 2) return null;
  const [encoded, signature] = tokenParts;
  if (!encoded || !signature) return null;
  let payload: string;
  try { payload = Buffer.from(encoded, "base64url").toString("utf8"); } catch { return null; }
  const payloadParts = payload.split(".");
  if (payloadParts.length !== 4) return null;
  const expected = signPreviewPayload(payload, secret);
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [id, exp, w, h] = payloadParts.map(Number);
  if (id !== postId || !Number.isInteger(exp) || exp <= Math.floor(Date.now() / 1000) ||
      !Number.isInteger(w) || !Number.isInteger(h) || w < 320 || w > 3000 || h < 240 || h > 3000) return null;
  return { width: w, height: h, expiresAt: new Date(exp * 1000) };
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
  if (hasOwn("cover_image") && hasOwn("coverImage")) {
    return fail(400, "Provide only one spelling of the cover image field: cover_image or coverImage");
  }
  if (hasOwn("og_image") && hasOwn("ogImage")) {
    return fail(400, "Provide only one spelling of the social-share image field: og_image or ogImage");
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
  const hasCoverImage = Object.prototype.hasOwnProperty.call(body, "coverImage");
  const hasCoverAlt = Object.prototype.hasOwnProperty.call(body, "coverImageAlt");
  const hasOgImage = Object.prototype.hasOwnProperty.call(body, "ogImage");
  if (!hasContent && !hasCoverImage && !hasCoverAlt && !hasOgImage) {
    return fail(400, "Provide content, cover_image, og_image, and/or cover_image_alt to backfill");
  }

  const values: {
    content?: string;
    embedReport?: unknown;
    coverImage?: string;
    coverImageAlt?: string;
    ogImage?: string;
  } = {};

  let coverImage = target.coverImage;
  if (hasCoverImage) {
    if (typeof body.coverImage !== "string" || !body.coverImage.trim()) {
      return fail(400, "cover_image must be a non-empty supported image URL or local path");
    }
    coverImage = body.coverImage.trim();
    if (!isSupportedAutomationImageSource(coverImage)) {
      return fail(400, "cover_image must use an http(s) URL, /api/storage/objects/... path, or /covers/... path");
    }
    const coverError = validateCoverImage(coverImage);
    if (coverError) return fail(400, coverError);
  }

  let ogImage = target.ogImage;
  if (hasOgImage) {
    if (typeof body.ogImage !== "string" || !body.ogImage.trim()) {
      return fail(400, "og_image must be a non-empty supported image URL or local path");
    }
    ogImage = body.ogImage.trim();
    if (!isSupportedAutomationImageSource(ogImage)) {
      return fail(400, "og_image must use an http(s) URL, /api/storage/objects/... path, or /covers/... path");
    }
    const ogError = validateCoverImage(ogImage);
    if (ogError) return fail(400, ogError.replace(/^Cover image/, "Social-share image"));
  }

  const existingCoverAlt = cleanText(target.coverImageAlt);
  let coverImageAlt = existingCoverAlt;
  if (hasCoverAlt) {
    coverImageAlt = cleanText(body.coverImageAlt);
    if (!coverImageAlt) {
      return fail(400, "cover_image_alt must be meaningful and non-empty");
    }
    if (!coverImage) {
      return fail(400, "cover_image_alt cannot be set because this post has no cover image");
    }
  }
  if (hasCoverImage && !coverImageAlt) {
    return fail(400, "cover_image_alt is required when replacing a cover image unless the existing cover alt text is meaningful");
  }
  if (hasCoverAlt) values.coverImageAlt = coverImageAlt!;

  let sanitizedContent = "";
  if (hasContent) {
    if (typeof body.content !== "string" || !body.content.trim()) {
      return fail(400, "content must be a non-empty HTML string");
    }
    const normalized = normalizeSocialEmbeds(body.content, { automation: true });
    sanitizedContent = normalized.html;
    if (!sanitizedContent.trim()) {
      return fail(400, "content must contain non-empty sanitized TipTap-compatible HTML");
    }
    const inlineImageError = validateAutomationImages(sanitizedContent);
    if (inlineImageError) {
      return fail(400, inlineImageError);
    }
    values.content = await persistExternalImagesInHtml(sanitizedContent, {
      uploaderId: botUser.id,
      uploaderName: botUser.displayName,
    });
    values.embedReport = normalized.report;
  }

  const persistCtx = { uploaderId: botUser.id, uploaderName: botUser.displayName };
  try {
    if (hasCoverImage) {
      const replacementCoverImage = coverImage;
      if (!replacementCoverImage) {
        return fail(400, "cover_image must be a non-empty supported image URL or local path");
      }
      values.coverImage = isExternalImageUrl(replacementCoverImage)
        ? await persistExternalImage(replacementCoverImage, { ...persistCtx, alt: coverImageAlt })
        : replacementCoverImage;
    }
    if (hasOgImage) {
      const replacementOgImage = ogImage;
      if (!replacementOgImage) {
        return fail(400, "og_image must be a non-empty supported image URL or local path");
      }
      values.ogImage = isExternalImageUrl(replacementOgImage)
        ? await persistExternalImage(replacementOgImage, persistCtx)
        : replacementOgImage;
    }
  } catch (err) {
    logger.warn({ err }, "automation: image backfill persistence failed");
    return fail(502, "Could not persist the replacement image; no changes were saved");
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
      const current = await getMapletechiePost({ postId: prior.postId });
      if (current) {
        return { status: 200, body: { ...current, edit_url: editUrl(Number(current.id)), replayed: true } };
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

  const normalizedContent = normalizeSocialEmbeds(body.content, { automation: true });
  const sanitizedContent = normalizedContent.html;
  if (!sanitizedContent.trim()) {
    return fail(400, "content must contain non-empty sanitized TipTap-compatible HTML");
  }
  const inlineImageError = validateAutomationImages(sanitizedContent);
  if (inlineImageError) {
    return fail(400, inlineImageError);
  }

  // Re-host external images on our own storage (best-effort, SSRF-guarded).
  const persistCtx = { uploaderId: botUser.id, uploaderName: botUser.displayName };
  let coverImage = typeof body.coverImage === "string" ? body.coverImage : null;
  let ogImage = typeof body.ogImage === "string" ? body.ogImage : null;
  try {
    if (isExternalImageUrl(coverImage)) {
      coverImage = await persistExternalImage(coverImage, { ...persistCtx, alt: coverImageAlt });
      if (isExternalImageUrl(coverImage)) {
        return fail(502, "Could not persist the draft cover image; no draft was created");
      }
    }
    if (isExternalImageUrl(ogImage)) {
      ogImage = await persistExternalImage(ogImage, persistCtx);
      if (isExternalImageUrl(ogImage)) {
        return fail(502, "Could not persist the draft social-share image; no draft was created");
      }
    }
  } catch (err) {
    logger.warn({ err }, "automation: draft image persistence failed");
    return fail(502, "Could not persist one or more draft images; no draft was created");
  }

  const toStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => cleanText(x)).filter((x): x is string => !!x) : [];

  let content: string;
  try {
    content = await persistExternalImagesInHtml(sanitizedContent, persistCtx);
  } catch (err) {
    logger.warn({ err }, "automation: inline draft image persistence failed");
    return fail(502, "Could not persist one or more inline draft images; no draft was created");
  }
  if (collectExternalImageUrls(content).length > 0) {
    return fail(502, "Could not persist one or more inline draft images; no draft was created");
  }

  const values = {
    title: String(body.title).trim().slice(0, 300),
    slug,
    excerpt: typeof body.excerpt === "string" ? body.excerpt.trim() : "",
    content,
    embedReport: normalizedContent.report,
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
        const current = await getMapletechiePost({ postId: prior.postId });
        if (current) {
          return { status: 200, body: { ...current, edit_url: editUrl(Number(current.id)), replayed: true } };
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
      ...canonicalMapletechiePost({
        ...inserted,
        categories: resolvedCats.all.map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          isPrimary: category.id === resolvedCats.primary.id,
        })),
      }),
      edit_url: editUrl(inserted.id),
      replayed: false,
    },
  };
}

/** Read the complete current state, used by connectors and preview clients. */
export async function getMapletechiePost(postIdOrSlug: { postId?: number; slug?: string }) {
  const rows = postIdOrSlug.postId
    ? await db.select().from(postsTable).where(eq(postsTable.id, postIdOrSlug.postId))
    : await db.select().from(postsTable).where(eq(postsTable.slug, String(postIdOrSlug.slug).trim().toLowerCase()));
  const post = rows[0] as Record<string, any> | undefined;
  if (!post) return null;
  const categories = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      slug: categoriesTable.slug,
      isPrimary: postCategoriesTable.isPrimary,
    })
    .from(postCategoriesTable)
    .innerJoin(categoriesTable, eq(postCategoriesTable.categoryId, categoriesTable.id))
    .where(eq(postCategoriesTable.postId, post.id))
    .orderBy(desc(postCategoriesTable.isPrimary), asc(categoriesTable.name));
  return canonicalMapletechiePost({ ...post, categories });
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

// Complete-state read is connector-authenticated; it intentionally supports
// drafts because the connector is the editorial system of record.
router.get("/automation/posts/:id/preview", async (req, res): Promise<void> => {
  const postId = Number(req.params.id);
  const previewToken = typeof req.headers["x-preview-token"] === "string"
    ? req.headers["x-preview-token"]
    : "";
  const verified = Number.isInteger(postId) ? verifyPostPreviewToken(previewToken, postId) : null;
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!verified) { res.status(401).json({ error: "Invalid or expired preview token" }); return; }
  const post = await getMapletechiePost({ postId });
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.json({ post, viewport: { width: verified.width, height: verified.height }, expires_at: verified.expiresAt.toISOString() });
});

router.post("/automation/posts/backfill", automationAuth, async (req, res): Promise<void> => {
  const result = await backfillAutomationPostImages(req, (req.body ?? {}) as Record<string, unknown>);
  res.status(result.status).json(result.body);
});

export default router;
