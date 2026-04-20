import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trash2, Send, Mail, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const TOKEN_KEY = "mapletechie_admin_token";

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

export default function AdminNewsletter() {
  const [subs, setSubs] = useState<Subscriber[] | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState<"" | "test" | "send" | "load">("");
  const { toast } = useToast();

  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  async function load() {
    setBusy("load");
    try {
      const res = await fetch("/api/admin/subscribers", { headers });
      if (res.ok) setSubs(await res.json());
      else setSubs([]);
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function del(id: number) {
    if (!confirm("Remove this subscriber? This cannot be undone.")) return;
    await fetch(`/api/admin/subscribers/${id}`, { method: "DELETE", headers });
    await load();
  }

  async function sendTest() {
    if (!testEmail.trim()) {
      toast({ title: "Enter an email", variant: "destructive" });
      return;
    }
    setBusy("test");
    try {
      const res = await fetch("/api/admin/newsletter/test", {
        method: "POST",
        headers,
        body: JSON.stringify({ email: testEmail.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        toast({
          title: "Test sent",
          description: `${json.postCount || 0} posts included. Check ${testEmail}.`,
        });
      } else {
        toast({ title: "Failed", description: json.message, variant: "destructive" });
      }
    } finally {
      setBusy("");
    }
  }

  async function sendNow() {
    if (
      !confirm(
        "Send this week's digest to all active subscribers right now? This will not re-send to anyone who already received it.",
      )
    )
      return;
    setBusy("send");
    try {
      const res = await fetch("/api/admin/newsletter/send-now", {
        method: "POST",
        headers,
      });
      const json = await res.json();
      if (json.success) {
        toast({
          title: "Digest sent",
          description: `Sent to ${json.sent || 0}, skipped ${json.skipped || 0} (no new posts for them).`,
        });
        await load();
      } else {
        toast({ title: "Failed", description: json.message, variant: "destructive" });
      }
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
            onClick={load}
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
            The weekly digest goes out automatically every Friday at 5pm Toronto time. You can also send a test or trigger
            it manually below.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <Stat label="Active subscribers" value={active.length} accent="text-orange-400" />
          <Stat label="Pending confirmation" value={pending.length} />
          <Stat label="Unsubscribed" value={unsub.length} />
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 mb-8">
          <h2 className="text-lg font-bold mb-3">Send a test digest</h2>
          <p className="text-zinc-400 text-sm mb-4">
            Sends the current week's digest (or the latest 3 posts as fallback) to a single email so you can preview it.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@example.com"
              className="max-w-sm bg-zinc-900 border-zinc-700"
            />
            <Button onClick={sendTest} disabled={busy === "test"} className="bg-zinc-800 hover:bg-zinc-700 gap-2">
              <Send className="w-4 h-4" /> {busy === "test" ? "Sending…" : "Send test"}
            </Button>
          </div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 mb-8">
          <h2 className="text-lg font-bold mb-2">Send this week's digest now</h2>
          <p className="text-zinc-400 text-sm mb-4">
            Skips subscribers who already received the latest posts. Safe to run any time.
          </p>
          <Button onClick={sendNow} disabled={busy === "send"} className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
            <Send className="w-4 h-4" /> {busy === "send" ? "Sending…" : "Send digest now"}
          </Button>
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
