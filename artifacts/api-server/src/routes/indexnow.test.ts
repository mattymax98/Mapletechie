import { describe, it, expect, vi, afterEach } from "vitest";
import { buildPostUrls, submitToIndexNow, isIndexNowConfigured } from "../lib/indexNow";

// ── buildPostUrls ─────────────────────────────────────────────────────────────

describe("buildPostUrls", () => {
  it("always includes the article URL", () => {
    const urls = buildPostUrls({ slug: "my-article", categorySlugs: [] });
    expect(urls.some((u) => u.includes("/blog/my-article"))).toBe(true);
  });

  it("includes a category page for each slug provided", () => {
    const urls = buildPostUrls({ slug: "my-article", categorySlugs: ["ai", "gadgets"] });
    expect(urls.some((u) => u.includes("/category/ai"))).toBe(true);
    expect(urls.some((u) => u.includes("/category/gadgets"))).toBe(true);
  });

  it("does not include any category URL when categorySlugs is empty", () => {
    const urls = buildPostUrls({ slug: "my-article", categorySlugs: [] });
    expect(urls.some((u) => u.includes("/category/"))).toBe(false);
  });

  it("does not include any category URL when categorySlugs is null", () => {
    const urls = buildPostUrls({ slug: "my-article", categorySlugs: null });
    expect(urls.some((u) => u.includes("/category/"))).toBe(false);
  });

  it("does not duplicate the article URL when multiple categories are given", () => {
    const urls = buildPostUrls({ slug: "my-article", categorySlugs: ["ai", "gadgets", "news"] });
    const articleUrls = urls.filter((u) => u.includes("/blog/my-article"));
    expect(articleUrls.length).toBe(1);
  });

  it("returns 1 + N URLs for N categories", () => {
    const cats = ["ai", "gadgets"];
    const urls = buildPostUrls({ slug: "my-article", categorySlugs: cats });
    expect(urls.length).toBe(1 + cats.length);
  });
});

// ── submitToIndexNow ──────────────────────────────────────────────────────────

describe("submitToIndexNow", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns 0 and does not fetch when INDEXNOW_KEY is not set", async () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await submitToIndexNow(["https://mapletechie.com/blog/test"]);
    expect(result).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 0 for an empty URL list regardless of key", async () => {
    vi.stubEnv("INDEXNOW_KEY", "somekey123");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await submitToIndexNow([]);
    expect(result).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends exactly one batch when URL count is within the 10,000 limit", async () => {
    vi.stubEnv("INDEXNOW_KEY", "testkey");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const urls = Array.from({ length: 50 }, (_, i) => `https://mapletechie.com/blog/post-${i}`);
    const result = await submitToIndexNow(urls);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toBe(50);
  });

  it("splits into multiple batches when URL count exceeds 10,000", async () => {
    vi.stubEnv("INDEXNOW_KEY", "testkey");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const urls = Array.from({ length: 15_000 }, (_, i) => `https://mapletechie.com/blog/post-${i}`);
    const result = await submitToIndexNow(urls);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toBe(15_000);
  });

  it("still counts dispatched URLs even when a batch receives a non-2xx response", async () => {
    vi.stubEnv("INDEXNOW_KEY", "testkey");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Too many requests", { status: 429 }),
    );
    const urls = ["https://mapletechie.com/blog/some-post"];
    const result = await submitToIndexNow(urls);
    // URLs were dispatched (sent) even though Bing rejected them
    expect(result).toBe(1);
  });
});

// ── isIndexNowConfigured ──────────────────────────────────────────────────────

describe("isIndexNowConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false when INDEXNOW_KEY env var is empty", () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    expect(isIndexNowConfigured()).toBe(false);
  });

  it("returns true when INDEXNOW_KEY is set", () => {
    vi.stubEnv("INDEXNOW_KEY", "abc123");
    expect(isIndexNowConfigured()).toBe(true);
  });
});
