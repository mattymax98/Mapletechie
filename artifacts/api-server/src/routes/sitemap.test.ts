import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { createServer } from "node:http";

// Tests for the sitemap route. Focused on SITE_DOMAIN protocol normalisation:
// a bare domain (no protocol) must still produce https:// URLs in the output.

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  and: (...c: unknown[]) => ({ op: "and", conditions: c }),
  desc: (col: unknown) => ({ op: "desc", col }),
  asc: (col: unknown) => ({ op: "asc", col }),
  sql: Object.assign(
    (_strings: TemplateStringsArray, ..._vals: unknown[]) => ({ op: "sql" }),
    { raw: (_s: string) => ({ op: "sql-raw" }) },
  ),
  getTableColumns: () => ({}),
  gte: (col: unknown, val: unknown) => ({ op: "gte", col, val }),
}));

const postsTable = { slug: "posts.slug", publishedAt: "posts.publishedAt", status: "posts.status", tags: "posts.tags" };
const categoriesTable = { slug: "categories.slug" };
const usersTable = { username: "users.username", isActive: "users.isActive" };
const seriesTable = { slug: "series.slug" };
const jobsTable = { slug: "jobs.slug", isActive: "jobs.isActive" };

// execute() is used for the tag query; return empty rows so it resolves cleanly.
const db = {
  select: vi.fn(),
  execute: vi.fn().mockResolvedValue({ rows: [] }),
};

function makeChain(result: unknown[]) {
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

vi.mock("@workspace/db", () => ({
  db,
  postsTable,
  categoriesTable,
  usersTable,
  seriesTable,
  jobsTable,
}));

const sitemapRouter = (await import("./sitemap")).default;

async function get(path: string) {
  const app = express();
  app.use("/", sitemapRouter);
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
  // By default return empty arrays so all six parallel queries resolve.
  db.select.mockImplementation(() => makeChain([]));
  db.execute.mockResolvedValue({ rows: [] });
});

describe("GET /sitemap.xml — SITE_DOMAIN protocol normalisation", () => {
  it("produces https:// URLs when SITE_DOMAIN has no protocol prefix", async () => {
    process.env.SITE_DOMAIN = "mapletechie.com";

    const { status, body } = await get("/sitemap.xml");

    expect(status).toBe(200);
    // Every <loc> must start with https://, never with the bare domain.
    const locs = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      expect(loc, `expected https:// but got: ${loc}`).toMatch(/^https:\/\//);
    }
    expect(body).not.toMatch(/<loc>mapletechie\.com/); // no bare domain
  });

  it("produces https:// URLs when SITE_DOMAIN already has the https:// prefix", async () => {
    process.env.SITE_DOMAIN = "https://www.mapletechie.com";

    const { status, body } = await get("/sitemap.xml");

    expect(status).toBe(200);
    const locs = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      expect(loc).toMatch(/^https:\/\/www\.mapletechie\.com/);
    }
  });

  it("includes a blog post URL with the correct domain when a post exists", async () => {
    process.env.SITE_DOMAIN = "mapletechie.com"; // protocol-less
    // First call to db.select returns a published post; the rest return [].
    let callCount = 0;
    db.select.mockImplementation(() => {
      callCount++;
      return makeChain(
        callCount === 1
          ? [{ slug: "test-post", publishedAt: "2026-08-01T00:00:00.000Z" }]
          : [],
      );
    });

    const { body } = await get("/sitemap.xml");

    expect(body).toContain("<loc>https://www.mapletechie.com/blog/test-post</loc>");
  });

  it("does not emit malformed legacy route segments", async () => {
    process.env.SITE_DOMAIN = "https://www.mapletechie.com";
    let callCount = 0;
    db.select.mockImplementation(() => {
      callCount += 1;
      const rows = [
        [
          { slug: "valid-post", publishedAt: "2026-08-01T00:00:00.000Z" },
          { slug: "mapletechie.com", publishedAt: "2026-08-01T00:00:00.000Z" },
        ],
        [{ slug: "valid-category" }, { slug: "science.space" }],
        [
          { username: "matthew" },
          { username: "jane_doe" },
          { username: "jane.doe" },
          { username: "not/a-user" },
        ],
        [{ slug: "valid-series" }, { slug: "series.name" }],
        [{ slug: "valid-job" }, { slug: "editor.job" }],
      ][callCount - 1] ?? [];
      return makeChain(rows);
    });

    const { body } = await get("/sitemap.xml");

    expect(body).toContain("/blog/valid-post");
    expect(body).toContain("/category/valid-category");
    expect(body).toContain("/author/matthew");
    expect(body).toContain("/author/jane_doe");
    expect(body).toContain("/author/jane.doe");
    expect(body).not.toContain("not/a-user");
    expect(body).not.toContain("science.space");
    expect(body).not.toContain("series.name");
    expect(body).not.toContain("editor.job");
  });
});
