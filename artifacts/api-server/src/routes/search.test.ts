import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { eq } from "drizzle-orm";

const { db, queue, authState } = vi.hoisted(() => {
  const rows: unknown[][] = [];
  function chain() {
    const proxy: unknown = new Proxy(function () {}, {
      get(_target, key) {
        if (key === "then") {
          return (resolve: (value: unknown) => void) => Promise.resolve(rows.shift() ?? []).then(resolve);
        }
        return () => proxy;
      },
      apply() { return proxy; },
    });
    return proxy;
  }
  return {
    queue: rows,
    authState: { user: { id: 2, role: "admin", canEditOthersPosts: false } },
    db: { select: vi.fn(() => chain()) },
  };
});

vi.mock("@workspace/db", () => ({
  db,
  postsTable: { authorId: "posts.authorId" },
  categoriesTable: {},
  postCategoriesTable: {},
  topicClustersTable: {},
}));
vi.mock("drizzle-orm", () => ({
  and: () => ({}),
  asc: () => ({}),
  desc: () => ({}),
  eq: vi.fn(() => ({})),
  gte: () => ({}),
  getTableColumns: () => ({}),
  ilike: () => ({}),
  inArray: () => ({}),
  lt: () => ({}),
  or: () => ({}),
  sql: () => ({}),
}));
vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = authState.user;
    next();
  },
}));
vi.mock("../lib/postAuthor", () => ({ canonicalPostAuthor: {} }));

const router = (await import("./search")).default;
const app = express();
app.use(express.json());
app.use(router);

async function get(path: string) {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}${path}`);
  const json = await response.json().catch(() => null);
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return { status: response.status, json: json as any };
}

beforeEach(() => {
  vi.clearAllMocks();
  queue.splice(0);
  authState.user = { id: 2, role: "admin", canEditOthersPosts: false };
});

describe("authenticated full-post archive search", () => {
  it("returns all post statuses with metadata and published-only canonical URLs", async () => {
    queue.push([{ total: 2 }], [
      {
        id: 42,
        title: "TypeScript tips",
        slug: "typescript-tips",
        status: "published",
        excerpt: "A useful overview",
        tags: ["typescript"],
        categoryId: 7,
        author: "Editor",
        authorId: 3,
        clusterId: 9,
        clusterRole: "supporting",
        createdAt: "2026-07-01T12:00:00.000Z",
        updatedAt: "2026-07-02T12:00:00.000Z",
        publishedAt: "2026-07-01T12:00:00.000Z",
        scheduledFor: null,
        primaryCategoryName: "AI",
        primaryCategorySlug: "ai",
      },
      {
        id: 43,
        title: "Unpublished notes",
        slug: "draft-notes",
        status: "draft",
        excerpt: "Unpublished",
        tags: [],
        categoryId: 7,
        author: "Editor",
        authorId: 3,
        clusterId: null,
        clusterRole: null,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-02T12:00:00.000Z",
        publishedAt: "2026-06-01T12:00:00.000Z",
        scheduledFor: null,
        primaryCategoryName: "AI",
        primaryCategorySlug: "ai",
      },
    ], []);
    const response = await get("/admin/archive-search?page=1&limit=2");
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ page: 1, limit: 2, total: 2 });
    expect(response.json.items).toHaveLength(2);
    expect(response.json.items[0]).toMatchObject({
      id: 42,
      title: "TypeScript tips",
      tags: ["typescript"],
      clusterId: 9,
      clusterRole: "supporting",
      author: "Editor",
      excerpt: "A useful overview",
      categories: [{ id: 7, name: "AI", slug: "ai", isPrimary: true }],
      canonical_url: "https://www.mapletechie.com/blog/typescript-tips",
    });
    expect(response.json.items[1]).not.toHaveProperty("canonical_url");
  });

  it("accepts the archive's search and field filters with pagination", async () => {
    queue.push([{ total: 0 }], []);
    const response = await get(
      "/admin/archive-search?q=technology&title=launch&slug=launch&body=review&tag=ai&category=software&cluster=9&status=scheduled&dateFrom=2026-06-01&dateTo=2026-06-30&author=editor&page=2&limit=10",
    );
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ items: [], page: 2, limit: 10, total: 0 });
  });

  it("restricts ordinary editors to their own posts, including draft metadata", async () => {
    authState.user = { id: 29, role: "editor", canEditOthersPosts: false };
    queue.push([{ total: 0 }], []);
    const response = await get("/admin/archive-search?status=draft");
    expect(response.status).toBe(200);
    expect(eq).toHaveBeenCalledWith("posts.authorId", 29);
  });

  it("allows editors with the existing cross-post permission to search the full archive", async () => {
    authState.user = { id: 29, role: "editor", canEditOthersPosts: true };
    queue.push([{ total: 0 }], []);
    const response = await get("/admin/archive-search?status=draft");
    expect(response.status).toBe(200);
    expect(eq).not.toHaveBeenCalledWith("posts.authorId", 29);
  });

  it("rejects unsupported statuses, invalid dates, and unbounded pagination", async () => {
    const invalidStatus = await get("/admin/archive-search?status=deleted");
    expect(invalidStatus.status).toBe(400);
    const invalidDate = await get("/admin/archive-search?dateFrom=2026-13-40");
    expect(invalidDate.status).toBe(400);
    const invalidLimit = await get("/admin/archive-search?limit=1000");
    expect(invalidLimit.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });
});