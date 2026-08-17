import { Router } from "express";
import { db, postsTable, categoriesTable, postCategoriesTable } from "@workspace/db";
import { and, desc, eq, gte } from "drizzle-orm";

const router = Router();

/** Escape the five XML special characters in text content. */
function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

router.get("/news-sitemap.xml", async (req, res): Promise<void> => {
  const _siteDomain = process.env.SITE_DOMAIN || "https://mapletechie.com";
  const domain = _siteDomain.startsWith("http") ? _siteDomain : `https://${_siteDomain}`;

  // Two days ago (48-hour rolling window Google News requires).
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  // Fetch published posts in the "News" category (primary or secondary)
  // published within the last 48 hours, newest first, capped at 1,000.
  // DISTINCT ON post id guards against a post appearing in "news" twice
  // (e.g. if it were somehow inserted into post_categories twice).
  const rows = await db
    .selectDistinct({
      slug: postsTable.slug,
      title: postsTable.title,
      publishedAt: postsTable.publishedAt,
    })
    .from(postsTable)
    .innerJoin(postCategoriesTable, eq(postCategoriesTable.postId, postsTable.id))
    .innerJoin(categoriesTable, eq(categoriesTable.id, postCategoriesTable.categoryId))
    .where(
      and(
        eq(postsTable.status, "published"),
        gte(postsTable.publishedAt, cutoff),
        eq(categoriesTable.slug, "news"),
      ),
    )
    .orderBy(desc(postsTable.publishedAt))
    .limit(1_000);

  // Google's News sitemap spec requires at least one <url>. Return 404 when
  // the 48-hour window is empty so Google treats it as "no sitemap right now"
  // rather than flagging a "Missing XML tag" validation error.
  if (rows.length === 0) {
    res.status(404).type("text/plain").send("No news articles published in the last 48 hours.");
    return;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${rows
  .map(
    (p) => `  <url>
    <loc>${domain}/blog/${p.slug}</loc>
    <news:news>
      <news:publication>
        <news:name>Mapletechie</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${p.publishedAt.toISOString()}</news:publication_date>
      <news:title>${xmlEscape(p.title)}</news:title>
    </news:news>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);
});

export default router;
