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
import {
  ArrowLeft,
  Save,
  AlertCircle,
  FileText,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { RichTextEditor } from "@/components/RichTextEditor";

interface AdminPostFormProps {
  postId?: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const TITLE_LIMIT = 60;
const DESC_LIMIT = 160;

function CharCounter({ count, limit }: { count: number; limit: number }) {
  const ratio = count / limit;
  const color =
    count === 0
      ? "text-zinc-500"
      : ratio <= 0.9
        ? "text-emerald-400"
        : ratio <= 1
          ? "text-amber-400"
          : "text-red-400";
  return (
    <span className={`text-xs ${color}`}>
      {count}/{limit}
    </span>
  );
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
    seoTitle: "",
    seoDescription: "",
    seoKeywords: "",
    ogImage: "",
  });

  const [error, setError] = useState("");
  const [autoSlug, setAutoSlug] = useState(!isEditing);
  const [seoOpen, setSeoOpen] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (existingPost && !hydratedRef.current) {
      const ep = existingPost as any;
      setForm({
        title: ep.title ?? "",
        slug: ep.slug ?? "",
        excerpt: ep.excerpt ?? "",
        content: ep.content ?? "",
        category: ep.category ?? "",
        author: ep.author ?? "",
        coverImage: ep.coverImage ?? "",
        readTime: ep.readTime ?? 5,
        isFeatured: ep.isFeatured ?? false,
        status: ep.status ?? "published",
        seoTitle: ep.seoTitle ?? "",
        seoDescription: ep.seoDescription ?? "",
        seoKeywords: Array.isArray(ep.seoKeywords) ? ep.seoKeywords.join(", ") : "",
        ogImage: ep.ogImage ?? "",
      });
      setAutoSlug(false);
      hydratedRef.current = true;
    }
  }, [existingPost]);

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
    if (!form.content.trim() || form.content.trim() === "<p></p>")
      return setError("Content is required.");
    if (!form.category) return setError("Category is required.");

    const status = statusOverride ?? form.status;

    const keywordsArray = form.seoKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      content: form.content,
      category: form.category,
      readTime: form.readTime,
      isFeatured: form.isFeatured,
      status,
      seoTitle: form.seoTitle.trim() || null,
      seoDescription: form.seoDescription.trim() || null,
      seoKeywords: keywordsArray,
      ogImage: form.ogImage.trim() || null,
    };
    if (form.excerpt.trim()) payload.excerpt = form.excerpt.trim();
    if (form.coverImage.trim()) payload.coverImage = form.coverImage.trim();

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

  const previewTitle = (form.seoTitle.trim() || form.title || "Your post title") + " | Mapletechie";
  const previewDesc =
    form.seoDescription.trim() ||
    form.excerpt.trim() ||
    "Add an excerpt or SEO description to control how your post appears in search results.";
  const previewSlug = form.slug || "your-post-slug";

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-20">
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
                    {(form.category && categories?.find((c: any) => c.slug === form.category)?.name) ||
                      form.category ||
                      "Select a category"}
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
                placeholder="Short summary shown in post cards (1–2 sentences). Used as the meta description if you don't set one below."
                rows={3}
                className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500 resize-none"
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-zinc-300">Content *</Label>
                <span className="text-xs text-zinc-500">
                  Use the toolbar to format text — no code needed.
                </span>
              </div>
              <RichTextEditor
                value={form.content}
                onChange={(html) => setForm((f) => ({ ...f, content: html }))}
                placeholder="Start writing your article..."
              />
            </div>

            {/* SEO Section */}
            <div className="md:col-span-2 border border-zinc-800 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setSeoOpen((o) => !o)}
                className="w-full flex items-center justify-between p-4 bg-zinc-900 hover:bg-zinc-800/80 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Search className="w-5 h-5 text-orange-400" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white">SEO & Social Sharing</p>
                    <p className="text-xs text-zinc-400">
                      Control how this post shows up on Google and when shared on social media.
                    </p>
                  </div>
                </div>
                {seoOpen ? (
                  <ChevronUp className="w-5 h-5 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-zinc-400" />
                )}
              </button>

              {seoOpen && (
                <div className="p-4 space-y-5 bg-zinc-950 border-t border-zinc-800">
                  {/* Live Google preview */}
                  <div className="bg-white text-black rounded p-4 font-sans">
                    <p className="text-xs text-zinc-500 mb-1">Google search preview</p>
                    <p className="text-xs text-emerald-700 truncate">
                      mapletechie.com › blog › {previewSlug}
                    </p>
                    <p className="text-blue-700 text-lg leading-tight truncate">{previewTitle}</p>
                    <p className="text-sm text-zinc-700 line-clamp-2">{previewDesc}</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-zinc-300">SEO Title</Label>
                      <CharCounter count={form.seoTitle.length} limit={TITLE_LIMIT} />
                    </div>
                    <Input
                      value={form.seoTitle}
                      onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))}
                      placeholder="Leave blank to use the post title"
                      className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500"
                    />
                    <p className="text-xs text-zinc-500">
                      The headline Google shows. Aim for 50–60 characters and include your main keyword.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-zinc-300">Meta Description</Label>
                      <CharCounter count={form.seoDescription.length} limit={DESC_LIMIT} />
                    </div>
                    <Textarea
                      value={form.seoDescription}
                      onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))}
                      placeholder="Leave blank to use the excerpt"
                      rows={3}
                      className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500 resize-none"
                    />
                    <p className="text-xs text-zinc-500">
                      The short blurb under the headline. Aim for 140–160 characters with a clear hook.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-zinc-300">Keywords</Label>
                    <Input
                      value={form.seoKeywords}
                      onChange={(e) => setForm((f) => ({ ...f, seoKeywords: e.target.value }))}
                      placeholder="iphone 17, apple, smartphone review"
                      className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500"
                    />
                    <p className="text-xs text-zinc-500">
                      Comma-separated. 3–6 specific phrases people might search for.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-zinc-300">Social Share Image URL</Label>
                    <Input
                      value={form.ogImage}
                      onChange={(e) => setForm((f) => ({ ...f, ogImage: e.target.value }))}
                      placeholder="Leave blank to use the cover image"
                      className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500"
                    />
                    {form.ogImage && (
                      <div className="mt-2 border border-zinc-800 rounded overflow-hidden bg-zinc-950">
                        <img src={form.ogImage} alt="Social preview" className="w-full max-h-48 object-cover" />
                      </div>
                    )}
                    <p className="text-xs text-zinc-500">
                      The image that appears when you share this post on X, Facebook, or LinkedIn. Recommended: 1200×630.
                    </p>
                  </div>
                </div>
              )}
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
