import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AlertCircle, ArrowLeft, ArrowRight, Clock3, RefreshCw, Search, X } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { adminJson } from "@/lib/adminFetch";

type RevisionItem = {
  id: number; postId: number; title: string; postStatus?: string; currentStatus?: string;
  publishedAt?: string | null; scheduledFor?: string | null; source: string; createdAt: string;
  fields: string[]; stale?: boolean; proposedByName?: string | null; reviewedByName?: string | null;
  reviewedAt?: string | null; status?: string; updateNote?: string | null;
  supersededByRevisionId?: number | null; supersededByName?: string | null;
};
type QueueResponse = { items: RevisionItem[]; total: number; pendingCount: number; page: number; pageSize: number };
type HistoryResponse = { items: RevisionItem[]; total: number; page: number; pageSize: number };
type FieldMap = Record<string, string | null | undefined>;
type RevisionDetail = RevisionItem & {
  before: FieldMap | null; proposed: FieldMap | null; final: FieldMap | null; applied: FieldMap | null;
  reviewerEdits: { before: FieldMap | null; after: FieldMap | null; reviewedAt: string; reviewedByName: string | null }[];
  completeness: { before: boolean; proposed: boolean; final: boolean };
};
const pageSize = 20;
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString() : "—";
const fieldNames: Record<string, string> = {
  title: "Title", excerpt: "Summary", content: "Article HTML", seoTitle: "Search title",
  seoDescription: "Search description", coverImage: "Cover image", coverImageAlt: "Cover alt text", ogImage: "Social image",
};
const imageFields = new Set(["coverImage", "ogImage"]);
const emptyMap: FieldMap = {};
function displayValue(field: string, value: string | null | undefined) {
  if (value == null || value === "") return "No value";
  return value;
}
function ImagePreview({ field, value }: { field: string; value: string | null | undefined }) {
  if (!imageFields.has(field) || !value) return null;
  return <img src={value} alt={`${fieldNames[field] ?? field} preview`} loading="lazy" className="mt-3 max-h-44 max-w-full border border-zinc-700 object-contain" />;
}
function ComparisonValue({ field, value }: { field: string; value: string | null | undefined }) {
  return <><pre className={`mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed ${field === "content" ? "font-mono text-[11px]" : ""}`}>{displayValue(field, value)}</pre><ImagePreview field={field} value={value} /></>;
}

export default function AdminReview() {
  const [, setLocation] = useLocation();
  const searchPart = useSearch();
  const params = new URLSearchParams(searchPart);
  const activeTab = params.get("tab") === "history" ? "history" : "pending";
  const selectedRevision = params.get("revision");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"all" | "approved" | "rejected" | "superseded">("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<QueueResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [detail, setDetail] = useState<RevisionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const requestId = useRef(0);
  const detailRequestId = useRef(0);
  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true); setError("");
    try {
      const result = await adminJson<QueueResponse>(`/api/admin/revisions?status=pending&page=${page}&pageSize=${pageSize}`);
      if (current !== requestId.current) return;
      if (page > 1 && result.total > 0 && result.items.length === 0) { setPage(Math.max(1, Math.ceil(result.total / pageSize))); return; }
      setData(result);
    } catch (err) {
      if (current === requestId.current) setError(err instanceof Error ? err.message : "Could not load the review queue.");
    } finally { if (current === requestId.current) setLoading(false); }
  }, [page]);
  const loadHistory = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize), search: search.trim() });
      const result = await adminJson<HistoryResponse>(`/api/admin/revisions/history?${query.toString()}`);
      if (current !== requestId.current) return;
      if (page > 1 && result.total > 0 && result.items.length === 0) { setPage(Math.max(1, Math.ceil(result.total / pageSize))); return; }
      setHistory(result);
    } catch (err) {
      if (current === requestId.current) setError(err instanceof Error ? err.message : "Could not load revision history.");
    } finally { if (current === requestId.current) setLoading(false); }
  }, [page, status, search]);
  useEffect(() => {
    if (activeTab === "history") void loadHistory(); else void load();
    const refresh = () => activeTab === "history" ? void loadHistory() : void load();
    window.addEventListener("admin:revisions-changed", refresh);
    return () => { requestId.current++; window.removeEventListener("admin:revisions-changed", refresh); };
  }, [activeTab, load, loadHistory]);
  useEffect(() => {
    if (activeTab !== "history" || !selectedRevision || !/^\d+$/.test(selectedRevision)) { setDetail(null); setDetailError(""); return; }
    const current = ++detailRequestId.current;
    setDetailLoading(true); setDetailError("");
    adminJson<RevisionDetail>(`/api/admin/revisions/history/${encodeURIComponent(selectedRevision)}`)
      .then((result) => { if (current === detailRequestId.current) setDetail(result); })
      .catch((err) => { if (current === detailRequestId.current) setDetailError(err instanceof Error ? err.message : "Could not load revision details."); })
      .finally(() => { if (current === detailRequestId.current) setDetailLoading(false); });
    return () => { detailRequestId.current++; };
  }, [activeTab, selectedRevision]);
  const pages = Math.max(1, Math.ceil(((activeTab === "history" ? history?.total : data?.total) || 0) / pageSize));
  const goTab = (tab: "pending" | "history") => {
    setPage(1);
    setLocation(tab === "history" ? "/admin/review?tab=history" : "/admin/review");
  };
  const setHistoryFilter = (nextStatus: "all" | "approved" | "rejected" | "superseded", nextSearch = search) => {
    setPage(1); setStatus(nextStatus); setSearch(nextSearch);
  };
  const backToHistory = () => setLocation("/admin/review?tab=history");
  const statusLabel = (item: RevisionItem) => (item.status ?? item.currentStatus ?? "unknown").toLowerCase();
  return (
    <AdminShell title="Review queue" actions={<Button variant="outline" size="sm" onClick={activeTab === "history" ? loadHistory : load} disabled={loading} className="border-zinc-700 text-zinc-300"><RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>}>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-400">Editorial desk</p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-100">Corrections, clearly recorded</h2>
            <p className="mt-1 text-xs text-zinc-500">A calm, accountable record of proposed and reviewed changes.</p>
          </div>
          {activeTab === "pending" && <div className="font-mono text-xs text-zinc-500"><span className="text-zinc-200" data-testid="pending-count">{data?.pendingCount ?? "—"}</span> pending</div>}
        </div>
        <nav aria-label="Correction workspace" className="mb-5 flex gap-5 border-b border-zinc-800">
          <button type="button" data-testid="tab-pending" aria-current={activeTab === "pending" ? "page" : undefined} onClick={() => goTab("pending")} className={`border-b-2 px-1 pb-3 text-sm ${activeTab === "pending" ? "border-orange-400 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>Pending</button>
          <button type="button" data-testid="tab-history" aria-current={activeTab === "history" ? "page" : undefined} onClick={() => goTab("history")} className={`border-b-2 px-1 pb-3 text-sm ${activeTab === "history" ? "border-orange-400 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>History</button>
        </nav>
        {activeTab === "history" && selectedRevision && <div className="mb-5">
          <Button variant="outline" size="sm" onClick={backToHistory} className="border-zinc-700 text-zinc-300"><ArrowLeft className="mr-2 h-3.5 w-3.5" />Back to history</Button>
        </div>}
        {activeTab === "history" && selectedRevision ? (
          <>
            {detailLoading && <div aria-label="Loading revision details" className="space-y-3">{[0,1,2].map((n) => <div key={n} className="h-32 animate-pulse border border-zinc-800 bg-zinc-900/50" />)}</div>}
            {!detailLoading && detailError && <div role="alert" className="flex items-center gap-3 border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-300"><AlertCircle className="h-4 w-4" />{detailError}</div>}
            {!detailLoading && detail && <section data-testid="revision-detail" className="border border-zinc-800 bg-zinc-950/40">
              <header className="border-b border-zinc-800 bg-zinc-900/50 p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-400">Revision #{detail.id} · {detail.source}</p>
                <h3 className="mt-2 text-lg font-semibold text-zinc-100">{detail.title || `Article #${detail.postId}`}</h3>
                <p className="mt-1 text-xs text-zinc-500">Post #{detail.postId} · Submitted by {detail.proposedByName || "Unknown editor"} · {dateTime(detail.createdAt)}</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-400">
                  <span>Status: <strong className="capitalize text-zinc-200">{statusLabel(detail)}</strong></span>
                   {statusLabel(detail) === "superseded"
                     ? <span>Automatically superseded after Revision #{detail.supersededByRevisionId ?? "unknown"} was approved{detail.supersededByName ? ` by ${detail.supersededByName}` : ""} · {dateTime(detail.reviewedAt)}</span>
                     : detail.reviewedAt && <span>Reviewed {dateTime(detail.reviewedAt)} by {detail.reviewedByName || "Unknown reviewer"}</span>}
                  {detail.updateNote && <span>Update note: {detail.updateNote}</span>}
                </div>
                {(detail.postStatus === "deleted" || detail.currentStatus === "deleted") && <p className="mt-3 border border-amber-900/70 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">The current article has been deleted. This revision is retained for the record.</p>}
              </header>
              <div className="space-y-5 p-5">
                {(!detail.completeness.before || !detail.completeness.proposed || !detail.completeness.final) && <p className="border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">This legacy revision has incomplete history. Missing before or proposed values are unknown; no earlier value is inferred.</p>}
                {(detail.fields ?? []).map((field) => {
                  const before = detail.before ?? emptyMap;
                  const proposed = detail.proposed ?? emptyMap;
                  const finalValues = detail.final ?? detail.applied ?? emptyMap;
                   const isRejected = statusLabel(detail) !== "approved";
                  const hasBefore = Object.prototype.hasOwnProperty.call(before, field);
                  const hasProposed = Object.prototype.hasOwnProperty.call(proposed, field);
                  const finalKnown = Object.prototype.hasOwnProperty.call(finalValues, field);
                  const edited = detail.reviewerEdits?.filter((edit) => edit.before && edit.after && (field in edit.before || field in edit.after)) ?? [];
                  return <article key={field} data-testid={`revision-field-${field}`} className="border border-zinc-800">
                    <h4 className="border-b border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200">{fieldNames[field] ?? field}</h4>
                    <div className="grid md:grid-cols-3">
                      {[
                        { label: "Before", value: before[field], known: hasBefore },
                        { label: "Proposed", value: proposed[field], known: hasProposed },
                         { label: isRejected ? "Not applied" : "Final approved", value: finalValues[field], known: finalKnown },
                      ].map((column, i) => <div key={column.label} className={`min-w-0 p-4 ${i > 0 ? "border-t border-zinc-800 md:border-l md:border-t-0" : ""}`}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">{column.label}</p>
                         {column.known ? <ComparisonValue field={field} value={column.value} /> : <p className="mt-3 text-xs italic text-zinc-500">{column.label === "Before" || column.label === "Proposed" ? "Unknown — not recorded in this legacy revision." : isRejected ? "No final value — proposal was not applied." : "Final value not recorded."}</p>}
                      </div>)}
                    </div>
                    {edited.map((edit, index) => <div key={`${edit.reviewedAt}-${index}`} className="border-t border-zinc-800 bg-amber-950/10 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-300">Reviewer edit · {edit.reviewedByName || "Unknown reviewer"} · {dateTime(edit.reviewedAt)}</p>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2 text-xs"><div><span className="text-zinc-500">Before reviewer edit</span><ComparisonValue field={field} value={edit.before?.[field]} /></div><div><span className="text-zinc-500">After reviewer edit</span><ComparisonValue field={field} value={edit.after?.[field]} /></div></div>
                    </div>)}
                  </article>;
                })}
                {detail.fields?.length === 0 && <p className="text-sm text-zinc-500">No field list was recorded for this revision.</p>}
              </div>
            </section>}
          </>
        ) : activeTab === "history" ? (
          <>
            <div className="mb-4 flex flex-col gap-3 border border-zinc-800 bg-zinc-950/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-1" role="group" aria-label="History status filter">
                 {(["all", "approved", "rejected", "superseded"] as const).map((value) => <button key={value} type="button" data-testid={`filter-${value}`} aria-pressed={status === value} onClick={() => setHistoryFilter(value)} className={`px-3 py-1.5 text-xs capitalize ${status === value ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-200"}`}>{value}</button>)}
              </div>
              <label className="relative block w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-600" /><input data-testid="history-search" value={search} onChange={(event) => setHistoryFilter(status, event.target.value)} placeholder="Search title or post ID" className="h-9 w-full border border-zinc-700 bg-zinc-950 pl-9 pr-9 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-orange-500" />{search && <button type="button" aria-label="Clear search" onClick={() => setHistoryFilter(status, "")} className="absolute right-2 top-2 p-1 text-zinc-500 hover:text-zinc-200"><X className="h-3.5 w-3.5" /></button>}</label>
            </div>
            {loading && <div aria-label="Loading revision history" className="space-y-2">{[0,1,2].map((n) => <div key={n} className="h-24 animate-pulse border border-zinc-800 bg-zinc-900/50" />)}</div>}
            {!loading && error && <div role="alert" className="flex items-center gap-3 border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-300"><AlertCircle className="h-4 w-4 shrink-0" /><span className="flex-1">{error}</span><Button variant="outline" size="sm" onClick={loadHistory}>Retry</Button></div>}
            {!loading && !error && history?.items.length === 0 && <div className="border border-dashed border-zinc-800 bg-zinc-900/20 px-6 py-14 text-center"><div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center border border-zinc-800 bg-zinc-900 text-zinc-500"><Clock3 className="h-4 w-4" /></div><h3 className="text-sm font-semibold text-zinc-200">No revisions in this view.</h3><p className="mt-1 text-xs text-zinc-500">Try another status or search term. The record remains unchanged.</p></div>}
            {!loading && !error && !!history?.items.length && <div className="overflow-hidden border border-zinc-800">
               <div className="hidden grid-cols-[minmax(0,1fr)_170px_190px_90px] gap-4 border-b border-zinc-800 bg-zinc-900/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 md:grid"><span>Article / changed fields</span><span>Submitted</span><span>Decision</span><span /></div>
              {history.items.map((item) => <article key={item.id} data-testid={`history-row-${item.id}`} className="grid gap-3 border-b border-zinc-800 bg-zinc-950/40 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_170px_190px_90px] md:items-center md:gap-4">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-zinc-100">{item.title || `Article #${item.postId}`}</h3><span className={`border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusLabel(item) === "approved" ? "border-emerald-900 bg-emerald-950/30 text-emerald-300" : "border-rose-900 bg-rose-950/30 text-rose-300"}`}>{statusLabel(item)}</span></div>
                  <p className="mt-1 text-[11px] text-zinc-500">Post #{item.postId} · Revision #{item.id} · {item.source}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={`border px-1.5 py-0.5 text-[10px] ${item.currentStatus === "deleted" ? "border-amber-900 bg-amber-950/30 text-amber-300" : "border-zinc-800 bg-zinc-900 text-zinc-400"}`}>Article {item.currentStatus || "status unknown"}</span>
                    {item.fields.map((field) => <span key={field} className="border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400">{fieldNames[field] ?? field}</span>)}
                  </div>
                  {item.updateNote && <p className="mt-2 border-l border-zinc-700 pl-2 text-xs text-zinc-400"><span className="text-zinc-600">Update note: </span>{item.updateNote}</p>}
                </div>
                <div className="text-[11px]"><p className="text-zinc-400">{dateTime(item.createdAt)}</p><p className="mt-1 text-zinc-600">by {item.proposedByName || "Unknown editor"}</p></div>
                 <div className="text-[11px]"><p className="text-zinc-300">{statusLabel(item) === "superseded" ? `Automatically superseded after Revision #${item.supersededByRevisionId ?? "unknown"} was approved` : item.reviewedByName || "Unknown reviewer"}</p><p className="mt-1 text-zinc-600">{dateTime(item.reviewedAt)}</p></div>
                <Link data-testid={`view-changes-${item.id}`} href={`/admin/review?tab=history&revision=${item.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300">View changes <ArrowRight className="h-3.5 w-3.5" /></Link>
              </article>)}
            </div>}
            {!loading && !error && history && history.total > 0 && <div className="flex items-center justify-between py-4 text-xs text-zinc-500"><span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, history.total)} of {history.total}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 border-zinc-700"><ArrowLeft className="mr-1 h-3.5 w-3.5" />Previous</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="h-8 border-zinc-700">Next<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></div></div>}
          </>
        ) : (
          <>
            {loading && <div aria-label="Loading review queue" className="space-y-2">{[0,1,2,3].map((n) => <div key={n} className="h-[104px] animate-pulse border border-zinc-800 bg-zinc-900/50" />)}</div>}
            {!loading && error && <div role="alert" className="flex items-center gap-3 border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-300"><AlertCircle className="h-4 w-4 shrink-0" /><span className="flex-1">{error}</span><Button variant="outline" size="sm" onClick={load}>Retry</Button></div>}
            {!loading && !error && data?.items.length === 0 && <div className="border border-dashed border-zinc-800 bg-zinc-900/20 px-6 py-14 text-center"><div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center border border-zinc-800 bg-zinc-900 text-zinc-500"><Clock3 className="h-4 w-4" /></div><h3 className="text-sm font-semibold text-zinc-200">No articles are waiting for review.</h3><p className="mt-1 text-xs text-zinc-500">New correction proposals will appear here.</p></div>}
            {!loading && !error && !!data?.items.length && <div className="overflow-hidden border border-zinc-800">
              <div className="hidden grid-cols-[minmax(0,1fr)_170px_190px] gap-4 border-b border-zinc-800 bg-zinc-900/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 md:grid"><span>Article / proposed fields</span><span>Article timeline</span><span>Proposal</span></div>
              {data.items.map((item) => <article key={item.id} className="grid gap-3 border-b border-zinc-800 bg-zinc-950/40 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_170px_190px] md:items-center md:gap-4">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link href={`/admin/posts/${item.postId}/edit#editorial-corrections`} className="truncate text-sm font-semibold text-zinc-100 hover:text-orange-300">{item.title || `Article #${item.postId}`}</Link><span className="border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">{item.postStatus}</span>{item.stale && <span className="border border-amber-800 bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">Re-review required</span>}</div><p className="mt-1 text-[11px] text-zinc-500">Post #{item.postId} · Proposal #{item.id}</p><div className="mt-2 flex flex-wrap gap-1.5">{item.fields.map((field) => <span key={field} className="border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400">{fieldNames[field] ?? field}</span>)}</div></div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] md:block md:space-y-1.5">{item.postStatus === "published" ? <p><span className="text-zinc-600">Published</span><span className="ml-2 text-zinc-400">{dateTime(item.publishedAt)}</span></p> : item.postStatus === "scheduled" ? <p><span className="text-zinc-600">Scheduled for</span><span className="ml-2 text-zinc-400">{dateTime(item.scheduledFor)}</span></p> : <p><span className="text-zinc-600">Previously published</span><span className="ml-2 text-zinc-400">{dateTime(item.publishedAt)}</span></p>}</div>
                <div className="flex items-center justify-between gap-2 border-t border-zinc-800/70 pt-2 md:border-0 md:pt-0"><div className="min-w-0 text-[11px]"><p className="text-zinc-300">{item.source}</p><p className="mt-1 text-zinc-600">{dateTime(item.createdAt)}</p></div><Link href={`/admin/posts/${item.postId}/edit#editorial-corrections`} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300">Review <ArrowRight className="h-3.5 w-3.5" /></Link></div>
              </article>)}
            </div>}
            {!loading && !error && data && data.total > pageSize && <div className="flex items-center justify-between py-4 text-xs text-zinc-500"><span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} of {data.total}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 border-zinc-700"><ArrowLeft className="mr-1 h-3.5 w-3.5" />Previous</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="h-8 border-zinc-700">Next<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></div></div>}
          </>
        )}
      </main>
    </AdminShell>
  );
}