import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { ObjectNotFoundError } from "../lib/objectStorage";

// --- Mocks (same conventions as automation.test.ts) ----------------------

const archiveSearchMocks = vi.hoisted(() => ({
  parseArchiveSearchParams: vi.fn((input: unknown): { success: boolean; data?: unknown; error?: string } => ({
    success: true,
    data: input,
  })),
  searchArchivePosts: vi.fn(async () => ({} as any)),
}));
const imageStorage = vi.hoisted(() => ({
  getObjectEntityFile: vi.fn(async (): Promise<any> => ({
    getMetadata: async () => [{ contentType: "image/webp" }],
  })),
}));

vi.mock("../lib/archiveSearch", () => archiveSearchMocks);
vi.mock("../lib/objectStorage", () => ({
  ObjectNotFoundError: class ObjectNotFoundError extends Error {},
  ObjectStorageService: class ObjectStorageService {
    getObjectEntityFile = imageStorage.getObjectEntityFile;
  },
}));

const captured: {
  insertValues?: Record<string, unknown>[];
  updateValues?: Record<string, unknown>[];
} = { insertValues: [], updateValues: [] };
const rowLockModes: unknown[] = [];
let failMcpAuditInsert = false;

let lastSelectedPost: Record<string, unknown> | null = null;

function makeSelectChain(queue: unknown[][]) {
  const proxy: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          const result = queue.length ? queue.shift() : [];
          if (Array.isArray(result) && result[0] && typeof result[0] === "object" && "slug" in result[0]) {
            lastSelectedPost = result[0] as Record<string, unknown>;
          }
          return Promise.resolve(result).then(resolve, reject);
        };
      }
      if (prop === "for") {
        return (mode: unknown) => {
          rowLockModes.push(mode);
          return proxy;
        };
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
let updateReturn: unknown[] = [];

const db = {
  select: vi.fn(() => makeSelectChain(selectQueue)),
  insert: vi.fn(() => ({
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
  })),
  update: vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      captured.updateValues!.push(values);
      return {
        where: vi.fn(() => ({
          returning: vi.fn(async () => updateReturn),
        })),
      };
    }),
  })),
  transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
        execute: vi.fn(async () => undefined),
      insert: vi.fn(() => ({
        values: vi.fn((v: Record<string, unknown>) => {
          captured.insertValues!.push(v);
          if (failMcpAuditInsert && typeof v.action === "string" && v.action.startsWith("mcp.topic_cluster.")) {
            throw new Error("Simulated audit insert failure");
          }
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
        set: vi.fn((v: Record<string, unknown>) => {
          captured.updateValues!.push(v);
          return {
            where: vi.fn(() => ({
              returning: vi.fn(async () => "reviewedAt" in v
                ? [{ id: 15, ...v }]
                : (lastSelectedPost ? [{ ...lastSelectedPost, ...v }] : [])),
              then: (resolve: (value: unknown) => void) => Promise.resolve(undefined).then(resolve),
            })),
          };
        }),
      })),
    };
    return cb(tx);
  }),
};

vi.mock("@workspace/db", () => ({
  db,
  postsTable: {},
  usersTable: {},
  categoriesTable: { id: {}, name: {}, slug: {} },
  topicsTable: { id: {} },
  postCategoriesTable: {},
  postRevisionsTable: { id: {}, postId: {}, status: {}, createdAt: {} },
  automationRequestsTable: {},
  auditLogsTable: {},
  pageViewsTable: {},
  commentsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  count: () => ({}),
  ilike: () => ({}),
  asc: () => ({}),
  desc: () => ({}),
  and: () => ({}),
  gte: () => ({}),
  sql: Object.assign(() => ({}), {}),
  inArray: () => ({}),
  isNotNull: () => ({}),
  notExists: () => ({}),
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
  collectExternalImageUrls: (html: unknown) =>
    typeof html === "string"
      ? [...html.matchAll(/<img\b[^>]*\bsrc="(https?:\/\/[^"]+)"/gi)].map((match) => match[1])
      : [],
  persistExternalImage: vi.fn(async () => "/api/storage/objects/persisted-cover"),
  persistExternalImagesInHtml: vi.fn(async (html: string) => html),
  persistImageBuffer: vi.fn(async (buf: Buffer) => {
    if (buf.byteLength === 0) throw new Error("Empty image data");
    return "/api/storage/objects/uploads/mock-upload";
  }),
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

vi.mock("../lib/automationDraftNotification", () => ({
  notifyEditorsOfAutomationDraft: vi.fn(async () => undefined),
}));

vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mcpRouter = (await import("./mcp")).default;
const revisionsRouter = (await import("./postRevisions")).default;
const { editorialFingerprint } = await import("./postRevisions");
const imagePersistence = await import("../lib/persistExternalImage");
const persistExternalImageMock = vi.mocked(imagePersistence.persistExternalImage);
const persistImageBufferMock = vi.mocked(imagePersistence.persistImageBuffer);

const KEY = "test-mcp-connector-key-1234567890";
const BOT_USER = { id: 77, username: "mapletechie-ai", displayName: "Mapletechie AI", avatarUrl: null };
const CATEGORY = { id: 10, name: "News", slug: "news" };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(mcpRouter);
  return app;
}

async function reviewRequest(
  action: string, user: Record<string, unknown>, body?: unknown,
): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user as any; next(); });
  app.use(revisionsRouter);
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/admin/posts/42/revisions/15/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return { status: response.status, body: await response.json() };
  } finally { server.close(); }
}

async function queueRequest(
  user: Record<string, unknown>, query = "",
): Promise<{ status: number; body: any }> {
  const app = express();
  app.use((req, _res, next) => { req.user = user as any; next(); });
  app.use(revisionsRouter);
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/admin/revisions${query}`);
    return { status: response.status, body: await response.json() };
  } finally { server.close(); }
}

import { createServer } from "node:http";

/** POST a JSON-RPC message to /mcp and return { status, rpc } (JSON mode). */
async function rpc(
  message: unknown,
  { query = "", headers = {} }: { query?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: any }> {
  const server = createServer(makeApp());
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/mcp${query}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(message),
    });
    const text = await resp.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      // SSE fallback: grab the first data: line
      const m = text.match(/^data: (.*)$/m);
      if (m) body = JSON.parse(m[1]);
    }
    return { status: resp.status, body };
  } finally {
    server.close();
  }
}

function callTool(name: string, args: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  };
}

const draftArgs = () => ({
  title: "Test story",
  slug: "test-story",
  excerpt: "A test.",
  content: "<p>Hello</p>",
  category_id: 10,
  tags: ["a"],
  read_time: 3,
});

beforeEach(() => {
  process.env.MCP_CONNECTOR_TOKEN = KEY;
  process.env.AUTOMATION_DRAFT_TOKEN = "unrelated-secret-1234567890";
  selectQueue = [];
  lastSelectedPost = null;
  insertReturn = [];
  updateReturn = [];
  captured.insertValues = [];
  captured.updateValues = [];
  auditCalls.length = 0;
  rowLockModes.length = 0;
  failMcpAuditInsert = false;
  vi.clearAllMocks();
  imageStorage.getObjectEntityFile.mockImplementation(async () => ({
    getMetadata: async () => [{ contentType: "image/webp" }],
  }));
  archiveSearchMocks.parseArchiveSearchParams.mockImplementation(
    (input: unknown) => ({ success: true, data: input }),
  );
  archiveSearchMocks.searchArchivePosts.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
});

describe("POST /mcp — auth", () => {
  it("401 with no key and audits the failure", async () => {
    const res = await rpc(callTool("list_mapletechie_categories", {}));
    expect(res.status).toBe(401);
    expect(auditCalls.some((c) => c.input.action === "mcp.auth.failed")).toBe(true);
  });

  it("401 with a wrong key (query param)", async () => {
    const res = await rpc(callTool("list_mapletechie_categories", {}), { query: "?key=wrong-key-wrong-key-wrong" });
    expect(res.status).toBe(401);
  });

  it("the automation draft token is NOT accepted as the connector key", async () => {
    const res = await rpc(callTool("list_mapletechie_categories", {}), {
      headers: { Authorization: `Bearer unrelated-secret-1234567890` },
    });
    expect(res.status).toBe(401);
  });

  it("503 when MCP_CONNECTOR_TOKEN is not configured", async () => {
    delete process.env.MCP_CONNECTOR_TOKEN;
    const res = await rpc(callTool("list_mapletechie_categories", {}), { query: `?key=${KEY}` });
    expect(res.status).toBe(503);
  });

  it("405 on GET (stateless mode)", async () => {
    const server = createServer(makeApp());
    await new Promise<void>((r) => server.listen(0, r));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/mcp?key=${KEY}`);
      expect(resp.status).toBe(405);
    } finally {
      server.close();
    }
  });
});

describe("POST /mcp — tools", () => {
  const authed = (msg: unknown) => rpc(msg, { query: `?key=${KEY}` });

  it("lists tools", async () => {
    const res = await authed({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    expect(res.status).toBe(200);
    const names = res.body.result.tools.map((t: any) => t.name);
    expect(names).toContain("get_mapletechie_editorial_contract");
    expect(names).toContain("list_mapletechie_categories");
    expect(names).toContain("list_mapletechie_posts");
    expect(names).toContain("search_mapletechie_archive");
    expect(names).toContain("list_mapletechie_topic_clusters");
    expect(names).toContain("get_mapletechie_topic_cluster");
    expect(names).toContain("create_mapletechie_topic_cluster");
    expect(names).toContain("manage_mapletechie_post_cluster");
    expect(names).toContain("create_mapletechie_draft");
    expect(names).toContain("get_mapletechie_post");
    expect(names).toContain("propose_mapletechie_revision");
    const revisionTool = res.body.result.tools.find((t: any) => t.name === "propose_mapletechie_revision");
    expect(revisionTool.description).toMatch(/reader-facing update_note.*Update history/i);
    expect(revisionTool.inputSchema.properties.update_note.description).toMatch(/plain-text reader-facing summary/i);
    expect(names).toContain("preview_mapletechie_post");
    expect(names).toContain("upload_mapletechie_image");
    expect(names).toContain("backfill_mapletechie_images");
    const tools = res.body.result.tools;
    const draft = tools.find((t: any) => t.name === "create_mapletechie_draft");
    expect(Object.keys(draft.inputSchema.properties)).toEqual(expect.arrayContaining(["cluster_id", "cluster_role"]));
    const createCluster = tools.find((t: any) => t.name === "create_mapletechie_topic_cluster");
    expect(Object.keys(createCluster.inputSchema.properties)).not.toContain("is_public");
    expect(createCluster.description).toMatch(/always private/i);
    const manageCluster = tools.find((t: any) => t.name === "manage_mapletechie_post_cluster");
    expect(manageCluster.description).toMatch(/both.*private/i);
    expect(manageCluster.description).toMatch(/public-cluster membership.*human/i);
    expect(Object.keys(manageCluster.inputSchema.properties)).toEqual(
      expect.arrayContaining(["post_id", "cluster_id", "cluster_role"]),
    );
    expect(manageCluster.inputSchema.required).toEqual(expect.arrayContaining(["post_id", "cluster_id"]));
    expect(draft.inputSchema.properties.content.description).toMatch(/reddit\|twitter\|youtube|youtube\|twitter\|reddit/i);
    const backfill = tools.find((t: any) => t.name === "backfill_mapletechie_images");
    expect(backfill.description).toMatch(/draft only/i);
    const revision = tools.find((t: any) => t.name === "propose_mapletechie_revision");
    expect(Object.keys(revision.inputSchema.properties.changes.properties)).toEqual(expect.arrayContaining(["coverImage", "coverImageAlt", "ogImage"]));
    const archive = tools.find((t: any) => t.name === "search_mapletechie_archive");
    expect(Object.keys(archive.inputSchema.properties)).toEqual(expect.arrayContaining(["publishedFrom", "publishedTo"]));
  });

  it("requires exactly one post_id or slug for get_mapletechie_post", async () => {
    for (const arguments_ of [{}, { post_id: 42, slug: "story" }]) {
      const res = await authed(callTool("get_mapletechie_post", arguments_));
      expect(res.status).toBe(200);
      expect(res.body.result.isError).toBe(true);
    }
  });

  it("returns the complete canonical post, including ordered category identity", async () => {
    selectQueue = [[{
      id: 42, title: "Current story", slug: "current-story", excerpt: "Summary",
      content: "<p>Stored</p>", categoryId: 10, tags: ["ai"], author: "Mapletechie AI",
      authorId: 77, status: "draft", createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"), seoKeywords: [],
    }], [
      { id: 10, name: "AI", slug: "ai", isPrimary: true },
      { id: 11, name: "News", slug: "news", isPrimary: false },
    ]];
    const res = await authed(callTool("get_mapletechie_post", { post_id: 42 }));
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload).toMatchObject({
      id: 42, slug: "current-story", content: "<p>Stored</p>",
      categories: [
        { id: 10, slug: "ai", is_primary: true },
        { id: 11, slug: "news", is_primary: false },
      ],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    });
  });

  it.each(["published", "scheduled"])("can inspect a %s post before proposing a correction", async (status) => {
    selectQueue = [[{
      id: 42, title: "Correction target", slug: "correction-target", excerpt: "Summary",
      content: "<p>Stored</p>", categoryId: 10, tags: [], author: "Editor",
      authorId: 5, status, createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
      scheduledFor: status === "scheduled" ? new Date("2026-10-01T00:00:00Z") : null,
      publishedAt: new Date("2026-01-01T00:00:00Z"), seoKeywords: [],
    }], []];
    const result = await authed(callTool("get_mapletechie_post", { post_id: 42 }));
    expect(result.body.result.isError).toBeFalsy();
    expect(JSON.parse(result.body.result.content[0].text)).toMatchObject({ id: 42, slug: "correction-target", status });
  });

  it("proposes a published revision without touching the live article", async () => {
    const live = {
      id: 42, status: "published", slug: "kept-url", title: "Old title",
      excerpt: "Old summary", content: "<p>Old body</p>",
      publishedAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2026-09-20T00:00:00Z"),
      authorId: 5, contentModifiedAt: null,
    };
    selectQueue = [[live]];
    insertReturn = [{ id: 15, status: "pending", postId: 42, createdAt: new Date("2026-02-10T12:00:00Z") }];
    const res = await authed(callTool("propose_mapletechie_revision", {
      post_id: 42, changes: { content: "<p>Revised body</p>" }, update_note: "Added new testing",
    }));
    expect(res.body.result.isError).toBeFalsy();
    expect(JSON.parse(res.body.result.content[0].text).revision.status).toBe("pending");
    expect(captured.insertValues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        postId: 42, source: "connector", changes: { content: "<p>Revised body</p>" },
      }),
    ]));
    expect(captured.updateValues).toHaveLength(0);
    expect(captured.insertValues).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "automation.post.revision.proposed" }),
    ]));
  });

  it("refuses identity changes but allows SEO-only proposals without changing the live post", async () => {
    const badIdentity = await authed(callTool("propose_mapletechie_revision", {
      post_id: 42, changes: { content: "<p>New</p>", slug: "new-url" },
    }));
    expect(badIdentity.body.result.isError).toBe(true);
    selectQueue = [[{
      id: 42, status: "published", slug: "kept-url", title: "Old",
      excerpt: "Old", content: "<p>Old</p>", publishedAt: new Date("2024-01-01T00:00:00Z"),
    }]];
    insertReturn = [{ id: 15, status: "pending", postId: 42, createdAt: new Date("2026-02-10T12:00:00Z") }];
    const seo = await authed(callTool("propose_mapletechie_revision", {
      post_id: 42, changes: { seoTitle: "SEO only" },
    }));
    // A complete proposal never updates the live post; only a reviewer can do so.
    expect(seo.body.result.isError).toBeFalsy();
    expect(captured.updateValues).toHaveLength(0);
  });

  it("proposes a scheduled image correction using an uploaded Mapletechie URL without changing the post", async () => {
    const upload = await authed(callTool("upload_mapletechie_image", {
      image_base64: Buffer.from("fake-image-bytes").toString("base64"),
      alt_text: "Canadian chip on a circuit board",
    }));
    const url = JSON.parse(upload.body.result.content[0].text).url;
    const scheduled = {
      id: 42, status: "scheduled", slug: "upcoming-story", title: "Upcoming",
      excerpt: "Summary", content: "<p>Body</p>",
      publishedAt: new Date("2026-10-01T00:00:00Z"),
      scheduledFor: new Date("2026-10-03T00:00:00Z"),
      authorId: 5, contentModifiedAt: null, coverImageAlt: null,
    };
    selectQueue = [[scheduled]];
    insertReturn = [{ id: 15, status: "pending", postId: 42, createdAt: new Date("2026-02-10T12:00:00Z") }];
    const result = await authed(callTool("propose_mapletechie_revision", {
      post_id: 42, changes: {
        coverImage: url, coverImageAlt: "Canadian chip on a circuit board", ogImage: url,
      },
    }));
    expect(result.body.result.isError).toBeFalsy();
    expect(imageStorage.getObjectEntityFile).toHaveBeenCalledWith("/objects/uploads/mock-upload");
    expect(captured.insertValues).toEqual(expect.arrayContaining([expect.objectContaining({
      source: "connector", changes: {
        coverImage: url, coverImageAlt: "Canadian chip on a circuit board", ogImage: url,
      },
    })]));
    expect(captured.updateValues).toHaveLength(0);
  });

  it("rejects missing or non-image replacement uploads without creating a proposal", async () => {
    const live = {
      id: 42, status: "published", slug: "live", title: "Live", content: "<p>Text</p>",
      publishedAt: new Date("2024-01-01T00:00:00Z"), authorId: 5, coverImageAlt: "Existing cover",
    };
    selectQueue = [[live]];
    imageStorage.getObjectEntityFile.mockRejectedValueOnce(new ObjectNotFoundError());
    const missing = await authed(callTool("propose_mapletechie_revision", {
      post_id: 42, changes: { coverImage: "/api/storage/objects/uploads/not-present" },
    }));
    expect(missing.body.result.isError).toBe(true);
    expect(JSON.parse(missing.body.result.content[0].text).error).toMatch(/not found/i);
    expect(captured.insertValues).toHaveLength(0);

    selectQueue = [[live]];
    imageStorage.getObjectEntityFile.mockResolvedValueOnce({
      getMetadata: async () => [{ contentType: "text/html" }],
    });
    const invalid = await authed(callTool("propose_mapletechie_revision", {
      post_id: 42, changes: { coverImage: "/api/storage/objects/uploads/not-an-image" },
    }));
    expect(invalid.body.result.isError).toBe(true);
    expect(JSON.parse(invalid.body.result.content[0].text).error).toMatch(/not an image/i);
    expect(captured.insertValues).toHaveLength(0);
  });

  it("returns a signed HTTPS preview URL with identity and viewport", async () => {
    process.env.SITE_DOMAIN = "http://preview.example.test";
    selectQueue = [[{ id: 42, title: "Preview story", slug: "preview-story", status: "draft" }], []];
    const res = await authed(callTool("preview_mapletechie_post", { post_id: 42, width: 1200, height: 800 }));
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.url).toMatch(/^https:\/\/preview\.example\.test\/preview\/posts\/42#token=/);
    expect(payload).toMatchObject({
      expires_at: expect.any(String),
      post: { id: 42, slug: "preview-story" },
      viewport: { width: 1200, height: 800 },
    });
  });

  it("returns the canonical schedule and editorial instructions", async () => {
    const res = await authed(callTool("get_mapletechie_editorial_contract", {}));
    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBeFalsy();
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.schedule).toMatchObject({
      cadence: "daily",
      cron: "0 7 * * *",
      timezone: "America/Toronto",
    });
    expect(payload.schedule.days).toHaveLength(7);
    expect(payload.instructions).toMatch(/five is a target/i);
    expect(payload.instructions).toMatch(/meaningful original value/i);
    expect(payload.instructions).toMatch(/full published archive/i);
    expect(payload.instructions).toMatch(/review-only revision proposal/i);
    expect(payload.instructions).toMatch(/topic clusters/i);
    expect(payload.instructions).toMatch(/social reaction/i);
    expect(payload.instructions).toMatch(/visual-logic pass/i);
    expect(payload.instructions).toMatch(/do not insert JSON-LD/i);
    expect(payload.instructions).toMatch(/never.*publish/i);
    expect(payload.instructions).toMatch(/cannibalization/i);
    expect(payload.instructions).toMatch(/full archive/i);
    expect(payload.instructions).toMatch(/not keyword similarity/i);
    expect(payload.instructions).toMatch(/both the current and destination clusters are private/i);
    expect(payload.reportFormat.blocked).toMatch(/exact blocker/i);
  });

  it("list_mapletechie_categories returns the category list", async () => {
    selectQueue = [[CATEGORY, { id: 11, name: "Reviews", slug: "reviews" }]];
    const res = await authed(callTool("list_mapletechie_categories", {}));
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({ id: 10, name: "News" });
  });

  it("list_mapletechie_posts returns recent posts with image metadata", async () => {
    selectQueue = [[
      {
        id: 265,
        title: "Newest draft",
        slug: "newest-draft",
        status: "draft",
        cover_image: "/api/storage/objects/cover-265",
        cover_image_alt: null,
      },
      {
        id: 264,
        title: "Older draft",
        slug: "older-draft",
        status: "draft",
        cover_image: null,
        cover_image_alt: null,
      },
    ]];

    const res = await authed(callTool("list_mapletechie_posts", { status: "draft", limit: 29 }));

    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBeFalsy();
    expect(JSON.parse(res.body.result.content[0].text)).toEqual([
      {
        id: 265,
        title: "Newest draft",
        slug: "newest-draft",
        status: "draft",
        cover_image: "/api/storage/objects/cover-265",
        cover_image_alt: null,
      },
      {
        id: 264,
        title: "Older draft",
        slug: "older-draft",
        status: "draft",
        cover_image: null,
        cover_image_alt: null,
      },
    ]);
  });

  it("searches all posts through the shared archive query with rich filters and pagination", async () => {
    const args = {
      q: "maple",
      title: "processor",
      slug: "guide",
      body: "benchmark",
      tag: "AI",
      category: "Reviews",
      cluster: "hardware",
      status: "draft",
      dateFrom: "2026-01-01",
      dateTo: "2026-02-01",
      publishedFrom: "2026-01-15",
      publishedTo: "2026-01-31",
      author: "Editor",
      page: 3,
      limit: 17,
    };
    const archiveResponse = {
      items: [{
        id: 901, title: "Archive match", slug: "archive-match", status: "draft",
        categories: [{ id: 1, name: "Reviews", slug: "reviews", isPrimary: true }],
      }],
      page: 3,
      limit: 17,
      total: 57,
    };
    archiveSearchMocks.searchArchivePosts.mockResolvedValueOnce(archiveResponse);

    const res = await authed(callTool("search_mapletechie_archive", {
      ...args,
    }));
    expect(res.status).toBe(200);
    expect(archiveSearchMocks.parseArchiveSearchParams).toHaveBeenCalledWith(args);
    expect(archiveSearchMocks.searchArchivePosts).toHaveBeenCalledWith(args, { all: true });
    expect(JSON.parse(res.body.result.content[0].text)).toEqual(archiveResponse);
  });

  it("returns archive-helper validation errors without running a search", async () => {
    archiveSearchMocks.parseArchiveSearchParams.mockReturnValueOnce({
      success: false,
      error: "dateFrom and dateTo must be valid dates in YYYY-MM-DD format.",
    });
    const res = await authed(callTool("search_mapletechie_archive", { dateFrom: "2026-02-30" }));
    expect(res.body.result.isError).toBe(true);
    expect(JSON.parse(res.body.result.content[0].text).error).toMatch(/valid dates/);
    expect(archiveSearchMocks.searchArchivePosts).not.toHaveBeenCalled();
  });

  it("lists topic clusters and retrieves cluster detail with assigned posts", async () => {
    selectQueue = [[{ id: 6, name: "AI", slug: "ai" }]];
    const listed = await authed(callTool("list_mapletechie_topic_clusters", {}));
    expect(JSON.parse(listed.body.result.content[0].text)).toEqual([
      { id: 6, name: "AI", slug: "ai" },
    ]);

    selectQueue = [
      [{ id: 6, name: "AI", slug: "ai", description: "AI coverage" }],
      [{ id: 42, title: "AI story", slug: "ai-story", status: "draft", cluster_role: "pillar" }],
    ];
    const detail = await authed(callTool("get_mapletechie_topic_cluster", { cluster_id: 6 }));
    expect(JSON.parse(detail.body.result.content[0].text)).toMatchObject({
      id: 6,
      name: "AI",
      posts: [{ id: 42, cluster_role: "pillar" }],
    });
  });

  it("creates a private cluster and audits its before/after state", async () => {
    insertReturn = [{
      id: 21, name: "Canadian AI infrastructure", slug: "canadian-ai-infrastructure",
      introduction: "Coverage of Canadian AI infrastructure.", isPublic: false,
    }];
    const result = await authed(callTool("create_mapletechie_topic_cluster", {
      name: "Canadian AI infrastructure",
      slug: "canadian-ai-infrastructure",
      introduction: "Coverage of Canadian AI infrastructure.",
    }));
    expect(result.body.result.isError).toBeFalsy();
    expect(captured.insertValues).toContainEqual(expect.objectContaining({
      name: "Canadian AI infrastructure",
      slug: "canadian-ai-infrastructure",
      isPublic: false,
    }));
    expect(captured.insertValues).toContainEqual(expect.objectContaining({
      action: "mcp.topic_cluster.created",
      entityId: "21",
      details: expect.objectContaining({
        source: "mcp",
        occurredAt: expect.any(String),
        before: null,
        after: expect.objectContaining({ id: 21, isPublic: false }),
      }),
    }));
  });

  it("rejects unstable cluster slugs before attempting creation", async () => {
    const result = await authed(callTool("create_mapletechie_topic_cluster", {
      name: "AI coverage", slug: "AI_coverage",
    }));
    expect(result.body.result.isError).toBe(true);
    expect(captured.insertValues).toHaveLength(0);
  });

  it("fails the cluster mutation when its transactional audit insert fails", async () => {
    failMcpAuditInsert = true;
    insertReturn = [{
      id: 22, name: "Audit failure", slug: "audit-failure",
      introduction: "", isPublic: false,
    }];
    const result = await authed(callTool("create_mapletechie_topic_cluster", {
      name: "Audit failure", slug: "audit-failure",
    }));
    expect(result.body.result.isError).toBe(true);
    expect(captured.insertValues).toContainEqual(expect.objectContaining({
      action: "mcp.topic_cluster.created",
      entityId: "22",
    }));
    expect(db.transaction).toHaveBeenCalled();
  });

  it("moves an existing post between private clusters without changing article fields and records audit evidence", async () => {
    const post = {
      id: 42, title: "Existing published story", slug: "existing-story", status: "published",
      clusterId: 6, clusterRole: "supporting", content: "<p>Keep this</p>",
      author: "Editor", publishedAt: new Date("2024-01-01T00:00:00Z"),
    };
    selectQueue = [
      [post],
      [
        { id: 6, name: "Old private", isPublic: false },
        { id: 8, name: "New private", isPublic: false },
      ],
    ];
    const result = await authed(callTool("manage_mapletechie_post_cluster", {
      post_id: 42, cluster_id: 8, cluster_role: "pillar",
    }));
    expect(result.body.result.isError).toBeFalsy();
    expect(captured.updateValues).toEqual([{ clusterId: 8, clusterRole: "pillar" }]);
    expect(rowLockModes).toEqual(["update", "update"]);
    expect(captured.insertValues).toContainEqual(expect.objectContaining({
      action: "mcp.topic_cluster.membership.updated",
      entityId: "42",
      details: expect.objectContaining({
        source: "mcp",
        occurredAt: expect.any(String),
        before: { clusterId: 6, clusterRole: "supporting" },
        after: { clusterId: 8, clusterRole: "pillar" },
      }),
    }));
  });

  it("rejects membership changes across the public-cluster boundary", async () => {
    selectQueue = [
      [{ id: 42, title: "Live", slug: "live", status: "published", clusterId: 6, clusterRole: "supporting" }],
      [
        { id: 6, name: "Public source", isPublic: true },
        { id: 8, name: "Private destination", isPublic: false },
      ],
    ];
    const moved = await authed(callTool("manage_mapletechie_post_cluster", {
      post_id: 42, cluster_id: 8, cluster_role: "supporting",
    }));
    expect(moved.body.result.isError).toBe(true);
    expect(JSON.parse(moved.body.result.content[0].text).error).toMatch(/public topic cluster/i);
    expect(captured.updateValues).toHaveLength(0);

    selectQueue = [
      [{ id: 43, title: "Draft", slug: "draft", status: "draft", clusterId: null, clusterRole: null }],
      [{ id: 9, name: "Public destination", isPublic: true }],
    ];
    const assigned = await authed(callTool("manage_mapletechie_post_cluster", {
      post_id: 43, cluster_id: 9, cluster_role: "supporting",
    }));
    expect(assigned.body.result.isError).toBe(true);
    expect(JSON.parse(assigned.body.result.content[0].text).error).toMatch(/only assign posts to private/i);
    expect(captured.updateValues).toHaveLength(0);
  });

  it("rejects a second pillar and protects concurrent membership decisions with row locks", async () => {
    selectQueue = [
      [{ id: 42, title: "Post", slug: "post", status: "draft", clusterId: null, clusterRole: null }],
      [{ id: 6, name: "Private", isPublic: false }],
      [{ id: 99 }],
    ];
    const result = await authed(callTool("manage_mapletechie_post_cluster", {
      post_id: 42, cluster_id: 6, cluster_role: "pillar",
    }));
    expect(result.body.result.isError).toBe(true);
    expect(JSON.parse(result.body.result.content[0].text).error).toMatch(/already has a pillar/i);
    expect(rowLockModes).toEqual(["update", "update"]);
    expect(captured.updateValues).toHaveLength(0);
  });

  it("create_mapletechie_draft creates a draft with bot authorship", async () => {
    selectQueue = [[BOT_USER], [CATEGORY], []]; // bot, category, slug-clash
    insertReturn = [{ id: 42, title: "Test story", slug: "test-story", status: "draft" }];
    const res = await authed(callTool("create_mapletechie_draft", draftArgs()));
    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBeFalsy();
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload).toMatchObject({ id: 42, status: "draft", slug: "test-story" });
    expect(payload.edit_url).toMatch(/\/admin\/posts\/42\/edit$/);

    const values = captured.insertValues!.find((v) => v.title === "Test story")!;
    expect(values.status).toBe("draft");
    expect(values.authorId).toBe(77);
    expect(auditCalls.some((c) => c.input.action === "automation.draft.create")).toBe(true);
  });

  it("accepts a Reddit comment as controlled context and reports removed duplicate embeds for review", async () => {
    selectQueue = [[BOT_USER], [CATEGORY], []];
    insertReturn = [{ id: 44, title: "Test story", slug: "test-story", status: "draft" }];
    const content = '<p>Outside reaction, not verified reporting.</p>' +
      '<div data-social-embed="reddit" data-url="https://old.reddit.com/r/rust/comments/xyz987/topic/abcd56/"></div>' +
      '<div data-social-embed="reddit" data-url="https://www.reddit.com/r/rust/comments/xyz987/other/abcd56/?context=2"></div>';
    const res = await authed(callTool("create_mapletechie_draft", { ...draftArgs(), content }));
    expect(res.body.result.isError).toBeFalsy();
    const values = captured.insertValues!.find((v) => v.title === "Test story")!;
    expect(values.status).toBe("draft");
    expect(values.content).toContain("https://www.reddit.com/r/rust/comments/xyz987/_/abcd56/");
    expect(values.embedReport).toMatchObject({ requested: 2, preserved: 1, removed: 1, by_provider: { reddit: 1 } });
    expect((values.embedReport as any).items).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "duplicate" })]));
  });

  it("create_mapletechie_draft accepts validated cluster assignments", async () => {
    selectQueue = [[BOT_USER], [CATEGORY], [], [{ id: 6 }], [{ id: 6, isPublic: false }]];
    insertReturn = [{ id: 43, title: "Test story", slug: "test-story", status: "draft" }];
    const res = await authed(callTool("create_mapletechie_draft", {
      ...draftArgs(), cluster_id: 6, cluster_role: "supporting",
    }));
    expect(res.body.result.isError).toBeFalsy();
    expect(captured.insertValues!.find((v) => v.title === "Test story")).toMatchObject({
      clusterId: 6, clusterRole: "supporting", status: "draft",
    });
  });

  it("create_mapletechie_draft rejects assignment to a public cluster", async () => {
    // The preliminary existence read sees a private cluster, but the locked
    // transaction re-read sees it became public before the insert.
    selectQueue = [[BOT_USER], [CATEGORY], [], [{ id: 6, isPublic: false }], [{ id: 6, isPublic: true }]];
    const res = await authed(callTool("create_mapletechie_draft", {
      ...draftArgs(), cluster_id: 6, cluster_role: "supporting",
    }));
    expect(res.body.result.isError).toBe(true);
    expect(JSON.parse(res.body.result.content[0].text).error).toMatch(/only assign drafts to private/i);
    expect(rowLockModes).toContain("update");
    expect(captured.insertValues).toHaveLength(0);
  });

  it("create_mapletechie_draft rejects forbidden fields loudly (isError, 422 message)", async () => {
    selectQueue = [[BOT_USER]];
    const res = await authed(callTool("create_mapletechie_draft", { ...draftArgs(), status: "published" }));
    expect(res.status).toBe(200); // JSON-RPC level OK; tool-level error
    expect(res.body.result.isError).toBe(true);
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.error).toMatch(/Forbidden field/);
    expect(auditCalls.some((c) => c.input.action === "automation.draft.rejected")).toBe(true);
    expect(captured.insertValues!.filter((v) => v.title).length).toBe(0);
  });

  it("create_mapletechie_draft exposes author_avatar as forbidden", async () => {
    selectQueue = [[BOT_USER]];
    const res = await authed(callTool("create_mapletechie_draft", { ...draftArgs(), author_avatar: "/avatar.png" }));
    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBe(true);
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.error).toMatch(/Forbidden field.*authorAvatar/i);
    expect(captured.insertValues!.filter((v) => v.title).length).toBe(0);
  });

  it("upload_mapletechie_image stores the image and returns a local URL", async () => {
    const b64 = Buffer.from("fake-image-bytes").toString("base64");
    const res = await authed(callTool("upload_mapletechie_image", {
      image_base64: b64,
      filename: "cover.png",
      alt_text: "A processor package beside a Canadian flag",
    }));
    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBeFalsy();
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.url).toBe("/api/storage/objects/uploads/mock-upload");
    expect(persistImageBufferMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "cover.png",
      expect.objectContaining({ alt: "A processor package beside a Canadian flag" }),
    );
    expect(auditCalls.some((c) => c.input.action === "mcp.image.uploaded")).toBe(true);
  });

  it("upload_mapletechie_image accepts a data: URI prefix", async () => {
    const b64 = `data:image/png;base64,${Buffer.from("fake-image-bytes").toString("base64")}`;
    const res = await authed(callTool("upload_mapletechie_image", {
      image_base64: b64,
      alt_text: "Diagram of an AI model pipeline",
    }));
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.url).toBe("/api/storage/objects/uploads/mock-upload");
  });

  it("upload_mapletechie_image rejects invalid base64 with a tool-level error", async () => {
    const res = await authed(callTool("upload_mapletechie_image", {
      image_base64: "not valid base64 !!!",
      alt_text: "Invalid test image",
    }));
    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBe(true);
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.error).toBeTruthy();
    expect(auditCalls.some((c) => c.input.action === "mcp.image.uploaded")).toBe(false);
  });

  it("upload_mapletechie_image rejects whitespace-only alt text", async () => {
    const b64 = Buffer.from("fake-image-bytes").toString("base64");
    const res = await authed(callTool("upload_mapletechie_image", {
      image_base64: b64,
      alt_text: "   ",
    }));

    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBe(true);
    expect(persistImageBufferMock).not.toHaveBeenCalled();
  });

  it("backfill_mapletechie_images rejects published posts without mutation", async () => {
    const existing = {
      id: 52,
      title: "Published MCP story",
      slug: "published-mcp-story",
      authorId: 12,
      status: "published",
      coverImage: "/api/storage/objects/cover",
    };
    selectQueue = [[BOT_USER], [existing]];
    const res = await authed(callTool("backfill_mapletechie_images", {
      slug: "published-mcp-story",
      cover_image_alt: "A circuit board under inspection",
    }));

    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBe(true);
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.error).toMatch(/only for drafts/);
    expect(captured.updateValues).toHaveLength(0);
  });

  it("backfill_mapletechie_images rejects scheduled posts without mutation", async () => {
    selectQueue = [[BOT_USER], [{ id: 52, slug: "scheduled-story", status: "scheduled", coverImage: "/covers/old.webp" }]];
    const res = await authed(callTool("backfill_mapletechie_images", {
      post_id: 52, cover_image_alt: "A circuit board",
    }));
    expect(res.body.result.isError).toBe(true);
    expect(captured.updateValues).toHaveLength(0);
  });

  it("backfill_mapletechie_images replaces cover and social-share images on a draft post", async () => {
    const existing = {
      id: 53,
      title: "Draft replacement story",
      slug: "draft-replacement-story",
      authorId: 12,
      status: "draft",
      coverImage: "/api/storage/objects/old-cover",
      coverImageAlt: "Existing cover description",
      ogImage: "/api/storage/objects/old-og",
    };
    selectQueue = [[BOT_USER], [existing]];
    updateReturn = [{
      ...existing,
      coverImage: "/api/storage/objects/new-cover",
      ogImage: "/api/storage/objects/new-og",
    }];
    persistExternalImageMock
      .mockResolvedValueOnce("/api/storage/objects/new-cover")
      .mockResolvedValueOnce("/api/storage/objects/new-og");

    const res = await authed(callTool("backfill_mapletechie_images", {
      slug: "draft-replacement-story",
      cover_image: "https://images.example.com/new-cover.jpg",
      og_image: "https://images.example.com/new-og.jpg",
    }));

    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBeFalsy();
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload).toMatchObject({
      id: 53,
      status: "draft",
      updated_fields: ["coverImage", "ogImage"],
    });
    expect(captured.updateValues).toContainEqual({
      coverImage: "/api/storage/objects/new-cover",
      ogImage: "/api/storage/objects/new-og",
    });
  });

  it("backfill_mapletechie_images rejects unsupported fields instead of stripping them", async () => {
    const res = await authed(callTool("backfill_mapletechie_images", {
      post_id: 52,
      cover_image_alt: "A circuit board under inspection",
      status: "draft",
    }));

    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBe(true);
    expect(captured.updateValues).toHaveLength(0);
  });

  it("create_mapletechie_draft replays for a repeated idempotency key", async () => {
    selectQueue = [
      [BOT_USER],
      [{ id: 1, idempotencyKey: "story-9", postId: 42 }],
      [{ id: 42, status: "draft", slug: "test-story" }],
    ];
    const res = await authed(callTool("create_mapletechie_draft", { ...draftArgs(), idempotency_key: "story-9" }));
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload).toMatchObject({ id: 42, replayed: true });
    expect(captured.insertValues!.filter((v) => v.title).length).toBe(0);
  });
});

describe("published revision approval boundary", () => {
  const published = {
    id: 42, status: "published", slug: "permanent-url", title: "Original",
    excerpt: "Original excerpt", content: "<p>Original body</p>",
    publishedAt: new Date("2024-01-01T00:00:00Z"),
    contentModifiedAt: null, authorId: 3,
  };
  const admin = { id: 1, username: "admin", role: "admin" };

  it("rejects approval by an editor without publishing permission", async () => {
    selectQueue = [[published]];
    const response = await reviewRequest("approve", {
      id: 3, username: "editor", role: "editor", canPublishDirectly: false,
    });
    expect(response.status).toBe(403);
    expect(captured.updateValues).toHaveLength(0);
  });

  it("requires re-review when the live editorial version changed", async () => {
    selectQueue = [[{ ...published, content: "<p>Newer live edit</p>" }], [{
      id: 15, postId: 42, status: "pending", baseHash: editorialFingerprint(published as any),
      changes: { content: "<p>Proposed</p>" }, updateNote: null,
    }]];
    const response = await reviewRequest("approve", admin);
    expect(response.status).toBe(409);
    expect(captured.updateValues).toHaveLength(0);
  });

  it("applies an approved change without altering URL or original publication date", async () => {
    selectQueue = [[published], [{
      id: 15, postId: 42, status: "pending", baseHash: editorialFingerprint(published as any),
      changes: { content: "<p>Reviewed and improved</p>" }, updateNote: "Updated examples",
    }]];
    const response = await reviewRequest("approve", admin);
    expect(response.status).toBe(200);
    const postUpdate = captured.updateValues!.find((v) => "contentModifiedAt" in v)!;
    expect(postUpdate).toMatchObject({
      content: "<p>Reviewed and improved</p>", updateNote: "Updated examples",
      contentModifiedAt: expect.any(Date),
    });
    expect(postUpdate).not.toHaveProperty("publishedAt");
    expect(postUpdate).not.toHaveProperty("slug");
    expect(auditCalls).toHaveLength(0); // review audit is inserted in the same transaction
    expect(captured.insertValues).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "post.revision.approved" }),
    ]));
  });

  it("approves image-only and SEO-only corrections without claiming new editorial freshness", async () => {
    selectQueue = [[published], [{
      id: 15, postId: 42, status: "pending", baseHash: editorialFingerprint(published as any),
      changes: { coverImage: "/api/storage/objects/uploads/new-cover", coverImageAlt: "Canadian chip", seoTitle: "Better search title" },
      updateNote: "Image metadata repaired",
    }]];
    const response = await reviewRequest("approve", admin);
    expect(response.status).toBe(200);
    const update = captured.updateValues!.find((v) => "coverImage" in v)!;
    expect(update).toMatchObject({ coverImage: "/api/storage/objects/uploads/new-cover", coverImageAlt: "Canadian chip", seoTitle: "Better search title" });
    expect(update).not.toHaveProperty("contentModifiedAt");
    expect(update).not.toHaveProperty("updateNote");
    expect(update).not.toHaveProperty("publishedAt");
  });

  it("approves a scheduled correction without publishing or setting editorial freshness", async () => {
    const scheduled = { ...published, status: "scheduled", scheduledFor: new Date("2026-10-03T00:00:00Z") };
    selectQueue = [[scheduled], [{
      id: 15, postId: 42, status: "pending", baseHash: editorialFingerprint(scheduled as any),
      changes: { title: "Corrected before publication" }, updateNote: "Not a public update",
    }]];
    const response = await reviewRequest("approve", admin);
    expect(response.status).toBe(200);
    const update = captured.updateValues!.find((v) => "title" in v)!;
    expect(update).toEqual({ title: "Corrected before publication" });
    for (const key of ["status", "scheduledFor", "slug", "publishedAt", "authorId", "contentModifiedAt", "updateNote"]) {
      expect(update).not.toHaveProperty(key);
    }
  });
});

describe("aggregate review queue", () => {
  const post = {
    id: 42, status: "published", slug: "permanent-url", title: "Published story",
    excerpt: "Excerpt", content: "<p>Private body</p>", authorId: 3,
    publishedAt: new Date("2024-01-01T00:00:00Z"), scheduledFor: null as Date | null, contentModifiedAt: null,
  };
  const revision = (id: number, article = post, status = "pending", stale = false) => ({
    revision: {
      id, postId: article.id, status, source: "connector",
      changes: { title: "Better title", coverImage: "/covers/new.webp" },
      baseHash: stale ? "old" : editorialFingerprint(article as any),
      createdAt: new Date("2026-09-26T12:00:00Z"),
    },
    post: article,
  });
  const admin = { id: 1, role: "admin" };

  it("defaults to pending, excludes history, and returns compact review data and count", async () => {
    selectQueue = [[{ value: 1 }], [revision(15), revision(16, post, "approved"), revision(17, post, "rejected")]];
    const { status, body } = await queueRequest(admin);
    expect(status).toBe(200);
    expect(body).toMatchObject({ total: 1, pendingCount: 1, page: 1, pageSize: 20 });
    expect(body.items).toEqual([expect.objectContaining({
      id: 15, postId: 42, title: "Published story", postStatus: "published",
      source: "connector", fields: ["title", "coverImage"], stale: false,
    })]);
    expect(JSON.stringify(body)).not.toContain("Private body");
    expect(JSON.stringify(body)).not.toContain("Better title");
  });

  it("applies the same approval rule to rows and count before pagination, including stale proposals", async () => {
    const other = { ...post, id: 44, authorId: 9, title: "Colleague story" };
    const scheduled = { ...post, id: 45, status: "scheduled", scheduledFor: new Date("2026-10-01T00:00:00Z") };
    selectQueue = [[{ value: 2 }], [revision(16, post, "pending", true)]];
    const { body } = await queueRequest({ id: 3, role: "editor", canPublishDirectly: true }, "?status=pending&page=1&pageSize=1");
    expect(body).toMatchObject({ total: 2, pendingCount: 2, pageSize: 1 });
    expect(body.items).toEqual([expect.objectContaining({ id: 16, stale: true })]);
    selectQueue = [[{ value: 2 }], [revision(17, scheduled)]];
    const secondPage = await queueRequest({ id: 3, role: "editor", canPublishDirectly: true }, "?page=2&pageSize=1");
    expect(secondPage.body.items).toEqual([expect.objectContaining({ id: 17, postStatus: "scheduled" })]);
  });

  it("does not expose proposals to non-publishing editors, but honors edit-others reviewers", async () => {
    selectQueue = [];
    const proposer = await queueRequest({ id: 3, role: "editor", canPublishDirectly: false });
    expect(proposer.body).toMatchObject({ items: [], pendingCount: 0 });
    selectQueue = [[{ value: 1 }], [revision(15)]];
    const reviewer = await queueRequest({ id: 9, role: "editor", canPublishDirectly: true, canEditOthersPosts: true });
    expect(reviewer.body.pendingCount).toBe(1);
  });

  it("rejects invalid pagination or unsupported status", async () => {
    for (const query of ["?page=0", "?pageSize=51", "?status=approved"]) {
      expect((await queueRequest(admin, query)).status).toBe(400);
    }
  });
});
