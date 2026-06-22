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
const ROOT_RE = /<div id="root"><\/div>/;

const CRAWLER_RE =
  /facebookexternalhit|Facebot|LinkedInBot|Twitterbot|Slackbot|WhatsApp|TelegramBot|Discordbot|Pinterest|redditbot|Applebot|Googlebot|Google-InspectionTool|bingbot|DuckDuckBot|YandexBot|Baiduspider|SkypeUriPreview|vkShare|W3C_Validator|Embedly|Iframely|outbrain|quora link preview|showyoubot|Tumblr|XING-contenttabreceiver|Mediapartners-Google|AhrefsBot|SemrushBot|Sogou|GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|anthropic-ai|PerplexityBot|Perplexity|cohere-ai|YouBot|Meta-ExternalAgent|Meta-ExternalFetcher|Diffbot|Bytespider|ia_archiver|CCBot|DataForSeoBot|PetalBot/i;

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

function renderHtml(seoBlock: string, bodyHtml?: string): string {
  let html = indexHtml.replace(SEO_BLOCK_RE, seoBlock);
  if (bodyHtml) {
    html = html.replace(ROOT_RE, `<div id="root">${bodyHtml}</div>`);
  }
  return html;
}

/** Strip HTML tags, collapse whitespace, and truncate for use in plain text. */
function stripHtml(html: string | null | undefined, maxLen = 0): string {
  if (!html) return "";
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return maxLen > 0 && text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

interface PostSummary {
  slug: string;
  title: string;
  excerpt?: string | null;
  publishedAt?: string | null;
  author?: string | null;
  category?: string | null;
}

/** Build a <ul> post list for crawler-facing listing pages. */
function renderPostList(posts: PostSummary[], siteUrl: string): string {
  if (!posts.length) return "<p>No posts yet.</p>";
  const items = posts
    .slice(0, 20)
    .map((p) => {
      const date = p.publishedAt
        ? new Date(p.publishedAt).toLocaleDateString("en-CA", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "";
      const meta = [p.author, date, p.category].filter(Boolean).join(" · ");
      const excerpt = p.excerpt ? `<p>${htmlEscape(stripHtml(p.excerpt, 160))}</p>` : "";
      return (
        `<li style="margin-bottom:1.5em">` +
        `<a href="${htmlEscape(`${siteUrl}/blog/${p.slug}`)}" style="font-size:1.1em;font-weight:600">${htmlEscape(p.title)}</a>` +
        (meta ? `<br><small>${htmlEscape(meta)}</small>` : "") +
        excerpt +
        `</li>`
      );
    })
    .join("\n");
  return `<ul style="list-style:none;padding:0">${items}</ul>`;
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

// Legacy cover compatibility: the cover/hero/author images were migrated from
// PNG to WebP. Any historical reference (old DB rows, cached HTML, external
// links, bookmarks) to the now-deleted .png files is permanently redirected to
// the .webp replacement so those images never 404.
const LEGACY_PNG_RE = /^\/(?:covers\/.+|images\/.+|author-matthew)\.png$/i;
app.get(LEGACY_PNG_RE, (req, res) => {
  res.redirect(301, req.path.replace(/\.png$/i, ".webp"));
});

// Serve static assets (CSS, JS, images, public/* files) from the Vite build.
// `single: false` so unmatched paths fall through to our route handlers
// instead of always returning index.html — we want SEO-aware routing first.
//
// Cache strategy:
//  - Vite-hashed assets under /assets/  -> immutable, 1 year (filename changes on rebuild)
//  - self-hosted fonts (/fonts/*.woff2) -> immutable, 1 year (stable filenames, swap if updated)
//  - images (png/jpg/webp/svg/ico/gif)  -> 1 week
//  - HTML (and everything else)         -> always revalidated
const ONE_YEAR = 60 * 60 * 24 * 365;
const ONE_WEEK = 60 * 60 * 24 * 7;
const IMAGE_RE = /\.(?:png|jpe?g|webp|gif|svg|ico|avif)$/i;
app.use(
  sirv(distDir, {
    single: false,
    dev: false,
    etag: true,
    setHeaders(res, pathname) {
      if (pathname.startsWith("/assets/") || pathname.endsWith(".woff2")) {
        res.setHeader("Cache-Control", `public, max-age=${ONE_YEAR}, immutable`);
      } else if (IMAGE_RE.test(pathname)) {
        res.setHeader("Cache-Control", `public, max-age=${ONE_WEEK}`);
      } else if (pathname.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }),
);

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

  // Render the full article body for crawlers that don't execute JavaScript.
  // The content field is HTML from the editor; we keep it as-is so AI crawlers
  // can read the full article text, but strip inline scripts for safety.
  const safeContent = (post.content ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const publishedDate = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
  const metaParts = [post.author, publishedDate, post.category].filter(Boolean);
  const tagsHtml =
    post.tags?.length
      ? `<p style="color:#666;font-size:.85em">Tags: ${post.tags.map(htmlEscape).join(", ")}</p>`
      : "";

  const articleBody = `
<article style="max-width:800px;margin:0 auto;font-family:system-ui,sans-serif;padding:1em">
  <h1>${htmlEscape(post.title)}</h1>
  ${metaParts.length ? `<p style="color:#666;font-size:.9em">${htmlEscape(metaParts.join(" · "))}</p>` : ""}
  ${safeContent}
  ${tagsHtml}
  <p><a href="${htmlEscape(`${SITE_URL}/blog/${post.slug}`)}">Read on Mapletechie</a></p>
</article>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  res.send(renderHtml(seoWithJsonLd, articleBody));
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

  const [categories, posts] = await Promise.all([
    fetchJson<CategoryRecord[]>(`${API_BASE}/api/categories`),
    fetchJson<PostSummary[]>(`${API_BASE}/api/posts?category=${encodeURIComponent(slug)}&limit=20`),
  ]);
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

  const body = `
<main style="max-width:800px;margin:0 auto;font-family:system-ui,sans-serif;padding:1em">
  <h1>${htmlEscape(cat.name)} — News &amp; Reviews</h1>
  <p>${htmlEscape(description)}</p>
  ${renderPostList(posts ?? [], SITE_URL)}
</main>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=600");
  res.send(renderHtml(seo, body));
});

// --- Static evergreen routes ------------------------------------------------
// These pages have fixed, well-known metadata AND a meaningful prerendered body
// so AI crawlers and non-JS bots see actual content, not just a React shell.

app.get(/^\/blog\/?$/, async (req, res, next) => {
  if (!isCrawler(req)) return next();
  const description =
    "The latest tech news, gadget reviews, AI coverage, and software deep dives from the Mapletechie team.";
  const seo = buildSeoBlock({
    title: "Blog — Tech News & Reviews | Mapletechie",
    description,
    image: DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/blog`,
    type: "website",
  });
  const posts = await fetchJson<PostSummary[]>(`${API_BASE}/api/posts?limit=20`);
  const body = `
<main style="max-width:800px;margin:0 auto;font-family:system-ui,sans-serif;padding:1em">
  <h1>Blog — Tech News &amp; Reviews</h1>
  <p>${htmlEscape(description)}</p>
  ${renderPostList(posts ?? [], SITE_URL)}
</main>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  res.send(renderHtml(seo, body));
});

app.get(/^\/about\/?$/, (req, res, next) => {
  if (!isCrawler(req)) return next();
  const description =
    "Mapletechie is an independent tech publication founded by Matthew Mbaka — covering AI, EVs, cybersecurity, and gadgets without the press-release filter.";
  const seo = buildSeoBlock({
    title: "About Mapletechie | Mapletechie",
    description,
    image: DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/about`,
    type: "website",
  });
  const body = `
<main style="max-width:800px;margin:0 auto;font-family:system-ui,sans-serif;padding:1em">
  <h1>About Mapletechie</h1>
  <p>${htmlEscape(description)}</p>
  <p>Mapletechie covers artificial intelligence, electric vehicles, cybersecurity, gadgets, and software — with opinionated, deeply reported journalism built on four principles: cover the story, not the press release; be clear about what we know and what we don't; explain the tech, not just the hype; and put readers first.</p>
  <p>Founded by Matthew Mbaka. Independent. Canadian.</p>
  <p><a href="${htmlEscape(SITE_URL)}">mapletechie.com</a></p>
</main>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.send(renderHtml(seo, body));
});

app.get(/^\/contact\/?$/, (req, res, next) => {
  if (!isCrawler(req)) return next();
  const description =
    "Get in touch with the Mapletechie team. Send us your tips, stories, or advertising inquiries.";
  const seo = buildSeoBlock({
    title: "Contact Us | Mapletechie",
    description,
    image: DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/contact`,
    type: "website",
  });
  const body = `
<main style="max-width:800px;margin:0 auto;font-family:system-ui,sans-serif;padding:1em">
  <h1>Contact Mapletechie</h1>
  <p>${htmlEscape(description)}</p>
  <ul>
    <li>Editorial tips &amp; story leads: <a href="mailto:tips@mapletechie.com">tips@mapletechie.com</a></li>
    <li>Advertising &amp; sponsorships: <a href="mailto:ads@mapletechie.com">ads@mapletechie.com</a></li>
  </ul>
  <p>You can also use the contact form at <a href="${htmlEscape(`${SITE_URL}/contact`)}">mapletechie.com/contact</a>.</p>
</main>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.send(renderHtml(seo, body));
});

app.get(/^\/advertise\/?$/, (req, res, next) => {
  if (!isCrawler(req)) return next();
  const description =
    "Sponsored posts and newsletter sponsorships on Mapletechie. Reach engaged tech readers through clearly labeled editorial partnerships.";
  const seo = buildSeoBlock({
    title: "Partner with Us | Mapletechie",
    description,
    image: DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/advertise`,
    type: "website",
  });
  const body = `
<main style="max-width:800px;margin:0 auto;font-family:system-ui,sans-serif;padding:1em">
  <h1>Partner with Mapletechie</h1>
  <p>${htmlEscape(description)}</p>
  <h2>Sponsorship options</h2>
  <ul>
    <li><strong>Sponsored posts</strong> — In-depth editorial content clearly labeled as sponsored.</li>
    <li><strong>Newsletter sponsorships</strong> — Reach our subscriber list with a featured mention in the weekly digest.</li>
  </ul>
  <p>To discuss rates and availability, contact <a href="mailto:ads@mapletechie.com">ads@mapletechie.com</a> or fill out the inquiry form at <a href="${htmlEscape(`${SITE_URL}/advertise`)}">mapletechie.com/advertise</a>.</p>
</main>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.send(renderHtml(seo, body));
});

app.get(/^\/privacy\/?$/, (req, res, next) => {
  if (!isCrawler(req)) return next();
  const description =
    "How Mapletechie collects, uses, and protects your information. Our privacy policy covers data, cookies, and your rights.";
  const seo = buildSeoBlock({
    title: "Privacy Policy | Mapletechie",
    description,
    image: DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/privacy`,
    type: "website",
  });
  const body = `
<main style="max-width:800px;margin:0 auto;font-family:system-ui,sans-serif;padding:1em">
  <h1>Privacy Policy</h1>
  <p>${htmlEscape(description)}</p>
  <p>Mapletechie collects minimal data to operate the site: analytics (page views, referrers), contact form submissions, and newsletter subscriptions. We use Google AdSense for advertising. We do not sell personal data. You may request deletion of your data by contacting <a href="mailto:tips@mapletechie.com">tips@mapletechie.com</a>.</p>
  <p>Full policy at <a href="${htmlEscape(`${SITE_URL}/privacy`)}">mapletechie.com/privacy</a>.</p>
</main>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
  res.send(renderHtml(seo, body));
});

app.get(/^\/terms\/?$/, (req, res, next) => {
  if (!isCrawler(req)) return next();
  const description =
    "The rules for using mapletechie.com — including intellectual property rights, affiliate link disclosures, and usage terms.";
  const seo = buildSeoBlock({
    title: "Terms of Service | Mapletechie",
    description,
    image: DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/terms`,
    type: "website",
  });
  const body = `
<main style="max-width:800px;margin:0 auto;font-family:system-ui,sans-serif;padding:1em">
  <h1>Terms of Service</h1>
  <p>${htmlEscape(description)}</p>
  <p>By using mapletechie.com you agree to these terms. All content on this site is owned by Mapletechie unless otherwise attributed. Some links may be affiliate links — we disclose this where applicable. Reproduction of articles requires written permission.</p>
  <p>Full terms at <a href="${htmlEscape(`${SITE_URL}/terms`)}">mapletechie.com/terms</a>.</p>
</main>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
  res.send(renderHtml(seo, body));
});

app.get(/^\/careers\/?$/, async (req, res, next) => {
  if (!isCrawler(req)) return next();
  const description =
    "Join Mapletechie. Help us build a tech publication readers actually trust. See our open roles and apply today.";
  const seo = buildSeoBlock({
    title: "Careers | Mapletechie",
    description,
    image: DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/careers`,
    type: "website",
  });
  const jobs = await fetchJson<JobRecord[]>(`${API_BASE}/api/jobs`);
  const jobsHtml = jobs?.length
    ? `<ul>${jobs.map((j) => {
        const meta = [j.location, j.type].filter(Boolean).join(" · ");
        return `<li><a href="${htmlEscape(`${SITE_URL}/careers/${j.slug}`)}">${htmlEscape(j.title)}</a>${meta ? ` — <small>${htmlEscape(meta)}</small>` : ""}</li>`;
      }).join("\n")}</ul>`
    : "<p>No open roles at this time. Check back soon.</p>";
  const body = `
<main style="max-width:800px;margin:0 auto;font-family:system-ui,sans-serif;padding:1em">
  <h1>Careers at Mapletechie</h1>
  <p>${htmlEscape(description)}</p>
  <h2>Open roles</h2>
  ${jobsHtml}
</main>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=600");
  res.send(renderHtml(seo, body));
});

// --- Dynamic listing/archive routes -----------------------------------------

interface JobRecord {
  slug: string;
  title: string;
  location: string | null;
  type: string | null;
  employmentType: string | null;
  compensation: string | null;
  summary: string | null;
  description: string | null;
  createdAt: string | null;
}

app.get(/^\/careers\/([^/]+)\/?$/, async (req, res, next) => {
  if (!isCrawler(req)) return next();
  const slug = req.params[0];
  if (!slug) return next();

  const job = await fetchJson<JobRecord>(`${API_BASE}/api/jobs/${encodeURIComponent(slug)}`);
  if (!job) return next();

  const locationStr = job.location ? ` · ${job.location}` : "";
  const description =
    stripHtml(job.description, 200) ||
    `${job.title}${locationStr} — Apply at Mapletechie.`;

  const safeJobDesc = (job.description ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const metaParts = [job.location, job.employmentType ?? job.type].filter(Boolean);

  const seo = buildSeoBlock({
    title: `${job.title}${locationStr} | Mapletechie Careers`,
    description,
    image: DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/careers/${job.slug}`,
    type: "website",
  });

  const jobPostingLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description ?? description,
    hiringOrganization: {
      "@type": "Organization",
      name: "Mapletechie",
      sameAs: "https://mapletechie.com",
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.location ?? "Remote",
      },
    },
    identifier: {
      "@type": "PropertyValue",
      name: "Mapletechie",
      value: job.slug,
    },
    url: `${SITE_URL}/careers/${job.slug}`,
  };
  if (job.employmentType ?? job.type) {
    jobPostingLd.employmentType = job.employmentType ?? job.type;
  }
  if (job.compensation) {
    jobPostingLd.baseSalary = {
      "@type": "MonetaryAmount",
      description: job.compensation,
    };
  }
  if (job.createdAt) {
    jobPostingLd.datePosted = job.createdAt.slice(0, 10);
  }

  const jsonLdSafe = JSON.stringify(jobPostingLd).replace(/</g, "\\u003c");
  const seoWithJsonLd = seo.replace(
    "<!-- SEO_HEAD_END -->",
    `    <script type="application/ld+json">${jsonLdSafe}</script>\n    <!-- SEO_HEAD_END -->`,
  );

  const body = `
<main style="max-width:800px;margin:0 auto;font-family:system-ui,sans-serif;padding:1em">
  <h1>${htmlEscape(job.title)}</h1>
  ${metaParts.length ? `<p style="color:#666">${htmlEscape(metaParts.join(" · "))}</p>` : ""}
  ${safeJobDesc}
  <p><a href="${htmlEscape(`${SITE_URL}/careers/${job.slug}`)}">Apply on Mapletechie</a></p>
</main>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=600");
  res.send(renderHtml(seoWithJsonLd, body));
});

interface AuthorRecord {
  id: number;
  username: string;
  displayName: string | null;
  bio: string | null;
}

app.get(/^\/author\/([^/]+)\/?$/, async (req, res, next) => {
  if (!isCrawler(req)) return next();
  const username = req.params[0];
  if (!username) return next();

  const author = await fetchJson<AuthorRecord>(
    `${API_BASE}/api/authors/by-username/${encodeURIComponent(username)}`,
  );
  if (!author) return next();

  const displayName = author.displayName || author.username;
  const description =
    author.bio?.trim() ||
    `Articles by ${displayName} on Mapletechie — tech news, reviews, and analysis.`;
  const ogImage = `${SITE_URL}/api/og/author/${encodeURIComponent(author.username)}.png`;

  const [seo, posts] = await Promise.all([
    Promise.resolve(buildSeoBlock({
      title: `${displayName} — Author | Mapletechie`,
      description,
      image: ogImage,
      url: `${SITE_URL}/author/${author.username}`,
      type: "website",
    })),
    fetchJson<PostSummary[]>(`${API_BASE}/api/authors/${author.id}/posts`),
  ]);

  const body = `
<main style="max-width:800px;margin:0 auto;font-family:system-ui,sans-serif;padding:1em">
  <h1>${htmlEscape(displayName)}</h1>
  ${author.bio ? `<p>${htmlEscape(author.bio)}</p>` : ""}
  <h2>Articles by ${htmlEscape(displayName)}</h2>
  ${renderPostList(posts ?? [], SITE_URL)}
</main>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=600");
  res.send(renderHtml(seo, body));
});

app.get(/^\/tag\/([^/]+)\/?$/, async (req, res, next) => {
  if (!isCrawler(req)) return next();
  const rawTag = req.params[0];
  if (!rawTag) return next();

  let tag: string;
  try {
    tag = decodeURIComponent(rawTag);
  } catch {
    tag = rawTag;
  }

  const ogImage = `${SITE_URL}/api/og/tag/${encodeURIComponent(tag)}.png`;
  const description = `Every Mapletechie story tagged "${tag}" — tech news, reviews, and analysis.`;

  const [seo, posts] = await Promise.all([
    Promise.resolve(buildSeoBlock({
      title: `#${tag} — Tag Archive | Mapletechie`,
      description,
      image: ogImage,
      url: `${SITE_URL}/tag/${encodeURIComponent(tag)}`,
      type: "website",
    })),
    fetchJson<PostSummary[]>(`${API_BASE}/api/tags/${encodeURIComponent(tag)}/posts`),
  ]);

  const body = `
<main style="max-width:800px;margin:0 auto;font-family:system-ui,sans-serif;padding:1em">
  <h1>#${htmlEscape(tag)}</h1>
  <p>${htmlEscape(description)}</p>
  ${renderPostList(posts ?? [], SITE_URL)}
</main>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=600");
  res.send(renderHtml(seo, body));
});

interface SeriesRecord {
  slug: string;
  title: string;
  description: string | null;
  coverImage: string | null;
}

app.get(/^\/series\/([^/]+)\/?$/, async (req, res, next) => {
  if (!isCrawler(req)) return next();
  const slug = req.params[0];
  if (!slug) return next();

  const data = await fetchJson<{ series: SeriesRecord; posts: PostSummary[] }>(
    `${API_BASE}/api/series/${encodeURIComponent(slug)}`,
  );
  if (!data?.series) return next();

  const s = data.series;
  const description =
    s.description?.trim() ||
    `A multi-part series on Mapletechie: ${s.title}.`;
  const ogImage = s.coverImage
    ? absUrl(s.coverImage, `${SITE_URL}/api/og/series/${encodeURIComponent(s.slug)}.png`)
    : `${SITE_URL}/api/og/series/${encodeURIComponent(s.slug)}.png`;

  const seo = buildSeoBlock({
    title: `${s.title} — Series | Mapletechie`,
    description,
    image: ogImage,
    url: `${SITE_URL}/series/${s.slug}`,
    type: "website",
  });
  const body = `
<main style="max-width:800px;margin:0 auto;font-family:system-ui,sans-serif;padding:1em">
  <h1>${htmlEscape(s.title)}</h1>
  ${s.description ? `<p>${htmlEscape(s.description)}</p>` : ""}
  <h2>Articles in this series</h2>
  ${renderPostList(data.posts ?? [], SITE_URL)}
</main>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=600");
  res.send(renderHtml(seo, body));
});

// /search is intentionally excluded from crawler prerendering — the client
// sets noindex and the content is always query-dependent. Return the default
// SPA shell with a noindex meta override to make intent explicit.
app.get(/^\/search\/?$/, (req, res, next) => {
  if (!isCrawler(req)) return next();
  const seo = buildSeoBlock({
    title: "Search | Mapletechie",
    description: "Search articles on Mapletechie.",
    image: DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/search`,
    type: "website",
  }).replace(
    "<!-- SEO_HEAD_END -->",
    `    <meta name="robots" content="noindex, follow" />\n    <!-- SEO_HEAD_END -->`,
  );
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "User-Agent");
  res.setHeader("Cache-Control", "no-store");
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
  /^\/(about|contact|advertise|search|privacy|terms)\/?$/,
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
