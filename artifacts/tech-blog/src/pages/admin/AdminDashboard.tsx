import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListAdminPosts,
  useDeletePost,
  useUpdatePost,
  useListCategories,
  useBulkReassignPosts,
} from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PlusCircle,
  Pencil,
  Trash2,
  Eye,
  Sparkles,
  CheckCircle2,
  Clock,
  FolderInput,
  Check,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { countImagesMissingAltText } from "@/lib/ensureImgAlt";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
} from "recharts";

export default function AdminDashboard() {
  const { user, token } = useAdmin();
  const { data: posts, isLoading } = useListAdminPosts();
  const { data: categories } = useListCategories();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const u = user as any;
  const seesAllPosts = isAdmin || !!u?.canEditOthersPosts;

  const deleteMutation = useDeletePost({
    mutation: { onSuccess: () => queryClient.invalidateQueries() },
  });
  const updateMutation = useUpdatePost({
    mutation: { onSuccess: () => queryClient.invalidateQueries() },
  });

  const handleDelete = (id: number, title: string) => {
    if (confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) {
      deleteMutation.mutate({ id });
    }
  };

  const handleApprove = (id: number) => {
    updateMutation.mutate({ id, data: { status: "published", publishedAt: new Date().toISOString() } as any });
  };

  const handleChangeCategory = (id: number, categorySlug: string) => {
    updateMutation.mutate({ id, data: { category: categorySlug } as any });
  };

  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const bulkMutation = useBulkReassignPosts({
    mutation: {
      onSuccess: (result: any, vars: any) => {
        const dest = categories?.find((c: any) => c.slug === vars?.data?.category);
        toast({
          title: `Moved ${result?.movedCount ?? 0} post${(result?.movedCount ?? 0) === 1 ? "" : "s"}`,
          description: dest ? `Now in "${dest.name}".` : undefined,
        });
        setSelectedIds(new Set());
        queryClient.invalidateQueries();
      },
      onError: (err: any) => {
        toast({
          title: "Couldn't move posts",
          description: err?.message || "Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [showOnlyAltMissing, setShowOnlyAltMissing] = useState(false);

  const altMissingIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of posts ?? []) {
      const contentMissing = countImagesMissingAltText((p as any).content ?? "");
      const coverMissing = (p as any).coverImage && !(p as any).coverImageAlt;
      if (contentMissing > 0 || coverMissing) ids.add((p as any).id);
    }
    return ids;
  }, [posts]);

  const visiblePosts = useMemo(
    () =>
      showOnlyAltMissing
        ? (posts ?? []).filter((p: any) => altMissingIds.has(p.id))
        : (posts ?? []),
    [posts, showOnlyAltMissing, altMissingIds],
  );

  const allSelected =
    !!visiblePosts.length && visiblePosts.every((p: any) => selectedIds.has(p.id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(visiblePosts.map((p: any) => p.id)));
  };

  const handleBulkMove = (categorySlug: string) => {
    if (selectedIds.size === 0 || bulkMutation.isPending) return;
    bulkMutation.mutate({ data: { postIds: [...selectedIds], category: categorySlug } });
  };

  // ── Post count stat tiles ────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!posts) return null;
    return {
      total: posts.length,
      published: posts.filter((p: any) => p.status === "published").length,
      draft: posts.filter((p: any) => p.status === "draft").length,
      scheduled: posts.filter((p: any) => p.status === "scheduled").length,
    };
  }, [posts]);

  // ── Live analytics (30-day summary + 7-day top posts) ───────────────
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analytics30d, setAnalytics30d] = useState<{
    totalViews: number;
    uniqueSessions: number;
    uniqueCountries: number;
    daily: { day: string; views: number }[];
  } | null>(null);
  const [topPosts7d, setTopPosts7d] = useState<
    { slug: string; views: number }[] | null
  >(null);

  useEffect(() => {
    if (!token) {
      setAnalyticsLoading(false);
      return;
    }
    let cancelled = false;
    async function loadAnalytics() {
      try {
        const h = { Authorization: `Bearer ${token}` };
        const fetchJson = async (url: string) => {
          const r = await fetch(url, { headers: h });
          if (!r.ok) throw new Error(`${r.status}`);
          return r.json();
        };
        const [s, tp] = await Promise.all([
          fetchJson("/api/admin/analytics/summary?range=30d"),
          fetchJson("/api/admin/analytics/top-posts?range=7d"),
        ]);
        if (!cancelled) {
          setAnalytics30d(s);
          setTopPosts7d(
            Array.isArray(tp)
              ? tp
                  .slice(0, 3)
                  .map((p: any) => ({ slug: p.slug, views: p.views }))
              : [],
          );
        }
      } catch {
        // analytics is an enhancement; fail silently
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    }
    void loadAnalytics();
    return () => {
      cancelled = true;
    };
  }, [token]);

  /** Last 7 days of daily views from the 30d summary for the sparkline */
  const sparklineData = useMemo(() => {
    if (!analytics30d?.daily) return [];
    return analytics30d.daily.slice(-7).map((d) => ({
      views: d.views,
      label: (() => {
        try { return parseISO(d.day).toLocaleDateString("en", { month: "short", day: "numeric" }); }
        catch { return d.day; }
      })(),
    }));
  }, [analytics30d]);

  const shellActions = (
    <div className="flex items-center gap-2">
      {isAdmin && (
        <Link href="/admin/generate">
          <Button
            variant="outline"
            size="sm"
            className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-xs">Generate</span>
          </Button>
        </Link>
      )}
      <Link href="/admin/posts/new">
        <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white gap-1.5">
          <PlusCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-xs">New Post</span>
        </Button>
      </Link>
    </div>
  );

  return (
    <AdminShell
      title={seesAllPosts ? "All Posts" : "Your Posts"}
      actions={shellActions}
    >
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ── Stat tiles ─────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 bg-zinc-900 rounded-lg" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatTile label="Total" value={stats.total} />
            <StatTile label="Published" value={stats.published} accent="text-green-400" />
            <StatTile label="Drafts" value={stats.draft} accent="text-amber-400" />
            <StatTile label="Scheduled" value={stats.scheduled} accent="text-blue-400" />
          </div>
        ) : null}

        {/* ── Analytics overview ─────────────────────────────────────── */}
        {(analyticsLoading || analytics30d) && (
          <div className="mb-6 space-y-3">
            {/* Analytics stat tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <AnalyticsTile
                label="Views (30 days)"
                value={analytics30d?.totalViews}
                accent="text-red-400"
                loading={analyticsLoading}
              />
              <AnalyticsTile
                label="Visitors (30 days)"
                value={analytics30d?.uniqueSessions}
                accent="text-emerald-400"
                loading={analyticsLoading}
              />
              <AnalyticsTile
                label="Countries (30 days)"
                value={analytics30d?.uniqueCountries}
                accent="text-blue-400"
                loading={analyticsLoading}
              />
            </div>

            {/* 7-day sparkline */}
            {sparklineData.length > 0 && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 pt-3 pb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                    Traffic — last 7 days
                  </span>
                  <Link href="/admin/analytics">
                    <span className="text-[11px] text-red-500 hover:text-red-400 cursor-pointer transition-colors">
                      Full analytics →
                    </span>
                  </Link>
                </div>
                <div className="h-14">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={sparklineData}
                      margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="dashSparkGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#f97316"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="100%"
                            stopColor="#f97316"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <Tooltip
                        contentStyle={{
                          background: "#09090b",
                          border: "1px solid #27272a",
                          borderRadius: 4,
                          fontSize: 11,
                          padding: "3px 8px",
                        }}
                        labelStyle={{ color: "#a1a1aa" }}
                        itemStyle={{ color: "#fafafa" }}
                        labelFormatter={(_v, pl) => pl?.[0]?.payload?.label ?? ""}
                      />
                      <Area
                        type="monotone"
                        dataKey="views"
                        stroke="#f97316"
                        strokeWidth={1.5}
                        fill="url(#dashSparkGrad)"
                        dot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Top posts this week */}
            {topPosts7d && topPosts7d.length > 0 && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2">
                  Top posts this week
                </p>
                <div className="space-y-2">
                  {topPosts7d.map((p, i) => {
                    const meta = (posts as any[])?.find(
                      (post: any) => post.slug === p.slug,
                    );
                    return (
                      <div key={p.slug} className="flex items-center gap-2">
                        <span className="text-xs text-zinc-700 w-3 tabular-nums shrink-0">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-xs text-zinc-300 truncate">
                          {meta?.title ?? p.slug}
                        </span>
                        <span className="text-xs text-zinc-500 tabular-nums shrink-0">
                          {p.views.toLocaleString()} views
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Posts header ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <p className="text-sm text-zinc-400">
              {showOnlyAltMissing
                ? `${visiblePosts.length} of ${posts?.length ?? 0} posts need image descriptions`
                : `${posts?.length ?? 0} total`}
              {!isAdmin && !user?.canPublishDirectly &&
                " — your posts save as drafts pending admin approval"}
            </p>
          </div>
          {altMissingIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOnlyAltMissing((v) => !v)}
              aria-pressed={showOnlyAltMissing}
              title={
                showOnlyAltMissing
                  ? "Show all posts"
                  : `Show only the ${altMissingIds.size} post${altMissingIds.size === 1 ? "" : "s"} with images missing alt text`
              }
              className={
                showOnlyAltMissing
                  ? "border-purple-500/60 bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 hover:text-purple-100 gap-2"
                  : "border-purple-500/40 text-purple-300 hover:bg-purple-500/10 hover:text-purple-200 gap-2"
              }
            >
              <ImageIcon className="w-4 h-4" />
              {showOnlyAltMissing ? "Showing alt missing" : "Needs alt text"}
              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs px-1.5">
                {altMissingIds.size}
              </Badge>
              {showOnlyAltMissing && <X className="w-3.5 h-3.5" />}
            </Button>
          )}
        </div>

        {/* ── Posts table ────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full bg-zinc-900 rounded" />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-zinc-900 border-b border-zinc-800">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all posts"
                      className="border-zinc-600 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                    />
                  </th>
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3">
                    Title
                  </th>
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3">
                    Status
                  </th>
                  {seesAllPosts && (
                    <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                      Author
                    </th>
                  )}
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                    Category
                  </th>
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
                    Date
                  </th>
                  <th className="text-right text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {visiblePosts.map((post: any) => (
                  <tr
                    key={post.id}
                    className={`transition-colors ${
                      selectedIds.has(post.id)
                        ? "bg-red-500/5 hover:bg-red-500/10"
                        : "hover:bg-zinc-900/50"
                    }`}
                  >
                    <td className="w-10 px-3 py-3">
                      <Checkbox
                        checked={selectedIds.has(post.id)}
                        onCheckedChange={() => toggleSelected(post.id)}
                        aria-label={`Select "${post.title}"`}
                        className="border-zinc-600 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-white font-medium line-clamp-1">
                          {post.title}
                        </span>
                        {post.isFeatured && (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs shrink-0">
                            Featured
                          </Badge>
                        )}
                        {(() => {
                          const contentMissing = countImagesMissingAltText(post.content ?? "");
                          const coverMissing = post.coverImage && !post.coverImageAlt ? 1 : 0;
                          const missing = contentMissing + coverMissing;
                          if (missing === 0) return null;
                          return (
                            <Link href={`/admin/posts/${post.id}/edit`}>
                              <Badge
                                className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs shrink-0 gap-1 cursor-pointer hover:bg-purple-500/30"
                                title={`${missing} image${missing === 1 ? "" : "s"} ${missing === 1 ? "is" : "are"} missing alt text. Click to open the editor.`}
                              >
                                <ImageIcon className="w-3 h-3" />
                                {missing} alt missing
                              </Badge>
                            </Link>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {post.status === "draft" ? (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                          Draft
                        </Badge>
                      ) : post.status === "scheduled" ? (
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs gap-1">
                          <Clock className="w-3 h-3" />
                          {post.scheduledFor
                            ? format(new Date(post.scheduledFor), "MMM d, h:mma")
                            : "Scheduled"}
                        </Badge>
                      ) : (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                          Published
                        </Badge>
                      )}
                    </td>
                    {seesAllPosts && (
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-zinc-400">{post.author}</span>
                      </td>
                    )}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="text-xs text-zinc-400 capitalize hover:text-white inline-flex items-center gap-1 disabled:opacity-50"
                            title="Change category"
                            disabled={updateMutation.isPending || !categories?.length}
                          >
                            <span>{post.category}</span>
                            <FolderInput className="w-3 h-3 opacity-60" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="bg-zinc-950 border-zinc-800 text-white max-h-80 overflow-y-auto"
                        >
                          <DropdownMenuLabel className="text-xs text-zinc-400">
                            Move to category
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-zinc-800" />
                          {categories?.map((c: any) => {
                            const isCurrent =
                              c.id === post.categoryId ||
                              c.slug === post.category ||
                              c.name?.toLowerCase() ===
                                String(post.category ?? "").toLowerCase();
                            return (
                              <DropdownMenuItem
                                key={c.id}
                                disabled={isCurrent}
                                onClick={() =>
                                  !isCurrent && handleChangeCategory(post.id, c.slug)
                                }
                                className="text-xs cursor-pointer focus:bg-zinc-900 focus:text-white data-[disabled]:opacity-60"
                              >
                                <span className="flex-1">{c.name}</span>
                                {isCurrent && <Check className="w-3 h-3 text-red-400" />}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-zinc-400">
                        {post.publishedAt
                          ? format(new Date(post.publishedAt), "MMM d, yyyy")
                          : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && post.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleApprove(post.id)}
                            className="h-8 px-2 text-green-400 hover:text-green-300 hover:bg-green-500/10 gap-1"
                            disabled={updateMutation.isPending}
                            title="Approve & Publish"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-xs hidden sm:inline">Approve</span>
                          </Button>
                        )}
                        {post.status === "published" && (
                          <Link href={`/blog/${post.slug}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                        )}
                        <Link href={`/admin/posts/${post.id}/edit`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-400"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </Link>
                        {(isAdmin || post.authorId === user?.id) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(post.id, post.title)}
                            className="h-8 w-8 p-0 text-zinc-400 hover:text-red-400"
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visiblePosts.length && (
              <div className="text-center py-12 text-zinc-500">
                {showOnlyAltMissing ? (
                  <>
                    <p>No posts are missing image descriptions. Nice work!</p>
                    <Button
                      variant="outline"
                      className="mt-4 border-zinc-700 text-zinc-300 hover:bg-zinc-900"
                      onClick={() => setShowOnlyAltMissing(false)}
                    >
                      Show all posts
                    </Button>
                  </>
                ) : (
                  <>
                    <p>No posts yet.</p>
                    <Link href="/admin/posts/new">
                      <Button className="mt-4 bg-red-500 hover:bg-red-600 text-white">
                        Create your first post
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Bulk-move floating bar ──────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900/95 backdrop-blur px-4 py-2 shadow-xl shadow-black/50">
            <span className="text-sm text-zinc-300 whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="bg-red-500 hover:bg-red-600 text-white gap-2 rounded-full"
                  disabled={bulkMutation.isPending || !categories?.length}
                >
                  <FolderInput className="w-4 h-4" />
                  {bulkMutation.isPending ? "Moving..." : "Move to..."}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="center"
                side="top"
                className="bg-zinc-950 border-zinc-800 text-white max-h-80 overflow-y-auto"
              >
                <DropdownMenuLabel className="text-xs text-zinc-400">
                  Move {selectedIds.size} post{selectedIds.size === 1 ? "" : "s"} to
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-800" />
                {categories?.map((c: any) => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => handleBulkMove(c.slug)}
                    className="text-xs cursor-pointer focus:bg-zinc-900 focus:text-white"
                  >
                    {c.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              className="h-8 w-8 p-0 rounded-full text-zinc-400 hover:text-white"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function AnalyticsTile({
  label,
  value,
  accent = "text-white",
  loading,
}: {
  label: string;
  value: number | undefined;
  accent?: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${accent}`}>
        {loading ? (
          <span className="text-zinc-700 animate-pulse">—</span>
        ) : value === undefined ? (
          <span className="text-zinc-600">—</span>
        ) : (
          value.toLocaleString()
        )}
      </p>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent = "text-white",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${accent}`}>{value}</p>
    </div>
  );
}
