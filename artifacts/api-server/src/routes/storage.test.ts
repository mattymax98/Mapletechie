import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { createServer } from "node:http";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const ADMIN_USER = { id: 1, role: "admin", username: "matthew" };
let authUser: Record<string, unknown> | null = ADMIN_USER;

vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.user = authUser as unknown as express.Request["user"];
    next();
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock objectAcl so downloadObject doesn't try real auth
vi.mock("../lib/objectAcl", () => ({
  getObjectAclPolicy: vi.fn(async () => ({ visibility: "public" })),
  setObjectAclPolicy: vi.fn(async () => undefined),
  canAccessObject: vi.fn(async () => true),
  ObjectAclPolicy: {},
  ObjectPermission: { READ: "READ", WRITE: "WRITE" },
}));

// ─── ObjectStorageService mock ───────────────────────────────────────────────

const mockPutObjectEntity = vi.fn<[Buffer, string], Promise<string>>();
const mockGetObjectEntityUploadURL = vi.fn<[], Promise<string>>();
const mockGetObjectEntityFile = vi.fn();
const mockNormalizeObjectEntityPath = vi.fn((p: string) => p);
const mockDownloadObject = vi.fn();
const mockSearchPublicObject = vi.fn();

vi.mock("../lib/objectStorage", () => {
  class MockObjectStorageService {
    putObjectEntity = mockPutObjectEntity;
    getObjectEntityUploadURL = mockGetObjectEntityUploadURL;
    getObjectEntityFile = mockGetObjectEntityFile;
    normalizeObjectEntityPath = mockNormalizeObjectEntityPath;
    downloadObject = mockDownloadObject;
    searchPublicObject = mockSearchPublicObject;
  }
  class ObjectNotFoundError extends Error {
    constructor() {
      super("Object not found");
      this.name = "ObjectNotFoundError";
    }
  }
  return { ObjectStorageService: MockObjectStorageService, ObjectNotFoundError };
});

vi.mock("@workspace/api-zod", () => ({
  RequestUploadUrlBody: {
    safeParse: (body: unknown) => {
      const b = body as Record<string, unknown>;
      if (b?.name && b?.size && b?.contentType) {
        return { success: true, data: b };
      }
      return { success: false };
    },
  },
  RequestUploadUrlResponse: {
    parse: (v: unknown) => v,
  },
}));

// ─── App factory ─────────────────────────────────────────────────────────────

const storageRouter = (await import("./storage")).default;

function makeApp() {
  const app = express();
  // pino-http accesses req.log — stub it
  app.use((req, _res, next) => {
    (req as any).log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    next();
  });
  app.use(express.json());
  app.use(storageRouter);
  return app;
}

async function request(
  method: "get" | "post",
  path: string,
  opts: {
    body?: Buffer | Record<string, unknown>;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  const app = makeApp();
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const isBuffer = Buffer.isBuffer(opts.body);
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: method.toUpperCase(),
      headers: {
        ...(isBuffer ? {} : { "Content-Type": "application/json" }),
        ...opts.headers,
      },
      body: isBuffer
        ? opts.body
        : opts.body
          ? JSON.stringify(opts.body)
          : undefined,
    });
    const text = await res.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = text; }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { status: res.status, body, headers };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  authUser = ADMIN_USER;
  vi.clearAllMocks();
});

// ── POST /storage/uploads (server-side proxy upload) ─────────────────────────

describe("POST /storage/uploads", () => {
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );

  it("returns 401 when no session token", async () => {
    authUser = null;
    const res = await request("post", "/storage/uploads", {
      body: PNG,
      headers: { "Content-Type": "image/png" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for unsupported content type", async () => {
    const res = await request("post", "/storage/uploads", {
      body: Buffer.from("not an image"),
      headers: { "Content-Type": "text/plain" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported content type/i);
  });

  it("returns 400 for empty body", async () => {
    const res = await request("post", "/storage/uploads", {
      body: Buffer.alloc(0),
      headers: { "Content-Type": "image/png" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty/i);
  });

  it("uploads successfully and returns url + objectPath", async () => {
    mockPutObjectEntity.mockResolvedValue("/objects/uploads/test-uuid");

    const res = await request("post", "/storage/uploads", {
      body: PNG,
      headers: { "Content-Type": "image/png" },
    });

    expect(res.status).toBe(200);
    expect(res.body.objectPath).toBe("/objects/uploads/test-uuid");
    expect(res.body.url).toBe("/api/storage/objects/uploads/test-uuid");
    expect(mockPutObjectEntity).toHaveBeenCalledWith(
      expect.any(Buffer),
      "image/png",
    );
  });

  it("returns 500 when storage write fails", async () => {
    mockPutObjectEntity.mockRejectedValue(new Error("R2 write error"));

    const res = await request("post", "/storage/uploads", {
      body: PNG,
      headers: { "Content-Type": "image/png" },
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/upload failed/i);
  });

  it.each(["image/jpeg", "image/png", "image/webp", "image/gif"] as const)(
    "accepts content-type %s",
    async (ct) => {
      mockPutObjectEntity.mockResolvedValue("/objects/uploads/uuid");
      const res = await request("post", "/storage/uploads", {
        body: PNG,
        headers: { "Content-Type": ct },
      });
      expect(res.status).toBe(200);
    },
  );
});

// ── POST /storage/uploads/request-url ────────────────────────────────────────

describe("POST /storage/uploads/request-url", () => {
  it("returns 401 when unauthenticated", async () => {
    authUser = null;
    const res = await request("post", "/storage/uploads/request-url", {
      body: { name: "test.png", size: 1024, contentType: "image/png" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing fields", async () => {
    const res = await request("post", "/storage/uploads/request-url", {
      body: { name: "test.png" }, // missing size and contentType
    });
    expect(res.status).toBe(400);
  });

  it("returns presigned URL and objectPath on success", async () => {
    mockGetObjectEntityUploadURL.mockResolvedValue(
      "https://r2.example.com/bucket/key?sig=abc",
    );
    mockNormalizeObjectEntityPath.mockReturnValue("/objects/uploads/uuid");

    const res = await request("post", "/storage/uploads/request-url", {
      body: { name: "photo.jpg", size: 5000, contentType: "image/jpeg" },
    });

    expect(res.status).toBe(200);
    expect(res.body.uploadURL).toBe("https://r2.example.com/bucket/key?sig=abc");
    expect(res.body.objectPath).toBe("/objects/uploads/uuid");
  });
});
