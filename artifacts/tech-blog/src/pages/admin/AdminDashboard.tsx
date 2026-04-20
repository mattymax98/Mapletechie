import { Link } from "wouter";
import { useListAdminPosts, useDeletePost, useUpdatePost } from "@workspace/api-client-react";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, Pencil, Trash2, LogOut, Eye, ExternalLink, Sparkles, Users, User as UserIcon, CheckCircle2, ShoppingBag, Inbox, Briefcase, Mail, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

function NavIcon({ href, Icon, label }: { href: string; Icon: any; label: string }) {
  return (
    <Link href={href}>
      <Button
        variant="ghost"
        size="sm"
        title={label}
        className="text-zinc-400 hover:text-white h-9 w-9 xl:w-auto xl:px-3 p-0 xl:gap-2"
      >
        <Icon className="w-4 h-4" />
        <span className="hidden xl:inline text-xs">{label}</span>
      </Button>
    </Link>
  );
}

export default function AdminDashboard() {
  const { logout, user } = useAdmin();
  const { data: posts, isLoading } = useListAdminPosts();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const u = user as any;
  const canShop = isAdmin || !!u?.canManageShop;
  const canJobs = isAdmin || !!u?.canManageJobs;
  const canInbox = isAdmin || !!u?.canViewInbox;
  const canEditors = isAdmin || !!u?.canManageEditors;

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

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/admin">
            <div className="flex items-baseline gap-2 leading-none whitespace-nowrap shrink-0 cursor-pointer">
              <span className="text-base sm:text-lg font-bold tracking-tight">
                <span className="text-orange-500">MAPLE</span>TECHIE
              </span>
              <span className="text-zinc-500 text-sm sm:text-base font-light">/</span>
              <span className="text-zinc-300 text-xs sm:text-sm font-medium tracking-tight">Admin</span>
            </div>
          </Link>
          <nav className="flex items-center gap-0.5 min-w-0">
            <NavIcon href="/admin/profile" Icon={UserIcon} label="Profile" />
            {canEditors && <NavIcon href="/admin/users" Icon={Users} label="Editors" />}
            {canShop && <NavIcon href="/admin/products" Icon={ShoppingBag} label="Shop" />}
            {canJobs && <NavIcon href="/admin/jobs" Icon={Briefcase} label="Jobs" />}
            {canInbox && <NavIcon href="/admin/inbox" Icon={Inbox} label="Inbox" />}
            {isAdmin && <NavIcon href="/admin/newsletter" Icon={Mail} label="Newsletter" />}
            {isAdmin && <NavIcon href="/admin/audit" Icon={ClipboardList} label="Activity" />}
            <NavIcon href="/" Icon={ExternalLink} label="View Site" />
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              title="Sign out"
              className="text-zinc-400 hover:text-red-400 h-9 w-9 sm:w-auto sm:px-3 p-0 sm:gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden xl:inline text-xs">Sign out</span>
            </Button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{isAdmin ? "All Posts" : "Your Posts"}</h1>
            <p className="text-zinc-400 text-sm mt-1">
              {posts?.length ?? 0} posts
              {!isAdmin && !user?.canPublishDirectly && " — your posts save as drafts pending admin approval"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/generate">
              <Button variant="outline" className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 gap-2">
                <Sparkles className="w-4 h-4" />
                Generate with AI
              </Button>
            </Link>
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
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3">Title</th>
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3">Status</th>
                  {isAdmin && (
                    <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3 hidden md:table-cell">Author</th>
                  )}
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3 hidden md:table-cell">Category</th>
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Date</th>
                  <th className="text-right text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {posts?.map((post: any) => (
                  <tr key={post.id} className="hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-medium line-clamp-1">{post.title}</span>
                        {post.isFeatured && (
                          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs shrink-0">Featured</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {post.status === "draft" ? (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Draft</Badge>
                      ) : (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Published</Badge>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-zinc-400">{post.author}</span>
                      </td>
                    )}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-zinc-400 capitalize">{post.category}</span>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(post.id, post.title)}
                          className="h-8 w-8 p-0 text-zinc-400 hover:text-red-400"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
      </main>
    </div>
  );
}
