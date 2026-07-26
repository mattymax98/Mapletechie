import { Router } from "express";
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
import { isExternalImageUrl, persistExternalImage, persistExternalImagesInHtml } from "../lib/persistExternalImage";
import sanitizeHtml from "sanitize-html";

const router = Router();

// Social embed provider whitelist — must stay in sync with the tech-blog
// frontend (src/lib/socialEmbedProviders.ts). Only URLs matching one of these
// patterns may survive as a `data-url` on a social-embed placeholder; anything
// else is stripped down to whatever plain content the div contains.
const SOCIAL_EMBED_URL_RE =
  /^https?:\/\/(?:(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/)|youtu\.be\/)[A-Za-z0-9_-]{6,20}|(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/[A-Za-z0-9_]{1,20}\/status(?:es)?\/\d{5,25}|(?:www\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/[A-Za-z0-9_-]{5,40}|(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d{5,25}|bsky\.app\/profile\/[A-Za-z0-9:%._-]+\/post\/[a-z0-9]{5,20}|(?:www\.|old\.|new\.)?reddit\.com\/r\/[A-Za-z0-9_]{2,21}\/comments\/[a-z0-9]{4,10}|[a-z0-9-]+(?:\.[a-z0-9-]+)+\/@[\w.-]+(?:@[\w.-]+)?\/\d{8,25}(?:[/?#]|$))/i;

const SOCIAL_EMBED_PROVIDERS = new Set([
  "youtube",
  "twitter",
  "instagram",
  "tiktok",
  "bluesky",
  "mastodon",
  "reddit",
]);

// Sanitize rich text HTML produced by the TipTap editor.
// Exported for tests.
export function cleanHtml(input: unknown): string {
  if (typeof input !== "string") return "";
  return sanitizeHtml(input, {
    allowedTags: [
      "p", "br", "hr",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "strong", "b", "em", "i", "u", "s", "strike", "sub", "sup",
      "ul", "ol", "li",
      "blockquote",
      "code", "pre",
      "a",
      "img",
      "span", "div",
      "table", "thead", "tbody", "tr", "th", "td",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      div: ["data-social-embed", "data-provider", "data-url"],
      "*": ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: {
      div: (tagName, attribs) => {
        // Social embed placeholders: keep the data-* attrs only when the URL
        // matches a whitelisted provider AND the provider tag is known.
        // Otherwise strip them so the frontend never hydrates an embed for an
        // arbitrary URL (the inner fallback link is preserved either way).
        if (!("data-social-embed" in attribs)) {
          const { "data-social-embed": _e, "data-provider": _p, "data-url": _u, ...rest } = attribs;
          return { tagName: "div", attribs: rest };
        }
        const url = attribs["data-url"] || "";
        const provider = (attribs["data-provider"] || "").toLowerCase();
        if (!SOCIAL_EMBED_URL_RE.test(url) || !SOCIAL_EMBED_PROVIDERS.has(provider)) {
          return { tagName: "div", attribs: { class: attribs.class || "" } };
        }
        return {
          tagName: "div",
          attribs: {
            class: attribs.class || "social-embed",
            "data-social-embed": "",
            "data-provider": provider,
            "data-url": url,
          },
        };
      },
      a: (tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          rel: "noopener noreferrer nofollow",
          target: attribs.target === "_self" ? "_self" : "_blank",
        },
      }),
    },
  });
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
  category: categoriesTable.name,
  categorySlug: categoriesTable.slug,
};

function postsBaseQuery() {
  return db
    .select(postColumnsWithCategory)
    .from(postsTable)
    .innerJoin(categoriesTable, eq(postsTable.categoryId, categoriesTable.id));
}

/**
 * Resolve an arbitrary category input (id, slug, or name) to a categoriesTable
 * row. Returns null if no match — callers should reject the request in that
 * case so the FK on posts.category_id is never violated.
 */
export async function resolveCategory(input: unknown) {
  if (input == null) return null;
  if (typeof input === "number" && Number.isFinite(input)) {
    const [row] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, input));
    return row ?? null;
  }
  const text = String(input).trim();
  if (!text) return null;
  const asNum = Number(text);
  if (Number.isInteger(asNum) && asNum > 0) {
    const [row] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, asNum));
    if (row) return row;
  }
  const [row] = await db
    .select()
    .from(categoriesTable)
    .where(
      or(
        eq(categoriesTable.slug, text),
        sql`lower(${categoriesTable.name}) = lower(${text})`,
      ),
    );
  return row ?? null;
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
    conditions.push(eq(postsTable.categoryId, cat.id));
  }

  const posts = await postsBaseQuery()
    .where(and(...conditions))
    .orderBy(desc(postsTable.publishedAt))
    .limit(limit)
    .offset(offset);

  res.json(posts);
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
  res.json(posts);
});

router.post("/posts", adminAuth, async (req, res): Promise<void> => {
  const user = req.user;
  const body = req.body ?? {};

  // Required fields
  const required = ["title", "slug", "content", "category"];
  for (const f of required) {
    const v = body[f];
    if (f === "category") {
      if (v == null || (typeof v !== "string" && typeof v !== "number") || (typeof v === "string" && !v.trim())) {
        res.status(400).json({ error: `Missing field: ${f}` });
        return;
      }
    } else if (typeof v !== "string" || !v.trim()) {
      res.status(400).json({ error: `Missing field: ${f}` });
      return;
    }
  }

  const resolvedCategory = await resolveCategory(body.category);
  if (!resolvedCategory) {
    res.status(400).json({ error: `Unknown category: ${String(body.category)}` });
    return;
  }

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

  const values = {
    title: String(body.title).trim(),
    slug: String(body.slug).trim(),
    excerpt: typeof body.excerpt === "string" && body.excerpt.trim() ? body.excerpt.trim() : "",
    // Sanitize first, then pull externally-hosted body images onto our own
    // storage (best-effort — failures keep the original URL, never block).
    content: await persistExternalImagesInHtml(cleanHtml(body.content), persistCtx),
    coverImage: body.coverImage ?? null,
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

  const [inserted] = await db.insert(postsTable).values(values).returning();
  // Re-fetch through the JOIN so we return the same shape as the read paths
  // (with `category` included).
  const [post] = await postsBaseQuery().where(eq(postsTable.id, inserted.id));
  await writeAuditLog(req, {
    action: "post.create",
    entityType: "post",
    entityId: post.id,
    summary: `Created post "${post.title}" (${post.status})`,
    details: { snapshot: inserted },
  });
  res.status(201).json(post);
});

router.get("/posts/featured", async (_req, res): Promise<void> => {
  const posts = await postsBaseQuery()
    .where(and(eq(postsTable.isFeatured, true), eq(postsTable.status, "published")))
    .orderBy(desc(postsTable.publishedAt))
    .limit(5);
  res.json(posts);
});

router.get("/posts/latest", async (req, res): Promise<void> => {
  const parsed = GetLatestPostsQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 6) : 6;
  const posts = await postsBaseQuery()
    .where(eq(postsTable.status, "published"))
    .orderBy(desc(postsTable.publishedAt))
    .limit(limit);
  res.json(posts);
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

  res.json(posts.slice(0, 5));
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
  res.json(ranked);
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
  res.json(post);
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
      update[k] = await persistExternalImagesInHtml(cleanHtml(body[k]), persistCtx);
    } else if (k === "seoTitle" || k === "seoDescription" || k === "verdict") {
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
      // Resolve the incoming category (slug/name/id) to a real row and
      // write the FK. The text cache column is gone, so this is the only
      // category-related write.
      const resolved = await resolveCategory(body[k]);
      if (!resolved) {
        res.status(400).json({ error: `Unknown category: ${String(body[k])}` });
        return;
      }
      update.categoryId = resolved.id;
      if (resolved.id !== previousCategoryId) categoryChanged = true;
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

  await db.transaction(async (tx) => {
    await tx
      .update(postsTable)
      .set(update)
      .where(eq(postsTable.id, id));

    // When a post moves between categories, recompute the cached postCount
    // for both the old and new category so the public category index stays
    // accurate. Mirrors the bulk reassign endpoint in categories.ts.
    if (categoryChanged) {
      const newCategoryId = (update.categoryId as number) ?? previousCategoryId;
      const idsToRefresh = new Set<number>();
      if (typeof previousCategoryId === "number") idsToRefresh.add(previousCategoryId);
      if (typeof newCategoryId === "number") idsToRefresh.add(newCategoryId);
      for (const catId of idsToRefresh) {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(postsTable)
          .where(eq(postsTable.categoryId, catId));
        await tx
          .update(categoriesTable)
          .set({ postCount: count })
          .where(eq(categoriesTable.id, catId));
      }
    }
  });
  // Re-fetch through the JOIN so the response includes the resolved category.
  const [updated] = await postsBaseQuery().where(eq(postsTable.id, id));
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
  res.json(updated);
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
      await tx
        .update(postsTable)
        .set({ categoryId: resolved.id })
        .where(inArray(postsTable.id, toMove.map((p) => p.id)));
      for (const catId of affectedCategoryIds) {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(postsTable)
          .where(eq(postsTable.categoryId, catId));
        await tx
          .update(categoriesTable)
          .set({ postCount: count })
          .where(eq(categoriesTable.id, catId));
      }
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
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(postsTable)
      .where(eq(postsTable.categoryId, cat.id));
    await tx.update(categoriesTable).set({ postCount: count }).where(eq(categoriesTable.id, cat.id));
  });

  const [restored] = await postsBaseQuery().where(eq(postsTable.id, id));
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

  await db.delete(postsTable).where(eq(postsTable.id, id));
  await writeAuditLog(req, {
    action: "post.delete",
    entityType: "post",
    entityId: id,
    summary: `Deleted post "${existing.title}"`,
    details: { snapshot: existing },
  });
  res.status(204).send();
});

router.get("/posts/:id", async (req, res): Promise<void> => {
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
  res.json(post);
});


export default router;
