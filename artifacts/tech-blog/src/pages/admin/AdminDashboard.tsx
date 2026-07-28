import { useState } from "react";
import { Link } from "wouter";
import { useListAdminPosts, useDeletePost, useUpdatePost, useListCategories, useBulkReassignPosts } from "@workspace/api-client-react";
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
import { PlusCircle, Pencil, Trash2, LogOut, Eye, ExternalLink, Sparkles, Users, User as UserIcon, CheckCircle2, Inbox, Briefcase, Mail, ClipboardList, BarChart3, Send, Image as ImageIcon, Clock, Tag, FolderInput, Check, Settings, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { countImagesMissingAltText } from "@/lib/ensureImgAlt";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

function NavIcon({ href, Icon, label }: { href: string; Icon: any; label: string }) {
  return (
    <Link href={href}>
      <Button
        variant="ghost"
        size="sm"
        title={label}
        className="text-zinc-400 hover:text-white h-9 w-9 2xl:w-auto 2xl:px-3 p-0 2xl:gap-2"
      >
        <Icon className="w-4 h-4" />
        <span className="hidden 2xl:inline text-xs">{label}</span>
      </Button>
    </Link>
  );
}

export default function AdminDashboard() {
  const { logout, user } = useAdmin();
  const { data: posts, isLoading } = useListAdminPosts();
  const { data: categories } = useListCategories();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const u = user as any;
  const canJobs = isAdmin || !!u?.canManageJobs;
  const canInbox = isAdmin || !!u?.canViewInbox;
  const canEditors = isAdmin || !!u?.canManageEditors;
  const canSendEmail = isAdmin || !!u?.canSendEmail;
  const seesAllPosts = isAdmin || !!u?.canEditOthersPosts;
  const canCategories = isAdmin || !!u?.canManageCategories;

  const deleteMutation = useDeletePost({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries(),
    },
  });

  const updateMutation = useUpdatePost({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries(),
    },
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

  const allSelected = !!posts?.length && selectedIds.size === posts.length;
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set((posts ?? []).map((p: any) => p.id)));
  };

  const handleBulkMove = (categorySlug: string) => {
    if (selectedIds.size === 0 || bulkMutation.isPending) return;
    bulkMutation.mutate({ data: { postIds: [...selectedIds], category: categorySlug } });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="mx-auto px-3 sm:px-4 min-h-14 py-1.5 flex items-center justify-between gap-x-3 gap-y-0 flex-wrap">
          <Link href="/admin">
            <div className="flex items-baseline gap-2 leading-none whitespace-nowrap shrink-0 cursor-pointer">
              <span className="text-base sm:text-lg font-bold tracking-tight">
                <span className="text-orange-500">MAPLE</span>TECHIE
              </span>
              <span className="text-zinc-500 text-sm sm:text-base font-light">/</span>
              <span className="text-zinc-300 text-xs sm:text-sm font-medium tracking-tight">Admin</span>
            </div>
          </Link>
          <nav className="flex items-center gap-0.5 min-w-0 flex-wrap justify-end">
            <NavIcon href="/admin/profile" Icon={UserIcon} label="Profile" />
            {canEditors && <NavIcon href="/admin/users" Icon={Users} label="Editors" />}
            <NavIcon href="/admin/media" Icon={ImageIcon} label="Media" />
            {canCategories && <NavIcon href="/admin/categories" Icon={Tag} label="Categories" />}
            {canJobs && <NavIcon href="/admin/jobs" Icon={Briefcase} label="Jobs" />}
            {canInbox && <NavIcon href="/admin/inbox" Icon={Inbox} label="Inbox" />}
            {isAdmin && <NavIcon href="/admin/newsletter" Icon={Mail} label="Newsletter" />}
            {canSendEmail && <NavIcon href="/admin/send-email" Icon={Send} label="Send Email" />}
            <NavIcon href="/admin/analytics" Icon={BarChart3} label="Analytics" />
            {isAdmin && <NavIcon href="/admin/audit" Icon={ClipboardList} label="Activity" />}
            {isAdmin && <NavIcon href="/admin/settings" Icon={Settings} label="Settings" />}
            <NavIcon href="/" Icon={ExternalLink} label="View Site" />
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              title="Sign out"
              className="text-zinc-400 hover:text-red-400 h-9 w-9 2xl:w-auto 2xl:px-3 p-0 2xl:gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden 2xl:inline text-xs">Sign out</span>
            </Button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{seesAllPosts ? "All Posts" : "Your Posts"}</h1>
            <p className="text-zinc-400 text-sm mt-1">
              {posts?.length ?? 0} posts
              {!isAdmin && !user?.canPublishDirectly && " — your posts save as drafts pending admin approval"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link href="/admin/generate">
                <Button variant="outline" className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 gap-2">
                  <Sparkles className="w-4 h-4" />
                  Generate with AI
                </Button>
              </Link>
            )}
            <Link href="/admin/posts/new">
              <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
                <PlusCircle className="w-4 h-4" />
                New Post
              </Button>
            </Link>
          </div>
        </div>

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
                      className="border-zinc-600 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                    />
                  </th>
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3">Title</th>
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3">Status</th>
                  {seesAllPosts && (
                    <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3 hidden md:table-cell">Author</th>
                  )}
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3 hidden md:table-cell">Category</th>
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Date</th>
                  <th className="text-right text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {posts?.map((post: any) => (
                  <tr key={post.id} className={`transition-colors ${selectedIds.has(post.id) ? "bg-orange-500/5 hover:bg-orange-500/10" : "hover:bg-zinc-900/50"}`}>
                    <td className="w-10 px-3 py-3">
                      <Checkbox
                        checked={selectedIds.has(post.id)}
                        onCheckedChange={() => toggleSelected(post.id)}
                        aria-label={`Select "${post.title}"`}
                        className="border-zinc-600 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-medium line-clamp-1">{post.title}</span>
                        {post.isFeatured && (
                          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs shrink-0">Featured</Badge>
                        )}
                        {(() => {
                          const missing = countImagesMissingAltText(post.content ?? "");
                          if (missing === 0) return null;
                          return (
                            <Link href={`/admin/posts/${post.id}/edit`}>
                              <Badge
                                className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs shrink-0 gap-1 cursor-pointer hover:bg-purple-500/30"
                                title={`${missing} image${missing === 1 ? "" : "s"} in this post ${missing === 1 ? "has" : "have"} no alt text description. Click to open the editor and add descriptions.`}
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
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Draft</Badge>
                      ) : post.status === "scheduled" ? (
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs gap-1">
                          <Clock className="w-3 h-3" />
                          {post.scheduledFor ? format(new Date(post.scheduledFor), "MMM d, h:mma") : "Scheduled"}
                        </Badge>
                      ) : (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Published</Badge>
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
                        <DropdownMenuContent align="start" className="bg-zinc-950 border-zinc-800 text-white max-h-80 overflow-y-auto">
                          <DropdownMenuLabel className="text-xs text-zinc-400">Move to category</DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-zinc-800" />
                          {categories?.map((c: any) => {
                            const isCurrent =
                              c.id === post.categoryId ||
                              c.slug === post.category ||
                              c.name?.toLowerCase() === String(post.category ?? "").toLowerCase();
                            return (
                              <DropdownMenuItem
                                key={c.id}
                                disabled={isCurrent}
                                onClick={() => !isCurrent && handleChangeCategory(post.id, c.slug)}
                                className="text-xs cursor-pointer focus:bg-zinc-900 focus:text-white data-[disabled]:opacity-60"
                              >
                                <span className="flex-1">{c.name}</span>
                                {isCurrent && <Check className="w-3 h-3 text-orange-400" />}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-zinc-400">
                        {post.publishedAt ? format(new Date(post.publishedAt), "MMM d, yyyy") : "—"}
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
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-white">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                        )}
                        <Link href={`/admin/posts/${post.id}/edit`}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-400">
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
            {!posts?.length && (
              <div className="text-center py-12 text-zinc-500">
                <p>No posts yet.</p>
                <Link href="/admin/posts/new">
                  <Button className="mt-4 bg-orange-500 hover:bg-orange-600 text-white">Create your first post</Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900/95 backdrop-blur px-4 py-2 shadow-xl shadow-black/50">
            <span className="text-sm text-zinc-300 whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="bg-orange-500 hover:bg-orange-600 text-white gap-2 rounded-full"
                  disabled={bulkMutation.isPending || !categories?.length}
                >
                  <FolderInput className="w-4 h-4" />
                  {bulkMutation.isPending ? "Moving..." : "Move to..."}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" side="top" className="bg-zinc-950 border-zinc-800 text-white max-h-80 overflow-y-auto">
                <DropdownMenuLabel className="text-xs text-zinc-400">Move {selectedIds.size} post{selectedIds.size === 1 ? "" : "s"} to</DropdownMenuLabel>
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
      </main>
    </div>
  );
}
