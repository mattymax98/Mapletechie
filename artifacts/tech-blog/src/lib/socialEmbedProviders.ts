/**
 * Social embed provider whitelist shared by the editor (paste detection,
 * placeholder card) and the article renderer (hydration). Only URLs that
 * match one of these providers are ever turned into an embed — everything
 * else stays a plain link. The API server enforces the same patterns when
 * sanitizing saved article HTML (see api-server posts route).
 */

export type SocialProvider = "youtube" | "twitter" | "instagram" | "tiktok";

export interface ParsedSocialEmbed {
  provider: SocialProvider;
  /** Canonical URL to store on the embed block. */
  url: string;
  /** Provider-specific ID (video id, tweet id, post shortcode...). */
  id: string;
}

const YOUTUBE_RE =
  /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/i;
const TWITTER_RE =
  /^https?:\/\/(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,20})\/status(?:es)?\/(\d{5,25})/i;
const INSTAGRAM_RE =
  /^https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})/i;
const TIKTOK_RE =
  /^https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d{5,25})/i;

export function parseSocialUrl(raw: string): ParsedSocialEmbed | null {
  const url = (raw || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;

  let m = url.match(YOUTUBE_RE);
  if (m) return { provider: "youtube", url, id: m[1] };

  m = url.match(TWITTER_RE);
  if (m) return { provider: "twitter", url, id: m[2] };

  m = url.match(INSTAGRAM_RE);
  if (m) return { provider: "instagram", url, id: m[1] };

  m = url.match(TIKTOK_RE);
  if (m) return { provider: "tiktok", url, id: m[1] };

  return null;
}

/**
 * Extract every social-embed placeholder from saved article HTML.
 * Placeholders are `<div data-social-embed data-provider="…" data-url="…">`
 * (see SocialEmbedExtension). Used by the crawler prerender server, which has
 * no DOM — so this is a conservative regex scan of the opening tags only.
 * URLs are re-validated through parseSocialUrl; anything that no longer
 * matches the whitelist is skipped.
 */
export function extractSocialEmbeds(html: string | null | undefined): ParsedSocialEmbed[] {
  if (!html) return [];
  const out: ParsedSocialEmbed[] = [];
  const tagRe = /<div\b[^>]*\bdata-social-embed\b[^>]*>/gi;
  for (const m of html.matchAll(tagRe)) {
    const urlAttr = m[0].match(/\bdata-url\s*=\s*"([^"]*)"/i);
    if (!urlAttr) continue;
    const url = urlAttr[1]
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
    const parsed = parseSocialUrl(url);
    if (parsed) out.push(parsed);
  }
  return out;
}

export const PROVIDER_LABELS: Record<SocialProvider, string> = {
  youtube: "YouTube",
  twitter: "X (Twitter)",
  instagram: "Instagram",
  tiktok: "TikTok",
};
