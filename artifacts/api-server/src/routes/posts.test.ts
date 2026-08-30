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
  delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  insert: vi.fn(() => ({
    values: vi.fn((v: Record<string, unknown> | Array<Record<string, unknown>>) => {
      // Join-table rows (post_categories) arrive as arrays — don't let them
      // clobber the captured post insert.
      if (!Array.isArray(v)) captured.insertValues = v;
      return { returning: vi.fn(async () => insertReturn) };
    }),
  })),
  transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn((v: Record<string, unknown>) => {
          // Ignore the categoryId mirror / postCount cache writes so tests
          // keep asserting on the post's own update payload.
          const keys = Object.keys(v);
          const isMirror = keys.length === 1 && (keys[0] === "categoryId" || keys[0] === "postCount" || keys[0] === "isPrimary");
          if (!isMirror) captured.updateSet = v;
          return { where: vi.fn(async () => undefined) };
        }),
      })),
      select: vi.fn(() => makeSelectChain(selectQueue)),
      delete: (...args: unknown[]) => db.delete(...(args as [])),
      insert: (...args: unknown[]) => db.insert(...(args as [])),
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
  postCategoriesTable: {},
}));

// drizzle helpers — stubbed to harmless no-ops since `db` is fully mocked.
vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  desc: () => ({}),
  asc: () => ({}),
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

// Inject a configurable user; bypass real session lookup. Tests can swap
// `currentUser` to simulate editors with/without permissions.
const ADMIN_USER = {
  id: 1,
  role: "admin",
  displayName: "Matthew",
  avatarUrl: null,
  canPublishDirectly: true,
  canEditOthersPosts: false,
};
let currentUser: Record<string, unknown> = { ...ADMIN_USER };
vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = currentUser as unknown as express.Request["user"];
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
    collectExternalImageUrls: actual.collectExternalImageUrls,
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
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
      body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body),
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
  currentUser = { ...ADMIN_USER };
  selectQueue = [];
  insertReturn = [];
  captured.insertValues = undefined;
  captured.updateSet = undefined;
});

describe("POST /posts — external image persistence", () => {
  it("rewrites an external coverImage and ogImage to a storage path", async () => {
    // resolveCategory -> [category]; tx postCount recompute -> [{count}];
    // postsBaseQuery refetch -> [post] (attachCategories then drains an empty queue)
    selectQueue = [[CATEGORY_ROW], [{ count: 1 }], [{ id: 99, title: "T", status: "published" }]];
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
    expect(persistExternalImage).toHaveBeenCalledWith("https://images.unsplash.com/photo-1.jpg", expect.objectContaining({ uploaderId: 1 }));
    expect(persistExternalImage).toHaveBeenCalledWith("https://images.unsplash.com/og-2.jpg", expect.objectContaining({ uploaderId: 1 }));
    expect(String(captured.insertValues?.coverImage)).toMatch(/^\/api\/storage\/objects\//);
    expect(String(captured.insertValues?.ogImage)).toMatch(/^\/api\/storage\/objects\//);
  });

  it("leaves a local coverImage untouched and never calls persist", async () => {
    selectQueue = [[CATEGORY_ROW], [{ count: 1 }], [{ id: 99, title: "T", status: "published" }]];
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

  it("returns imageWarnings when persistence fails and the post keeps an external URL", async () => {
    selectQueue = [[CATEGORY_ROW], [{ count: 1 }], [{ id: 99, title: "T", status: "published" }]];
    insertReturn = [{ id: 99, title: "T", status: "published" }];
    // Simulate failure: the persist step keeps the original external URL.
    persistExternalImage.mockImplementationOnce(async (url: string) => url);

    const { status, json: body } = await request(makeApp(), "POST", "/posts", {
      title: "T",
      slug: "t",
      content: "<p>hi</p>",
      category: "ai",
      coverImage: "https://images.unsplash.com/photo-1.jpg",
    });

    expect(status).toBe(201);
    expect(Array.isArray(body.imageWarnings)).toBe(true);
    expect(body.imageWarnings.join(" ")).toMatch(/cover image/i);
  });

  it("omits imageWarnings when everything persisted", async () => {
    selectQueue = [[CATEGORY_ROW], [{ count: 1 }], [{ id: 99, title: "T", status: "published" }]];
    insertReturn = [{ id: 99, title: "T", status: "published" }];

    const { json: body } = await request(makeApp(), "POST", "/posts", {
      title: "T",
      slug: "t",
      content: "<p>hi</p>",
      category: "ai",
      coverImage: "https://images.unsplash.com/photo-1.jpg",
    });

    expect(body.imageWarnings).toBeUndefined();
  });
});

describe("GET /posts/:id — editor detail", () => {
  it("returns an automation draft to an authenticated admin for editing", async () => {
    const draft = {
      id: 42,
      title: "Automation draft",
      status: "draft",
      authorId: 77,
      categoryId: 7,
      content: "<p>Ready for review</p>",
    };
    // Post lookup, followed by the category-membership lookup.
    selectQueue = [[draft], []];

    const { status, json } = await request(makeApp(), "GET", "/posts/42");

    expect(status).toBe(200);
    expect(json).toMatchObject({
      id: 42,
      title: "Automation draft",
      status: "draft",
      content: "<p>Ready for review</p>",
    });
  });

  it("does not let an untrusted editor read a colleague's draft", async () => {
    currentUser = {
      id: 2,
      role: "editor",
      displayName: "Ed",
      canPublishDirectly: false,
      canEditOthersPosts: false,
    };
    selectQueue = [[{ id: 42, authorId: 77, categoryId: 7, status: "draft" }]];

    const { status, json } = await request(makeApp(), "GET", "/posts/42");

    expect(status).toBe(403);
    expect(json.error).toMatch(/own posts/i);
  });

  it("returns not found when the requested post no longer exists", async () => {
    selectQueue = [[]];

    const { status, json } = await request(makeApp(), "GET", "/posts/999");

    expect(status).toBe(404);
    expect(json.error).toMatch(/not found/i);
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
    expect(persistExternalImage).toHaveBeenCalledWith("https://cdn.example.com/new-cover.png", expect.objectContaining({ uploaderId: 1 }));
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

  it("returns imageWarnings on update when the cover keeps an external URL", async () => {
    const existing = { id: 42, authorId: 1, categoryId: 7, title: "Old", status: "published" };
    selectQueue = [[existing], [{ ...existing }], [{ ...existing }]];
    persistExternalImage.mockImplementationOnce(async (url: string) => url);

    const { status, json: body } = await request(makeApp(), "PUT", "/posts/42", {
      coverImage: "https://cdn.example.com/broken-host.png",
    });

    expect(status).toBe(200);
    expect(Array.isArray(body.imageWarnings)).toBe(true);
    expect(body.imageWarnings.join(" ")).toMatch(/cover image/i);
  });

  it("returns imageWarnings on update when body content keeps an external image", async () => {
    const existing = { id: 42, authorId: 1, categoryId: 7, title: "Old", status: "published" };
    selectQueue = [[existing], [{ ...existing }], [{ ...existing }]];
    // Body-image persistence goes through persistExternalImage too.
    persistExternalImage.mockImplementationOnce(async (url: string) => url);

    const { status, json: body } = await request(makeApp(), "PUT", "/posts/42", {
      content: '<p>hi</p><img src="https://cdn.example.com/inline.png">',
    });

    expect(status).toBe(200);
    expect(Array.isArray(body.imageWarnings)).toBe(true);
    expect(body.imageWarnings.join(" ")).toMatch(/article body/i);
  });

  it("does not warn about fields the update did not submit", async () => {
    // Existing post already has an external cover, but this update only
    // touches the title — no warning should fire for the untouched cover.
    const existing = {
      id: 42,
      authorId: 1,
      categoryId: 7,
      title: "Old",
      status: "published",
      coverImage: "https://cdn.example.com/old-external.png",
    };
    selectQueue = [[existing], [{ ...existing, title: "New" }], [{ ...existing, title: "New" }]];

    const { status, json: body } = await request(makeApp(), "PUT", "/posts/42", {
      title: "New",
    });

    expect(status).toBe(200);
    expect(body.imageWarnings).toBeUndefined();
  });
});

describe("PUT /posts/:id — publication ordering", () => {
  it("timestamps a draft when it is published so public lists place it by publication time", async () => {
    const draftCreatedAt = new Date("2026-01-01T12:00:00.000Z");
    const existing = {
      id: 42,
      authorId: 1,
      categoryId: 7,
      title: "Draft",
      status: "draft",
      publishedAt: draftCreatedAt,
    };
    const updated = { ...existing, status: "published" };
    // Existing row; current category memberships; joined refetch; category
    // attachment; raw refetch for the audit snapshot.
    selectQueue = [[existing], [], [updated], [], [updated]];
    const beforePublish = Date.now();

    const { status } = await request(makeApp(), "PUT", "/posts/42", {
      status: "published",
    });

    const publishedAt = captured.updateSet?.publishedAt;
    expect(status).toBe(200);
    expect(publishedAt).toBeInstanceOf(Date);
    expect((publishedAt as Date).getTime()).toBeGreaterThanOrEqual(beforePublish);
    expect((publishedAt as Date).getTime()).not.toBe(draftCreatedAt.getTime());
  });

  it("preserves an explicit publication date when publishing a draft", async () => {
    const existing = {
      id: 42,
      authorId: 1,
      categoryId: 7,
      title: "Imported draft",
      status: "draft",
      publishedAt: new Date("2026-01-01T12:00:00.000Z"),
    };
    const updated = { ...existing, status: "published" };
    selectQueue = [[existing], [], [updated], [], [updated]];
    const explicitDate = "2025-06-15T09:30:00.000Z";

    const { status } = await request(makeApp(), "PUT", "/posts/42", {
      status: "published",
      publishedAt: explicitDate,
    });

    expect(status).toBe(200);
    expect(captured.updateSet?.publishedAt).toEqual(new Date(explicitDate));
  });

  it("does not move an already-published article when it is edited", async () => {
    const originalPublishedAt = new Date("2026-01-01T12:00:00.000Z");
    const existing = {
      id: 42,
      authorId: 1,
      categoryId: 7,
      title: "Published article",
      status: "published",
      publishedAt: originalPublishedAt,
    };
    const updated = { ...existing, title: "Corrected title" };
    selectQueue = [[existing], [], [updated], [], [updated]];

    const { status } = await request(makeApp(), "PUT", "/posts/42", {
      title: "Corrected title",
      status: "published",
    });

    expect(status).toBe(200);
    expect(captured.updateSet).not.toHaveProperty("publishedAt");
  });
});

// --- Ownership / canEditOthersPosts permission ----------------------------

const auditMock = (await import("../lib/audit")).writeAuditLog as ReturnType<typeof vi.fn>;

describe("PUT /posts/:id — ownership & canEditOthersPosts", () => {
  const colleaguePost = { id: 42, authorId: 9, categoryId: 7, title: "Colleague's", status: "published" };

  it("rejects an editor without the permission editing a colleague's post", async () => {
    currentUser = { id: 2, role: "editor", displayName: "Ed", canPublishDirectly: true, canEditOthersPosts: false };
    selectQueue = [[colleaguePost]];

    const { status, json } = await request(makeApp(), "PUT", "/posts/42", { title: "Hijacked" });

    expect(status).toBe(403);
    expect(json.error).toMatch(/own posts/i);
    expect(captured.updateSet).toBeUndefined();
  });

  it("allows a trusted editor (canEditOthersPosts) to update a colleague's post and audits their identity", async () => {
    currentUser = { id: 2, role: "editor", displayName: "Trusted Ed", canPublishDirectly: true, canEditOthersPosts: true };
    selectQueue = [[colleaguePost], [{ ...colleaguePost, title: "Fixed" }], [{ ...colleaguePost, title: "Fixed" }]];

    const { status } = await request(makeApp(), "PUT", "/posts/42", { title: "Fixed" });

    expect(status).toBe(200);
    expect(captured.updateSet?.title).toBe("Fixed");
    // Byline is untouched: no author fields in the update (only admins may change them).
    expect(captured.updateSet).not.toHaveProperty("author");
    expect(captured.updateSet).not.toHaveProperty("authorId");
    // Audit log is written from the trusted editor's request identity.
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: 2 }) }),
      expect.objectContaining({ action: "post.update" }),
    );
  });

  it("still lets an editor update their own post without the permission", async () => {
    currentUser = { id: 9, role: "editor", displayName: "Owner", canPublishDirectly: true, canEditOthersPosts: false };
    selectQueue = [[colleaguePost], [{ ...colleaguePost }], [{ ...colleaguePost }]];

    const { status } = await request(makeApp(), "PUT", "/posts/42", { title: "Mine" });

    expect(status).toBe(200);
  });
});

describe("DELETE /posts/:id — stays owner/admin only", () => {
  const colleaguePost = { id: 42, authorId: 9, title: "Colleague's" };

  it("rejects deleting a colleague's post even with canEditOthersPosts", async () => {
    currentUser = { id: 2, role: "editor", displayName: "Trusted Ed", canEditOthersPosts: true };
    selectQueue = [[colleaguePost]];

    const { status, json } = await request(makeApp(), "DELETE", "/posts/42", undefined);

    expect(status).toBe(403);
    expect(json.error).toMatch(/own posts/i);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("rejects deleting a colleague's post without the permission", async () => {
    currentUser = { id: 2, role: "editor", displayName: "Ed", canEditOthersPosts: false };
    selectQueue = [[colleaguePost]];

    const { status } = await request(makeApp(), "DELETE", "/posts/42", undefined);

    expect(status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("allows the owner to delete their own post", async () => {
    currentUser = { id: 9, role: "editor", displayName: "Owner", canEditOthersPosts: false };
    selectQueue = [[colleaguePost]];

    const { status } = await request(makeApp(), "DELETE", "/posts/42", undefined);

    expect(status).toBe(204);
    expect(db.delete).toHaveBeenCalled();
  });
});
