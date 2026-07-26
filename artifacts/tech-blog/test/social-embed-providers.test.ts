// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseSocialUrl } from "../src/lib/socialEmbedProviders";
import { splitSocialEmbeds } from "../src/components/SocialEmbeds";

describe("splitSocialEmbeds", () => {
  const embedDiv = (url: string) =>
    `<div class="social-embed" data-social-embed data-provider="x" data-url="${url}"><a href="${url}">${url}</a></div>`;

  it("splits html around valid embeds", () => {
    const html = `<p>before</p>${embedDiv("https://x.com/a/status/1234567")}<p>after</p>`;
    const segs = splitSocialEmbeds(html);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toEqual({ kind: "html", html: "<p>before</p>" });
    expect(segs[1].kind).toBe("embed");
    if (segs[1].kind === "embed") {
      expect(segs[1].embed.provider).toBe("twitter");
      expect(segs[1].embed.id).toBe("1234567");
    }
    expect(segs[2]).toEqual({ kind: "html", html: "<p>after</p>" });
  });

  it("handles multiple embeds and embed-only content", () => {
    const html =
      embedDiv("https://www.youtube.com/watch?v=dQw4w9WgXcQ") +
      embedDiv("https://www.tiktok.com/@u/video/7123456789012345678");
    const segs = splitSocialEmbeds(html);
    expect(segs.map((s) => s.kind)).toEqual(["embed", "embed"]);
  });

  it("leaves placeholders with non-whitelisted URLs in the html flow", () => {
    const html = `<p>a</p>${embedDiv("https://evil.example.com/x")}<p>b</p>`;
    const segs = splitSocialEmbeds(html);
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe("html");
    if (segs[0].kind === "html") expect(segs[0].html).toContain("evil.example.com");
  });

  it("never slices apart embeds nested inside other markup", () => {
    const html = `<blockquote><p>quote</p>${embedDiv("https://x.com/a/status/1234567")}</blockquote><p>after</p>`;
    const segs = splitSocialEmbeds(html);
    // Nested embed stays in the HTML flow as its fallback link; the
    // blockquote is never broken apart.
    expect(segs).toHaveLength(1);
    if (segs[0].kind === "html") {
      expect(segs[0].html).toContain("<blockquote>");
      expect(segs[0].html).toContain("</blockquote><p>after</p>");
    }
  });

  it("keeps escaped text escaped when embeds are present (no XSS via decode)", () => {
    const html = `&lt;img src=x onerror=alert(1)&gt;${embedDiv("https://x.com/a/status/1234567")}<p>tail</p>`;
    const segs = splitSocialEmbeds(html);
    expect(segs).toHaveLength(3);
    if (segs[0].kind === "html") {
      expect(segs[0].html).toContain("&lt;img");
      expect(segs[0].html).not.toContain("<img");
    }
    expect(segs[1].kind).toBe("embed");
  });

  it("passes plain html through untouched", () => {
    const segs = splitSocialEmbeds("<p>hello</p><div class=\"foo\">bar</div>");
    expect(segs).toEqual([{ kind: "html", html: "<p>hello</p><div class=\"foo\">bar</div>" }]);
  });
});

describe("parseSocialUrl", () => {
  it("parses YouTube watch / short / shorts URLs", () => {
    expect(parseSocialUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      id: "dQw4w9WgXcQ",
    });
    expect(parseSocialUrl("https://youtu.be/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
    expect(parseSocialUrl("https://youtube.com/shorts/abc123XYZ_-")?.provider).toBe("youtube");
    expect(parseSocialUrl("https://www.youtube.com/watch?list=PL1&v=dQw4w9WgXcQ")?.id).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("parses X and Twitter status URLs", () => {
    expect(parseSocialUrl("https://x.com/elonmusk/status/1234567890123456789")).toEqual({
      provider: "twitter",
      url: "https://x.com/elonmusk/status/1234567890123456789",
      id: "1234567890123456789",
    });
    expect(parseSocialUrl("https://twitter.com/OpenAI/status/987654321012")?.provider).toBe(
      "twitter",
    );
    expect(
      parseSocialUrl("https://mobile.twitter.com/OpenAI/status/987654321012?s=20")?.id,
    ).toBe("987654321012");
  });

  it("parses Instagram post and reel URLs", () => {
    expect(parseSocialUrl("https://www.instagram.com/p/Cxyz_ABC123/")?.provider).toBe("instagram");
    expect(parseSocialUrl("https://instagram.com/reel/Cxyz_ABC123/")?.id).toBe("Cxyz_ABC123");
    expect(parseSocialUrl("https://www.instagram.com/someuser/reel/Cxyz_ABC123/")?.provider).toBe(
      "instagram",
    );
  });

  it("parses TikTok video URLs", () => {
    const p = parseSocialUrl("https://www.tiktok.com/@user.name/video/7123456789012345678");
    expect(p?.provider).toBe("tiktok");
    expect(p?.id).toBe("7123456789012345678");
  });

  it("rejects everything else", () => {
    expect(parseSocialUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseSocialUrl("https://x.com/elonmusk")).toBeNull(); // profile, not a post
    expect(parseSocialUrl("https://www.youtube.com/@channel")).toBeNull();
    expect(parseSocialUrl("javascript:alert(1)")).toBeNull();
    expect(parseSocialUrl("https://evil.com/?u=https://x.com/a/status/123456")).toBeNull();
    expect(parseSocialUrl("not a url")).toBeNull();
    expect(parseSocialUrl("")).toBeNull();
  });
});
