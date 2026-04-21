import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon, Loader2 } from "lucide-react";
import { SEO } from "@/components/SEO";
import { format } from "date-fns";

interface PostRow {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  author: string;
  publishedAt: string;
}

export default function SearchPage() {
  const [location] = useLocation();
  const initial = useMemo(() => {
    const qs = typeof window !== "undefined" ? window.location.search : "";
    return new URLSearchParams(qs).get("q") ?? "";
  }, [location]);

  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [executed, setExecuted] = useState("");

  useEffect(() => setQuery(initial), [initial]);

  // Debounced server-side search with abort + stale-response guard
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setExecuted("");
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (r.ok) {
          const data = (await r.json()) as PostRow[];
          if (controller.signal.aborted) return;
          setResults(data);
        } else {
          setResults([]);
        }
        setExecuted(q);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [query]);

  // Highlight matched text in titles/excerpts
  const highlight = (text: string | null) => {
    if (!text || !executed) return text;
    const re = new RegExp(`(${executed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(re);
    return parts.map((p, i) =>
      i % 2 === 1 ? (
        <mark key={i} className="bg-primary/20 text-foreground px-0.5">
          {p}
        </mark>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  };

  const q = query.trim();

  return (
    <div className="container mx-auto px-4 md:px-6 py-12 md:py-16 max-w-4xl">
      <SEO title="Search" description="Search articles on Mapletechie." />
      <p className="text-primary uppercase tracking-widest text-sm font-bold mb-3">Search</p>
      <h1 className="font-serif text-5xl md:text-6xl font-bold leading-tight mb-8">
        Find a story.
      </h1>

      <div className="relative mb-10">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
        <Input
          autoFocus
          type="search"
          placeholder="Search articles, authors, topics…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-12 pr-12 h-14 text-lg rounded-none"
          data-testid="input-search"
        />
        {loading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground animate-spin" />
        )}
      </div>

      {q.length === 0 && (
        <p className="text-muted-foreground">
          Type at least 2 characters to search every article we've published.
        </p>
      )}

      {q.length > 0 && q.length < 2 && (
        <p className="text-muted-foreground">Keep going — at least 2 characters please.</p>
      )}

      {q.length >= 2 && !loading && results.length === 0 && executed && (
        <div className="border border-border p-10 text-center">
          <p className="font-bold text-lg mb-1">No matches for "{executed}".</p>
          <p className="text-muted-foreground text-sm">
            Try a different word or browse{" "}
            <Link href="/blog" className="text-primary hover:underline">
              the latest stories
            </Link>
            .
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-bold">
            {results.length} result{results.length === 1 ? "" : "s"}
            {executed && ` for "${executed}"`}
          </p>
          {results.map((p) => (
            <Link
              key={p.id}
              href={`/blog/${p.slug}`}
              className="block border-b border-border pb-6 hover:text-primary transition-colors"
              data-testid={`link-result-${p.slug}`}
            >
              {p.category && (
                <p className="text-xs uppercase tracking-widest text-primary font-bold mb-1">
                  {p.category}
                </p>
              )}
              <h2 className="font-serif text-2xl md:text-3xl font-bold leading-snug mb-2">
                {highlight(p.title)}
              </h2>
              {p.excerpt && (
                <p className="text-muted-foreground line-clamp-2 mb-2">
                  {highlight(p.excerpt)}
                </p>
              )}
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
                {p.author} · {format(new Date(p.publishedAt), "MMM d, yyyy")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
