import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";

// --- Mocks --------------------------------------------------------------

const captured: { insertValues?: Record<string, unknown>[] } = { insertValues: [] };

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

let selectQueue: unknown[][] = [];
let insertReturn: unknown[] = [];

const db = {
  select: vi.fn(() => makeSelectChain(selectQueue)),
  insert: vi.fn(() => {
    const chain = {
      values: vi.fn((v: Record<string, unknown>) => {
        captured.insertValues!.push(v);
        return {
          returning: vi.fn(async () => insertReturn),
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => insertReturn),
            then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve),
          })),
        };
      }),
    };
    return chain;
  }),
  transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn((v: Record<string, unknown>) => {
          captured.insertValues!.push(v);
          return {
            returning: vi.fn(async () => insertReturn),
            onConflictDoNothing: vi.fn(() => ({
              returning: vi.fn(async () => [{ id: 1 }]),
            })),
          };
        }),
      })),
      select: vi.fn(() => makeSelectChain(selectQueue)),
      delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
      })),
    };
    return cb(tx);
  }),
};

vi.mock("@workspace/db", () => ({
  db,
  postsTable: {},
  usersTable: {},
  categoriesTable: {},
  postCategoriesTable: {},
  automationRequestsTable: {},
  seriesTable: { id: {} },
  auditLogsTable: {},
  pageViewsTable: {},
  commentsTable: {},
}));

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

const auditCalls: { user: unknown; input: Record<string, unknown> }[] = [];
vi.mock("../lib/audit", () => ({
  writeAuditLog: vi.fn(async () => undefined),
  writeAuditLogForUser: vi.fn(async (_req: unknown, user: unknown, input: Record<string, unknown>) => {
    auditCalls.push({ user, input });
  }),
}));

vi.mock("../lib/persistExternalImage", () => ({
  isExternalImageUrl: (v: unknown) => typeof v === "string" && /^https?:\/\//.test(v) && !v.includes("mapletechie.com"),
  persistExternalImage: vi.fn(async () => "/api/storage/objects/persisted-cover"),
  persistExternalImagesInHtml: vi.fn(async (html: string) => html),
}));

vi.mock("../lib/coverImageValidation", () => ({
  validateCoverImage: vi.fn(() => null),
}));

vi.mock("../lib/auth", () => ({
  hashPassword: vi.fn(async () => "hashed"),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const automationRouter = (await import("./automation")).default;
const imagePersistence = await import("../lib/persistExternalImage");
const persistExternalImageMock = vi.mocked(imagePersistence.persistExternalImage);
const persistExternalImagesInHtmlMock = vi.mocked(imagePersistence.persistExternalImagesInHtml);

const TOKEN = "test-automation-token-1234567890";
const BOT_USER = { id: 77, username: "mapletechie-ai", displayName: "Mapletechie AI", avatarUrl: null };
const CATEGORY = { id: 10, name: "News", slug: "news" };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(automationRouter);
  return app;
}

// Tiny supertest-free HTTP helper (same pattern as posts.test.ts).
import { createServer } from "node:http";
async function httpPost(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  const server = createServer(makeApp());
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const json = await resp.json().catch(() => null);
    return { status: resp.status, json };
  } finally {
    server.close();
  }
}

const AUTH = { Authorization: `Bearer test-automation-token-1234567890` };

function validBody() {
  return {
    title: "Test story",
    slug: "test-story",
    excerpt: "A test.",
    content: "<p>Hello</p>",
    category_id: 10,
    tags: ["a"],
    read_time: 3,
    seo_title: "Test story",
    seo_description: "desc",
    seo_keywords: ["k1"],
  };
}

beforeEach(() => {
  process.env.AUTOMATION_DRAFT_TOKEN = TOKEN;
  selectQueue = [];
  insertReturn = [];
  captured.insertValues = [];
  auditCalls.length = 0;
  vi.clearAllMocks();
  persistExternalImageMock.mockResolvedValue("/api/storage/objects/persisted-cover");
  persistExternalImagesInHtmlMock.mockImplementation(async (html: string) => html);
});

describe("POST /automation/posts/drafts — auth", () => {
  it("401 without a token", async () => {
    const res = await httpPost("/automation/posts/drafts", validBody());
    expect(res.status).toBe(401);
  });

  it("401 with a wrong token", async () => {
    const res = await httpPost("/automation/posts/drafts", validBody(), {
      Authorization: "Bearer wrong-token-wrong-token-wrong",
    });
    expect(res.status).toBe(401);
  });

  it("503 when the secret is not configured", async () => {
    delete process.env.AUTOMATION_DRAFT_TOKEN;
    const res = await httpPost("/automation/posts/drafts", validBody(), AUTH);
    expect(res.status).toBe(503);
  });
});

describe("POST /automation/posts/drafts — contract", () => {
  const post = (body: unknown, extra: Record<string, string> = {}) =>
    httpPost("/automation/posts/drafts", body, { ...AUTH, ...extra });

  it("422 when forbidden fields are submitted (status/author/published_at)", async () => {
    selectQueue = [[BOT_USER]];
    const res = await post({ ...validBody(), status: "published", author_id: 1, published_at: "2026-01-01" });
    expect(res.status).toBe(422);
    expect(res.json.error).toMatch(/Forbidden field/);
    expect(auditCalls.some((c) => c.input.action === "automation.draft.rejected")).toBe(true);
  });

  it("400 when series_id references a series that does not exist", async () => {
    // bot, category, slug-clash check, then series lookup returns nothing
    selectQueue = [[BOT_USER], [CATEGORY], [], []];
    const res = await post({ ...validBody(), series_id: 999 });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/Unknown series_id/);
  });

  it("400 when series_id is not a positive integer", async () => {
    selectQueue = [[BOT_USER], [CATEGORY]];
    const res = await post({ ...validBody(), series_id: "nope" });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/Invalid series_id/);
  });

  it("400 when series_position is sent without series_id", async () => {
    selectQueue = [[BOT_USER], [CATEGORY]];
    const res = await post({ ...validBody(), series_position: 2 });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/series_position requires series_id/);
  });

  it("creates a draft with a valid series placement (still draft-only)", async () => {
    // bot, category, slug-clash check, series lookup
    selectQueue = [[BOT_USER], [CATEGORY], [], [{ id: 7 }]];
    insertReturn = [{ id: 43, title: "Test story", slug: "test-story", status: "draft" }];
    const res = await post({ ...validBody(), series_id: 7, series_position: 2 });
    expect(res.status).toBe(201);
    const values = captured.insertValues!.find((v) => v.title === "Test story")!;
    expect(values.seriesId).toBe(7);
    expect(values.seriesPosition).toBe(2);
    expect(values.status).toBe("draft");
  });

  it("422 on unknown fields", async () => {
    selectQueue = [[BOT_USER]];
    const res = await post({ ...validBody(), banana: true });
    expect(res.status).toBe(422);
    expect(res.json.error).toMatch(/Unknown field/);
  });

  it("400 when required fields are missing", async () => {
    selectQueue = [[BOT_USER]];
    const res = await post({ title: "x" });
    expect(res.status).toBe(400);
  });

  it("400 on an unknown category", async () => {
    // bot user lookup, then resolveCategory lookups return nothing
    selectQueue = [[BOT_USER], [], []];
    const res = await post(validBody());
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/Unknown category/);
  });

  it("409 when the slug already exists", async () => {
    selectQueue = [[BOT_USER], [CATEGORY], [{ id: 5 }]];
    const res = await post(validBody());
    expect(res.status).toBe(409);
  });

  it("creates a draft: forces draft status and bot authorship, returns edit_url", async () => {
    selectQueue = [[BOT_USER], [CATEGORY], []]; // bot, category, slug-clash check
    insertReturn = [{ id: 42, title: "Test story", slug: "test-story", status: "draft" }];
    const res = await post({
      ...validBody(),
      cover_image: "https://example.com/cover.jpg",
      cover_image_alt: "A close-up of a processor on a circuit board",
    });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ id: 42, status: "draft", slug: "test-story" });
    expect(res.json.edit_url).toMatch(/\/admin\/posts\/42\/edit$/);

    const values = captured.insertValues!.find((v) => v.title === "Test story")!;
    expect(values.status).toBe("draft");
    expect(values.authorId).toBe(77);
    expect(values.author).toBe("Mapletechie AI");
    expect(values.isFeatured).toBe(false);
    // external cover was re-hosted
    expect(values.coverImage).toBe("/api/storage/objects/persisted-cover");
    expect(values.coverImageAlt).toBe("A close-up of a processor on a circuit board");
    expect(persistExternalImageMock).toHaveBeenCalledWith(
      "https://example.com/cover.jpg",
      expect.objectContaining({ alt: "A close-up of a processor on a circuit board" }),
    );
    expect(auditCalls.some((c) => c.input.action === "automation.draft.create")).toBe(true);
  });

  it("preserves inline image alt text while re-hosting the article image", async () => {
    selectQueue = [[BOT_USER], [CATEGORY], []];
    insertReturn = [{ id: 44, title: "Test story", slug: "test-story", status: "draft" }];
    persistExternalImagesInHtmlMock.mockImplementation(async (html: string) =>
      html.replace("https://example.com/chip.jpg", "/api/storage/objects/persisted-inline"),
    );

    const res = await post({
      ...validBody(),
      content:
        '<p>Before.</p><img src="https://example.com/chip.jpg" alt="A technician installing an AI accelerator"><p>After.</p>',
    });

    expect(res.status).toBe(201);
    const values = captured.insertValues!.find((v) => v.title === "Test story")!;
    expect(values.content).toContain('src="/api/storage/objects/persisted-inline"');
    expect(values.content).toContain('alt="A technician installing an AI accelerator"');
    expect(persistExternalImagesInHtmlMock).toHaveBeenCalledWith(
      expect.stringContaining('alt="A technician installing an AI accelerator"'),
      expect.objectContaining({ uploaderId: 77, uploaderName: "Mapletechie AI" }),
    );
  });

  it("rejects an inline image without meaningful alt text", async () => {
    selectQueue = [[BOT_USER], [CATEGORY], []];
    const res = await post({
      ...validBody(),
      content: '<p>Before.</p><img src="https://example.com/chip.jpg" alt=""><p>After.</p>',
    });

    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/missing meaningful alt text/i);
    expect(persistExternalImagesInHtmlMock).not.toHaveBeenCalled();
  });

  it("rejects an inline image whose source is removed as unsafe", async () => {
    selectQueue = [[BOT_USER], [CATEGORY], []];
    const res = await post({
      ...validBody(),
      content: '<p>Before.</p><img src="data:image/png;base64,abc" alt="Embedded image"><p>After.</p>',
    });

    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/unsupported or missing src/i);
  });

  it("requires cover alt text whenever a cover image is supplied", async () => {
    selectQueue = [[BOT_USER], [CATEGORY], []];
    const res = await post({
      ...validBody(),
      cover_image: "https://example.com/cover.jpg",
    });

    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/cover_image_alt is required/i);
    expect(persistExternalImageMock).not.toHaveBeenCalled();
  });

  it("replays the original draft for a repeated Idempotency-Key", async () => {
    selectQueue = [
      [BOT_USER],
      [{ id: 1, idempotencyKey: "story-1", postId: 42 }], // prior request
      [{ id: 42, status: "draft", slug: "test-story" }], // the existing post
    ];
    const res = await post(validBody(), { "Idempotency-Key": "story-1" });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ id: 42, status: "draft", replayed: true });
    // nothing inserted
    expect(captured.insertValues!.filter((v) => v.title).length).toBe(0);
  });

  it("rejects an invalid slug format", async () => {
    selectQueue = [[BOT_USER], [CATEGORY]];
    const res = await post({ ...validBody(), slug: "Bad Slug!" });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/Invalid slug/);
  });
});
