import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";

// --- Mocks for everything posts.ts pulls in at import time ----------------

// Capture what the route writes to the DB so we can assert on the persisted
// coverImage / ogImage values.
const captured: { insertValues?: Record<string, unknown>; updateSet?: Record<string, unknown> } = {};

// A thenable chainable query stub. Every builder method returns the same proxy;
// awaiting it resolves to the next queued result array.
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

// Queue of results the route's `db.select(...)` chains resolve to, in call order.
let selectQueue: unknown[][] = [];
let insertReturn: unknown[] = [];

const db = {
  select: vi.fn(() => makeSelectChain(selectQueue)),
  insert: vi.fn(() => ({
    values: vi.fn((v: Record<string, unknown>) => {
      captured.insertValues = v;
      return { returning: vi.fn(async () => insertReturn) };
    }),
  })),
  transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn((v: Record<string, unknown>) => {
          captured.updateSet = v;
          return { where: vi.fn(async () => undefined) };
        }),
      })),
      select: vi.fn(() => makeSelectChain(selectQueue)),
    };
    return cb(tx);
  }),
};

vi.mock("@workspace/db", () => ({
  db,
  postsTable: {},
  usersTable: {},
  pageViewsTable: {},
  commentsTable: {},
  categoriesTable: {},
}));

// drizzle helpers — stubbed to harmless no-ops since `db` is fully mocked.
vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  desc: () => ({}),
  and: () => ({}),
  gte: () => ({}),
  sql: Object.assign(() => ({}), {}),
  inArray: () => ({}),
  or: () => ({}),
  getTableColumns: () => ({}),
}));

vi.mock("@workspace/api-zod", () => ({
  ListPostsQueryParams: { safeParse: () => ({ success: true, data: {} }) },
  GetPostParams: { safeParse: () => ({ success: true, data: {} }) },
  GetPostBySlugParams: { safeParse: () => ({ success: true, data: {} }) },
  GetLatestPostsQueryParams: { safeParse: () => ({ success: true, data: {} }) },
}));

// Inject an admin user; bypass real session lookup.
vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      id: 1,
      role: "admin",
      displayName: "Matthew",
      avatarUrl: null,
      canPublishDirectly: true,
    } as unknown as express.Request["user"];
    next();
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/audit", () => ({ writeAuditLog: vi.fn(async () => undefined) }));
vi.mock("../lib/coverImageValidation", () => ({ validateCoverImage: () => null }));

// The core seam under test: external URLs get rewritten to a storage path.
const persistExternalImage = vi.fn(async (url: string) => `/api/storage/objects/persisted-${url.length}`);
vi.mock("../lib/persistExternalImage", async (importActual) => {
  const actual = await importActual<typeof import("../lib/persistExternalImage")>();
  return {
    isExternalImageUrl: actual.isExternalImageUrl,
    persistExternalImage,
    persistExternalImagesInHtml: actual.persistExternalImagesInHtml,
  };
});

// --- Build an app mounting the real posts router --------------------------

const postsRouter = (await import("./posts")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(postsRouter);
  return app;
}

// Tiny supertest-free HTTP helper.
import { createServer } from "node:http";
async function request(
  app: express.Express,
  method: "POST" | "PUT",
  path: string,
  body: unknown,
): Promise<{ status: number; json: any }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
      body: JSON.stringify(body),
    });
    const json = await resp.json().catch(() => null);
    return { status: resp.status, json };
  } finally {
    server.close();
  }
}

const CATEGORY_ROW = { id: 7, name: "AI", slug: "ai", postCount: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  insertReturn = [];
  captured.insertValues = undefined;
  captured.updateSet = undefined;
});

describe("POST /posts — external image persistence", () => {
  it("rewrites an external coverImage and ogImage to a storage path", async () => {
    // resolveCategory -> [category]; insert.returning -> [inserted]; postsBaseQuery refetch -> [post]
    selectQueue = [[CATEGORY_ROW], [{ id: 99, title: "T", status: "published" }]];
    insertReturn = [{ id: 99, title: "T", status: "published" }];

    const { status } = await request(makeApp(), "POST", "/posts", {
      title: "T",
      slug: "t",
      content: "<p>hi</p>",
      category: "ai",
      coverImage: "https://images.unsplash.com/photo-1.jpg",
      ogImage: "https://images.unsplash.com/og-2.jpg",
    });

    expect(status).toBe(201);
    expect(persistExternalImage).toHaveBeenCalledWith("https://images.unsplash.com/photo-1.jpg");
    expect(persistExternalImage).toHaveBeenCalledWith("https://images.unsplash.com/og-2.jpg");
    expect(String(captured.insertValues?.coverImage)).toMatch(/^\/api\/storage\/objects\//);
    expect(String(captured.insertValues?.ogImage)).toMatch(/^\/api\/storage\/objects\//);
  });

  it("leaves a local coverImage untouched and never calls persist", async () => {
    selectQueue = [[CATEGORY_ROW], [{ id: 99, title: "T", status: "published" }]];
    insertReturn = [{ id: 99, title: "T", status: "published" }];

    const { status } = await request(makeApp(), "POST", "/posts", {
      title: "T",
      slug: "t",
      content: "<p>hi</p>",
      category: "ai",
      coverImage: "/covers/local.webp",
    });

    expect(status).toBe(201);
    expect(persistExternalImage).not.toHaveBeenCalled();
    expect(captured.insertValues?.coverImage).toBe("/covers/local.webp");
  });
});

describe("PUT /posts/:id — external image persistence", () => {
  it("rewrites an external coverImage to a storage path on update", async () => {
    const existing = { id: 42, authorId: 1, categoryId: 7, title: "Old", status: "published" };
    // existing select -> [existing]; refetch via postsBaseQuery -> [updated]; raw refetch -> [updatedRaw]
    selectQueue = [[existing], [{ ...existing, title: "Old" }], [{ ...existing }]];

    const { status } = await request(makeApp(), "PUT", "/posts/42", {
      coverImage: "https://cdn.example.com/new-cover.png",
    });

    expect(status).toBe(200);
    expect(persistExternalImage).toHaveBeenCalledWith("https://cdn.example.com/new-cover.png");
    expect(String(captured.updateSet?.coverImage)).toMatch(/^\/api\/storage\/objects\//);
  });

  it("leaves a local coverImage untouched on update", async () => {
    const existing = { id: 42, authorId: 1, categoryId: 7, title: "Old", status: "published" };
    selectQueue = [[existing], [{ ...existing }], [{ ...existing }]];

    const { status } = await request(makeApp(), "PUT", "/posts/42", {
      coverImage: "/covers/keep.webp",
    });

    expect(status).toBe(200);
    expect(persistExternalImage).not.toHaveBeenCalled();
    expect(captured.updateSet?.coverImage).toBe("/covers/keep.webp");
  });
});
