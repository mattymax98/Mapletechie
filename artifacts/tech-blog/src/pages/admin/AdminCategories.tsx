import { useState } from "react";
import { Link } from "wouter";
import {
  useListCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "@workspace/api-client-react";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Pencil, Trash2, AlertCircle, Tag } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface CategoryRow {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  postCount: number;
  color?: string | null;
}

const emptyForm = { name: "", slug: "", description: "", color: "#f97316" };

export default function AdminCategories() {
  const { user } = useAdmin();
  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || !!user?.canManageCategories;
  const { data: categories, isLoading } = useListCategories();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [error, setError] = useState("");

  const invalidate = () => queryClient.invalidateQueries();

  const createMut = useCreateCategory({
    mutation: {
      onSuccess: () => {
        invalidate();
        closeAll();
      },
      onError: (err: any) => setError(err?.message || "Failed to create category."),
    },
  });
  const updateMut = useUpdateCategory({
    mutation: {
      onSuccess: () => {
        invalidate();
        closeAll();
      },
      onError: (err: any) => setError(err?.message || "Failed to update category."),
    },
  });
  const deleteMut = useDeleteCategory({
    mutation: {
      onSuccess: invalidate,
      onError: (err: any) => alert(err?.message || "Failed to delete category."),
    },
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

  const openEdit = (c: CategoryRow) => {
    setForm({
      name: c.name,
      slug: c.slug,
      description: c.description ?? "",
      color: c.color ?? "#f97316",
    });
    setError("");
    setEditing(c);
  };

  const submit = () => {
    setError("");
    if (form.name.trim().length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      description: form.description.trim() || null,
      color: form.color || null,
    };
    if (creating) {
      createMut.mutate({ data: payload as any });
    } else if (editing) {
      updateMut.mutate({ id: editing.id, data: payload as any });
    }
  };

  const handleDelete = (c: CategoryRow) => {
    if (c.postCount > 0) {
      alert(
        `Cannot delete "${c.name}" — ${c.postCount} post${c.postCount === 1 ? "" : "s"} still use it. Reassign those posts to another category first.`,
      );
      return;
    }
    if (
      confirm(
        `Delete category "${c.name}"? This only removes the category itself; the URL /category/${c.slug} will start returning 404.`,
      )
    ) {
      deleteMut.mutate({ id: c.id });
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/admin">
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-white gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Tag className="w-4 h-4 text-orange-500" /> Categories
          </h1>
          {canManage && (
            <div className="ml-auto">
              <Button
                onClick={openCreate}
                className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
              >
                <Plus className="w-4 h-4" /> New Category
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <p className="text-zinc-500 text-sm mb-6">
          Renaming a category automatically updates every post that uses it. Deleting
          is blocked while any post still references the category — reassign those
          posts first.
        </p>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 bg-zinc-900" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3">
            {(categories as CategoryRow[] | undefined)?.map((c) => (
              <Card key={c.id} className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                  <div
                    className="w-10 h-10 rounded shrink-0 border border-zinc-700"
                    style={{ backgroundColor: c.color || "#f97316" }}
                    title={c.color || "no color"}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">{c.name}</span>
                      <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 font-mono text-[10px]">
                        /category/{c.slug}
                      </Badge>
                      <Badge
                        className={
                          c.postCount > 0
                            ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                            : "bg-zinc-800 text-zinc-500 border-zinc-700"
                        }
                      >
                        {c.postCount} post{c.postCount === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    {c.description && (
                      <p className="text-zinc-400 text-sm mt-1 line-clamp-2">
                        {c.description}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(c)}
                        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(c)}
                        disabled={c.postCount > 0}
                        title={
                          c.postCount > 0
                            ? "Reassign posts before deleting"
                            : "Delete category"
                        }
                        className="border-zinc-700 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 gap-1 disabled:opacity-30"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {!categories?.length && (
              <p className="text-zinc-500 text-sm">No categories yet.</p>
            )}
          </div>
        )}
      </main>

      <Dialog open={creating || !!editing} onOpenChange={(open) => !open && closeAll()}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {creating ? "New Category" : `Edit: ${editing?.name}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-900 rounded p-3">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Quantum Computing"
                className="bg-zinc-800 border-zinc-700"
              />
              {editing && form.name.trim() !== editing.name && editing.postCount > 0 && (
                <p className="text-xs text-orange-400">
                  Renaming will also update {editing.postCount} existing post
                  {editing.postCount === 1 ? "" : "s"}.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                URL slug{" "}
                <span className="text-zinc-500 text-xs font-normal">
                  (auto-generated from name if blank)
                </span>
              </Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="quantum-computing"
                className="bg-zinc-800 border-zinc-700 font-mono text-sm"
              />
              <p className="text-xs text-zinc-500">
                Becomes <span className="font-mono">/category/{form.slug || "<slug>"}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Shown on the category page and in social previews."
                rows={3}
                className="bg-zinc-800 border-zinc-700 resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label>Accent color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-12 h-10 rounded border border-zinc-700 bg-zinc-800 cursor-pointer"
                />
                <Input
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="#f97316"
                  className="bg-zinc-800 border-zinc-700 font-mono text-sm flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeAll}
              className="border-zinc-700 text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={createMut.isPending || updateMut.isPending}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {createMut.isPending || updateMut.isPending
                ? "Saving..."
                : creating
                  ? "Create Category"
                  : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
