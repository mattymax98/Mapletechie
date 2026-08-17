import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { AlertTriangle } from "lucide-react";
import { Panel, EmptyState, PanelSkeleton, TOOLTIP_STYLE, formatSeconds } from "./shared";

export interface ReadingTimeRow {
  slug: string;
  title: string;
  avgReadingTimeSec: number | null;
  estimatedReadingTimeSec: number | null;
  samples: number;
}

/** A post is a drop-off risk when actual reading time < 50% of estimated. */
export function isDropOffRisk(r: ReadingTimeRow): boolean {
  return (
    r.avgReadingTimeSec !== null &&
    r.estimatedReadingTimeSec !== null &&
    r.estimatedReadingTimeSec > 0 &&
    r.avgReadingTimeSec < r.estimatedReadingTimeSec * 0.5
  );
}

export function ReadingTimeChart({
  data,
  loading,
}: {
  data: ReadingTimeRow[] | null;
  loading?: boolean;
}) {
  const rows = (data ?? []).slice(0, 8);
  const risky = rows.filter(isDropOffRisk);

  return (
    <Panel
      title="Reading time"
      subtitle="Estimated vs. actual average reading time per top post"
    >
      {loading && !data ? (
        <PanelSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState message="No reading-time data yet — it appears once readers spend time on posts." />
      ) : (
        <>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows.map((r) => ({
                  name: r.title.length > 18 ? r.title.slice(0, 17) + "…" : r.title,
                  fullTitle: r.title,
                  Estimated: r.estimatedReadingTimeSec ?? 0,
                  Actual: r.avgReadingTimeSec ?? 0,
                }))}
                margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={48}
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatSeconds(v)}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: number) => formatSeconds(v)}
                  labelFormatter={(_l, pl) => (pl?.[0] as any)?.payload?.fullTitle ?? ""}
                  cursor={{ fill: "rgba(249,115,22,0.07)" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Estimated" fill="#3f3f46" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Actual" fill="#f97316" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {risky.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {risky.map((r) => (
                <div
                  key={r.slug}
                  className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1" title={r.title}>
                    {r.title}
                  </span>
                  <span className="text-amber-500/80 tabular-nums shrink-0">
                    drop-off risk · {formatSeconds(r.avgReadingTimeSec)} of{" "}
                    {formatSeconds(r.estimatedReadingTimeSec)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
