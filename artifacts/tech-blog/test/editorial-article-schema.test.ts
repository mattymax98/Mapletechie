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
});