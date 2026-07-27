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

/** Old username recorded in the rename history — the API 301s it to AUTHOR. */
const RENAMED_OLD_USERNAME = "old-matt";

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

/** Article whose content contains social-embed placeholders (as saved by the
 *  editor / API sanitizer). Used to verify crawler-facing VideoObject JSON-LD
 *  and tweet blockquote markup. */
const EMBED_ARTICLE = {
  ...ARTICLE,
  id: 2,
  slug: "gadget-video-review",
  title: "Gadget Video Review",
  excerpt: "A hands-on video review.",
  content:
    `<p>Watch the review:</p>` +
    `<div data-provider="youtube" data-url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" data-social-embed="" class="social-embed"><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" target="_blank" rel="noopener noreferrer">https://www.youtube.com/watch?v=dQw4w9WgXcQ</a></div>` +
    `<p>Reaction:</p>` +
    `<div data-provider="twitter" data-url="https://x.com/mapletechie/status/1234567890123" data-social-embed="" class="social-embed"><a href="https://x.com/mapletechie/status/1234567890123" target="_blank" rel="noopener noreferrer">https://x.com/mapletechie/status/1234567890123</a></div>` +
    `<div data-provider="instagram" data-url="https://www.instagram.com/p/Cxyz_ABC123/" data-social-embed="" class="social-embed"><a href="https://www.instagram.com/p/Cxyz_ABC123/" target="_blank" rel="noopener noreferrer">https://www.instagram.com/p/Cxyz_ABC123/</a></div>`,
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
  // Structured profile fields (drive the Person JSON-LD).
  alternateName: "Matthew Mbaka Ogbu",
  jobTitle: "Founder & Editor, Mapletechie",
  locationCity: "Thunder Bay",
  locationRegion: "ON",
  locationCountry: "CA",
  education: ["Abia State University", "Lakehead University"],
  knowsAbout: ["Technology Journalism", "Road Safety"],
  organizations: [
    { name: "Mapletechie", url: "https://mapletechie.com" },
    { name: "TownZest", url: "https://townzest.ca" },
  ],
  memberships: [
    { name: "Canadian Youth Road Safety Council", parentOrganization: "Parachute" },
  ],
  profileLinks: [
    { label: "TownZest", url: "https://townzest.ca" },
    { label: "Canadian Youth Road Safety Council", url: "https://example.com/council" },
  ],
};

/** An author with no structured profile fields — must get no Person JSON-LD. */
const PLAIN_AUTHOR = {
  id: 8,
  username: "plainjane",
  displayName: "Jane Plain",
  bio: null,
};

// Author with only a bio filled in — a bio alone is enough to emit Person
// JSON-LD (description), even with no other structured profile fields.
const BIO_ONLY_AUTHOR = {
  id: 9,
  username: "bioonly",
  displayName: "Bio Only",
  bio: "Writes about gadgets.",
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
function startMockApi(
  opts: { maintenance?: boolean } = {},
): Promise<{
  server: ReturnType<typeof express>;
  close: () => Promise<void>;
  port: number;
  setMaintenance: (on: boolean) => void;
  getFeaturedHits: () => number;
}> {
  const api = express();
  // Mutable so the recovery suite can flip maintenance off mid-test.
  let maintenance = opts.maintenance ?? false;
  let featuredHits = 0;

  api.get("/api/settings/status", (_req, res) => {
    res.json({
      maintenance,
      message: maintenance ? "Upgrading our servers — back shortly." : null,
      eta: maintenance ? "2026-06-23T18:00:00.000Z" : null,
    });
  });
  api.get("/api/posts/featured", (_req, res) => {
    featuredHits += 1;
    res.json([FEATURED_POST]);
  });
  api.get("/api/posts/slug/:slug", (req, res) => {
    if (req.params.slug === ARTICLE.slug) return res.json(ARTICLE);
    if (req.params.slug === EMBED_ARTICLE.slug) return res.json(EMBED_ARTICLE);
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
    if (req.params.username === PLAIN_AUTHOR.username) return res.json(PLAIN_AUTHOR);
    if (req.params.username === BIO_ONLY_AUTHOR.username) return res.json(BIO_ONLY_AUTHOR);
    // Mirrors the real API's rename behaviour: an old username 301s to the
    // current record's endpoint.
    if (req.params.username === RENAMED_OLD_USERNAME) {
      return res.redirect(
        301,
        `/api/authors/by-username/${encodeURIComponent(AUTHOR.username)}`,
      );
    }
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
        setMaintenance: (on: boolean) => {
          maintenance = on;
        },
        getFeaturedHits: () => featuredHits,
        close: () =>
          new Promise<void>((r) => httpServer.close(() => r())),
      });
    });
  });
}

let serverProc: ChildProcess | undefined;
let mockApi: Awaited<ReturnType<typeof startMockApi>> | undefined;
let baseUrl = "";
const serverBundle = path.join(techBlogDir, "dist", "server.mjs");

/**
 * Boot an extra production prerender-server instance pointed at a given API base.
 * Used by the maintenance suite so each scenario gets a fresh process with its
 * own in-process maintenance-status cache (sidestepping the ~10s TTL on the
 * primary server). Returns the base URL and a kill function.
 */
async function startPrerenderServer(
  apiBase: string,
  extraEnv: Record<string, string> = {},
): Promise<{ baseUrl: string; close: () => void }> {
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}`;
  const proc = spawn("node", [serverBundle], {
    cwd: techBlogDir,
    env: {
      ...process.env,
      PORT: String(port),
      API_BASE: apiBase,
      SITE_URL,
      NODE_ENV: "production",
      ...extraEnv,
    },
    stdio: "inherit",
  });
  await waitForServer(`${url}/robots.txt`);
  return {
    baseUrl: url,
    close: () => {
      if (!proc.killed) proc.kill("SIGTERM");
    },
  };
}

/** Like `get`, but against an explicit base URL (for extra server instances). */
async function getFrom(
  base: string,
  pathname: string,
  ua: string,
): Promise<{ status: number; body: string; headers: Headers }> {
  const r = await fetch(`${base}${pathname}`, { headers: { "user-agent": ua } });
  return { status: r.status, body: await r.text(), headers: r.headers };
}

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

    it("injects an LCP hero-image preload into the browser shell", async () => {
      const { status, body } = await get("/", BROWSER_UA);
      expect(status).toBe(200);
      // The featured post's cover must be discoverable from the initial HTML
      // so the browser starts the download before React boots.
      const preload = body.match(/<link rel="preload" as="image"[^>]*>/);
      expect(preload, "hero preload link must be present for browsers").toBeTruthy();
      expect(preload![0]).toContain(`href="${FEATURED_POST.coverImage}"`);
      expect(preload![0]).toContain('fetchpriority="high"');
    });

    it("does NOT inject the hero preload into crawler responses", async () => {
      const { body } = await get("/", GOOGLEBOT_UA);
      expect(body).not.toContain('rel="preload" as="image"');
    });
  });

  describe("site-wide RSS auto-discovery link", () => {
    // The base <head> advertises the site feed via
    // <link rel="alternate" type="application/rss+xml" href=".../api/feed.xml">.
    // It lives OUTSIDE the SEO_HEAD block precisely so crawler prerendering
    // (which replaces that block) can't strip it. These tests fail loudly if
    // a refactor drops it from any prerendered or browser-served page.
    const SITE_FEED_LINK_RE =
      /<link rel="alternate" type="application\/rss\+xml"[^>]*href="[^"]*\/api\/feed\.xml"[^>]*\/?>/;

    it("is present on the prerendered homepage for crawlers", async () => {
      const { status, body } = await get("/", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(
        body,
        "crawler homepage must advertise the site feed in <head>",
      ).toMatch(SITE_FEED_LINK_RE);
    });

    it("is present on the prerendered article page for crawlers", async () => {
      const { status, body } = await get(`/blog/${ARTICLE.slug}`, GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(
        body,
        "crawler article page must advertise the site feed in <head>",
      ).toMatch(SITE_FEED_LINK_RE);
    });

    it("is present in the browser SPA shell too", async () => {
      const { status, body } = await get("/", BROWSER_UA);
      expect(status).toBe(200);
      expect(
        body,
        "browser shell must advertise the site feed in <head>",
      ).toMatch(SITE_FEED_LINK_RE);
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

    it("emits the BreadcrumbList JSON-LD in the prerendered HTML", async () => {
      const { body } = await get(`/blog/${ARTICLE.slug}`, GOOGLEBOT_UA);
      const scripts = [
        ...body.matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        ),
      ].map((m) => JSON.parse(m[1]));
      const crumbs = scripts.find((s) => s["@type"] === "BreadcrumbList");
      expect(crumbs).toBeDefined();
      expect(
        crumbs!.itemListElement.map((i: { name: string }) => i.name),
      ).toEqual(["Home", "Blog", ARTICLE.category, ARTICLE.title]);
      expect(crumbs!.itemListElement.map((i: { position: number }) => i.position)).toEqual([
        1, 2, 3, 4,
      ]);
      expect(crumbs!.itemListElement[3].item).toBe(`${SITE_URL}/blog/${ARTICLE.slug}`);
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

    it("emits VideoObject JSON-LD for each YouTube embed in the content", async () => {
      const { status, body } = await get(`/blog/${EMBED_ARTICLE.slug}`, GOOGLEBOT_UA);
      expect(status).toBe(200);
      const scripts = [
        ...body.matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        ),
      ].map((m) => JSON.parse(m[1]));
      const videos = scripts.filter((s) => s["@type"] === "VideoObject");
      expect(videos).toHaveLength(1);
      const video = videos[0];
      expect(video.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
      expect(video.contentUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(video.thumbnailUrl).toBeTruthy();
      expect(video.name).toBeTruthy();
      expect(video.uploadDate).toBe(EMBED_ARTICLE.publishedAt);
    });

    it("rewrites tweet placeholders into twitter-tweet blockquotes for crawlers only", async () => {
      const { body } = await get(`/blog/${EMBED_ARTICLE.slug}`, GOOGLEBOT_UA);
      expect(body).toContain(
        '<blockquote class="twitter-tweet"><a href="https://x.com/mapletechie/status/1234567890123">https://x.com/mapletechie/status/1234567890123</a></blockquote>',
      );
      // The tweet placeholder div is gone, but other providers keep theirs.
      expect(body).not.toContain('data-provider="twitter"');
      expect(body).toContain('data-provider="youtube"');
      expect(body).toContain('data-provider="instagram"');
      // Fallback links for non-tweet providers survive untouched.
      expect(body).toContain('href="https://www.instagram.com/p/Cxyz_ABC123/"');
    });

    it("serves the plain SPA shell (no embed markup) to a normal browser", async () => {
      const { body } = await get(`/blog/${EMBED_ARTICLE.slug}`, BROWSER_UA);
      expect(body).toContain('<div id="root">');
      expect(body).not.toContain('"@type":"VideoObject"');
      expect(body).not.toContain("twitter-tweet");
    });

    it("returns 200 for the static /team page to any client (it needs no DB lookup)", async () => {
      for (const ua of [GOOGLEBOT_UA, BROWSER_UA]) {
        const { status, body } = await get("/team", ua);
        expect(status).toBe(200);
        expect(body).toContain('<div id="root">');
      }
    });

    it("returns 200 for every other static page and 404 for an unknown path", async () => {
      for (const p of ["/about", "/contact", "/advertise", "/search", "/privacy", "/terms", "/blog", "/careers"]) {
        const { status } = await get(p, BROWSER_UA);
        expect(status, p).toBe(200);
      }
      const { status } = await get("/definitely-not-a-page", BROWSER_UA);
      expect(status).toBe(404);
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

    it("emits the BreadcrumbList JSON-LD (Home > Blog > Category) in the prerendered HTML", async () => {
      const { body } = await get(`/category/${CATEGORY.slug}`, GOOGLEBOT_UA);
      const scripts = [
        ...body.matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        ),
      ].map((m) => JSON.parse(m[1]));
      const crumbs = scripts.find((s) => s["@type"] === "BreadcrumbList");
      expect(crumbs).toBeDefined();
      expect(
        crumbs!.itemListElement.map((i: { name: string }) => i.name),
      ).toEqual(["Home", "Blog", CATEGORY.name]);
      expect(
        crumbs!.itemListElement.map((i: { position: number }) => i.position),
      ).toEqual([1, 2, 3]);
      expect(crumbs!.itemListElement[2].item).toBe(
        `${SITE_URL}/category/${CATEGORY.slug}`,
      );
    });

    it("advertises the category's own RSS feed via rel=\"alternate\" in the prerendered head", async () => {
      const { body } = await get(`/category/${CATEGORY.slug}`, GOOGLEBOT_UA);
      const links = body.match(
        /<link rel="alternate" type="application\/rss\+xml"[^>]*>/g,
      );
      expect(links, "category prerender must carry an RSS alternate link").toBeTruthy();
      const catLink = links!.find((l) =>
        l.includes(`href="${SITE_URL}/api/category/${CATEGORY.slug}/feed.xml"`),
      );
      expect(catLink, "alternate link must point at the per-category feed URL").toBeTruthy();
      // Title is HTML-escaped ("AI &amp; Machine Learning").
      expect(catLink!).toContain(
        'title="Mapletechie — AI &amp; Machine Learning RSS"',
      );
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

    it("prerenders /privacy for Googlebot", async () => {
      const { status, body } = await get("/privacy", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain("<h1>Privacy Policy</h1>");
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("serves the SPA shell to a normal browser at /privacy", async () => {
      // /privacy IS a known SPA route, so browsers get a 200 + shell.
      const { status, body } = await get("/privacy", BROWSER_UA);
      expect(status).toBe(200);
      expect(body).toContain('<div id="root">');
      expect(body).not.toContain("<h1>Privacy Policy</h1>");
    });

    it("prerenders /terms for Googlebot", async () => {
      const { status, body } = await get("/terms", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain("<h1>Terms of Service</h1>");
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("serves the SPA shell to a normal browser at /terms", async () => {
      // /terms IS a known SPA route, so browsers get a 200 + shell.
      const { status, body } = await get("/terms", BROWSER_UA);
      expect(status).toBe(200);
      expect(body).toContain('<div id="root">');
      expect(body).not.toContain("<h1>Terms of Service</h1>");
    });

    it("serves /search as a noindex SPA shell to Googlebot", async () => {
      const { status, body } = await get("/search", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain("noindex");
      expect(body).toContain('<div id="root">');
    });
  });

  describe("legacy WordPress paths return 410 Gone", () => {
    const legacyPaths = [
      "/wp-content/plugins/userfeedback-lite/assets/vue",
      "/wp-admin/",
      "/wp-includes/js/jquery.js",
      "/wp-json/wp/v2/posts",
      "/wp-login.php",
      "/xmlrpc.php",
      "/feed",
      "/old-page.php",
    ];

    it.each(legacyPaths)("returns a noindex 410 to Googlebot for %s", async (p) => {
      const { status, body } = await get(p, GOOGLEBOT_UA);
      expect(status).toBe(410);
      expect(body).toContain("noindex");
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("returns 410 to a browser UA too (no soft SPA shell)", async () => {
      const { status, body } = await get(
        "/wp-content/plugins/userfeedback-lite/assets/vue",
        BROWSER_UA,
      );
      expect(status).toBe(410);
      expect(body).not.toContain('<div id="root"></div>');
    });

    it("does not affect normal unknown paths (still 404)", async () => {
      const { status } = await get("/some-random-unknown-page", GOOGLEBOT_UA);
      expect(status).toBe(404);
    });

    it.each([
      "/wp-administer",
      "/blog/history-of-php.php",
      "/feedback",
    ])("does not falsely 410 near-miss path %s", async (p) => {
      const { status } = await get(p, GOOGLEBOT_UA);
      expect(status).toBe(404);
    });
  });

  describe("author /author/:username", () => {
    it("301-redirects a crawler from a renamed author's old page URL to the current one", async () => {
      // redirect: "manual" so we can observe the 301 itself instead of following it.
      const r = await fetch(`${baseUrl}/author/${RENAMED_OLD_USERNAME}`, {
        headers: { "user-agent": GOOGLEBOT_UA },
        redirect: "manual",
      });
      expect(r.status).toBe(301);
      expect(r.headers.get("location")).toBe(`/author/${AUTHOR.username}`);
    });

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

    it("emits no Person JSON-LD for an author without structured profile fields", async () => {
      const { status, body } = await get(`/author/${PLAIN_AUTHOR.username}`, GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain(`<h1>${PLAIN_AUTHOR.displayName}</h1>`);
      const scripts = [...body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
      for (const [, json] of scripts) {
        expect(JSON.parse(json)["@type"]).not.toBe("Person");
      }
    });

    it("emits Person JSON-LD with the bio for an author with only a bio", async () => {
      const { status, body } = await get(`/author/${BIO_ONLY_AUTHOR.username}`, GOOGLEBOT_UA);
      expect(status).toBe(200);
      const scripts = [...body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
      const person = scripts
        .map(([, json]) => JSON.parse(json))
        .find((d) => d["@type"] === "Person");
      expect(person).toBeDefined();
      expect(person!.name).toBe(BIO_ONLY_AUTHOR.displayName);
      expect(person!.description).toBe(BIO_ONLY_AUTHOR.bio);
    });

    it("emits Person JSON-LD with alternateName and profile links for the founder", async () => {
      const { status, body } = await get(`/author/${AUTHOR.username}`, GOOGLEBOT_UA);
      expect(status).toBe(200);
      const m = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(body);
      expect(m).toBeTruthy();
      const jsonLd = JSON.parse(m![1]);
      expect(jsonLd["@type"]).toBe("Person");
      expect(jsonLd.name).toBe("Matthew Mbaka");
      expect(jsonLd.alternateName).toBe("Matthew Mbaka Ogbu");
      expect(jsonLd.address.addressLocality).toBe("Thunder Bay");
      expect(jsonLd.memberOf.name).toBe("Canadian Youth Road Safety Council");
      expect(jsonLd.sameAs).toContain("https://townzest.ca");
      // Visible links back up the sameAs claims.
      expect(body).toContain('href="https://townzest.ca"');
      expect(body).toContain("Canadian Youth Road Safety Council");
    });

    it("emits the BreadcrumbList JSON-LD (Home > Authors > Name) in the prerendered HTML", async () => {
      const { body } = await get(`/author/${AUTHOR.username}`, GOOGLEBOT_UA);
      const scripts = [
        ...body.matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        ),
      ].map((m) => JSON.parse(m[1]));
      const crumbs = scripts.find((s) => s["@type"] === "BreadcrumbList");
      expect(crumbs).toBeDefined();
      expect(
        crumbs!.itemListElement.map((i: { name: string }) => i.name),
      ).toEqual(["Home", "Authors", AUTHOR.displayName]);
      expect(crumbs!.itemListElement[1].item).toBe(`${SITE_URL}/team`);
      expect(crumbs!.itemListElement[2].item).toBe(
        `${SITE_URL}/author/${AUTHOR.username}`,
      );
    });

    it("emits the BreadcrumbList even for an author with no structured profile fields", async () => {
      const { body } = await get(`/author/${PLAIN_AUTHOR.username}`, GOOGLEBOT_UA);
      const scripts = [
        ...body.matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        ),
      ].map((m) => JSON.parse(m[1]));
      const crumbs = scripts.find((s) => s["@type"] === "BreadcrumbList");
      expect(crumbs).toBeDefined();
      expect(
        crumbs!.itemListElement.map((i: { name: string }) => i.name),
      ).toEqual(["Home", "Authors", PLAIN_AUTHOR.displayName]);
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

    it("emits the BreadcrumbList JSON-LD (Home > Blog > #tag) in the prerendered HTML", async () => {
      const { body } = await get(`/tag/${TAG}`, GOOGLEBOT_UA);
      const scripts = [
        ...body.matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        ),
      ].map((m) => JSON.parse(m[1]));
      const crumbs = scripts.find((s) => s["@type"] === "BreadcrumbList");
      expect(crumbs).toBeDefined();
      expect(
        crumbs!.itemListElement.map((i: { name: string }) => i.name),
      ).toEqual(["Home", "Blog", `#${TAG}`]);
      expect(
        crumbs!.itemListElement.map((i: { position: number }) => i.position),
      ).toEqual([1, 2, 3]);
      expect(crumbs!.itemListElement[2].item).toBe(
        `${SITE_URL}/tag/${encodeURIComponent(TAG)}`,
      );
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

    it("emits the BreadcrumbList JSON-LD (Home > Blog > Series) in the prerendered HTML", async () => {
      const { body } = await get(`/series/${SERIES.slug}`, GOOGLEBOT_UA);
      const scripts = [
        ...body.matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        ),
      ].map((m) => JSON.parse(m[1]));
      const crumbs = scripts.find((s) => s["@type"] === "BreadcrumbList");
      expect(crumbs).toBeDefined();
      expect(
        crumbs!.itemListElement.map((i: { name: string }) => i.name),
      ).toEqual(["Home", "Blog", SERIES.title]);
      expect(
        crumbs!.itemListElement.map((i: { position: number }) => i.position),
      ).toEqual([1, 2, 3]);
      expect(crumbs!.itemListElement[2].item).toBe(
        `${SITE_URL}/series/${SERIES.slug}`,
      );
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

    it("serves a dynamic /sitemap.xml index pointing at the configured domain", async () => {
      const { status, body } = await get("/sitemap.xml", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain("<sitemapindex");
      const domain = (process.env.SITE_DOMAIN || "https://mapletechie.com").replace(/\/+$/, "");
      expect(body).toContain(`<loc>${domain}/api/sitemap.xml</loc>`);
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
      "/privacy",
      "/terms",
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

// This suite proves the maintenance gate reports a *temporary* outage (HTTP 503
// + Retry-After) to crawlers and browsers during maintenance, instead of
// serving a 200 that risks de-indexing real pages — while keeping /admin
// reachable and static assets (robots.txt) served. Each scenario boots its own
// dedicated server process so the maintenance state is fixed at boot and the
// server's ~10s in-process status cache never has to be waited out.
describe("maintenance gate — temporary-outage signal during maintenance", () => {
  let maintApi: Awaited<ReturnType<typeof startMockApi>> | undefined;
  let maintServer: { baseUrl: string; close: () => void } | undefined;
  let failOpenServer: { baseUrl: string; close: () => void } | undefined;
  let deadApiBase = "";

  beforeAll(async () => {
    // 1. A mock API stuck in maintenance, plus a server pointed at it.
    maintApi = await startMockApi({ maintenance: true });
    maintServer = await startPrerenderServer(`http://127.0.0.1:${maintApi.port}`);

    // 2. A server pointed at a dead API port (nothing listening) so the status
    //    fetch fails — the gate must fail OPEN and keep serving the site.
    const deadPort = await getFreePort();
    deadApiBase = `http://127.0.0.1:${deadPort}`;
    failOpenServer = await startPrerenderServer(deadApiBase);
  }, 120_000);

  afterAll(() => {
    maintServer?.close();
    failOpenServer?.close();
    return maintApi?.close();
  });

  describe("public pages return 503 + Retry-After while down", () => {
    // All public pages — including the homepage `/`, whose hero-preload
    // handler defers to the gate during maintenance — flow through the gate
    // for BOTH crawlers and browsers.
    const publicPaths = ["/", "/about", "/blog", `/blog/${ARTICLE.slug}`, `/category/${CATEGORY.slug}`];

    for (const ua of [
      { name: "Googlebot", value: GOOGLEBOT_UA },
      { name: "a browser", value: BROWSER_UA },
    ]) {
      it.each(publicPaths)(`%s returns 503 + Retry-After to ${ua.name}`, async (route) => {
        const { status, headers, body } = await getFrom(maintServer!.baseUrl, route, ua.value);
        expect(status, `${route} should be 503 during maintenance`).toBe(503);
        expect(headers.get("retry-after")).toBe("3600");
        // The maintenance shell must not leak the prerendered article/listing.
        expect(body).not.toContain('"@type":"NewsArticle"');
      });
    }
  });

  describe("admin panel and static assets stay reachable while down", () => {
    it.each(["/admin", "/admin/login"])("%s is NOT gated (stays reachable)", async (route) => {
      const { status } = await getFrom(maintServer!.baseUrl, route, BROWSER_UA);
      expect(status, `${route} must stay reachable during maintenance`).not.toBe(503);
      expect(status).toBe(200);
    });

    it("/robots.txt is still served (200) by static middleware", async () => {
      const { status, body } = await getFrom(maintServer!.baseUrl, "/robots.txt", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain("User-agent");
    });
  });

  describe("gate fails open when the status endpoint is unreachable", () => {
    it.each(["/about", "/blog"])("%s serves the site (not 503) to a browser", async (route) => {
      const { status } = await getFrom(failOpenServer!.baseUrl, route, BROWSER_UA);
      expect(status, `${route} should fail open when status is unreachable`).not.toBe(503);
      expect(status).toBe(200);
    });

    it("/about serves prerendered content (not 503) to Googlebot", async () => {
      const { status, body } = await getFrom(failOpenServer!.baseUrl, "/about", GOOGLEBOT_UA);
      expect(status).toBe(200);
      expect(body).toContain("About Mapletechie");
    });
  });
});

// Recovery path: when maintenance is flipped back OFF, the server must stop
// answering 503 and serve real content again once its in-process status cache
// expires. The 503 responses must carry `Cache-Control: no-store` so shared
// caches/CDNs never pin the outage page past the maintenance window. The
// server's cache TTL is shrunk via the MAINT_TTL_MS env override so the test
// exercises real cache expiry without a 10-second wait.
describe("maintenance gate — recovery after maintenance ends", () => {
  const SHORT_TTL_MS = 500;
  let api: Awaited<ReturnType<typeof startMockApi>> | undefined;
  let server: { baseUrl: string; close: () => void } | undefined;

  beforeAll(async () => {
    // Boot in maintenance mode with a short status-cache TTL.
    api = await startMockApi({ maintenance: true });
    server = await startPrerenderServer(`http://127.0.0.1:${api.port}`, {
      MAINT_TTL_MS: String(SHORT_TTL_MS),
    });
  }, 120_000);

  afterAll(() => {
    server?.close();
    return api?.close();
  });

  it("serves 503 with Cache-Control: no-store while down, then recovers to 200 with real content", async () => {
    // 1. While down: public pages are 503 and explicitly uncacheable.
    for (const route of ["/", "/about", `/blog/${ARTICLE.slug}`]) {
      const { status, headers } = await getFrom(server!.baseUrl, route, GOOGLEBOT_UA);
      expect(status, `${route} should be 503 during maintenance`).toBe(503);
      expect(
        headers.get("cache-control"),
        `${route} 503 must be no-store so CDNs never cache the outage page`,
      ).toBe("no-store");
      expect(headers.get("retry-after")).toBe("3600");
    }
    // A browser hit gets the same uncacheable 503.
    const browserDown = await getFrom(server!.baseUrl, "/about", BROWSER_UA);
    expect(browserDown.status).toBe(503);
    expect(browserDown.headers.get("cache-control")).toBe("no-store");

    // 2. Maintenance ends.
    api!.setMaintenance(false);

    // 3. Wait out the server's in-process status cache TTL (plus margin) so
    //    the next request re-fetches the (now healthy) status.
    await new Promise((r) => setTimeout(r, SHORT_TTL_MS + 300));

    // 4. Recovered: real prerendered content for crawlers…
    const article = await getFrom(server!.baseUrl, `/blog/${ARTICLE.slug}`, GOOGLEBOT_UA);
    expect(article.status, "article should be 200 after maintenance ends").toBe(200);
    expect(article.body).toContain(ARTICLE.title);
    expect(article.body).toContain('"@type":"NewsArticle"');

    const about = await getFrom(server!.baseUrl, "/about", GOOGLEBOT_UA);
    expect(about.status).toBe(200);
    expect(about.body).toContain("About Mapletechie");

    // …and the normal SPA shell (not a 503) for browsers.
    const browserUp = await getFrom(server!.baseUrl, "/about", BROWSER_UA);
    expect(browserUp.status).toBe(200);
  }, 30_000);
});

describe("featured-post cache on the homepage critical path", () => {
  // A fresh server instance so the primary suite's cache state can't leak in.
  let api: Awaited<ReturnType<typeof startMockApi>> | undefined;
  let server: Awaited<ReturnType<typeof startPrerenderServer>> | undefined;

  afterAll(async () => {
    server?.close();
    if (api) await api.close();
  });

  it("only calls /api/posts/featured once for repeated homepage hits within the TTL", async () => {
    api = await startMockApi();
    server = await startPrerenderServer(`http://127.0.0.1:${api.port}`, {
      FEATURED_TTL_MS: "60000",
    });

    const first = await getFrom(server.baseUrl, "/", BROWSER_UA);
    expect(first.status).toBe(200);
    expect(first.body).toMatch(/<link rel="preload" as="image"/);

    const second = await getFrom(server.baseUrl, "/", BROWSER_UA);
    expect(second.status).toBe(200);
    expect(second.body).toMatch(/<link rel="preload" as="image"/);

    // Two page views, one upstream lookup — the cache served the second.
    expect(api.getFeaturedHits()).toBe(1);
  }, 30_000);
});
