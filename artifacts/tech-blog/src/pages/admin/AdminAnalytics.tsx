import { Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, Eye, Globe, Users, RefreshCw, TrendingUp, ExternalLink } from "lucide-react";
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

const TOKEN_KEY = "mapletechie_admin_token";

interface Summary {
  totalViews: number;
  uniqueSessions: number;
  uniqueCountries: number;
  daily: { day: string; views: number }[];
}
interface RowKV { label: string; value: number; }

const RANGES: { id: string; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "all", label: "All time" },
];

export default function AdminAnalytics() {
  const [range, setRange] = useState("30d");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topPosts, setTopPosts] = useState<RowKV[] | null>(null);
  const [topCategories, setTopCategories] = useState<RowKV[] | null>(null);
  const [topCountries, setTopCountries] = useState<RowKV[] | null>(null);
  const [topReferrers, setTopReferrers] = useState<RowKV[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const fetchJson = async (url: string) => {
        const res = await fetch(url, { headers });
        if (res.status === 401 || res.status === 403) throw new Error("auth");
        if (!res.ok) throw new Error("err");
        return res.json();
      };
      const [s, posts, cats, countries, refs] = await Promise.all([
        fetchJson(`/api/admin/analytics/summary?range=${range}`),
        fetchJson(`/api/admin/analytics/top-posts?range=${range}`),
        fetchJson(`/api/admin/analytics/top-categories?range=${range}`),
        fetchJson(`/api/admin/analytics/top-countries?range=${range}`),
        fetchJson(`/api/admin/analytics/top-referrers?range=${range}`),
      ]);
      setSummary(s);
      setTopPosts(posts.map((p: any) => ({ label: p.slug, value: p.views })));
      setTopCategories(cats.map((c: any) => ({ label: c.category, value: c.views })));
      setTopCountries(countries.map((c: any) => ({ label: c.name || c.code, value: c.views })));
      setTopReferrers(refs.map((r: any) => ({ label: r.source, value: r.views })));
    } catch (e: any) {
      setError(e.message === "auth" ? "You don't have access to analytics." : "Couldn't load analytics. Try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const chartData = useMemo(() => {
    if (!summary?.daily) return [];
    return summary.daily.map((d) => ({
      day: d.day,
      views: d.views,
      label: format(parseISO(d.day), "MMM d"),
    }));
  }, [summary]);

  const maxBar = (rows: RowKV[] | null) => (rows && rows.length ? Math.max(...rows.map((r) => r.value)) : 1);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/admin">
            <div className="flex items-baseline gap-2 leading-none whitespace-nowrap shrink-0 cursor-pointer">
              <span className="text-base sm:text-lg font-bold tracking-tight">
                <span className="text-orange-500">MAPLE</span>TECHIE
              </span>
              <span className="text-zinc-500 text-sm sm:text-base font-light">/</span>
              <span className="text-zinc-300 text-xs sm:text-sm font-medium tracking-tight">Analytics</span>
            </div>
          </Link>
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
              <BarChart3 className="w-7 h-7 text-orange-500" /> Site analytics
            </h1>
            <p className="text-zinc-400 text-sm mt-1">How readers are finding and using Mapletechie.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-zinc-900 border border-zinc-800 rounded-md overflow-hidden">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRange(r.id)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    range === r.id ? "bg-orange-500 text-black" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => void load()} className="text-zinc-400 hover:text-white" disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-4 rounded">{error}</div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<Eye className="w-5 h-5" />}
            label="Total page views"
            value={summary?.totalViews}
            color="text-orange-500"
          />
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="Unique visitors"
            value={summary?.uniqueSessions}
            color="text-emerald-500"
          />
          <StatCard
            icon={<Globe className="w-5 h-5" />}
            label="Countries reached"
            value={summary?.uniqueCountries}
            color="text-blue-400"
          />
        </div>

        {/* Trend chart */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-orange-500" /> Daily traffic
            </h2>
            <span className="text-xs text-zinc-500">{chartData.length} days</span>
          </div>
          <div className="h-72">
            {chartData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f97316" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="label" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#0a0a0a", border: "1px solid #27272a", borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: "#a1a1aa" }}
                    itemStyle={{ color: "#fafafa" }}
                  />
                  <Area type="monotone" dataKey="views" stroke="#f97316" strokeWidth={2} fill="url(#trendFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Top articles" subtitle="By page views" empty="No article views yet.">
            {topPosts && topPosts.length > 0 && (
              <ul className="space-y-2">
                {topPosts.map((p) => (
                  <li key={p.label} className="flex items-center gap-3 text-sm">
                    <a
                      href={`/blog/${p.label}`}
                      target="_blank"
                      rel="noopener"
                      className="flex-1 truncate text-zinc-200 hover:text-orange-400 inline-flex items-center gap-1"
                      title={p.label}
                    >
                      {p.label} <ExternalLink className="w-3 h-3 opacity-50" />
                    </a>
                    <BarMini value={p.value} max={maxBar(topPosts)} />
                    <span className="text-zinc-400 tabular-nums w-12 text-right">{p.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Top categories" subtitle="Where readers are spending time" empty="No category views yet.">
            {topCategories && topCategories.length > 0 && (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topCategories.map((c) => ({ name: c.label, value: c.value }))} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                    <XAxis type="number" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" stroke="#71717a" fontSize={11} width={110} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#0a0a0a", border: "1px solid #27272a", borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: "#a1a1aa" }}
                      itemStyle={{ color: "#fafafa" }}
                      cursor={{ fill: "rgba(249,115,22,0.08)" }}
                    />
                    <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title="Top countries" subtitle="Where your readers are" empty="Country data will appear here.">
            {topCountries && topCountries.length > 0 && (
              <ul className="space-y-2">
                {topCountries.map((c) => (
                  <li key={c.label} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 truncate text-zinc-200">{c.label}</span>
                    <BarMini value={c.value} max={maxBar(topCountries)} />
                    <span className="text-zinc-400 tabular-nums w-12 text-right">{c.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Top referrers" subtitle="How people found you" empty="No referrer data yet.">
            {topReferrers && topReferrers.length > 0 && (
              <ul className="space-y-2">
                {topReferrers.map((r) => {
                  let display = r.label;
                  try {
                    if (r.label !== "Direct") display = new URL(r.label).hostname;
                  } catch { /* keep raw */ }
                  return (
                    <li key={r.label} className="flex items-center gap-3 text-sm">
                      <span className="flex-1 truncate text-zinc-200" title={r.label}>{display}</span>
                      <BarMini value={r.value} max={maxBar(topReferrers)} />
                      <span className="text-zinc-400 tabular-nums w-12 text-right">{r.value}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | undefined; color: string }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
      <div className={`flex items-center gap-2 ${color} mb-3`}>{icon}<span className="text-xs font-bold uppercase tracking-wider">{label}</span></div>
      <div className="text-3xl font-bold tabular-nums">
        {value === undefined ? <span className="text-zinc-600">—</span> : value.toLocaleString()}
      </div>
    </div>
  );
}

function Panel({ title, subtitle, empty, children }: { title: string; subtitle: string; empty: string; children: React.ReactNode }) {
  const hasContent = !!children && (Array.isArray(children) ? children.length > 0 : true);
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
      <div className="mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">{title}</h2>
        <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>
      </div>
      {hasContent ? children : <div className="text-center text-zinc-600 text-sm py-10">{empty}</div>}
    </div>
  );
}

function BarMini({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="hidden sm:block w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className="h-full bg-orange-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
      No traffic data yet for this range. Once visitors start arriving, you'll see the trend here.
    </div>
  );
}
