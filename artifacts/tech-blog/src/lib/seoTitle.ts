/**
 * Compose the document <title> within a search-engine-friendly length budget.
 *
 * Bing (and Google) display roughly 60-65 characters of a title; anything
 * longer gets cut off arbitrarily in results and Bing's Site Scan flags it as
 * "Title too long". Rules, in order:
 *
 *   1. Page title + brand suffix fits the budget  -> "Page Title | Mapletechie"
 *   2. Page title alone fits                      -> "Page Title" (suffix dropped)
 *   3. Page title alone is still too long         -> word-boundary truncation + "…"
 *
 * Used by BOTH the client SEO component and the crawler prerender server so
 * browsers and search engines always see the same title.
 */

export const SEO_TITLE_MAX = 65;
export const BRAND_SUFFIX = " | Mapletechie";
export const DEFAULT_SITE_TITLE = "Mapletechie — Canadian Tech News, Gadget Reviews & AI";

export function buildSeoTitle(
  pageTitle?: string | null,
  suffix: string = BRAND_SUFFIX,
): string {
  const base = (pageTitle ?? "").trim();
  if (!base) return DEFAULT_SITE_TITLE;

  const full = `${base}${suffix}`;
  if (full.length <= SEO_TITLE_MAX) return full;
  if (base.length <= SEO_TITLE_MAX) return base;

  // Truncate at a word boundary where possible (falls back to a hard cut
  // only when there is no space past the halfway point, e.g. one giant
  // word), trimming trailing punctuation before appending the ellipsis.
  const cut = base.slice(0, SEO_TITLE_MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const truncated = (lastSpace > SEO_TITLE_MAX / 2 ? cut.slice(0, lastSpace) : cut)
    .replace(/[\s.,;:!?—–-]+$/, "");
  return `${truncated}…`;
}
