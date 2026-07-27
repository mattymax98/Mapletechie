import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";

// --- Mocks (same conventions as automation.test.ts) ----------------------

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
  categoriesTable: { id: {}, name: {}, slug: {} },
  postCategoriesTable: {},
  automationRequestsTable: {},
  auditLogsTable: {},
  pageViewsTable: {},
  commentsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  asc: () => ({}),
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

const KEY = "test-mcp-connector-key-1234567890";
const BOT_USER = { id: 77, username: "mapletechie-ai", displayName: "Mapletechie AI", avatarUrl: null };
const CATEGORY = { id: 10, name: "News", slug: "news" };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(mcpRouter);
  return app;
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
  insertReturn = [];
  captured.insertValues = [];
  auditCalls.length = 0;
  vi.clearAllMocks();
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
    expect(names).toContain("list_mapletechie_categories");
    expect(names).toContain("create_mapletechie_draft");
  });

  it("list_mapletechie_categories returns the category list", async () => {
    selectQueue = [[CATEGORY, { id: 11, name: "Reviews", slug: "reviews" }]];
    const res = await authed(callTool("list_mapletechie_categories", {}));
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({ id: 10, name: "News" });
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

  it("upload_mapletechie_image stores the image and returns a local URL", async () => {
    const b64 = Buffer.from("fake-image-bytes").toString("base64");
    const res = await authed(callTool("upload_mapletechie_image", { image_base64: b64, filename: "cover.png" }));
    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBeFalsy();
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.url).toBe("/api/storage/objects/uploads/mock-upload");
    expect(auditCalls.some((c) => c.input.action === "mcp.image.uploaded")).toBe(true);
  });

  it("upload_mapletechie_image accepts a data: URI prefix", async () => {
    const b64 = `data:image/png;base64,${Buffer.from("fake-image-bytes").toString("base64")}`;
    const res = await authed(callTool("upload_mapletechie_image", { image_base64: b64 }));
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.url).toBe("/api/storage/objects/uploads/mock-upload");
  });

  it("upload_mapletechie_image rejects invalid base64 with a tool-level error", async () => {
    const res = await authed(callTool("upload_mapletechie_image", { image_base64: "not valid base64 !!!" }));
    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBe(true);
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.error).toBeTruthy();
    expect(auditCalls.some((c) => c.input.action === "mcp.image.uploaded")).toBe(false);
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
