import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Panel, EmptyState, PanelSkeleton, TOOLTIP_STYLE } from "./shared";

export interface NewVsReturningData {
  newSessions: number;
  returningSessions: number;
}

export function NewVsReturning({
  data,
  loading,
}: {
  data: NewVsReturningData | null;
  loading?: boolean;
}) {
  const total = (data?.newSessions ?? 0) + (data?.returningSessions ?? 0);

  return (
    <Panel title="New vs. returning" subtitle="Visitor loyalty in the selected period">
      {loading && !data ? (
        <PanelSkeleton rows={4} />
      ) : !data || total === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div className="h-44 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "New", value: data.newSessions },
                    { name: "Returning", value: data.returningSessions },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="88%"
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  <Cell fill="#f97316" />
                  <Cell fill="#34d399" />
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-bold tabular-nums">{total.toLocaleString()}</span>
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider">visitors</span>
            </div>
          </div>
          <div className="space-y-3">
            {(
              [
                { label: "New", value: data.newSessions, color: "#f97316" },
                { label: "Returning", value: data.returningSessions, color: "#34d399" },
              ] as const
            ).map((r) => (
              <div key={r.label} className="flex items-center gap-2.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: r.color }}
                />
                <span className="flex-1 text-sm text-zinc-300">{r.label}</span>
                <span className="text-sm tabular-nums text-zinc-200 font-semibold">
                  {r.value.toLocaleString()}
                </span>
                <span className="text-xs text-zinc-600 tabular-nums w-10 text-right">
                  {total ? Math.round((r.value / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
