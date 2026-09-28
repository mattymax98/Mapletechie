import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdmin } from "@/context/AdminContext";

type Member = { id: number; title: string; status: string; clusterRole: string };
type Topic = {
  id: number; name: string; slug: string; introduction: string; isPublic: boolean;
  publishedCount: number; ready: boolean; posts: Member[];
};
const empty = { name: "", slug: "", introduction: "", isPublic: false };

export default function AdminTopics() {
  const { token, user } = useAdmin();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/topics", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Could not load topic clusters.");
      setTopics(await res.json());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load topic clusters.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [token]);

  const start = (topic?: Topic) => {
    setEditing(topic?.id ?? 0);
    setForm(topic ? { name: topic.name, slug: topic.slug, introduction: topic.introduction, isPublic: topic.isPublic } : empty);
    setError("");
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || saving) return;
    if (!form.introduction.trim()) { setError("Add a useful editorial introduction before saving."); return; }
    const selected = topics.find((topic) => topic.id === editing);
    if (form.isPublic && selected && !selected.ready) {
      setError("This topic needs at least three published articles before it can be public.");
      return;
    }
    if (form.isPublic && !selected) {
      setError("Create a private topic first, assign articles, then make it public.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/admin/topics/${editing}` : "/api/admin/topics", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not save topic.");
      setEditing(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save topic.");
    } finally {
      setSaving(false);
    }
  };

  return <AdminShell title="Topic clusters">
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-zinc-400 text-sm">Curate non-sequential coverage. A private cluster never appears on the public site.</p>
        {user?.role === "admin" && <button type="button" onClick={() => start()} className="bg-orange-600 hover:bg-orange-500 px-4 py-2 text-white text-sm font-semibold">New topic</button>}
      </div>
      {error && <p role="alert" className="p-3 border border-red-700 text-red-300">{error}</p>}
      {editing !== null && <form onSubmit={save} className="border border-zinc-700 p-5 space-y-4 bg-zinc-900">
        <h2 className="font-semibold">{editing ? "Edit topic" : "New private topic"}</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="text-sm text-zinc-300">Name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: editing ? form.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })}
              className="mt-1 w-full p-2 bg-black border border-zinc-700 text-white" />
          </label>
          <label className="text-sm text-zinc-300">Stable URL slug
            <input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} disabled={editing !== 0}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="mt-1 w-full p-2 bg-black border border-zinc-700 text-white disabled:opacity-60" />
            {editing !== 0 && <span className="text-xs text-zinc-500">Permanent after creation to protect existing links.</span>}
          </label>
        </div>
        <label className="block text-sm text-zinc-300">Editorial introduction
          <textarea required rows={4} value={form.introduction} onChange={(e) => setForm({ ...form, introduction: e.target.value })}
            className="mt-1 w-full p-2 bg-black border border-zinc-700 text-white" placeholder="Explain the coverage and why these stories belong together." />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} />
          Make public (only after three published stories are assigned)
        </label>
        <div className="flex gap-3">
          <button disabled={saving} className="px-4 py-2 bg-orange-600 disabled:opacity-50">{saving ? "Saving…" : "Save topic"}</button>
          <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 border border-zinc-700">Cancel</button>
        </div>
      </form>}
      {loading ? <p className="text-zinc-400">Loading topics…</p> : topics.length === 0 ? <p className="text-zinc-400">No topics yet. Create one privately, then assign posts in the editor.</p> : (
        <div className="grid gap-4">
          {topics.map((topic) => <section key={topic.id} className="border border-zinc-800 bg-zinc-900 p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-lg">{topic.name}</h2>
                <p className="text-zinc-400 text-sm">/topics/{topic.slug} · {topic.isPublic ? "Public" : "Private"} · {topic.publishedCount}/3 published stories</p>
                <p className={`text-sm mt-1 ${topic.ready ? "text-emerald-400" : "text-amber-400"}`}>
                  {topic.ready ? "Ready to be discovered" : `Not ready: ${Math.max(0, 3 - topic.publishedCount)} more published ${3 - topic.publishedCount === 1 ? "story" : "stories"} needed`}
                </p>
              </div>
              {user?.role === "admin" && <button type="button" onClick={() => start(topic)} className="text-orange-400 hover:underline">Edit topic</button>}
            </div>
            <p className="text-sm text-zinc-300">{topic.introduction}</p>
            {topic.posts.length > 0 && <ul className="text-sm space-y-1">{topic.posts.map((post) =>
              <li key={post.id}><Link href={`/admin/posts/${post.id}/edit`} className="text-orange-400 hover:underline">{post.title}</Link>
                <span className="text-zinc-500"> · {post.clusterRole} · {post.status}</span></li>)}</ul>}
          </section>)}
        </div>
      )}
    </main>
  </AdminShell>;
}