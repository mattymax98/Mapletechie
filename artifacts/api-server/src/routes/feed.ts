import { Router } from "express";
import { db, postsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

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

router.get("/feed.xml", async (_req, res): Promise<void> => {
  const domain = process.env.SITE_DOMAIN || "https://mapletechie.com";

  const posts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.status, "published"))
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

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Mapletechie</title>
    <link>${domain}</link>
    <atom:link href="${domain}/api/feed.xml" rel="self" type="application/rss+xml" />
    <description>Independent tech news, gadget reviews, and deep dives in AI, EVs, and cybersecurity.</description>
    <language>en-ca</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
  </channel>
</rss>`;

  res.header("Content-Type", "application/rss+xml; charset=utf-8");
  res.send(xml);
});

export default router;
