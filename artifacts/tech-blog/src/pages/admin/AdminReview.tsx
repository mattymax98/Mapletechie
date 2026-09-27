import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, ArrowLeft, ArrowRight, Clock3, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { adminJson } from "@/lib/adminFetch";

type RevisionItem = {
  id: number;
  postId: number;
  title: string;
  postStatus: string;
  publishedAt: string | null;
  scheduledFor: string | null;
  source: string;
  createdAt: string;
  fields: string[];
  stale: boolean;
};
type RevisionResponse = { items: RevisionItem[]; total: number; pendingCount: number; page: number; pageSize: number };
const pageSize = 20;
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString() : "—";
const fieldNames: Record<string, string> = {
  title: "Title", excerpt: "Summary", content: "Article HTML", seoTitle: "Search title",
  seoDescription: "Search description", coverImage: "Cover image", coverImageAlt: "Cover alt text", ogImage: "Social image",
};

export default function AdminReview() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RevisionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true); setError("");
    try {
      const result = await adminJson<RevisionResponse>(`/api/admin/revisions?status=pending&page=${page}&pageSize=${pageSize}`);
      if (current !== requestId.current) return;
      if (page > 1 && result.total > 0 && result.items.length === 0) {
        setPage(Math.max(1, Math.ceil(result.total / pageSize)));
        return;
      }
      setData(result);
    } catch (err) {
      if (current === requestId.current) setError(err instanceof Error ? err.message : "Could not load the review queue.");
    } finally { if (current === requestId.current) setLoading(false); }
  }, [page]);
  useEffect(() => {
    const refresh = () => { void load(); };
    void load();
    window.addEventListener("admin:revisions-changed", refresh);
    return () => { requestId.current++; window.removeEventListener("admin:revisions-changed", refresh); };
  }, [load]);
  const pages = Math.max(1, Math.ceil((data?.total || 0) / pageSize));
  return (
    <AdminShell title="Review queue" actions={<Button variant="outline" size="sm" onClick={load} disabled={loading} className="border-zinc-700 text-zinc-300"><RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>}>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-400">Editorial desk</p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-100">Correction proposals</h2>
            <p className="mt-1 text-xs text-zinc-500">Pending changes to published and scheduled articles.</p>
          </div>
          <div className="font-mono text-xs text-zinc-500"><span className="text-zinc-200">{data?.pendingCount ?? "—"}</span> pending</div>
        </div>
        {loading && <div aria-label="Loading review queue" className="space-y-2">{[0,1,2,3].map((n) => <div key={n} className="h-[104px] animate-pulse border border-zinc-800 bg-zinc-900/50" />)}</div>}
        {!loading && error && <div role="alert" className="flex items-center gap-3 border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-300"><AlertCircle className="h-4 w-4 shrink-0" /><span className="flex-1">{error}</span><Button variant="outline" size="sm" onClick={load}>Retry</Button></div>}
        {!loading && !error && data?.items.length === 0 && <div className="border border-dashed border-zinc-800 bg-zinc-900/20 px-6 py-14 text-center"><div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center border border-zinc-800 bg-zinc-900 text-zinc-500"><Clock3 className="h-4 w-4" /></div><h3 className="text-sm font-semibold text-zinc-200">No articles are waiting for review.</h3><p className="mt-1 text-xs text-zinc-500">New correction proposals will appear here.</p></div>}
        {!loading && !error && !!data?.items.length && <div className="overflow-hidden border border-zinc-800">
          <div className="hidden grid-cols-[minmax(0,1fr)_170px_190px] gap-4 border-b border-zinc-800 bg-zinc-900/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 md:grid"><span>Article / proposed fields</span><span>Article timeline</span><span>Proposal</span></div>
          {data.items.map((item) => <article key={item.id} className="grid gap-3 border-b border-zinc-800 bg-zinc-950/40 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_170px_190px] md:items-center md:gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/posts/${item.postId}/edit#editorial-corrections`} className="truncate text-sm font-semibold text-zinc-100 hover:text-orange-300">{item.title || `Article #${item.postId}`}</Link>
                <span className="border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">{item.postStatus}</span>
                {item.stale && <span className="border border-amber-800 bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">Re-review required</span>}
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">Post #{item.postId} · Proposal #{item.id}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{item.fields.map((field) => <span key={field} className="border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400">{fieldNames[field] ?? field}</span>)}</div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] md:block md:space-y-1.5">
              {item.postStatus === "published"
                ? <p><span className="text-zinc-600">Published</span><span className="ml-2 text-zinc-400">{dateTime(item.publishedAt)}</span></p>
                : <p><span className="text-zinc-600">Scheduled for</span><span className="ml-2 text-zinc-400">{dateTime(item.scheduledFor)}</span></p>}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-zinc-800/70 pt-2 md:border-0 md:pt-0">
              <div className="min-w-0 text-[11px]"><p className="text-zinc-300">{item.source}</p><p className="mt-1 text-zinc-600">{dateTime(item.createdAt)}</p></div>
              <Link href={`/admin/posts/${item.postId}/edit#editorial-corrections`} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300">Review <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </article>)}
        </div>}
        {!loading && !error && data && data.total > pageSize && <div className="flex items-center justify-between py-4 text-xs text-zinc-500"><span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} of {data.total}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 border-zinc-700"><ArrowLeft className="mr-1 h-3.5 w-3.5" />Previous</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="h-8 border-zinc-700">Next<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></div></div>}
      </main>
    </AdminShell>
  );
}