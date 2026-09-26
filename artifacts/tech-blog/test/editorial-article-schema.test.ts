import { describe, it, expect } from "vitest";
import { buildArticleJsonLd } from "../src/lib/articleSchema";

const base = {
  title: "Evergreen guide",
  slug: "evergreen-guide",
  publishedAt: "2024-01-10T12:00:00Z",
  updatedAt: "2026-09-20T12:00:00Z",
  author: "Editor Name",
  authorUsername: "editor.name",
  coverImage: "/covers/guide.webp",
};

describe("editorial article metadata", () => {
  it("ignores generic updates and retains original publication and author profile", () => {
    const schema = buildArticleJsonLd(base);
    expect(schema.datePublished).toBe(base.publishedAt);
    expect(schema.dateModified).toBe(base.publishedAt);
    expect(schema.author).toEqual({
      "@type": "Person", name: "Editor Name", url: "https://www.mapletechie.com/author/editor.name",
    });
    expect(schema.image).toEqual(["https://www.mapletechie.com/covers/guide.webp"]);
    expect(schema.mainEntityOfPage).toEqual({
      "@type": "WebPage", "@id": "https://www.mapletechie.com/blog/evergreen-guide",
    });
  });

  it("uses only approved editorial freshness and appropriate article type", () => {
    const when = "2026-09-19T12:00:00Z";
    expect(buildArticleJsonLd({ ...base, contentModifiedAt: when }).dateModified).toBe(when);
    expect(buildArticleJsonLd({ ...base, categorySlug: "news" })["@type"]).toBe("NewsArticle");
    expect(buildArticleJsonLd({ ...base, categorySlug: "reviews" })["@type"]).toBe("Article");
    expect(buildArticleJsonLd(base)["@type"]).toBe("BlogPosting");
  });

  it("publishes absolute exact-ratio variants and retains the original cover fallback", () => {
    const schema = buildArticleJsonLd({
      ...base,
      coverImage: "/api/storage/objects/uploads/source-1",
    });
    expect(schema.image).toEqual([
      "https://www.mapletechie.com/api/storage/img-ratio/16-9/objects/uploads/source-1",
      "https://www.mapletechie.com/api/storage/img-ratio/4-3/objects/uploads/source-1",
      "https://www.mapletechie.com/api/storage/img-ratio/1-1/objects/uploads/source-1",
      "https://www.mapletechie.com/api/storage/objects/uploads/source-1",
    ]);
  });

  it("keeps the custom OG image independent from cover variants", () => {
    const schema = buildArticleJsonLd({
      ...base,
      coverImage: "/api/storage/objects/uploads/cover",
      ogImage: "/api/storage/objects/uploads/og",
    });
    expect((schema.image as string[])[0]).toBe(
      "https://www.mapletechie.com/api/storage/img-social/objects/uploads/og",
    );
    expect(schema.image).toContain(
      "https://www.mapletechie.com/api/storage/img-ratio/16-9/objects/uploads/cover",
    );
  });
});