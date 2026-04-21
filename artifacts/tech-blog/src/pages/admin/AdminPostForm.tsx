import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  useCreatePost,
  useUpdatePost,
  useGetPost,
  useListCategories,
  useListEditors,
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
import { ImageUploadField } from "@/components/ImageUploadField";

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
const SLUG_LIMIT = 75;
const POST_TITLE_MIN = 40;
const POST_TITLE_MAX = 70;
const EXCERPT_MIN = 140;
const EXCERPT_MAX = 200;

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

function RangeCounter({ count, min, max, unit = "chars" }: { count: number; min: number; max: number; unit?: string }) {
  let color = "text-zinc-500";
  if (count > 0) {
    if (count < min) color = "text-amber-400";
    else if (count <= max) color = "text-emerald-400";
    else color = "text-red-400";
  }
  return (
    <span className={`text-xs ${color}`}>
      {count} {unit} <span className="text-zinc-600">· aim {min}–{max}</span>
    </span>
  );
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

export default function AdminPostForm({ postId }: AdminPostFormProps) {
  const isEditing = !!postId;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { user, token } = useAdmin();
  const { data: categories } = useListCategories();
  const { data: editors } = useListEditors();

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
    authorId: user?.id ?? 0,
    coverImage: "",
    readTime: 5,
    isFeatured: false,
    status: canChooseStatus ? "published" : "draft",
    seoTitle: "",
    seoDescription: "",
    seoKeywords: "",
    ogImage: "",
    seriesId: 0,
    seriesPosition: 1,
  });

  const [seriesList, setSeriesList] = useState<Array<{ id: number; slug: string; title: string }>>([]);
  useEffect(() => {
    fetch("/api/series")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setSeriesList(Array.isArray(list) ? list : []))
      .catch(() => setSeriesList([]));
  }, []);

  const createNewSeries = async () => {
    const title = window.prompt("New series title:");
    if (!title || !title.trim()) return;
    try {
      const r = await fetch("/api/admin/series", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(`Failed to create series: ${err.error || r.statusText}`);
        return;
      }
      const created = (await r.json()) as { id: number; slug: string; title: string };
      setSeriesList((prev) => [...prev, created].sort((a, b) => a.title.localeCompare(b.title)));
      setForm((f) => ({ ...f, seriesId: created.id }));
    } catch (e: any) {
      alert(`Failed to create series: ${e?.message ?? e}`);
    }
  };

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
        authorId: ep.authorId ?? 0,
        coverImage: ep.coverImage ?? "",
        readTime: ep.readTime ?? 5,
        isFeatured: ep.isFeatured ?? false,
        status: ep.status ?? "published",
        seoTitle: ep.seoTitle ?? "",
        seoDescription: ep.seoDescription ?? "",
        seoKeywords: Array.isArray(ep.seoKeywords) ? ep.seoKeywords.join(", ") : "",
        ogImage: ep.ogImage ?? "",
        seriesId: ep.seriesId ?? 0,
        seriesPosition: ep.seriesPosition ?? 1,
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
      seriesId: form.seriesId > 0 ? form.seriesId : null,
      seriesPosition: form.seriesId > 0 ? form.seriesPosition : null,
    };
    if (form.excerpt.trim()) payload.excerpt = form.excerpt.trim();
    if (form.coverImage.trim()) payload.coverImage = form.coverImage.trim();

    const existingAuthorId = (existingPost as any)?.authorId ?? null;
    if (user?.role === "admin" && form.authorId && (!isEditing || form.authorId !== existingAuthorId)) {
      payload.authorId = form.authorId;
    }
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
              <div className="flex items-center justify-between">
                <Label className="text-zinc-300">Title *</Label>
                <RangeCounter count={form.title.length} min={POST_TITLE_MIN} max={POST_TITLE_MAX} />
              </div>
              <Input
                value={form.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. Apple Vision Pro 2 review: a year later, is it worth it?"
                className="bg-zinc-900 border-zinc-700 text-white text-lg focus:border-orange-500"
              />
              <p className="text-xs text-zinc-500">
                Strong titles are clear and specific. Aim for {POST_TITLE_MIN}–{POST_TITLE_MAX} characters so they don't get cut off in Google or social previews.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-zinc-300">
                  Slug * <span className="text-zinc-500 text-xs font-normal">(URL part)</span>
                </Label>
                <CharCounter count={form.slug.length} limit={SLUG_LIMIT} />
              </div>
              <Input
                value={form.slug}
                onChange={(e) => {
                  setAutoSlug(false);
                  setForm((f) => ({ ...f, slug: e.target.value }));
                }}
                placeholder="apple-vision-pro-2-review"
                className="bg-zinc-900 border-zinc-700 text-white font-mono text-sm focus:border-orange-500"
              />
              <p className="text-xs text-zinc-500">
                Auto-fills from your title. Lowercase, dashes only — keep it short.
              </p>
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
                Author {user?.role !== "admin" && <span className="text-zinc-500 text-xs">(you)</span>}
              </Label>
              {user?.role === "admin" ? (
                <Select
                  value={form.authorId ? String(form.authorId) : ""}
                  onValueChange={(v) => {
                    const id = Number(v);
                    const ed = editors?.find((e) => e.id === id);
                    setForm((f) => ({ ...f, authorId: id, author: ed?.displayName ?? f.author }));
                  }}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white">
                    <SelectValue placeholder="Choose an editor" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                    {editors?.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={user?.displayName ?? ""}
                  disabled
                  className="bg-zinc-900 border-zinc-700 text-white disabled:opacity-70"
                />
              )}
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
              <Label className="text-zinc-300">Cover Image</Label>
              <ImageUploadField
                value={form.coverImage}
                onChange={(url) => setForm((f) => ({ ...f, coverImage: url }))}
                helpText="Upload from your device or paste a URL. Recommended: 1200×630."
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-zinc-300">Excerpt</Label>
                <RangeCounter count={form.excerpt.length} min={EXCERPT_MIN} max={EXCERPT_MAX} />
              </div>
              <Textarea
                value={form.excerpt}
                onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
                placeholder="A 1–2 sentence summary that hooks the reader. Shows on post cards and in Google results when no SEO description is set."
                rows={3}
                className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500 resize-none"
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-zinc-300">Content *</Label>
                <span className="text-xs text-zinc-500">
                  {countWords(form.content)} words <span className="text-zinc-600">· aim 800–1500 for in-depth pieces</span>
                </span>
              </div>
              <RichTextEditor
                value={form.content}
                onChange={(html) => setForm((f) => ({ ...f, content: html }))}
                placeholder="Start with a strong hook in the first sentence, then back it up. Use headings to break up long sections, and add an image or two if you have them."
              />
              <p className="text-xs text-zinc-500">
                Use the toolbar to format — no code needed. Aim for 800–1500 words for a full review or feature; 300–500 is fine for news.
              </p>
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
                    <Label className="text-zinc-300">Social Share Image</Label>
                    <ImageUploadField
                      value={form.ogImage}
                      onChange={(url) => setForm((f) => ({ ...f, ogImage: url }))}
                      helpText="Used when this post is shared on X, Facebook, or LinkedIn. Leave blank to fall back to the cover image. Recommended: 1200×630."
                    />
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

            <div className="md:col-span-2 p-4 bg-zinc-900 rounded-lg border border-zinc-800 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Series (optional)</p>
                  <p className="text-xs text-zinc-400">
                    Group this post with other parts. Readers will see a series banner with prev/next navigation.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={createNewSeries}
                  className="border-zinc-700 text-zinc-200 hover:bg-zinc-800 shrink-0"
                >
                  + New series
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <Label className="text-xs text-zinc-400">Series</Label>
                  <select
                    value={form.seriesId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, seriesId: Number(e.target.value) }))
                    }
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
                  >
                    <option value={0}>— Not part of a series —</option>
                    {seriesList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Part #</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.seriesPosition}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, seriesPosition: Math.max(1, Number(e.target.value) || 1) }))
                    }
                    disabled={form.seriesId === 0}
                    className="bg-zinc-950 border-zinc-700 text-white focus:border-orange-500"
                  />
                </div>
              </div>
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
