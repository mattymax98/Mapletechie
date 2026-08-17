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
  insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
};

vi.mock("@workspace/db", () => ({
  db,
  pageViewsTable: {
    createdAt: "created_at",
    sessionId: "session_id",
    country: "country",
    countryName: "country_name",
    referrer: "referrer",
    postSlug: "post_slug",
    id: "id",
    category: "category",
  },
  postsTable: { slug: "slug", status: "status", publishedAt: "published_at", viewCount: "view_count" },
}));

vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => strings.join(""),
  gte: () => ({}),
  and: (...args: unknown[]) => ({}),
  isNotNull: () => ({}),
  desc: () => ({}),
  eq: () => ({}),
}));

vi.mock("../lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/geoip", () => ({
  extractIp: () => "1.2.3.4",
  lookupCountry: async () => ({ code: "US", name: "United States" }),
}));

// Controllable auth state
let currentUser: { id: number; role: string } | null = null;

vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.user = currentUser as express.Request["user"];
    next();
  },
  requireRole: (role: string) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user || (req.user as unknown as { role: string }).role !== role) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  },
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const analyticsRouter = (await import("./analytics")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(analyticsRouter);
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
  currentUser = null;
});

const ANALYTICS_ROUTES = [
  "/admin/analytics/summary",
  "/admin/analytics/top-posts",
  "/admin/analytics/post-views",
  "/admin/analytics/top-categories",
  "/admin/analytics/top-countries",
  "/admin/analytics/top-referrers",
];

describe("Analytics endpoints — unauthenticated caller", () => {
  for (const route of ANALYTICS_ROUTES) {
    it(`GET ${route} returns 401 when no session is provided`, async () => {
      const { status } = await get(makeApp(), route);
      expect(status).toBe(401);
    });
  }
});

describe("Analytics endpoints — editor (non-admin) caller", () => {
  beforeEach(() => {
    currentUser = { id: 2, role: "editor" };
  });

  for (const route of ANALYTICS_ROUTES) {
    it(`GET ${route} returns 403 for an editor-role session`, async () => {
      const { status } = await get(makeApp(), route, "editor-token");
      expect(status).toBe(403);
    });
  }
});

describe("Analytics endpoints — admin caller", () => {
  beforeEach(() => {
    currentUser = { id: 1, role: "admin" };
  });

  it("GET /admin/analytics/summary returns 200 with totals", async () => {
    selectQueue = [
      [{ c: 500 }],   // totalViews
      [{ c: 120 }],   // uniqueSessions
      [{ c: 15 }],    // uniqueCountries
      [],             // daily series
    ];
    const { status, json } = await get(makeApp(), "/admin/analytics/summary", "admin-token");
    expect(status).toBe(200);
    expect(json).toMatchObject({ totalViews: 500, uniqueSessions: 120, uniqueCountries: 15 });
  });

  it("GET /admin/analytics/top-posts returns 200 with rows", async () => {
    selectQueue = [[{ slug: "hello-world", views: 42 }]];
    const { status, json } = await get(makeApp(), "/admin/analytics/top-posts", "admin-token");
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
  });

  it("GET /admin/analytics/top-categories returns 200", async () => {
    selectQueue = [[{ category: "tech", views: 10 }]];
    const { status } = await get(makeApp(), "/admin/analytics/top-categories", "admin-token");
    expect(status).toBe(200);
  });

  it("GET /admin/analytics/top-countries returns 200", async () => {
    selectQueue = [[{ code: "US", name: "United States", views: 30 }]];
    const { status } = await get(makeApp(), "/admin/analytics/top-countries", "admin-token");
    expect(status).toBe(200);
  });

  it("GET /admin/analytics/top-referrers returns 200", async () => {
    selectQueue = [[{ source: "https://google.com", views: 20 }]];
    const { status } = await get(makeApp(), "/admin/analytics/top-referrers", "admin-token");
    expect(status).toBe(200);
  });
});
