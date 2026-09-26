import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";

const rows: unknown[][] = [];
const makeChain = () => {
  const proxy: unknown = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: unknown) => void) => Promise.resolve(rows.shift() ?? []).then(resolve);
      return () => proxy;
    },
    apply: () => proxy,
  });
  return proxy;
};
const db = { select: vi.fn(() => makeChain()) };
vi.mock("@workspace/db", () => ({ db, postsTable: {}, seriesTable: {} }));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})), and: vi.fn(() => ({})),
  asc: vi.fn(() => ({})), exists: vi.fn(() => ({})),
  getTableColumns: vi.fn(() => ({})),
}));
vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/postAuthor", () => ({ canonicalPostAuthor: {} }));
vi.mock("../lib/audit", () => ({ writeAuditLog: vi.fn() }));

const router = (await import("./series")).default;
async function get(path: string) {
  const app = express().use(router);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}${path}`);
    return { status: response.status, body: await response.json() as { posts: Array<{ id: number }> } & Record<string, unknown> };
  } finally {
    server.close();
  }
}

beforeEach(() => { rows.length = 0; vi.clearAllMocks(); });

describe("series public visibility", () => {
  it("does not list empty series publicly, but leaves them available to editors", async () => {
    rows.push([]); // published-only list
    const publicList = await get("/series");
    expect(publicList).toEqual({ status: 200, body: [] });
    const { exists } = await import("drizzle-orm");
    expect(exists).toHaveBeenCalled();

    rows.push([{ id: 5, title: "Unfinished", slug: "unfinished" }], []);
    const editorList = await get("/admin/series");
    expect(editorList.body).toEqual([{
      id: 5, title: "Unfinished", slug: "unfinished", occupiedPositions: [],
    }]);
  });

  it("returns 404 for a series with no published parts", async () => {
    rows.push([{ id: 5, slug: "unfinished" }], []);
    const result = await get("/series/unfinished");
    expect(result.status).toBe(404);
  });

  it("shows only published parts in a stable part order", async () => {
    rows.push([{ id: 5, slug: "ready" }], [
      { id: 12, seriesPosition: 1, status: "published" },
      { id: 14, seriesPosition: 2, status: "published" },
    ]);
    const result = await get("/series/ready");
    expect(result.status).toBe(200);
    expect(result.body.posts.map((post: { id: number }) => post.id)).toEqual([12, 14]);
    const { eq } = await import("drizzle-orm");
    expect(eq).toHaveBeenCalledWith(undefined, "published");
  });
});