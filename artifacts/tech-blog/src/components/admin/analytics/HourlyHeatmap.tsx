import { Panel, EmptyState, PanelSkeleton } from "./shared";

export interface HourBucket {
  hour: number;
  views: number;
}

function hourLabel(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export function HourlyHeatmap({
  data,
  loading,
}: {
  data: HourBucket[] | null;
  loading?: boolean;
}) {
  const total = (data ?? []).reduce((s, b) => s + b.views, 0);
  const max = Math.max(...(data ?? []).map((b) => b.views), 1);
  const best = data && total > 0 ? data.reduce((a, b) => (b.views > a.views ? b : a)) : null;

  return (
    <Panel
      title="Hourly heatmap"
      subtitle={
        best
          ? `Busiest hour: ${hourLabel(best.hour)} — a good time to publish`
          : "Average views by hour of day"
      }
    >
      {loading && !data ? (
        <PanelSkeleton rows={4} />
      ) : !data || total === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-12 sm:grid-cols-24 gap-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
          {data.map((b) => {
            const intensity = b.views / max;
            return (
              <div key={b.hour} className="flex flex-col items-center gap-1 group relative">
                <div
                  className="w-full rounded-sm h-16 flex items-end overflow-hidden bg-zinc-900"
                  title={`${hourLabel(b.hour)} — ${b.views.toLocaleString()} views`}
                >
                  <div
                    className="w-full rounded-sm transition-all"
                    style={{
                      height: `${Math.max(intensity * 100, b.views > 0 ? 6 : 0)}%`,
                      background: `rgba(249,115,22,${0.35 + intensity * 0.65})`,
                    }}
                  />
                </div>
                {b.hour % 6 === 0 && (
                  <span className="text-[9px] text-zinc-600 whitespace-nowrap">
                    {hourLabel(b.hour)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
