import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { createServer } from "node:http";

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

const insertedRows: unknown[] = [];

function makeInsert() {
  return {
    values: vi.fn((v: unknown) => {
      insertedRows.push(v);
      return Promise.resolve();
    }),
  };
}

const db = {
  insert: vi.fn(() => makeInsert()),
  select: vi.fn(() => ({
    from: vi.fn(() => ({ orderBy: vi.fn(async () => []) })),
  })),
  delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
};

vi.mock("@workspace/db", () => ({
  db,
  contactsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  desc: () => ({}),
}));

// ---------------------------------------------------------------------------
// @workspace/api-zod mock
// ---------------------------------------------------------------------------

vi.mock("@workspace/api-zod", () => ({
  SubmitContactBody: {
    safeParse: (body: unknown) => {
      const b = body as Record<string, unknown>;
      if (!b.name || !b.email || !b.subject || !b.message) {
        return { success: false, error: { message: "Missing required fields" } };
      }
      return { success: true, data: b };
    },
  },
}));

// ---------------------------------------------------------------------------
// email mock — captures every sendEmail call so tests can assert on it
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
let sendEmailImpl: (input: CapturedEmail) => Promise<void> = async (input) => {
  capturedEmails.push(input);
};

vi.mock("../lib/email", () => ({
  sendEmail: vi.fn((input: CapturedEmail) => sendEmailImpl(input)),
  escapeHtml: (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;"),
}));

// ---------------------------------------------------------------------------
// siteSettings mock
// ---------------------------------------------------------------------------

let notificationEmail: string | null = null;

vi.mock("../lib/siteSettings", () => ({
  getSiteSettings: vi.fn(async () => ({ notificationEmail })),
}));

// ---------------------------------------------------------------------------
// Middleware mocks (pass-through for contact limiter; admin bypass)
// ---------------------------------------------------------------------------

vi.mock("../middlewares/rateLimit", () => ({
  contactLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const contactRouter = (await import("./contact")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(contactRouter);
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

/** Drain the microtask queue so fire-and-forget email calls settle. */
const flushAsync = () => new Promise<void>((r) => setTimeout(r, 10));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const VALID_BODY = {
  name: "Jane Doe",
  email: "jane@example.com",
  subject: "Hello there",
  message: "This is a test message.\nSecond line.",
};

const DEFAULT_NOTIFY = "matthew@mapletechie.com";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /contact — happy path", () => {
  beforeEach(() => {
    insertedRows.length = 0;
    capturedEmails.length = 0;
    notificationEmail = null;
    db.insert.mockClear();
    db.insert.mockImplementation(() => makeInsert());
    sendEmailImpl = async (input) => {
      capturedEmails.push(input);
    };
  });

  it("returns 200 with a success message", async () => {
    const r = await post(makeApp(), "/contact", VALID_BODY);
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(true);
  });

  it("saves the submission to the database", async () => {
    await post(makeApp(), "/contact", VALID_BODY);
    await flushAsync();
    expect(db.insert).toHaveBeenCalledOnce();
    expect(insertedRows).toHaveLength(1);
  });

  it("sends a notification email after the response", async () => {
    await post(makeApp(), "/contact", VALID_BODY);
    await flushAsync();
    expect(capturedEmails).toHaveLength(1);
  });

  it("addresses the notification to the default address when none is configured", async () => {
    await post(makeApp(), "/contact", VALID_BODY);
    await flushAsync();
    expect(capturedEmails[0].to).toBe(DEFAULT_NOTIFY);
  });

  it("addresses the notification to the configured notification email when set", async () => {
    notificationEmail = "alerts@example.com";
    await post(makeApp(), "/contact", VALID_BODY);
    await flushAsync();
    expect(capturedEmails[0].to).toBe("alerts@example.com");
  });

  it("sets reply-to to the visitor's email address", async () => {
    await post(makeApp(), "/contact", VALID_BODY);
    await flushAsync();
    const email = capturedEmails[0];
    expect(email.replyTo).toBe(VALID_BODY.email);
  });

  it("uses the system noreply address as the from address", async () => {
    await post(makeApp(), "/contact", VALID_BODY);
    await flushAsync();
    const email = capturedEmails[0];
    expect(email.from).toMatch(/noreply@mapletechie\.com/);
  });

  it("prefixes the subject with [Contact]", async () => {
    await post(makeApp(), "/contact", VALID_BODY);
    await flushAsync();
    const email = capturedEmails[0];
    expect(email.subject).toBe(`[Contact] ${VALID_BODY.subject}`);
  });

  it("includes the visitor's name and email in the HTML body", async () => {
    await post(makeApp(), "/contact", VALID_BODY);
    await flushAsync();
    const html = capturedEmails[0].html;
    expect(html).toContain("Jane Doe");
    expect(html).toContain("jane@example.com");
  });

  it("includes the message in the HTML body", async () => {
    await post(makeApp(), "/contact", VALID_BODY);
    await flushAsync();
    const html = capturedEmails[0].html;
    expect(html).toContain("This is a test message.");
  });

  it("includes the subject in the HTML body", async () => {
    await post(makeApp(), "/contact", VALID_BODY);
    await flushAsync();
    const html = capturedEmails[0].html;
    expect(html).toContain("Hello there");
  });

  it("includes a plain-text alternative with name, email, subject, and message", async () => {
    await post(makeApp(), "/contact", VALID_BODY);
    await flushAsync();
    const text = capturedEmails[0].text ?? "";
    expect(text).toContain("Jane Doe");
    expect(text).toContain("jane@example.com");
    expect(text).toContain("Hello there");
    expect(text).toContain("This is a test message.");
  });

  it("HTML-escapes special characters in submitted fields", async () => {
    const xssBody = {
      name: "<script>alert(1)</script>",
      email: "x@example.com",
      subject: "Test & \"escape\"",
      message: "safe message",
    };
    await post(makeApp(), "/contact", xssBody);
    await flushAsync();
    const html = capturedEmails[0].html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("POST /contact — no RESEND_API_KEY (email disabled)", () => {
  beforeEach(() => {
    insertedRows.length = 0;
    capturedEmails.length = 0;
    notificationEmail = null;
    db.insert.mockClear();
    db.insert.mockImplementation(() => makeInsert());
    // Simulate the real sendEmail behaviour when there is no API key:
    // it logs a warning and returns without throwing.
    sendEmailImpl = async () => {
      /* no-op: key absent */
    };
  });

  it("still returns 200 when sendEmail is a no-op", async () => {
    const r = await post(makeApp(), "/contact", VALID_BODY);
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(true);
  });

  it("still saves the submission to the database", async () => {
    await post(makeApp(), "/contact", VALID_BODY);
    await flushAsync();
    expect(db.insert).toHaveBeenCalledOnce();
    expect(insertedRows).toHaveLength(1);
  });
});

describe("POST /contact — email send failure", () => {
  beforeEach(() => {
    insertedRows.length = 0;
    capturedEmails.length = 0;
    notificationEmail = null;
    db.insert.mockImplementation(() => makeInsert());
    // Simulate a transient Resend API error.
    sendEmailImpl = async () => {
      throw new Error("Resend 500: Internal Server Error");
    };
  });

  it("still returns 200 even when sendEmail throws", async () => {
    const r = await post(makeApp(), "/contact", VALID_BODY);
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(true);
  });

  it("still saves the submission to the database despite the email error", async () => {
    await post(makeApp(), "/contact", VALID_BODY);
    await flushAsync();
    expect(insertedRows).toHaveLength(1);
  });
});

describe("POST /contact — validation", () => {
  beforeEach(() => {
    insertedRows.length = 0;
    capturedEmails.length = 0;
    db.insert.mockClear();
    db.insert.mockImplementation(() => makeInsert());
  });

  it("returns 400 when required fields are missing", async () => {
    const r = await post(makeApp(), "/contact", { name: "Jane" });
    expect(r.status).toBe(400);
    expect(r.json.success).toBe(false);
  });

  it("does not insert or send email on a bad payload", async () => {
    await post(makeApp(), "/contact", { name: "Jane" });
    await flushAsync();
    expect(db.insert).not.toHaveBeenCalled();
    expect(capturedEmails).toHaveLength(0);
  });
});
