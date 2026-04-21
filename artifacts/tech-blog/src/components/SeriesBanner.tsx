import { useEffect, useState } from "react";
import { Link } from "wouter";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";

interface SeriesRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
}
interface PartRow {
  id: number;
  slug: string;
  title: string;
  seriesPosition: number | null;
}

export function SeriesBanner({ seriesId, currentPostId }: { seriesId: number; currentPostId: number }) {
  const [data, setData] = useState<{ series: SeriesRow; posts: PartRow[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // We have id, not slug — fetch full list and find the matching series.
      // Cheaper: hit /series and look up slug, then fetch /series/:slug.
      const list = await fetch(`/api/series`);
      if (!list.ok) return;
      const all = (await list.json()) as SeriesRow[];
      const match = all.find((s) => s.id === seriesId);
      if (!match) return;
      const r = await fetch(`/api/series/${encodeURIComponent(match.slug)}`);
      if (!r.ok) return;
      const json = await r.json();
      if (!cancelled) setData(json);
    })();
    return () => {
      cancelled = true;
    };
  }, [seriesId]);

  if (!data) return null;
  const { series, posts } = data;
  const currentIdx = posts.findIndex((p) => p.id === currentPostId);
  if (currentIdx === -1) return null;
  const prev = currentIdx > 0 ? posts[currentIdx - 1] : null;
  const next = currentIdx < posts.length - 1 ? posts[currentIdx + 1] : null;

  return (
    <div className="container mx-auto px-4 md:px-6 max-w-4xl mt-12">
      <div className="border-2 border-primary bg-primary/5 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
          <div>
            <p className="text-xs uppercase tracking-widest font-bold text-primary mb-2 flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Part {currentIdx + 1} of {posts.length} ·{" "}
              <Link href={`/series/${series.slug}`} className="hover:underline">
                Series
              </Link>
            </p>
            <Link href={`/series/${series.slug}`}>
              <h3 className="text-2xl md:text-3xl font-black leading-tight hover:text-primary cursor-pointer">
                {series.title}
              </h3>
            </Link>
            {series.description && (
              <p className="text-muted-foreground font-serif mt-2 line-clamp-2">
                {series.description}
              </p>
            )}
          </div>
        </div>

        <ol className="space-y-2 mb-6">
          {posts.map((p, i) => {
            const isCurrent = p.id === currentPostId;
            return (
              <li key={p.id}>
                <Link
                  href={`/blog/${p.slug}`}
                  className={`flex items-center gap-3 px-3 py-2 border-l-4 transition-colors ${
                    isCurrent
                      ? "border-primary bg-primary/10 font-bold cursor-default pointer-events-none"
                      : "border-transparent hover:border-primary hover:bg-primary/5"
                  }`}
                >
                  <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground w-12 shrink-0">
                    Part {i + 1}
                  </span>
                  <span className="flex-1 truncate">{p.title}</span>
                </Link>
              </li>
            );
          })}
        </ol>

        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-primary/30">
          {prev ? (
            <Link
              href={`/blog/${prev.slug}`}
              className="flex flex-col items-start gap-1 p-3 border border-border hover:border-primary hover:bg-card transition-colors"
            >
              <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-1">
                <ChevronLeft className="h-3 w-3" /> Previous part
              </span>
              <span className="font-bold leading-tight line-clamp-2">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/blog/${next.slug}`}
              className="flex flex-col items-end gap-1 p-3 border border-border hover:border-primary hover:bg-card transition-colors text-right"
            >
              <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-1">
                Next part <ChevronRight className="h-3 w-3" />
              </span>
              <span className="font-bold leading-tight line-clamp-2">{next.title}</span>
            </Link>
          ) : (
            <span />
          )}
        </div>
      </div>
    </div>
  );
}
