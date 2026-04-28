import { Router } from "express";
import { db, postsTable, categoriesTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

router.get("/sitemap.xml", async (req, res): Promise<void> => {
  const domain = process.env.SITE_DOMAIN || "https://mapletechie.com";

  const posts = await db
    .select({ slug: postsTable.slug, publishedAt: postsTable.publishedAt })
    .from(postsTable)
    .orderBy(desc(postsTable.publishedAt));

  const categories = await db
    .select({ slug: categoriesTable.slug })
    .from(categoriesTable);

  type SitemapEntry = {
    loc: string;
    priority: string;
    changefreq: string;
    lastmod?: string;
  };

  const staticPages: SitemapEntry[] = [
    { loc: `${domain}/`, priority: "1.0", changefreq: "daily" },
    { loc: `${domain}/blog`, priority: "0.9", changefreq: "daily" },
    { loc: `${domain}/shop`, priority: "0.7", changefreq: "weekly" },
    { loc: `${domain}/contact`, priority: "0.5", changefreq: "monthly" },
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

  const allUrls: SitemapEntry[] = [...staticPages, ...categoryUrls, ...postUrls];

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
