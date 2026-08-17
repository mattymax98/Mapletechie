/**
 * Integration tests for the /api/* reverse-proxy in server.ts.
 *
 * Strategy: boot the real production server bundle against a lightweight mock
 * API and make actual HTTP requests through the proxy, asserting the correct
 * method, path, query string, headers, body, and status are forwarded in both
 * directions.  The mock API never hits the network.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const techBlogDir = path.resolve(__dirname, "..");
const serverBundle = path.join(techBlogDir, "dist", "server.mjs");
const SITE_URL = "https://proxy-test.mapletechie.example";

// ── helpers ─────────────────────────────────────────────────────────────────

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv: Server = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms: ${url}`);
}

// ── mock API setup ───────────────────────────────────────────────────────────

/**
 * A tiny upstream API server that records requests and returns canned
 * responses.  Kept lightweight intentionally — we only test proxy mechanics
 * here, not API business logic.
 */
interface MockApiInstance {
  port: number;
  close: () => Promise<void>;
  /** Returns all requests the mock has received since it started. */
  drainRequests: () => MockRequest[];
}

interface MockRequest {
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

function startMockApi(): Promise<MockApiInstance> {
  const api = express();
  api.use(express.json());
  const received: MockRequest[] = [];

  // Record every incoming request so tests can inspect forwarded metadata.
  api.use((req, _res, next) => {
    received.push({
      method: req.method,
      path: req.path,
      query: req.query as Record<string, string | string[]>,
      headers: req.headers as Record<string, string | string[] | undefined>,
      body: req.body,
    });
    next();
  });

  // --- canned routes ---
  // Simple GET
  api.get("/api/posts", (_req, res) => {
    res.json([{ id: 1, title: "Test post" }]);
  });

  // Echo query params
  api.get("/api/search", (req, res) => {
    res.json({ query: req.query.q });
  });

  // Echo the Authorization header
  api.get("/api/admin/me", (req, res) => {
    const auth = req.headers["authorization"] ?? null;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    res.json({ token: auth });
  });

  // Echo JSON body
  api.post("/api/posts", (req, res) => {
    res.status(201).json({ received: req.body });
  });

  // PUT with body
  api.put("/api/posts/1", (req, res) => {
    res.json({ updated: req.body });
  });

  // DELETE → 204
  api.delete("/api/posts/1", (_req, res) => {
    res.status(204).end();
  });

  // Simulate a 500 from upstream
  api.get("/api/broken", (_req, res) => {
    res.status(500).json({ error: "Internal server error" });
  });

  // Minimal endpoints the server.ts startup needs (maintenance check etc.)
  api.get("/api/settings/status", (_req, res) => {
    res.json({ maintenance: false, message: null, eta: null });
  });
  api.get("/api/posts/featured", (_req, res) => res.json([]));
  api.get("/api/categories", (_req, res) => res.json([]));

  return new Promise((resolve) => {
    const httpServer = api.listen(0, "127.0.0.1", () => {
      const port = (httpServer.address() as AddressInfo).port;
      resolve({
        port,
        drainRequests: () => received.splice(0),
        close: () => new Promise<void>((r) => httpServer.close(() => r())),
      });
    });
  });
}

// ── test lifecycle ───────────────────────────────────────────────────────────

let serverProc: ChildProcess | undefined;
let mockApi: MockApiInstance | undefined;
let baseUrl = "";

beforeAll(async () => {
  // Rebuild only the server bundle (fast) so it reflects latest server.ts.
  const indexHtml = path.join(techBlogDir, "dist", "public", "index.html");
  if (!existsSync(serverBundle) || !existsSync(indexHtml)) {
    execFileSync("pnpm", ["run", "build"], {
      cwd: techBlogDir,
      env: { ...process.env, PORT: "5000", BASE_PATH: "/" },
      stdio: "inherit",
    });
  } else {
    execFileSync("pnpm", ["run", "build:server"], {
      cwd: techBlogDir,
      env: { ...process.env, PORT: "5000", BASE_PATH: "/" },
      stdio: "inherit",
    });
  }

  mockApi = await startMockApi();

  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;

  serverProc = spawn("node", [serverBundle], {
    cwd: techBlogDir,
    env: {
      ...process.env,
      PORT: String(port),
      API_BASE: `http://127.0.0.1:${mockApi.port}`,
      SITE_URL,
      NODE_ENV: "production",
    },
    stdio: "inherit",
  });

  await waitForServer(`${baseUrl}/robots.txt`);
}, 120_000);

afterAll(async () => {
  if (serverProc && !serverProc.killed) serverProc.kill("SIGTERM");
  if (mockApi) await mockApi.close();
});

// ── proxy tests ──────────────────────────────────────────────────────────────

describe("API proxy (/api/*)", () => {
  it("forwards a GET request and relays the upstream JSON response", async () => {
    const res = await fetch(`${baseUrl}/api/posts`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ id: 1, title: "Test post" }]);
  });

  it("preserves query-string parameters end-to-end", async () => {
    const res = await fetch(`${baseUrl}/api/search?q=typescript`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe("typescript");
  });

  it("forwards the Authorization header to the upstream", async () => {
    const token = "Bearer test-token-abc";
    const res = await fetch(`${baseUrl}/api/admin/me`, {
      headers: { Authorization: token },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe(token);
  });

  it("returns 401 when Authorization is absent (upstream decides)", async () => {
    const res = await fetch(`${baseUrl}/api/admin/me`);
    expect(res.status).toBe(401);
  });

  it("forwards a POST request with a JSON body", async () => {
    const payload = { title: "New post", content: "Hello world" };
    const res = await fetch(`${baseUrl}/api/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.received).toEqual(payload);
  });

  it("forwards a PUT request with a JSON body", async () => {
    const payload = { title: "Updated post" };
    const res = await fetch(`${baseUrl}/api/posts/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toEqual(payload);
  });

  it("forwards a DELETE and relays a 204 No Content response", async () => {
    const res = await fetch(`${baseUrl}/api/posts/1`, { method: "DELETE" });
    expect(res.status).toBe(204);
    // No body expected — just confirm the status passes through.
  });

  it("relays non-2xx upstream status codes without swallowing them", async () => {
    const res = await fetch(`${baseUrl}/api/broken`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("does not forward the Host header (uses upstream hostname instead)", async () => {
    // Drain any previous requests so we start clean.
    mockApi!.drainRequests();
    await fetch(`${baseUrl}/api/posts`);
    const [req] = mockApi!.drainRequests();
    expect(req).toBeDefined();
    // The upstream should see its own host, not the blog service host.
    expect(req.headers["host"]).not.toContain("127.0.0.1:" + String(new URL(baseUrl).port));
  });

  it("returns 502 when the upstream connection is refused", async () => {
    // Point a fresh server instance at a port nobody is listening on.
    const deadPort = await getFreePort();
    // (nothing binds that port — it's immediately freed, then we reference it)

    const port = await getFreePort();
    const proc = spawn("node", [serverBundle], {
      cwd: techBlogDir,
      env: {
        ...process.env,
        PORT: String(port),
        API_BASE: `http://127.0.0.1:${deadPort}`,
        SITE_URL,
        NODE_ENV: "production",
      },
      stdio: "inherit",
    });

    try {
      await waitForServer(`http://127.0.0.1:${port}/robots.txt`);
      const res = await fetch(`http://127.0.0.1:${port}/api/posts`);
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toBeDefined();
    } finally {
      if (!proc.killed) proc.kill("SIGTERM");
    }
  }, 60_000);
});
