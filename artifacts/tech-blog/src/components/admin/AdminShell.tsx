import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAdmin } from "@/context/AdminContext";
import {
  LayoutDashboard,
  Tag,
  Image as ImageIcon,
  Mail,
  BarChart3,
  Settings,
  Users,
  ClipboardList,
  Sparkles,
  Briefcase,
  Inbox,
  Send,
  ExternalLink,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  User as UserIcon,
  Info,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  permission?: (u: any) => boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    title: "Overview",
    items: [
      { href: "/admin", label: "Posts", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    title: "Content",
    items: [
      {
        href: "/admin/categories",
        label: "Categories",
        icon: Tag,
        permission: (u) => u?.role === "admin" || u?.canManageCategories,
      },
      { href: "/admin/media", label: "Media", icon: ImageIcon },
    ],
  },
  {
    title: "Growth",
    items: [
      {
        href: "/admin/newsletter",
        label: "Newsletter",
        icon: Mail,
        permission: (u) => u?.role === "admin",
      },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    title: "Site",
    items: [
      {
        href: "/admin/settings",
        label: "Settings",
        icon: Settings,
        permission: (u) => u?.role === "admin",
      },
      {
        href: "/admin/about",
        label: "About",
        icon: Info,
        permission: (u) => u?.role === "admin",
      },
      {
        href: "/admin/users",
        label: "Editors",
        icon: Users,
        permission: (u) => u?.role === "admin" || u?.canManageEditors,
      },
      {
        href: "/admin/audit",
        label: "Activity",
        icon: ClipboardList,
        permission: (u) => u?.role === "admin",
      },
    ],
  },
  {
    title: "Tools",
    items: [
      {
        href: "/admin/generate",
        label: "AI Generate",
        icon: Sparkles,
        permission: (u) => u?.role === "admin",
      },
      {
        href: "/admin/jobs",
        label: "Jobs",
        icon: Briefcase,
        permission: (u) => u?.role === "admin" || u?.canManageJobs,
      },
      {
        href: "/admin/inbox",
        label: "Inbox",
        icon: Inbox,
        permission: (u) => u?.role === "admin" || u?.canViewInbox,
      },
      {
        href: "/admin/send-email",
        label: "Send Email",
        icon: Send,
        permission: (u) => u?.role === "admin" || u?.canSendEmail,
      },
    ],
  },
];

export interface AdminShellProps {
  title: string;
  children: React.ReactNode;
  /** Optional buttons/controls shown on the right side of the top bar */
  actions?: React.ReactNode;
}

export function AdminShell({ title, children, actions }: AdminShellProps) {
  const { user, logout } = useAdmin();
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("admin_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("admin_sidebar_collapsed", String(collapsed));
    } catch {}
  }, [collapsed]);

  // Close mobile menu when the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  function isActive(item: NavItem): boolean {
    if (item.exact) return location === item.href;
    return location.startsWith(item.href);
  }

  const visibleSections = NAV.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.permission || item.permission(user),
    ),
  })).filter((section) => section.items.length > 0);

  const sidebarW = collapsed ? "w-[54px]" : "w-52";

  function SidebarInner() {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Logo */}
        <div
          className={`flex items-center h-14 border-b border-zinc-800 shrink-0 ${
            collapsed ? "justify-center" : "px-4"
          }`}
        >
          <Link href="/admin" className="flex items-center gap-1.5">
            {collapsed ? (
              <img src="/logo-favicon-v2.svg" alt="" className="w-7 h-7 rounded" />
            ) : (
              <>
                <img src="/mapletechie-wordmark-inverse.svg" alt="" className="h-7 w-auto" />
                <span className="text-zinc-500 font-light text-xs">/</span>
                <span className="text-zinc-400 font-normal text-xs">Admin</span>
              </>
            )}
          </Link>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-4 scrollbar-none">
          {visibleSections.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <p className="px-3.5 mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">
                  {section.title}
                </p>
              )}
              <div className={`space-y-0.5 ${collapsed ? "px-1.5" : "px-2"}`}>
                {section.items.map((item) => {
                  const active = isActive(item);
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        title={collapsed ? item.label : undefined}
                        className={`flex items-center gap-2.5 rounded-md transition-colors cursor-pointer select-none
                          ${
                            collapsed
                              ? "justify-center w-9 h-9 mx-auto"
                              : "px-2.5 py-2"
                          }
                          ${
                            active
                              ? "bg-orange-500/15 text-orange-400"
                              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                          }`}
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        {!collapsed && (
                          <span className="text-sm font-medium flex-1 truncate">
                            {item.label}
                          </span>
                        )}
                        {!collapsed && active && (
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom bar */}
        <div
          className={`shrink-0 border-t border-zinc-800 py-2 space-y-0.5 ${
            collapsed ? "px-1.5" : "px-2"
          }`}
        >
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            title={collapsed ? "View site" : undefined}
            className={`flex items-center gap-2.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer
              ${collapsed ? "justify-center w-9 h-9 mx-auto" : "px-2.5 py-2"}`}
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="text-sm">View site</span>}
          </a>
          <Link href="/admin/profile">
            <div
              title={collapsed ? "Profile" : undefined}
              className={`flex items-center gap-2.5 rounded-md transition-colors cursor-pointer
                ${
                  location === "/admin/profile"
                    ? "bg-orange-500/15 text-orange-400"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                }
                ${collapsed ? "justify-center w-9 h-9 mx-auto" : "px-2.5 py-2"}`}
            >
              <UserIcon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="text-sm font-medium">Profile</span>}
            </div>
          </Link>
          <button
            type="button"
            onClick={logout}
            title={collapsed ? "Sign out" : undefined}
            className={`flex items-center gap-2.5 w-full rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors
              ${collapsed ? "justify-center w-9 h-9 mx-auto" : "px-2.5 py-2"}`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="text-sm">Sign out</span>}
          </button>

          {/* Collapse toggle — desktop only */}
          <div className="hidden sm:flex justify-end pt-0.5 pr-1">
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="w-6 h-6 flex items-center justify-center rounded text-zinc-700 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              {collapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronLeft className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      {/* ── Desktop sidebar ───────────────────────────────────────────── */}
      <aside
        className={`hidden sm:flex flex-col bg-zinc-950 border-r border-zinc-800 shrink-0 sticky top-0 h-screen transition-all duration-150 ${sidebarW}`}
      >
        <SidebarInner />
      </aside>

      {/* ── Mobile sidebar overlay ────────────────────────────────────── */}
      {mobileOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-52 bg-zinc-950 border-r border-zinc-800 h-full flex flex-col">
            <SidebarInner />
          </aside>
        </div>
      )}

      {/* ── Main content column ───────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 bg-black">
        {/* Top bar */}
        <header className="sticky top-0 z-10 h-14 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur flex items-center px-4 gap-3 shrink-0">
          {/* Mobile hamburger */}
          <button
            type="button"
            className="sm:hidden text-zinc-400 hover:text-white p-1 -ml-1 transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <h1 className="text-sm font-semibold text-white flex-1 min-w-0 truncate">
            {title}
          </h1>

          {actions && (
            <div className="flex items-center gap-2 shrink-0">{actions}</div>
          )}

          {/* User avatar */}
          <div className="flex items-center gap-2 shrink-0">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="w-7 h-7 rounded-full object-cover border border-zinc-700"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400 font-bold text-xs">
                {(user?.displayName || user?.username || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
            )}
            <span className="hidden md:block text-xs text-zinc-400 max-w-[120px] truncate">
              {user?.displayName || user?.username}
            </span>
          </div>
        </header>

        {/* Page body */}
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
