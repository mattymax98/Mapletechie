import express from "express";
import sirv from "sirv";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT);
if (!Number.isFinite(PORT) || PORT <= 0) {
  throw new Error(`Invalid or missing PORT env var: "${process.env.PORT}"`);
}

const SITE_URL = (process.env.SITE_URL || "https://mapletechie.com").replace(/\/+$/, "");
const API_BASE = (process.env.API_BASE || "http://localhost").replace(/\/+$/, "");
const DEFAULT_OG_IMAGE = `${SITE_URL}/opengraph-v2.jpg`;
const DEFAULT_DESCRIPTION =
  "Mapletechie — Your go-to source for tech news, gadget reviews, software deep dives, and the latest in AI, EVs, and cybersecurity.";

const distDir = path.resolve(__dirname, "public");
const indexHtmlPath = path.join(distDir, "index.html");
if (!existsSync(indexHtmlPath)) {
  throw new Error(
    `Missing built index.html at ${indexHtmlPath}. Did "vite build" run before starting the server?`,
  );
}
const indexHtml = readFileSync(indexHtmlPath, "utf-8");

const SEO_BLOCK_RE = /<!-- SEO_HEAD_START -->[\s\S]*?<!-- SEO_HEAD_END -->/;

const CRAWLER_RE =
  /facebookexternalhit|Facebot|LinkedInBot|Twitterbot|Slackbot|WhatsApp|TelegramBot|Discordbot|Pinterest|redditbot|Applebot|Googlebot|Google-InspectionTool|bingbot|DuckDuckBot|YandexBot|Baiduspider|SkypeUriPreview|vkShare|W3C_Validator|Embedly|Iframely|outbrain|quora link preview|showyoubot|Tumblr|XING-contenttabreceiver|Mediapartners-Google|AhrefsBot|SemrushBot|Sogou/i;

function htmlEscape(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function absUrl(maybeRelative: string | null | undefined, fallback: string): string {
  if (!maybeRelative) return fallback;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  return `${SITE_URL}${maybeRelative.startsWith("/") ? "" : "/"}${maybeRelative}`;
}

interface SeoData {
  title: string;
  description: string;
  image: string;
  url: string;
  type: "website" | "article";
  publishedTime?: string | null;
  modifiedTime?: string | null;
  author?: string | null;
  section?: string | null;
  tags?: string[] | null;
}

function buildSeoBlock(data: SeoData): string {
  const title = htmlEscape(data.title);
  const description = htmlEscape(data.description);
  const image = htmlEscape(data.image);
  const url = htmlEscape(data.url);
  const type = data.type === "article" ? "article" : "website";

  const lines: string[] = [
    "<!-- SEO_HEAD_START -->",
    `    <title>${title}</title>`,
    `    <meta name="description" content="${description}" />`,
    `    <link rel="canonical" href="${url}" />`,
    `    <meta property="og:type" content="${type}" />`,
    `    <meta property="og:site_name" content="Mapletechie" />`,
    `    <meta property="og:title" content="${title}" />`,
    `    <meta property="og:description" content="${description}" />`,
    `    <meta property="og:url" content="${url}" />`,
    `    <meta property="og:image" content="${image}" />`,
    `    <meta property="og:image:width" content="1200" />`,
    `    <meta property="og:image:height" content="630" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
    `    <meta name="twitter:site" content="@mapletechie" />`,
    `    <meta name="twitter:title" content="${title}" />`,
    `    <meta name="twitter:description" content="${description}" />`,
    `    <meta name="twitter:image" content="${image}" />`,
  ];

  if (type === "article") {
    if (data.publishedTime) {
      lines.push(
        `    <meta property="article:published_time" content="${htmlEscape(data.publishedTime)}" />`,
      );
    }
    if (data.modifiedTime) {
      lines.push(
        `    <meta property="article:modified_time" content="${htmlEscape(data.modifiedTime)}" />`,
      );
    }
    if (data.author) {
      lines.push(
        `    <meta property="article:author" content="${htmlEscape(data.author)}" />`,
        `    <meta name="author" content="${htmlEscape(data.author)}" />`,
      );
    }
    if (data.section) {
      lines.push(
        `    <meta property="article:section" content="${htmlEscape(data.section)}" />`,
      );
    }
    if (data.tags?.length) {
      for (const tag of data.tags.slice(0, 8)) {
        lines.push(
          `    <meta property="article:tag" content="${htmlEscape(tag)}" />`,
        );
      }
    }
  }

  lines.push("    <!-- SEO_HEAD_END -->");
  return lines.join("\n");
}

function renderHtml(seoBlock: string): string {
  return indexHtml.replace(SEO_BLOCK_RE, seoBlock);
}

function isCrawler(req: express.Request): boolean {
  const ua = req.headers["user-agent"];
  if (!ua) return false;
  return CRAWLER_RE.test(ua);
}

async function fetchJson<T>(url: string, timeoutMs = 4000): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

// Tiny request log so prod issues are debuggable.
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== "production" || req.path.startsWith("/blog/")) {
    // eslint-disable-next-line no-console
    console.log(`[tech-blog] ${req.method} ${req.path} ua="${(req.headers["user-agent"] || "").slice(0, 80)}"`);
  }
  next();
});

// Serve static assets (CSS, JS, images, public/* files) from the Vite build.
// `single: false` so unmatched paths fall through to our route handlers
// instead of always returning index.html — we want SEO-aware routing first.
app.use(sirv(distDir, { single: false, dev: false, etag: true }));

// --- Maintenance gate ---------------------------------------------------
// When the site is in maintenance mode, public *page* requests must answer
// with HTTP 503 (+ Retry-After) so crawlers treat the outage as temporary
// rather than de-indexing real pages. Static assets (CSS/JS) are already
// served above by sirv with 200, so the React app can still boot and render
// the maintenance screen for human visitors. The /admin panel is exempt so
// the site stays manageable while it's "down".
interface MaintenanceStatus {
  maintenance: boolean;
  message: string | null;
  eta: string | null;
}

let maintCache: { value: MaintenanceStatus; at: number } | null = null;
const MAINT_TTL_MS = 10_000;

async function getMaintenanceStatus(): Promise<MaintenanceStatus> {
  if (maintCache && Date.now() - maintCache.at < MAINT_TTL_MS) {
    return maintCache.value;
  }
  const status = await fetchJson<MaintenanceStatus>(
    `${API_BASE}/api/settings/status`,
    2000,
  );
  // Fail open: if the status endpoint is unreachable, don't take pages down.
  // Only cache successful reads so a transient blip recovers quickly.
  if (status) {
    maintCache = { value: status, at: Date.now() };
    return status;
  }
  return { maintenance: false, message: null, eta: null };
}

app.use(async (req, res, next) => {
  // The admin panel must stay reachable while the public site is down.
  if (req.path === "/admin" || req.path.startsWith("/admin/")) {
    return next();
  }
  const status = await getMaintenanceStatus();
  if (!status.maintenance) return next();

  const seo = buildSeoBlock({
    title: "We'll be right back | Mapletechie",
    description:
      status.message?.trim() ||
      "Mapletechie is down for scheduled maintenance and will be back shortly.",
    image: DEFAULT_OG_IMAGE,
    url: SITE_URL,
    type: "website",
  });

  res.status(503);
  res.setHeader("Retry-After", "3600");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(renderHtml(seo));
});
// -----------------------------------------------------------------------

interface PostRecord {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  content?: string | null;
  coverImage: string | null;
  ogImage?: string | null;
  category: string | null;
  tags: string[] | null;
  publishedAt: string | null;
  updatedAt?: string | null;
  author: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

app.get(/^\/blog\/([^\/]+)\/?$/, async (req, res, next) => {
  if (!isCrawler(req)) return next();
  const slug = req.params[0];
  if (!slug) return next();

  const post = await fetchJson<PostRecord>(
    `${API_BASE}/api/posts/slug/${encodeURIComponent(slug)}`,
  );
  if (!post) {
    // Unknown slug: fall through to the default SPA shell so 404 page renders.
    return next();
  }

  const url = `${SITE_URL}/blog/${post.slug}`;
  const title = post.seoTitle?.trim() || post.title;
  const description =
    post.seoDescription?.trim() || post.excerpt?.trim() || DEFAULT_DESCRIPTION;
  const image = absUrl(post.ogImage || post.coverImage, DEFAULT_OG_IMAGE);

  const seoTitleFull = `${title} | Mapletechie`;
  const seo = buildSeoBlock({
    title: seoTitleFull,
    description,
    image,
    url,
    type: "article",
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt ?? post.publishedAt,
    author: post.author,
    section: post.category,
    tags: post.tags,
  });

  // schema.org JSON-LD for Google rich results. react-helmet-async ALSO emits
  // this client-side for human visitors, but Googlebot does not always render
  // JS during indexing — emitting it server-side as well guarantees it lands
  // in the initial HTML for crawlers.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: title,
    description,
    image: [image],
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt ?? post.publishedAt ?? undefined,
    author: post.author
      ? { "@type": "Person", name: post.author }
      : undefined,
    publisher: {
      "@type": "Organization",
      name: "Mapletechie",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo-favicon-v2.png`,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: post.category ?? undefined,
    keywords: post.tags?.join(", "),
  };
  // JSON.stringify escapes quotes; we additionally escape `<` so the JSON
  // body cannot prematurely close the surrounding <script> tag.
  const jsonLdSafe = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  const seoWithJsonLd = seo.replace(
    "<!-- SEO_HEAD_END -->",
    `    <script type="application/ld+json">${jsonLdSafe}</script>\n    <!-- SEO_HEAD_END -->`,
  );

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  res.send(renderHtml(seoWithJsonLd));
});

interface CategoryRecord {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
}

app.get(/^\/category\/([^\/]+)\/?$/, async (req, res, next) => {
  if (!isCrawler(req)) return next();
  const slug = req.params[0];
  if (!slug) return next();

  const categories = await fetchJson<CategoryRecord[]>(`${API_BASE}/api/categories`);
  const cat = categories?.find((c) => c.slug === slug);
  if (!cat) return next();

  const title = `${cat.name} — News & Reviews | Mapletechie`;
  const description =
    cat.description?.trim() ||
    `The latest ${cat.name} stories, reviews, and analysis on Mapletechie.`;

  const seo = buildSeoBlock({
    title,
    description,
    image: DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/category/${cat.slug}`,
    type: "website",
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=600");
  res.send(renderHtml(seo));
});

// Routes the SPA actually handles (mirrors artifacts/tech-blog/src/App.tsx).
// Anything that doesn't match returns the SPA shell with HTTP 404 so search
// engines stop indexing typo / stale-backlink URLs like /news-updates as if
// they were real pages. The React app still mounts and renders <NotFound />
// for human visitors — only the status code changes.
const KNOWN_SPA_ROUTES: RegExp[] = [
  /^\/$/,
  /^\/blog\/?$/,
  /^\/blog\/[^/]+\/?$/,
  /^\/category\/[^/]+\/?$/,
  /^\/author\/[^/]+\/?$/,
  /^\/tag\/[^/]+\/?$/,
  /^\/series\/[^/]+\/?$/,
  /^\/careers\/?$/,
  /^\/careers\/[^/]+\/?$/,
  /^\/(about|contact|advertise|search|privacy|terms|latest)\/?$/,
  /^\/admin(\/.*)?$/,
];

function isKnownSpaRoute(pathname: string): boolean {
  return KNOWN_SPA_ROUTES.some((re) => re.test(pathname));
}

// SPA fallback — every other GET returns the unmodified index.html so React Router takes over.
// Vary: User-Agent because /blog/* and /category/* above branch on UA, so any shared
// cache MUST key by UA to avoid serving a crawler-rendered HTML to a real browser (or vice versa).
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  if (!isKnownSpaRoute(req.path)) {
    res.status(404);
  }
  res.send(indexHtml);
});

app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(
    `[tech-blog] crawler-aware server listening on :${PORT} (API_BASE=${API_BASE}, SITE_URL=${SITE_URL})`,
  );
});
