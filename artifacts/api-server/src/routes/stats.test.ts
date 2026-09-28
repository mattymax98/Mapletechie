import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { createServer } from "node:http";

// --- Mocks -------------------------------------------------------------------

let selectQueue: unknown[][] = [];

function makeSelectChain(queue: unknown[][]) {
  const proxy: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          Promise.resolve(queue.length ? queue.shift() : []).then(resolve, reject);
      }
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

const db = {
  select: vi.fn(() => makeSelectChain(selectQueue)),
};

vi.mock("@workspace/db", () => ({
  db,
  postsTable: { viewCount: "view_count" },
  categoriesTable: {},
  productsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => strings.join(""),
}));

// adminAuth mock — controllable: call next() or reject with 401
let authShouldPass = true;
vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!authShouldPass) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.user = { id: 1, role: "admin" } as express.Request["user"];
    next();
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const statsRouter = (await import("./stats")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(statsRouter);
  return app;
}

async function get(
  app: express.Express,
  path: string,
  token?: string,
): Promise<{ status: number; json: unknown }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const resp = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    const json = await resp.json().catch(() => null);
    return { status: resp.status, json };
  } finally {
    server.close();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  authShouldPass = true;
});

describe("GET /stats/summary — authorization", () => {
  it("returns 401 when no session token is provided", async () => {
    authShouldPass = false;
    const { status, json } = await get(makeApp(), "/stats/summary");
    expect(status).toBe(401);
    expect(json).toMatchObject({ error: expect.any(String) });
  });

  it("returns 200 with summary data for an authenticated caller", async () => {
    // Three select queries: posts, categories, products
    selectQueue = [
      [{ total: 169, views: 244453 }],
      [{ total: 9 }],
      [{ total: 6 }],
    ];

    const { status, json } = await get(makeApp(), "/stats/summary", "valid-token");
    expect(status).toBe(200);
    expect(json).toMatchObject({
      totalPosts: 169,
      totalCategories: 9,
      totalProducts: 6,
      totalViews: 244453,
    });
  });
});
