import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { createServer } from "node:http";

// Tests for the news sitemap route. Focused on SITE_DOMAIN protocol
// normalisation: a bare domain must still produce https:// URLs.

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  and: (...c: unknown[]) => ({ op: "and", conditions: c }),
  desc: (col: unknown) => ({ op: "desc", col }),
  gte: (col: unknown, val: unknown) => ({ op: "gte", col, val }),
  sql: Object.assign(
    (_strings: TemplateStringsArray, ..._vals: unknown[]) => ({ op: "sql" }),
    { raw: (_s: string) => ({ op: "sql-raw" }) },
  ),
  getTableColumns: () => ({}),
}));

const postsTable = { slug: "posts.slug", title: "posts.title", publishedAt: "posts.publishedAt", status: "posts.status" };
const categoriesTable = { id: "categories.id", slug: "categories.slug" };
const postCategoriesTable = { postId: "post_categories.postId", categoryId: "post_categories.categoryId" };

const RECENT_POST = {
  slug: "canada-tech-news",
  title: "Canadian Tech News Today",
  publishedAt: new Date(),
};

let selectDistinctResult: unknown[] = [];

const db = {
  selectDistinct: vi.fn(),
};

function makeJoinChain(result: unknown[]) {
  const proxy: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        return (res: (v: unknown) => void) => Promise.resolve(result).then(res);
      }
      return () => proxy;
    },
    apply() { return proxy; },
  });
  return proxy;
}

vi.mock("@workspace/db", () => ({ db, postsTable, categoriesTable, postCategoriesTable }));

const newsSitemapRouter = (await import("./newsSitemap")).default;

async function get(path: string) {
  const app = express();
  app.use("/", newsSitemapRouter);
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: resp.status, body: await resp.text() };
  } finally {
    server.close();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  selectDistinctResult = [RECENT_POST];
  db.selectDistinct.mockImplementation(() => makeJoinChain(selectDistinctResult));
});

describe("GET /news-sitemap.xml — SITE_DOMAIN protocol normalisation", () => {
  it("produces https:// URLs when SITE_DOMAIN has no protocol prefix", async () => {
    process.env.SITE_DOMAIN = "mapletechie.com";

    const { status, body } = await get("/news-sitemap.xml");

    expect(status).toBe(200);
    const locs = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      expect(loc, `expected https:// but got: ${loc}`).toMatch(/^https:\/\//);
    }
    expect(body).not.toMatch(/<loc>mapletechie\.com/); // no bare domain
    expect(body).toContain("<loc>https://www.mapletechie.com/blog/canada-tech-news</loc>");
  });

  it("produces https:// URLs when SITE_DOMAIN already has the https:// prefix", async () => {
    process.env.SITE_DOMAIN = "https://mapletechie.com";

    const { status, body } = await get("/news-sitemap.xml");

    expect(status).toBe(200);
    const locs = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    for (const loc of locs) {
      expect(loc).toMatch(/^https:\/\/www\.mapletechie\.com/);
    }
  });

  it("returns 404 when no news posts were published in the last 48 hours", async () => {
    process.env.SITE_DOMAIN = "https://mapletechie.com";
    db.selectDistinct.mockImplementation(() => makeJoinChain([]));

    const { status } = await get("/news-sitemap.xml");

    expect(status).toBe(404);
  });
});
