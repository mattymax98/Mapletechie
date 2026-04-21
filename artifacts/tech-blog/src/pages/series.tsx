import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { Clock, BookOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";

interface SeriesRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  coverImage: string | null;
}
interface PostRow {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  author: string;
  coverImage: string | null;
  readTime: number;
  publishedAt: string;
  seriesPosition: number | null;
}

export default function SeriesPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  const [data, setData] = useState<{ series: SeriesRow; posts: PostRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const r = await fetch(`/api/series/${encodeURIComponent(slug)}`);
        if (!r.ok) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const json = await r.json();
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <Skeleton className="w-32 h-5 mb-3" />
        <Skeleton className="w-2/3 h-12 mb-6" />
        <Skeleton className="w-full h-5 mb-3" />
        <Skeleton className="w-3/4 h-5" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl font-black mb-4">Series Not Found</h1>
        <Button asChild className="rounded-none uppercase font-bold tracking-wider">
          <Link href="/blog">Back to blog</Link>
        </Button>
      </div>
    );
  }

  const { series, posts } = data;

  return (
    <div className="w-full">
      <SEO
        title={`${series.title} — Series`}
        description={series.description || `A multi-part series on Mapletechie.`}
        image={`/api/og/series/${encodeURIComponent(series.slug)}.png`}
        url={`/series/${series.slug}`}
      />

      <div className="bg-card border-b border-border py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6 max-w-4xl">
          <p className="text-primary uppercase tracking-widest text-sm font-bold mb-4 flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Series · {posts.length} {posts.length === 1 ? "part" : "parts"}
          </p>
          <h1 className="font-black text-4xl md:text-6xl tracking-tight mb-5">
            {series.title}
          </h1>
          {series.description && (
            <p className="text-lg md:text-xl text-muted-foreground font-serif leading-relaxed max-w-3xl">
              {series.description}
            </p>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 max-w-4xl py-16">
        {posts.length === 0 && (
          <div className="border border-dashed border-border p-10 text-center">
            <p className="text-lg font-bold">No parts published yet.</p>
          </div>
        )}
        <ol className="space-y-6">
          {posts.map((p, i) => (
            <li key={p.id}>
              <Link
                href={`/blog/${p.slug}`}
                className="group flex gap-6 border border-border hover:border-primary p-5 transition-colors"
              >
                <div className="shrink-0 w-14 h-14 flex items-center justify-center bg-primary text-primary-foreground font-black text-xl">
                  {p.seriesPosition ?? i + 1}
                </div>
                <div className="flex-1">
                  {p.category && (
                    <p className="text-xs uppercase tracking-widest font-bold text-primary mb-1">
                      {p.category}
                    </p>
                  )}
                  <h3 className="text-xl md:text-2xl font-bold leading-tight group-hover:text-primary mb-2">
                    {p.title}
                  </h3>
                  {p.excerpt && (
                    <p className="text-muted-foreground line-clamp-2 mb-2 font-serif">
                      {p.excerpt}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground flex items-center gap-3">
                    <span>{format(new Date(p.publishedAt), "MMM d, yyyy")}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {p.readTime}m
                    </span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
