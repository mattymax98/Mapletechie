import { Router, type Request, type Response } from "express";
import { db, postsTable, categoriesTable } from "@workspace/db";
import { and, desc, eq, getTableColumns } from "drizzle-orm";

const router = Router();

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

interface CategoryInfo {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
}

/**
 * Render the RSS feed. When `category` is provided, the feed contains only
 * that category's published posts and the channel metadata/self link reflect
 * the per-category feed URL; otherwise it is the unchanged site-wide feed.
 */
async function sendFeed(res: Response, category?: CategoryInfo): Promise<void> {
  const domain = process.env.SITE_DOMAIN || "https://mapletechie.com";

  const where = category
    ? and(eq(postsTable.status, "published"), eq(postsTable.categoryId, category.id))
    : eq(postsTable.status, "published");

  const posts = await db
    .select({ ...getTableColumns(postsTable), category: categoriesTable.name })
    .from(postsTable)
    .innerJoin(categoriesTable, eq(postsTable.categoryId, categoriesTable.id))
    .where(where)
    .orderBy(desc(postsTable.publishedAt))
    .limit(50);

  const lastBuild = posts[0]?.publishedAt
    ? new Date(posts[0].publishedAt).toUTCString()
    : new Date().toUTCString();

  const items = posts
    .map((p) => {
      const link = `${domain}/blog/${p.slug}`;
      const pubDate = p.publishedAt ? new Date(p.publishedAt).toUTCString() : new Date().toUTCString();
      const summary = p.excerpt || stripHtml(p.content || "").slice(0, 280);
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <author>noreply@mapletechie.com (${escapeXml(p.author || "Mapletechie")})</author>
      ${p.category ? `<category>${escapeXml(p.category)}</category>` : ""}
      <description>${escapeXml(summary)}</description>
    </item>`;
    })
    .join("\n");

  const channelTitle = category ? `Mapletechie — ${category.name}` : "Mapletechie";
  const channelLink = category ? `${domain}/category/${category.slug}` : domain;
  const selfHref = category
    ? `${domain}/api/category/${category.slug}/feed.xml`
    : `${domain}/api/feed.xml`;
  const channelDescription = category
    ? category.description?.trim() ||
      `The latest ${category.name} stories, reviews, and analysis on Mapletechie.`
    : "Independent tech news, gadget reviews, and deep dives in AI, EVs, and cybersecurity.";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channelTitle)}</title>
    <link>${escapeXml(channelLink)}</link>
    <atom:link href="${escapeXml(selfHref)}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(channelDescription)}</description>
    <language>en-ca</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
  </channel>
</rss>`;

  res.header("Content-Type", "application/rss+xml; charset=utf-8");
  res.send(xml);
}

router.get("/feed.xml", async (_req, res): Promise<void> => {
  await sendFeed(res);
});

router.get("/category/:slug/feed.xml", async (req: Request, res: Response): Promise<void> => {
  const slug = req.params.slug;
  const [category] = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.slug, slug))
    .limit(1);
  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  await sendFeed(res, category);
});

export default router;
