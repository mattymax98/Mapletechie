import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";

const { db, selectQueue, insertResult, orderByCalls } = vi.hoisted(() => {
  const state = {
    selectQueue: [] as unknown[][],
    insertResult: [] as unknown[],
    orderByCalls: [] as unknown[][],
  };
  function chain() {
    const proxy: unknown = new Proxy(function () {}, {
      get(_target, key) {
        if (key === "then") {
          return (resolve: (value: unknown) => void) =>
            Promise.resolve(state.selectQueue.shift() ?? []).then(resolve);
        }
        if (key === "orderBy") {
          return (...args: unknown[]) => {
            state.orderByCalls.push(args);
            return proxy;
          };
        }
        return () => proxy;
      },
      apply() { return proxy; },
    });
    return proxy;
  }
  return {
    ...state,
    db: {
      select: vi.fn(() => chain()),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn(async () => state.insertResult) })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn(async () => state.insertResult) })),
        })),
      })),
    },
  };
});

vi.mock("@workspace/db", () => ({
  db,
  postsTable: {},
  topicClustersTable: {},
  topicsTable: {},
}));
vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const router = (await import("./topics")).default;
const app = express();
app.use(express.json());
app.use(router);

async function request(method: string, path: string, body?: unknown) {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return { status: response.status, json: json as any };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.splice(0);
  insertResult.splice(0);
  orderByCalls.splice(0);
});

describe("topic cluster routes", () => {
  it("rejects invalid admin create fields without writing", async () => {
    const response = await request("POST", "/admin/topics", {
      name: "AI", slug: "Invalid Slug", introduction: "", isPublic: true,
    });
    expect(response.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("requires a non-empty topic introduction", async () => {
    const response = await request("POST", "/admin/topics", {
      name: "AI", slug: "ai", introduction: "   ", isPublic: true,
    });
    expect(response.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("requires three published members before even an admin can make a topic public", async () => {
    const create = await request("POST", "/admin/topics", {
      name: "AI", slug: "ai", introduction: "Guide", isPublic: true,
    });
    expect(create.status).toBe(409);
    expect(db.insert).not.toHaveBeenCalled();
    selectQueue.push([{ id: 9, slug: "ai" }], [{ value: 2 }]);
    const update = await request("PUT", "/admin/topics/9", {
      name: "AI", slug: "ai", introduction: "Guide", isPublic: true,
    });
    expect(update.status).toBe(409);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("keeps a created topic slug stable to protect existing article links", async () => {
    selectQueue.push([{ id: 9, slug: "original-topic" }]);
    const response = await request("PUT", "/admin/topics/9", {
      name: "Renamed topic", slug: "different-topic", introduction: "A useful introduction.", isPublic: true,
    });
    expect(response.status).toBe(400);
    expect(response.json.error).toMatch(/permanent/i);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns only public topics with at least three published posts", async () => {
    selectQueue.push([
      { id: 1, name: "Ready", slug: "ready", introduction: "Intro", isPublic: true },
      { id: 2, name: "Not ready", slug: "not-ready", introduction: "", isPublic: true },
      { id: 3, name: "Private", slug: "private", introduction: "Private intro", isPublic: false },
    ], [
      { clusterId: 1 },
      { clusterId: 1 },
      { clusterId: 1 },
      { clusterId: 2 },
      { clusterId: 2 },
      { clusterId: 3 },
      { clusterId: 3 },
      { clusterId: 3 },
    ]);
    const response = await request("GET", "/topics");
    expect(response.status).toBe(200);
    expect(response.json).toHaveLength(1);
    expect(response.json[0].slug).toBe("ready");
  });

  it("does not return a private topic detail even when it has enough published posts", async () => {
    selectQueue.push(
      [{ id: 4, name: "Private", slug: "private", introduction: "Private intro", isPublic: false }],
      [{ id: 1 }, { id: 2 }, { id: 3 }],
    );

    const response = await request("GET", "/topics/private");

    expect(response.status).toBe(404);
    expect(response.json.error).toBe("Topic not found.");
  });

  it("returns 404 for a public topic with fewer than three published posts", async () => {
    selectQueue.push(
      [{ id: 5, name: "Thin", slug: "thin", introduction: "Intro", isPublic: true }],
      [{ id: 10, status: "published" }, { id: 11, status: "published" }],
    );

    const response = await request("GET", "/topics/thin");

    expect(response.status).toBe(404);
    expect(response.json.error).toBe("Topic not found.");
  });

  it("exposes admin readiness and published counts", async () => {
    selectQueue.push(
      [{ id: 9, name: "Cluster", slug: "cluster", introduction: "Intro", isPublic: true }],
      [
        { id: 5, title: "One", slug: "one", status: "published", clusterId: 9, clusterRole: "supporting" },
        { id: 6, title: "Two", slug: "two", status: "published", clusterId: 9, clusterRole: "supporting" },
        { id: 7, title: "Three", slug: "three", status: "published", clusterId: 9, clusterRole: "supporting" },
        { id: 8, title: "Draft", slug: "draft", status: "draft", clusterId: 9, clusterRole: "supporting" },
      ],
    );
    const response = await request("GET", "/admin/topics");
    expect(response.json[0]).toMatchObject({ publishedCount: 3, ready: true });
    expect(response.json[0].posts).toHaveLength(4);
  });

  it("returns a published pillar first, then supporting posts in newest-first order", async () => {
    selectQueue.push(
      [{ id: 9, name: "Cluster", slug: "cluster", introduction: "Intro", isPublic: true }],
      [
        { id: 12, title: "Pillar", slug: "pillar", status: "published", publishedAt: "2026-06-01", clusterId: 9, clusterRole: "pillar" },
        { id: 14, title: "Newest support", slug: "newest", status: "published", publishedAt: "2026-07-01", clusterId: 9, clusterRole: "supporting" },
        { id: 13, title: "Older support", slug: "older", status: "published", publishedAt: "2026-06-15", clusterId: 9, clusterRole: "supporting" },
      ],
    );
    const response = await request("GET", "/topics/cluster");
    expect(response.status).toBe(200);
    expect(response.json.posts.map((post: { slug: string }) => post.slug))
      .toEqual(["pillar", "newest", "older"]);
    expect(orderByCalls.at(-1)).toHaveLength(3);
  });
});