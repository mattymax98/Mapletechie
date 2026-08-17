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

const insertedValues: unknown[] = [];
const db = {
  select: vi.fn(() => makeSelectChain(selectQueue)),
  insert: vi.fn(() => ({
    values: vi.fn(async (v: unknown) => {
      insertedValues.push(v);
    }),
  })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  execute: vi.fn(async () => undefined),
};

vi.mock("@workspace/db", () => ({
  db,
  searchQueriesTable: { query: "query", path: "path", sessionId: "session_id", createdAt: "created_at" },
  linkClicksTable: {
    linkType: "link_type",
    href: "href",
    postSlug: "post_slug",
    sessionId: "session_id",
    createdAt: "created_at",
  },
  pageViewsTable: {
    createdAt: "created_at",
    sessionId: "session_id",
    country: "country",
    countryName: "country_name",
    referrer: "referrer",
    postSlug: "post_slug",
    id: "id",
    category: "category",
    deviceType: "device_type",
    browser: "browser",
    isReturning: "is_returning",
    scrollDepth: "scroll_depth",
    durationMs: "duration_ms",
    readingTimeSec: "reading_time_sec",
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
  insertedValues.length = 0;
  currentUser = null;
});

async function post(
  app: express.Express,
  path: string,
  body: unknown,
): Promise<{ status: number }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
      },
      body: JSON.stringify(body),
    });
    return { status: resp.status };
  } finally {
    server.close();
  }
}

const ANALYTICS_ROUTES = [
  "/admin/analytics/summary",
  "/admin/analytics/top-posts",
  "/admin/analytics/post-views",
  "/admin/analytics/top-categories",
  "/admin/analytics/top-countries",
  "/admin/analytics/top-referrers",
  "/admin/analytics/hourly",
  "/admin/analytics/device-breakdown",
  "/admin/analytics/new-vs-returning",
  "/admin/analytics/reading-time",
  "/admin/analytics/link-clicks",
  "/admin/analytics/search-queries",
  "/admin/analytics/post-detail/some-post",
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

  it("GET /admin/analytics/hourly returns 24 buckets", async () => {
    selectQueue = [[{ hour: 9, views: 5 }, { hour: 14, views: 12 }]];
    const { status, json } = await get(makeApp(), "/admin/analytics/hourly", "admin-token");
    expect(status).toBe(200);
    const buckets = json as Array<{ hour: number; views: number }>;
    expect(buckets).toHaveLength(24);
    expect(buckets[9]).toEqual({ hour: 9, views: 5 });
    expect(buckets[0]).toEqual({ hour: 0, views: 0 });
  });

  it("GET /admin/analytics/device-breakdown returns devices and browsers", async () => {
    selectQueue = [
      [{ deviceType: "mobile", views: 40 }],
      [{ browser: "Chrome", views: 55 }],
    ];
    const { status, json } = await get(makeApp(), "/admin/analytics/device-breakdown", "admin-token");
    expect(status).toBe(200);
    expect(json).toMatchObject({
      devices: [{ deviceType: "mobile", views: 40 }],
      browsers: [{ browser: "Chrome", views: 55 }],
    });
  });

  it("GET /admin/analytics/new-vs-returning returns both counters", async () => {
    selectQueue = [[{ newSessions: 80, returningSessions: 20 }]];
    const { status, json } = await get(makeApp(), "/admin/analytics/new-vs-returning", "admin-token");
    expect(status).toBe(200);
    expect(json).toEqual({ newSessions: 80, returningSessions: 20 });
  });

  it("GET /admin/analytics/reading-time returns rows", async () => {
    selectQueue = [[{ slug: "a", title: "A", avgReadingTimeSec: 120, estimatedReadingTimeSec: 300, samples: 4 }]];
    const { status, json } = await get(makeApp(), "/admin/analytics/reading-time", "admin-token");
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
  });

  it("GET /admin/analytics/link-clicks returns social and outbound lists", async () => {
    selectQueue = [
      [{ href: "https://twitter.com/intent/tweet", clicks: 7 }],
      [{ domain: "github.com", clicks: 3 }],
    ];
    const { status, json } = await get(makeApp(), "/admin/analytics/link-clicks", "admin-token");
    expect(status).toBe(200);
    expect(json).toMatchObject({
      social: [{ href: "https://twitter.com/intent/tweet", clicks: 7 }],
      outbound: [{ domain: "github.com", clicks: 3 }],
    });
  });

  it("GET /admin/analytics/search-queries returns rows", async () => {
    selectQueue = [[{ query: "react", count: 9 }]];
    const { status, json } = await get(makeApp(), "/admin/analytics/search-queries", "admin-token");
    expect(status).toBe(200);
    expect(json).toEqual([{ query: "react", count: 9 }]);
  });

  it("GET /admin/analytics/post-detail/:slug returns the drilldown shape", async () => {
    selectQueue = [
      [{ slug: "hello-world", title: "Hello", publishedAt: "2026-01-01" }], // post lookup
      [{ day: "2026-08-01", views: 3 }],                                   // daily
      [{ source: "Direct", views: 2 }],                                    // referrers
      [{ code: "CA", name: "Canada", views: 2 }],                          // countries
      [{ avgScrollDepth: 72, avgReadingTimeSec: 95, totalViews: 3 }],      // averages
    ];
    const { status, json } = await get(makeApp(), "/admin/analytics/post-detail/hello-world", "admin-token");
    expect(status).toBe(200);
    expect(json).toMatchObject({
      post: { slug: "hello-world" },
      avgScrollDepth: 72,
      avgReadingTimeSec: 95,
      totalViews: 3,
    });
  });

  it("GET /admin/analytics/post-detail/:slug returns 404 for a missing post", async () => {
    selectQueue = [[]]; // post lookup finds nothing
    const { status } = await get(makeApp(), "/admin/analytics/post-detail/does-not-exist", "admin-token");
    expect(status).toBe(404);
  });

  it("GET /admin/analytics/post-detail/:slug returns 404 for an invalid slug", async () => {
    const { status } = await get(makeApp(), "/admin/analytics/post-detail/NOT%20a%20slug", "admin-token");
    expect(status).toBe(404);
  });
});

describe("POST /track/event", () => {
  const flush = () => new Promise((r) => setTimeout(r, 20));

  it("stores a search event in search_queries", async () => {
    const { status } = await post(makeApp(), "/track/event", {
      type: "search",
      query: "typescript tips",
      path: "/search",
      sessionId: "abcd1234efgh5678",
    });
    expect(status).toBe(204);
    await flush();
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({ query: "typescript tips", path: "/search" });
  });

  it("stores a social click in link_clicks", async () => {
    const { status } = await post(makeApp(), "/track/event", {
      type: "social",
      href: "https://twitter.com/intent/tweet?text=hi",
      postSlug: "hello-world",
      sessionId: "abcd1234efgh5678",
    });
    expect(status).toBe(204);
    await flush();
    expect(insertedValues[0]).toMatchObject({ linkType: "social", postSlug: "hello-world" });
  });

  it("stores an outbound click in link_clicks", async () => {
    await post(makeApp(), "/track/event", {
      type: "outbound",
      href: "https://github.com/some/repo",
      path: "/blog/hello-world",
      postSlug: "hello-world",
    });
    await flush();
    expect(insertedValues[0]).toMatchObject({ linkType: "outbound", href: "https://github.com/some/repo" });
  });

  it("drops events with an unknown type", async () => {
    const { status } = await post(makeApp(), "/track/event", { type: "evil", href: "https://x.com" });
    expect(status).toBe(204);
    await flush();
    expect(insertedValues).toHaveLength(0);
  });

  it("drops link events with a non-http(s) href", async () => {
    await post(makeApp(), "/track/event", { type: "outbound", href: "javascript:alert(1)" });
    await flush();
    expect(insertedValues).toHaveLength(0);
  });
});

describe("POST /track with engagement fields", () => {
  const flush = () => new Promise((r) => setTimeout(r, 20));

  it("persists the new optional fields", async () => {
    const { status } = await post(makeApp(), "/track", {
      path: "/blog/hello-world",
      postSlug: "hello-world",
      sessionId: "abcd1234efgh5678",
      scrollDepth: 55,
      durationMs: 4200,
      deviceType: "mobile",
      browser: "Chrome",
      isReturning: true,
    });
    expect(status).toBe(204);
    await flush();
    expect(insertedValues[0]).toMatchObject({
      path: "/blog/hello-world",
      scrollDepth: 55,
      durationMs: 4200,
      deviceType: "mobile",
      browser: "Chrome",
      isReturning: true,
    });
  });

  it("still accepts the old payload shape (new fields null)", async () => {
    const { status } = await post(makeApp(), "/track", {
      path: "/blog/hello-world",
      postSlug: "hello-world",
      sessionId: "abcd1234efgh5678",
    });
    expect(status).toBe(204);
    await flush();
    expect(insertedValues[0]).toMatchObject({
      path: "/blog/hello-world",
      scrollDepth: null,
      deviceType: null,
      browser: null,
      isReturning: null,
    });
  });

  it("routes a reading beacon to an update, not an insert", async () => {
    const { status } = await post(makeApp(), "/track", {
      path: "/blog/hello-world",
      sessionId: "abcd1234efgh5678",
      readingBeacon: true,
      readingTimeSec: 90,
      scrollDepth: 100,
    });
    expect(status).toBe(204);
    await flush();
    expect(insertedValues).toHaveLength(0);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});
