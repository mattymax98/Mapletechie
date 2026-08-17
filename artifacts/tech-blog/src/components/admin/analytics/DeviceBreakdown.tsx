import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Panel, EmptyState, PanelSkeleton, TOOLTIP_STYLE } from "./shared";
import { Smartphone, Tablet, Monitor } from "lucide-react";

export interface DeviceBreakdownData {
  devices: { deviceType: string; views: number }[];
  browsers: { browser: string; views: number }[];
}

const DEVICE_COLORS: Record<string, string> = {
  mobile: "#f97316",
  tablet: "#38bdf8",
  desktop: "#34d399",
};

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  mobile: <Smartphone className="w-3.5 h-3.5" />,
  tablet: <Tablet className="w-3.5 h-3.5" />,
  desktop: <Monitor className="w-3.5 h-3.5" />,
};

export function DeviceBreakdown({
  data,
  loading,
}: {
  data: DeviceBreakdownData | null;
  loading?: boolean;
}) {
  const totalDevices = (data?.devices ?? []).reduce((s, d) => s + d.views, 0);
  const maxBrowser = Math.max(...(data?.browsers ?? []).map((b) => b.views), 1);

  return (
    <Panel title="Devices & browsers" subtitle="What readers are using">
      {loading && !data ? (
        <PanelSkeleton rows={5} />
      ) : !data || totalDevices === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div className="h-44 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.devices.map((d) => ({ name: d.deviceType, value: d.views }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="88%"
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {data.devices.map((d) => (
                    <Cell
                      key={d.deviceType}
                      fill={DEVICE_COLORS[d.deviceType] ?? "#71717a"}
                    />
                  ))}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-bold tabular-nums">
                {totalDevices.toLocaleString()}
              </span>
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider">views</span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              {data.devices.map((d) => {
                const pct = totalDevices ? Math.round((d.views / totalDevices) * 100) : 0;
                return (
                  <div key={d.deviceType} className="flex items-center gap-2 text-sm">
                    <span style={{ color: DEVICE_COLORS[d.deviceType] ?? "#71717a" }}>
                      {DEVICE_ICONS[d.deviceType] ?? null}
                    </span>
                    <span className="flex-1 capitalize text-zinc-300">{d.deviceType}</span>
                    <span className="text-zinc-500 tabular-nums text-xs">{pct}%</span>
                  </div>
                );
              })}
            </div>
            {data.browsers.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                  Browsers
                </p>
                <div className="space-y-1.5">
                  {data.browsers.slice(0, 5).map((b) => (
                    <div key={b.browser} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate text-zinc-400">{b.browser}</span>
                      <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden shrink-0">
                        <div
                          className="h-full bg-zinc-500 rounded-full"
                          style={{ width: `${Math.max(Math.round((b.views / maxBrowser) * 100), 3)}%` }}
                        />
                      </div>
                      <span className="text-zinc-600 tabular-nums w-10 text-right">
                        {b.views.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
