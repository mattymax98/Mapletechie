import { Panel, EmptyState, PanelSkeleton } from "./shared";

export interface LinkClicksData {
  social: { href: string; clicks: number }[];
  outbound: { domain: string | null; clicks: number }[];
}

function prettyTarget(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

function ClickList({
  rows,
  emptyLabel,
}: {
  rows: { label: string; title?: string; clicks: number }[];
  emptyLabel: string;
}) {
  if (rows.length === 0)
    return <p className="text-xs text-zinc-600 py-3 text-center">{emptyLabel}</p>;
  const max = Math.max(...rows.map((r) => r.clicks), 1);
  return (
    <ol className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="flex items-center gap-2 text-xs">
          <span className="flex-1 truncate text-zinc-300" title={r.title ?? r.label}>
            {r.label}
          </span>
          <div className="hidden sm:block w-14 h-1 bg-zinc-800 rounded-full overflow-hidden shrink-0">
            <div
              className="h-full bg-orange-500 rounded-full"
              style={{ width: `${Math.max(Math.round((r.clicks / max) * 100), 3)}%` }}
            />
          </div>
          <span className="text-zinc-500 tabular-nums w-8 text-right shrink-0">
            {r.clicks.toLocaleString()}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function LinkClicksPanel({
  data,
  loading,
}: {
  data: LinkClicksData | null;
  loading?: boolean;
}) {
  const empty = !data || (data.social.length === 0 && data.outbound.length === 0);
  return (
    <Panel title="Social & outbound clicks" subtitle="Where readers click away to">
      {loading && !data ? (
        <PanelSkeleton rows={5} />
      ) : empty ? (
        <EmptyState message="No link clicks tracked yet." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-2">
              Social shares
            </p>
            <ClickList
              rows={data!.social.map((s) => ({
                label: prettyTarget(s.href),
                title: s.href,
                clicks: s.clicks,
              }))}
              emptyLabel="No social clicks yet."
            />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-2">
              Outbound domains
            </p>
            <ClickList
              rows={data!.outbound.map((o) => ({
                label: o.domain ?? "unknown",
                clicks: o.clicks,
              }))}
              emptyLabel="No outbound clicks yet."
            />
          </div>
        </div>
      )}
    </Panel>
  );
}
