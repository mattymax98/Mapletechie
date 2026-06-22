import { Router } from "express";
import { db, postsTable, usersTable, pageViewsTable, commentsTable, categoriesTable } from "@workspace/db";
import { eq, desc, and, gte, sql, inArray, or, getTableColumns } from "drizzle-orm";
import {
  ListPostsQueryParams,
  GetPostParams,
  GetPostBySlugParams,
  GetLatestPostsQueryParams,
} from "@workspace/api-zod";
import { adminAuth } from "../middlewares/adminAuth";
import { writeAuditLog } from "../lib/audit";
import { validateCoverImage } from "../lib/coverImageValidation";
import { isExternalImageUrl, persistExternalImage } from "../lib/persistExternalImage";
import sanitizeHtml from "sanitize-html";

const router = Router();

// Sanitize rich text HTML produced by the TipTap editor.
function cleanHtml(input: unknown): string {
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
      "*": ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: {
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

function cleanText(input: unknown): string | null {
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
async function resolveCategory(input: unknown) {
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

// Admin posts list — returns ALL posts (drafts included). Editors see their own; admins see everyone's.
router.get("/admin/posts", adminAuth, async (req, res): Promise<void> => {
  const user = req.user;
  let posts;
  if (user && user.role !== "admin") {
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
  if (isExternalImageUrl(body.coverImage)) {
    body.coverImage = await persistExternalImage(body.coverImage);
  }
  if (isExternalImageUrl(body.ogImage)) {
    body.ogImage = await persistExternalImage(body.ogImage);
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
    content: cleanHtml(body.content),
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
  if (user && user.role !== "admin" && existing.authorId !== user.id) {
    res.status(403).json({ error: "You can only edit your own posts" });
    return;
  }

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
  ] as const;

  const update: Record<string, unknown> = {};
  let categoryChanged = false;
  const previousCategoryId = existing.categoryId;
  for (const k of allowed) {
    if (!(k in body)) continue;
    if (k === "content") {
      update[k] = cleanHtml(body[k]);
    } else if (k === "seoTitle" || k === "seoDescription") {
      update[k] = cleanText(body[k]);
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
        ? await persistExternalImage(body[k])
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
