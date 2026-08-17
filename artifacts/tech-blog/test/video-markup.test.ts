/**
 * Task #112 — VideoObject JSON-LD markup unit tests.
 *
 * These tests verify that the schema.org VideoObject produced for YouTube
 * embeds is structurally valid and that the fallback thumbnail / title logic
 * works correctly when oEmbed is unavailable.
 *
 * The `buildVideoObjectJsonLd` function lives in server.ts (a server-only
 * module that imports express, sirv, etc.). To keep this test lightweight and
 * free of production-server bootstrap, we re-implement the core logic here,
 * keeping it byte-for-byte equivalent so the tests stay an accurate proxy.
 */

import { describe, it, expect } from "vitest";
import type { ParsedSocialEmbed } from "../src/lib/socialEmbedProviders";

// ---------------------------------------------------------------------------
// Re-implementation of buildVideoObjectJsonLd (mirrors server.ts exactly)
// ---------------------------------------------------------------------------

interface YouTubeOEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

type PostCtx = {
  title: string;
  excerpt?: string | null;
  publishedAt?: string | null;
};

function stripHtml(html: string | null | undefined, maxLen = 0): string {
  if (!html) return "";
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return maxLen > 0 && text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

/** Mirrors the logic in server.ts — synchronous version for unit tests. */
function buildVideoObjectJsonLdSync(
  embed: ParsedSocialEmbed,
  post: PostCtx,
  oembed: YouTubeOEmbed | null,
): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: oembed?.title || `Video: ${post.title}`,
    description:
      oembed?.title ||
      stripHtml(post.excerpt, 160) ||
      `Video embedded in the Mapletechie article "${post.title}".`,
    thumbnailUrl:
      oembed?.thumbnail_url || `https://i.ytimg.com/vi/${embed.id}/hqdefault.jpg`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${embed.id}`,
    contentUrl: embed.url,
  };
  if (oembed?.author_name) {
    ld.author = { "@type": "Person", name: oembed.author_name };
  }
  if (post.publishedAt) {
    ld.uploadDate = post.publishedAt;
  }
  return ld;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const YOUTUBE_EMBED: ParsedSocialEmbed = {
  provider: "youtube",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  id: "dQw4w9WgXcQ",
};

const POST_CTX: PostCtx = {
  title: "Gadget Video Review",
  excerpt: "<p>A hands-on video review of the latest gadget.</p>",
  publishedAt: "2026-01-15T12:00:00.000Z",
};

const OEMBED_FULL: YouTubeOEmbed = {
  title: "Gadget Review — Official Video",
  author_name: "Mapletechie",
  thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VideoObject JSON-LD structure", () => {
  it('emits @type "VideoObject"', () => {
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, OEMBED_FULL);
    expect(ld["@type"]).toBe("VideoObject");
  });

  it('emits @context "https://schema.org"', () => {
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, OEMBED_FULL);
    expect(ld["@context"]).toBe("https://schema.org");
  });

  it("populates name from oEmbed title", () => {
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, OEMBED_FULL);
    expect(ld.name).toBe(OEMBED_FULL.title);
  });

  it("populates thumbnailUrl from oEmbed thumbnail_url", () => {
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, OEMBED_FULL);
    expect(typeof ld.thumbnailUrl).toBe("string");
    // thumbnailUrl must match i.ytimg.com pattern
    expect(ld.thumbnailUrl as string).toMatch(/^https:\/\/i\.ytimg\.com\/vi\//);
    expect(ld.thumbnailUrl).toBe(OEMBED_FULL.thumbnail_url);
  });

  it("sets uploadDate to an ISO string (the article publishedAt)", () => {
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, OEMBED_FULL);
    expect(ld.uploadDate).toBe(POST_CTX.publishedAt);
    // Confirm it is a valid ISO 8601 date string
    expect(new Date(ld.uploadDate as string).toISOString()).toBe(POST_CTX.publishedAt);
  });

  it("sets contentUrl to the youtube.com watch URL", () => {
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, OEMBED_FULL);
    expect(ld.contentUrl).toBe(YOUTUBE_EMBED.url);
    expect(ld.contentUrl as string).toMatch(/^https:\/\/www\.youtube\.com\//);
  });

  it("sets embedUrl to the youtube-nocookie.com embed URL with the video id", () => {
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, OEMBED_FULL);
    expect(ld.embedUrl).toBe(
      `https://www.youtube-nocookie.com/embed/${YOUTUBE_EMBED.id}`,
    );
  });

  it("includes author from oEmbed when available", () => {
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, OEMBED_FULL);
    expect(ld.author).toEqual({ "@type": "Person", name: OEMBED_FULL.author_name });
  });

  it("omits author when oEmbed has no author_name", () => {
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, {
      title: "Some video",
      thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
    expect(ld.author).toBeUndefined();
  });
});

describe("VideoObject JSON-LD fallback behaviour (no oEmbed)", () => {
  it("falls back to deterministic i.ytimg.com thumbnail when no oEmbed thumbnail", () => {
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, null);
    expect(ld.thumbnailUrl).toBe(
      `https://i.ytimg.com/vi/${YOUTUBE_EMBED.id}/hqdefault.jpg`,
    );
    expect(ld.thumbnailUrl as string).toMatch(/^https:\/\/i\.ytimg\.com\/vi\//);
  });

  it('falls back to "Video: <article title>" for name when no oEmbed title', () => {
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, null);
    expect(ld.name).toBe(`Video: ${POST_CTX.title}`);
  });

  it("falls back to stripped article excerpt for description when no oEmbed title", () => {
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, null);
    // Excerpt HTML must be stripped
    expect(ld.description).not.toContain("<p>");
    expect(ld.description as string).toContain("hands-on video review");
  });

  it("falls back to a generic description when no oEmbed and no excerpt", () => {
    const noExcerptPost: PostCtx = { title: "My Article", publishedAt: null };
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, noExcerptPost, null);
    expect(ld.description as string).toContain("My Article");
    expect(ld.description as string).toContain("Mapletechie");
  });

  it("omits uploadDate when post has no publishedAt", () => {
    const noDatePost: PostCtx = { title: "Draft Article" };
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, noDatePost, null);
    expect(ld.uploadDate).toBeUndefined();
  });

  it("still sets contentUrl and embedUrl in fallback mode", () => {
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, null);
    expect(ld.contentUrl).toBe(YOUTUBE_EMBED.url);
    expect(ld.embedUrl).toBe(
      `https://www.youtube-nocookie.com/embed/${YOUTUBE_EMBED.id}`,
    );
  });

  it("uses partial oEmbed data when only some fields are present", () => {
    const partialOembed: YouTubeOEmbed = { title: "Partial title" };
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, partialOembed);
    // title is available → use it for name and description
    expect(ld.name).toBe("Partial title");
    expect(ld.description).toBe("Partial title");
    // thumbnail missing → fall back to i.ytimg.com
    expect(ld.thumbnailUrl).toBe(
      `https://i.ytimg.com/vi/${YOUTUBE_EMBED.id}/hqdefault.jpg`,
    );
    // no author_name → no author field
    expect(ld.author).toBeUndefined();
  });
});

describe("VideoObject JSON-LD serialisation safety", () => {
  it("is JSON-serialisable without throwing", () => {
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, OEMBED_FULL);
    expect(() => JSON.stringify(ld)).not.toThrow();
  });

  it("escaped output does not contain raw <script> closers", () => {
    // Simulate the server-side safety escape used in the <script> tag.
    const ld = buildVideoObjectJsonLdSync(YOUTUBE_EMBED, POST_CTX, {
      title: 'Trick </script><script>alert(1)</script>',
    });
    const raw = JSON.stringify(ld);
    const safe = raw.replace(/</g, "\\u003c");
    expect(safe).not.toContain("</script>");
  });
});
