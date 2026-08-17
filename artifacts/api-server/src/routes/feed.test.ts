import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";

// Tests for the RSS feed routes (site-wide + per-category). The DB is mocked
// with the same chainable-proxy pattern as posts.test.ts; drizzle helpers are
// stubbed so we can capture the WHERE conditions the routes build (the real
// guarantee that a category feed only contains that category's published
// posts lives in the SQL filter).

// --- drizzle-orm stubs that record their arguments -------------------------

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  and: (...conditions: unknown[]) => ({ op: "and", conditions }),
  desc: (col: unknown) => ({ op: "desc", col }),
  asc: (col: unknown) => ({ op: "asc", col }),
  or: (...conditions: unknown[]) => ({ op: "or", conditions }),
  inArray: (col: unknown, vals: unknown) => ({ op: "inArray", col, vals }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({ op: "sql", vals }),
  getTableColumns: () => ({}),
}));

// Sentinel column identities so captured eq() calls are assertable.
const postsTable = {
  status: "posts.status",
  categoryId: "posts.categoryId",
  publishedAt: "posts.publishedAt",
  slug: "posts.slug",
};
const categoriesTable = {
  id: "categories.id",
  name: "categories.name",
  slug: "categories.slug",
};
const postCategoriesTable = {
  postId: "post_categories.postId",
  categoryId: "post_categories.categoryId",
  isPrimary: "post_categories.isPrimary",
};

// Queue of result arrays the select chains resolve to, in call order, and the
// WHERE conditions captured per select chain.
let selectQueue: unknown[][] = [];
let capturedWheres: unknown[] = [];

function makeSelectChain() {
  const proxy: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          Promise.resolve(selectQueue.length ? selectQueue.shift() : []).then(resolve, reject);
      }
      if (prop === "where") {
        return (cond: unknown) => {
          capturedWheres.push(cond);
          return proxy;
        };
      }
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

const db = { select: vi.fn(() => makeSelectChain()) };

vi.mock("@workspace/db", () => ({ db, postsTable, categoriesTable, postCategoriesTable }));

const feedRouter = (await import("./feed")).default;

// --- HTTP helper ------------------------------------------------------------

import { createServer } from "node:http";
async function get(path: string): Promise<{ status: number; body: string; contentType: string | null }> {
  const app = express();
  app.use("/", feedRouter);
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}${path}`);
    return {
      status: resp.status,
      body: await resp.text(),
      contentType: resp.headers.get("content-type"),
    };
  } finally {
    server.close();
  }
}

/**
 * Minimal XML well-formedness check: the prolog parses, every open tag has a
 * matching close tag in the right order, and no raw (unescaped) `&` or `<`
 * appears in text content.
 */
function assertWellFormedXml(xml: string): void {
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  const withoutProlog = xml.replace(/^<\?xml[^?]*\?>/, "");
  const stack: string[] = [];
  const tagRe = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/?)>/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(withoutProlog)) !== null) {
    // Text between tags must not contain raw markup characters.
    const text = withoutProlog.slice(lastIndex, m.index);
    expect(text, `raw '<' in text content near: ${text.slice(0, 80)}`).not.toMatch(/</);
    expect(
      text,
      `unescaped '&' in text content near: ${text.slice(0, 80)}`,
    ).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/);
    lastIndex = tagRe.lastIndex;
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      expect(stack.pop(), `mismatched closing tag </${name}>`).toBe(name);
    } else {
      stack.push(name);
    }
  }
  expect(stack, "unclosed tags remain").toEqual([]);
}

// --- Fixtures ---------------------------------------------------------------

// Posts carry id/categoryId/categorySlug so attachCategories' fallback path
// (no join rows queued) yields the single legacy category.
const POST_A = {
  id: 1,
  categoryId: 7,
  categorySlug: "ai",
  slug: "the-future-of-ai",
  title: "The Future of AI",
  excerpt: "Where machine learning is headed next.",
  content: "<p>LLMs are reshaping software.</p>",
  author: "Matthew Mbaka",
  publishedAt: "2026-01-15T12:00:00.000Z",
  category: "AI",
};

const POST_B = {
  id: 2,
  categoryId: 8,
  categorySlug: "evs",
  slug: "ev-charging-guide",
  title: "EV Charging Guide",
  excerpt: null,
  content: "<p>Level 2 chargers explained, plug by plug.</p>",
  author: "Matthew Mbaka",
  publishedAt: "2026-01-10T12:00:00.000Z",
  category: "EVs",
};

const CATEGORY = { id: 7, slug: "ai", name: "AI", description: "All things AI." };

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  capturedWheres = [];
  process.env.SITE_DOMAIN = "https://feeds.test";
});

// --- SITE_DOMAIN protocol normalisation --------------------------------------

describe("SITE_DOMAIN protocol normalisation", () => {
  it("produces https:// URLs in the feed when SITE_DOMAIN has no protocol prefix", async () => {
    process.env.SITE_DOMAIN = "mapletechie.com"; // no https://
    selectQueue = [[POST_A]];

    const { status, body } = await get("/feed.xml");

    expect(status).toBe(200);
    // Channel link and self-link must use https://, not the bare domain.
    expect(body).toContain("<link>https://mapletechie.com</link>");
    expect(body).toContain('href="https://mapletechie.com/api/feed.xml"');
    // Post permalink must also use https://.
    expect(body).toContain(
      '<guid isPermaLink="true">https://mapletechie.com/blog/the-future-of-ai</guid>',
    );
    // The bare domain must not appear anywhere in a URL context.
    expect(body).not.toMatch(/<link>mapletechie\.com/);
    expect(body).not.toMatch(/href="mapletechie\.com/);
  });

  it("produces https:// URLs when SITE_DOMAIN already has the https:// prefix", async () => {
    process.env.SITE_DOMAIN = "https://mapletechie.com";
    selectQueue = [[POST_A]];

    const { status, body } = await get("/feed.xml");

    expect(status).toBe(200);
    expect(body).toContain("<link>https://mapletechie.com</link>");
    expect(body).toContain(
      '<guid isPermaLink="true">https://mapletechie.com/blog/the-future-of-ai</guid>',
    );
  });
});

// --- Site-wide feed -----------------------------------------------------------

describe("GET /feed.xml — site-wide feed shape", () => {
  it("renders the unchanged site-wide channel with all published posts", async () => {
    selectQueue = [[POST_A, POST_B]];

    const { status, body, contentType } = await get("/feed.xml");

    expect(status).toBe(200);
    expect(contentType).toContain("application/rss+xml");
    // Channel metadata is the site-wide shape.
    expect(body).toContain("<title>Mapletechie</title>");
    expect(body).toContain("<link>https://feeds.test</link>");
    expect(body).toContain(
      '<atom:link href="https://feeds.test/api/feed.xml" rel="self" type="application/rss+xml" />',
    );
    expect(body).toContain("<language>en-ca</language>");
    // lastBuildDate tracks the newest post.
    expect(body).toContain(`<lastBuildDate>${new Date(POST_A.publishedAt).toUTCString()}</lastBuildDate>`);
    // Both posts appear as items with permalink guids.
    expect(body).toContain("<title>The Future of AI</title>");
    expect(body).toContain("<title>EV Charging Guide</title>");
    expect(body).toContain('<guid isPermaLink="true">https://feeds.test/blog/the-future-of-ai</guid>');
    // Excerpt used when present; stripped content when not.
    expect(body).toContain("<description>Where machine learning is headed next.</description>");
    expect(body).toContain("<description>Level 2 chargers explained, plug by plug.</description>");
    // Only the published filter — no category condition. (2nd where is the
    // attachCategories join lookup.)
    expect(capturedWheres[0]).toEqual({ op: "eq", col: postsTable.status, val: "published" });
    assertWellFormedXml(body);
  });
});

// --- Per-category feed ---------------------------------------------------------

describe("GET /category/:slug/feed.xml", () => {
  it("filters to that category's published posts and reflects the category in channel metadata", async () => {
    // 1st select: category lookup; 2nd: the posts query.
    selectQueue = [[CATEGORY], [POST_A]];

    const { status, body, contentType } = await get(`/category/${CATEGORY.slug}/feed.xml`);

    expect(status).toBe(200);
    expect(contentType).toContain("application/rss+xml");
    // Channel metadata reflects the category, including the self link.
    expect(body).toContain("<title>Mapletechie — AI</title>");
    expect(body).toContain("<link>https://feeds.test/category/ai</link>");
    expect(body).toContain(
      '<atom:link href="https://feeds.test/api/category/ai/feed.xml" rel="self" type="application/rss+xml" />',
    );
    expect(body).toContain("<description>All things AI.</description>");
    expect(body).toContain("<title>The Future of AI</title>");
    expect(body).not.toContain("EV Charging Guide");
    // The posts query must AND the published filter with the category filter —
    // this is what guarantees the feed only contains this category's posts.
    expect(capturedWheres[0]).toEqual({ op: "eq", col: categoriesTable.slug, val: "ai" });
    const postsWhere = capturedWheres[1] as { op: string; conditions: unknown[] };
    expect(postsWhere.op).toBe("and");
    expect(postsWhere.conditions[0]).toEqual({ op: "eq", col: postsTable.status, val: "published" });
    // Category filter is now a join-table EXISTS (any membership counts);
    // the category id must be bound into that SQL fragment.
    const catCond = postsWhere.conditions[1] as { op: string; vals: unknown[] };
    expect(catCond.op).toBe("sql");
    expect(catCond.vals).toContain(CATEGORY.id);
    assertWellFormedXml(body);
  });

  it("falls back to a generated channel description when the category has none", async () => {
    selectQueue = [[{ ...CATEGORY, description: "   " }], [POST_A]];
    const { body } = await get("/category/ai/feed.xml");
    expect(body).toContain(
      "<description>The latest AI stories, reviews, and analysis on Mapletechie.</description>",
    );
  });

  it("returns 404 for an unknown category slug", async () => {
    selectQueue = [[]]; // category lookup finds nothing

    const { status, body } = await get("/category/nope/feed.xml");

    expect(status).toBe(404);
    expect(JSON.parse(body)).toEqual({ error: "Category not found" });
    // The posts query never runs.
    expect(capturedWheres).toHaveLength(1);
  });
});

// --- XML escaping ---------------------------------------------------------------

describe("XML escaping", () => {
  it("escapes markup-significant characters in titles, categories, and descriptions", async () => {
    const nasty = {
      id: 3,
      categoryId: 9,
      categorySlug: "telecom-5g",
      slug: "rogers-vs-bell",
      title: `Rogers & Bell <beat> "everyone" in Q1's results`,
      excerpt: `5G <upload> speeds & "real-world" tests`,
      content: null,
      author: `O'Brien & Sons <Media>`,
      publishedAt: "2026-02-01T12:00:00.000Z",
      category: "Telecom & 5G",
    };
    selectQueue = [[nasty]];

    const { body } = await get("/feed.xml");

    expect(body).toContain(
      "<title>Rogers &amp; Bell &lt;beat&gt; &quot;everyone&quot; in Q1&apos;s results</title>",
    );
    expect(body).toContain("<category>Telecom &amp; 5G</category>");
    expect(body).toContain(
      "<description>5G &lt;upload&gt; speeds &amp; &quot;real-world&quot; tests</description>",
    );
    expect(body).toContain("O&apos;Brien &amp; Sons &lt;Media&gt;");
    // None of the raw payloads leaked through unescaped.
    expect(body).not.toContain("<beat>");
    expect(body).not.toContain("<upload>");
    expect(body).not.toContain("<Media>");
    assertWellFormedXml(body);
  });

  it("strips HTML from content-derived descriptions and truncates to 280 chars", async () => {
    const longText = "word ".repeat(100).trim(); // 499 chars once stripped
    const post = {
      ...POST_B,
      excerpt: null,
      content: `<p>${longText}</p>`,
    };
    selectQueue = [[post]];

    const { body } = await get("/feed.xml");

    const desc = body.match(/<description>([\s\S]*?)<\/description>/g)!;
    // Item description (2nd <description>; the 1st is the channel's).
    const item = desc[1].replace(/<\/?description>/g, "");
    expect(item).not.toContain("&lt;p&gt;");
    expect(item.length).toBeLessThanOrEqual(280);
    expect(item.startsWith("word word")).toBe(true);
    assertWellFormedXml(body);
  });
});
