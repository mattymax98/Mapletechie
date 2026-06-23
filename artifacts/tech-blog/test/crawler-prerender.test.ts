import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";

// This suite boots the REAL production server (`dist/server.mjs`) — the same
// crawler-aware Express app that runs in production — and asserts that search
// engines receive prerendered HTML while normal browsers get the SPA shell.
//
// It exists because the homepage `/` route was once silently shadowed by the
// `sirv` static middleware, so crawlers got an empty `<div id="root"></div>`
// shell instead of real content. Nothing tested the production server's crawler
// behaviour (typecheck doesn't run it, and the dev workflow serves via Vite,
// not `server.ts`), so the regression was invisible for a long time. These
// tests fail loudly the moment any prerendered route serves the bare shell to a
// crawler again.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const techBlogDir = path.resolve(__dirname, "..");

const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const SITE_URL = "https://test.mapletechie.example";

/** Reserve a free localhost port by briefly binding to :0. */
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

// --- Fixture data the mock API returns to the prerender server ---------------

const FEATURED_POST = {
  slug: "the-future-of-ai",
  title: "The Future of AI",
  coverImage: "/covers/ai-future.webp",
};

const ARTICLE = {
  id: 1,
  slug: "the-future-of-ai",
  title: "The Future of AI",
  excerpt: "Where machine learning is headed next.",
  content: "<p>Large language models are reshaping how we build software.</p>",
  coverImage: "/covers/ai-future.webp",
  ogImage: "/covers/ai-future-og.jpg",
  category: "AI",
  tags: ["ai", "machine-learning"],
  publishedAt: "2026-01-15T12:00:00.000Z",
  updatedAt: "2026-01-16T12:00:00.000Z",
  author: "Matthew Mbaka",
  seoTitle: null,
  seoDescription: null,
};

const CATEGORY = {
  id: 2,
  slug: "ai",
  name: "AI & Machine Learning",
  description: "All things artificial intelligence.",
};

const POST_LIST = [
  {
    slug: "the-future-of-ai",
    title: "The Future of AI",
    excerpt: "Where machine learning is headed next.",
    publishedAt: "2026-01-15T12:00:00.000Z",
    author: "Matthew Mbaka",
    category: "AI",
  },
];

const AUTHOR = {
  id: 7,
  username: "matthew",
  displayName: "Matthew Mbaka",
  bio: "Founding editor of Mapletechie, covering AI and Canadian tech.",
};

const TAG = "ai";

const SERIES = {
  slug: "ai-revolution",
  title: "The AI Revolution",
  description: "A multi-part deep dive into the AI boom.",
  coverImage: "/covers/ai-future.webp",
};

const JOB = {
  slug: "senior-editor",
  title: "Senior Editor",
  location: "Toronto, ON",
  type: "Full-time",
  employmentType: "FULL_TIME",
  compensation: "$90k–$120k",
  summary: "Lead our editorial coverage.",
  description:
    "<p>We're looking for a senior editor to lead coverage of AI and gadgets.</p>",
  createdAt: "2026-01-10T12:00:00.000Z",
};

/** Build a tiny stand-in for the API server the prerenderer fetches from. */
function startMockApi(): Promise<{ server: ReturnType<typeof express>; close: () => Promise<void>; port: number }> {
  const api = express();

  api.get("/api/settings/status", (_req, res) => {
    res.json({ maintenance: false, message: null, eta: null });
  });
  api.get("/api/posts/featured", (_req, res) => {
    res.json([FEATURED_POST]);
  });
  api.get("/api/posts/slug/:slug", (req, res) => {
    if (req.params.slug === ARTICLE.slug) return res.json(ARTICLE);
    res.status(404).json({ error: "not found" });
  });
  api.get("/api/categories", (_req, res) => {
    res.json([CATEGORY]);
  });
  api.get("/api/posts", (_req, res) => {
    res.json(POST_LIST);
  });
  api.get("/api/authors/by-username/:username", (req, res) => {
    if (req.params.username === AUTHOR.username) return res.json(AUTHOR);
    res.status(404).json({ error: "not found" });
  });
  api.get("/api/authors/:id/posts", (req, res) => {
    if (Number(req.params.id) === AUTHOR.id) return res.json(POST_LIST);
    res.json([]);
  });
  api.get("/api/tags/:tag/posts", (req, res) => {
    if (req.params.tag === TAG) return res.json(POST_LIST);
    res.json([]);
  });
  api.get("/api/series/:slug", (req, res) => {
    if (req.params.slug === SERIES.slug) {
      return res.json({ series: SERIES, posts: POST_LIST });
    }
    res.status(404).json({ error: "not found" });
  });
  api.get("/api/jobs", (_req, res) => {
    res.json([JOB]);
  });
  api.get("/api/jobs/:slug", (req, res) => {
    if (req.params.slug === JOB.slug) return res.json(JOB);
    res.status(404).json({ error: "not found" });
  });

  return new Promise((resolve) => {
    const httpServer = api.listen(0, "127.0.0.1", () => {
      const port = (httpServer.address() as AddressInfo).port;
      resolve({
        server: api,
        port,
        close: () =>
          new Promise<void>((r) => httpServer.close(() => r())),
      });
    });
  });
}

let serverProc: ChildProcess | undefined;
let mockApi: Awaited<ReturnType<typeof startMockApi>> | undefined;
let baseUrl = "";

/** Poll the booting prerender server until it answers (or time out). */
async function waitForServer(url: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url, { headers: { "user-agent": BROWSER_UA } });
      if (r.ok || r.status === 404) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Prerender server did not start within ${timeoutMs}ms`);
}

async function get(pathname: string, ua: string): Promise<{ status: number; body: string; headers: Headers }> {
  const r = await fetch(`${baseUrl}${pathname}`, { headers: { "user-agent": ua } });
  return { status: r.status, body: await r.text(), headers: r.headers };
}

beforeAll(async () => {
  // 1. Build the production server + client. The build needs PORT/BASE_PATH
  //    (vite.config.ts throws without them). We only build if the artifacts
  //    are missing OR always rebuild the server so the test reflects current
  //    source. Building both is the safe, faithful path the task calls for.
  const serverBundle = path.join(techBlogDir, "dist", "server.mjs");
  const indexHtml = path.join(techBlogDir, "dist", "public", "index.html");
  if (!existsSync(serverBundle) || !existsSync(indexHtml)) {
    execFileSync("pnpm", ["run", "build"], {
      cwd: techBlogDir,
      env: { ...process.env, PORT: "5000", BASE_PATH: "/" },
      stdio: "inherit",
    });
  } else {
    // Rebuild only the (fast) server bundle so it tracks server.ts changes,
    // reusing the existing client build for speed.
    execFileSync("pnpm", ["run", "build:server"], {
      cwd: techBlogDir,
      env: { ...process.env, PORT: "5000", BASE_PATH: "/" },
      stdio: "inherit",
    });
  }

  // 2. Start the mock API the prerenderer fetches content from.
  mockApi = await startMockApi();

  // 3. Boot the real production server pointed at the mock API.
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
  if (serverProc && !serverProc.killed) {
    serverProc.kill("SIGTERM");
  }
  if (mockApi) await mockApi.close();
});

describe("crawler prerendering — content for bots, shell for browsers", () => {
  describe("homepage /", () => {
    it("serves a prerendered body with real content to Googlebot", async () => {
      const { status, body } = await get("/", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain("Mapletechie — Tech, told straight.");
      expect(body).toContain("Latest Articles");
      // JSON-LD entity signal must land in the initial HTML for crawlers.
      expect(body).toContain('"@type":"WebSite"');
      expect(body).toContain('"@type":"Organization"');
      // The featured post should be linked in the prerendered list.
      expect(body).toContain(`${SITE_URL}/blog/${FEATURED_POST.slug}`);
      // Must NOT be the bare SPA shell.
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("serves the SPA shell (empty #root) to a normal browser", async () => {
      const { status, body } = await get("/", BROWSER_UA);
      expect(status).toBe(200);
      expect(body).toContain('<div id="root">');
      // The browser shell carries no prerendered article list.
      expect(body).not.toContain("Latest Articles");
    });
  });

  describe("article /blog/:slug", () => {
    it("serves the full article + JSON-LD to Googlebot", async () => {
      const { status, body } = await get(`/blog/${ARTICLE.slug}`, GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain(`<h1>${ARTICLE.title}</h1>`);
      expect(body).toContain("Large language models are reshaping");
      expect(body).toContain('"@type":"NewsArticle"');
      expect(body).toContain(ARTICLE.author);
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("serves the SPA shell (not the prerendered article) to a normal browser", async () => {
      // Note: /blog/:slug isn't in KNOWN_SPA_ROUTES (its validity depends on a
      // DB lookup), so the catch-all returns a soft 404 + the SPA shell for
      // human visitors — React Router then mounts and renders the real article
      // client-side. The point here is that the browser gets the shell, NOT the
      // crawler-prerendered article body.
      const { status, body } = await get(`/blog/${ARTICLE.slug}`, BROWSER_UA);
      expect(status).toBe(404);
      expect(body).toContain('<div id="root">');
      expect(body).not.toContain('"@type":"NewsArticle"');
      expect(body).not.toContain("Large language models are reshaping");
    });

    it("returns a noindex 404 to Googlebot for an unknown slug", async () => {
      const { status, body } = await get("/blog/this-does-not-exist", GOOGLEBOT_UA);
      expect(status).toBe(404);
      expect(body).toContain("noindex");
    });
  });

  describe("category /category/:slug", () => {
    it("serves a prerendered listing to Googlebot", async () => {
      const { status, body } = await get(`/category/${CATEGORY.slug}`, GOOGLEBOT_UA);
      expect(status).toBe(200);
      // CATEGORY.name ("AI & Machine Learning") is HTML-escaped in the body.
      expect(body).toContain("Machine Learning");
      expect(body).toContain(`${SITE_URL}/blog/${FEATURED_POST.slug}`);
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("returns a noindex 404 to Googlebot for an unknown category", async () => {
      const { status, body } = await get("/category/nonexistent", GOOGLEBOT_UA);
      expect(status).toBe(404);
      expect(body).toContain("noindex");
    });
  });

  describe("blog index /blog", () => {
    it("serves a prerendered listing to Googlebot", async () => {
      const { status, body } = await get("/blog", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain("Blog — Tech News");
      expect(body).not.toContain('<div id="root"></div>');
    });
  });

  describe("evergreen pages", () => {
    it("prerenders /about for Googlebot", async () => {
      const { status, body } = await get("/about", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain("About Mapletechie");
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("prerenders /contact for Googlebot", async () => {
      const { status, body } = await get("/contact", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain("Contact Mapletechie");
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("prerenders /advertise for Googlebot", async () => {
      const { status, body } = await get("/advertise", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain("Partner with Mapletechie");
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("serves /search as a noindex SPA shell to Googlebot", async () => {
      const { status, body } = await get("/search", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain("noindex");
      expect(body).toContain('<div id="root">');
    });
  });

  describe("author /author/:username", () => {
    it("serves a prerendered author page + listing to Googlebot", async () => {
      const { status, body } = await get(`/author/${AUTHOR.username}`, GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain(`<h1>${AUTHOR.displayName}</h1>`);
      expect(body).toContain("Founding editor of Mapletechie");
      expect(body).toContain(`${SITE_URL}/blog/${FEATURED_POST.slug}`);
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("serves the SPA shell (not the prerendered page) to a normal browser", async () => {
      const { status, body } = await get(`/author/${AUTHOR.username}`, BROWSER_UA);
      expect(status).toBe(404);
      expect(body).toContain('<div id="root">');
      expect(body).not.toContain("Founding editor of Mapletechie");
    });

    it("returns a noindex 404 to Googlebot for an unknown author", async () => {
      const { status, body } = await get("/author/nobody", GOOGLEBOT_UA);
      expect(status).toBe(404);
      expect(body).toContain("noindex");
    });
  });

  describe("tag /tag/:tag", () => {
    it("serves a prerendered tag archive + listing to Googlebot", async () => {
      const { status, body } = await get(`/tag/${TAG}`, GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain(`<h1>#${TAG}</h1>`);
      expect(body).toContain(`${SITE_URL}/blog/${FEATURED_POST.slug}`);
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("serves the SPA shell (not the prerendered archive) to a normal browser", async () => {
      const { status, body } = await get(`/tag/${TAG}`, BROWSER_UA);
      expect(status).toBe(404);
      expect(body).toContain('<div id="root">');
      expect(body).not.toContain(`${SITE_URL}/blog/${FEATURED_POST.slug}`);
    });

    it("returns a noindex 404 to Googlebot for a tag with no posts", async () => {
      const { status, body } = await get("/tag/nonexistent", GOOGLEBOT_UA);
      expect(status).toBe(404);
      expect(body).toContain("noindex");
    });
  });

  describe("series /series/:slug", () => {
    it("serves a prerendered series page + listing to Googlebot", async () => {
      const { status, body } = await get(`/series/${SERIES.slug}`, GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain(`<h1>${SERIES.title}</h1>`);
      expect(body).toContain("Articles in this series");
      expect(body).toContain(`${SITE_URL}/blog/${FEATURED_POST.slug}`);
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("serves the SPA shell (not the prerendered page) to a normal browser", async () => {
      const { status, body } = await get(`/series/${SERIES.slug}`, BROWSER_UA);
      expect(status).toBe(404);
      expect(body).toContain('<div id="root">');
      expect(body).not.toContain("Articles in this series");
    });

    it("returns a noindex 404 to Googlebot for an unknown series", async () => {
      const { status, body } = await get("/series/nonexistent", GOOGLEBOT_UA);
      expect(status).toBe(404);
      expect(body).toContain("noindex");
    });
  });

  describe("careers /careers and /careers/:slug", () => {
    it("serves a prerendered careers listing to Googlebot", async () => {
      const { status, body } = await get("/careers", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain("Careers at Mapletechie");
      expect(body).toContain(`${SITE_URL}/careers/${JOB.slug}`);
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("serves the SPA shell to a normal browser at /careers", async () => {
      // /careers IS a known SPA route, so browsers get a 200 + shell.
      const { status, body } = await get("/careers", BROWSER_UA);
      expect(status).toBe(200);
      expect(body).toContain('<div id="root">');
      expect(body).not.toContain("Careers at Mapletechie");
    });

    it("serves the full job posting + JSON-LD to Googlebot", async () => {
      const { status, body } = await get(`/careers/${JOB.slug}`, GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain(`<h1>${JOB.title}</h1>`);
      expect(body).toContain('"@type":"JobPosting"');
      expect(body).toContain("senior editor to lead coverage");
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("serves the SPA shell (not the prerendered job) to a normal browser", async () => {
      const { status, body } = await get(`/careers/${JOB.slug}`, BROWSER_UA);
      expect(status).toBe(404);
      expect(body).toContain('<div id="root">');
      expect(body).not.toContain('"@type":"JobPosting"');
    });

    it("returns a noindex 404 to Googlebot for an unknown job", async () => {
      const { status, body } = await get("/careers/not-a-real-job", GOOGLEBOT_UA);
      expect(status).toBe(404);
      expect(body).toContain("noindex");
    });
  });

  describe("static asset fallthrough", () => {
    it("serves /robots.txt from sirv (not the SPA shell)", async () => {
      const { status, body } = await get("/robots.txt", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain("User-agent");
      expect(body).not.toContain('<div id="root">');
    });
  });

  describe("regression guard — no prerendered route may serve the bare shell to a crawler", () => {
    const prerendered = [
      "/",
      `/blog/${ARTICLE.slug}`,
      `/category/${CATEGORY.slug}`,
      "/blog",
      "/about",
      "/contact",
      "/advertise",
      `/author/${AUTHOR.username}`,
      `/tag/${TAG}`,
      `/series/${SERIES.slug}`,
      "/careers",
      `/careers/${JOB.slug}`,
    ];
    it.each(prerendered)("%s does not return an empty #root to Googlebot", async (route) => {
      const { body } = await get(route, GOOGLEBOT_UA);
      expect(body, `${route} served the bare SPA shell to a crawler`).not.toContain(
        '<div id="root"></div>',
      );
    });
  });
});
