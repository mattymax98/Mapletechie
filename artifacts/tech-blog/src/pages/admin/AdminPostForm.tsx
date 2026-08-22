import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  useCreatePost,
  useUpdatePost,
  useGetPost,
  getGetPostQueryKey,
  useListCategories,
  useListEditors,
} from "@workspace/api-client-react";
import { useAdmin } from "@/context/AdminContext";
import { AdminShell } from "@/components/admin/AdminShell";
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
  Sparkles,
  Loader2,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ImageUploadField, type ImagePreviewStatus } from "@/components/ImageUploadField";
import { countImagesMissingAltText } from "@/lib/ensureImgAlt";

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

  const {
    data: existingPost,
    isLoading: loadingPost,
    isError: postLoadFailed,
  } = useGetPost(postId ?? 0, {
    query: { enabled: isEditing, queryKey: getGetPostQueryKey(postId ?? 0) },
  });

  const canChooseStatus = user?.role === "admin" || user?.canPublishDirectly === true;

  const [coverImageStatus, setCoverImageStatus] = useState<ImagePreviewStatus>("idle");
  const [ogImageStatus, setOgImageStatus] = useState<ImagePreviewStatus>("idle");
  const hasBrokenImage = coverImageStatus === "broken" || ogImageStatus === "broken";
  const { toast } = useToast();
  // Dismissible inline notice when the saved post still points at images on
  // external sites (the server's copy-to-our-storage step is best-effort).
  const [externalImageNoticeDismissed, setExternalImageNoticeDismissed] = useState(false);

  const initialFormState = {
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    // Multi-category: slugs, `primaryCategory` must be one of them (defaults
    // to the first picked). The API still accepts legacy single `category`.
    categories: [] as string[],
    primaryCategory: "",
    author: user?.displayName ?? "",
    authorId: user?.id ?? 0,
    coverImage: "",
    coverImageAlt: "",
    readTime: 5,
    isFeatured: false,
    status: canChooseStatus ? "published" : "draft",
    scheduledFor: "",
    seoTitle: "",
    seoDescription: "",
    seoKeywords: "",
    ogImage: "",
    seriesId: 0,
    seriesPosition: 1,
    rating: "",
    pros: "",
    cons: "",
    verdict: "",
  };
  const [form, setForm] = useState(initialFormState);

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

  const generateCoverWithAI = async () => {
    const prompt = aiPrompt.trim() || form.title.trim();
    if (!prompt) {
      setAiError("Give the post a title or describe the image first.");
      return;
    }
    setAiError("");
    setAiGenerating(true);
    try {
      const r = await fetch("/api/admin/generate-cover-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setAiError(data.error || `Generation failed (HTTP ${r.status})`);
        return;
      }
      setForm((f) => ({ ...f, coverImage: data.url }));
    } catch (e: any) {
      setAiError(e?.message ?? "Generation failed. Try again.");
    } finally {
      setAiGenerating(false);
    }
  };

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [autoSlug, setAutoSlug] = useState(!isEditing);
  const [seoOpen, setSeoOpen] = useState(false);
  // ogPreviewSrc is either a direct image URL (when ogImage is set) or a
  // blob URL created from a fetched branded card (when only coverImage is set).
  const [ogPreviewSrc, setOgPreviewSrc] = useState("");
  const ogPreviewBlobRef = useRef("");
  const hydratedRef = useRef(false);
  const errorBannerRef = useRef<HTMLDivElement | null>(null);

  // Local-draft autosave (protects unsaved work in the browser).
  const draftKey = isEditing ? `mapletechie-draft:${postId}` : `mapletechie-draft:new`;
  const [draftRestored, setDraftRestored] = useState(false);
  const [autosavedAt, setAutosavedAt] = useState<number | null>(null);
  // Baseline = the canonical "clean" state. For new posts it's the empty
  // initial form; for edits it's the hydrated server copy. Anything different
  // counts as dirty and triggers the unsaved-changes warning.
  const baselineRef = useRef<string>(JSON.stringify(initialFormState));
  const savedSuccessfullyRef = useRef(false);
  const clearLocalDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
    setAutosavedAt(null);
  };

  useEffect(() => {
    if (existingPost && !hydratedRef.current) {
      const ep = existingPost as any;
      const hydrated = {
        title: ep.title ?? "",
        slug: ep.slug ?? "",
        excerpt: ep.excerpt ?? "",
        content: ep.content ?? "",
        // The API returns all categories (primary first) under `categories`;
        // fall back to the legacy single categorySlug for old responses.
        categories:
          Array.isArray(ep.categories) && ep.categories.length > 0
            ? ep.categories.map((c: any) => c.slug)
            : [ep.categorySlug ?? ep.category].filter(Boolean),
        primaryCategory: ep.categories?.[0]?.slug ?? ep.categorySlug ?? "",
        author: ep.author ?? "",
        authorId: ep.authorId ?? 0,
        coverImage: ep.coverImage ?? "",
        coverImageAlt: ep.coverImageAlt ?? "",
        readTime: ep.readTime ?? 5,
        isFeatured: ep.isFeatured ?? false,
        status: ep.status ?? "published",
        scheduledFor: ep.scheduledFor
          ? new Date(ep.scheduledFor).toISOString().slice(0, 16)
          : "",
        seoTitle: ep.seoTitle ?? "",
        seoDescription: ep.seoDescription ?? "",
        seoKeywords: Array.isArray(ep.seoKeywords) ? ep.seoKeywords.join(", ") : "",
        ogImage: ep.ogImage ?? "",
        seriesId: ep.seriesId ?? 0,
        seriesPosition: ep.seriesPosition ?? 1,
        rating: ep.rating != null ? String(ep.rating) : "",
        pros: Array.isArray(ep.pros) ? ep.pros.join("\n") : "",
        cons: Array.isArray(ep.cons) ? ep.cons.join("\n") : "",
        verdict: ep.verdict ?? "",
      };
      setForm(hydrated);
      baselineRef.current = JSON.stringify(hydrated);
      setAutoSlug(false);
      hydratedRef.current = true;
    }
  }, [existingPost]);

  // Restore any locally-autosaved draft. For new posts, runs once on mount.
  // For edits, runs once after the server post has hydrated, so we can compare
  // against the canonical baseline before offering to restore.
  useEffect(() => {
    if (draftRestored) return;
    if (isEditing && !hydratedRef.current) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) {
        setDraftRestored(true);
        return;
      }
      const parsed = JSON.parse(raw);
      const savedForm = parsed?.form;
      const savedAt = Number(parsed?.savedAt) || 0;
      if (!savedForm) {
        localStorage.removeItem(draftKey);
        setDraftRestored(true);
        return;
      }
      // For edits, only prompt if the saved draft actually differs from the
      // server copy — otherwise it's stale noise.
      if (isEditing && JSON.stringify(savedForm) === baselineRef.current) {
        localStorage.removeItem(draftKey);
        setDraftRestored(true);
        return;
      }
      const when = savedAt ? new Date(savedAt).toLocaleString() : "earlier";
      const ok = window.confirm(
        `You have an unsaved local draft from ${when}.\n\nClick OK to restore it, or Cancel to discard it and use the saved version.`,
      );
      if (ok) {
        setForm(savedForm);
        setAutoSlug(false);
        setAutosavedAt(savedAt || Date.now());
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch {
      // ignore corrupt drafts
    }
    setDraftRestored(true);
  }, [draftRestored, isEditing, existingPost, draftKey]);

  // Autosave the form to localStorage as the user types (debounced 800ms).
  // Only writes when the form differs from the canonical baseline (empty
  // initial state for new posts, hydrated server copy for edits) so we don't
  // create bogus drafts just by visiting the page.
  useEffect(() => {
    if (!draftRestored) return;
    if (savedSuccessfullyRef.current) return;
    if (JSON.stringify(form) === baselineRef.current) return;
    const t = setTimeout(() => {
      try {
        const now = Date.now();
        localStorage.setItem(draftKey, JSON.stringify({ form, savedAt: now }));
        setAutosavedAt(now);
      } catch {
        // ignore quota errors
      }
    }, 800);
    return () => clearTimeout(t);
  }, [form, draftKey, draftRestored]);

  // Build the OG preview whenever share-relevant fields change (debounced 800ms).
  //
  // When the editor has set a custom Social Share Image (ogImage), that URL IS
  // the og:image social networks will consume — show it directly.
  //
  // When only a cover image is present, the published post uses the branded
  // card route. We mirror that by fetching /api/admin/og-preview.png (admin-
  // authenticated) and turning the response into a blob URL so the <img> tag
  // can display it without needing the Authorization header in the src.
  useEffect(() => {
    // Clean up any previous blob URL immediately when inputs change.
    const prevBlob = ogPreviewBlobRef.current;
    if (prevBlob) {
      URL.revokeObjectURL(prevBlob);
      ogPreviewBlobRef.current = "";
    }

    // If a custom social image is set, show it directly — that's the real card.
    if (form.ogImage) {
      setOgPreviewSrc(form.ogImage);
      return;
    }

    if (!form.title) {
      setOgPreviewSrc("");
      return;
    }

    const controller = new AbortController();
    const t = setTimeout(async () => {
      const kicker =
        categories?.find((c: any) => c.slug === form.primaryCategory)?.name ?? "";
      const params = new URLSearchParams();
      params.set("title", form.title);
      if (form.excerpt) params.set("subtitle", form.excerpt);
      if (kicker) params.set("kicker", kicker);
      // Only pass the cover image if it is an internal object-storage path —
      // the server enforces the same rule, but belt-and-suspenders here too.
      if (form.coverImage.startsWith("/api/storage/objects/")) {
        params.set("coverImage", form.coverImage);
      }
      try {
        const resp = await fetch(`/api/admin/og-preview.png?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!resp.ok) return;
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        ogPreviewBlobRef.current = url;
        setOgPreviewSrc(url);
      } catch {
        // AbortError or network failure — silently skip.
      }
    }, 800);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [form.title, form.excerpt, form.ogImage, form.coverImage, form.primaryCategory, categories, token]);

  // Revoke any lingering blob URL when the editor unmounts.
  useEffect(() => {
    return () => {
      if (ogPreviewBlobRef.current) URL.revokeObjectURL(ogPreviewBlobRef.current);
    };
  }, []);

  // Browser-level "you have unsaved changes" warning. Fires whenever the
  // current form differs from the canonical baseline (covers every field,
  // not just title/slug/content).
  const isDirty =
    draftRestored &&
    !savedSuccessfullyRef.current &&
    JSON.stringify(form) !== baselineRef.current;

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

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
        categories: d.category ? [d.category] : f.categories,
        primaryCategory: d.category ?? f.primaryCategory,
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

  // True when a URL points at an image hosted outside Mapletechie (not a
  // relative path, not our own domain, not our object storage).
  const isExternalImageRef = (url: string | undefined | null): boolean => {
    if (!url || !/^https?:\/\//i.test(url.trim())) return false;
    try {
      const host = new URL(url.trim()).hostname.toLowerCase();
      return host !== "mapletechie.com" && !host.endsWith(".mapletechie.com");
    } catch {
      return false;
    }
  };

  // Derive the notice from the SAVED post (server state), not from what's
  // being typed right now — an unsaved external URL hasn't failed to persist
  // yet, so warning about it would be misleading.
  const externalImageProblems: string[] = [];
  const savedPost = existingPost as
    | { coverImage?: string; ogImage?: string; content?: string }
    | undefined;
  if (savedPost) {
    if (isExternalImageRef(savedPost.coverImage)) {
      externalImageProblems.push("the cover image");
    }
    if (isExternalImageRef(savedPost.ogImage)) {
      externalImageProblems.push("the social share image");
    }
    const bodyMatches = new Set<string>();
    for (const m of (savedPost.content ?? "").matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
      const src = m[1].replace(/&amp;/g, "&");
      if (isExternalImageRef(src)) bodyMatches.add(src);
    }
    if (bodyMatches.size > 0) {
      externalImageProblems.push(
        `${bodyMatches.size} image${bodyMatches.size === 1 ? "" : "s"} in the article body`,
      );
    }
  }
  const showExternalImageNotice =
    isEditing && !loadingPost && !externalImageNoticeDismissed && externalImageProblems.length > 0;

  const notifyImageWarnings = (data: unknown) => {
    const warnings = (data as { imageWarnings?: string[] } | undefined)?.imageWarnings;
    if (Array.isArray(warnings) && warnings.length > 0) {
      toast({
        variant: "destructive",
        title: "Some images couldn't be saved to Mapletechie's storage",
        description:
          warnings.join(" ") +
          " Consider re-uploading them so the post doesn't break if the external site removes them.",
        duration: 15000,
      });
    }
  };

  const handleTitleChange = (value: string) => {
    setForm((f) => ({
      ...f,
      title: value,
      slug: autoSlug ? slugify(value) : f.slug,
    }));
  };

  const createMutation = useCreatePost({
    mutation: {
      onSuccess: (data: unknown) => {
        notifyImageWarnings(data);
        savedSuccessfullyRef.current = true;
        clearLocalDraft();
        queryClient.invalidateQueries();
        navigate("/admin");
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to create post.";
        setError(msg);
        requestAnimationFrame(() =>
          errorBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
        );
      },
    },
  });

  const updateMutation = useUpdatePost({
    mutation: {
      onSuccess: (data: unknown) => {
        notifyImageWarnings(data);
        savedSuccessfullyRef.current = true;
        clearLocalDraft();
        queryClient.invalidateQueries();
        navigate("/admin");
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to update post.";
        setError(msg);
        requestAnimationFrame(() =>
          errorBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
        );
      },
    },
  });

  const submit = (e: React.FormEvent, statusOverride?: "draft" | "published" | "scheduled") => {
    e.preventDefault();
    setError("");

    const fail = (msg: string, fieldId?: string) => {
      setError(msg);
      // If the bad field lives inside the SEO collapsible panel, open it
      // first so the scroll target is actually visible.
      if (fieldId === "field-og") setSeoOpen(true);
      requestAnimationFrame(() => {
        const target = fieldId ? document.getElementById(fieldId) : null;
        const node = target ?? errorBannerRef.current;
        node?.scrollIntoView({ behavior: "smooth", block: "center" });
        // Focus the first input/textarea inside the section so the user can
        // start typing immediately without an extra click.
        if (target) {
          const focusable = target.querySelector<HTMLElement>(
            "input, textarea, [contenteditable='true'], button[role='combobox']",
          );
          focusable?.focus({ preventScroll: true });
        }
      });
      return undefined;
    };

    if (!form.title.trim()) return fail("Title is required.", "field-title");
    if (!form.slug.trim()) return fail("Slug is required.", "field-slug");
    if (!form.content.trim() || form.content.trim() === "<p></p>")
      return fail("Content is required.", "field-content");
    if (form.categories.length === 0) return fail("Pick at least one category.", "field-category");
    if (coverImageStatus === "broken")
      return fail("The cover image URL didn't load. Fix or remove it before saving.", "field-cover");
    if (ogImageStatus === "broken")
      return fail("The social share image URL didn't load. Fix or remove it before saving.", "field-og");

    const status = statusOverride ?? form.status;

    if (status === "scheduled") {
      if (!form.scheduledFor) {
        return setError("Pick a date and time to schedule this post.");
      }
      const when = new Date(form.scheduledFor);
      if (isNaN(when.getTime())) return setError("Scheduled date is invalid.");
      if (when.getTime() <= Date.now() + 30_000) {
        return setError("Scheduled time must be in the future.");
      }
    }

    const keywordsArray = form.seoKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      content: form.content,
      categories: form.categories,
      primaryCategory:
        form.primaryCategory && form.categories.includes(form.primaryCategory)
          ? form.primaryCategory
          : form.categories[0],
      readTime: form.readTime,
      isFeatured: form.isFeatured,
      status,
      scheduledFor:
        status === "scheduled" && form.scheduledFor
          ? new Date(form.scheduledFor).toISOString()
          : null,
      seoTitle: form.seoTitle.trim() || null,
      seoDescription: form.seoDescription.trim() || null,
      seoKeywords: keywordsArray,
      ogImage: form.ogImage.trim() || null,
      seriesId: form.seriesId > 0 ? form.seriesId : null,
      seriesPosition: form.seriesId > 0 ? form.seriesPosition : null,
      rating: form.rating.trim() ? Number(form.rating) : null,
      pros: form.pros.split("\n").map((s) => s.trim()).filter(Boolean),
      cons: form.cons.split("\n").map((s) => s.trim()).filter(Boolean),
      verdict: form.verdict.trim() || null,
    };
    if (form.excerpt.trim()) payload.excerpt = form.excerpt.trim();
    if (form.coverImage.trim()) payload.coverImage = form.coverImage.trim();
    payload.coverImageAlt = form.coverImageAlt.trim() || null;

    const existingAuthorId = (existingPost as any)?.authorId ?? null;
    if (user?.role === "admin" && form.authorId && (!isEditing || form.authorId !== existingAuthorId)) {
      payload.authorId = form.authorId;
    }
    if (!isEditing) {
      payload.author = form.author.trim() || user?.displayName || "Mapletechie";
      if (!statusOverride && status === "published") payload.publishedAt = new Date().toISOString();
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

  const previewTitle = (form.seoTitle.trim() || form.title || "Your post title") + " | Mapletechie";
  const previewDesc =
    form.seoDescription.trim() ||
    form.excerpt.trim() ||
    "Add an excerpt or SEO description to control how your post appears in search results.";
  const previewSlug = form.slug || "your-post-slug";

  return (
    <AdminShell title={isEditing ? "Edit Post" : "New Post"}>
      {isEditing && loadingPost ? (
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-8 w-48 bg-zinc-900" />
          <Skeleton className="h-12 w-full bg-zinc-900" />
          <Skeleton className="h-12 w-full bg-zinc-900" />
          <Skeleton className="h-64 w-full bg-zinc-900" />
        </div>
      ) : isEditing && (postLoadFailed || !existingPost) ? (
        <main className="max-w-4xl mx-auto px-4 py-16">
          <div className="max-w-lg mx-auto border border-zinc-800 bg-zinc-900/60 rounded-lg p-8 text-center">
            <AlertCircle className="w-10 h-10 mx-auto mb-4 text-amber-400" />
            <h1 className="text-xl font-semibold text-white mb-2">Post could not be loaded</h1>
            <p className="text-sm text-zinc-400 mb-6">
              This post may no longer exist, or you may not have permission to edit it.
            </p>
            <Button asChild variant="outline" className="border-zinc-700 text-zinc-200">
              <Link href="/admin">Back to dashboard</Link>
            </Button>
          </div>
        </main>
      ) : (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <form onSubmit={(e) => submit(e)} className="space-y-6">
          {error && (
            <div
              ref={errorBannerRef}
              className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-900 rounded p-3"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {showExternalImageNotice && (
            <div className="flex items-start gap-2 text-amber-300 text-sm bg-amber-900/20 border border-amber-800 rounded p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                This post still loads {externalImageProblems.join(", ")} from external
                sites — Mapletechie couldn't save a copy. If those sites remove the
                images, they'll break here. Re-upload them to fix this for good.
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setExternalImageNoticeDismissed(true)}
                className="text-amber-400/70 hover:text-amber-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {autosavedAt && !error && (
            <div className="text-xs text-zinc-500 -mt-2">
              Draft autosaved locally at{" "}
              {new Date(autosavedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              . Your work is safe in this browser even if you close the tab.
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div id="field-title" className="md:col-span-2 space-y-2 scroll-mt-24">
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

            <div id="field-slug" className="space-y-2 scroll-mt-24">
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

            <div id="field-category" className="space-y-2 scroll-mt-24">
              <Label className="text-zinc-300">Categories *</Label>
              <div className="flex flex-wrap gap-2">
                {categories?.map((c: any) => {
                  const selected = form.categories.includes(c.slug);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setForm((f) => {
                          const next = selected
                            ? f.categories.filter((s) => s !== c.slug)
                            : [...f.categories, c.slug];
                          let primary = f.primaryCategory;
                          if (!next.includes(primary)) primary = next[0] ?? "";
                          if (!primary && next.length > 0) primary = next[0];
                          return { ...f, categories: next, primaryCategory: primary };
                        })
                      }
                      className={`px-3 py-1.5 text-sm border transition-colors ${
                        selected
                          ? "bg-orange-600 border-orange-600 text-white"
                          : "bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500"
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              {form.categories.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-zinc-400 text-xs">
                    Main category (used for breadcrumbs, search engines and "More in…")
                  </Label>
                  <Select
                    value={form.primaryCategory || undefined}
                    onValueChange={(v) => {
                      if (!v) return; // ignore Radix's spurious "" reset
                      setForm((f) => ({ ...f, primaryCategory: v }));
                    }}
                  >
                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500">
                      <SelectValue placeholder="Main category">
                        {categories?.find((c: any) => c.slug === form.primaryCategory)?.name ||
                          form.primaryCategory ||
                          "Main category"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      {form.categories.map((slug) => (
                        <SelectItem key={slug} value={slug} className="text-white hover:bg-zinc-800">
                          {categories?.find((c: any) => c.slug === slug)?.name ?? slug}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <p className="text-xs text-zinc-500">
                Pick one or more. The first one you pick becomes the main category unless you change it.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">
                Author {user?.role !== "admin" && <span className="text-zinc-500 text-xs">(you)</span>}
              </Label>
              {user?.role === "admin" ? (
                <Select
                  value={form.authorId ? String(form.authorId) : ""}
                  onValueChange={(v) => {
                    if (!v) return; // see category select: ignore Radix's spurious "" reset
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

            <div id="field-cover" className="md:col-span-2 space-y-2 scroll-mt-24">
              <Label className="text-zinc-300">Cover Image</Label>
              <ImageUploadField
                value={form.coverImage}
                onChange={(url) => setForm((f) => ({ ...f, coverImage: url }))}
                onStatusChange={setCoverImageStatus}
                helpText="Upload from your device or paste a URL. Recommended: 1200×630."
              />
              {form.coverImage && (
                <div className="space-y-1.5">
                  <Label htmlFor="cover-image-alt" className="text-zinc-300 text-sm">Cover image alt text</Label>
                  <Input
                    id="cover-image-alt"
                    value={form.coverImageAlt}
                    onChange={(e) => setForm((f) => ({ ...f, coverImageAlt: e.target.value }))}
                    placeholder="Describe the cover image for screen readers and search engines…"
                    className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500"
                  />
                  <p className="text-xs text-zinc-500">
                    Describe what's in the image. Screen readers and search engines use this when they can't see the image.
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
                <div className="flex items-center gap-2 text-orange-400 text-xs font-medium uppercase tracking-wide">
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate with AI
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder={form.title ? `e.g. ${form.title}` : "Describe the cover image you want…"}
                    className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500 flex-1"
                    disabled={aiGenerating}
                  />
                  <Button
                    type="button"
                    onClick={generateCoverWithAI}
                    disabled={aiGenerating || !(aiPrompt.trim() || form.title.trim())}
                    className="bg-orange-500 hover:bg-orange-600 text-white gap-2 shrink-0"
                  >
                    {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {aiGenerating ? "Generating…" : "Generate"}
                  </Button>
                </div>
                <p className="text-xs text-zinc-500">
                  Leave blank to use the post title. Takes ~30 seconds; the image is saved to your Media library.
                </p>
                {aiError && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {aiError}
                  </p>
                )}
              </div>
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

            <div id="field-content" className="md:col-span-2 space-y-2 scroll-mt-24">
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
              {(() => {
                const missingAlt = countImagesMissingAltText(form.content);
                if (missingAlt === 0) return null;
                return (
                  <div className="flex items-start gap-2 rounded border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-purple-200">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-purple-300" />
                    <span>
                      {missingAlt === 1
                        ? "1 image in this post has no alt text description."
                        : `${missingAlt} images in this post have no alt text description.`}{" "}
                      Alt text helps screen-reader users and search engines understand your images. Click an image in the
                      editor and use "Edit alt text", or re-insert it with a description.
                    </span>
                  </div>
                );
              })()}
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

                  <div id="field-og" className="space-y-2 scroll-mt-24">
                    <Label className="text-zinc-300">Social Share Image</Label>
                    <ImageUploadField
                      value={form.ogImage}
                      onChange={(url) => setForm((f) => ({ ...f, ogImage: url }))}
                      onStatusChange={setOgImageStatus}
                      helpText="Used when this post is shared on X, Facebook, or LinkedIn. Leave blank to fall back to the cover image. Recommended: 1200×630."
                    />
                  </div>

                  {/* Live social share card preview */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-zinc-300">Share Card Preview</Label>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          How your post will look when shared on social media. Updates as you type.
                        </p>
                      </div>
                    </div>
                    {/* Label row ends above; description row is already inside the div */}
                    {ogPreviewSrc ? (
                      <div className="relative w-full overflow-hidden rounded border border-zinc-700 bg-zinc-900">
                        {/* 1200:630 = 52.5% aspect ratio */}
                        <div className="relative w-full" style={{ paddingBottom: "52.5%" }}>
                          <img
                            src={ogPreviewSrc}
                            alt="Social share card preview"
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </div>
                        {form.ogImage && (
                          <p className="px-3 py-1.5 text-xs text-zinc-500 border-t border-zinc-800">
                            Showing your custom Social Share Image — this is the image social networks will use.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center rounded border border-dashed border-zinc-700 bg-zinc-900/50 py-10 text-xs text-zinc-500">
                        {form.title
                          ? "Building preview…"
                          : "Add a title to see the share card preview."}
                      </div>
                    )}
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

            <div className="md:col-span-2 border border-zinc-800 rounded-lg p-4 bg-zinc-950 space-y-4">
              <div>
                <p className="text-sm font-medium text-white">Review toolkit <span className="text-zinc-500 font-normal">(optional)</span></p>
                <p className="text-xs text-zinc-500 mt-1">
                  For reviews: add a score, the bottom-line verdict, and pros/cons. Leave blank for regular posts.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-zinc-400">Rating (0–5)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    value={form.rating}
                    onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
                    placeholder="e.g. 4.5"
                    className="bg-zinc-900 border-zinc-700 text-white max-w-[160px]"
                    data-testid="input-rating"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Verdict</Label>
                <Textarea
                  value={form.verdict}
                  onChange={(e) => setForm((f) => ({ ...f, verdict: e.target.value }))}
                  placeholder="The bottom line — who should buy this and why."
                  rows={3}
                  className="bg-zinc-900 border-zinc-700 text-white"
                  data-testid="input-verdict"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-zinc-400">Pros <span className="text-zinc-600">(one per line)</span></Label>
                  <Textarea
                    value={form.pros}
                    onChange={(e) => setForm((f) => ({ ...f, pros: e.target.value }))}
                    placeholder={"Great battery life\nBright display"}
                    rows={4}
                    className="bg-zinc-900 border-zinc-700 text-white"
                    data-testid="input-pros"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Cons <span className="text-zinc-600">(one per line)</span></Label>
                  <Textarea
                    value={form.cons}
                    onChange={(e) => setForm((f) => ({ ...f, cons: e.target.value }))}
                    placeholder={"Expensive\nNo headphone jack"}
                    rows={4}
                    className="bg-zinc-900 border-zinc-700 text-white"
                    data-testid="input-cons"
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

            {canChooseStatus && (
              <div className="md:col-span-2 border border-zinc-800 rounded-lg p-4 bg-zinc-950 space-y-3">
                <Label className="text-zinc-200 font-bold">Schedule for later <span className="text-zinc-500 font-normal">(optional)</span></Label>
                <p className="text-xs text-zinc-500">
                  Pick a future date/time and the post will go live automatically. Leave blank to publish immediately when you click <strong>Publish</strong>.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    type="datetime-local"
                    value={form.scheduledFor}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        scheduledFor: e.target.value,
                        status: e.target.value ? "scheduled" : f.status === "scheduled" ? "draft" : f.status,
                      }))
                    }
                    className="bg-zinc-900 border-zinc-700 text-white max-w-[260px]"
                    data-testid="input-scheduled-for"
                  />
                  {form.scheduledFor && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm((f) => ({ ...f, scheduledFor: "", status: f.status === "scheduled" ? "draft" : f.status }))}
                      className="text-zinc-400 hover:text-white text-xs"
                    >
                      Clear schedule
                    </Button>
                  )}
                  {form.status === "scheduled" && (
                    <span className="text-xs text-blue-400">Will publish automatically.</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800 flex-wrap">
            <Link href="/admin">
              <Button type="button" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                Cancel
              </Button>
            </Link>
            {hasBrokenImage && (
              <p className="basis-full text-xs text-red-400 text-right">
                Fix or remove the broken image{coverImageStatus === "broken" && ogImageStatus === "broken" ? "s" : ""} above before saving.
              </p>
            )}
            {canChooseStatus && (
              <Button
                type="button"
                disabled={isPending || hasBrokenImage}
                onClick={(e) => submit(e as any, "draft")}
                variant="outline"
                className="border-zinc-700 text-zinc-200 hover:bg-zinc-800 gap-2"
                title={hasBrokenImage ? "Fix the broken image preview before saving." : undefined}
              >
                <FileText className="w-4 h-4" />
                Save as Draft
              </Button>
            )}
            <Button
              type="submit"
              disabled={isPending || hasBrokenImage}
              title={hasBrokenImage ? "Fix the broken image preview before saving." : undefined}
              className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
              onClick={(e) =>
                submit(
                  e as any,
                  !canChooseStatus
                    ? "draft"
                    : form.scheduledFor
                      ? "scheduled"
                      : "published",
                )
              }
              data-testid="button-publish"
            >
              <Save className="w-4 h-4" />
              {isPending
                ? "Saving..."
                : !canChooseStatus
                  ? (isEditing ? "Update Draft" : "Submit for Review")
                  : form.scheduledFor
                    ? (isEditing ? "Update & Schedule" : "Schedule Post")
                    : (isEditing ? "Update & Publish" : "Publish Post")}
            </Button>
          </div>
        </form>
      </main>
      )}
    </AdminShell>
  );
}
