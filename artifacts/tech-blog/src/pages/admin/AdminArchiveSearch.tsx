import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdmin } from "@/context/AdminContext";

type Item = {
  id: number; title: string; slug: string; status: string; excerpt: string;
  author: string; tags: string[]; categories: { name: string }[];
  clusterId: number | null; clusterRole: string | null;
  createdAt: string; updatedAt: string; publishedAt: string | null;
  canonical_url?: string;
};
type Results = { items: Item[]; page: number; limit: number; total: number };
const filterNames = ["q", "title", "slug", "body", "tag", "category", "cluster", "author", "status", "dateFrom", "dateTo", "publishedFrom", "publishedTo"] as const;
type Filters = Record<(typeof filterNames)[number], string>;
const initial: Filters = Object.fromEntries(filterNames.map((name) => [name, ""])) as Filters;
const labels: Record<keyof Filters, string> = {
  q: "All text", title: "Title", slug: "Slug", body: "Article body", tag: "Tag",
  category: "Category", cluster: "Topic cluster", author: "Author",
  status: "Status", dateFrom: "Created from", dateTo: "Created through",
  publishedFrom: "Published from", publishedTo: "Published through",
};

export default function AdminArchiveSearch() {
  const { token } = useAdmin();
  const [filters, setFilters] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Results | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    filterNames.forEach((name) => { if (applied[name].trim()) params.set(name, applied[name].trim()); });
    setLoading(true);
    fetch(`/api/admin/archive-search?${params}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed.");
      setResult(data);
      setError("");
    }).catch((err) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Search failed.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, applied, page]);

  return <AdminShell title="Editorial archive search">
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <p className="text-zinc-400 text-sm">Search every current article, including drafts and scheduled posts. Created dates filter when a post was created; published dates filter its publication timestamp (scheduled posts use their published date, and drafts without one do not match). Date ranges include both UTC calendar days. Only published articles have public links.</p>
      <form onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied({ ...filters }); }}
        className="border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filterNames.map((name) => <label key={name} className="text-sm text-zinc-300">{labels[name]}
            {name === "status" ? <select value={filters[name]} onChange={(e) => setFilters({ ...filters, [name]: e.target.value })}
              className="block w-full mt-1 bg-black border border-zinc-700 text-white p-2">
              <option value="">All statuses</option><option value="published">Published</option>
              <option value="draft">Draft</option><option value="scheduled">Scheduled</option>
            </select> : <input type={name.startsWith("date") || name.startsWith("published") ? "date" : "text"}
              value={filters[name]} onChange={(e) => setFilters({ ...filters, [name]: e.target.value })}
              className="block w-full mt-1 bg-black border border-zinc-700 text-white p-2" />}
          </label>)}
        </div>
        <button className="bg-orange-600 hover:bg-orange-500 px-5 py-2 font-semibold">Search archive</button>
      </form>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      {loading ? <p className="text-zinc-400">Searching…</p> : result && <>
        <p className="text-zinc-400 text-sm">{result.total} {result.total === 1 ? "article" : "articles"} found · page {page}</p>
        <div className="space-y-3">
          {result.items.map((item) => <article key={item.id} className="border border-zinc-800 p-4 bg-zinc-900 space-y-2">
            <div className="flex flex-wrap gap-2 items-baseline">
              <Link href={`/admin/posts/${item.id}/edit`} className="text-lg text-orange-400 font-semibold hover:underline">{item.title}</Link>
              <span className="text-xs text-zinc-400">{item.status}</span>
            </div>
            <p className="text-zinc-300 text-sm">{item.excerpt}</p>
            <p className="text-zinc-500 text-xs">{item.author} · {item.categories.map((category) => category.name).join(", ") || "No categories"} · {item.tags.join(", ") || "No tags"}
              {item.clusterId ? ` · Topic #${item.clusterId} (${item.clusterRole})` : ""}
              {" · Created "}{new Date(item.createdAt).toLocaleDateString()}
              {" · Updated "}{new Date(item.updatedAt).toLocaleDateString()}
              {item.status === "published" && item.publishedAt ? ` · Published ${new Date(item.publishedAt).toLocaleDateString()}` : ""}
            </p>
            {item.canonical_url && <a href={item.canonical_url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-400 hover:underline">Verified public link: {item.canonical_url}</a>}
          </article>)}
        </div>
        <div className="flex gap-3 items-center">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="border border-zinc-700 px-4 py-2 disabled:opacity-40">Previous</button>
          <button type="button" disabled={page * result.limit >= result.total} onClick={() => setPage((value) => value + 1)} className="border border-zinc-700 px-4 py-2 disabled:opacity-40">Next</button>
        </div>
      </>}
    </main>
  </AdminShell>;
}