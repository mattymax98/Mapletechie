// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import BlogPost from "../src/pages/blog-post";
import {
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
  type ArticleSchemaPost,
} from "../src/lib/articleSchema";

// Component tests for the browser-side article page: the NewsArticle JSON-LD
// it emits via Helmet must be byte-for-byte the same schema the crawler
// prerender (server.ts) serves to Google — both call buildArticleJsonLd on
// the same /api/posts/slug/:slug record.

const post = {
  id: 42,
  slug: "the-future-of-ai",
  title: "The Future of AI",
  excerpt: "Where machine learning is headed next.",
  content:
    "<p>Large language models are reshaping how we build software.</p>",
  coverImage: "/covers/ai-future.webp",
  ogImage: "/covers/ai-future-og.jpg",
  category: "AI",
  categorySlug: "ai",
  tags: ["ai", "machine-learning"],
  author: "Jane Doe",
  status: "published",
  seoTitle: "The Future of AI — What Comes Next",
  seoDescription: "A deep dive into where machine learning is headed.",
  seoKeywords: ["ai", "future"],
  readTime: 7,
  viewCount: 1234,
  isFeatured: false,
  publishedAt: "2026-01-05T10:00:00.000Z",
  createdAt: "2026-01-01T10:00:00.000Z",
};

// A post with only the required fields filled in — exercises every fallback
// branch of the shared builder (cover fallback image, excerpt description).
const minimalPost = {
  ...post,
  id: 43,
  slug: "bare-bones",
  title: "Bare Bones",
  coverImage: undefined,
  ogImage: undefined,
  seoTitle: undefined,
  seoDescription: undefined,
  seoKeywords: undefined,
  tags: undefined,
};

function mockApi(record: typeof post) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/api/posts/slug/${record.slug}`)) {
        return new Response(JSON.stringify(record), {
          headers: { "Content-Type": "application/json" },
        });
      }
      // Related posts, comments, etc. — empty lists keep the page happy.
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

function renderArticlePage(slug: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { hook } = memoryLocation({ path: `/blog/${slug}` });
  return render(
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <Router hook={hook}>
          <Route path="/blog/:slug" component={BlogPost} />
        </Router>
      </HelmetProvider>
    </QueryClientProvider>,
  );
}

// With React 19, react-helmet-async lets React render head tags natively.
// React 19 hoists <title>/<meta> into <head>, but inline scripts stay where
// they render — crawlers read JSON-LD anywhere in the document, so we do too.
function ldScriptsOfType(type: string): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
  ).filter((s) => {
    try {
      return JSON.parse(s.textContent || "")["@type"] === type;
    } catch {
      return false;
    }
  });
}

beforeEach(() => {
  document.head.innerHTML = "";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BlogPost NewsArticle JSON-LD", () => {
  it("emits a Helmet script matching buildArticleJsonLd — same as the crawler prerender", async () => {
    mockApi(post);
    const { findByRole } = renderArticlePage(post.slug);
    await findByRole("heading", { name: post.title });

    await waitFor(() => expect(ldScriptsOfType("NewsArticle")).toHaveLength(1));
    const emitted = JSON.parse(ldScriptsOfType("NewsArticle")[0].textContent!);
    expect(emitted).toEqual(
      JSON.parse(JSON.stringify(buildArticleJsonLd(post as ArticleSchemaPost))),
    );

    // Sanity: the fields Google actually reads carry the SEO-precedence values.
    expect(emitted.headline).toBe("The Future of AI — What Comes Next");
    expect(emitted.description).toBe("A deep dive into where machine learning is headed.");
    expect(emitted.image).toEqual(["https://www.mapletechie.com/covers/ai-future-og.jpg"]);
    expect(emitted.author).toEqual({ "@type": "Person", name: "Jane Doe" });
    expect(emitted.datePublished).toBe(post.publishedAt);
    expect(emitted.keywords).toBe("ai, machine-learning");
    expect(emitted.mainEntityOfPage["@id"]).toBe(
      "https://www.mapletechie.com/blog/the-future-of-ai",
    );
  });

  it("matches the builder's fallback branches for a minimal post", async () => {
    mockApi(minimalPost);
    const { findByRole } = renderArticlePage(minimalPost.slug);
    await findByRole("heading", { name: minimalPost.title });

    await waitFor(() => expect(ldScriptsOfType("NewsArticle")).toHaveLength(1));
    const emitted = JSON.parse(ldScriptsOfType("NewsArticle")[0].textContent!);
    expect(emitted).toEqual(
      JSON.parse(JSON.stringify(buildArticleJsonLd(minimalPost as ArticleSchemaPost))),
    );
    expect(emitted.headline).toBe("Bare Bones");
    expect(emitted.description).toBe(post.excerpt);
    expect(emitted.image).toEqual(["https://www.mapletechie.com/opengraph-v2.jpg"]);
    // Optional fields must be absent, not null/empty — Google flags those.
    expect(emitted).not.toHaveProperty("keywords");
  });

  it("also emits the BreadcrumbList alongside the article schema", async () => {
    mockApi(post);
    const { findByRole } = renderArticlePage(post.slug);
    await findByRole("heading", { name: post.title });

    await waitFor(() => expect(ldScriptsOfType("BreadcrumbList")).toHaveLength(1));
    const crumbs = JSON.parse(ldScriptsOfType("BreadcrumbList")[0].textContent!);
    // The browser script must be byte-for-byte what the crawler prerender
    // serves — both call the shared buildBreadcrumbJsonLd.
    expect(crumbs).toEqual(
      JSON.parse(JSON.stringify(buildBreadcrumbJsonLd(post as ArticleSchemaPost))),
    );
    expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual([
      "Home",
      "Blog",
      "AI",
      post.title,
    ]);
  });
});
