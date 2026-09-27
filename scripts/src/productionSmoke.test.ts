import assert from "node:assert/strict";
import { test } from "node:test";
import { runProductionSmoke } from "./productionSmoke";

const BASE_URL = "https://smoke.example";
const post = { slug: "known-published-article" };

function response(body: unknown, status = 200): Response {
  return new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    { status, headers: { "content-type": typeof body === "string" ? "text/html" : "application/json" } },
  );
}

function successfulFetch(
  overrides: Record<string, Response> = {},
  calls: Array<{ path: string; init?: RequestInit }> = [],
): typeof fetch {
  const defaults: Record<string, Response> = {
    "/api/healthz": response({ status: "ok" }),
    "/api/posts": response([post]),
    "/api/posts/latest": response([post]),
    "/api/posts/featured": response([]),
    "/blog": response('<a href="/blog/known-published-article">Article</a>'),
    "/": response('<a href="/blog/known-published-article">Article</a>'),
    "/blog/known-published-article": response("<main>Article</main>"),
    ...overrides,
  };
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push({ path: url.pathname, init });
    return defaults[url.pathname] ?? response("missing", 404);
  }) as typeof fetch;
}

test("production smoke checks public APIs and crawler-rendered article links", async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const passed = await runProductionSmoke(BASE_URL, successfulFetch({}, calls));

  assert.deepEqual(passed, [
    "/api/healthz",
    "/api/posts",
    "/api/posts/latest",
    "/api/posts/featured",
    "/blog",
    "/",
    "/blog/known-published-article",
  ]);
  assert.ok(calls.every(({ init }) => init?.method === "GET"));
  assert.ok(calls.every(({ init }) => init?.credentials === "omit"));
  assert.ok(calls.some(({ path, init }) => path === "/blog" && new Headers(init?.headers).get("user-agent") === "Googlebot"));
});

test("fails when published latest posts exist but the public posts list is empty", async () => {
  const fetcher = successfulFetch({
    "/api/posts": response([]),
    "/api/posts/latest": response([post]),
  });

  await assert.rejects(
    runProductionSmoke(BASE_URL, fetcher),
    /Published posts are available, but \/api\/posts returned an empty list/,
  );
});

test("treats an API 500 regression as a failed smoke check", async () => {
  const fetcher = successfulFetch({
    "/api/posts/latest": response({ error: "internal" }, 500),
  });

  await assert.rejects(
    runProductionSmoke(BASE_URL, fetcher),
    /GET \/api\/posts\/latest returned HTTP 500/,
  );
});

test("rejects malformed API arrays and crawler pages without article links", async () => {
  await assert.rejects(
    runProductionSmoke(BASE_URL, successfulFetch({ "/api/posts": response({ posts: [post] }) })),
    /GET \/api\/posts did not return a JSON array/,
  );
  await assert.rejects(
    runProductionSmoke(BASE_URL, successfulFetch({ "/blog": response("<main>No links</main>") })),
    /Crawler-rendered \/blog did not contain an article link/,
  );
});

test("requires an explicit clean origin and rejects embedded credentials", async () => {
  const fetcher = successfulFetch();
  await assert.rejects(runProductionSmoke("", fetcher), /Provide an explicit base URL/);
  await assert.rejects(runProductionSmoke("https://user:password@smoke.example", fetcher), /without credentials/);
});