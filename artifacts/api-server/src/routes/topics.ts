import { Router } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, postsTable, topicClustersTable } from "@workspace/db";
import { adminAuth, requireRole } from "../middlewares/adminAuth";
import { isTopicClusterPublic } from "../lib/topicClusters";

const router = Router();
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type TopicInput = { name: string; slug: string; introduction: string; isPublic: boolean };

function parseTopicInput(body: unknown): TopicInput | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  if (typeof value.name !== "string" || !value.name.trim() ||
      typeof value.slug !== "string" || !SLUG_RE.test(value.slug) ||
      typeof value.introduction !== "string" || !value.introduction.trim() ||
      typeof value.isPublic !== "boolean") return null;
  return {
    name: value.name.trim(),
    slug: value.slug,
    introduction: value.introduction.trim(),
    isPublic: value.isPublic,
  };
}

async function topicAdminRows() {
  const topics = await db.select().from(topicClustersTable).orderBy(asc(topicClustersTable.name));
  if (!topics.length) return [];
  const members = await db.select({
    id: postsTable.id,
    title: postsTable.title,
    slug: postsTable.slug,
    status: postsTable.status,
    clusterId: postsTable.clusterId,
    clusterRole: postsTable.clusterRole,
  }).from(postsTable).where(inArray(postsTable.clusterId, topics.map((topic) => topic.id)))
    .orderBy(asc(postsTable.title));
  return topics.map((topic) => {
    const posts = members.filter((post) => post.clusterId === topic.id);
    const publishedCount = posts.filter((post) => post.status === "published").length;
    return {
      ...topic,
      publishedCount,
      ready: publishedCount >= 3,
      posts,
    };
  });
}

router.get("/admin/topics", adminAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  res.json(await topicAdminRows());
});

router.post("/admin/topics", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const input = parseTopicInput(req.body);
  if (!input) {
    res.status(400).json({ error: "Provide a name, lowercase hyphenated slug, introduction, and isPublic boolean." });
    return;
  }
  if (input.isPublic) {
    res.status(409).json({ error: "A topic needs at least three published articles before it can be made public." });
    return;
  }
  const [duplicate] = await db.select({ id: topicClustersTable.id }).from(topicClustersTable)
    .where(eq(topicClustersTable.slug, input.slug)).limit(1);
  if (duplicate) {
    res.status(409).json({ error: "A topic with this slug already exists." });
    return;
  }
  const [topic] = await db.insert(topicClustersTable).values(input).returning();
  res.status(201).json({ ...topic, publishedCount: 0, ready: false, posts: [] });
});

router.put("/admin/topics/:id", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const input = parseTopicInput(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !input) {
    res.status(400).json({ error: "Invalid topic id or topic fields." });
    return;
  }
  const [existing] = await db.select({ id: topicClustersTable.id, slug: topicClustersTable.slug }).from(topicClustersTable)
    .where(eq(topicClustersTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Topic not found." });
    return;
  }
  if (input.slug !== existing.slug) {
    res.status(400).json({ error: "Topic slugs are permanent once created, so existing links keep working." });
    return;
  }
  if (input.isPublic) {
    const [published] = await db.select({ value: sql<number>`count(*)::integer` }).from(postsTable)
      .where(and(eq(postsTable.clusterId, id), eq(postsTable.status, "published")));
    if ((published?.value ?? 0) < 3) {
      res.status(409).json({ error: "A topic needs at least three published articles before it can be made public." });
      return;
    }
  }
  const [duplicate] = await db.select({ id: topicClustersTable.id }).from(topicClustersTable)
    .where(eq(topicClustersTable.slug, input.slug)).limit(1);
  if (duplicate && duplicate.id !== id) {
    res.status(409).json({ error: "A topic with this slug already exists." });
    return;
  }
  const [topic] = await db.update(topicClustersTable)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(topicClustersTable.id, id)).returning();
  const rows = await topicAdminRows();
  res.json(rows.find((row) => row.id === topic.id) ?? topic);
});

router.get("/topics", async (_req, res): Promise<void> => {
  const topics = await db.select().from(topicClustersTable).where(eq(topicClustersTable.isPublic, true))
    .orderBy(asc(topicClustersTable.name));
  if (!topics.length) {
    res.json([]);
    return;
  }
  const members = await db.select({
    clusterId: postsTable.clusterId,
  }).from(postsTable).where(and(
    inArray(postsTable.clusterId, topics.map((topic) => topic.id)),
    eq(postsTable.status, "published"),
  ));
  const publishedCounts = new Map<number, number>();
  for (const post of members) {
    if (post.clusterId != null) publishedCounts.set(post.clusterId, (publishedCounts.get(post.clusterId) ?? 0) + 1);
  }
  res.json(topics.filter((topic) => isTopicClusterPublic(topic, publishedCounts.get(topic.id) ?? 0)));
});

router.get("/topics/:slug", async (req, res): Promise<void> => {
  const [topic] = await db.select().from(topicClustersTable)
    .where(and(eq(topicClustersTable.slug, req.params.slug), eq(topicClustersTable.isPublic, true))).limit(1);
  if (!topic) {
    res.status(404).json({ error: "Topic not found." });
    return;
  }
  const posts = await db.select().from(postsTable).where(and(
    eq(postsTable.clusterId, topic.id),
    eq(postsTable.status, "published"),
  )).orderBy(
    sql`case when ${postsTable.clusterRole} = 'pillar' then 0 else 1 end`,
    desc(postsTable.publishedAt),
    desc(postsTable.id),
  );
  if (!isTopicClusterPublic(topic, posts.length)) {
    res.status(404).json({ error: "Topic not found." });
    return;
  }
  res.json({
    cluster: topic,
    posts: posts.map(({ clusterId: _clusterId, clusterRole: _clusterRole, ...post }) => ({
      ...post,
      clusterId: topic.id,
      clusterRole: _clusterRole,
    })),
  });
});

export default router;