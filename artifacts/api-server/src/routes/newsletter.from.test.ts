/**
 * Newsletter from-address tests
 *
 * Verifies that /admin/newsletter/test and /admin/newsletter/send-now
 * pick the correct `from` and `reply_to` headers based on site_settings:
 *
 *   (1) both newsletterFromName + newsletterFromAddress set → composed "Name <addr>" string
 *   (2) either field missing                               → undefined (sendEmail falls back to NEWSLETTER_FROM env)
 *   (3) newsletterReplyTo set                             → propagated to reply_to field
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { createServer } from "node:http";

// ---------------------------------------------------------------------------
// DB mock — minimal shape needed by the newsletter routes
// ---------------------------------------------------------------------------

const mockSubscribers: Array<{ id: number; email: string; status: string; unsubToken: string }> = [];

const db = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

// select().from(...).where(...) → active subscribers
// select().from(...).innerJoin(...).where(...) → posts (empty for these tests)
function makeSelect(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const terminal = vi.fn(async () => rows);
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.where = terminal;
  chain.orderBy = vi.fn(async () => rows);
  return chain;
}

// update().set().where() → update lastSentAt
const updateChain = {
  set: vi.fn(() => updateChain),
  where: vi.fn(async () => undefined),
};

vi.mock("@workspace/db", () => ({
  db,
  subscribersTable: { status: "status" },
  postsTable: {},
  categoriesTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  desc: () => ({}),
  and: () => ({}),
  gte: () => ({}),
  inArray: () => ({}),
  getTableColumns: () => ({}),
}));

// ---------------------------------------------------------------------------
// email mock — captures every sendEmail call
// ---------------------------------------------------------------------------

export interface CapturedEmail {
  to: string | string[];
  from?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
}

const capturedEmails: CapturedEmail[] = [];

vi.mock("../lib/email", () => ({
  NEWSLETTER_FROM: "Mapletechie <newsletter@mapletechie.com>",
  SITE_URL: "https://mapletechie.com",
  sendEmail: vi.fn(async (input: CapturedEmail) => {
    capturedEmails.push(input);
  }),
}));

// ---------------------------------------------------------------------------
// newsletterTemplates mock
// ---------------------------------------------------------------------------

vi.mock("../lib/newsletterTemplates", () => ({
  confirmEmailHtml: () => "<p>confirm</p>",
  welcomeEmailHtml: () => "<p>welcome</p>",
  digestEmailHtml: () => "<p>digest</p>",
}));

// ---------------------------------------------------------------------------
// siteSettings mock — controlled per test
// ---------------------------------------------------------------------------

interface MockSettings {
  newsletterFromName: string | null;
  newsletterFromAddress: string | null;
  newsletterReplyTo: string | null;
}

let mockSettings: MockSettings = {
  newsletterFromName: null,
  newsletterFromAddress: null,
  newsletterReplyTo: null,
};

vi.mock("../lib/siteSettings", () => ({
  getSiteSettings: vi.fn(async () => mockSettings),
}));

// ---------------------------------------------------------------------------
// Middleware mocks (pass-through)
// ---------------------------------------------------------------------------

vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../middlewares/rateLimit", () => ({
  newsletterLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ---------------------------------------------------------------------------
// Other dependencies
// ---------------------------------------------------------------------------

vi.mock("../lib/audit", () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

vi.mock("../lib/editorWeeklyDigest", () => ({
  runEditorWeeklyDigestNow: vi.fn(async () => undefined),
}));

vi.mock("../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const newsletterRouter = (await import("./newsletter")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(newsletterRouter);
  return app;
}

async function post(app: express.Express, path: string, body: unknown) {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await resp.json().catch(() => null)) as Record<string, unknown>;
    return { status: resp.status, json };
  } finally {
    server.close();
  }
}

// ---------------------------------------------------------------------------
// Shared beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedEmails.length = 0;
  mockSettings = { newsletterFromName: null, newsletterFromAddress: null, newsletterReplyTo: null };

  // Default: no posts (postIds=[])
  db.select.mockImplementation(() => makeSelect([]));
  db.update.mockReturnValue(updateChain);
  updateChain.set.mockReturnValue(updateChain);
  updateChain.where.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// /admin/newsletter/test
// ---------------------------------------------------------------------------

describe("POST /admin/newsletter/test — from address", () => {
  const VALID_BODY = {
    to: "editor@example.com",
    subject: "Weekly digest",
    editorNote: "Hello readers",
  };

  it("uses composed from string when both name and address are set", async () => {
    mockSettings.newsletterFromName = "Mapletechie Weekly";
    mockSettings.newsletterFromAddress = "weekly@mapletechie.com";

    const r = await post(makeApp(), "/admin/newsletter/test", VALID_BODY);

    expect(r.status).toBe(200);
    expect(r.json.success).toBe(true);
    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].from).toBe("Mapletechie Weekly <weekly@mapletechie.com>");
  });

  it("leaves from undefined (env fallback) when name is missing", async () => {
    mockSettings.newsletterFromName = null;
    mockSettings.newsletterFromAddress = "weekly@mapletechie.com";

    await post(makeApp(), "/admin/newsletter/test", VALID_BODY);

    expect(capturedEmails).toHaveLength(1);
    // Route passes undefined; sendEmail then falls back to NEWSLETTER_FROM env constant.
    expect(capturedEmails[0].from).toBeUndefined();
  });

  it("leaves from undefined (env fallback) when address is missing", async () => {
    mockSettings.newsletterFromName = "Mapletechie Weekly";
    mockSettings.newsletterFromAddress = null;

    await post(makeApp(), "/admin/newsletter/test", VALID_BODY);

    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].from).toBeUndefined();
  });

  it("leaves from undefined (env fallback) when both name and address are missing", async () => {
    mockSettings.newsletterFromName = null;
    mockSettings.newsletterFromAddress = null;

    await post(makeApp(), "/admin/newsletter/test", VALID_BODY);

    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].from).toBeUndefined();
  });

  it("propagates replyTo when newsletterReplyTo is set", async () => {
    mockSettings.newsletterFromName = "Mapletechie Weekly";
    mockSettings.newsletterFromAddress = "weekly@mapletechie.com";
    mockSettings.newsletterReplyTo = "reply@mapletechie.com";

    await post(makeApp(), "/admin/newsletter/test", VALID_BODY);

    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].replyTo).toBe("reply@mapletechie.com");
  });

  it("leaves replyTo undefined when newsletterReplyTo is not set", async () => {
    mockSettings.newsletterReplyTo = null;

    await post(makeApp(), "/admin/newsletter/test", VALID_BODY);

    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].replyTo).toBeUndefined();
  });

  it("prefixes the subject with [TEST]", async () => {
    await post(makeApp(), "/admin/newsletter/test", VALID_BODY);

    expect(capturedEmails[0].subject).toBe("[TEST] Weekly digest");
  });
});

// ---------------------------------------------------------------------------
// /admin/newsletter/send-now
// ---------------------------------------------------------------------------

describe("POST /admin/newsletter/send-now — from address", () => {
  const VALID_BODY = {
    subject: "Weekly digest",
    editorNote: "Hello subscribers",
  };

  // Provide one active subscriber so the send path is exercised.
  const SUBSCRIBER = { id: 1, email: "sub@example.com", status: "active", unsubToken: "tok123" };

  beforeEach(() => {
    // The route calls db.select() twice: once for subscribers, once implicitly
    // via fetchPostsByIds (which early-returns on empty ids).
    // We just need the subscriber select to return our subscriber.
    db.select.mockImplementation(() => makeSelect([SUBSCRIBER]));
  });

  it("uses composed from string when both name and address are set", async () => {
    mockSettings.newsletterFromName = "Mapletechie Weekly";
    mockSettings.newsletterFromAddress = "weekly@mapletechie.com";

    const r = await post(makeApp(), "/admin/newsletter/send-now", VALID_BODY);

    expect(r.status).toBe(200);
    expect(r.json.success).toBe(true);
    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].from).toBe("Mapletechie Weekly <weekly@mapletechie.com>");
  });

  it("leaves from undefined (env fallback) when name is missing", async () => {
    mockSettings.newsletterFromName = null;
    mockSettings.newsletterFromAddress = "weekly@mapletechie.com";

    await post(makeApp(), "/admin/newsletter/send-now", VALID_BODY);

    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].from).toBeUndefined();
  });

  it("leaves from undefined (env fallback) when address is missing", async () => {
    mockSettings.newsletterFromName = "Mapletechie Weekly";
    mockSettings.newsletterFromAddress = null;

    await post(makeApp(), "/admin/newsletter/send-now", VALID_BODY);

    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].from).toBeUndefined();
  });

  it("leaves from undefined (env fallback) when both name and address are missing", async () => {
    mockSettings.newsletterFromName = null;
    mockSettings.newsletterFromAddress = null;

    await post(makeApp(), "/admin/newsletter/send-now", VALID_BODY);

    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].from).toBeUndefined();
  });

  it("propagates replyTo when newsletterReplyTo is set", async () => {
    mockSettings.newsletterFromName = "Mapletechie Weekly";
    mockSettings.newsletterFromAddress = "weekly@mapletechie.com";
    mockSettings.newsletterReplyTo = "reply@mapletechie.com";

    await post(makeApp(), "/admin/newsletter/send-now", VALID_BODY);

    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].replyTo).toBe("reply@mapletechie.com");
  });

  it("leaves replyTo undefined when newsletterReplyTo is not set", async () => {
    mockSettings.newsletterReplyTo = null;

    await post(makeApp(), "/admin/newsletter/send-now", VALID_BODY);

    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].replyTo).toBeUndefined();
  });

  it("sends to the subscriber's email address", async () => {
    await post(makeApp(), "/admin/newsletter/send-now", VALID_BODY);

    expect(capturedEmails).toHaveLength(1);
    expect(capturedEmails[0].to).toBe("sub@example.com");
  });

  it("returns sent=1 for one active subscriber", async () => {
    const r = await post(makeApp(), "/admin/newsletter/send-now", VALID_BODY);

    expect(r.json.sent).toBe(1);
    expect(r.json.failed).toBe(0);
  });
});
