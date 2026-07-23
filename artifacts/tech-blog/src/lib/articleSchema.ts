/**
 * Article structured data (JSON-LD) for blog-post pages.
 *
 * Shared by the crawler prerender server (server.ts) and the SPA blog-post
 * page so the schema human visitors' browsers emit via Helmet is
 * byte-for-byte the same NewsArticle schema Google gets in the prerendered
 * HTML. Both sides read the same `/api/posts/slug/:slug` record.
 */

export const DEFAULT_SITE_URL = "https://mapletechie.com";
export const DEFAULT_DESCRIPTION =
  "Mapletechie — Your go-to source for tech news, gadget reviews, software deep dives, and the latest in AI, EVs, and cybersecurity.";

export interface ArticleSchemaPost {
  slug: string;
  title: string;
  excerpt?: string | null;
  coverImage?: string | null;
  ogImage?: string | null;
  category?: string | null;
  tags?: string[] | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  author?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

function absUrl(siteUrl: string, maybeRelative: string | null | undefined, fallback: string): string {
  if (!maybeRelative) return fallback;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  return `${siteUrl}${maybeRelative.startsWith("/") ? "" : "/"}${maybeRelative}`;
}

/**
 * Builds the schema.org NewsArticle object for a post. Field precedence
 * (seoTitle over title, ogImage over coverImage, seoDescription over
 * excerpt) mirrors the OG/meta tags so every surface tells Google the
 * same story.
 */
export function buildArticleJsonLd(
  post: ArticleSchemaPost,
  opts: { siteUrl?: string } = {},
): Record<string, unknown> {
  const siteUrl = (opts.siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, "");
  const url = `${siteUrl}/blog/${post.slug}`;
  const title = post.seoTitle?.trim() || post.title;
  const description =
    post.seoDescription?.trim() || post.excerpt?.trim() || DEFAULT_DESCRIPTION;
  const image = absUrl(siteUrl, post.ogImage || post.coverImage, `${siteUrl}/opengraph-v2.jpg`);

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: title,
    description,
    image: [image],
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt ?? post.publishedAt ?? undefined,
    author: post.author ? { "@type": "Person", name: post.author } : undefined,
    publisher: {
      "@type": "Organization",
      name: "Mapletechie",
      logo: { "@type": "ImageObject", url: `${siteUrl}/logo-favicon-v2.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: post.category ?? undefined,
    keywords: post.tags?.join(", "),
  };
}
