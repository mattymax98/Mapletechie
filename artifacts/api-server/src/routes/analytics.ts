import { Router } from "express";
import { db, pageViewsTable } from "@workspace/db";
import { sql, gte, and, isNotNull, desc } from "drizzle-orm";
import { adminAuth } from "../middlewares/adminAuth";
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
    });
  } catch (err) {
    logger.warn({ err }, "track failed");
  }
});

function rangeToDate(range?: string): Date {
  const now = Date.now();
  const days = range === "7d" ? 7 : range === "90d" ? 90 : range === "all" ? 3650 : 30;
  return new Date(now - days * 24 * 60 * 60 * 1000);
}

router.get("/admin/analytics/summary", adminAuth, async (req, res): Promise<void> => {
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

router.get("/admin/analytics/top-posts", adminAuth, async (req, res): Promise<void> => {
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

router.get("/admin/analytics/top-categories", adminAuth, async (req, res): Promise<void> => {
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

router.get("/admin/analytics/top-countries", adminAuth, async (req, res): Promise<void> => {
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

router.get("/admin/analytics/top-referrers", adminAuth, async (req, res): Promise<void> => {
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

export default router;
