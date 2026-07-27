import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";

// --- Mocks for everything admin.ts pulls in at import time -----------------

const captured: { updateSet?: Record<string, unknown>; insertValues?: Record<string, unknown> } = {};

let selectQueue: unknown[][] = [];
let updateReturn: unknown[] = [];
let insertReturn: unknown[] = [];

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
  update: vi.fn(() => ({
    set: vi.fn((v: Record<string, unknown>) => {
      captured.updateSet = v;
      return {
        where: vi.fn(() => ({ returning: vi.fn(async () => updateReturn) })),
      };
    }),
  })),
  insert: vi.fn(() => ({
    values: vi.fn((v: Record<string, unknown>) => {
      captured.insertValues = v;
      return {
        returning: vi.fn(async () => insertReturn),
        onConflictDoUpdate: vi.fn(async () => undefined),
      };
    }),
  })),
  delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db)),
};

vi.mock("@workspace/db", () => ({
  db,
  usersTable: {},
  postsTable: {},
  usernameRenamesTable: { oldUsername: {} },
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
  count: () => ({}),
}));

vi.mock("../lib/auth", () => ({
  hashPassword: vi.fn(async (p: string) => `hashed:${p}`),
  verifyPassword: vi.fn(async () => true),
  createSession: vi.fn(async () => "tok"),
  deleteSession: vi.fn(async () => undefined),
  sanitizeUser: (u: Record<string, unknown>) => {
    const { passwordHash: _ph, ...rest } = u;
    return rest;
  },
}));

const ADMIN_USER = { id: 1, role: "admin", username: "matthew", displayName: "Matthew" };
let currentUser: Record<string, unknown> = { ...ADMIN_USER };
vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = currentUser as unknown as express.Request["user"];
    next();
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../middlewares/rateLimit", () => ({
  loginLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/audit", () => ({
  writeAuditLog: vi.fn(async () => undefined),
  writeAuditLogForUser: vi.fn(async () => undefined),
}));

vi.mock("../lib/richProfile", () => ({
  sanitizeRichProfile: () => ({}),
  RichProfileError: class RichProfileError extends Error {},
}));

const adminRouter = (await import("./admin")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(adminRouter);
  return app;
}

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

const TARGET_EDITOR = {
  id: 5,
  username: "janedoe",
  email: "janedoe@mapletechie.com",
  displayName: "Jane Doe",
  role: "editor",
  passwordHash: "x",
};

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { ...ADMIN_USER };
  selectQueue = [];
  updateReturn = [];
  insertReturn = [];
  captured.updateSet = undefined;
  captured.insertValues = undefined;
});

describe("POST /admin/users — email derivation on creation", () => {
  it("derives the email from the cleaned username", async () => {
    selectQueue = [[]]; // uniqueness check — no conflict
    insertReturn = [{ id: 9, username: "newed", email: "newed@mapletechie.com", passwordHash: "x" }];

    const { status } = await request(makeApp(), "POST", "/admin/users", {
      username: "  NewEd! ",
      password: "secret123",
      displayName: "New Ed",
      email: "attacker@evil.com", // must be ignored
    });

    expect(status).toBe(201);
    expect(captured.insertValues?.username).toBe("newed");
    expect(captured.insertValues?.email).toBe("newed@mapletechie.com");
  });
});

describe("PUT /admin/users/:id — super-admin username rename", () => {
  it("lets the founding admin rename an editor and re-derives the email in the same update", async () => {
    // target lookup, then uniqueness check for the new username
    selectQueue = [[TARGET_EDITOR], []];
    updateReturn = [{ ...TARGET_EDITOR, username: "janesmith", email: "janesmith@mapletechie.com" }];

    const { status, json } = await request(makeApp(), "PUT", "/admin/users/5", {
      username: "JaneSmith",
    });

    expect(status).toBe(200);
    expect(captured.updateSet?.username).toBe("janesmith");
    expect(captured.updateSet?.email).toBe("janesmith@mapletechie.com");
    expect(json.email).toBe("janesmith@mapletechie.com");
  });

  it("rejects a rename from a non-admin editor (even with editor-management permission)", async () => {
    currentUser = { id: 2, role: "editor", username: "manager", canManageEditors: true };
    selectQueue = [[TARGET_EDITOR]];

    const { status, json } = await request(makeApp(), "PUT", "/admin/users/5", {
      username: "hijacked",
    });

    expect(status).toBe(403);
    expect(json.error).toMatch(/founding admin/i);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("ignores an unchanged username sent by a non-admin (no 403, no rename)", async () => {
    currentUser = { id: 2, role: "editor", username: "manager", canManageEditors: true };
    selectQueue = [[TARGET_EDITOR]];
    updateReturn = [{ ...TARGET_EDITOR, displayName: "Jane D." }];

    const { status } = await request(makeApp(), "PUT", "/admin/users/5", {
      username: "janedoe",
      displayName: "Jane D.",
    });

    expect(status).toBe(200);
    expect(captured.updateSet).not.toHaveProperty("username");
    expect(captured.updateSet).not.toHaveProperty("email");
  });

  it("rejects renaming to a taken username", async () => {
    selectQueue = [[TARGET_EDITOR], [{ id: 8, username: "taken" }]];

    const { status } = await request(makeApp(), "PUT", "/admin/users/5", { username: "taken" });

    expect(status).toBe(409);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a username that cleans to fewer than 2 characters", async () => {
    selectQueue = [[TARGET_EDITOR]];

    const { status } = await request(makeApp(), "PUT", "/admin/users/5", { username: "!@#" });

    expect(status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects direct email edits for everyone, including the admin", async () => {
    selectQueue = [[TARGET_EDITOR]];

    const { status, json } = await request(makeApp(), "PUT", "/admin/users/5", {
      email: "jane@gmail.com",
    });

    expect(status).toBe(400);
    expect(json.error).toMatch(/cannot be edited directly/i);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("PUT /admin/me can never change username or email, even if sent", async () => {
    updateReturn = [{ ...ADMIN_USER, passwordHash: "x", displayName: "Matt" }];

    const { status } = await request(makeApp(), "PUT", "/admin/me", {
      username: "hacker",
      email: "hacker@evil.com",
      displayName: "Matt",
    });

    expect(status).toBe(200);
    expect(captured.updateSet).toBeDefined();
    expect(captured.updateSet).not.toHaveProperty("username");
    expect(captured.updateSet).not.toHaveProperty("email");
    expect(captured.updateSet?.displayName).toBe("Matt");
  });

  it("tolerates the client echoing back the current derived email", async () => {
    selectQueue = [[TARGET_EDITOR]];
    updateReturn = [{ ...TARGET_EDITOR, displayName: "Jane!" }];

    const { status } = await request(makeApp(), "PUT", "/admin/users/5", {
      email: "janedoe@mapletechie.com",
      displayName: "Jane!",
    });

    expect(status).toBe(200);
    expect(captured.updateSet).not.toHaveProperty("email");
  });
});
