import { Link } from "wouter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ClipboardList, RefreshCw } from "lucide-react";
import { format } from "date-fns";

const TOKEN_KEY = "mapletechie_admin_token";

interface AuditEntry {
  id: number;
  userId: number | null;
  username: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

function actionTone(action: string) {
  if (action.startsWith("auth.login.fail")) return "bg-red-500/15 text-red-400 border-red-500/30";
  if (action.startsWith("auth.")) return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  if (action.endsWith(".delete")) return "bg-red-500/15 text-red-400 border-red-500/30";
  if (action.endsWith(".create") || action.endsWith(".approve")) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (action.endsWith(".update")) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-zinc-700/30 text-zinc-300 border-zinc-600/40";
}

export default function AdminAudit() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

  async function load() {
    setRows(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/audit-logs?limit=300", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.status === 401 || res.status === 403) {
        setError("You don't have access to the activity log. Only admin accounts can view this.");
        setRows([]);
        return;
      }
      if (!res.ok) {
        setError("Couldn't load activity. Please try again.");
        setRows([]);
        return;
      }
      setRows(await res.json());
    } catch {
      setError("Network error — couldn't reach the server.");
      setRows([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = rows?.filter((r) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      r.action.toLowerCase().includes(q) ||
      (r.username || "").toLowerCase().includes(q) ||
      (r.summary || "").toLowerCase().includes(q) ||
      (r.ip || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={load} className="border-zinc-700 text-zinc-300 hover:text-white gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-orange-400" />
            Activity Log
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Every login, post change, and moderation action — with timestamps and IP addresses. Use this to track who did what.
          </p>
        </div>

        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by username, action, IP, or summary..."
          className="w-full mb-6 bg-zinc-900 border border-zinc-700 text-white rounded px-3 py-2 text-sm focus:border-orange-500 outline-none"
        />

        {error && (
          <div className="mb-4 border border-red-500/40 bg-red-500/10 text-red-300 text-sm rounded p-3">
            {error}
          </div>
        )}

        {rows === null ? (
          <p className="text-zinc-500 text-sm">Loading…</p>
        ) : !filtered?.length ? (
          <div className="text-center py-12 text-zinc-500 border border-zinc-800 border-dashed rounded">
            No activity to show yet.
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="text-left px-4 py-3">When</th>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-left px-4 py-3">Action</th>
                  <th className="text-left px-4 py-3">Details</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-900/40">
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                      {format(new Date(r.createdAt), "MMM d, yyyy · h:mm:ss a")}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-white">{r.username || <em className="text-zinc-500">—</em>}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${actionTone(r.action)} text-xs`}>{r.action}</Badge>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{r.summary || "—"}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs font-mono hidden md:table-cell">{r.ip || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
