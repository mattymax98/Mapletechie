import { Router } from "express";
import { db, postsTable, categoriesTable, usersTable, seriesTable, jobsTable, topicClustersTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { getSiteUrl } from "../lib/siteUrl";
import { isTopicClusterPublic } from "../lib/topicClusters";

const router = Router();
const SLUG_SEGMENT_RE = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
// Usernames support dots and underscores in the admin API, so they need their
// own sitemap guard instead of inheriting the stricter content-slug rule.
const USERNAME_SEGMENT_RE = /^[a-z0-9]+(?:[a-z0-9._-]*[a-z0-9])?$/i;
// Thin one- and two-post tag archives add crawl inventory without acting as
// useful discovery hubs. Keep them usable on-site, but only advertise a tag
// in the sitemap once it has enough published depth to justify crawling.
const MIN_TAG_POSTS_FOR_SITEMAP = 3;

/**
 * The sitemap must never be the source of malformed paths. Slugs are normally
 * validated before they reach the database, but this final guard prevents
 * legacy/manual rows such as "mapletechie.com" from being published to Google.
 */
function isPublicSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_SEGMENT_RE.test(value);
}

function isPublicUsername(value: unknown): value is string {
  return typeof value === "string" && USERNAME_SEGMENT_RE.test(value);
}

// Some crawlers and old links hit /sitemap/xml (slash) instead of /sitemap.xml (dot)
router.get("/sitemap/xml", (_req, res) => {
  res.redirect(301, "/api/sitemap.xml");
});

router.get("/sitemap.xml", async (req, res): Promise<void> => {
  const domain = getSiteUrl();

  const [posts, categories, authors, allSeries, jobs, tagRows, topicClusters] = await Promise.all([
    db
      .select({ slug: postsTable.slug, publishedAt: postsTable.publishedAt, contentModifiedAt: postsTable.contentModifiedAt })
      .from(postsTable)
      .where(eq(postsTable.status, "published"))
      .orderBy(desc(postsTable.publishedAt)),

    db
      .select({ slug: categoriesTable.slug })
      .from(categoriesTable),

    db
      .select({ username: usersTable.username })
      .from(usersTable)
      .innerJoin(postsTable, eq(postsTable.authorId, usersTable.id))
      .where(sql`${usersTable.isActive} = true AND ${postsTable.status} = 'published'`)
      .groupBy(usersTable.username),

    db
      .select({ slug: seriesTable.slug })
      .from(seriesTable)
      .where(sql`EXISTS (SELECT 1 FROM ${postsTable} WHERE ${postsTable.seriesId} = ${seriesTable.id} AND ${postsTable.status} = 'published')`),

    db
      .select({ slug: jobsTable.slug })
      .from(jobsTable)
      .where(eq(jobsTable.isActive, true)),

    db.execute(sql`
      SELECT lower(tag) AS tag, COUNT(*)::int AS published_count
      FROM ${postsTable}, unnest(${postsTable.tags}) AS tag
      WHERE ${postsTable.status} = 'published'
      GROUP BY lower(tag)
      HAVING COUNT(*) >= ${MIN_TAG_POSTS_FOR_SITEMAP}
      ORDER BY tag
    `),

    db
      .select({
        slug: topicClustersTable.slug,
        isPublic: topicClustersTable.isPublic,
        publishedCount: sql<number>`count(*)::int`,
      })
      .from(topicClustersTable)
      .innerJoin(postsTable, eq(postsTable.clusterId, topicClustersTable.id))
      .where(and(
        eq(topicClustersTable.isPublic, true),
        eq(postsTable.status, "published"),
      ))
      .groupBy(topicClustersTable.slug, topicClustersTable.isPublic),
  ]);

  type SitemapEntry = {
    loc: string;
    priority: string;
    changefreq: string;
    lastmod?: string;
  };

  const staticPages: SitemapEntry[] = [
    { loc: `${domain}/`, priority: "1.0", changefreq: "daily" },
    { loc: `${domain}/blog`, priority: "0.9", changefreq: "daily" },
    { loc: `${domain}/about`, priority: "0.6", changefreq: "monthly" },
    { loc: `${domain}/contact`, priority: "0.5", changefreq: "monthly" },
    { loc: `${domain}/advertise`, priority: "0.5", changefreq: "monthly" },
    { loc: `${domain}/careers`, priority: "0.6", changefreq: "weekly" },
    { loc: `${domain}/privacy`, priority: "0.3", changefreq: "yearly" },
    { loc: `${domain}/terms`, priority: "0.3", changefreq: "yearly" },
  ];

  const categoryUrls: SitemapEntry[] = categories
    .filter((c) => isPublicSlug(c.slug))
    .map((c) => ({
      loc: `${domain}/category/${c.slug}`,
      priority: "0.7",
      changefreq: "weekly",
    }));

  const postUrls: SitemapEntry[] = posts
    .filter((p) => isPublicSlug(p.slug))
    .map((p) => ({
      loc: `${domain}/blog/${p.slug}`,
      priority: "0.8",
      changefreq: "monthly",
       lastmod: p.contentModifiedAt || p.publishedAt
         ? new Date(p.contentModifiedAt ?? p.publishedAt).toISOString().split("T")[0]
         : undefined,
    }));

  const authorUrls: SitemapEntry[] = authors
    .filter((u) => isPublicUsername(u.username))
    .map((u) => ({
      loc: `${domain}/author/${u.username}`,
      priority: "0.6",
      changefreq: "weekly",
    }));

  const seriesUrls: SitemapEntry[] = allSeries
    .filter((s) => isPublicSlug(s.slug))
    .map((s) => ({
      loc: `${domain}/series/${s.slug}`,
      priority: "0.6",
      changefreq: "weekly",
    }));

  const topicUrls: SitemapEntry[] = topicClusters
    .filter((topic) => isTopicClusterPublic(topic, topic.publishedCount) && isPublicSlug(topic.slug))
    .map((topic) => ({
      loc: `${domain}/topics/${topic.slug}`,
      priority: "0.6",
      changefreq: "weekly",
    }));
  const topicsIndexUrl: SitemapEntry[] = topicUrls.length
    ? [{ loc: `${domain}/topics`, priority: "0.7", changefreq: "weekly" }]
    : [];

  const jobUrls: SitemapEntry[] = jobs
    .filter((j) => isPublicSlug(j.slug))
    .map((j) => ({
      loc: `${domain}/careers/${j.slug}`,
      priority: "0.6",
      changefreq: "weekly",
    }));

  type SitemapTagRow = { tag: string; published_count: number | string };
  const tags = (tagRows.rows ?? (tagRows as unknown as SitemapTagRow[])) as SitemapTagRow[];
  const tagUrls: SitemapEntry[] = tags
    // Defensive application-side guard in addition to SQL HAVING. This keeps
    // the sitemap policy explicit even if the query is later refactored.
    .filter((r) => Number(r.published_count) >= MIN_TAG_POSTS_FOR_SITEMAP)
    .map((r) => ({
      loc: `${domain}/tag/${encodeURIComponent(r.tag)}`,
      priority: "0.5",
      changefreq: "weekly",
    }));

  const allUrls: SitemapEntry[] = [
    ...staticPages,
    ...categoryUrls,
    ...postUrls,
    ...authorUrls,
    ...seriesUrls,
    ...topicsIndexUrl,
    ...topicUrls,
    ...jobUrls,
    ...tagUrls,
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}
  </url>`
  )
  .join("\n")}
</urlset>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);
});

export default router;
