import { Router } from "express";
import { db, pageViewsTable, postsTable, searchQueriesTable, linkClicksTable } from "@workspace/db";
import { sql, gte, and, isNotNull, desc, eq } from "drizzle-orm";
import { adminAuth, requireRole } from "../middlewares/adminAuth";
import { logger } from "../lib/logger";
import { extractIp, lookupCountry } from "../lib/geoip";

const router = Router();

// Strict input patterns — prevent metric pollution via spoofed payloads
const PATH_RE = /^\/[A-Za-z0-9/_\-.~%]{0,499}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,199}$/;
const CATEGORY_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;

function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function clampInt(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, Math.round(v)));
}

// Simple in-memory rate limit: 30 events / minute per IP
const RATE_BUCKETS = new Map<string, { count: number; reset: number }>();
function rateLimited(ip: string): boolean {
  if (!ip) return false;
  const now = Date.now();
  const bucket = RATE_BUCKETS.get(ip);
  if (!bucket || bucket.reset < now) {
    RATE_BUCKETS.set(ip, { count: 1, reset: now + 60_000 });
    if (RATE_BUCKETS.size > 10_000) {
      // GC oldest
      for (const [k, v] of RATE_BUCKETS) if (v.reset < now) RATE_BUCKETS.delete(k);
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > 30;
}

// Public tracking endpoint — fire-and-forget from the frontend
router.post("/track", async (req, res): Promise<void> => {
  res.status(204).end(); // respond immediately; do work after
  try {
    const body = req.body || {};
    const path = typeof body.path === "string" ? body.path.trim() : "";
    if (!path || !PATH_RE.test(path)) return;

    const rawSlug = cleanStr(body.postSlug, 200);
    const rawCat = cleanStr(body.category, 100);
    const rawSession = cleanStr(body.sessionId, 64);
    const rawReferrer = cleanStr(body.referrer, 500);

    const postSlug = rawSlug && SLUG_RE.test(rawSlug) ? rawSlug : null;
    const category = rawCat && CATEGORY_RE.test(rawCat) ? rawCat : null;
    const sessionId = rawSession && SESSION_RE.test(rawSession) ? rawSession : null;
    let referrer: string | null = null;
    if (rawReferrer) {
      try {
        const u = new URL(rawReferrer);
        if (u.protocol === "http:" || u.protocol === "https:") referrer = u.origin + u.pathname;
      } catch { /* invalid URL, drop */ }
    }

    const userAgent = String(req.headers["user-agent"] || "").slice(0, 500);
    if (!userAgent) return;
    // Skip obvious bots
    if (/bot|crawler|spider|preview|facebookexternalhit|whatsapp|slackbot|linkedin|curl|wget|python|httpclient/i.test(userAgent)) return;

    const ip = extractIp(req as any);
    if (rateLimited(ip)) return;

    // New optional engagement fields — all default to null for old clients
    const scrollDepth = clampInt(body.scrollDepth, 0, 100);
    const durationMs = clampInt(body.durationMs, 0, 2_147_000_000);
    const readingTimeSec = clampInt(body.readingTimeSec, 0, 32_000);
    const deviceType =
      typeof body.deviceType === "string" && ["mobile", "tablet", "desktop"].includes(body.deviceType)
        ? body.deviceType
        : null;
    const rawBrowser = cleanStr(body.browser, 40);
    const browser = rawBrowser && /^[A-Za-z0-9 .\-]{1,40}$/.test(rawBrowser) ? rawBrowser : null;
    const isReturning = typeof body.isReturning === "boolean" ? body.isReturning : null;

    // Reading-time beacon: sent on visibilitychange/beforeunload. Update the
    // most recent page view for this session+path instead of inserting a new
    // row (a second insert would double-count the view).
    if (body.readingBeacon === true) {
      if (!sessionId) return;
      await db.execute(sql`
        update page_views set
          reading_time_sec = coalesce(${readingTimeSec}, reading_time_sec),
          scroll_depth = greatest(coalesce(scroll_depth, 0), coalesce(${scrollDepth}, 0)),
          duration_ms = coalesce(${durationMs}, duration_ms)
        where id = (
          select id from page_views
          where session_id = ${sessionId} and path = ${path}
          order by created_at desc limit 1
        )
      `);
      return;
    }

    const cfCountry = req.headers["cf-ipcountry"] as string | undefined;
    const country = await lookupCountry(ip, cfCountry);

    await db.insert(pageViewsTable).values({
      path,
      postSlug,
      category,
      country: country.code,
      countryName: country.name,
      referrer,
      sessionId,
      userAgent,
      scrollDepth,
      durationMs,
      deviceType,
      browser,
      isReturning,
    });

    // Keep the public per-post counter in sync: every tracked (bot-filtered,
    // rate-limited) view of a post bumps posts.view_count, which is what the
    // article page displays.
    if (postSlug) {
      await db
        .update(postsTable)
        .set({ viewCount: sql`${postsTable.viewCount} + 1` })
        .where(eq(postsTable.slug, postSlug));
    }
  } catch (err) {
    logger.warn({ err }, "track failed");
  }
});

// Public event endpoint — social shares, outbound clicks, on-site searches.
// Same bot filtering + rate limiting as /track.
router.post("/track/event", async (req, res): Promise<void> => {
  res.status(204).end();
  try {
    const body = req.body || {};
    const type = body.type;
    if (type !== "social" && type !== "outbound" && type !== "search") return;

    const userAgent = String(req.headers["user-agent"] || "").slice(0, 500);
    if (!userAgent) return;
    if (/bot|crawler|spider|preview|facebookexternalhit|whatsapp|slackbot|linkedin|curl|wget|python|httpclient/i.test(userAgent)) return;

    const ip = extractIp(req as any);
    if (rateLimited(ip)) return;

    const rawPath = cleanStr(body.path, 500);
    const path = rawPath && PATH_RE.test(rawPath) ? rawPath : null;
    const rawSlug = cleanStr(body.postSlug, 200);
    const postSlug = rawSlug && SLUG_RE.test(rawSlug) ? rawSlug : null;
    const rawSession = cleanStr(body.sessionId, 64);
    const sessionId = rawSession && SESSION_RE.test(rawSession) ? rawSession : null;

    if (type === "search") {
      const query = cleanStr(body.query, 200);
      if (!query) return;
      await db.insert(searchQueriesTable).values({ query, path, sessionId });
      return;
    }

    // social | outbound → link_clicks; href must be a valid http(s) URL
    const rawHref = cleanStr(body.href, 1000);
    if (!rawHref) return;
    let href: string | null = null;
    try {
      const u = new URL(rawHref);
      if (u.protocol === "http:" || u.protocol === "https:") href = u.href.slice(0, 1000);
    } catch { /* invalid URL, drop */ }
    if (!href) return;

    await db.insert(linkClicksTable).values({ linkType: type, href, postSlug, sessionId });
  } catch (err) {
    logger.warn({ err }, "track event failed");
  }
});

function rangeToDate(range?: string): Date {
  const now = Date.now();
  const days = range === "7d" ? 7 : range === "90d" ? 90 : range === "all" ? 3650 : 30;
  return new Date(now - days * 24 * 60 * 60 * 1000);
}

router.get("/admin/analytics/summary", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const since = rangeToDate(req.query.range as string);

  const [totalViews] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(pageViewsTable)
    .where(gte(pageViewsTable.createdAt, since));

  const [uniqueSessions] = await db
    .select({ c: sql<number>`count(distinct ${pageViewsTable.sessionId})::int` })
    .from(pageViewsTable)
    .where(and(gte(pageViewsTable.createdAt, since), isNotNull(pageViewsTable.sessionId)));

  const [uniqueCountries] = await db
    .select({ c: sql<number>`count(distinct ${pageViewsTable.country})::int` })
    .from(pageViewsTable)
    .where(
      and(
        gte(pageViewsTable.createdAt, since),
        isNotNull(pageViewsTable.country),
        sql`${pageViewsTable.country} not in ('XX','ZZ')`,
      ),
    );

  // Daily series
  const daily = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${pageViewsTable.createdAt}), 'YYYY-MM-DD')`,
      views: sql<number>`count(*)::int`,
    })
    .from(pageViewsTable)
    .where(gte(pageViewsTable.createdAt, since))
    .groupBy(sql`date_trunc('day', ${pageViewsTable.createdAt})`)
    .orderBy(sql`date_trunc('day', ${pageViewsTable.createdAt})`);

  res.json({
    totalViews: totalViews?.c || 0,
    uniqueSessions: uniqueSessions?.c || 0,
    uniqueCountries: uniqueCountries?.c || 0,
    daily,
  });
});

router.get("/admin/analytics/top-posts", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const since = rangeToDate(req.query.range as string);
  const rows = await db
    .select({
      slug: pageViewsTable.postSlug,
      views: sql<number>`count(*)::int`,
    })
    .from(pageViewsTable)
    .where(and(gte(pageViewsTable.createdAt, since), isNotNull(pageViewsTable.postSlug)))
    .groupBy(pageViewsTable.postSlug)
    .orderBy(desc(sql`count(*)`))
    .limit(15);
  res.json(rows);
});

/**
 * Per-post view counts for all posts published in the selected range.
 * Uses a LEFT JOIN so posts with zero tracked views are still included.
 * Ordered by views ASC — lowest first — for the "underperforming" panel.
 */
router.get("/admin/analytics/post-views", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const since = rangeToDate(req.query.range as string);
  const rows = await db
    .select({
      slug: postsTable.slug,
      title: postsTable.title,
      publishedAt: postsTable.publishedAt,
      views: sql<number>`coalesce(count(${pageViewsTable.id})::int, 0)`,
    })
    .from(postsTable)
    .leftJoin(
      pageViewsTable,
      and(
        eq(pageViewsTable.postSlug, postsTable.slug),
        gte(pageViewsTable.createdAt, since),
      ),
    )
    .where(
      and(
        eq(postsTable.status, "published"),
        isNotNull(postsTable.publishedAt),
        gte(postsTable.publishedAt, since),
      ),
    )
    .groupBy(postsTable.id)
    .orderBy(sql`coalesce(count(${pageViewsTable.id})::int, 0) asc`);
  res.json(rows);
});

router.get("/admin/analytics/top-categories", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const since = rangeToDate(req.query.range as string);
  const rows = await db
    .select({
      category: pageViewsTable.category,
      views: sql<number>`count(*)::int`,
    })
    .from(pageViewsTable)
    .where(and(gte(pageViewsTable.createdAt, since), isNotNull(pageViewsTable.category)))
    .groupBy(pageViewsTable.category)
    .orderBy(desc(sql`count(*)`))
    .limit(15);
  res.json(rows);
});

router.get("/admin/analytics/top-countries", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const since = rangeToDate(req.query.range as string);
  const rows = await db
    .select({
      code: pageViewsTable.country,
      name: pageViewsTable.countryName,
      views: sql<number>`count(*)::int`,
    })
    .from(pageViewsTable)
    .where(and(gte(pageViewsTable.createdAt, since), isNotNull(pageViewsTable.country)))
    .groupBy(pageViewsTable.country, pageViewsTable.countryName)
    .orderBy(desc(sql`count(*)`))
    .limit(20);
  res.json(rows);
});

router.get("/admin/analytics/top-referrers", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const since = rangeToDate(req.query.range as string);
  const rows = await db
    .select({
      source: sql<string>`coalesce(nullif(${pageViewsTable.referrer}, ''), 'Direct')`,
      views: sql<number>`count(*)::int`,
    })
    .from(pageViewsTable)
    .where(gte(pageViewsTable.createdAt, since))
    .groupBy(sql`coalesce(nullif(${pageViewsTable.referrer}, ''), 'Direct')`)
    .orderBy(desc(sql`count(*)`))
    .limit(10);
  res.json(rows);
});

/**
 * Per-post analytics for the authenticated user's own posts only.
 * Available to all authenticated admin users (editors included) — no requireRole guard.
 */
router.get("/admin/analytics/my-post-views", adminAuth, async (req, res): Promise<void> => {
  const since = rangeToDate(req.query.range as string);
  const authorId = (req as any).user?.id;
  if (!authorId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db
    .select({
      slug: postsTable.slug,
      title: postsTable.title,
      publishedAt: postsTable.publishedAt,
      views: sql<number>`coalesce(count(${pageViewsTable.id})::int, 0)`,
    })
    .from(postsTable)
    .leftJoin(
      pageViewsTable,
      and(
        eq(pageViewsTable.postSlug, postsTable.slug),
        gte(pageViewsTable.createdAt, since),
      ),
    )
    .where(
      and(
        eq(postsTable.status, "published"),
        isNotNull(postsTable.publishedAt),
        eq(postsTable.authorId, authorId),
      ),
    )
    .groupBy(postsTable.id)
    .orderBy(desc(sql`coalesce(count(${pageViewsTable.id})::int, 0)`));
  res.json(rows);
});

/**
 * CSV export of post-views data. Admin only.
 * GET /api/admin/analytics/export.csv?range=7d|30d|90d|all
 */
router.get("/admin/analytics/export.csv", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const range = (req.query.range as string) || "30d";
  const since = rangeToDate(range);
  const rows = await db
    .select({
      slug: postsTable.slug,
      title: postsTable.title,
      publishedAt: postsTable.publishedAt,
      views: sql<number>`coalesce(count(${pageViewsTable.id})::int, 0)`,
    })
    .from(postsTable)
    .leftJoin(
      pageViewsTable,
      and(
        eq(pageViewsTable.postSlug, postsTable.slug),
        gte(pageViewsTable.createdAt, since),
      ),
    )
    .where(
      and(
        eq(postsTable.status, "published"),
        isNotNull(postsTable.publishedAt),
      ),
    )
    .groupBy(postsTable.id)
    .orderBy(desc(sql`coalesce(count(${pageViewsTable.id})::int, 0)`));

  const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines: string[] = ["Title,Slug,Views,Published Date"];
  for (const r of rows) {
    const pub = r.publishedAt ? new Date(r.publishedAt).toISOString().slice(0, 10) : "";
    lines.push([escape(r.title ?? ""), escape(r.slug ?? ""), String(r.views), escape(pub)].join(","));
  }
  const csv = lines.join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="analytics-${range}.csv"`);
  res.send(csv);
});

// ---------------------------------------------------------------------------
// Engagement analytics endpoints (admin only)
// ---------------------------------------------------------------------------

/** View counts grouped by hour-of-day — always returns 24 buckets. */
router.get("/admin/analytics/hourly", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const since = rangeToDate(req.query.range as string);
  const rows = await db
    .select({
      hour: sql<number>`extract(hour from ${pageViewsTable.createdAt})::int`,
      views: sql<number>`count(*)::int`,
    })
    .from(pageViewsTable)
    .where(gte(pageViewsTable.createdAt, since))
    .groupBy(sql`extract(hour from ${pageViewsTable.createdAt})`)
    .orderBy(sql`extract(hour from ${pageViewsTable.createdAt})`);

  const byHour = new Map(rows.map((r) => [r.hour, r.views]));
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, views: byHour.get(hour) || 0 }));
  res.json(buckets);
});

/** Counts by device type and by browser family. */
router.get("/admin/analytics/device-breakdown", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const since = rangeToDate(req.query.range as string);
  const devices = await db
    .select({
      deviceType: pageViewsTable.deviceType,
      views: sql<number>`count(*)::int`,
    })
    .from(pageViewsTable)
    .where(and(gte(pageViewsTable.createdAt, since), isNotNull(pageViewsTable.deviceType)))
    .groupBy(pageViewsTable.deviceType)
    .orderBy(desc(sql`count(*)`));

  const browsers = await db
    .select({
      browser: pageViewsTable.browser,
      views: sql<number>`count(*)::int`,
    })
    .from(pageViewsTable)
    .where(and(gte(pageViewsTable.createdAt, since), isNotNull(pageViewsTable.browser)))
    .groupBy(pageViewsTable.browser)
    .orderBy(desc(sql`count(*)`))
    .limit(15);

  res.json({ devices, browsers });
});

/** New vs. returning: distinct sessions with is_returning false vs true. */
router.get("/admin/analytics/new-vs-returning", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const since = rangeToDate(req.query.range as string);
  const [row] = await db
    .select({
      newSessions: sql<number>`count(distinct ${pageViewsTable.sessionId}) filter (where ${pageViewsTable.isReturning} = false)::int`,
      returningSessions: sql<number>`count(distinct ${pageViewsTable.sessionId}) filter (where ${pageViewsTable.isReturning} = true)::int`,
    })
    .from(pageViewsTable)
    .where(and(gte(pageViewsTable.createdAt, since), isNotNull(pageViewsTable.sessionId)));

  res.json({ newSessions: row?.newSessions || 0, returningSessions: row?.returningSessions || 0 });
});

/** Per-post average actual vs. estimated reading time (word count / 200 wpm). */
router.get("/admin/analytics/reading-time", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const since = rangeToDate(req.query.range as string);
  const rows = await db
    .select({
      slug: postsTable.slug,
      title: postsTable.title,
      avgReadingTimeSec: sql<number>`round(avg(${pageViewsTable.readingTimeSec}))::int`,
      estimatedReadingTimeSec: sql<number>`round(array_length(regexp_split_to_array(${postsTable.content}, '\\s+'), 1) / 200.0 * 60)::int`,
      samples: sql<number>`count(${pageViewsTable.readingTimeSec})::int`,
    })
    .from(postsTable)
    .innerJoin(
      pageViewsTable,
      and(
        eq(pageViewsTable.postSlug, postsTable.slug),
        gte(pageViewsTable.createdAt, since),
        isNotNull(pageViewsTable.readingTimeSec),
      ),
    )
    .where(eq(postsTable.status, "published"))
    .groupBy(postsTable.id)
    .orderBy(desc(sql`count(${pageViewsTable.readingTimeSec})`))
    .limit(30);
  res.json(rows);
});

/** Top social share targets and top outbound domains. */
router.get("/admin/analytics/link-clicks", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const since = rangeToDate(req.query.range as string);
  const social = await db
    .select({
      href: linkClicksTable.href,
      clicks: sql<number>`count(*)::int`,
    })
    .from(linkClicksTable)
    .where(and(gte(linkClicksTable.createdAt, since), eq(linkClicksTable.linkType, "social")))
    .groupBy(linkClicksTable.href)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const outbound = await db
    .select({
      domain: sql<string>`substring(${linkClicksTable.href} from '^https?://([^/]+)')`,
      clicks: sql<number>`count(*)::int`,
    })
    .from(linkClicksTable)
    .where(and(gte(linkClicksTable.createdAt, since), eq(linkClicksTable.linkType, "outbound")))
    .groupBy(sql`substring(${linkClicksTable.href} from '^https?://([^/]+)')`)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  res.json({ social, outbound });
});

/** Top on-site search terms with counts. */
router.get("/admin/analytics/search-queries", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const since = rangeToDate(req.query.range as string);
  const rows = await db
    .select({
      query: sql<string>`lower(${searchQueriesTable.query})`,
      count: sql<number>`count(*)::int`,
    })
    .from(searchQueriesTable)
    .where(gte(searchQueriesTable.createdAt, since))
    .groupBy(sql`lower(${searchQueriesTable.query})`)
    .orderBy(desc(sql`count(*)`))
    .limit(25);
  res.json(rows);
});

/** Per-post drilldown: daily views, top referrers, top countries, engagement averages. */
router.get("/admin/analytics/post-detail/:slug", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const slug = String(req.params.slug || "");
  if (!SLUG_RE.test(slug)) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const [post] = await db
    .select({ slug: postsTable.slug, title: postsTable.title, publishedAt: postsTable.publishedAt })
    .from(postsTable)
    .where(eq(postsTable.slug, slug))
    .limit(1);
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const since = rangeToDate(req.query.range as string);
  const scope = and(eq(pageViewsTable.postSlug, slug), gte(pageViewsTable.createdAt, since));

  const daily = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${pageViewsTable.createdAt}), 'YYYY-MM-DD')`,
      views: sql<number>`count(*)::int`,
    })
    .from(pageViewsTable)
    .where(scope)
    .groupBy(sql`date_trunc('day', ${pageViewsTable.createdAt})`)
    .orderBy(sql`date_trunc('day', ${pageViewsTable.createdAt})`);

  const topReferrers = await db
    .select({
      source: sql<string>`coalesce(nullif(${pageViewsTable.referrer}, ''), 'Direct')`,
      views: sql<number>`count(*)::int`,
    })
    .from(pageViewsTable)
    .where(scope)
    .groupBy(sql`coalesce(nullif(${pageViewsTable.referrer}, ''), 'Direct')`)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const topCountries = await db
    .select({
      code: pageViewsTable.country,
      name: pageViewsTable.countryName,
      views: sql<number>`count(*)::int`,
    })
    .from(pageViewsTable)
    .where(and(scope, isNotNull(pageViewsTable.country)))
    .groupBy(pageViewsTable.country, pageViewsTable.countryName)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const [averages] = await db
    .select({
      avgScrollDepth: sql<number | null>`round(avg(${pageViewsTable.scrollDepth}))::int`,
      avgReadingTimeSec: sql<number | null>`round(avg(${pageViewsTable.readingTimeSec}))::int`,
      totalViews: sql<number>`count(*)::int`,
    })
    .from(pageViewsTable)
    .where(scope);

  res.json({
    post,
    daily,
    topReferrers,
    topCountries,
    avgScrollDepth: averages?.avgScrollDepth ?? null,
    avgReadingTimeSec: averages?.avgReadingTimeSec ?? null,
    totalViews: averages?.totalViews || 0,
  });
});

export default router;
