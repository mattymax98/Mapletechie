import { Skeleton } from "@/components/ui/skeleton";

export const EMPTY_STATE_MSG =
  "No data yet — views will appear here once readers start visiting.";

export const TOOLTIP_STYLE = {
  contentStyle: {
    background: "#09090b",
    border: "1px solid #27272a",
    borderRadius: 6,
    fontSize: 12,
  },
  labelStyle: { color: "#a1a1aa" },
  itemStyle: { color: "#fafafa" },
} as const;

export function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-zinc-600 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ message }: { message?: string }) {
  return (
    <div className="text-center text-zinc-600 text-sm py-8">
      {message ?? EMPTY_STATE_MSG}
    </div>
  );
}

export function PanelSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 py-1">
      {[...Array(rows)].map((_, i) => (
        <Skeleton key={i} className="h-6 w-full bg-zinc-900 rounded" />
      ))}
    </div>
  );
}

export function formatSeconds(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}
