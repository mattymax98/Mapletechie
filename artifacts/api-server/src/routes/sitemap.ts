import { Router } from "express";
import { db, postsTable, categoriesTable, usersTable, seriesTable, jobsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";

const router = Router();

router.get("/sitemap.xml", async (req, res): Promise<void> => {
  const domain = process.env.SITE_DOMAIN || "https://mapletechie.com";

  const [posts, categories, authors, allSeries, jobs, tagRows] = await Promise.all([
    db
      .select({ slug: postsTable.slug, publishedAt: postsTable.publishedAt })
      .from(postsTable)
      .where(eq(postsTable.status, "published"))
      .orderBy(desc(postsTable.publishedAt)),

    db
      .select({ slug: categoriesTable.slug })
      .from(categoriesTable),

    db
      .select({ username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.isActive, true)),

    db
      .select({ slug: seriesTable.slug })
      .from(seriesTable),

    db
      .select({ slug: jobsTable.slug })
      .from(jobsTable)
      .where(eq(jobsTable.isActive, true)),

    db.execute(sql`
      SELECT DISTINCT lower(tag) AS tag
      FROM ${postsTable}, unnest(${postsTable.tags}) AS tag
      WHERE ${postsTable.status} = 'published'
      ORDER BY tag
    `),
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

  const categoryUrls: SitemapEntry[] = categories.map((c) => ({
    loc: `${domain}/category/${c.slug}`,
    priority: "0.7",
    changefreq: "weekly",
  }));

  const postUrls: SitemapEntry[] = posts.map((p) => ({
    loc: `${domain}/blog/${p.slug}`,
    priority: "0.8",
    changefreq: "monthly",
    lastmod: p.publishedAt ? new Date(p.publishedAt).toISOString().split("T")[0] : undefined,
  }));

  const authorUrls: SitemapEntry[] = authors.map((u) => ({
    loc: `${domain}/author/${u.username}`,
    priority: "0.6",
    changefreq: "weekly",
  }));

  const seriesUrls: SitemapEntry[] = allSeries.map((s) => ({
    loc: `${domain}/series/${s.slug}`,
    priority: "0.6",
    changefreq: "weekly",
  }));

  const jobUrls: SitemapEntry[] = jobs.map((j) => ({
    loc: `${domain}/careers/${j.slug}`,
    priority: "0.6",
    changefreq: "weekly",
  }));

  const tags = (tagRows.rows ?? (tagRows as unknown as { tag: string }[])) as { tag: string }[];
  const tagUrls: SitemapEntry[] = tags.map((r) => ({
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
