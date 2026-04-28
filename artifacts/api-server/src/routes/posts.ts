import { Router } from "express";
import { db, postsTable, usersTable, pageViewsTable, commentsTable } from "@workspace/db";
import { eq, desc, and, gte, sql, inArray } from "drizzle-orm";
import {
  ListPostsQueryParams,
  GetPostParams,
  GetPostBySlugParams,
  GetLatestPostsQueryParams,
} from "@workspace/api-zod";
import { adminAuth } from "../middlewares/adminAuth";
import { writeAuditLog } from "../lib/audit";
import sanitizeHtml from "sanitize-html";

const router = Router();

// Sanitize rich text HTML produced by the TipTap editor.
// Allow the formatting tags TipTap can produce; strip <script>, event handlers,
// inline styles, and javascript: URLs to prevent stored XSS.
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

router.get("/posts", async (req, res): Promise<void> => {
  const parsed = ListPostsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { category, limit = 20, offset = 0 } = parsed.data;

  const conditions = [eq(postsTable.status, "published")];
  if (category) conditions.push(eq(postsTable.category, category));

  const posts = await db
    .select()
    .from(postsTable)
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
    posts = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.authorId, user.id))
      .orderBy(desc(postsTable.createdAt));
  } else {
    posts = await db.select().from(postsTable).orderBy(desc(postsTable.createdAt));
  }
  res.json(posts);
});

router.post("/posts", adminAuth, async (req, res): Promise<void> => {
  const user = req.user;
  const body = req.body ?? {};

  // Required fields
  const required = ["title", "slug", "content", "category"];
  for (const f of required) {
    if (typeof body[f] !== "string" || !body[f].trim()) {
      res.status(400).json({ error: `Missing field: ${f}` });
      return;
    }
  }

  // Determine status based on user permissions. adminAuth always populates
  // req.user before reaching this handler, so the !user branch is gone.
  let status: string;
  if (user?.role === "admin" || user?.canPublishDirectly) {
    status = body.status === "draft" ? "draft" : "published";
  } else {
    status = "draft";
  }

  // If an admin assigns a different author by id, look that user up and use their data.
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
    category: String(body.category),
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

  const [post] = await db.insert(postsTable).values(values).returning();
  await writeAuditLog(req, {
    action: "post.create",
    entityType: "post",
    entityId: post.id,
    summary: `Created post "${post.title}" (${post.status})`,
  });
  res.status(201).json(post);
});

router.get("/posts/featured", async (_req, res): Promise<void> => {
  const posts = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.isFeatured, true), eq(postsTable.status, "published")))
    .orderBy(desc(postsTable.publishedAt))
    .limit(5);
  res.json(posts);
});

router.get("/posts/latest", async (req, res): Promise<void> => {
  const parsed = GetLatestPostsQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 6) : 6;
  const posts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.status, "published"))
    .orderBy(desc(postsTable.publishedAt))
    .limit(limit);
  res.json(posts);
});

router.get("/posts/trending", async (_req, res): Promise<void> => {
  // Top published posts by real reader page views over the last 30 days.
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

  let posts: typeof postsTable.$inferSelect[] = [];
  if (slugs.length > 0) {
    const found = await db
      .select()
      .from(postsTable)
      .where(and(eq(postsTable.status, "published"), inArray(postsTable.slug, slugs)));
    // Re-order by analytics rank
    const order = new Map(slugs.map((s, i) => [s, i]));
    posts = found.sort((a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99)).slice(0, 5);
  }

  // Fallback: if analytics has no data yet (or fewer than 3), top up with stored viewCount
  if (posts.length < 5) {
    const exclude = new Set(posts.map((p) => p.id));
    const filler = await db
      .select()
      .from(postsTable)
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
  // Top published posts by approved comment count.
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
  const found = await db
    .select()
    .from(postsTable)
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
  const [post] = await db
    .select()
    .from(postsTable)
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

  // Ownership check: editors can only edit their own posts
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
    "seoTitle",
    "seoDescription",
    "seoKeywords",
    "ogImage",
  ] as const;

  const update: Record<string, unknown> = {};
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
    } else {
      update[k] = body[k];
    }
  }

  // Editors without canPublishDirectly cannot publish; force back to draft
  if (user && user.role !== "admin" && !user.canPublishDirectly) {
    if (update.status === "published") update.status = "draft";
  }

  // Admin-only fields
  if (user?.role === "admin") {
    if ("author" in body) update.author = body.author;
    if ("authorAvatar" in body) update.authorAvatar = body.authorAvatar;
    if ("authorId" in body) update.authorId = body.authorId;
  }

  if (update.publishedAt && typeof update.publishedAt === "string") {
    update.publishedAt = new Date(update.publishedAt as string);
  }

  const [updated] = await db
    .update(postsTable)
    .set(update)
    .where(eq(postsTable.id, id))
    .returning();
  await writeAuditLog(req, {
    action: "post.update",
    entityType: "post",
    entityId: updated.id,
    summary: `Updated post "${updated.title}"`,
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
  });
  res.status(204).send();
});

router.get("/posts/:id", async (req, res): Promise<void> => {
  const parsed = GetPostParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [post] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.id, parsed.data.id));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(post);
});

export default router;
