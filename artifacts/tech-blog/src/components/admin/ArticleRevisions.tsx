import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Field = "title" | "excerpt" | "content" | "seoTitle" | "seoDescription" | "coverImage" | "coverImageAlt" | "ogImage";
const labels: Record<Field, string> = {
  title: "Title", excerpt: "Summary", content: "Article HTML",
  seoTitle: "Search title", seoDescription: "Search description",
  coverImage: "Cover image URL", coverImageAlt: "Cover image alt text", ogImage: "Social image URL",
};
const fields = Object.keys(labels) as Field[];
const imageFields = new Set<Field>(["coverImage", "ogImage"]);
function ImagePreview({ src, alt }: { src: string | null | undefined; alt: string }) {
  if (!src) return null;
  return <img src={src} alt={alt} loading="lazy" className="mt-2 max-h-40 max-w-full rounded border border-zinc-700 object-contain" />;
}
type Revision = {
  id: number; status: string; stale: boolean; source: string;
  changes: Partial<Record<Field, string>>; updateNote: string | null; createdAt: string;
};
type Live = Record<Field, string | null> & { slug: string; status: string; publishedAt: string; scheduledFor?: string | null; contentModifiedAt?: string | null };

export function ArticleRevisions({ postId, token, canApprove }: {
  postId: number; token: string; canApprove: boolean;
}) {
  const [live, setLive] = useState<Live | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [draft, setDraft] = useState<Partial<Record<Field, string>>>({});
  const [note, setNote] = useState("");
  const [edits, setEdits] = useState<Record<number, Partial<Record<Field, string>>>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const response = await fetch(`/api/admin/posts/${postId}/revisions`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not load revisions");
    const data = await response.json() as { live: Live; revisions: Revision[] };
    setLive(data.live);
    setRevisions(data.revisions);
    setEdits(Object.fromEntries(data.revisions.map((r) => [r.id, r.changes])));
    setNotes(Object.fromEntries(data.revisions.map((r) => [r.id, r.updateNote ?? ""])));
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/admin/posts/${postId}/revisions`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    }).then(async (r) => {
      if (!r.ok) throw new Error("Could not load revisions");
      return r.json();
    }).then((data) => {
      if (!active) return;
      setLive(data.live);
      setRevisions(data.revisions);
      setEdits(Object.fromEntries(data.revisions.map((r: Revision) => [r.id, r.changes])));
      setNotes(Object.fromEntries(data.revisions.map((r: Revision) => [r.id, r.updateNote ?? ""])));
    }).catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [postId, token]);

  async function send(path: string, method: string, body?: unknown) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/posts/${postId}/revisions${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      await load();
      if (!path) { setDraft({}); setNote(""); }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save revision"); }
    finally { setBusy(false); }
  }

  if (loading) return <p className="text-sm text-zinc-400">Loading article revisions…</p>;
  if (!live) return <p role="alert" className="text-red-400">{error}</p>;
  return (
    <section className="border border-zinc-700 bg-zinc-900/70 p-5 mb-8 space-y-5" aria-label="Article revisions">
      <div>
        <h2 className="text-xl font-bold text-white">Editorial corrections</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Proposed changes stay private until a publishing editor approves them.
          The URL ({live.slug}) and author stay unchanged.
          {live.status === "published"
            ? ` Original publication: ${new Date(live.publishedAt).toLocaleDateString()}. Only substantive article changes can update its editorial freshness date.`
            : ` Scheduled publication remains ${live.scheduledFor ? new Date(live.scheduledFor).toLocaleString() : "unchanged"}. Corrections before publication do not set an editorial freshness date.`}
        </p>
      </div>
      {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
      <details className="border border-zinc-700 p-4">
        <summary className="cursor-pointer font-semibold text-orange-400">Propose a correction</summary>
        <div className="space-y-3 mt-4">
          <p className="text-xs text-zinc-400">Only fill fields you want to change. Upload replacement images first and use their Mapletechie URLs. Cover changes need meaningful alt text. Complete article HTML must include alt text on every image.</p>
          {fields.map((field) => (
            <label key={field} className="block text-sm text-zinc-200">
              {labels[field]}
              {field === "content"
                ? <Textarea className="mt-1 bg-zinc-950 border-zinc-700 min-h-32" value={draft[field] ?? ""} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} placeholder={`Current: ${(live[field] ?? "").slice(0, 110)}…`} />
                : <Input className="mt-1 bg-zinc-950 border-zinc-700" value={draft[field] ?? ""} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} placeholder={live[field] ?? ""} />}
            </label>
          ))}
          <label className="block text-sm text-zinc-200">What changed? (shown to readers only for a substantive published update)
            <Textarea className="mt-1 bg-zinc-950 border-zinc-700" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <Button type="button" disabled={busy || !Object.values(draft).some((v) => v?.trim())}
            onClick={() => send("", "POST", { changes: Object.fromEntries(Object.entries(draft).filter(([, v]) => v?.trim())), updateNote: note || null })}>
            Submit for review
          </Button>
        </div>
      </details>
      {revisions.length === 0 && <p className="text-sm text-zinc-400">No revisions proposed yet.</p>}
      {revisions.map((r) => (
        <div key={r.id} className="border border-zinc-700 p-4 space-y-4">
          <h3 className="font-semibold text-white">Proposal #{r.id} · {r.source} · {r.status}
            {r.stale && r.status === "pending" && <span className="text-amber-400"> · Live article changed — re-review required</span>}
          </h3>
          <p className="text-xs text-zinc-400">{new Date(r.createdAt).toLocaleString()}</p>
          {fields.filter((field) => field in r.changes).map((field) => (
            <div key={field}>
              <h4 className="text-sm font-semibold text-zinc-200">{labels[field]} · changed</h4>
              <div className="grid gap-3 md:grid-cols-2 text-sm">
                 <div className="bg-zinc-950 p-3 min-w-0"><b>Live</b><pre className="whitespace-pre-wrap break-words mt-2 max-h-48 overflow-y-auto">{live[field] ?? ""}</pre>
                   {imageFields.has(field) && <ImagePreview src={live[field]} alt={`Current ${labels[field].toLowerCase()}`} />}
                 </div>
                <div className="bg-zinc-950 p-3 min-w-0"><b>Proposed</b>
                  {r.status === "pending" && !r.stale && canApprove
                    ? <Textarea className="mt-2 bg-zinc-900 border-zinc-700 min-h-24" value={edits[r.id]?.[field] ?? ""} onChange={(e) => setEdits({ ...edits, [r.id]: { ...edits[r.id], [field]: e.target.value } })} />
                    : <pre className="whitespace-pre-wrap break-words mt-2 max-h-48 overflow-y-auto">{r.changes[field]}</pre>}
                   {imageFields.has(field) && <ImagePreview src={edits[r.id]?.[field] ?? r.changes[field]} alt={`Proposed ${labels[field].toLowerCase()}`} />}
                </div>
              </div>
            </div>
          ))}
          <p className="text-sm text-zinc-400">Update note: {r.updateNote || "(none)"}</p>
          {r.status === "pending" && (
            <div className="flex flex-wrap gap-2">
              {canApprove && !r.stale && <>
                <Input aria-label={`Edit update note for proposal ${r.id}`} className="bg-zinc-950 border-zinc-700" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                <Button type="button" variant="outline" disabled={busy} onClick={() => send(`/${r.id}`, "PUT", { changes: edits[r.id], updateNote: notes[r.id] })}>Save review edits</Button>
                <Button type="button" disabled={busy || JSON.stringify(edits[r.id]) !== JSON.stringify(r.changes) || (notes[r.id] ?? "") !== (r.updateNote ?? "")} onClick={() => {
                   if (window.confirm(`Apply this reviewed correction to the ${live.status} article?`)) send(`/${r.id}/approve`, "POST");
                 }}>Approve correction</Button>
              </>}
              {canApprove && <Button type="button" variant="destructive" disabled={busy} onClick={() => {
                if (window.confirm("Reject this proposal?")) send(`/${r.id}/reject`, "POST");
              }}>Reject</Button>}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}