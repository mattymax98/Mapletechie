import { AdminShell } from "@/components/admin/AdminShell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useListAdminPosts } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Eye,
  Globe,
  Users,
  RefreshCw,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Download,
  SlidersHorizontal,
  Percent,
  AlertTriangle,
  Plus,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { format, parseISO } from "date-fns";
import ErrorBanner from "@/components/ErrorBanner";
import { useAdmin } from "@/context/AdminContext";
import {
  WIDGET_REGISTRY,
  type WidgetId,
  type WidgetVisibility,
  loadWidgetVisibility,
  saveWidgetVisibility,
} from "@/lib/analyticsWidgets";
import { exportAnalyticsCsv } from "@/lib/exportAnalyticsCsv";
import {
  Panel,
  EmptyState,
  PanelSkeleton,
  TOOLTIP_STYLE,
  formatSeconds,
} from "@/components/admin/analytics/shared";
import { WidgetCustomiser } from "@/components/admin/analytics/WidgetCustomiser";
import { HourlyHeatmap, type HourBucket } from "@/components/admin/analytics/HourlyHeatmap";
import {
  DeviceBreakdown,
  type DeviceBreakdownData,
} from "@/components/admin/analytics/DeviceBreakdown";
import {
  NewVsReturning,
  type NewVsReturningData,
} from "@/components/admin/analytics/NewVsReturning";
import {
  SearchQueriesTable,
  type SearchQueryRow,
} from "@/components/admin/analytics/SearchQueriesTable";
import {
  LinkClicksPanel,
  type LinkClicksData,
} from "@/components/admin/analytics/LinkClicksPanel";
import {
  ReadingTimeChart,
  type ReadingTimeRow,
  isDropOffRisk,
} from "@/components/admin/analytics/ReadingTimeChart";
import { PostDetailPanel } from "@/components/admin/analytics/PostDetailPanel";

const TOKEN_KEY = "mapletechie_admin_token";

interface Summary {
  totalViews: number;
  uniqueSessions: number;
  uniqueCountries: number;
  bounceRate?: number | null;
  daily: { day: string; views: number }[];
}
interface PostRow {
  slug: string;
  views: number;
}
interface PostViewRow {
  slug: string;
  title: string;
  publishedAt: string | null;
  views: number;
}
interface RowKV {
  label: string;
  value: number;
}
interface CountryRow {
  code: string;
  label: string;
  value: number;
}

const RANGES = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "all", label: "All time" },
];

/** Convert ISO 3166-1 alpha-2 code → regional indicator emoji flag */
function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  const A = 65;
  const u = code.toUpperCase();
  try {
    return String.fromCodePoint(
      0x1f1e6 + u.charCodeAt(0) - A,
      0x1f1e6 + u.charCodeAt(1) - A,
    );
  } catch {
    return "";
  }
}

function ChangeBadge({
  current,
  prior,
  invert,
}: {
  current: number;
  prior: number | null;
  /** For metrics where a decrease is good (e.g. bounce rate). */
  invert?: boolean;
}) {
  if (prior === null) return null;
  if (prior === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-zinc-500 bg-zinc-800/70 rounded px-1.5 py-0.5">
        new
      </span>
    );
  const pct = Math.round(((current - prior) / prior) * 100);
  const positive = invert ? pct < 0 : pct > 0;
  const negative = invert ? pct > 0 : pct < 0;
  if (pct !== 0 && positive)
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5 font-semibold">
        {pct > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {pct > 0 ? "+" : ""}
        {pct}%
      </span>
    );
  if (pct !== 0 && negative)
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5 font-semibold">
        {pct > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {pct > 0 ? "+" : ""}
        {pct}%
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-zinc-500 bg-zinc-800/70 rounded px-1.5 py-0.5">
      <Minus className="w-3 h-3" />0%
    </span>
  );
}

export default function AdminAnalytics() {
  const [range, setRange] = useState("30d");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [priorViews, setPriorViews] = useState<number | null>(null);
  const [topPostRows, setTopPostRows] = useState<PostRow[] | null>(null);
  const [postViewsInRange, setPostViewsInRange] = useState<PostViewRow[] | null>(null);
  const [myPostViews, setMyPostViews] = useState<PostViewRow[] | null>(null);
  const [topCategories, setTopCategories] = useState<RowKV[] | null>(null);
  const [topCountries, setTopCountries] = useState<CountryRow[] | null>(null);
  const [topReferrers, setTopReferrers] = useState<RowKV[] | null>(null);
  const [hourly, setHourly] = useState<HourBucket[] | null>(null);
  const [deviceData, setDeviceData] = useState<DeviceBreakdownData | null>(null);
  const [newVsReturning, setNewVsReturning] = useState<NewVsReturningData | null>(null);
  const [readingTime, setReadingTime] = useState<ReadingTimeRow[] | null>(null);
  const [searchQueries, setSearchQueries] = useState<SearchQueryRow[] | null>(null);
  const [linkClicks, setLinkClicks] = useState<LinkClicksData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [customising, setCustomising] = useState(false);
  const [detailSlug, setDetailSlug] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<WidgetVisibility>(() =>
    loadWidgetVisibility(),
  );

  const { user, token: ctxToken } = useAdmin();
  const isAdmin = user?.role === "admin";

  const { data: allPosts } = useListAdminPosts();
  const token =
    ctxToken ??
    (typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null);

  const updateVisibility = useCallback((v: WidgetVisibility) => {
    setVisibility(v);
    saveWidgetVisibility(v);
  }, []);

  const show = useCallback((id: WidgetId) => visibility[id], [visibility]);

  /** slug → { title, category, publishedAt } */
  const postMeta = useMemo(() => {
    const map = new Map<
      string,
      { title: string; category: string; publishedAt: string | null }
    >();
    for (const p of (allPosts as any[]) ?? []) {
      map.set(p.slug, {
        title: p.title,
        category: p.category,
        publishedAt: p.publishedAt,
      });
    }
    return map;
  }, [allPosts]);

  /** slug → reading-time row, for the Top Posts table + drilldown risk flag */
  const readingBySlug = useMemo(() => {
    const map = new Map<string, ReadingTimeRow>();
    for (const r of readingTime ?? []) map.set(r.slug, r);
    return map;
  }, [readingTime]);

  const underperforming = useMemo(() => {
    if (!postViewsInRange) return null;
    return postViewsInRange.slice(0, 10);
  }, [postViewsInRange]);

  async function load() {
    setLoading(true);
    setError(null);
    setPriorViews(null);
    try {
      const headers: HeadersInit = token
        ? { Authorization: `Bearer ${token}` }
        : {};
      const fetchJson = async (url: string) => {
        const res = await fetch(url, { headers });
        if (res.status === 401 || res.status === 403) throw new Error("auth");
        if (!res.ok) throw new Error("err");
        return res.json();
      };
      const maybe = <T,>(visible: boolean, url: string): Promise<T | null> =>
        visible ? fetchJson(url) : Promise.resolve(null);

      // Always fetch my-post-views (available to all authenticated users)
      const myPostsPromise = fetchJson(
        `/api/admin/analytics/my-post-views?range=${range}`,
      );

      if (isAdmin) {
        // Fetch a wider range to derive prior-period comparison
        const expandedRange =
          range === "7d" ? "30d" : range === "30d" ? "90d" : null;
        const needSummary =
          visibility.summary || visibility.traffic || visibility.topPosts;
        const needReadingTime = visibility.readingTime || visibility.topPosts;
        const [
          s,
          posts,
          pvRows,
          cats,
          countries,
          refs,
          expandedS,
          myRows,
          hourlyRows,
          devices,
          nvr,
          reading,
          queries,
          clicks,
        ] = await Promise.all([
          maybe<Summary>(needSummary, `/api/admin/analytics/summary?range=${range}`),
          maybe<any[]>(visibility.topPosts, `/api/admin/analytics/top-posts?range=${range}`),
          maybe<any[]>(
            visibility.needsAttention,
            `/api/admin/analytics/post-views?range=${range}`,
          ),
          maybe<any[]>(
            visibility.categories,
            `/api/admin/analytics/top-categories?range=${range}`,
          ),
          maybe<any[]>(
            visibility.countries,
            `/api/admin/analytics/top-countries?range=${range}`,
          ),
          maybe<any[]>(
            visibility.sources,
            `/api/admin/analytics/top-referrers?range=${range}`,
          ),
          visibility.summary && expandedRange
            ? fetchJson(`/api/admin/analytics/summary?range=${expandedRange}`)
            : Promise.resolve(null),
          myPostsPromise,
          maybe<HourBucket[]>(visibility.hourly, `/api/admin/analytics/hourly?range=${range}`),
          maybe<DeviceBreakdownData>(
            visibility.devices,
            `/api/admin/analytics/device-breakdown?range=${range}`,
          ),
          maybe<NewVsReturningData>(
            visibility.newVsReturning,
            `/api/admin/analytics/new-vs-returning?range=${range}`,
          ),
          maybe<ReadingTimeRow[]>(
            needReadingTime,
            `/api/admin/analytics/reading-time?range=${range}`,
          ),
          maybe<SearchQueryRow[]>(
            visibility.searchQueries,
            `/api/admin/analytics/search-queries?range=${range}`,
          ),
          maybe<LinkClicksData>(
            visibility.linkClicks,
            `/api/admin/analytics/link-clicks?range=${range}`,
          ),
        ]);

        if (s) setSummary(s);
        if (posts)
          setTopPostRows(posts.map((p: any) => ({ slug: p.slug, views: p.views })));
        if (pvRows)
          setPostViewsInRange(
            Array.isArray(pvRows)
              ? pvRows.map((r: any) => ({
                  slug: r.slug,
                  title: r.title,
                  publishedAt: r.publishedAt ?? null,
                  views: r.views ?? 0,
                }))
              : null,
          );
        if (cats)
          setTopCategories(
            cats.map((c: any) => ({ label: c.category, value: c.views })),
          );
        if (countries)
          setTopCountries(
            countries.map((c: any) => ({
              code: c.code ?? "",
              label: c.name || c.code || "Unknown",
              value: c.views,
            })),
          );
        if (refs)
          setTopReferrers(refs.map((r: any) => ({ label: r.source, value: r.views })));
        if (hourlyRows) setHourly(hourlyRows);
        if (devices) setDeviceData(devices);
        if (nvr) setNewVsReturning(nvr);
        if (reading) setReadingTime(reading);
        if (queries) setSearchQueries(queries);
        if (clicks) setLinkClicks(clicks);

        // Extract prior-period views from the expanded daily series
        if (expandedS && expandedRange) {
          const currentDays = range === "7d" ? 7 : 30;
          const priorEnd = new Date(Date.now() - currentDays * 24 * 60 * 60 * 1000);
          const priorStart = new Date(
            Date.now() - currentDays * 2 * 24 * 60 * 60 * 1000,
          );
          const prior = (expandedS.daily as { day: string; views: number }[])
            .filter((d) => {
              const dt = new Date(d.day);
              return dt >= priorStart && dt < priorEnd;
            })
            .reduce((sum, d) => sum + d.views, 0);
          setPriorViews(prior);
        }
        setMyPostViews(
          Array.isArray(myRows)
            ? myRows.map((r: any) => ({
                slug: r.slug,
                title: r.title,
                publishedAt: r.publishedAt ?? null,
                views: r.views ?? 0,
              }))
            : null,
        );
      } else {
        // Editor: only fetch their own post views
        const myRows = await myPostsPromise;
        setMyPostViews(
          Array.isArray(myRows)
            ? myRows.map((r: any) => ({
                slug: r.slug,
                title: r.title,
                publishedAt: r.publishedAt ?? null,
                views: r.views ?? 0,
              }))
            : null,
        );
      }
    } catch (e: any) {
      setError(
        e.message === "auth"
          ? "You don't have access to analytics."
          : "Couldn't load analytics. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  // Which widgets have data loaded — refetch when a hidden widget is re-enabled.
  const visibleKey = WIDGET_REGISTRY.filter((w) => visibility[w.id])
    .map((w) => w.id)
    .join(",");
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, isAdmin, visibleKey]);

  const chartData = useMemo(
    () =>
      (summary?.daily ?? []).map((d) => ({
        ...d,
        label: format(parseISO(d.day), "MMM d"),
      })),
    [summary],
  );

  const totalViews = summary?.totalViews ?? 0;
  const bounceRate = summary?.bounceRate ?? null;

  const [exporting, setExporting] = useState(false);

  /**
   * Export always fetches a complete, same-range dataset on demand, so the
   * CSV never mixes stale data from hidden widgets or a previous range.
   */
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const headers: HeadersInit = token
        ? { Authorization: `Bearer ${token}` }
        : {};
      const fetchJson = async (url: string) => {
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error("err");
        return res.json();
      };
      const [s, posts, refs, countries, queries] = await Promise.all([
        fetchJson(`/api/admin/analytics/summary?range=${range}`),
        fetchJson(`/api/admin/analytics/top-posts?range=${range}`),
        fetchJson(`/api/admin/analytics/top-referrers?range=${range}`),
        fetchJson(`/api/admin/analytics/top-countries?range=${range}`),
        fetchJson(`/api/admin/analytics/search-queries?range=${range}`),
      ]);
      exportAnalyticsCsv(
        {
          daily: (s?.daily as { day: string; views: number }[]) ?? [],
          topPosts: ((posts as any[]) ?? []).map((p) => ({
            title: postMeta.get(p.slug)?.title ?? p.slug,
            slug: p.slug,
            views: p.views,
          })),
          topSources: ((refs as any[]) ?? []).map((r) => ({
            label: r.source,
            value: r.views,
          })),
          topCountries: ((countries as any[]) ?? []).map((c) => ({
            code: c.code ?? "",
            label: c.name || c.code || "Unknown",
            value: c.views,
          })),
          searchQueries: ((queries as any[]) ?? []).map((q) => ({
            query: q.query,
            count: q.count,
          })),
        },
        range,
      );
    } catch {
      setError("Couldn't export analytics. Try again.");
    } finally {
      setExporting(false);
    }
  };

  const hiddenWidgets = WIDGET_REGISTRY.filter((w) => !visibility[w.id]);

  return (
    <AdminShell
      title="Analytics"
      actions={
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleExport()}
                disabled={exporting}
                className="text-zinc-400 hover:text-white gap-1.5"
                title="Export CSV"
              >
                <Download className={`w-4 h-4 ${exporting ? "animate-pulse" : ""}`} />
                <span className="hidden sm:inline text-xs">
                  {exporting ? "Exporting…" : "Export CSV"}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCustomising((v) => !v)}
                aria-pressed={customising}
                className={`gap-1.5 ${
                  customising
                    ? "text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 hover:text-orange-300"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="Customise widgets"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">Customise widgets</span>
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="text-zinc-400 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      }
    >
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Range selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-4 py-2 text-xs font-semibold transition-colors ${
                  range === r.id
                    ? "bg-orange-500 text-black"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-zinc-700">
            All data is bot-filtered at collection time.
          </span>
        </div>

        <ErrorBanner message={error} />

        {isAdmin && customising && (
          <WidgetCustomiser visibility={visibility} onChange={updateVisibility} />
        )}

        {/* Hidden-widget chips */}
        {isAdmin && hiddenWidgets.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-zinc-600 mr-1">Hidden:</span>
            {hiddenWidgets.map((w) => (
              <button
                key={w.id}
                onClick={() => updateVisibility({ ...visibility, [w.id]: true })}
                className="inline-flex items-center gap-1 text-[11px] text-zinc-400 bg-zinc-900 border border-zinc-800 hover:border-orange-500/50 hover:text-orange-400 rounded-full px-2.5 py-1 transition-colors"
                title={`Show ${w.label}`}
              >
                <Plus className="w-3 h-3" />
                {w.label}
              </button>
            ))}
          </div>
        )}

        {/* Admin-only: full site analytics */}
        {isAdmin && (
          <>
            {/* Summary stat cards */}
            {show("summary") && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  icon={<Eye className="w-5 h-5" />}
                  label="Page views"
                  value={totalViews === 0 && summary ? undefined : summary?.totalViews}
                  displayDash={summary !== null && totalViews === 0}
                  color="text-orange-500"
                  loading={loading}
                  extra={
                    summary && priorViews !== null && totalViews > 0 ? (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <ChangeBadge current={totalViews} prior={priorViews} />
                        <span className="text-[11px] text-zinc-600">
                          vs prior {range === "7d" ? "7 days" : "30 days"}
                        </span>
                      </div>
                    ) : undefined
                  }
                />
                <StatCard
                  icon={<Users className="w-5 h-5" />}
                  label="Unique visitors"
                  value={
                    summary?.uniqueSessions === 0 && summary
                      ? undefined
                      : summary?.uniqueSessions
                  }
                  displayDash={summary !== null && (summary?.uniqueSessions ?? 0) === 0}
                  color="text-emerald-500"
                  loading={loading}
                />
                <StatCard
                  icon={<Globe className="w-5 h-5" />}
                  label="Countries"
                  value={
                    summary?.uniqueCountries === 0 && summary
                      ? undefined
                      : summary?.uniqueCountries
                  }
                  displayDash={summary !== null && (summary?.uniqueCountries ?? 0) === 0}
                  color="text-blue-400"
                  loading={loading}
                />
                <StatCard
                  icon={<Percent className="w-5 h-5" />}
                  label="Bounce rate"
                  value={undefined}
                  displayText={
                    bounceRate != null ? `${Math.round(bounceRate)}%` : undefined
                  }
                  displayDash={bounceRate == null}
                  color="text-purple-400"
                  loading={loading}
                />
              </div>
            )}

            {/* Daily traffic chart */}
            {show("traffic") && (
              <Panel
                title="Traffic over time"
                subtitle="Daily page views in the selected period"
                action={
                  <span className="text-xs text-zinc-700">{chartData.length} days</span>
                }
              >
                <div className="h-52">
                  {loading && !summary ? (
                    <PanelSkeleton rows={5} />
                  ) : chartData.length === 0 || totalViews === 0 ? (
                    <EmptyState />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="analyticsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis
                          dataKey="label"
                          stroke="#71717a"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="#71717a"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip {...TOOLTIP_STYLE} />
                        <Area
                          type="monotone"
                          dataKey="views"
                          stroke="#f97316"
                          strokeWidth={2}
                          fill="url(#analyticsGrad)"
                          dot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Panel>
            )}

            {/* Hourly heatmap — full width */}
            {show("hourly") && <HourlyHeatmap data={hourly} loading={loading} />}

            {/* Two-column grid of panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {show("devices") && (
                <DeviceBreakdown data={deviceData} loading={loading} />
              )}
              {show("newVsReturning") && (
                <NewVsReturning data={newVsReturning} loading={loading} />
              )}

              {/* Top posts */}
              {show("topPosts") && (
                <Panel title="Top posts" subtitle="By views in selected period">
                  {loading && !topPostRows ? (
                    <PanelSkeleton rows={6} />
                  ) : topPostRows && topPostRows.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-zinc-600 border-b border-zinc-800">
                            <th className="pb-2 pr-3 font-semibold">Post</th>
                            <th className="pb-2 pr-3 font-semibold text-right">Views</th>
                            <th className="pb-2 pr-3 font-semibold text-right whitespace-nowrap">
                              Read time
                            </th>
                            <th className="pb-2 font-semibold text-right"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60">
                          {topPostRows.map((p) => {
                            const meta = postMeta.get(p.slug);
                            const rt = readingBySlug.get(p.slug);
                            const risky = rt ? isDropOffRisk(rt) : false;
                            return (
                              <tr key={p.slug} className="group">
                                <td className="py-2.5 pr-3 max-w-0 w-full">
                                  <a
                                    href={`/blog/${p.slug}`}
                                    target="_blank"
                                    rel="noopener"
                                    className="block text-zinc-200 group-hover:text-orange-400 truncate transition-colors"
                                    title={meta?.title ?? p.slug}
                                  >
                                    {meta?.title ?? p.slug}
                                  </a>
                                  {meta?.category && (
                                    <span className="text-[11px] text-zinc-600 capitalize">
                                      {meta.category}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-300 whitespace-nowrap">
                                  {p.views.toLocaleString()}
                                </td>
                                <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-500 whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1">
                                    {risky && (
                                      <AlertTriangle
                                        className="w-3 h-3 text-amber-400"
                                        aria-label="Drop-off risk"
                                      />
                                    )}
                                    {formatSeconds(rt?.avgReadingTimeSec)}
                                  </span>
                                </td>
                                <td className="py-2.5 text-right whitespace-nowrap">
                                  <button
                                    onClick={() => setDetailSlug(p.slug)}
                                    className="text-xs text-orange-500 hover:text-orange-400 transition-colors"
                                  >
                                    Details →
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState />
                  )}
                </Panel>
              )}

              {show("readingTime") && (
                <ReadingTimeChart data={readingTime} loading={loading} />
              )}

              {/* Traffic sources */}
              {show("sources") && (
                <Panel title="Traffic sources" subtitle="How people found you">
                  {loading && !topReferrers ? (
                    <PanelSkeleton rows={6} />
                  ) : topReferrers && topReferrers.length > 0 ? (
                    <ol className="space-y-2">
                      {topReferrers.map((r, i) => {
                        let display = r.label;
                        try {
                          if (r.label !== "Direct") display = new URL(r.label).hostname;
                        } catch {
                          /* keep raw */
                        }
                        const maxV = Math.max(...topReferrers.map((x) => x.value), 1);
                        return (
                          <li key={r.label} className="flex items-center gap-2.5">
                            <span className="text-xs text-zinc-600 w-4 shrink-0 tabular-nums">
                              {i + 1}
                            </span>
                            <span
                              className="flex-1 truncate text-sm text-zinc-200"
                              title={r.label}
                            >
                              {display}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="hidden sm:block w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-orange-500 rounded-full"
                                  style={{
                                    width: `${Math.max(Math.round((r.value / maxV) * 100), 3)}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-zinc-400 tabular-nums w-14 text-right">
                                {r.value.toLocaleString()}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <EmptyState />
                  )}
                </Panel>
              )}

              {/* Countries */}
              {show("countries") && (
                <Panel title="Countries" subtitle="Where your readers are">
                  {loading && !topCountries ? (
                    <PanelSkeleton rows={6} />
                  ) : topCountries && topCountries.length > 0 ? (
                    <ol className="space-y-2">
                      {topCountries.map((c, i) => {
                        const maxV = Math.max(...topCountries.map((x) => x.value), 1);
                        const flag = countryFlag(c.code);
                        return (
                          <li
                            key={c.code || c.label}
                            className="flex items-center gap-2.5"
                          >
                            <span className="text-xs text-zinc-600 w-4 shrink-0 tabular-nums">
                              {i + 1}
                            </span>
                            {flag ? (
                              <span className="text-base leading-none shrink-0 select-none">
                                {flag}
                              </span>
                            ) : (
                              <span className="w-5 shrink-0" />
                            )}
                            <span className="flex-1 truncate text-sm text-zinc-200">
                              {c.label}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="hidden sm:block w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full"
                                  style={{
                                    width: `${Math.max(Math.round((c.value / maxV) * 100), 3)}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-zinc-400 tabular-nums w-14 text-right">
                                {c.value.toLocaleString()}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <EmptyState />
                  )}
                </Panel>
              )}

              {/* Categories chart */}
              {show("categories") && (
                <Panel title="Categories" subtitle="Where readers spend time">
                  {loading && !topCategories ? (
                    <PanelSkeleton rows={6} />
                  ) : topCategories && topCategories.length > 0 ? (
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={topCategories.map((c) => ({
                            name: c.label,
                            value: c.value,
                          }))}
                          layout="vertical"
                          margin={{ top: 0, right: 8, left: 8, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#27272a"
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            stroke="#71717a"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            stroke="#71717a"
                            fontSize={11}
                            width={90}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            {...TOOLTIP_STYLE}
                            cursor={{ fill: "rgba(249,115,22,0.07)" }}
                          />
                          <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState />
                  )}
                </Panel>
              )}

              {show("searchQueries") && (
                <SearchQueriesTable data={searchQueries} loading={loading} />
              )}
              {show("linkClicks") && (
                <LinkClicksPanel data={linkClicks} loading={loading} />
              )}
            </div>

            {/* Underperforming / needs attention */}
            {show("needsAttention") && (
              <Panel
                title="Needs attention"
                subtitle="Posts published in this period with the fewest tracked views — they may need more promotion or editing."
              >
                {loading && !underperforming ? (
                  <PanelSkeleton rows={5} />
                ) : underperforming && underperforming.length > 0 ? (
                  <ol className="space-y-2.5">
                    {underperforming.map((p, i) => (
                      <li key={p.slug} className="flex items-start gap-2.5">
                        <span className="text-xs text-zinc-600 w-4 shrink-0 tabular-nums pt-0.5">
                          {i + 1}
                        </span>
                        <a
                          href={`/blog/${p.slug}`}
                          target="_blank"
                          rel="noopener"
                          className="flex-1 min-w-0 group"
                        >
                          <span className="block text-sm text-zinc-300 group-hover:text-orange-400 truncate transition-colors">
                            {p.title}
                          </span>
                          <span className="text-[11px] text-zinc-600">
                            {p.publishedAt
                              ? format(new Date(p.publishedAt), "MMM d, yyyy")
                              : ""}
                            {postMeta.get(p.slug)?.category
                              ? ` · ${postMeta.get(p.slug)!.category}`
                              : ""}
                          </span>
                        </a>
                        <span
                          className={`text-xs tabular-nums shrink-0 pt-0.5 ${
                            p.views === 0 ? "text-zinc-700" : "text-zinc-400"
                          }`}
                        >
                          {p.views === 0
                            ? "no views"
                            : `${p.views.toLocaleString()} views`}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyState />
                )}
              </Panel>
            )}
          </>
        )}

        {/* My Posts section — visible to all authenticated users */}
        <Panel
          title="My Posts"
          subtitle="Views for your published articles in the selected period."
        >
          {loading ? (
            <PanelSkeleton rows={4} />
          ) : myPostViews && myPostViews.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-600 border-b border-zinc-800">
                    <th className="pb-2 pr-4 font-semibold">Post Title</th>
                    <th className="pb-2 pr-4 font-semibold whitespace-nowrap">
                      Published Date
                    </th>
                    <th className="pb-2 font-semibold text-right">Views</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {myPostViews.map((p) => (
                    <tr key={p.slug} className="group">
                      <td className="py-2.5 pr-4">
                        <a
                          href={`/blog/${p.slug}`}
                          target="_blank"
                          rel="noopener"
                          className="text-zinc-200 group-hover:text-orange-400 transition-colors truncate block max-w-xs"
                          title={p.title}
                        >
                          {p.title}
                        </a>
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-500 whitespace-nowrap tabular-nums text-xs">
                        {p.publishedAt
                          ? format(new Date(p.publishedAt), "MMM d, yyyy")
                          : "—"}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-zinc-400">
                        {p.views === 0 ? (
                          <span className="text-zinc-700">—</span>
                        ) : (
                          p.views.toLocaleString()
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState />
          )}
        </Panel>
      </main>

      {/* Per-post drilldown slide-over */}
      {isAdmin && (
        <PostDetailPanel
          slug={detailSlug}
          range={range}
          token={token}
          estimatedReadingTimeSec={
            detailSlug ? readingBySlug.get(detailSlug)?.estimatedReadingTimeSec : null
          }
          onClose={() => setDetailSlug(null)}
        />
      )}
    </AdminShell>
  );
}

function StatCard({
  icon,
  label,
  value,
  displayText,
  displayDash,
  color,
  loading,
  extra,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  /** Pre-formatted display string (e.g. "42%") — takes priority over value. */
  displayText?: string;
  displayDash?: boolean;
  color: string;
  loading?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
      <div className={`flex items-center gap-2 ${color} mb-2`}>
        {icon}
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-3xl font-bold tabular-nums">
        {loading ? (
          <span className="text-zinc-700 animate-pulse">—</span>
        ) : displayText !== undefined ? (
          displayText
        ) : displayDash ? (
          <span className="text-zinc-600">—</span>
        ) : value === undefined ? (
          <span className="text-zinc-600">—</span>
        ) : (
          value.toLocaleString()
        )}
      </div>
      {extra}
    </div>
  );
}
