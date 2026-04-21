import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { Clock, Hash } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";

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
}

export default function TagPage() {
  const params = useParams<{ tag: string }>();
  const tag = params.tag || "";

  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/tags/${encodeURIComponent(tag)}/posts`);
        if (!r.ok) return;
        const list = (await r.json()) as PostRow[];
        if (!cancelled) setPosts(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tag]);

  return (
    <div className="w-full">
      <SEO
        title={`#${tag} — Tag archive`}
        description={`Every Mapletechie story tagged "${tag}".`}
        image={`/api/og/tag/${encodeURIComponent(tag)}.png`}
        url={`/tag/${tag}`}
      />

      <div className="bg-card border-b border-border py-16 md:py-20 text-center">
        <div className="container mx-auto px-4">
          <p className="text-primary uppercase tracking-widest text-sm font-bold mb-3 flex items-center justify-center gap-2">
            <Hash className="h-4 w-4" /> Tag
          </p>
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-3">
            {tag}
          </h1>
          {posts && (
            <p className="text-muted-foreground font-serif">
              {posts.length} {posts.length === 1 ? "story" : "stories"}
            </p>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 max-w-6xl py-16">
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <Skeleton className="w-full aspect-[4/3]" />
                <Skeleton className="w-full h-6" />
                <Skeleton className="w-3/4 h-6" />
              </div>
            ))}
          </div>
        )}
        {!loading && posts && posts.length === 0 && (
          <div className="border border-dashed border-border p-10 text-center">
            <p className="text-lg font-bold mb-1">No stories yet for #{tag}.</p>
            <Button asChild variant="outline" className="mt-4 rounded-none font-bold uppercase">
              <Link href="/blog">Browse all stories</Link>
            </Button>
          </div>
        )}
        {!loading && posts && posts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((p, idx) => (
              <Link
                key={p.id}
                href={`/blog/${p.slug}`}
                className="group flex flex-col gap-3 border border-transparent hover:border-border p-2 -m-2 transition-colors"
              >
                <div className="overflow-hidden aspect-[4/3] bg-muted relative border border-border">
                  <img
                    loading="lazy"
                    decoding="async"
                    src={p.coverImage || `/images/post-${(idx % 2) + 1}.png`}
                    alt={p.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div>
                  {p.category && (
                    <p className="text-xs uppercase tracking-widest font-bold text-primary mb-1">
                      {p.category}
                    </p>
                  )}
                  <h3 className="text-xl font-bold leading-tight group-hover:text-primary line-clamp-3 mb-2">
                    {p.title}
                  </h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-3">
                    <span className="text-primary font-bold uppercase tracking-wider">
                      {p.author}
                    </span>
                    <span>·</span>
                    <span>{format(new Date(p.publishedAt), "MMM d, yyyy")}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {p.readTime}m
                    </span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
