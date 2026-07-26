import { describe, it, expect } from "vitest";
import { cleanHtml } from "./posts";

const tweetEmbed =
  '<div data-social-embed="" data-provider="twitter" data-url="https://x.com/OpenAI/status/1234567890123" class="social-embed"><a href="https://x.com/OpenAI/status/1234567890123">https://x.com/OpenAI/status/1234567890123</a></div>';

describe("cleanHtml social embed handling", () => {
  it("keeps a valid whitelisted embed placeholder intact", () => {
    const out = cleanHtml(tweetEmbed);
    expect(out).toContain("data-social-embed");
    expect(out).toContain('data-provider="twitter"');
    expect(out).toContain('data-url="https://x.com/OpenAI/status/1234567890123"');
    expect(out).toContain("<a href=");
  });

  it("keeps valid youtube/instagram/tiktok embeds", () => {
    for (const [provider, url] of [
      ["youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
      ["instagram", "https://www.instagram.com/p/Cxyz_ABC12/"],
      ["tiktok", "https://www.tiktok.com/@user/video/7123456789012345678"],
    ]) {
      const out = cleanHtml(
        `<div data-social-embed data-provider="${provider}" data-url="${url}"><a href="${url}">${url}</a></div>`,
      );
      expect(out).toContain(`data-provider="${provider}"`);
    }
  });

  it("strips embed attrs when the URL is not a whitelisted provider", () => {
    const out = cleanHtml(
      '<div data-social-embed data-provider="twitter" data-url="https://evil.example.com/payload"><a href="https://evil.example.com/payload">link</a></div>',
    );
    expect(out).not.toContain("data-social-embed");
    expect(out).not.toContain("data-url");
    expect(out).toContain("<a href="); // fallback link survives
  });

  it("strips embed attrs for unknown providers even with a valid-looking URL", () => {
    const out = cleanHtml(
      '<div data-social-embed data-provider="facebook" data-url="https://x.com/a/status/1234567"><a href="https://x.com/a/status/1234567">link</a></div>',
    );
    expect(out).not.toContain("data-social-embed");
  });

  it("never lets embed data attrs ride on ordinary divs", () => {
    const out = cleanHtml('<div data-url="https://x.com/a/status/1234567">text</div>');
    expect(out).not.toContain("data-url");
  });

  it("still drops scripts and iframes entirely", () => {
    const out = cleanHtml(
      '<div data-social-embed data-provider="twitter" data-url="https://x.com/a/status/1234567"><script>alert(1)</script><iframe src="https://evil.com"></iframe></div>',
    );
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<iframe");
  });
});
