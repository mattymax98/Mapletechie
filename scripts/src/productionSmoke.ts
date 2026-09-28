import { pathToFileURL } from "node:url";

const REQUEST_TIMEOUT_MS = 10_000;
const API_USER_AGENT = "mapletechie-production-smoke/1.0";
const CRAWLER_USER_AGENT = "Googlebot";

type Fetcher = typeof fetch;

function parseBaseUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Provide an explicit base URL, for example https://example.com");
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("Base URL must be an HTTP(S) origin without credentials, path, query, or fragment");
  }
  return url;
}

async function get(
  baseUrl: URL,
  path: string,
  fetcher: Fetcher,
  crawler = false,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(new URL(path, baseUrl), {
      method: "GET",
      credentials: "omit",
      headers: { "user-agent": crawler ? CRAWLER_USER_AGENT : API_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`GET ${path} failed or timed out`);
  }
  if (response.status !== 200) {
    throw new Error(`GET ${path} returned HTTP ${response.status}`);
  }
  return response;
}

async function getJsonArray(
  baseUrl: URL,
  path: string,
  fetcher: Fetcher,
): Promise<unknown[]> {
  const response = await get(baseUrl, path, fetcher);
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error(`GET ${path} returned invalid JSON`);
  }
  if (!Array.isArray(value)) {
    throw new Error(`GET ${path} did not return a JSON array`);
  }
  return value;
}

function postSlug(post: unknown): string | undefined {
  if (
    typeof post === "object" &&
    post !== null &&
    "slug" in post &&
    typeof post.slug === "string" &&
    /^[a-z0-9][a-z0-9-]*$/i.test(post.slug)
  ) {
    return post.slug;
  }
  return undefined;
}

function containsArticleLink(html: string, baseUrl: URL): boolean {
  const hrefs = html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi);
  for (const match of hrefs) {
    try {
      const link = new URL(match[1], baseUrl);
      if (link.origin === baseUrl.origin && /^\/blog\/[a-z0-9][a-z0-9-]*\/?$/i.test(link.pathname)) {
        return true;
      }
    } catch {
      // Ignore malformed links; other links can still satisfy the check.
    }
  }
  return false;
}

async function getCrawlerHtml(
  baseUrl: URL,
  path: string,
  fetcher: Fetcher,
): Promise<string> {
  const response = await get(baseUrl, path, fetcher, true);
  try {
    return await response.text();
  } catch {
    throw new Error(`GET ${path} returned unreadable HTML`);
  }
}

export async function runProductionSmoke(
  baseUrlInput: string,
  fetcher: Fetcher = fetch,
): Promise<string[]> {
  const baseUrl = parseBaseUrl(baseUrlInput);
  const passed: string[] = [];

  await get(baseUrl, "/api/healthz", fetcher);
  passed.push("/api/healthz");

  const [posts, latest, featured] = await Promise.all([
    getJsonArray(baseUrl, "/api/posts", fetcher),
    getJsonArray(baseUrl, "/api/posts/latest", fetcher),
    getJsonArray(baseUrl, "/api/posts/featured", fetcher),
  ]);
  passed.push("/api/posts", "/api/posts/latest", "/api/posts/featured");

  if (posts.length === 0 && (latest.length > 0 || featured.length > 0)) {
    throw new Error("Published posts are available, but /api/posts returned an empty list");
  }
  const knownSlug = [...posts, ...latest, ...featured]
    .map(postSlug)
    .find((slug): slug is string => slug !== undefined);
  if (!knownSlug) {
    throw new Error("No published article slug was returned; cannot check the article page");
  }

  for (const path of ["/blog", "/"]) {
    const html = await getCrawlerHtml(baseUrl, path, fetcher);
    if (!containsArticleLink(html, baseUrl)) {
      throw new Error(`Crawler-rendered ${path} did not contain an article link`);
    }
    passed.push(path);
  }

  const articlePath = `/blog/${encodeURIComponent(knownSlug)}`;
  await get(baseUrl, articlePath, fetcher, true);
  passed.push(articlePath);
  return passed;
}

function isCliEntry(): boolean {
  const entry = process.argv[1];
  return !!entry && import.meta.url === pathToFileURL(entry).href;
}

if (isCliEntry()) {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error("Usage: productionSmoke <explicit-base-url>");
    process.exitCode = 1;
  } else {
    runProductionSmoke(args[0])
      .then((paths) => {
        for (const path of paths) console.log(`PASS ${path}`);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Smoke check failed";
        console.error(`FAIL ${message}`);
        process.exitCode = 1;
      });
  }
}