import { Router } from "express";
import { db, postsTable } from "@workspace/db";
import { eq, desc, ilike, sql } from "drizzle-orm";
import {
  ListPostsQueryParams,
  CreatePostBody,
  GetPostParams,
  GetPostBySlugParams,
  GetLatestPostsQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/posts", async (req, res): Promise<void> => {
  const parsed = ListPostsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { category, limit = 20, offset = 0 } = parsed.data;

  let query = db.select().from(postsTable).orderBy(desc(postsTable.publishedAt));

  const posts = await db
    .select()
    .from(postsTable)
    .where(category ? eq(postsTable.category, category) : undefined)
    .orderBy(desc(postsTable.publishedAt))
    .limit(limit)
    .offset(offset);

  res.json(posts);
});

router.post("/posts", async (req, res): Promise<void> => {
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [post] = await db.insert(postsTable).values(parsed.data).returning();
  res.status(201).json(post);
});

router.get("/posts/featured", async (req, res): Promise<void> => {
  const posts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.isFeatured, true))
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
    .orderBy(desc(postsTable.publishedAt))
    .limit(limit);
  res.json(posts);
});

router.get("/posts/trending", async (req, res): Promise<void> => {
  const posts = await db
    .select()
    .from(postsTable)
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
    .where(eq(postsTable.slug, parsed.data.slug));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(post);
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
