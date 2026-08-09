/**
 * Route-level tests for POST /admin/indexnow/backfill.
 * Covers: admin authorization, unconfigured-key guard, and URL composition.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { createServer } from "node:http";

// ── Mocks ────────────────────────────────────────────────────────────────────

let publishedPosts: { id: number; slug: string }[] = [];
let memberships: { categorySlug: string }[] = [];

// Minimal Drizzle proxy: every chained call returns itself and resolves to the
// queue value when awaited.
function makeChain(result: unknown): unknown {
  const proxy: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
      }
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

// Each call to db.select() returns the next item from the queue.
let selectQueue: unknown[][] = [];
const db = {
  select: vi.fn(() => makeChain(selectQueue.length ? selectQueue.shift() : [])),
};

vi.mock("@workspace/db", () => ({
  db,
  postsTable: { id: {}, slug: {}, status: {} },
  categoriesTable: { id: {}, slug: {} },
  postCategoriesTable: { postId: {}, categoryId: {} },
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  inArray: () => ({}),
}));

// Auth middleware: pass when Authorization header is present, 401 otherwise.
vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.headers.authorization) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.user = { id: 1, role: "admin" } as express.Request["user"];
    next();
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Capture the URL list passed to submitToIndexNow.
let capturedUrls: string[] = [];
let configuredFlag = true;
vi.mock("../lib/indexNow", () => ({
  isIndexNowConfigured: vi.fn(() => configuredFlag),
  submitToIndexNow: vi.fn(async (urls: string[]) => {
    capturedUrls = urls;
    return urls.length;
  }),
}));

const indexNowRouter = (await import("./indexnow")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(indexNowRouter);
  return app;
}

async function request(
  app: express.Express,
  method: "POST",
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
    });
    const json = await resp.json().catch(() => null);
    return { status: resp.status, json };
  } finally {
    server.close();
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /admin/indexnow/backfill", () => {
  beforeEach(() => {
    capturedUrls = [];
    configuredFlag = true;
    selectQueue = [publishedPosts, memberships];
    db.select.mockClear();
  });

  describe("authorization", () => {
    it("returns 401 when no Authorization header is sent", async () => {
      const { status } = await request(makeApp(), "POST", "/admin/indexnow/backfill");
      expect(status).toBe(401);
    });

    it("returns a non-401 when Authorization header is present", async () => {
      selectQueue = [[], []];
      const { status } = await request(makeApp(), "POST", "/admin/indexnow/backfill", {
        Authorization: "Bearer test",
      });
      expect(status).not.toBe(401);
    });
  });

  describe("unconfigured key", () => {
    it("returns 422 with configured:false when INDEXNOW_KEY is not set", async () => {
      configuredFlag = false;
      const { status, json } = await request(makeApp(), "POST", "/admin/indexnow/backfill", {
        Authorization: "Bearer test",
      });
      expect(status).toBe(422);
      expect((json as { configured: boolean }).configured).toBe(false);
    });
  });

  describe("URL composition", () => {
    it("includes article and category URLs, plus top-level pages", async () => {
      publishedPosts = [{ id: 1, slug: "my-article" }];
      memberships = [{ categorySlug: "ai" }];
      selectQueue = [publishedPosts, memberships];

      const { status, json } = await request(makeApp(), "POST", "/admin/indexnow/backfill", {
        Authorization: "Bearer test",
      });

      expect(status).toBe(200);
      expect(capturedUrls.some((u) => u.includes("/blog/my-article"))).toBe(true);
      expect(capturedUrls.some((u) => u.includes("/category/ai"))).toBe(true);
      expect(capturedUrls.some((u) => u.endsWith("/"))).toBe(true);
      expect(capturedUrls.some((u) => u.endsWith("/blog"))).toBe(true);
    });

    it("deduplicates category URLs when multiple posts share a category", async () => {
      publishedPosts = [
        { id: 1, slug: "article-one" },
        { id: 2, slug: "article-two" },
      ];
      memberships = [{ categorySlug: "ai" }, { categorySlug: "ai" }];
      selectQueue = [publishedPosts, memberships];

      await request(makeApp(), "POST", "/admin/indexnow/backfill", {
        Authorization: "Bearer test",
      });

      const catUrls = capturedUrls.filter((u) => u.includes("/category/ai"));
      expect(catUrls.length).toBe(1);
    });

    it("returns submitted count and postCount in the response", async () => {
      publishedPosts = [{ id: 1, slug: "an-article" }];
      memberships = [];
      selectQueue = [publishedPosts, memberships];

      const { json } = await request(makeApp(), "POST", "/admin/indexnow/backfill", {
        Authorization: "Bearer test",
      });

      const body = json as { postCount: number; submitted: number; configured: boolean };
      expect(body.postCount).toBe(1);
      expect(body.submitted).toBeGreaterThan(0);
      expect(body.configured).toBe(true);
    });
  });
});
