import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trash2, Send, Mail, RefreshCw, FileText, AlertCircle } from "lucide-react";
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

interface PreviewPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  publishedAt: string;
}

export default function AdminNewsletter() {
  const [subs, setSubs] = useState<Subscriber[] | null>(null);
  const [preview, setPreview] = useState<{ weekLabel: string; posts: PreviewPost[] } | null>(null);
  const [subject, setSubject] = useState("");
  const [editorNote, setEditorNote] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState<"" | "test" | "send" | "load">("");
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

  async function loadPreview() {
    try {
      const data = await adminJson<{ weekLabel: string; posts: PreviewPost[] }>("/admin/newsletter/preview");
      setPreview(data);
    } catch {
      setPreview({ weekLabel: "", posts: [] });
    }
  }

  useEffect(() => {
    loadSubs();
    loadPreview();
  }, []);

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
        body: JSON.stringify({ to: testEmail.trim(), subject, editorNote }),
      });
      toast({
        title: "Test sent",
        description: `${json.posts} posts included. Check ${testEmail}.`,
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
    const active = subs?.filter((s) => s.status === "active").length ?? 0;
    if (
      !confirm(
        `Send "${subject}" to ${active} active subscriber${active === 1 ? "" : "s"}? This goes out immediately and cannot be unsent.`,
      )
    )
      return;
    setBusy("send");
    try {
      const json = await adminJson<{ sent: number; failed: number; posts: number }>(
        "/admin/newsletter/send-now",
        {
          method: "POST",
          body: JSON.stringify({ subject, editorNote }),
        },
      );
      toast({
        title: "Digest sent",
        description: `Sent ${json.sent}, failed ${json.failed} (${json.posts} posts attached).`,
      });
      await loadSubs();
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setBusy("");
    }
  }

  const active = subs?.filter((s) => s.status === "active") || [];
  const pending = subs?.filter((s) => s.status === "pending") || [];
  const unsub = subs?.filter((s) => s.status === "unsubscribed") || [];

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
            onClick={() => { loadSubs(); loadPreview(); }}
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
            Hand-write the digest, see this week's posts that will be appended, then send to every active subscriber. There is no automatic schedule — nothing leaves the building until you click <strong>Send</strong>.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <Stat label="Active subscribers" value={active.length} accent="text-orange-400" />
          <Stat label="Pending confirmation" value={pending.length} />
          <Stat label="Unsubscribed" value={unsub.length} />
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 mb-8 space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-orange-400" /> Compose this week's digest
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
            <Label className="text-zinc-300">Editor's note <span className="text-zinc-500 text-xs font-normal">(optional)</span></Label>
            <Textarea
              value={editorNote}
              onChange={(e) => setEditorNote(e.target.value)}
              placeholder="A short note from you. 1–3 paragraphs that frame the week."
              rows={5}
              className="bg-zinc-900 border-zinc-700 resize-none"
              data-testid="textarea-editor-note"
            />
          </div>

          <div className="border border-zinc-800 rounded p-4 bg-zinc-900/40">
            <p className="text-xs uppercase tracking-wider text-zinc-400 font-bold mb-3">
              This week's posts (auto-appended to your note) {preview?.weekLabel && <span className="text-zinc-500 normal-case font-normal">· week of {preview.weekLabel}</span>}
            </p>
            {!preview && <p className="text-sm text-zinc-500">Loading…</p>}
            {preview && preview.posts.length === 0 && (
              <p className="text-sm text-amber-400/80 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                No posts published in the last 7 days — the digest will go out with just your editor's note.
              </p>
            )}
            {preview && preview.posts.length > 0 && (
              <ul className="space-y-2 text-sm">
                {preview.posts.map((p) => (
                  <li key={p.id} className="flex items-baseline gap-2">
                    <span className="text-orange-400 text-xs uppercase tracking-wider font-bold shrink-0">{p.category}</span>
                    <span className="text-zinc-200">{p.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
              <Button onClick={sendTest} disabled={busy === "test"} variant="outline" className="border-zinc-700 text-zinc-300 gap-2">
                <Send className="w-4 h-4" /> {busy === "test" ? "Sending…" : "Send test"}
              </Button>
            </div>
            <Button
              onClick={sendNow}
              disabled={busy === "send" || !subject.trim()}
              className="bg-orange-500 hover:bg-orange-600 text-white gap-2 ml-auto"
              data-testid="button-send-now"
            >
              <Send className="w-4 h-4" /> {busy === "send" ? "Sending…" : `Send to ${active.length} subscriber${active.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>

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
                      <td className="px-4 py-3 text-zinc-400">{format(new Date(s.createdAt), "MMM d, yyyy")}</td>
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
