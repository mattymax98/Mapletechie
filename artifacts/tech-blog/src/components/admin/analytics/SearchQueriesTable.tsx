import { Panel, EmptyState, PanelSkeleton } from "./shared";

export interface SearchQueryRow {
  query: string;
  count: number;
}

export function SearchQueriesTable({
  data,
  loading,
}: {
  data: SearchQueryRow[] | null;
  loading?: boolean;
}) {
  const max = Math.max(...(data ?? []).map((r) => r.count), 1);
  return (
    <Panel title="Search queries" subtitle="What readers look for on the site">
      {loading && !data ? (
        <PanelSkeleton rows={6} />
      ) : !data || data.length === 0 ? (
        <EmptyState message="No searches tracked yet — terms will appear here once readers use on-site search." />
      ) : (
        <ol className="space-y-2">
          {data.map((r, i) => (
            <li key={r.query} className="flex items-center gap-2.5">
              <span className="text-xs text-zinc-600 w-4 shrink-0 tabular-nums">{i + 1}</span>
              <span className="flex-1 truncate text-sm text-zinc-200" title={r.query}>
                {r.query}
              </span>
              <div className="hidden sm:block w-16 h-1 bg-zinc-800 rounded-full overflow-hidden shrink-0">
                <div
                  className="h-full bg-orange-500 rounded-full"
                  style={{ width: `${Math.max(Math.round((r.count / max) * 100), 3)}%` }}
                />
              </div>
              <span className="text-xs text-zinc-400 tabular-nums w-10 text-right shrink-0">
                {r.count.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
