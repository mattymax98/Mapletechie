import { describe, it, expect } from "vitest";
import { cleanHtml, normalizeSocialEmbeds } from "./posts";

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
      ["bluesky", "https://bsky.app/profile/jay.bsky.team/post/3kabc123xyz"],
      ["mastodon", "https://mastodon.social/@Gargron/109372849205871248"],
      ["reddit", "https://www.reddit.com/r/programming/comments/1abc23x/some_title/"],
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

  it("normalizes the automation shorthand, YouTube iframe, and X blockquote", () => {
    const { html, report } = normalizeSocialEmbeds([
      '<div data-social-embed="youtube" data-url="https://youtu.be/vcID0OafOts"></div>',
      '<iframe src="https://www.youtube-nocookie.com/embed/A4gNgHfZ-v4"></iframe>',
      '<blockquote class="twitter-tweet"><a href="https://twitter.com/WhiteHouse/status/2102172574822048160">Post</a></blockquote>',
    ].join(""));

    expect(html.match(/data-social-embed=""/g)).toHaveLength(3);
    expect(html).toContain('data-provider="youtube"');
    expect(html).toContain('data-provider="twitter"');
    expect(html).toContain("Watch this video on YouTube");
    expect(html).toContain("View this post on X");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<blockquote");
    expect(report).toMatchObject({
      requested: 3,
      preserved: 3,
      removed: 0,
      by_provider: { youtube: 2, twitter: 1 },
      warnings: [],
    });
    expect(report.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("removes unsafe and duplicate media without keeping empty wrappers", () => {
    const { html, report } = normalizeSocialEmbeds([
      '<div><iframe src="https://youtube.com.evil.example/embed/vcID0OafOts"></iframe></div>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<div data-social-embed="youtube" data-url="https://www.youtube.com/watch?v=vcID0OafOts"></div>',
      '<div data-social-embed="x" data-url="https://x.com/WhiteHouse/status/2102172574822048160"></div>',
      '<div data-social-embed="youtube" data-url="https://x.com/WhiteHouse/status/2102172574822048160"></div>',
    ].join(""));

    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<div></div>");
    expect(html.match(/data-social-embed=""/g)).toHaveLength(2);
    expect(report.requested).toBe(5);
    expect(report.preserved).toBe(2);
    expect(report.removed).toBe(3);
    expect(report.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it("limits automation embeds to correctly paired YouTube and X providers", () => {
    const { html, report } = normalizeSocialEmbeds([
      '<iframe src="https://attacker.example/@user/123456789012/embed"></iframe>',
      '<div data-social-embed="mastodon" data-url="https://attacker.example/@user/123456789012"></div>',
      '<div data-social-embed="youtube" data-url="https://x.com/OpenAI/status/1234567890123"></div>',
    ].join(""), { automation: true });

    expect(html).not.toContain("attacker.example");
    expect(html).not.toContain("data-social-embed");
    expect(report).toMatchObject({ requested: 3, preserved: 0, removed: 3 });
  });

  it("rejects nested embed markers and revisions only track preserved canonical embeds", () => {
    const nested = normalizeSocialEmbeds(
      '<div class="callout"><div data-social-embed="x" data-url="https://x.com/OpenAI/status/1234567890123"></div></div>',
      { automation: true },
    );
    expect(nested.html).not.toContain("data-social-embed");
    expect(nested.report).toMatchObject({ requested: 1, preserved: 0, removed: 1 });

    const first = normalizeSocialEmbeds(
      '<p>First copy</p><div data-social-embed="youtube" data-url="https://youtu.be/vcID0OafOts"></div>',
      { automation: true },
    );
    const second = normalizeSocialEmbeds(
      '<p>Different copy and image URL</p><img src="https://example.com/image.jpg" alt="Example"><div data-social-embed="youtube" data-url="https://www.youtube.com/watch?v=vcID0OafOts"></div>',
      { automation: true },
    );
    const changed = normalizeSocialEmbeds(
      '<div data-social-embed="youtube" data-url="https://youtu.be/A4gNgHfZ-v4"></div>',
      { automation: true },
    );
    expect(first.report.revision).toBe(second.report.revision);
    expect(changed.report.revision).not.toBe(first.report.revision);
  });

  it("accounts for every embed nested inside a root embed", () => {
    for (const inner of [
      '<div data-social-embed="x" data-url="https://x.com/OpenAI/status/1234567890123"></div>',
      '<iframe src="https://www.youtube-nocookie.com/embed/A4gNgHfZ-v4"></iframe>',
    ]) {
      const { html, report } = normalizeSocialEmbeds(
        `<div data-social-embed="youtube" data-url="https://youtu.be/vcID0OafOts">${inner}</div>`,
        { automation: true },
      );
      expect(html.match(/data-social-embed=""/g)).toHaveLength(1);
      expect(report).toMatchObject({ requested: 2, preserved: 1, removed: 1 });
      expect(report.requested).toBe(report.preserved + report.removed);
    }
  });
});

describe("cleanHtml image dimensions", () => {
  it("preserves width/height attributes on images (layout-shift prevention)", () => {
    const html = '<p>x</p><img src="/api/storage/objects/uploads/abc" alt="a" width="1600" height="900">';
    const out = cleanHtml(html);
    expect(out).toContain('width="1600"');
    expect(out).toContain('height="900"');
  });
});
