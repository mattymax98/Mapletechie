import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Eye, Timer, MoveVertical } from "lucide-react";
import { TOOLTIP_STYLE, formatSeconds } from "./shared";

interface PostDetail {
  post: { slug: string; title: string; publishedAt: string | null };
  daily: { day: string; views: number }[];
  topReferrers: { source: string; views: number }[];
  topCountries: { code: string | null; name: string | null; views: number }[];
  avgScrollDepth: number | null;
  avgReadingTimeSec: number | null;
  totalViews: number;
}

function MiniList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-2">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-600">No data yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={`${r.label}-${i}`} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-zinc-300" title={r.label}>
                {r.label}
              </span>
              <div className="w-14 h-1 bg-zinc-800 rounded-full overflow-hidden shrink-0">
                <div
                  className="h-full bg-orange-500 rounded-full"
                  style={{ width: `${Math.max(Math.round((r.value / max) * 100), 3)}%` }}
                />
              </div>
              <span className="text-zinc-500 tabular-nums w-8 text-right shrink-0">
                {r.value.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function PostDetailPanel({
  slug,
  range,
  token,
  estimatedReadingTimeSec,
  onClose,
}: {
  slug: string | null;
  range: string;
  token: string | null;
  /** From the reading-time endpoint, when known — used for the risk flag. */
  estimatedReadingTimeSec?: number | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<PostDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slug) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/analytics/post-detail/${encodeURIComponent(slug)}?range=${range}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!cancelled) setDetail(json);
      } catch {
        if (!cancelled) setError("Couldn't load post analytics. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, range, token]);

  const chartData = (detail?.daily ?? []).map((d) => ({
    ...d,
    label: (() => {
      try {
        return format(parseISO(d.day), "MMM d");
      } catch {
        return d.day;
      }
    })(),
  }));

  const dropOffRisk =
    detail?.avgReadingTimeSec != null &&
    estimatedReadingTimeSec != null &&
    estimatedReadingTimeSec > 0 &&
    detail.avgReadingTimeSec < estimatedReadingTimeSec * 0.5;

  return (
    <Sheet open={!!slug} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg bg-zinc-950 border-zinc-800 text-zinc-100 overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-zinc-100 pr-6 leading-snug">
            {detail?.post.title ?? slug}
          </SheetTitle>
          <SheetDescription className="text-zinc-500">
            Post analytics for the selected period
            {detail?.post.publishedAt
              ? ` · published ${format(new Date(detail.post.publishedAt), "MMM d, yyyy")}`
              : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          {loading && (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full bg-zinc-900 rounded" />
              <Skeleton className="h-36 w-full bg-zinc-900 rounded" />
              <Skeleton className="h-24 w-full bg-zinc-900 rounded" />
            </div>
          )}
          {detail && !loading && (
            <>
              {/* Stat row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-orange-500 mb-1">
                    <Eye className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Views</span>
                  </div>
                  <span className="text-lg font-bold tabular-nums">
                    {detail.totalViews.toLocaleString()}
                  </span>
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-blue-400 mb-1">
                    <MoveVertical className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Scroll</span>
                  </div>
                  <span className="text-lg font-bold tabular-nums">
                    {detail.avgScrollDepth != null ? `${detail.avgScrollDepth}%` : "—"}
                  </span>
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
                    <Timer className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Read</span>
                  </div>
                  <span className="text-lg font-bold tabular-nums">
                    {formatSeconds(detail.avgReadingTimeSec)}
                  </span>
                </div>
              </div>

              {dropOffRisk && (
                <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Drop-off risk: readers spend {formatSeconds(detail.avgReadingTimeSec)} on
                  a post estimated at {formatSeconds(estimatedReadingTimeSec)}.
                </div>
              )}

              {/* Daily views */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-2">
                  Daily views
                </p>
                {chartData.length === 0 ? (
                  <p className="text-xs text-zinc-600">No views in this period.</p>
                ) : (
                  <div className="h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                        <defs>
                          <linearGradient id="postDetailGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="label" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip {...TOOLTIP_STYLE} />
                        <Area
                          type="monotone"
                          dataKey="views"
                          stroke="#f97316"
                          strokeWidth={2}
                          fill="url(#postDetailGrad)"
                          dot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <MiniList
                title="Top referrers"
                rows={detail.topReferrers.map((r) => {
                  let label = r.source;
                  try {
                    if (r.source !== "Direct") label = new URL(r.source).hostname;
                  } catch {
                    /* keep raw */
                  }
                  return { label, value: r.views };
                })}
              />
              <MiniList
                title="Top countries"
                rows={detail.topCountries.map((c) => ({
                  label: c.name || c.code || "Unknown",
                  value: c.views,
                }))}
              />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
