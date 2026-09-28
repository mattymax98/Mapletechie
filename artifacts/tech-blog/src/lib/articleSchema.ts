/**
 * Article structured data (JSON-LD) for blog-post pages.
 *
 * Shared by the crawler prerender server (server.ts) and the SPA blog-post
 * page so the schema human visitors' browsers emit via Helmet is
 * byte-for-byte the same Article schema Google gets in the prerendered
 * HTML. Both sides read the same `/api/posts/slug/:slug` record.
 */

export const DEFAULT_SITE_URL = "https://www.mapletechie.com";
export const DEFAULT_DESCRIPTION =
  "Mapletechie — Your go-to source for tech news, gadget reviews, software deep dives, and the latest in AI, EVs, and cybersecurity.";

export interface ArticleSchemaPost {
  slug: string;
  title: string;
  excerpt?: string | null;
  coverImage?: string | null;
  ogImage?: string | null;
  category?: string | null;
  categorySlug?: string | null;
  tags?: string[] | null;
  publishedAt?: string | null;
  contentModifiedAt?: string | null;
  authorUsername?: string | null;
  author?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

function absUrl(siteUrl: string, maybeRelative: string | null | undefined, fallback: string): string {
  if (!maybeRelative) return fallback;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  return `${siteUrl}${maybeRelative.startsWith("/") ? "" : "/"}${maybeRelative}`;
}

function articleImageUrls(
  siteUrl: string,
  coverImage: string | null | undefined,
  ogImage: string | null | undefined,
): string[] {
  const images: string[] = [];
  const add = (url: string) => {
    if (!images.includes(url)) images.push(url);
  };

  // Keep the independently-authored OG image first, if one is configured.
  if (ogImage) {
    const ogStoragePath = ogImage.startsWith("/api/storage/objects/")
      ? ogImage : ogImage.startsWith(`${siteUrl}/api/storage/objects/`)
        ? ogImage.slice(siteUrl.length) : "";
    add(absUrl(siteUrl, ogStoragePath
      ? ogStoragePath.replace("/api/storage/objects/", "/api/storage/img-social/objects/")
      : ogImage, `${siteUrl}/opengraph-v2.jpg`));
  }
  if (coverImage) {
    const storagePath = /^https?:\/\//i.test(coverImage)
      ? coverImage.startsWith(`${siteUrl}/`) ? coverImage.slice(siteUrl.length) : ""
      : coverImage;
    const match = storagePath.split("?")[0].match(/^\/api\/storage\/objects\/(.+)$/);
    if (match) {
      for (const ratio of ["16-9", "4-3", "1-1"]) {
        add(`${siteUrl}/api/storage/img-ratio/${ratio}/objects/${match[1]}`);
      }
    }
    // Keep the full source/legacy image as fallback for existing clients and
    // sources that cannot provide all three crops.
    add(absUrl(siteUrl, coverImage, `${siteUrl}/opengraph-v2.jpg`));
  } else if (!ogImage) {
    add(`${siteUrl}/opengraph-v2.jpg`);
  }
  return images;
}

/**
 * Builds the schema.org Article object for a post. Field precedence
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
  const images = articleImageUrls(siteUrl, post.coverImage, post.ogImage);

  return {
    "@context": "https://schema.org",
    "@type": post.categorySlug === "news" || post.category?.toLowerCase() === "news"
      ? "NewsArticle" : post.categorySlug === "reviews" ? "Article" : "BlogPosting",
    headline: title,
    description,
    image: images,
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.contentModifiedAt ?? post.publishedAt ?? undefined,
    author: post.author ? {
      "@type": "Person", name: post.author,
      ...(post.authorUsername ? { url: `${siteUrl}/author/${encodeURIComponent(post.authorUsername)}` } : {}),
    } : undefined,
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

/**
 * Builds the schema.org BreadcrumbList (Home > Blog > Category > Title) for a
 * post. Shared by the crawler prerender server and the SPA blog-post page so
 * Google sees the same trail whether or not it renders JavaScript. The
 * category crumb is omitted when the post has no category; positions stay
 * sequential either way.
 */
export function buildBreadcrumbJsonLd(
  post: ArticleSchemaPost,
  opts: { siteUrl?: string } = {},
): Record<string, unknown> {
  const siteUrl = (opts.siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, "");
  const url = `${siteUrl}/blog/${post.slug}`;

  const crumbs: BreadcrumbItem[] = [
    { name: "Home", item: siteUrl },
    { name: "Blog", item: `${siteUrl}/blog` },
  ];
  if (post.category) {
    crumbs.push({
      name: post.category,
      item: `${siteUrl}/category/${post.categorySlug ?? post.category}`,
    });
  }
  crumbs.push({ name: post.title, item: url });

  return buildTrailBreadcrumbJsonLd(crumbs);
}

export interface BreadcrumbItem {
  name: string;
  item: string;
}

/**
 * Generic BreadcrumbList JSON-LD builder. Pass the full crumb trail (including
 * "Home"); positions are assigned sequentially. Shared by the post, category,
 * and author breadcrumb builders so every page emits an identical schema shape.
 */
export function buildTrailBreadcrumbJsonLd(
  crumbs: BreadcrumbItem[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.item,
    })),
  };
}

/**
 * BreadcrumbList (Home > Blog > Category) for a category archive page.
 * Shared by the crawler prerender server and the SPA category page.
 */
export function buildCategoryBreadcrumbJsonLd(
  category: { name: string; slug: string },
  opts: { siteUrl?: string } = {},
): Record<string, unknown> {
  const siteUrl = (opts.siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, "");
  return buildTrailBreadcrumbJsonLd([
    { name: "Home", item: siteUrl },
    { name: "Blog", item: `${siteUrl}/blog` },
    { name: category.name, item: `${siteUrl}/category/${category.slug}` },
  ]);
}

/**
 * BreadcrumbList (Home > Author) for an author profile page.
 * Shared by the crawler prerender server and the SPA author page.
 */
export function buildAuthorBreadcrumbJsonLd(
  author: { username: string; displayName?: string | null },
  opts: { siteUrl?: string } = {},
): Record<string, unknown> {
  const siteUrl = (opts.siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, "");
  return buildTrailBreadcrumbJsonLd([
    { name: "Home", item: siteUrl },
    {
      name: author.displayName || author.username,
      item: `${siteUrl}/author/${author.username}`,
    },
  ]);
}
