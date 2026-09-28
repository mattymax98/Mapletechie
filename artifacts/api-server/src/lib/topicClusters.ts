import { and, eq, inArray, sql } from "drizzle-orm";
import { db, postsTable, topicClustersTable } from "@workspace/db";

export type TopicClusterPublicFields = {
  isPublic: boolean;
};

/** Public topics require visibility plus at least three published articles. */
export function isTopicClusterPublic(
  cluster: TopicClusterPublicFields,
  publishedPostCount: number,
): boolean {
  return cluster.isPublic && publishedPostCount >= 3;
}

export async function attachPublicTopicContext<T extends {
  id: number;
  status?: string;
  clusterId?: number | null;
  clusterRole?: string | null;
}>(posts: T[]): Promise<(T & { topicCluster: null | {
  id: number;
  name: string;
  slug: string;
  introduction: string;
  role: string;
} })[]> {
  if (!posts.length) return [];
  const topicIds = [...new Set(posts.flatMap((post) =>
    post.status === "published" && post.clusterId != null ? [post.clusterId] : [],
  ))];
  if (!topicIds.length) return posts.map((post) => ({ ...post, topicCluster: null }));

  const clusters = await db.select().from(topicClustersTable).where(inArray(topicClustersTable.id, topicIds));
  const publishedCounts = await db.select({
    clusterId: postsTable.clusterId,
    count: sql<number>`count(*)::int`,
  }).from(postsTable).where(and(
    inArray(postsTable.clusterId, topicIds),
    eq(postsTable.status, "published"),
  )).groupBy(postsTable.clusterId);
  const countByCluster = new Map(publishedCounts.map((row) => [row.clusterId, row.count]));
  const publicClusters = new Map(clusters
    .filter((cluster) => isTopicClusterPublic(cluster, countByCluster.get(cluster.id) ?? 0))
    .map((cluster) => [cluster.id, cluster]));

  return posts.map((post) => {
    const cluster = post.status !== "published" || post.clusterId == null
      ? undefined
      : publicClusters.get(post.clusterId);
    return {
      ...post,
      topicCluster: cluster ? {
        id: cluster.id,
        name: cluster.name,
        slug: cluster.slug,
        introduction: cluster.introduction,
        role: post.clusterRole ?? "supporting",
      } : null,
    };
  });
}