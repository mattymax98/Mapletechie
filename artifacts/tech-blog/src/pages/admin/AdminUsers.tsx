import { useState } from "react";
import { Link } from "wouter";
import { ImageUploadField } from "@/components/ImageUploadField";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from "@workspace/api-client-react";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Pencil, Trash2, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface UserRow {
  id: number;
  username: string;
  displayName: string;
  email?: string;
  bio?: string;
  avatarUrl?: string;
  twitterUrl?: string;
  linkedinUrl?: string;
  instagramUrl?: string;
  githubUrl?: string;
  websiteUrl?: string;
  role: string;
  canPublishDirectly: boolean;
  isActive: boolean;
}

const emptyForm = {
  username: "",
  password: "",
  displayName: "",
  email: "",
  bio: "",
  avatarUrl: "",
  twitterUrl: "",
  linkedinUrl: "",
  instagramUrl: "",
  githubUrl: "",
  websiteUrl: "",
  role: "editor",
  canPublishDirectly: false,
  isActive: true,
};

export default function AdminUsers() {
  const { user: me } = useAdmin();
  const { data: users, isLoading } = useListUsers();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [error, setError] = useState("");

  const invalidate = () => queryClient.invalidateQueries();

  const createMut = useCreateUser({
    mutation: {
      onSuccess: () => { invalidate(); closeAll(); },
      onError: (err: any) => setError(err?.message || "Failed to create user."),
    },
  });
  const updateMut = useUpdateUser({
    mutation: {
      onSuccess: () => { invalidate(); closeAll(); },
      onError: (err: any) => setError(err?.message || "Failed to update user."),
    },
  });
  const deleteMut = useDeleteUser({
    mutation: { onSuccess: invalidate },
  });

  const closeAll = () => {
    setEditing(null);
    setCreating(false);
    setForm({ ...emptyForm });
    setError("");
  };

  const openCreate = () => {
    setForm({ ...emptyForm });
    setError("");
    setCreating(true);
  };

  const openEdit = (u: UserRow) => {
    setForm({
      username: u.username,
      password: "",
      displayName: u.displayName,
      email: u.email ?? "",
      bio: u.bio ?? "",
      avatarUrl: u.avatarUrl ?? "",
      twitterUrl: u.twitterUrl ?? "",
      linkedinUrl: u.linkedinUrl ?? "",
      instagramUrl: u.instagramUrl ?? "",
      githubUrl: u.githubUrl ?? "",
      websiteUrl: u.websiteUrl ?? "",
      role: u.role,
      canPublishDirectly: u.canPublishDirectly,
      isActive: u.isActive,
    });
    setError("");
    setEditing(u);
  };

  const submit = () => {
    setError("");
    if (creating) {
      if (form.username.trim().length < 2) return setError("Username must be at least 2 characters.");
      if (form.password.length < 6) return setError("Password must be at least 6 characters.");
      if (!form.displayName.trim()) return setError("Display name is required.");
      const { username, password, displayName, ...rest } = form;
      createMut.mutate({ data: { username: username.trim().toLowerCase(), password, displayName: displayName.trim(), ...rest } as any });
    } else if (editing) {
      const { username, password, ...rest } = form;
      const payload: any = { ...rest };
      if (password.length >= 6) payload.password = password;
      updateMut.mutate({ id: editing.id, data: payload });
    }
  };

  const handleDelete = (u: UserRow) => {
    if (u.id === me?.id) return;
    if (confirm(`Delete editor "${u.displayName}"? Their posts will remain but become unowned.`)) {
      deleteMut.mutate({ id: u.id });
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Manage Editors</h1>
          <div className="ml-auto">
            <Button onClick={openCreate} className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
              <Plus className="w-4 h-4" /> Add Editor
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 bg-zinc-900" />)}</div>
        ) : (
          <div className="grid gap-4">
            {(users as UserRow[] | undefined)?.map((u) => (
              <Card key={u.id} className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 shrink-0">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-orange-400 font-bold">
                        {u.displayName.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">{u.displayName}</span>
                      <Badge className={u.role === "admin" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" : "bg-blue-500/20 text-blue-400 border-blue-500/30"}>
                        {u.role.toUpperCase()}
                      </Badge>
                      {!u.isActive && <Badge className="bg-red-500/20 text-red-400 border-red-500/30">DISABLED</Badge>}
                      {u.canPublishDirectly && u.role !== "admin" && (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">CAN PUBLISH</Badge>
                      )}
                    </div>
                    <p className="text-zinc-400 text-sm mt-0.5">@{u.username} {u.email && `· ${u.email}`}</p>
                    {u.bio && <p className="text-zinc-500 text-xs mt-1 line-clamp-2">{u.bio}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(u)} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1">
                      <Pencil className="w-3 h-3" /> Edit
                    </Button>
                    {u.id !== me?.id && (
                      <Button variant="outline" size="sm" onClick={() => handleDelete(u)} className="border-zinc-700 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 gap-1">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={creating || !!editing} onOpenChange={(open) => !open && closeAll()}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{creating ? "Add New Editor" : `Edit ${editing?.displayName}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-900 rounded p-3">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Username *</Label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  disabled={!creating}
                  placeholder="janedoe"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>{creating ? "Password *" : "New Password (optional)"}</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={creating ? "min 6 chars" : "Leave blank to keep"}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Display Name *</Label>
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="Jane Doe"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="jane@mapletechie.com"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Profile Picture</Label>
                <ImageUploadField
                  value={form.avatarUrl}
                  onChange={(url) => setForm({ ...form, avatarUrl: url })}
                  variant="avatar"
                  helpText="Upload a square photo or paste an image URL."
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Bio</Label>
                <Textarea
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder="Short biography shown under their posts and on author pages."
                  rows={3}
                  className="bg-zinc-800 border-zinc-700 resize-none"
                />
              </div>
              <div className="space-y-2"><Label>Twitter / X URL</Label><Input value={form.twitterUrl} onChange={(e) => setForm({ ...form, twitterUrl: e.target.value })} placeholder="https://x.com/..." className="bg-zinc-800 border-zinc-700" /></div>
              <div className="space-y-2"><Label>LinkedIn URL</Label><Input value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/..." className="bg-zinc-800 border-zinc-700" /></div>
              <div className="space-y-2"><Label>Instagram URL</Label><Input value={form.instagramUrl} onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })} placeholder="https://instagram.com/..." className="bg-zinc-800 border-zinc-700" /></div>
              <div className="space-y-2"><Label>GitHub URL</Label><Input value={form.githubUrl} onChange={(e) => setForm({ ...form, githubUrl: e.target.value })} placeholder="https://github.com/..." className="bg-zinc-800 border-zinc-700" /></div>
              <div className="space-y-2 col-span-2"><Label>Personal Website</Label><Input value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} placeholder="https://..." className="bg-zinc-800 border-zinc-700" /></div>

              <div className="col-span-2 flex items-center justify-between p-3 bg-zinc-800 rounded border border-zinc-700">
                <div>
                  <p className="text-sm font-medium">Can publish directly</p>
                  <p className="text-xs text-zinc-400">When OFF, their posts save as drafts until you approve them.</p>
                </div>
                <Switch
                  checked={form.canPublishDirectly}
                  onCheckedChange={(v) => setForm({ ...form, canPublishDirectly: v })}
                />
              </div>

              {!creating && editing?.id !== me?.id && (
                <div className="col-span-2 flex items-center justify-between p-3 bg-zinc-800 rounded border border-zinc-700">
                  <div>
                    <p className="text-sm font-medium">Account active</p>
                    <p className="text-xs text-zinc-400">Disabled accounts cannot log in.</p>
                  </div>
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAll} className="border-zinc-700 text-zinc-300">Cancel</Button>
            <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending} className="bg-orange-500 hover:bg-orange-600">
              {createMut.isPending || updateMut.isPending ? "Saving..." : creating ? "Create Editor" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
