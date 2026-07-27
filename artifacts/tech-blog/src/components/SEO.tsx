import { useEffect } from "react";
import { Helmet } from "react-helmet-async";

/**
 * Head tags the SEO component manages. The static index.html (and, for
 * crawlers, the server's prerendered SEO block) ship one set of these tags;
 * react-helmet-async then inserts its own set WITHOUT removing the originals
 * (it only manages tags it created, marked with `data-rh`). JS-executing
 * crawlers like Bing's URL Inspection then see two titles / descriptions /
 * canonicals and flag the page. Once the React app renders, the server copies
 * are redundant, so we strip every managed tag that Helmet doesn't own.
 * JSON-LD scripts and all other head content are deliberately left alone.
 */
const MANAGED_SELECTOR = [
  'meta[name="description"]',
  'meta[name="keywords"]',
  'meta[name="robots"]',
  'meta[name="author"]',
  'link[rel="canonical"]',
  'meta[property^="og:"]',
  'meta[property^="article:"]',
  'meta[name^="twitter:"]',
].join(", ");

let serverTagsRemoved = false;

/** Test-only: allow re-running the one-time cleanup. */
export function __resetSeoDedupeForTests(): void {
  serverTagsRemoved = false;
}

/**
 * Remove the server-shipped copies of the SEO tags Helmet now owns. Only
 * elements BETWEEN the `SEO_HEAD_START`/`SEO_HEAD_END` comment markers are
 * touched, and only the managed kinds — JSON-LD scripts, preload links, and
 * everything Helmet inserts (which lands outside the markers) survive.
 */
export function removeServerRenderedSeoTags(doc: Document = document): void {
  const head = doc.head;
  if (!head) return;
  let inBlock = false;
  const toRemove: Element[] = [];
  const inBlockTitles: Element[] = [];
  for (const node of Array.from(head.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const text = (node.textContent ?? "").trim();
      if (text === "SEO_HEAD_START") inBlock = true;
      else if (text === "SEO_HEAD_END") inBlock = false;
      continue;
    }
    if (inBlock && node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (el.tagName === "TITLE") inBlockTitles.push(el);
      else if (el.matches(MANAGED_SELECTOR)) toRemove.push(el);
    }
  }
  for (const el of toRemove) el.remove();
  // <title> is special: Helmet updates it via `document.title`, which REUSES
  // the existing (server-shipped) element instead of creating its own. Only
  // remove the in-block title(s) when a duplicate exists outside the block —
  // otherwise the shared element must stay or the page loses its title.
  const totalTitles = head.querySelectorAll("title").length;
  if (totalTitles > inBlockTitles.length) {
    for (const el of inBlockTitles) el.remove();
  } else if (inBlockTitles.length > 1) {
    for (const el of inBlockTitles.slice(1)) el.remove();
  }
}

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article";
  publishedTime?: string;
  author?: string;
  keywords?: string[];
  noindex?: boolean;
}

const SITE_NAME = "Mapletechie";
const SITE_URL = "https://mapletechie.com";
const DEFAULT_IMAGE = `${SITE_URL}/api/og/site.png`;
const DEFAULT_DESCRIPTION =
  "Mapletechie — Your go-to source for tech news, gadget reviews, software deep dives, and the latest in AI, EVs, and cybersecurity.";

export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url,
  type = "website",
  publishedTime,
  author,
  keywords,
  noindex = false,
}: SEOProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Tech News & Reviews`;
  const canonicalUrl = url ? `${SITE_URL}${url}` : SITE_URL;
  const ogImage = image.startsWith("http") ? image : `${SITE_URL}${image}`;

  // One-time cleanup of the server-shipped SEO tags after Helmet has had a
  // chance to insert its own (Helmet flushes before effects run its rAF, so
  // run ours on mount — end state is exactly one tag of each kind).
  useEffect(() => {
    if (serverTagsRemoved) return;
    serverTagsRemoved = true;
    removeServerRenderedSeoTags();
  }, []);

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && keywords.length > 0 && (
        <meta name="keywords" content={keywords.join(", ")} />
      )}
      {noindex ? (
        <meta name="robots" content="noindex, follow" />
      ) : (
        <link rel="canonical" href={canonicalUrl} />
      )}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      {publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {author && <meta property="article:author" content={author} />}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:site" content="@mapletechie" />
    </Helmet>
  );
}
