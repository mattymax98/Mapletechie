import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";

// --- Mock @workspace/db -----------------------------------------------------

let selectQueue: unknown[][] = [];

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
};

vi.mock("@workspace/db", () => ({
  db,
  usersTable: { id: {}, username: {}, isActive: {} },
  postsTable: {},
  usernameRenamesTable: { oldUsername: {}, userId: {} },
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
  desc: () => ({}),
}));

const authorsRouter = (await import("./authors")).default;

function makeApp() {
  const app = express();
  app.use(authorsRouter);
  return app;
}

import { createServer } from "node:http";
async function get(app: express.Express, path: string) {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual" });
    const text = await resp.text();
    return { status: resp.status, location: resp.headers.get("location"), text };
  } finally {
    server.close();
  }
}

const LIVE_USER = {
  id: 7,
  username: "newname",
  displayName: "New Name",
  isActive: true,
  bio: null,
};

describe("GET /authors/by-username/:username rename redirects", () => {
  beforeEach(() => {
    selectQueue = [];
    vi.clearAllMocks();
  });

  it("returns the live author when the username exists", async () => {
    selectQueue = [[LIVE_USER]];
    const r = await get(makeApp(), "/authors/by-username/newname");
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text).username).toBe("newname");
  });

  it("301-redirects an old username to the current author page", async () => {
    // 1st select: no live user; 2nd select: rename-history join hit.
    selectQueue = [[], [{ username: "newname" }]];
    const r = await get(makeApp(), "/authors/by-username/oldname");
    expect(r.status).toBe(301);
    expect(r.location).toContain("/authors/by-username/newname");
  });

  it("404s when the username was never used", async () => {
    selectQueue = [[], []];
    const r = await get(makeApp(), "/authors/by-username/neverexisted");
    expect(r.status).toBe(404);
  });

  it("does not redirect-loop when history maps a username to itself", async () => {
    selectQueue = [[], [{ username: "same" }]];
    const r = await get(makeApp(), "/authors/by-username/same");
    expect(r.status).toBe(404);
  });
});
