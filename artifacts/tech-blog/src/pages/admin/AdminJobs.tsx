import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, PlusCircle, Pencil, Trash2, X, ExternalLink } from "lucide-react";

const TOKEN_KEY = "mapletechie_admin_token";

type Job = {
  id: number;
  slug: string;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  compensation: string | null;
  summary: string;
  description: string;
  responsibilities: string;
  requirements: string;
  niceToHaves: string | null;
  applyEmail: string | null;
  isActive: boolean;
};

const empty = {
  slug: "",
  title: "",
  department: "Editorial",
  location: "Remote",
  employmentType: "Full-time",
  compensation: "",
  summary: "",
  description: "",
  responsibilities: "",
  requirements: "",
  niceToHaves: "",
  applyEmail: "",
  isActive: true,
};

export default function AdminJobs() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  async function load() {
    const res = await fetch("/api/admin/jobs", { headers });
    if (res.ok) setJobs(await res.json());
  }
  useEffect(() => { load(); }, []);

  function startNew() { setEditing("new"); setForm(empty); setMsg(null); }
  function startEdit(j: Job) {
    setEditing(j.id);
    setForm({
      slug: j.slug,
      title: j.title,
      department: j.department,
      location: j.location,
      employmentType: j.employmentType,
      compensation: j.compensation || "",
      summary: j.summary,
      description: j.description,
      responsibilities: j.responsibilities,
      requirements: j.requirements,
      niceToHaves: j.niceToHaves || "",
      applyEmail: j.applyEmail || "",
      isActive: j.isActive,
    });
    setMsg(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const url = editing === "new" ? "/api/admin/jobs" : `/api/admin/jobs/${editing}`;
      const method = editing === "new" ? "POST" : "PUT";
      const res = await fetch(url, { method, headers, body: JSON.stringify(form) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      setMsg({ kind: "ok", text: editing === "new" ? "Job posted." : "Job updated." });
      setEditing(null);
      await load();
    } catch (err: any) {
      setMsg({ kind: "err", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number, title: string) {
    if (!confirm(`Delete "${title}" and all its applications?`)) return;
    const res = await fetch(`/api/admin/jobs/${id}`, { method: "DELETE", headers });
    if (res.ok) { setMsg({ kind: "ok", text: "Job deleted." }); await load(); }
    else setMsg({ kind: "err", text: "Delete failed." });
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Button>
          </Link>
          {!editing && (
            <Button onClick={startNew} className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
              <PlusCircle className="w-4 h-4" /> New Job Posting
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Job Postings</h1>
          <p className="text-zinc-400 text-sm mt-1">Create and manage open roles. Applications appear in your <Link href="/admin/inbox" className="text-orange-400 hover:underline">Inbox</Link>.</p>
        </div>

        {msg && (
          <div className={`mb-4 p-3 rounded text-sm ${msg.kind === "ok" ? "bg-green-500/10 text-green-400 border border-green-500/30" : "bg-red-500/10 text-red-400 border border-red-500/30"}`}>
            {msg.text}
          </div>
        )}

        {editing !== null && (
          <form onSubmit={save} className="mb-8 p-6 bg-zinc-950 border border-zinc-800 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing === "new" ? "New Job Posting" : `Edit Job #${editing}`}</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)} className="text-zinc-400">
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Title *</Label>
                <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/[^a-z0-9\s-]/g,"").replace(/\s+/g,"-") })} className="bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <Label>Slug (URL)</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="senior-editor" className="bg-zinc-900 border-zinc-700" />
                <p className="text-xs text-zinc-500 mt-1">/careers/{form.slug || "your-slug"}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Department</Label>
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <Label>Employment type</Label>
                <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} className="w-full h-9 rounded-md bg-zinc-900 border border-zinc-700 px-3 text-sm">
                  {["Full-time","Part-time","Contract","Freelance","Internship"].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Compensation (optional)</Label>
                <Input value={form.compensation} onChange={(e) => setForm({ ...form, compensation: e.target.value })} placeholder="e.g. $60–$90k CAD" className="bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <Label>Apply email (optional, for routing)</Label>
                <Input type="email" value={form.applyEmail} onChange={(e) => setForm({ ...form, applyEmail: e.target.value })} placeholder="careers@mapletechie.com" className="bg-zinc-900 border-zinc-700" />
              </div>
            </div>

            <div>
              <Label>One-line summary *</Label>
              <Input required value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="A short pitch shown on the careers list page" className="bg-zinc-900 border-zinc-700" />
            </div>

            <div>
              <Label>Description *</Label>
              <Textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={5} placeholder="What the role is, what we're trying to do, why it matters." className="bg-zinc-900 border-zinc-700" />
            </div>

            <div>
              <Label>Responsibilities * <span className="text-zinc-500 font-normal">(one per line)</span></Label>
              <Textarea required value={form.responsibilities} onChange={(e) => setForm({ ...form, responsibilities: e.target.value })} rows={6} placeholder="- Pitch and edit 4–6 stories a week&#10;- Set the editorial standard&#10;- ..." className="bg-zinc-900 border-zinc-700" />
            </div>

            <div>
              <Label>Requirements * <span className="text-zinc-500 font-normal">(one per line)</span></Label>
              <Textarea required value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} rows={6} placeholder="- 3+ years editing tech journalism&#10;- A point of view&#10;- ..." className="bg-zinc-900 border-zinc-700" />
            </div>

            <div>
              <Label>Nice to haves <span className="text-zinc-500 font-normal">(one per line, optional)</span></Label>
              <Textarea value={form.niceToHaves} onChange={(e) => setForm({ ...form, niceToHaves: e.target.value })} rows={3} className="bg-zinc-900 border-zinc-700" />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active (publish on careers page)
            </label>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
                {saving ? "Saving..." : editing === "new" ? "Publish Job" : "Save Changes"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} className="text-zinc-400">Cancel</Button>
            </div>
          </form>
        )}

        {jobs === null ? (
          <div className="text-zinc-500">Loading…</div>
        ) : !jobs.length ? (
          <div className="text-center py-12 text-zinc-500 border border-zinc-800 border-dashed rounded">
            <p>No job postings yet.</p>
            <Button onClick={startNew} className="mt-4 bg-orange-500 hover:bg-orange-600 text-white">Post your first job</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((j) => (
              <div key={j.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-bold text-lg">{j.title}</h3>
                      {j.isActive ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Active</Badge>
                      ) : (
                        <Badge className="bg-zinc-700 text-zinc-300 text-xs">Hidden</Badge>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400 mb-1">{j.summary}</p>
                    <p className="text-xs text-zinc-500">{j.department} · {j.location} · {j.employmentType}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link href={`/careers/${j.slug}`}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-white">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(j)} className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-400">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(j.id, j.title)} className="h-8 w-8 p-0 text-zinc-400 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
