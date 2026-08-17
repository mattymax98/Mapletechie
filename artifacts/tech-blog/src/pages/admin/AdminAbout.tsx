import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/AdminShell";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/context/AdminContext";
import { adminJson } from "@/lib/adminFetch";
import {
  Layers,
  Server,
  Cloud,
  Wrench,
  Terminal,
  Info,
} from "lucide-react";

interface TechItem {
  name: string;
  version: string;
  description: string;
}

interface TechCategory {
  id: string;
  name: string;
  items: TechItem[];
}

interface ScriptEntry {
  label: string;
  command: string;
}

interface TechStackResponse {
  categories: TechCategory[];
  scripts: ScriptEntry[];
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  frontend: Layers,
  backend: Server,
  infrastructure: Cloud,
  build: Wrench,
};

// Whether a version string is a "real" semver version (vs a label like "CDN",
// "API", "Autoscale") — controls whether we show the version badge styled as
// a version number or as a plain tag.
function isSemver(v: string): boolean {
  return /^\d/.test(v);
}

function TechItemBadge({ item }: { item: TechItem }) {
  return (
    <div
      title={item.description}
      className="flex flex-col gap-1 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5 hover:border-zinc-700 transition-colors"
    >
      <span className="text-sm font-medium text-white leading-tight">
        {item.name}
      </span>
      <span
        className={`text-xs font-mono leading-tight ${
          isSemver(item.version)
            ? "text-orange-400"
            : "text-zinc-400"
        }`}
      >
        {item.version}
      </span>
      <span className="text-[11px] text-zinc-500 leading-tight mt-0.5">
        {item.description}
      </span>
    </div>
  );
}

function CategoryCard({ category }: { category: TechCategory }) {
  const Icon = CATEGORY_ICONS[category.id] ?? Info;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-zinc-400" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          {category.name}
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {category.items.map((item) => (
          <TechItemBadge key={item.name} item={item} />
        ))}
      </div>
    </div>
  );
}

function ScriptsCard({ scripts }: { scripts: ScriptEntry[] }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Terminal className="w-4 h-4 text-zinc-400" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Scripts
        </h2>
      </div>
      <div className="space-y-2">
        {scripts.map((s) => (
          <div key={s.label} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <span className="text-xs text-zinc-500 sm:w-48 shrink-0">{s.label}</span>
            <code className="text-xs font-mono text-zinc-300 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 break-all">
              {s.command}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminAbout() {
  const { user } = useAdmin();
  const isAdmin = user?.role === "admin";

  const { data, isLoading } = useQuery<TechStackResponse>({
    queryKey: ["admin", "tech-stack"],
    queryFn: () => adminJson<TechStackResponse>("/api/admin/tech-stack"),
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000, // versions won't change while the server is running
  });

  if (!isAdmin) {
    return (
      <AdminShell title="About This Site">
        <div className="flex items-center justify-center h-64">
          <p className="text-zinc-400">Admins only.</p>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="About This Site">
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <p className="text-zinc-400 text-sm mt-1">
            The full technology stack powering Mapletechie — libraries,
            infrastructure, and build tooling.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-48 w-full bg-zinc-900 rounded-lg" />
            <Skeleton className="h-48 w-full bg-zinc-900 rounded-lg" />
            <Skeleton className="h-32 w-full bg-zinc-900 rounded-lg" />
          </div>
        ) : data ? (
          <>
            {data.categories.map((cat) => (
              <CategoryCard key={cat.id} category={cat} />
            ))}
            <ScriptsCard scripts={data.scripts} />

            {/* Footer note */}
            <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
              <Info className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
              <p className="text-xs text-zinc-500">
                Package versions are read live at server startup — they reflect
                what is currently installed, not just what is declared in{" "}
                <code className="text-zinc-400">package.json</code>.
              </p>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-8 text-center text-zinc-500 text-sm">
            Failed to load tech stack data.
          </div>
        )}
      </main>
    </AdminShell>
  );
}
