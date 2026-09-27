import { useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Briefcase, Inbox, Mail, ShieldAlert } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdmin } from "@/context/AdminContext";
import AdminJobs from "@/pages/admin/AdminJobs";
import AdminInbox from "@/pages/admin/AdminInbox";
import AdminSendEmail from "@/pages/admin/AdminSendEmail";

type ToolTab = "jobs" | "inbox" | "email";
const tabOptions: Array<{ id: ToolTab; label: string; icon: typeof Briefcase; permitted: (u: any) => boolean }> = [
  { id: "jobs", label: "Jobs", icon: Briefcase, permitted: (u) => u?.role === "admin" || u?.canManageJobs === true },
  { id: "inbox", label: "Inbox", icon: Inbox, permitted: (u) => u?.role === "admin" || u?.canViewInbox === true },
  { id: "email", label: "Send email", icon: Mail, permitted: (u) => u?.role === "admin" || u?.canSendEmail === true },
];

export default function AdminTools({ legacy }: { legacy?: ToolTab }) {
  const { user } = useAdmin();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const allowed = tabOptions.filter((tab) => tab.permitted(user));
  const requested = legacy ?? new URLSearchParams(search).get("tab");
  const selected = allowed.find((tab) => tab.id === requested) ?? allowed[0];
  useEffect(() => {
    if (!selected) return;
    const expected = `/admin/tools?tab=${selected.id}`;
    if (`${location}${search ? `?${search}` : ""}` !== expected) navigate(expected, { replace: true });
  }, [legacy, location, search, navigate, selected?.id]);
  if (!selected) return <AdminShell title="Tools"><main className="mx-auto max-w-3xl px-4 py-12"><div className="border border-zinc-800 bg-zinc-900/40 p-8 text-center"><ShieldAlert className="mx-auto h-7 w-7 text-zinc-500" /><h2 className="mt-3 text-lg text-zinc-100">Tools access unavailable</h2><p className="mt-1 text-sm text-zinc-500">Your account does not have access to these tools.</p><Link href="/admin" className="mt-4 inline-block text-sm text-orange-400">Return to posts</Link></div></main></AdminShell>;
  const Page = selected.id === "jobs" ? AdminJobs : selected.id === "inbox" ? AdminInbox : AdminSendEmail;
  return <AdminShell title="Tools">
    <main className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
      <nav aria-label="Admin tools" className="flex gap-1 overflow-x-auto border-b border-zinc-800">
        {allowed.map((tab) => <Link key={tab.id} href={`/admin/tools?tab=${tab.id}`} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium ${selected.id === tab.id ? "border-orange-500 text-orange-300" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}><tab.icon className="h-3.5 w-3.5" />{tab.label}</Link>)}
      </nav>
    </main>
    <Page embedded />
  </AdminShell>;
}