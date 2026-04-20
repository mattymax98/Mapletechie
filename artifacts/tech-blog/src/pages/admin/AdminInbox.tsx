import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trash2, Mail, Megaphone, Star, FileText, Briefcase, ExternalLink } from "lucide-react";
import { format } from "date-fns";

const TOKEN_KEY = "mapletechie_admin_token";

type Tab = "applications" | "reviews" | "ads" | "contacts";

export default function AdminInbox() {
  const [tab, setTab] = useState<Tab>("applications");
  const [data, setData] = useState<Record<Tab, any[] | null>>({
    applications: null, reviews: null, ads: null, contacts: null,
  });

  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  async function loadAll() {
    const [a, r, ad, c] = await Promise.all([
      fetch("/api/admin/applications", { headers }).then(res => res.ok ? res.json() : []),
      fetch("/api/admin/reviews", { headers }).then(res => res.ok ? res.json() : []),
      fetch("/api/admin/ad-inquiries", { headers }).then(res => res.ok ? res.json() : []),
      // Reuse existing /admin/inbox if any — fallback to empty
      fetch("/api/admin/contacts", { headers }).then(res => res.ok ? res.json() : []).catch(() => []),
    ]);
    setData({ applications: a, reviews: r, ads: ad, contacts: c });
  }

  useEffect(() => { loadAll(); }, []);

  async function del(url: string) {
    if (!confirm("Delete this entry? This cannot be undone.")) return;
    await fetch(url, { method: "DELETE", headers });
    await loadAll();
  }

  async function setReviewStatus(id: number, status: string) {
    await fetch(`/api/admin/reviews/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status }),
    });
    await loadAll();
  }

  const tabs: Array<{ id: Tab; label: string; icon: any; count: number }> = [
    { id: "applications", label: "Job Applications", icon: Briefcase, count: data.applications?.length || 0 },
    { id: "reviews", label: "Reader Reviews", icon: Star, count: data.reviews?.length || 0 },
    { id: "ads", label: "Ad Inquiries", icon: Megaphone, count: data.ads?.length || 0 },
    { id: "contacts", label: "Contact Messages", icon: Mail, count: data.contacts?.length || 0 },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Button>
          </Link>
          <Link href="/admin/jobs">
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white gap-2">
              <Briefcase className="w-4 h-4" /> Manage Jobs
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Inbox</h1>
          <p className="text-zinc-400 text-sm mt-1">All submissions from your readers, advertisers, and applicants in one place.</p>
          <p className="text-amber-400/80 text-xs mt-2 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 inline-block">
            <FileText className="w-3 h-3 inline mr-1" />
            Email forwarding to your inbox isn't enabled yet — connect a mail service (e.g. Resend) to also get these in your email.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6 border-b border-zinc-800 pb-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded ${tab === t.id ? "bg-orange-500 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              <span className={`text-xs px-2 py-0.5 rounded-full ${tab === t.id ? "bg-white/20" : "bg-zinc-800"}`}>{t.count}</span>
            </button>
          ))}
        </div>

        {tab === "applications" && (
          <div className="space-y-3">
            {data.applications?.length === 0 && <Empty label="No applications yet." />}
            {data.applications?.map((app: any) => (
              <div key={app.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
                <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                  <div>
                    <h3 className="font-bold text-lg">{app.name}</h3>
                    <a href={`mailto:${app.email}`} className="text-orange-400 text-sm hover:underline">{app.email}</a>
                    {app.phone && <span className="text-zinc-500 text-sm ml-3">· {app.phone}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span>Job #{app.jobId}</span>
                    <span>{format(new Date(app.createdAt), "MMM d, yyyy")}</span>
                    <Button size="sm" variant="ghost" onClick={() => del(`/api/admin/applications/${app.id}`)} className="h-7 px-2 text-zinc-400 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 mb-3">
                  {app.resumeUrl && <a href={app.resumeUrl} target="_blank" rel="noopener" className="text-xs px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-zinc-300 hover:text-orange-400 inline-flex items-center gap-1"><ExternalLink className="w-3 h-3"/> Resume</a>}
                  {app.portfolioUrl && <a href={app.portfolioUrl} target="_blank" rel="noopener" className="text-xs px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-zinc-300 hover:text-orange-400 inline-flex items-center gap-1"><ExternalLink className="w-3 h-3"/> Portfolio</a>}
                </div>
                <p className="text-zinc-300 text-sm whitespace-pre-line bg-zinc-900/50 p-3 rounded border border-zinc-800">{app.coverLetter}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "reviews" && (
          <div className="space-y-3">
            {data.reviews?.length === 0 && <Empty label="No reviews yet." />}
            {data.reviews?.map((r: any) => (
              <div key={r.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
                <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                  <div>
                    <h3 className="font-bold text-lg">{r.title}</h3>
                    <p className="text-sm text-zinc-400">
                      {r.name} · <a href={`mailto:${r.email}`} className="text-orange-400 hover:underline">{r.email}</a>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <div className="flex">
                      {[1,2,3,4,5].map(n => <Star key={n} className={`w-4 h-4 ${n <= r.rating ? "fill-orange-500 text-orange-500" : "text-zinc-700"}`} />)}
                    </div>
                    <span>{format(new Date(r.createdAt), "MMM d, yyyy")}</span>
                  </div>
                </div>
                <p className="text-zinc-300 text-sm whitespace-pre-line bg-zinc-900/50 p-3 rounded border border-zinc-800 mb-3">{r.body}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={r.status === "approved" ? "bg-green-500/20 text-green-400 border-green-500/30" : r.status === "rejected" ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"}>
                    {r.status}
                  </Badge>
                  {r.status !== "approved" && (
                    <Button size="sm" onClick={() => setReviewStatus(r.id, "approved")} className="h-7 px-3 text-xs bg-green-600 hover:bg-green-700">Approve</Button>
                  )}
                  {r.status !== "rejected" && (
                    <Button size="sm" variant="outline" onClick={() => setReviewStatus(r.id, "rejected")} className="h-7 px-3 text-xs border-zinc-700">Reject</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => del(`/api/admin/reviews/${r.id}`)} className="h-7 px-2 text-zinc-400 hover:text-red-400 ml-auto">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "ads" && (
          <div className="space-y-3">
            {data.ads?.length === 0 && <Empty label="No ad inquiries yet." />}
            {data.ads?.map((a: any) => (
              <div key={a.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
                <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                  <div>
                    <h3 className="font-bold text-lg">{a.companyName}</h3>
                    <p className="text-sm text-zinc-400">
                      {a.contactName} · <a href={`mailto:${a.email}`} className="text-orange-400 hover:underline">{a.email}</a>
                      {a.website && <> · <a href={a.website} target="_blank" rel="noopener" className="text-orange-400 hover:underline">{a.website}</a></>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span>{format(new Date(a.createdAt), "MMM d, yyyy")}</span>
                    <Button size="sm" variant="ghost" onClick={() => del(`/api/admin/ad-inquiries/${a.id}`)} className="h-7 px-2 text-zinc-400 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-3 text-xs">
                  <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-1 rounded">{a.adType}</span>
                  {a.budget && <span className="bg-zinc-900 border border-zinc-700 px-2 py-1 rounded text-zinc-300">Budget: {a.budget}</span>}
                </div>
                <p className="text-zinc-300 text-sm whitespace-pre-line bg-zinc-900/50 p-3 rounded border border-zinc-800">{a.message}</p>
                {a.creativeUrl && (
                  <div className="mt-3">
                    <a href={a.creativeUrl} target="_blank" rel="noopener">
                      <img src={a.creativeUrl} alt="Creative" className="max-h-48 border border-zinc-700 rounded" />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "contacts" && (
          <div className="space-y-3">
            {data.contacts?.length === 0 && <Empty label="No contact messages yet (or this view isn't wired up)." />}
            {data.contacts?.map((c: any) => (
              <div key={c.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
                <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
                  <div>
                    <h3 className="font-bold">{c.subject}</h3>
                    <p className="text-sm text-zinc-400">{c.name} · <a href={`mailto:${c.email}`} className="text-orange-400 hover:underline">{c.email}</a></p>
                  </div>
                  <span className="text-xs text-zinc-500">{format(new Date(c.createdAt), "MMM d, yyyy")}</span>
                </div>
                <p className="text-zinc-300 text-sm whitespace-pre-line bg-zinc-900/50 p-3 rounded border border-zinc-800">{c.message}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="text-center py-12 text-zinc-500 border border-zinc-800 border-dashed rounded">{label}</div>;
}
