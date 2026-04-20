import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  useCreatePost,
  useUpdatePost,
  useGetPost,
  useListCategories,
} from "@workspace/api-client-react";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Save, AlertCircle, FileText } from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminPostFormProps {
  postId?: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AdminPostForm({ postId }: AdminPostFormProps) {
  const isEditing = !!postId;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAdmin();
  const { data: categories } = useListCategories();

  const { data: existingPost, isLoading: loadingPost } = useGetPost(postId ?? 0, {
    query: { enabled: isEditing },
  });

  const canChooseStatus = user?.role === "admin" || user?.canPublishDirectly === true;

  const [form, setForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    category: "",
    author: user?.displayName ?? "",
    coverImage: "",
    readTime: 5,
    isFeatured: false,
    status: canChooseStatus ? "published" : "draft",
  });

  const [error, setError] = useState("");
  const [autoSlug, setAutoSlug] = useState(!isEditing);
  const hydratedRef = useRef(false);

  // Hydrate from existing post (edit mode) — only once
  useEffect(() => {
    if (existingPost && !hydratedRef.current) {
      setForm({
        title: existingPost.title ?? "",
        slug: existingPost.slug ?? "",
        excerpt: existingPost.excerpt ?? "",
        content: existingPost.content ?? "",
        category: existingPost.category ?? "",
        author: existingPost.author ?? "",
        coverImage: existingPost.coverImage ?? "",
        readTime: existingPost.readTime ?? 5,
        isFeatured: existingPost.isFeatured ?? false,
        status: (existingPost as any).status ?? "published",
      });
      setAutoSlug(false);
      hydratedRef.current = true;
    }
  }, [existingPost]);

  // Hydrate from AI draft (new mode only)
  useEffect(() => {
    if (isEditing) return;
    const raw = sessionStorage.getItem("ai-draft");
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      setForm((f) => ({
        ...f,
        title: d.title ?? f.title,
        slug: d.slug ?? f.slug,
        excerpt: d.excerpt ?? f.excerpt,
        content: d.content ?? f.content,
        category: d.category ?? f.category,
        author: d.author ?? f.author,
        coverImage: d.coverImage ?? f.coverImage,
        readTime: typeof d.readTime === "number" ? d.readTime : f.readTime,
      }));
      setAutoSlug(false);
    } catch {
      // ignore
    } finally {
      sessionStorage.removeItem("ai-draft");
    }
  }, [isEditing]);

  const handleTitleChange = (value: string) => {
    setForm((f) => ({
      ...f,
      title: value,
      slug: autoSlug ? slugify(value) : f.slug,
    }));
  };

  const createMutation = useCreatePost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
        navigate("/admin");
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to create post.";
        setError(msg);
      },
    },
  });

  const updateMutation = useUpdatePost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
        navigate("/admin");
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to update post.";
        setError(msg);
      },
    },
  });

  const submit = (e: React.FormEvent, statusOverride?: "draft" | "published") => {
    e.preventDefault();
    setError("");

    if (!form.title.trim()) return setError("Title is required.");
    if (!form.slug.trim()) return setError("Slug is required.");
    if (!form.content.trim()) return setError("Content is required.");
    if (!form.category) return setError("Category is required.");

    const status = statusOverride ?? form.status;

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      content: form.content.trim(),
      category: form.category,
      readTime: form.readTime,
      isFeatured: form.isFeatured,
      status,
    };
    if (form.excerpt.trim()) payload.excerpt = form.excerpt.trim();
    if (form.coverImage.trim()) payload.coverImage = form.coverImage.trim();

    // Author field is admin-only and only sent if admin actually changed it from current user's name
    if (!isEditing) {
      payload.author = form.author.trim() || user?.displayName || "Mapletechie";
      if (!statusOverride) payload.publishedAt = new Date().toISOString();
    } else if (user?.role === "admin" && form.author.trim()) {
      payload.author = form.author.trim();
    }

    if (isEditing && postId) {
      updateMutation.mutate({ id: postId, data: payload as any });
    } else {
      createMutation.mutate({ data: payload as any });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEditing && loadingPost) {
    return (
      <div className="min-h-screen bg-black p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <Skeleton className="h-8 w-48 bg-zinc-900" />
          <Skeleton className="h-12 w-full bg-zinc-900" />
          <Skeleton className="h-12 w-full bg-zinc-900" />
          <Skeleton className="h-64 w-full bg-zinc-900" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">{isEditing ? "Edit Post" : "New Post"}</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <form onSubmit={(e) => submit(e)} className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-900 rounded p-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="md:col-span-2 space-y-2">
              <Label className="text-zinc-300">Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Post title"
                className="bg-zinc-900 border-zinc-700 text-white text-lg focus:border-orange-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">
                Slug * <span className="text-zinc-500 text-xs font-normal">(URL-friendly name)</span>
              </Label>
              <Input
                value={form.slug}
                onChange={(e) => {
                  setAutoSlug(false);
                  setForm((f) => ({ ...f, slug: e.target.value }));
                }}
                placeholder="my-post-title"
                className="bg-zinc-900 border-zinc-700 text-white font-mono text-sm focus:border-orange-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Category *</Label>
              <Select
                value={form.category || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500">
                  <SelectValue placeholder="Select a category">
                    {form.category && categories?.find((c: any) => c.slug === form.category)?.name || form.category || "Select a category"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {categories?.map((c: any) => (
                    <SelectItem key={c.id} value={c.slug} className="text-white hover:bg-zinc-800">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">
                Author {user?.role !== "admin" && <span className="text-zinc-500 text-xs">(your name)</span>}
              </Label>
              <Input
                value={form.author}
                onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                placeholder="Author name"
                disabled={user?.role !== "admin"}
                className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500 disabled:opacity-70"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">
                Read Time <span className="text-zinc-500 text-xs font-normal">(minutes)</span>
              </Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={form.readTime}
                onChange={(e) => setForm((f) => ({ ...f, readTime: Number(e.target.value) }))}
                className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500"
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label className="text-zinc-300">Cover Image URL</Label>
              <Input
                value={form.coverImage}
                onChange={(e) => setForm((f) => ({ ...f, coverImage: e.target.value }))}
                placeholder="https://..."
                className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500"
              />
              {form.coverImage && (
                <div className="mt-2 border border-zinc-800 rounded overflow-hidden bg-zinc-950">
                  <img src={form.coverImage} alt="Cover preview" className="w-full max-h-48 object-cover" />
                </div>
              )}
              <p className="text-xs text-zinc-500">Paste any image URL. Leave blank to skip.</p>
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label className="text-zinc-300">Excerpt</Label>
              <Textarea
                value={form.excerpt}
                onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
                placeholder="Short summary shown in post cards (1-2 sentences)"
                rows={3}
                className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500 resize-none"
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label className="text-zinc-300">
                Content * <span className="text-zinc-500 text-xs font-normal">(HTML supported)</span>
              </Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="<p>Your article content here...</p>"
                rows={18}
                className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500 font-mono text-sm"
              />
            </div>

            <div className="md:col-span-2 flex items-center justify-between p-4 bg-zinc-900 rounded-lg border border-zinc-800">
              <div>
                <p className="text-sm font-medium text-white">Featured Post</p>
                <p className="text-xs text-zinc-400">Show this post in the featured hero section.</p>
              </div>
              <Switch
                checked={form.isFeatured}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isFeatured: v }))}
              />
            </div>

            {!canChooseStatus && (
              <div className="md:col-span-2 flex items-center gap-2 text-amber-400 text-xs bg-amber-900/20 border border-amber-900/40 rounded p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Your posts will be saved as drafts pending admin approval.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800 flex-wrap">
            <Link href="/admin">
              <Button type="button" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                Cancel
              </Button>
            </Link>
            {canChooseStatus && (
              <Button
                type="button"
                disabled={isPending}
                onClick={(e) => submit(e as any, "draft")}
                variant="outline"
                className="border-zinc-700 text-zinc-200 hover:bg-zinc-800 gap-2"
              >
                <FileText className="w-4 h-4" />
                Save as Draft
              </Button>
            )}
            <Button
              type="submit"
              disabled={isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
              onClick={(e) => submit(e as any, canChooseStatus ? "published" : "draft")}
            >
              <Save className="w-4 h-4" />
              {isPending
                ? "Saving..."
                : canChooseStatus
                  ? (isEditing ? "Update & Publish" : "Publish Post")
                  : (isEditing ? "Update Draft" : "Submit for Review")}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
