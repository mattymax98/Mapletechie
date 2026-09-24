import { Router } from "express";
import { createHash } from "node:crypto";
import { db, postsTable, usersTable, pageViewsTable, commentsTable, categoriesTable, auditLogsTable } from "@workspace/db";
import { eq, desc, and, gte, sql, inArray, or, getTableColumns } from "drizzle-orm";
import {
  ListPostsQueryParams,
  GetPostParams,
  GetPostBySlugParams,
  GetLatestPostsQueryParams,
} from "@workspace/api-zod";
import { adminAuth, requireRole } from "../middlewares/adminAuth";
import { writeAuditLog } from "../lib/audit";
import { validateCoverImage } from "../lib/coverImageValidation";
import { collectExternalImageUrls, isExternalImageUrl, persistExternalImage, persistExternalImagesInHtml } from "../lib/persistExternalImage";
import sanitizeHtml from "sanitize-html";
import {
  resolveCategory,
  resolveCategoriesForWrite,
  attachCategories,
  syncPostCategories,
  refreshCategoryPostCounts,
  getPostCategoryIds,
  postInCategory,
} from "../lib/postCategoryHelpers";
import { submitToIndexNow, buildPostUrls } from "../lib/indexNow";
import { canonicalPostAuthor } from "../lib/postAuthor";

// Re-exported for automation.ts (historical import location).
export { resolveCategory };

const router = Router();

/**
 * Non-fatal warnings for a just-saved post whose images could not be pulled
 * onto our own storage (persistExternalImage is best-effort). Editors see
 * these so they know the post still depends on a third-party image host.
 */
function collectImageWarnings(fields: {
  coverImage?: unknown;
  ogImage?: unknown;
  content?: unknown;
}): string[] {
  const warnings: string[] = [];
  if (isExternalImageUrl(fields.coverImage)) {
    warnings.push(
      "The cover image couldn't be copied to Mapletechie's storage — it's still loading from an external site and could break if that site removes it.",
    );
  }
  if (isExternalImageUrl(fields.ogImage)) {
    warnings.push(
      "The social share image couldn't be copied to Mapletechie's storage — it's still loading from an external site.",
    );
  }
  const bodyExternals = collectExternalImageUrls(fields.content);
  if (bodyExternals.length > 0) {
    warnings.push(
      `${bodyExternals.length} image${bodyExternals.length === 1 ? "" : "s"} in the article body couldn't be copied to Mapletechie's storage and still load${bodyExternals.length === 1 ? "s" : ""} from external sites.`,
    );
  }
  return warnings;
}

const SOCIAL_EMBED_PROVIDERS = new Set([
  "youtube",
  "twitter",
  "instagram",
  "tiktok",
  "bluesky",
  "mastodon",
  "reddit",
]);

export interface SocialEmbedReport {
  schema_version: 1;
  revision: string;
  requested: number;
  preserved: number;
  removed: number;
  by_provider: Record<string, number>;
  warnings: string[];
  items: Array<{ provider: string; url: string; action: "preserved" | "removed"; reason?: string }>;
}

function canonicalEmbed(providerHint: string, rawUrl: string): { provider: string; url: string } | null {
  let parsed: URL;
  try { parsed = new URL(rawUrl.trim()); } catch { return null; }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const normalizedHint = providerHint.toLowerCase() === "x" ? "twitter" : providerHint.toLowerCase();
  if (normalizedHint && normalizedHint !== "true" && normalizedHint !== "normalized-source" &&
      !SOCIAL_EMBED_PROVIDERS.has(normalizedHint)) return null;
  let provider = "";
  let url = "";
  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "m.youtube.com") {
    let id = "";
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed" && parts[1]) id = parts[1];
    else if (parts[0] === "shorts" || parts[0] === "live") id = parts[1] || "";
    else if (parts[0] === "watch") id = parsed.searchParams.get("v") || "";
    if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
    provider = "youtube"; url = `https://www.youtube.com/watch?v=${id}`;
  } else if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0] || "";
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
    provider = "youtube"; url = `https://www.youtube.com/watch?v=${id}`;
  } else if (host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com") {
    const match = parsed.pathname.match(/^\/([A-Za-z0-9_]{1,20})\/status(?:es)?\/(\d{5,25})\/?$/i);
    if (!match) return null;
    provider = "twitter"; url = `https://x.com/${match[1]}/status/${match[2]}`;
  } else if (host === "instagram.com" &&
             /^\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/[A-Za-z0-9_-]{5,40}\/?$/i.test(parsed.pathname)) {
    provider = "instagram"; url = parsed.toString();
  } else if (host === "tiktok.com" && /^\/@[\w.-]+\/video\/\d{5,25}\/?$/i.test(parsed.pathname)) {
    provider = "tiktok"; url = parsed.toString();
  } else if (host === "bsky.app" && /^\/profile\/[A-Za-z0-9:%._-]+\/post\/[a-z0-9]{5,20}\/?$/i.test(parsed.pathname)) {
    provider = "bluesky"; url = parsed.toString();
  } else if ((host === "reddit.com" || host === "old.reddit.com" || host === "new.reddit.com") &&
             /^\/r\/[A-Za-z0-9_]{2,21}\/comments\/[a-z0-9]{4,10}(?:\/|$)/i.test(parsed.pathname)) {
    provider = "reddit"; url = parsed.toString();
  } else if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(host) &&
             /^\/@[\w.-]+(?:@[\w.-]+)?\/\d{8,25}\/?$/i.test(parsed.pathname)) {
    provider = "mastodon"; url = parsed.toString();
  } else {
    return null;
  }
  if (!SOCIAL_EMBED_PROVIDERS.has(provider)) return null;
  if (normalizedHint && normalizedHint !== "true" && normalizedHint !== "normalized-source" &&
      normalizedHint !== provider) {
    return { provider, url };
  }
  return { provider, url };
}

function safeEmbedHtml(provider: string, url: string): string {
  const escaped = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const label = provider === "twitter" ? "View this post on X" : provider === "youtube" ? "Watch this video on YouTube" : `View this post on ${provider}`;
  return `<div class="social-embed" data-social-embed="" data-provider="${provider}" data-url="${escaped}"><a href="${escaped}" rel="noopener noreferrer nofollow" target="_blank">${label}</a></div>`;
}

const VOID_HTML_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function tagAttribute(tag: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\s${escapedName}="([^"]*)"`, "i"));
  return (match?.[1] || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
}

/**
 * Keep only root-level canonical placeholders. sanitize-html has already made
 * the markup well-formed, so this small scanner only needs to track sanitized
 * start/end tags; it never parses untrusted source HTML.
 */
function finalizeSocialEmbeds(html: string, report: SocialEmbedReport): string {
  const tagRe = /<\/?([a-z0-9]+)\b[^>]*>/gi;
  const stack: string[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  let output = "";
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html))) {
    const whole = match[0];
    const tagName = match[1].toLowerCase();
    const closing = whole.startsWith("</");
    const selfClosing = whole.endsWith("/>") || VOID_HTML_TAGS.has(tagName);
    const isSocialDiv = !closing && tagName === "div" && /\sdata-social-embed="/i.test(whole);

    output += html.slice(cursor, match.index);
    if (isSocialDiv) {
      const provider = tagAttribute(whole, "data-provider");
      const url = tagAttribute(whole, "data-url");
      if (stack.length > 0) {
        report.removed++;
        report.items.push({ provider: provider || "unknown", url: "", action: "removed", reason: "nested" });
        report.warnings.push("Removed a nested social embed marker; embeds must be top-level article blocks.");
        output += `<div${tagAttribute(whole, "class") ? ` class="${tagAttribute(whole, "class")}"` : ""}>`;
        stack.push(tagName);
        cursor = tagRe.lastIndex;
        continue;
      }

      let divDepth = 1;
      const innerTagRe = /<\/?([a-z0-9]+)\b[^>]*>/gi;
      innerTagRe.lastIndex = tagRe.lastIndex;
      let endIndex = tagRe.lastIndex;
      let inner: RegExpExecArray | null;
      while ((inner = innerTagRe.exec(html))) {
        if (inner[1].toLowerCase() !== "div") continue;
        if (inner[0].startsWith("</")) divDepth--;
        else if (!inner[0].endsWith("/>")) divDepth++;
        if (divDepth === 0) {
          endIndex = innerTagRe.lastIndex;
          break;
        }
      }

      const nestedMarkers = html.slice(tagRe.lastIndex, endIndex).match(/<div\b[^>]*\sdata-social-embed="[^"]*"[^>]*>/gi) ?? [];
      for (const nestedTag of nestedMarkers) {
        report.removed++;
        report.items.push({
          provider: tagAttribute(nestedTag, "data-provider") || "unknown",
          url: "",
          action: "removed",
          reason: "nested",
        });
        report.warnings.push("Removed a nested social embed marker; embeds must be top-level article blocks.");
      }

      const normalized = canonicalEmbed(provider, url);
      const key = normalized ? `${normalized.provider}:${normalized.url}` : "";
      if (!normalized || seen.has(key)) {
        report.removed++;
        report.items.push({
          provider: normalized?.provider ?? "unknown",
          url: normalized?.url ?? "",
          action: "removed",
          reason: normalized ? "duplicate" : "unsafe",
        });
        report.warnings.push("Removed a duplicate or unsafe social embed.");
      } else {
        seen.add(key);
        report.preserved++;
        report.by_provider[normalized.provider] = (report.by_provider[normalized.provider] || 0) + 1;
        report.items.push({ provider: normalized.provider, url: normalized.url, action: "preserved" });
        output += safeEmbedHtml(normalized.provider, normalized.url);
      }
      tagRe.lastIndex = endIndex;
      cursor = endIndex;
      continue;
    }

    output += whole;
    if (closing) stack.pop();
    else if (!selfClosing) stack.push(tagName);
    cursor = tagRe.lastIndex;
  }
  output += html.slice(cursor);
  return output;
}

/** Normalize embeds and return a safe automation report. The report contains no source HTML. */
export function normalizeSocialEmbeds(
  input: unknown,
  options: { automation?: boolean } = {},
): { html: string; report: SocialEmbedReport } {
  const source = typeof input === "string" ? input : "";
  const report: SocialEmbedReport = {
    schema_version: 1, revision: "", requested: 0, preserved: 0, removed: 0, by_provider: {}, warnings: [], items: [],
  };
  // Convert supported iframe and X blockquote forms before the HTML sanitizer removes them.
  let prepared = source.replace(
    /\bdata-social-embed(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi,
    (_attribute, doubleQuoted: string | undefined, singleQuoted: string | undefined, unquoted: string | undefined) =>
      `data-social-embed="${doubleQuoted || singleQuoted || unquoted || "true"}"`,
  )
  .replace(/<iframe\b([^>]*)>(?:[\s\S]*?)<\/iframe\s*>/gi, (whole, attrs: string) => {
    const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    report.requested++;
    if (!src) {
      report.removed++;
      report.warnings.push("Removed an iframe without a recoverable supported video URL.");
      return "";
    }
    const normalized = canonicalEmbed("youtube", src);
    if (!normalized || normalized.provider !== "youtube") {
      report.removed++;
      report.warnings.push("Removed an unsafe or unsupported iframe URL.");
      return "";
    }
    return safeEmbedHtml(normalized.provider, normalized.url).replace('data-social-embed=""', 'data-social-embed="normalized-source"');
  }).replace(/<blockquote\b([^>]*)>[\s\S]*?<\/blockquote\s*>/gi, (whole, attrs: string) => {
    const cite = attrs.match(/\bcite\s*=\s*["']([^"']+)["']/i)?.[1] || whole.match(/https?:\/\/(?:x\.com|twitter\.com)\/[^\s<"']+/i)?.[0];
    if (!cite) return whole;
    report.requested++;
    const normalized = canonicalEmbed("twitter", cite);
    if (!normalized || normalized.provider !== "twitter") {
      report.removed++;
      report.warnings.push("Removed an unsafe or invalid X/Twitter status URL.");
      return "";
    }
    return safeEmbedHtml(normalized.provider, normalized.url).replace('data-social-embed=""', 'data-social-embed="normalized-source"');
  });

  let html = sanitizeHtml(prepared, {
    allowedTags: ["p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "strike", "sub", "sup", "ul", "ol", "li", "blockquote", "code", "pre", "a", "img", "span", "div", "table", "thead", "tbody", "tr", "th", "td"],
    allowedAttributes: { a: ["href", "title", "target", "rel"], img: ["src", "alt", "title", "width", "height"], div: ["data-social-embed", "data-provider", "data-url"], "*": ["class"] },
    allowedSchemes: ["http", "https", "mailto"], allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: {
      div: (_tag, attrs) => {
        const isSocial = "data-social-embed" in attrs || (attrs.class || "").split(/\s+/).includes("social-embed");
        if (!isSocial) {
          const { ["data-social-embed"]: _e, ["data-provider"]: _p, ["data-url"]: _u, ...rest } = attrs;
          return { tagName: "div", attribs: rest };
        }
        if (attrs["data-social-embed"] !== "normalized-source") report.requested++;
        const shorthand = attrs["data-social-embed"] === "x" ? "twitter" : attrs["data-social-embed"];
        const suppliedProvider = (attrs["data-provider"] || shorthand || "").toLowerCase();
        const normalized = canonicalEmbed(attrs["data-provider"] || shorthand || "", attrs["data-url"] || "");
        const automationAllowed = !options.automation || normalized?.provider === "youtube" || normalized?.provider === "twitter";
        const normalizedHint = suppliedProvider === "x" ? "twitter" : suppliedProvider;
        const providerMatches =
          !normalizedHint ||
          normalizedHint === "true" ||
          normalizedHint === "normalized-source" ||
          normalizedHint === normalized?.provider;
        if (!normalized || !automationAllowed || !providerMatches) {
          report.removed++; report.warnings.push("Removed an embed with an unsafe URL or provider mismatch.");
          return { tagName: "div", attribs: { class: attrs.class || "" } };
        }
        return { tagName: "div", attribs: { class: "social-embed", "data-social-embed": "true", "data-provider": normalized.provider, "data-url": normalized.url } };
      },
      a: (_tag, attrs) => ({ tagName: "a", attribs: { ...attrs, rel: "noopener noreferrer nofollow", target: attrs.target === "_self" ? "_self" : "_blank" } }),
    },
  });
  html = finalizeSocialEmbeds(html, report);
  html = html.replace(/<(?:div|span|blockquote)(?:\s[^>]*)?>\s*(?:&nbsp;)?\s*<\/(?:div|span|blockquote)>/gi, "");
  const embedRevision = report.items
    .filter((item) => item.action === "preserved")
    .map(({ provider, url }) => ({ provider, url }));
  report.revision = `sha256:${createHash("sha256").update(JSON.stringify(embedRevision)).digest("hex")}`;
  return { html, report };
}

// Sanitize rich text HTML produced by the TipTap editor.
// Exported for tests.
export function cleanHtml(input: unknown): string {
  return normalizeSocialEmbeds(input).html;
}

// Exported for reuse by the automation draft endpoint (automation.ts).
export function cleanText(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return sanitizeHtml(trimmed, { allowedTags: [], allowedAttributes: {} });
}

/**
 * The `category` text column on posts was dropped in May 2026. Every read
 * path now JOINs `categories.name` through `posts.category_id` and exposes
 * it in the JSON response under the legacy `category` key so existing
 * frontend code keeps working unchanged.
 */
const postColumnsWithCategory = {
  ...getTableColumns(postsTable),
  author: canonicalPostAuthor,
  category: categoriesTable.name,
  categorySlug: categoriesTable.slug,
};

function postsBaseQuery() {
  return db
    .select(postColumnsWithCategory)
    .from(postsTable)
    .innerJoin(categoriesTable, eq(postsTable.categoryId, categoriesTable.id));
}

router.get("/posts", async (req, res): Promise<void> => {
  const parsed = ListPostsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { category, limit = 20, offset = 0 } = parsed.data;

  const conditions = [eq(postsTable.status, "published")];
  if (category) {
    const cat = await resolveCategory(category);
    if (!cat) {
      res.json([]);
      return;
    }
    // Membership in ANY of the post's categories counts, not just primary.
    conditions.push(postInCategory(cat.id));
  }

  const posts = await postsBaseQuery()
    .where(and(...conditions))
    .orderBy(desc(postsTable.publishedAt))
    .limit(limit)
    .offset(offset);

  res.json(await attachCategories(posts));
});

// Admin posts list — returns ALL posts (drafts included). Editors see their
// own; admins and editors with canEditOthersPosts see everyone's.
router.get("/admin/posts", adminAuth, async (req, res): Promise<void> => {
  const user = req.user;
  let posts;
  if (user && user.role !== "admin" && !user.canEditOthersPosts) {
    posts = await postsBaseQuery()
      .where(eq(postsTable.authorId, user.id))
      .orderBy(desc(postsTable.createdAt));
  } else {
    posts = await postsBaseQuery().orderBy(desc(postsTable.createdAt));
  }
  res.json(await attachCategories(posts));
});

router.post("/posts", adminAuth, async (req, res): Promise<void> => {
  const user = req.user;
  const body = req.body ?? {};

  // Required fields
  const required = ["title", "slug", "content"];
  for (const f of required) {
    const v = body[f];
    if (typeof v !== "string" || !v.trim()) {
      res.status(400).json({ error: `Missing field: ${f}` });
      return;
    }
  }

  // Category input: either legacy single `category` or a `categories` array
  // (+ optional `primaryCategory`, defaulting to the first entry).
  const resolvedCats = await resolveCategoriesForWrite(body);
  if ("error" in resolvedCats) {
    res.status(400).json({ error: resolvedCats.error });
    return;
  }
  const resolvedCategory = resolvedCats.primary;

  const coverError = validateCoverImage(body.coverImage);
  if (coverError) {
    res.status(400).json({ error: coverError });
    return;
  }
  const ogImageError = validateCoverImage(body.ogImage);
  if (ogImageError) {
    res.status(400).json({ error: ogImageError });
    return;
  }

  // Pull externally-hosted cover/OG images onto our own object storage so the
  // published site never depends on a third-party image host (best-effort).
  const persistCtx = { uploaderId: user?.id ?? null, uploaderName: user?.displayName ?? null };
  if (isExternalImageUrl(body.coverImage)) {
    body.coverImage = await persistExternalImage(body.coverImage, persistCtx);
  }
  if (isExternalImageUrl(body.ogImage)) {
    body.ogImage = await persistExternalImage(body.ogImage, persistCtx);
  }

  let status: string;
  let scheduledFor: Date | null = null;
  if (user?.role === "admin" || user?.canPublishDirectly) {
    if (body.status === "draft") {
      status = "draft";
    } else if (body.status === "scheduled" && body.scheduledFor) {
      const when = new Date(body.scheduledFor);
      if (!Number.isNaN(when.getTime()) && when.getTime() > Date.now()) {
        status = "scheduled";
        scheduledFor = when;
      } else {
        status = "published";
      }
    } else {
      status = "published";
    }
  } else {
    status = "draft";
  }

  let assignedAuthorName = user ? user.displayName : (body.author ?? "Mapletechie");
  let assignedAuthorAvatar: string | null = user ? user.avatarUrl ?? null : (body.authorAvatar ?? null);
  let assignedAuthorId: number | null = user ? user.id : (body.authorId ?? null);
  if (user?.role === "admin" && typeof body.authorId === "number" && body.authorId !== user.id) {
    const [other] = await db.select().from(usersTable).where(eq(usersTable.id, body.authorId));
    if (other && other.isActive) {
      assignedAuthorName = other.displayName;
      assignedAuthorAvatar = other.avatarUrl ?? null;
      assignedAuthorId = other.id;
    }
  }

  const normalizedContent = normalizeSocialEmbeds(body.content);
  const values = {
    title: String(body.title).trim(),
    slug: String(body.slug).trim(),
    excerpt: typeof body.excerpt === "string" && body.excerpt.trim() ? body.excerpt.trim() : "",
    // Sanitize first, then pull externally-hosted body images onto our own
    // storage (best-effort — failures keep the original URL, never block).
    content: await persistExternalImagesInHtml(normalizedContent.html, persistCtx),
    embedReport: normalizedContent.report,
    coverImage: body.coverImage ?? null,
    coverImageAlt: typeof body.coverImageAlt === "string" ? body.coverImageAlt.trim() || null : null,
    categoryId: resolvedCategory.id,
    tags: Array.isArray(body.tags) ? body.tags : [],
    author: assignedAuthorName,
    authorAvatar: assignedAuthorAvatar,
    authorId: assignedAuthorId,
    readTime: typeof body.readTime === "number" ? body.readTime : 5,
    isFeatured: !!body.isFeatured,
    seriesId: typeof body.seriesId === "number" ? body.seriesId : null,
    seriesPosition:
      typeof body.seriesPosition === "number" ? body.seriesPosition : null,
    rating:
      typeof body.rating === "number" && !Number.isNaN(body.rating)
        ? Math.max(0, Math.min(5, body.rating))
        : null,
    pros: Array.isArray(body.pros)
      ? (body.pros as unknown[]).map((p) => cleanText(p)).filter((p): p is string => !!p)
      : [],
    cons: Array.isArray(body.cons)
      ? (body.cons as unknown[]).map((c) => cleanText(c)).filter((c): c is string => !!c)
      : [],
    verdict: cleanText(body.verdict),
    status,
    scheduledFor,
    seoTitle: cleanText(body.seoTitle),
    seoDescription: cleanText(body.seoDescription),
    seoKeywords: Array.isArray(body.seoKeywords)
      ? (body.seoKeywords as unknown[])
          .map((k) => cleanText(k))
          .filter((k): k is string => !!k)
      : [],
    ogImage: body.ogImage ?? null,
    publishedAt: body.publishedAt ? new Date(body.publishedAt) : new Date(),
  };

  const inserted = await db.transaction(async (tx) => {
    const [row] = await tx.insert(postsTable).values(values).returning();
    await syncPostCategories(tx, row.id, resolvedCats.all.map((c) => c.id), resolvedCats.primary.id);
    await refreshCategoryPostCounts(tx, resolvedCats.all.map((c) => c.id));
    return row;
  });
  // Re-fetch through the JOIN so we return the same shape as the read paths
  // (with `category` included).
  const [post] = await postsBaseQuery().where(eq(postsTable.id, inserted.id));
  const [withCats] = await attachCategories([post]);
  await writeAuditLog(req, {
    action: "post.create",
    entityType: "post",
    entityId: post.id,
    summary: `Created post "${post.title}" (${post.status})`,
    details: { snapshot: inserted },
  });
  const imageWarnings = collectImageWarnings({
    coverImage: values.coverImage,
    ogImage: values.ogImage,
    content: values.content,
  });
  // Ping Bing via IndexNow when the post is published so it re-evaluates the
  // URL immediately instead of waiting for the next Bingbot crawl cycle.
  if (withCats.status === "published") {
    void submitToIndexNow(buildPostUrls({ slug: withCats.slug, categorySlugs: withCats.categories?.map((c) => c.slug) ?? (withCats.categorySlug ? [withCats.categorySlug] : []) }));
  }
  res.status(201).json(imageWarnings.length ? { ...withCats, imageWarnings } : withCats);
});

router.get("/posts/featured", async (_req, res): Promise<void> => {
  const posts = await postsBaseQuery()
    .where(and(eq(postsTable.isFeatured, true), eq(postsTable.status, "published")))
    .orderBy(desc(postsTable.publishedAt))
    .limit(5);
  res.json(await attachCategories(posts));
});

router.get("/posts/latest", async (req, res): Promise<void> => {
  const parsed = GetLatestPostsQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 6) : 6;
  const posts = await postsBaseQuery()
    .where(eq(postsTable.status, "published"))
    .orderBy(desc(postsTable.publishedAt))
    .limit(limit);
  res.json(await attachCategories(posts));
});

router.get("/posts/trending", async (_req, res): Promise<void> => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const topSlugs = await db
    .select({
      slug: pageViewsTable.postSlug,
      views: sql<number>`count(*)::int`,
    })
    .from(pageViewsTable)
    .where(and(gte(pageViewsTable.createdAt, since), sql`${pageViewsTable.postSlug} is not null`))
    .groupBy(pageViewsTable.postSlug)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  const slugs = topSlugs.map((r) => r.slug).filter((s): s is string => !!s);

  type PostRow = Awaited<ReturnType<typeof postsBaseQuery>>[number];
  let posts: PostRow[] = [];
  if (slugs.length > 0) {
    const found = await postsBaseQuery()
      .where(and(eq(postsTable.status, "published"), inArray(postsTable.slug, slugs)));
    const order = new Map(slugs.map((s, i) => [s, i]));
    posts = found.sort((a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99)).slice(0, 5);
  }

  if (posts.length < 5) {
    const exclude = new Set(posts.map((p) => p.id));
    const filler = await postsBaseQuery()
      .where(eq(postsTable.status, "published"))
      .orderBy(desc(postsTable.viewCount))
      .limit(10);
    for (const p of filler) {
      if (posts.length >= 5) break;
      if (!exclude.has(p.id)) posts.push(p);
    }
  }

  res.json(await attachCategories(posts.slice(0, 5)));
});

router.get("/posts/most-discussed", async (_req, res): Promise<void> => {
  const topSlugs = await db
    .select({
      slug: commentsTable.postSlug,
      comments: sql<number>`count(*)::int`,
    })
    .from(commentsTable)
    .where(eq(commentsTable.status, "approved"))
    .groupBy(commentsTable.postSlug)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  if (topSlugs.length === 0) {
    res.json([]);
    return;
  }

  const slugs = topSlugs.map((r) => r.slug);
  const found = await postsBaseQuery()
    .where(and(eq(postsTable.status, "published"), inArray(postsTable.slug, slugs)));

  const countBySlug = new Map(topSlugs.map((r) => [r.slug, r.comments]));
  const ranked = found
    .map((p) => ({ ...p, commentCount: countBySlug.get(p.slug) || 0 }))
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 5);
  res.json(await attachCategories(ranked));
});

router.get("/posts/slug/:slug", async (req, res): Promise<void> => {
  const parsed = GetPostBySlugParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [post] = await postsBaseQuery()
    .where(and(eq(postsTable.slug, parsed.data.slug), eq(postsTable.status, "published")));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const [withCats] = await attachCategories([post]);
  res.json(withCats);
});

router.put("/posts/:id", adminAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [existing] = await db.select().from(postsTable).where(eq(postsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const user = req.user;
  if (
    user &&
    user.role !== "admin" &&
    !user.canEditOthersPosts &&
    existing.authorId !== user.id
  ) {
    res.status(403).json({ error: "You can only edit your own posts" });
    return;
  }
  const persistCtx = { uploaderId: user?.id ?? null, uploaderName: user?.displayName ?? null };

  const body = req.body ?? {};
  const allowed = [
    "title",
    "slug",
    "excerpt",
    "content",
    "coverImage",
    "coverImageAlt",
    "category",
    "tags",
    "readTime",
    "isFeatured",
    "seriesId",
    "seriesPosition",
    "publishedAt",
    "status",
    "scheduledFor",
    "seoTitle",
    "seoDescription",
    "seoKeywords",
    "ogImage",
    "rating",
    "pros",
    "cons",
    "verdict",
  ] as const;

  const update: Record<string, unknown> = {};
  let categoryChanged = false;
  const previousCategoryId = existing.categoryId;
  for (const k of allowed) {
    if (!(k in body)) continue;
    if (k === "content") {
      // Sanitize first, then re-host external body images (best-effort).
      const normalized = normalizeSocialEmbeds(body[k]);
      update[k] = await persistExternalImagesInHtml(normalized.html, persistCtx);
      update.embedReport = normalized.report;
    } else if (k === "seoTitle" || k === "seoDescription" || k === "verdict" || k === "coverImageAlt") {
      update[k] = cleanText(body[k]);
    } else if (k === "rating") {
      update[k] =
        typeof body[k] === "number" && !Number.isNaN(body[k])
          ? Math.max(0, Math.min(5, body[k]))
          : null;
    } else if (k === "pros" || k === "cons") {
      update[k] = Array.isArray(body[k])
        ? body[k].map((v: unknown) => cleanText(v)).filter((v: unknown): v is string => !!v)
        : [];
    } else if (k === "seoKeywords") {
      update[k] = Array.isArray(body[k])
        ? body[k].map((v: unknown) => cleanText(v)).filter((v: unknown): v is string => !!v)
        : [];
    } else if (k === "category") {
      // Handled below together with `categories`/`primaryCategory`.
      continue;
    } else if (k === "coverImage" || k === "ogImage") {
      const imgError = validateCoverImage(body[k]);
      if (imgError) {
        res.status(400).json({ error: imgError });
        return;
      }
      update[k] = isExternalImageUrl(body[k])
        ? await persistExternalImage(body[k], persistCtx)
        : body[k];
    } else {
      update[k] = body[k];
    }
  }

  if (user && user.role !== "admin" && !user.canPublishDirectly) {
    if (update.status === "published" || update.status === "scheduled") {
      update.status = "draft";
      update.scheduledFor = null;
    }
  }

  if (update.status === "scheduled") {
    const raw = update.scheduledFor;
    const when = raw ? new Date(raw as string | Date) : null;
    if (!when || Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      update.status = "published";
      update.scheduledFor = null;
    } else {
      update.scheduledFor = when;
    }
  } else if ("status" in update && update.status !== "scheduled") {
    update.scheduledFor = null;
  } else if ("scheduledFor" in update && update.scheduledFor) {
    update.scheduledFor = new Date(update.scheduledFor as string | Date);
  }

  if (user?.role === "admin") {
    if ("author" in body) update.author = body.author;
    if ("authorAvatar" in body) update.authorAvatar = body.authorAvatar;
    if ("authorId" in body) update.authorId = body.authorId;
  }

  if (update.publishedAt && typeof update.publishedAt === "string") {
    update.publishedAt = new Date(update.publishedAt as string);
  }

  // Drafts receive an initial publishedAt value when they are created, but
  // public lists use this field for newest-first ordering. Refresh it when a
  // post actually transitions into the published state so it appears where it
  // was published, not where its draft was first written. Keep an explicitly
  // supplied date intact for intentional backdating/imports; scheduled posts
  // are timestamped by the scheduled-publish worker when their time arrives.
  if (
    update.status === "published" &&
    existing.status !== "published" &&
    !("publishedAt" in body)
  ) {
    update.publishedAt = new Date();
  }

  // Category changes. Three shapes are accepted:
  // - `categories` array (+ optional `primaryCategory`) — full replacement.
  // - legacy single `category` — replaces the PRIMARY, keeps secondaries.
  // - `primaryCategory` alone — re-picks the primary among current ones.
  const current = await getPostCategoryIds(db, id);
  const currentIds =
    current.ids.length > 0
      ? current.ids
      : typeof previousCategoryId === "number"
        ? [previousCategoryId]
        : [];
  const currentPrimary = current.primaryId ?? previousCategoryId ?? null;
  let catPlan: { ids: number[]; primaryId: number } | null = null;
  if ("categories" in body) {
    const resolved = await resolveCategoriesForWrite(body);
    if ("error" in resolved) {
      res.status(400).json({ error: resolved.error });
      return;
    }
    catPlan = { ids: resolved.all.map((c) => c.id), primaryId: resolved.primary.id };
  } else if ("category" in body) {
    const resolved = await resolveCategory(body.category);
    if (!resolved) {
      res.status(400).json({ error: `Unknown category: ${String(body.category)}` });
      return;
    }
    const secondaries = currentIds.filter((cid) => cid !== currentPrimary && cid !== resolved.id);
    catPlan = { ids: [resolved.id, ...secondaries], primaryId: resolved.id };
  } else if ("primaryCategory" in body) {
    const resolved = await resolveCategory(body.primaryCategory);
    if (!resolved || !currentIds.includes(resolved.id)) {
      res.status(400).json({
        error: `primaryCategory must be one of the post's current categories`,
      });
      return;
    }
    catPlan = { ids: currentIds, primaryId: resolved.id };
  }
  if (catPlan) {
    update.categoryId = catPlan.primaryId;
    categoryChanged =
      catPlan.primaryId !== previousCategoryId ||
      catPlan.ids.length !== currentIds.length ||
      catPlan.ids.some((cid) => !currentIds.includes(cid));
  }

  await db.transaction(async (tx) => {
    await tx
      .update(postsTable)
      .set(update)
      .where(eq(postsTable.id, id));

    // Keep the join table, the posts.category_id mirror, and the cached
    // postCount of every affected category consistent in one transaction.
    if (catPlan && categoryChanged) {
      await syncPostCategories(tx, id, catPlan.ids, catPlan.primaryId);
      await refreshCategoryPostCounts(tx, [...currentIds, ...catPlan.ids]);
    }
  });
  // Re-fetch through the JOIN so the response includes the resolved category.
  const [updatedRow] = await postsBaseQuery().where(eq(postsTable.id, id));
  const [updated] = await attachCategories([updatedRow]);
  // Re-fetch the raw row so the snapshot is the same shape as `before`.
  const [updatedRaw] = await db.select().from(postsTable).where(eq(postsTable.id, id));

  await writeAuditLog(req, {
    action: "post.update",
    entityType: "post",
    entityId: updated.id,
    summary: categoryChanged
      ? `Updated post "${updated.title}" — moved to category "${updated.category}"`
      : `Updated post "${updated.title}"`,
    details: { before: existing, after: updatedRaw },
  });
  // Only warn about fields this request actually submitted — untouched fields
  // were already handled (or warned about) when they were last saved.
  const imageWarnings = collectImageWarnings({
    coverImage: "coverImage" in update ? update.coverImage : undefined,
    ogImage: "ogImage" in update ? update.ogImage : undefined,
    content: "content" in update ? update.content : undefined,
  });
  // Ping Bing when the post is published or when an already-published post is
  // updated so Bing picks up the latest content without waiting for a crawl.
  if (updated.status === "published" || existing.status === "published") {
    void submitToIndexNow(buildPostUrls({ slug: updated.slug, categorySlugs: updated.categories?.map((c) => c.slug) ?? (updated.categorySlug ? [updated.categorySlug] : []) }));
  }
  res.json(imageWarnings.length ? { ...updated, imageWarnings } : updated);
});

// Bulk-move a set of posts to another category in one call. Admins can move
// any posts; editors only their own. Mirrors the postCount refresh done by
// the single-post update path and /admin/categories/reassign-posts.
router.post("/admin/posts/bulk-reassign", adminAuth, async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const rawIds = Array.isArray(body.postIds) ? body.postIds : null;
  if (!rawIds || rawIds.length === 0 || rawIds.length > 200) {
    res.status(400).json({ error: "postIds must be a non-empty array (max 200)" });
    return;
  }
  const postIds: number[] = [...new Set<number>(rawIds.map((v: unknown) => Number(v)))].filter(
    (n): n is number => Number.isInteger(n) && n > 0,
  );
  if (postIds.length === 0) {
    res.status(400).json({ error: "postIds must contain valid ids" });
    return;
  }

  const resolved = await resolveCategory(body.category);
  if (!resolved) {
    res.status(400).json({ error: `Unknown category: ${String(body.category)}` });
    return;
  }

  const rows = await db.select().from(postsTable).where(inArray(postsTable.id, postIds));
  if (rows.length !== postIds.length) {
    res.status(404).json({ error: "One or more posts not found" });
    return;
  }
  const user = req.user;
  if (
    user &&
    user.role !== "admin" &&
    !user.canEditOthersPosts &&
    rows.some((p) => p.authorId !== user.id)
  ) {
    res.status(403).json({ error: "You can only move your own posts" });
    return;
  }

  const toMove = rows.filter((p) => p.categoryId !== resolved.id);
  const affectedCategoryIds = new Set<number>([resolved.id]);
  for (const p of toMove) {
    if (typeof p.categoryId === "number") affectedCategoryIds.add(p.categoryId);
  }

  if (toMove.length > 0) {
    await db.transaction(async (tx) => {
      // "Move" = replace the PRIMARY category; secondary memberships stay.
      for (const p of toMove) {
        const current = await getPostCategoryIds(tx, p.id);
        const currentIds = current.ids.length > 0 ? current.ids : (typeof p.categoryId === "number" ? [p.categoryId] : []);
        const currentPrimary = current.primaryId ?? p.categoryId ?? null;
        const secondaries = currentIds.filter((cid) => cid !== currentPrimary && cid !== resolved.id);
        if (typeof currentPrimary === "number") affectedCategoryIds.add(currentPrimary);
        await syncPostCategories(tx, p.id, [resolved.id, ...secondaries], resolved.id);
      }
      await refreshCategoryPostCounts(tx, affectedCategoryIds);
    });
    await writeAuditLog(req, {
      action: "posts.bulk_reassign",
      entityType: "post",
      summary: `Moved ${toMove.length} post(s) to category "${resolved.name}"`,
      details: {
        postIds: toMove.map((p) => p.id),
        toCategoryId: resolved.id,
        toCategory: resolved.name,
      },
    });
  }

  res.json({ movedCount: toMove.length });
});

// Restore a deleted post from the newest audit-log snapshot (post.delete
// snapshot, or post.update "after" / post.create snapshot if delete wasn't
// logged). Admin only. Re-inserts the row with its original id so slugs,
// comments (keyed by slug), and old links keep working.
router.post("/admin/posts/:id/restore", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [alive] = await db.select().from(postsTable).where(eq(postsTable.id, id));
  if (alive) {
    res.status(409).json({ error: "Post still exists — nothing to restore" });
    return;
  }

  const entries = await db
    .select()
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.entityType, "post"), eq(auditLogsTable.entityId, String(id))))
    .orderBy(desc(auditLogsTable.id))
    .limit(20);

  let snapshot: Record<string, unknown> | null = null;
  for (const entry of entries) {
    const d = entry.details as Record<string, unknown> | null;
    const candidate = (d?.snapshot ?? d?.after) as Record<string, unknown> | undefined;
    if (candidate && typeof candidate === "object" && candidate.title && candidate.slug) {
      snapshot = candidate;
      break;
    }
  }
  if (!snapshot) {
    res.status(404).json({ error: "No audit snapshot found for this post" });
    return;
  }

  // Make sure the snapshot's category still exists; fail loudly if not so the
  // operator can pass nothing silently.
  const categoryId = Number(snapshot.categoryId);
  const [cat] = Number.isInteger(categoryId)
    ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, categoryId))
    : [];
  if (!cat) {
    res.status(400).json({
      error: `Snapshot category id ${String(snapshot.categoryId)} no longer exists — recreate the category first`,
    });
    return;
  }

  // Guard against a different post now occupying the slug.
  const [slugClash] = await db.select().from(postsTable).where(eq(postsTable.slug, String(snapshot.slug)));
  if (slugClash) {
    res.status(409).json({ error: `Slug "${String(snapshot.slug)}" is already used by post ${slugClash.id}` });
    return;
  }

  const toDate = (v: unknown): Date | null => {
    if (!v) return null;
    const d = new Date(v as string);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const values = {
    id,
    title: String(snapshot.title),
    slug: String(snapshot.slug),
    excerpt: typeof snapshot.excerpt === "string" ? snapshot.excerpt : "",
    content: typeof snapshot.content === "string" ? snapshot.content : "",
    coverImage: (snapshot.coverImage as string | null) ?? null,
    coverImageAlt: (snapshot.coverImageAlt as string | null) ?? null,
    categoryId: cat.id,
    tags: Array.isArray(snapshot.tags) ? (snapshot.tags as string[]) : [],
    author: typeof snapshot.author === "string" ? snapshot.author : "Mapletechie",
    authorAvatar: (snapshot.authorAvatar as string | null) ?? null,
    authorId: typeof snapshot.authorId === "number" ? snapshot.authorId : null,
    readTime: typeof snapshot.readTime === "number" ? snapshot.readTime : 5,
    isFeatured: !!snapshot.isFeatured,
    seriesId: typeof snapshot.seriesId === "number" ? snapshot.seriesId : null,
    seriesPosition: typeof snapshot.seriesPosition === "number" ? snapshot.seriesPosition : null,
    rating: typeof snapshot.rating === "number" ? snapshot.rating : null,
    pros: Array.isArray(snapshot.pros) ? (snapshot.pros as string[]) : [],
    cons: Array.isArray(snapshot.cons) ? (snapshot.cons as string[]) : [],
    verdict: (snapshot.verdict as string | null) ?? null,
    // Restore as a draft so an admin reviews before it goes live again.
    status: "draft",
    scheduledFor: null,
    seoTitle: (snapshot.seoTitle as string | null) ?? null,
    seoDescription: (snapshot.seoDescription as string | null) ?? null,
    seoKeywords: Array.isArray(snapshot.seoKeywords) ? (snapshot.seoKeywords as string[]) : [],
    ogImage: (snapshot.ogImage as string | null) ?? null,
    viewCount: typeof snapshot.viewCount === "number" ? snapshot.viewCount : 0,
    publishedAt: toDate(snapshot.publishedAt),
    createdAt: toDate(snapshot.createdAt) ?? new Date(),
  };

  await db.transaction(async (tx) => {
    await tx.insert(postsTable).values(values as never);
    // Keep the serial sequence ahead of explicitly-inserted ids.
    await tx.execute(sql`select setval(pg_get_serial_sequence('posts','id'), (select max(id) from posts))`);
    await syncPostCategories(tx, id, [cat.id], cat.id);
    await refreshCategoryPostCounts(tx, [cat.id]);
  });

  const [restoredRow] = await postsBaseQuery().where(eq(postsTable.id, id));
  const [restored] = await attachCategories([restoredRow]);
  await writeAuditLog(req, {
    action: "post.restore",
    entityType: "post",
    entityId: id,
    summary: `Restored post "${values.title}" from audit snapshot (as draft)`,
    details: { snapshot: values },
  });
  res.status(201).json(restored);
});

router.delete("/posts/:id", adminAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [existing] = await db.select().from(postsTable).where(eq(postsTable.id, id));
  if (!existing) {
    res.status(404).send();
    return;
  }

  const user = req.user;
  if (user && user.role !== "admin" && existing.authorId !== user.id) {
    res.status(403).json({ error: "You can only delete your own posts" });
    return;
  }

  await db.transaction(async (tx) => {
    // Read memberships inside the tx so concurrent category changes can't
    // slip a category id past the count refresh below.
    const memberships = await getPostCategoryIds(tx, id);
    await tx.delete(postsTable).where(eq(postsTable.id, id));
    // Join rows cascade with the post; refresh the affected counts.
    const affected = new Set(memberships.ids);
    if (typeof existing.categoryId === "number") affected.add(existing.categoryId);
    await refreshCategoryPostCounts(tx, affected);
  });
  await writeAuditLog(req, {
    action: "post.delete",
    entityType: "post",
    entityId: id,
    summary: `Deleted post "${existing.title}"`,
    details: { snapshot: existing },
  });
  res.status(204).send();
});

// The admin editor needs drafts as well as published posts. Keep this detail
// route authenticated so drafts are never exposed publicly, and apply the
// same ownership rule as the update route.
router.get("/posts/:id", adminAuth, async (req, res): Promise<void> => {
  const parsed = GetPostParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [post] = await postsBaseQuery().where(eq(postsTable.id, parsed.data.id));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const user = req.user;
  if (
    user &&
    user.role !== "admin" &&
    !user.canEditOthersPosts &&
    post.authorId !== user.id
  ) {
    res.status(403).json({ error: "You can only edit your own posts" });
    return;
  }
  const [withCats] = await attachCategories([post]);
  res.json(withCats);
});


export default router;
