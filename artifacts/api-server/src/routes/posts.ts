import { Router } from "express";
import { db, postsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import {
  ListPostsQueryParams,
  GetPostParams,
  GetPostBySlugParams,
  GetLatestPostsQueryParams,
} from "@workspace/api-zod";
import { adminAuth } from "../middlewares/adminAuth";

const router = Router();

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

  // Determine status based on user permissions
  let status = "draft";
  if (!user) {
    // Legacy ADMIN_PASSWORD env auth — treat as full admin
    status = body.status === "draft" ? "draft" : "published";
  } else if (user.role === "admin") {
    status = body.status === "draft" ? "draft" : "published";
  } else if (user.canPublishDirectly) {
    status = body.status === "draft" ? "draft" : "published";
  } else {
    status = "draft";
  }

  const values = {
    title: String(body.title).trim(),
    slug: String(body.slug).trim(),
    excerpt: typeof body.excerpt === "string" && body.excerpt.trim() ? body.excerpt.trim() : "",
    content: String(body.content),
    coverImage: body.coverImage ?? null,
    category: String(body.category),
    tags: Array.isArray(body.tags) ? body.tags : [],
    author: user ? user.displayName : (body.author ?? "Mapletechie"),
    authorAvatar: user ? user.avatarUrl : (body.authorAvatar ?? null),
    authorId: user ? user.id : (body.authorId ?? null),
    readTime: typeof body.readTime === "number" ? body.readTime : 5,
    isFeatured: !!body.isFeatured,
    status,
    publishedAt: body.publishedAt ? new Date(body.publishedAt) : new Date(),
  };

  const [post] = await db.insert(postsTable).values(values).returning();
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
  const posts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.status, "published"))
    .orderBy(desc(postsTable.viewCount))
    .limit(5);
  res.json(posts);
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
    "publishedAt",
    "status",
  ] as const;

  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) update[k] = body[k];
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
