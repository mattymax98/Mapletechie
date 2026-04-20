import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useUpdateCurrentUser } from "@workspace/api-client-react";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, AlertCircle, CheckCircle } from "lucide-react";

export default function AdminProfile() {
  const { user, refreshUser } = useAdmin();
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    bio: "",
    avatarUrl: "",
    twitterUrl: "",
    linkedinUrl: "",
    instagramUrl: "",
    githubUrl: "",
    websiteUrl: "",
    password: "",
  });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setForm({
        displayName: user.displayName ?? "",
        email: user.email ?? "",
        bio: user.bio ?? "",
        avatarUrl: user.avatarUrl ?? "",
        twitterUrl: user.twitterUrl ?? "",
        linkedinUrl: user.linkedinUrl ?? "",
        instagramUrl: user.instagramUrl ?? "",
        githubUrl: user.githubUrl ?? "",
        websiteUrl: user.websiteUrl ?? "",
        password: "",
      });
    }
  }, [user]);

  const updateMe = useUpdateCurrentUser({
    mutation: {
      onSuccess: async () => {
        setMsg({ kind: "ok", text: "Profile updated successfully." });
        setForm((f) => ({ ...f, password: "" }));
        await refreshUser();
      },
      onError: (err: any) => setMsg({ kind: "err", text: err?.message || "Failed to update profile." }),
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const { password, ...rest } = form;
    const payload: any = { ...rest };
    if (password.length >= 6) payload.password = password;
    else if (password.length > 0) {
      setMsg({ kind: "err", text: "Password must be at least 6 characters (or leave blank to keep current)." });
      return;
    }
    updateMe.mutate({ data: payload });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">My Profile</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <form onSubmit={submit} className="space-y-6">
          {msg && (
            <div className={`flex items-center gap-2 text-sm rounded p-3 border ${msg.kind === "ok" ? "text-green-400 bg-green-900/20 border-green-900/40" : "text-red-400 bg-red-900/20 border-red-900"}`}>
              {msg.kind === "ok" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {msg.text}
            </div>
          )}

          <div className="flex items-center gap-4 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-800 border-2 border-orange-500">
              {form.avatarUrl ? (
                <img src={form.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-orange-400">
                  {(form.displayName || user?.username || "?").charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm text-zinc-400">@{user?.username}</p>
              <p className="text-xs text-zinc-500 capitalize">{user?.role}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Display Name</Label>
              <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="bg-zinc-900 border-zinc-700" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Profile Picture URL</Label>
              <Input value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} placeholder="https://..." className="bg-zinc-900 border-zinc-700" />
              <p className="text-xs text-zinc-500">Paste a direct image URL (jpg/png/webp).</p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-zinc-900 border-zinc-700" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Bio</Label>
              <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={4} className="bg-zinc-900 border-zinc-700 resize-none" placeholder="Tell readers about yourself..." />
            </div>

            <div className="space-y-2"><Label>Twitter / X</Label><Input value={form.twitterUrl} onChange={(e) => setForm({ ...form, twitterUrl: e.target.value })} placeholder="https://x.com/yourhandle" className="bg-zinc-900 border-zinc-700" /></div>
            <div className="space-y-2"><Label>LinkedIn</Label><Input value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/you" className="bg-zinc-900 border-zinc-700" /></div>
            <div className="space-y-2"><Label>Instagram</Label><Input value={form.instagramUrl} onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })} placeholder="https://instagram.com/you" className="bg-zinc-900 border-zinc-700" /></div>
            <div className="space-y-2"><Label>GitHub</Label><Input value={form.githubUrl} onChange={(e) => setForm({ ...form, githubUrl: e.target.value })} placeholder="https://github.com/you" className="bg-zinc-900 border-zinc-700" /></div>
            <div className="space-y-2 md:col-span-2"><Label>Personal Website</Label><Input value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} placeholder="https://yoursite.com" className="bg-zinc-900 border-zinc-700" /></div>

            <div className="space-y-2 md:col-span-2 pt-4 border-t border-zinc-800">
              <Label>Change Password</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Leave blank to keep current (min 6 chars to change)"
                className="bg-zinc-900 border-zinc-700"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-zinc-800">
            <Button type="submit" disabled={updateMe.isPending} className="bg-orange-500 hover:bg-orange-600 gap-2">
              <Save className="w-4 h-4" /> {updateMe.isPending ? "Saving..." : "Save Profile"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
