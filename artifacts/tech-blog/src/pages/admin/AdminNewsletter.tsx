import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  Trash2,
  Send,
  Mail,
  RefreshCw,
  FileText,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { adminFetch, adminJson } from "@/lib/adminFetch";

interface Subscriber {
  id: number;
  email: string;
  status: string;
  source?: string | null;
  createdAt: string;
  confirmedAt?: string | null;
  unsubscribedAt?: string | null;
  lastSentAt?: string | null;
}

interface CandidatePost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  publishedAt: string;
}

export default function AdminNewsletter() {
  const [subs, setSubs] = useState<Subscriber[] | null>(null);
  const [candidates, setCandidates] = useState<CandidatePost[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [subject, setSubject] = useState("");
  const [editorNote, setEditorNote] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState<"" | "test" | "send" | "load" | "digest">("");
  const { toast } = useToast();

  async function loadSubs() {
    setBusy("load");
    try {
      const list = await adminJson<Subscriber[]>("/admin/subscribers");
      setSubs(list);
    } catch {
      setSubs([]);
    } finally {
      setBusy("");
    }
  }

  async function loadCandidates() {
    try {
      const posts = await adminJson<CandidatePost[]>("/admin/newsletter/posts");
      setCandidates(posts);
      // Start with nothing selected — opt-in, not opt-out.
      setSelected(new Set());
    } catch {
      setCandidates([]);
    }
  }

  useEffect(() => {
    loadSubs();
    loadCandidates();
  }, []);

  function togglePost(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set((candidates ?? []).map((p) => p.id)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function del(id: number) {
    if (!confirm("Remove this subscriber? This cannot be undone.")) return;
    await adminFetch(`/admin/subscribers/${id}`, { method: "DELETE" });
    await loadSubs();
  }

  async function sendTest() {
    if (!testEmail.trim() || !subject.trim()) {
      toast({ title: "Subject and test email are required.", variant: "destructive" });
      return;
    }
    setBusy("test");
    try {
      const json = await adminJson<{ success: boolean; posts: number }>("/admin/newsletter/test", {
        method: "POST",
        body: JSON.stringify({
          to: testEmail.trim(),
          subject,
          editorNote,
          postIds: Array.from(selected),
        }),
      });
      toast({
        title: "Test sent",
        description: `${json.posts} article${json.posts === 1 ? "" : "s"} included. Check ${testEmail}.`,
      });
    } catch (err: any) {
      toast({ title: "Test failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setBusy("");
    }
  }

  async function sendNow() {
    if (!subject.trim()) {
      toast({ title: "Add a subject first.", variant: "destructive" });
      return;
    }
    const activeCount = subs?.filter((s) => s.status === "active").length ?? 0;
    const articleCount = selected.size;
    if (
      !confirm(
        `Send "${subject}" to ${activeCount} active subscriber${activeCount === 1 ? "" : "s"} with ${articleCount} article${articleCount === 1 ? "" : "s"}? This goes out immediately and cannot be unsent.`,
      )
    )
      return;
    setBusy("send");
    try {
      const json = await adminJson<{ sent: number; failed: number; posts: number }>(
        "/admin/newsletter/send-now",
        {
          method: "POST",
          body: JSON.stringify({
            subject,
            editorNote,
            postIds: Array.from(selected),
          }),
        },
      );
      toast({
        title: "Newsletter sent",
        description: `Sent to ${json.sent} subscriber${json.sent === 1 ? "" : "s"} (${json.failed} failed, ${json.posts} article${json.posts === 1 ? "" : "s"}).`,
      });
      await loadSubs();
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setBusy("");
    }
  }

  async function sendEditorDigest() {
    if (!confirm("Send the weekly digest to all active editors now?")) return;
    setBusy("digest");
    try {
      await adminJson("/admin/newsletter/send-editor-digest", { method: "POST" });
      toast({ title: "Editor digest sent", description: "All active editors have been emailed." });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setBusy("");
    }
  }

  const active = subs?.filter((s) => s.status === "active") || [];
  const pending = subs?.filter((s) => s.status === "pending") || [];
  const unsub = subs?.filter((s) => s.status === "unsubscribed") || [];
  const allSelected =
    (candidates?.length ?? 0) > 0 && selected.size === (candidates?.length ?? 0);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { loadSubs(); loadCandidates(); }}
            disabled={busy === "load"}
            className="border-zinc-700 text-zinc-300 hover:text-white gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${busy === "load" ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="w-6 h-6 text-orange-500" /> Newsletter
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Pick the articles you want to include, write your note, then send. Nothing goes out automatically.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <Stat label="Active subscribers" value={active.length} accent="text-orange-400" />
          <Stat label="Pending confirmation" value={pending.length} />
          <Stat label="Unsubscribed" value={unsub.length} />
        </div>

        {/* ── Compose section ──────────────────────────────────────────── */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 mb-8 space-y-5">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-orange-400" /> Compose newsletter
          </h2>

          <div className="space-y-2">
            <Label className="text-zinc-300">Subject *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="The week in tech: Apple's quiet pivot, Tesla's loud one"
              maxLength={120}
              className="bg-zinc-900 border-zinc-700"
              data-testid="input-newsletter-subject"
            />
            <p className="text-xs text-zinc-500">{subject.length}/120 — keep it under 60 chars to avoid Gmail truncation.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">
              Editor's note <span className="text-zinc-500 text-xs font-normal">(optional)</span>
            </Label>
            <Textarea
              value={editorNote}
              onChange={(e) => setEditorNote(e.target.value)}
              placeholder="A short note from you. 1–3 paragraphs that frame the issue."
              rows={5}
              className="bg-zinc-900 border-zinc-700 resize-none"
              data-testid="textarea-editor-note"
            />
          </div>

          {/* Article picker */}
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800">
              <p className="text-xs uppercase tracking-wider text-zinc-400 font-bold">
                Articles to include{" "}
                <span className="text-zinc-500 normal-case font-normal">
                  — {selected.size} of {candidates?.length ?? 0} selected
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={allSelected ? deselectAll : selectAll}
                  className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                  data-testid="btn-select-all"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
            </div>

            {!candidates && (
              <p className="px-4 py-4 text-sm text-zinc-500">Loading articles…</p>
            )}
            {candidates && candidates.length === 0 && (
              <p className="px-4 py-4 text-sm text-zinc-500">
                No published articles in the last 30 days.
              </p>
            )}
            {candidates && candidates.length > 0 && (
              <ul className="divide-y divide-zinc-800/60 max-h-80 overflow-y-auto">
                {candidates.map((p) => (
                  <li
                    key={p.id}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      selected.has(p.id) ? "bg-orange-500/5" : "hover:bg-zinc-900/50"
                    }`}
                    onClick={() => togglePost(p.id)}
                  >
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => togglePost(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 shrink-0 border-zinc-600 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                      data-testid={`checkbox-post-${p.id}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-100 leading-snug">{p.title}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        <span className="text-orange-400 font-semibold uppercase tracking-wide text-[10px]">
                          {p.category}
                        </span>
                        {" · "}
                        {format(new Date(p.publishedAt), "MMM d, yyyy")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Send bar */}
          <div className="flex flex-wrap gap-3 pt-2 border-t border-zinc-800">
            <div className="flex gap-2 flex-1 min-w-[260px]">
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-zinc-900 border-zinc-700"
                data-testid="input-test-email"
              />
              <Button
                onClick={sendTest}
                disabled={busy === "test"}
                variant="outline"
                className="border-zinc-700 text-zinc-300 gap-2 shrink-0"
              >
                <Send className="w-4 h-4" /> {busy === "test" ? "Sending…" : "Send test"}
              </Button>
            </div>
            <Button
              onClick={sendNow}
              disabled={busy === "send" || !subject.trim()}
              className="bg-orange-500 hover:bg-orange-600 text-white gap-2 ml-auto"
              data-testid="button-send-now"
            >
              <Send className="w-4 h-4" />
              {busy === "send"
                ? "Sending…"
                : `Send to ${active.length} subscriber${active.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>

        {/* ── Editor digest section ─────────────────────────────────────── */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-zinc-400" /> Editor weekly digest
              </h2>
              <p className="text-sm text-zinc-500 mt-1">
                Sends each editor a summary of their own posts and site stats for the past 7 days.
                No longer automatic — send it whenever it feels useful.
              </p>
            </div>
            <Button
              onClick={sendEditorDigest}
              disabled={busy === "digest"}
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-300 gap-2 shrink-0"
              data-testid="button-editor-digest"
            >
              <Send className="w-3.5 h-3.5" />
              {busy === "digest" ? "Sending…" : "Send digest to editors"}
            </Button>
          </div>
        </div>

        {/* ── Subscriber list ───────────────────────────────────────────── */}
        <div>
          <h2 className="text-lg font-bold mb-3">All subscribers ({subs?.length || 0})</h2>
          {!subs && <div className="text-zinc-500">Loading…</div>}
          {subs && subs.length === 0 && (
            <div className="text-center py-12 text-zinc-500 border border-zinc-800 border-dashed rounded">
              No subscribers yet.
            </div>
          )}
          {subs && subs.length > 0 && (
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-zinc-400">
                  <tr>
                    <th className="text-left px-4 py-3">Email</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Source</th>
                    <th className="text-left px-4 py-3">Joined</th>
                    <th className="text-left px-4 py-3">Last sent</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.id} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                      <td className="px-4 py-3 font-mono text-xs">{s.email}</td>
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            s.status === "active"
                              ? "bg-green-500/20 text-green-400 border-green-500/30"
                              : s.status === "pending"
                                ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                : "bg-zinc-700/40 text-zinc-400 border-zinc-700"
                          }
                        >
                          {s.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{s.source || "—"}</td>
                      <td className="px-4 py-3 text-zinc-400">
                        {format(new Date(s.createdAt), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {s.lastSentAt ? format(new Date(s.lastSentAt), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => del(s.id)}
                          className="h-7 px-2 text-zinc-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
      <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${accent || "text-white"}`}>{value}</p>
    </div>
  );
}
