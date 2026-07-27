import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock @workspace/db with a minimal chainable fake -----------------------

let selectQueue: unknown[][] = [];
const updates: { set: Record<string, unknown>; }[] = [];
let insertValues: Record<string, unknown> | undefined;

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
      updates.push({ set: v });
      return { where: vi.fn(async () => undefined) };
    }),
  })),
  insert: vi.fn(() => ({
    values: vi.fn((v: Record<string, unknown>) => {
      insertValues = v;
      return { returning: vi.fn(async () => [{ id: 1, ...v }]) };
    }),
  })),
  delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
};

vi.mock("@workspace/db", () => ({
  db,
  usersTable: {},
  sessionsTable: {},
  postsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (_a: unknown, b: unknown) => ({ eq: b }),
  and: () => ({}),
  gt: () => ({}),
  isNull: () => ({}),
}));

const { bootstrapAdmin } = await import("./auth");

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  updates.length = 0;
  insertValues = undefined;
});

describe("bootstrapAdmin — startup email self-healing (syncDerivedEmails)", () => {
  it("corrects a stale editor email to username@mapletechie.com", async () => {
    const stale = { id: 5, username: "janedoe", email: "jane@gmail.com" };
    selectQueue = [
      [stale], // existence check (limit 1)
      [stale], // full user scan in syncDerivedEmails
    ];

    await bootstrapAdmin();

    expect(updates).toHaveLength(1);
    expect(updates[0].set).toEqual({ email: "janedoe@mapletechie.com" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("leaves already-matching emails untouched", async () => {
    const ok = { id: 1, username: "matthew", email: "matthew@mapletechie.com" };
    selectQueue = [[ok], [ok]];

    await bootstrapAdmin();

    expect(updates).toHaveLength(0);
  });

  it("skips users with a null email (the automation draft bot must never gain one)", async () => {
    const bot = { id: 7, username: "draft-bot", email: null };
    selectQueue = [[bot], [bot]];

    await bootstrapAdmin();

    expect(updates).toHaveLength(0);
  });

  it("skips users with an empty-string email", async () => {
    const bot = { id: 7, username: "draft-bot", email: "" };
    selectQueue = [[bot], [bot]];

    await bootstrapAdmin();

    expect(updates).toHaveLength(0);
  });

  it("fixes stale rows while leaving null-email and matching rows alone in one pass", async () => {
    const users = [
      { id: 1, username: "matthew", email: "matthew@mapletechie.com" },
      { id: 5, username: "janedoe", email: "old@personal.net" },
      { id: 7, username: "draft-bot", email: null },
    ];
    selectQueue = [[users[0]], users];

    await bootstrapAdmin();

    expect(updates).toHaveLength(1);
    expect(updates[0].set).toEqual({ email: "janedoe@mapletechie.com" });
  });
});
