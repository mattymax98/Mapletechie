// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import {
  SEO,
  removeServerRenderedSeoTags,
  __resetSeoDedupeForTests,
} from "../src/components/SEO";

// Mirrors the SEO block index.html ships (and the crawler prerender injects):
// one full set of static title/description/canonical/OG/Twitter tags, plus a
// JSON-LD script that must survive the cleanup.
function seedServerHead() {
  document.head.innerHTML = `
    <meta charset="utf-8" />
    <!-- SEO_HEAD_START -->
    <title>Mapletechie — Tech News &amp; Reviews</title>
    <meta name="description" content="Server description" />
    <link rel="canonical" href="https://mapletechie.com/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Server OG title" />
    <meta property="og:description" content="Server OG description" />
    <meta property="og:image" content="https://mapletechie.com/opengraph-v2.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Server twitter title" />
    <script type="application/ld+json">{"@context":"https://schema.org"}</script>
    <link rel="modulepreload" href="/assets/home-abc.js" />
    <!-- SEO_HEAD_END -->
    <meta name="description" content="Outside the markers — must NOT be touched" data-outside />
  `;
}

beforeEach(() => {
  __resetSeoDedupeForTests();
  seedServerHead();
});

describe("removeServerRenderedSeoTags", () => {
  it("removes managed tags inside the SEO block but keeps JSON-LD, preloads, and tags outside the markers", () => {
    removeServerRenderedSeoTags();

    // Managed tags inside the block are gone. The <title> stays: Helmet
    // reuses it via document.title, so it is only removed when a duplicate
    // exists outside the block.
    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(0);
    expect(document.head.querySelectorAll('meta[property^="og:"]')).toHaveLength(0);
    expect(document.head.querySelectorAll('meta[name^="twitter:"]')).toHaveLength(0);
    // The description outside the markers is untouched.
    const descriptions = document.head.querySelectorAll('meta[name="description"]');
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0].hasAttribute("data-outside")).toBe(true);
    // Untouched: charset meta, JSON-LD, and preload links inside the block.
    expect(document.head.querySelector("meta[charset]")).not.toBeNull();
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('link[rel="modulepreload"]')).toHaveLength(1);
  });
});

describe("<SEO /> mounted on a server-rendered head", () => {
  it("ends up with exactly one title, description, and canonical tag", async () => {
    // No out-of-block tags for this test — mirror the real index.html head.
    document.head.querySelector("[data-outside]")?.remove();
    render(
      <HelmetProvider>
        <SEO
          title="Some Article"
          description="Client description"
          url="/blog/some-article"
        />
      </HelmetProvider>,
    );

    // Helmet flushes its tags asynchronously; wait for its description.
    await waitFor(() => {
      expect(
        document.head.querySelector('meta[name="description"][content="Client description"]'),
      ).not.toBeNull();
    });

    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.title).toBe("Some Article | Mapletechie");
    const descriptions = document.head.querySelectorAll('meta[name="description"]');
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0].getAttribute("content")).toBe("Client description");
    const canonicals = document.head.querySelectorAll('link[rel="canonical"]');
    expect(canonicals).toHaveLength(1);
    expect(canonicals[0].getAttribute("href")).toBe(
      "https://mapletechie.com/blog/some-article",
    );
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[name="twitter:title"]')).toHaveLength(1);
    // JSON-LD injected by the server must survive.
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
  });
});
