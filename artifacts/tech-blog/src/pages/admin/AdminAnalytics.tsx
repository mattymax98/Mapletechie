import { AdminShell } from "@/components/admin/AdminShell";
import { useEffect, useMemo, useState } from "react";
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

const TOKEN_KEY = "mapletechie_admin_token";

interface Summary {
  totalViews: number;
  uniqueSessions: number;
  uniqueCountries: number;
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
}: {
  current: number;
  prior: number | null;
}) {
  if (prior === null) return null;
  if (prior === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-zinc-500 bg-zinc-800/70 rounded px-1.5 py-0.5">
        new
      </span>
    );
  const pct = Math.round(((current - prior) / prior) * 100);
  if (pct > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5 font-semibold">
        <ArrowUpRight className="w-3 h-3" />+{pct}%
      </span>
    );
  if (pct < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5 font-semibold">
        <ArrowDownRight className="w-3 h-3" />
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
  const [topCategories, setTopCategories] = useState<RowKV[] | null>(null);
  const [topCountries, setTopCountries] = useState<CountryRow[] | null>(null);
  const [topReferrers, setTopReferrers] = useState<RowKV[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: allPosts } = useListAdminPosts();
  const token =
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

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

  /**
   * Posts published in this period with the fewest analytics views.
   * Derived from the post-views endpoint which LEFT JOINs postsTable so
   * zero-view posts are true zeros, not "missing from top-15" artifacts.
   * The server returns rows sorted by views ASC already.
   */
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
      // Fetch a wider range to derive prior-period comparison
      const expandedRange =
        range === "7d" ? "30d" : range === "30d" ? "90d" : null;
      const [s, posts, pvRows, cats, countries, refs, expandedS] =
        await Promise.all([
          fetchJson(`/api/admin/analytics/summary?range=${range}`),
          fetchJson(`/api/admin/analytics/top-posts?range=${range}`),
          fetchJson(`/api/admin/analytics/post-views?range=${range}`),
          fetchJson(`/api/admin/analytics/top-categories?range=${range}`),
          fetchJson(`/api/admin/analytics/top-countries?range=${range}`),
          fetchJson(`/api/admin/analytics/top-referrers?range=${range}`),
          expandedRange
            ? fetchJson(`/api/admin/analytics/summary?range=${expandedRange}`)
            : Promise.resolve(null),
        ]);
      setSummary(s);
      setTopPostRows(
        posts.map((p: any) => ({ slug: p.slug, views: p.views })),
      );
      // post-views endpoint returns ALL published posts in the period with
      // accurate view counts (including zero) via a LEFT JOIN — use this for
      // the underperforming section so posts outside the top-15 aren't falsely
      // labelled as zero-view.
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
      setTopCategories(
        cats.map((c: any) => ({ label: c.category, value: c.views })),
      );
      setTopCountries(
        countries.map((c: any) => ({
          code: c.code ?? "",
          label: c.name || c.code || "Unknown",
          value: c.views,
        })),
      );
      setTopReferrers(
        refs.map((r: any) => ({ label: r.source, value: r.views })),
      );
      // Extract prior-period views from the expanded daily series
      if (expandedS && expandedRange) {
        const currentDays = range === "7d" ? 7 : 30;
        const priorEnd = new Date(
          Date.now() - currentDays * 24 * 60 * 60 * 1000,
        );
        const priorStart = new Date(
          Date.now() - currentDays * 2 * 24 * 60 * 60 * 1000,
        );
        const prior = (
          expandedS.daily as { day: string; views: number }[]
        )
          .filter((d) => {
            const dt = new Date(d.day);
            return dt >= priorStart && dt < priorEnd;
          })
          .reduce((sum, d) => sum + d.views, 0);
        setPriorViews(prior);
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

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const chartData = useMemo(
    () =>
      (summary?.daily ?? []).map((d) => ({
        ...d,
        label: format(parseISO(d.day), "MMM d"),
      })),
    [summary],
  );

  const totalViews = summary?.totalViews ?? 0;

  return (
    <AdminShell
      title="Analytics"
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="text-zinc-400 hover:text-white"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      }
    >
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* Range selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-4 py-2 text-xs font-semibold transition-colors ${
                  range === r.id
                    ? "bg-red-500 text-black"
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

        {/* Summary stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            icon={<Eye className="w-5 h-5" />}
            label="Page views"
            value={summary?.totalViews}
            color="text-red-500"
            loading={loading}
            extra={
              summary && priorViews !== null ? (
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
            value={summary?.uniqueSessions}
            color="text-emerald-500"
            loading={loading}
          />
          <StatCard
            icon={<Globe className="w-5 h-5" />}
            label="Countries reached"
            value={summary?.uniqueCountries}
            color="text-blue-400"
            loading={loading}
          />
        </div>

        {/* Daily traffic chart */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-red-500" /> Daily
              traffic
            </h2>
            <span className="text-xs text-zinc-700">
              {chartData.length} days
            </span>
          </div>
          <div className="h-52">
            {chartData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="analyticsGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#f97316"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="100%"
                        stopColor="#f97316"
                        stopOpacity={0}
                      />
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
                  <Tooltip
                    contentStyle={{
                      background: "#09090b",
                      border: "1px solid #27272a",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#a1a1aa" }}
                    itemStyle={{ color: "#fafafa" }}
                  />
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
        </div>

        {/* Main 2-column panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Top pages */}
          <Panel
            title="Top pages"
            subtitle="By views in selected period"
            empty="No page views yet."
          >
            {topPostRows && topPostRows.length > 0 && (
              <ol className="space-y-3">
                {topPostRows.map((p, i) => {
                  const meta = postMeta.get(p.slug);
                  const pct =
                    totalViews > 0
                      ? Math.round((p.views / totalViews) * 100)
                      : 0;
                  return (
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
                        <span className="block text-sm text-zinc-200 group-hover:text-red-400 truncate transition-colors">
                          {meta?.title ?? p.slug}
                        </span>
                        {meta?.category && (
                          <span className="text-[11px] text-zinc-600 capitalize">
                            {meta.category}
                          </span>
                        )}
                      </a>
                      <div className="flex items-center gap-2 shrink-0 pt-1">
                        <div className="hidden sm:block w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-500 rounded-full"
                            style={{ width: `${Math.max(pct, 3)}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-400 tabular-nums w-14 text-right">
                          {p.views.toLocaleString()}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>

          {/* Traffic sources */}
          <Panel
            title="Traffic sources"
            subtitle="How people found you"
            empty="No referrer data yet."
          >
            {topReferrers && topReferrers.length > 0 && (
              <ol className="space-y-2">
                {topReferrers.map((r, i) => {
                  let display = r.label;
                  try {
                    if (r.label !== "Direct") display = new URL(r.label).hostname;
                  } catch { /* keep raw */ }
                  const maxV = Math.max(
                    ...topReferrers.map((x) => x.value),
                    1,
                  );
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
                            className="h-full bg-red-500 rounded-full"
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
            )}
          </Panel>

          {/* Countries */}
          <Panel
            title="Countries"
            subtitle="Where your readers are"
            empty="Country data will appear here."
          >
            {topCountries && topCountries.length > 0 && (
              <ol className="space-y-2">
                {topCountries.map((c, i) => {
                  const maxV = Math.max(
                    ...topCountries.map((x) => x.value),
                    1,
                  );
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
            )}
          </Panel>

          {/* Categories chart */}
          <Panel
            title="Categories"
            subtitle="Where readers spend time"
            empty="No category views yet."
          >
            {topCategories && topCategories.length > 0 && (
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
                      contentStyle={{
                        background: "#09090b",
                        border: "1px solid #27272a",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "#a1a1aa" }}
                      itemStyle={{ color: "#fafafa" }}
                      cursor={{ fill: "rgba(249,115,22,0.07)" }}
                    />
                    <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        {/* Underperforming / needs attention */}
        {underperforming && underperforming.length > 0 && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
            <div className="mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Needs attention
              </h2>
              <p className="text-xs text-zinc-600 mt-0.5">
                Posts published in this period with the fewest tracked views —
                they may need more promotion or editing.
              </p>
            </div>
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
                    <span className="block text-sm text-zinc-300 group-hover:text-red-400 truncate transition-colors">
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
          </div>
        )}
      </main>
    </AdminShell>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  loading,
  extra,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  color: string;
  loading?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
      <div className={`flex items-center gap-2 ${color} mb-2`}>
        {icon}
        <span className="text-xs font-bold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-3xl font-bold tabular-nums">
        {loading ? (
          <span className="text-zinc-700 animate-pulse">—</span>
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

function Panel({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasContent =
    !!children && (Array.isArray(children) ? children.length > 0 : true);
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
      <div className="mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          {title}
        </h2>
        <p className="text-xs text-zinc-600 mt-0.5">{subtitle}</p>
      </div>
      {hasContent ? (
        children
      ) : (
        <div className="text-center text-zinc-700 text-sm py-8">{empty}</div>
      )}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-full flex items-center justify-center text-zinc-700 text-sm">
      No traffic data yet for this range.
    </div>
  );
}
