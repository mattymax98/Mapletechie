import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, selectQueue } = vi.hoisted(() => {
  const state = { selectQueue: [] as unknown[][] };
  function chain() {
    const proxy: unknown = new Proxy(function () {}, {
      get(_target, key) {
        if (key === "then") {
          return (resolve: (value: unknown) => void) =>
            Promise.resolve(state.selectQueue.shift() ?? []).then(resolve);
        }
        return () => proxy;
      },
      apply() { return proxy; },
    });
    return proxy;
  }
  return {
    ...state,
    db: { select: vi.fn(() => chain()) },
  };
});

vi.mock("@workspace/db", () => ({
  db,
  postsTable: {},
  topicClustersTable: {},
}));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: (column: unknown, value: unknown) => ({ column, value }),
  inArray: (column: unknown, values: unknown[]) => ({ column, values }),
  sql: () => ({}),
}));

const { attachPublicTopicContext, isTopicClusterPublic } = await import("./topicClusters");

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.splice(0);
});

describe("public topic cluster visibility", () => {
  it("requires an explicitly public cluster and three published posts", () => {
    expect(isTopicClusterPublic({ isPublic: true }, 3)).toBe(true);
    expect(isTopicClusterPublic({ isPublic: true }, 2)).toBe(false);
    expect(isTopicClusterPublic({ isPublic: false }, 3)).toBe(false);
    expect(isTopicClusterPublic({ isPublic: false }, 20)).toBe(false);
  });

  it("attaches public context only to published posts in eligible clusters", async () => {
    selectQueue.push(
      [
        { id: 1, name: "Private", slug: "private", introduction: "Private intro", isPublic: false },
        { id: 2, name: "Thin", slug: "thin", introduction: "Thin intro", isPublic: true },
        { id: 3, name: "Public", slug: "public", introduction: "Public intro", isPublic: true },
      ],
      [
        { clusterId: 1, count: 4 },
        { clusterId: 2, count: 2 },
        { clusterId: 3, count: 3 },
      ],
    );

    const result = await attachPublicTopicContext([
      { id: 11, status: "published", clusterId: 1, clusterRole: "pillar" },
      { id: 12, status: "published", clusterId: 2, clusterRole: "supporting" },
      { id: 13, status: "published", clusterId: 3, clusterRole: "pillar" },
      { id: 14, status: "draft", clusterId: 3, clusterRole: "supporting" },
    ]);

    expect(result.map((post) => post.topicCluster)).toEqual([
      null,
      null,
      {
        id: 3,
        name: "Public",
        slug: "public",
        introduction: "Public intro",
        role: "pillar",
      },
      null,
    ]);
  });

  it("does not query cluster metadata when posts are drafts or unassigned", async () => {
    const result = await attachPublicTopicContext([
      { id: 21, status: "draft", clusterId: 3, clusterRole: "pillar" },
      { id: 22, status: "published", clusterId: null, clusterRole: null },
    ]);

    expect(result.map((post) => post.topicCluster)).toEqual([null, null]);
    expect(db.select).not.toHaveBeenCalled();
  });
});