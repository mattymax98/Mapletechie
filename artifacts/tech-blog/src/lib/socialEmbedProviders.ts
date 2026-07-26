/**
 * Social embed provider whitelist shared by the editor (paste detection,
 * placeholder card) and the article renderer (hydration). Only URLs that
 * match one of these providers are ever turned into an embed — everything
 * else stays a plain link. The API server enforces the same patterns when
 * sanitizing saved article HTML (see api-server posts route).
 */

export type SocialProvider =
  | "youtube"
  | "twitter"
  | "instagram"
  | "tiktok"
  | "bluesky"
  | "mastodon"
  | "reddit";

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
const BLUESKY_RE =
  /^https?:\/\/bsky\.app\/profile\/([A-Za-z0-9:%._-]+)\/post\/([a-z0-9]{5,20})/i;
// Mastodon is federated — any instance hosts statuses at /@user/<numeric id>.
// The numeric-only status id keeps this from matching Threads-style URLs.
const MASTODON_RE =
  /^https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)\/@[\w.-]+(?:@[\w.-]+)?\/(\d{8,25})(?:[/?#]|$)/i;
const REDDIT_RE =
  /^https?:\/\/(?:www\.|old\.|new\.)?reddit\.com\/r\/[A-Za-z0-9_]{2,21}\/comments\/([a-z0-9]{4,10})/i;

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

  m = url.match(BLUESKY_RE);
  if (m) return { provider: "bluesky", url, id: m[2] };

  m = url.match(REDDIT_RE);
  if (m) return { provider: "reddit", url, id: m[1] };

  // Mastodon last — its host pattern is the broadest (any federated instance),
  // so the dedicated-host providers above always win.
  m = url.match(MASTODON_RE);
  if (m) return { provider: "mastodon", url, id: m[2] };

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
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  reddit: "Reddit",
};

/**
 * Bluesky's embed widget needs an AT-URI. The profile segment of the post URL
 * is either a handle or a DID — both are accepted by embed.bsky.app.
 */
export function blueskyAtUri(url: string): string | null {
  const m = url.match(BLUESKY_RE);
  if (!m) return null;
  return `at://${decodeURIComponent(m[1])}/app.bsky.feed.post/${m[2]}`;
}
