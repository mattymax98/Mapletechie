import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";

const state = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  transactionQueue: [] as unknown[][],
  selectedPost: null as Record<string, unknown> | null,
  insertAttempts: [] as Record<string, unknown>[],
  committedAudit: [] as Record<string, unknown>[],
  committedRevision: null as Record<string, unknown> | null,
  updateValues: [] as Record<string, unknown>[],
  revisionResult: null as Record<string, unknown> | null,
  failAudit: false,
}));

function selectChain(queue: unknown[][]) {
  const chain: unknown = new Proxy(function () {}, {
    get(_target, property) {
      if (property === "then") {
        return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
          const result = queue.shift() ?? [];
          if (Array.isArray(result) && result[0] && typeof result[0] === "object" && "slug" in result[0]) {
            state.selectedPost = result[0] as Record<string, unknown>;
          }
          return Promise.resolve(result).then(resolve, reject);
        };
      }
      return () => chain;
    },
    apply() {
      return chain;
    },
  });
  return chain;
}

const db = {
  select: vi.fn(() => selectChain(state.selectQueue)),
  transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
    const pendingAudit: Record<string, unknown>[] = [];
    let pendingRevision: Record<string, unknown> | null = null;
    const tx = {
      execute: vi.fn(async () => undefined),
      select: vi.fn(() => selectChain(state.transactionQueue)),
      insert: vi.fn(() => ({
        values: vi.fn((values: Record<string, unknown>) => {
          state.insertAttempts.push(values);
          if (typeof values.action === "string") {
            if (state.failAudit) throw new Error("audit insert failed");
            pendingAudit.push(values);
          } else {
            pendingRevision = values;
          }
          return {
            returning: vi.fn(async () => state.revisionResult ? [state.revisionResult] : []),
            then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
              Promise.resolve(undefined).then(resolve, reject),
          };
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          state.updateValues.push(values);
          return {
            where: vi.fn(() => ({
              returning: vi.fn(async () => "reviewedAt" in values
                ? (state.revisionResult ? [state.revisionResult] : [values])
                : (state.selectedPost ? [{ ...state.selectedPost, ...values }] : [])),
              then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
                Promise.resolve(undefined).then(resolve, reject),
            })),
          };
        }),
      })),
    };
    const result = await callback(tx);
    state.committedAudit.push(...pendingAudit);
    if (pendingRevision) state.committedRevision = pendingRevision;
    return result;
  }),
};

vi.mock("@workspace/db", () => ({
  db,
  postsTable: { id: {}, status: {}, authorId: {}, title: {} },
  postRevisionsTable: { id: {}, postId: {}, status: {}, createdAt: {} },
  auditLogsTable: { action: {}, details: {}, entityId: {}, createdAt: {}, id: {}, summary: {} },
}));
vi.mock("drizzle-orm", () => ({
  and: () => ({}),
  asc: () => ({}),
  count: () => ({}),
  desc: () => ({}),
  eq: () => ({}),
  ilike: () => ({}),
  inArray: () => ({}),
  isNotNull: () => ({}),
  or: () => ({}),
  sql: Object.assign(() => ({}), {}),
}));
vi.mock("../middlewares/adminAuth", () => ({
  adminAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("./automation", () => ({
  automationAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  validateAutomationImages: () => null,
}));
vi.mock("./posts", () => ({
  cleanText: (value: string) => value,
  normalizeSocialEmbeds: (html: string) => ({ html, report: { removed: 0 } }),
}));
vi.mock("../lib/coverImageValidation", () => ({ validateCoverImage: () => null }));
vi.mock("../lib/objectStorage", () => ({
  ObjectNotFoundError: class ObjectNotFoundError extends Error {},
  ObjectStorageService: class ObjectStorageService {},
}));
vi.mock("../lib/indexNow", () => ({
  submitToIndexNow: vi.fn(),
  buildPostUrls: vi.fn(),
}));

const revisionsRouter = (await import("./postRevisions")).default;
const { editorialFingerprint } = await import("./postRevisions");

const article = {
  id: 7,
  status: "published",
  slug: "durable-story",
  title: "Original title",
  excerpt: "Original excerpt",
  content: "<p>Original body</p>",
  coverImage: null,
  coverImageAlt: null,
  ogImage: null,
  seoTitle: null,
  seoDescription: null,
  authorId: 5,
  author: "Editor",
  authorAvatar: null,
  publishedAt: new Date("2024-04-01T00:00:00Z"),
  scheduledFor: null,
  categoryId: 2,
  tags: [],
  readTime: 1,
  rating: null,
  pros: null,
  cons: null,
  verdict: null,
  seriesId: null,
  seriesPosition: null,
  clusterId: null,
  clusterRole: null,
  contentModifiedAt: null,
};
const editor = { id: 5, username: "author", displayName: "Article Author", role: "editor" };
const admin = { id: 1, username: "admin", role: "admin" };

async function request(
  method: string,
  path: string,
  user: Record<string, unknown>,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user as any;
    next();
  });
  app.use(revisionsRouter);
  app.use((error: unknown, _req: unknown, res: any, _next: unknown) => {
    res.status(500).json({ error: error instanceof Error ? error.message : "Request failed" });
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}${path}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

beforeEach(() => {
  state.selectQueue = [];
  state.transactionQueue = [];
  state.selectedPost = null;
  state.insertAttempts = [];
  state.committedAudit = [];
  state.committedRevision = null;
  state.updateValues = [];
  state.revisionResult = {
    id: 15,
    postId: article.id,
    status: "pending",
    createdAt: new Date("2026-02-10T12:00:00Z"),
  };
  state.failAudit = false;
  vi.clearAllMocks();
});

describe("durable editorial revision history", () => {
  it("stores the immutable proposal snapshot and revision in one transaction", async () => {
    const scheduledPost = {
      ...article,
      status: "scheduled",
      scheduledFor: new Date("2026-03-01T09:00:00Z"),
    };
    state.transactionQueue = [[scheduledPost]];
    const response = await request("POST", "/admin/posts/7/revisions", editor, {
      changes: { title: "Correction" },
      updateNote: "Fix the headline",
    });

    expect(response.status).toBe(201);
    expect(state.committedRevision).toMatchObject({
      postId: 7,
      source: "editor",
      changes: { title: "Correction" },
    });
    expect(state.committedAudit).toHaveLength(1);
    expect(state.committedAudit[0]).toMatchObject({
      action: "post.revision.proposed",
      details: {
        eventVersion: 1,
        revisionId: 15,
        postId: 7,
        postTitle: "Original title",
        postStatus: "scheduled",
        source: "editor",
        proposerName: "Article Author",
        before: { title: "Original title", content: "<p>Original body</p>" },
        postSnapshot: {
          status: "scheduled",
          slug: "durable-story",
          scheduledFor: "2026-03-01T09:00:00.000Z",
          authorId: 5,
          author: "Editor",
        },
        originalChanges: { title: "Correction" },
        updateNote: "Fix the headline",
      },
    });
  });

  it("rolls back the proposal if its canonical audit event cannot be stored", async () => {
    state.transactionQueue = [[article]];
    state.failAudit = true;

    const response = await request("POST", "/admin/posts/7/revisions", editor, {
      changes: { title: "Correction" },
    });

    expect(response.status).toBe(500);
    expect(state.committedRevision).toBeNull();
    expect(state.committedAudit).toHaveLength(0);
  });

  it("appends reviewer edits without replacing the original proposal event", async () => {
    const revision = {
      id: 15,
      postId: article.id,
      status: "pending",
      baseHash: editorialFingerprint(article as any),
      changes: { title: "Originally proposed" },
      updateNote: "Original note",
    };
    state.transactionQueue = [[article], [revision]];

    const response = await request("PUT", "/admin/posts/7/revisions/15", admin, {
      changes: { title: "Reviewer-adjusted title" },
      updateNote: "Reviewer note",
    });

    expect(response.status).toBe(200);
    expect(state.committedAudit).toHaveLength(1);
    expect(state.committedAudit[0]).toMatchObject({
      action: "post.revision.edited",
      details: {
        revisionId: 15,
        before: { title: "Originally proposed" },
        after: { title: "Reviewer-adjusted title" },
        updateNoteBefore: "Original note",
        updateNoteAfter: "Reviewer note",
      },
    });
    expect(state.updateValues).toContainEqual({
      changes: { title: "Reviewer-adjusted title" },
      updateNote: "Reviewer note",
    });
  });

  it("records exact before, applied, and after values with an approval decision", async () => {
    const revision = {
      id: 15,
      postId: article.id,
      status: "pending",
      baseHash: editorialFingerprint(article as any),
      changes: { title: "Corrected title" },
      updateNote: null,
      source: "editor",
      createdAt: new Date("2026-02-10T12:00:00Z"),
    };
    const before = { title: article.title, excerpt: article.excerpt, content: article.content };
    state.transactionQueue = [
      [article],
      [revision],
      [{
        action: "post.revision.proposed",
        details: {
          revisionId: 15,
          eventVersion: 1,
          proposerName: "Article Author",
          proposedAt: "2026-02-10T12:00:00.000Z",
          before,
          postSnapshot: {
            ...article,
            publishedAt: "2024-04-01T00:00:00.000Z",
          },
          originalChanges: { title: "Corrected title" },
        },
      }],
    ];

    const response = await request("POST", "/admin/posts/7/revisions/15/approve", admin);

    expect(response.status).toBe(200);
    expect(state.committedAudit).toHaveLength(1);
    expect(state.committedAudit[0]).toMatchObject({
      action: "post.revision.approved",
      details: {
        before,
        originalChanges: { title: "Corrected title" },
        fields: ["title"],
        finalChanges: { title: "Corrected title" },
        appliedChanges: { title: "Corrected title" },
        after: { title: "Corrected title" },
        postSnapshot: { status: "published", slug: "durable-story", authorId: 5 },
        postAfterSnapshot: { status: "published", slug: "durable-story", authorId: 5 },
      },
    });
  });

  it("unions fields across proposal, reviewer edits, and approval, retaining unchanged values", async () => {
    const revision = {
      id: 16,
      postId: article.id,
      status: "pending",
      baseHash: editorialFingerprint(article as any),
      changes: { content: "<p>Approved body</p>" },
      updateNote: null,
      source: "editor",
      createdAt: new Date("2026-02-10T12:00:00Z"),
    };
    const before = { ...article };
    const editorialBefore = {
      title: article.title,
      excerpt: article.excerpt,
      content: article.content,
      coverImage: null,
      coverImageAlt: null,
      ogImage: null,
      seoTitle: null,
      seoDescription: null,
    };
    const proposalDetails = {
      revisionId: 16,
      eventVersion: 1,
      before: editorialBefore,
      postSnapshot: before,
      originalChanges: { title: "Originally proposed", content: "<p>Approved body</p>" },
      proposerName: "Article Author",
    };
    const editDetails = {
      revisionId: 16,
      before: { title: "Originally proposed", content: "<p>Approved body</p>" },
      after: { content: "<p>Approved body</p>" },
    };
    state.transactionQueue = [
      [article],
      [revision],
      [
        { action: "post.revision.proposed", details: proposalDetails },
        { action: "post.revision.edited", details: editDetails },
      ],
    ];

    const approved = await request("POST", "/admin/posts/7/revisions/16/approve", admin);
    expect(approved.status).toBe(200);
    const auditDecision = state.committedAudit[0]!;
    const auditDetails = auditDecision.details as Record<string, any>;
    expect(auditDetails.fields).toEqual(["title", "content"]);
    expect(auditDetails.originalChanges).toMatchObject({
      title: "Originally proposed",
      content: "<p>Approved body</p>",
    });
    expect(auditDetails.finalChanges).toMatchObject({
      title: "Original title",
      content: "<p>Approved body</p>",
    });
    expect(auditDetails.appliedChanges).not.toHaveProperty("title");

    const decisionRow = {
      audit: {
        ...auditDecision,
        createdAt: new Date("2026-02-10T13:00:00Z"),
      },
      post: { ...article, content: "<p>Approved body</p>" },
      revision: null,
    };
    state.selectQueue = [[decisionRow], [
      { audit: { action: "post.revision.proposed", details: proposalDetails, username: "author" } },
      { audit: { action: "post.revision.edited", details: editDetails, username: "admin" } },
    ]];
    const details = await request("GET", "/admin/revisions/history/16", admin);
    expect(details.status).toBe(200);
    expect(details.body.fields).toEqual(["title", "content"]);
    expect(details.body.final).toMatchObject({
      title: "Original title",
      content: "<p>Approved body</p>",
    });
    expect(details.body.applied).not.toHaveProperty("title");
    expect(details.body).not.toHaveProperty("postSnapshot");
    expect(details.body).not.toHaveProperty("postAfterSnapshot");
  });

  it("reports incomplete legacy proposal history honestly and keeps it editor-scoped", async () => {
    const decision = {
      audit: {
        id: 20,
        action: "post.revision.approved",
        entityId: "7",
        username: "admin",
        summary: "Approved revision for Original title",
        createdAt: new Date("2025-01-01T00:00:00Z"),
        details: {
          revisionId: 20,
          before: { title: "Original title" },
          changes: { title: "Corrected title" },
        },
      },
      post: { ...article, title: "Corrected title" },
      revision: null,
    };
    state.selectQueue = [[decision], [{
      audit: {
        action: "post.revision.proposed",
        details: { revisionId: 20 },
        username: "author",
        createdAt: new Date("2024-12-30T00:00:00Z"),
      },
    }]];

    const forbidden = await request("GET", "/admin/revisions/history/20", {
      id: 9, username: "other", role: "editor",
    });
    expect(forbidden.status).toBe(404);

    state.selectQueue = [[decision], [{
      audit: {
        action: "post.revision.proposed",
        details: { revisionId: 20 },
        username: "author",
        createdAt: new Date("2024-12-30T00:00:00Z"),
      },
    }]];
    const allowed = await request("GET", "/admin/revisions/history/20", editor);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({
      before: { title: "Original title" },
      proposed: null,
      final: { title: "Corrected title" },
      source: "editor",
      proposedByName: "author",
      completeness: { before: true, proposed: false, final: true },
    });
  });

  it("returns paginated, searched history with proposal actors and reviewer field unions", async () => {
    const decision = {
      audit: {
        id: 31,
        action: "post.revision.rejected",
        entityId: "7",
        username: "reviewer",
        summary: "Rejected revision for Original title",
        createdAt: new Date("2026-02-10T13:00:00Z"),
        details: { revisionId: 31, postId: 7, postTitle: "Original title", changes: { excerpt: "Updated" } },
      },
      post: article,
      revision: null,
    };
    state.selectQueue = [[{ value: 1 }], [decision], [
      {
        audit: {
          action: "post.revision.proposed",
          username: "legacy-author",
          createdAt: new Date("2026-02-09T12:00:00Z"),
          details: { revisionId: 31, postTitle: "Original title" },
        },
      },
      {
        audit: {
          action: "post.revision.edited",
          username: "reviewer",
          createdAt: new Date("2026-02-10T12:30:00Z"),
          details: { revisionId: 31, before: { title: "Original title" }, after: { seoDescription: "Edited SEO" } },
        },
      },
    ]];
    const response = await request(
      "GET",
      "/admin/revisions/history?page=2&pageSize=1&status=rejected&search=Original",
      admin,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      total: 1,
      page: 2,
      pageSize: 1,
      items: [{
        id: 31,
        source: "editor",
        proposedByName: "legacy-author",
        fields: ["title", "excerpt", "seoDescription"],
      }],
    });
  });

  it("validates history pagination and never serializes deleted rows to non-admins", async () => {
    const invalid = await request("GET", "/admin/revisions/history?pageSize=51", admin);
    expect(invalid.status).toBe(400);

    state.selectQueue = [[{ value: 1 }], [{
      audit: {
        id: 32,
        action: "post.revision.rejected",
        entityId: "7",
        username: "admin",
        summary: "Rejected revision for Original title",
        createdAt: new Date("2026-02-10T13:00:00Z"),
        details: { revisionId: 32, postId: 7, postTitle: "Original title" },
      },
      post: null,
      revision: null,
    }]];
    const hidden = await request("GET", "/admin/revisions/history", editor);
    expect(hidden.status).toBe(200);
    expect(hidden.body.items).toEqual([]);
  });

  it("allows admins to inspect deleted-article decision history", async () => {
    state.selectQueue = [[{
      audit: {
        id: 30,
        action: "post.revision.rejected",
        entityId: "7",
        username: "admin",
        summary: "Rejected revision for Original title",
        createdAt: new Date("2026-02-10T13:00:00Z"),
        details: { revisionId: 30, postId: 7, postTitle: "Original title" },
      },
      post: null,
      revision: null,
    }], []];

    const response = await request("GET", "/admin/revisions/history/30", admin);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 30,
      postId: 7,
      title: "Original title",
      currentStatus: "deleted",
      before: null,
      proposed: null,
      completeness: { before: false, proposed: false, final: false },
    });
  });
});