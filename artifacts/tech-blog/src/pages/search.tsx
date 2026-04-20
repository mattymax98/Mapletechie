import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useListPosts } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon } from "lucide-react";
import { SEO } from "@/components/SEO";

export default function SearchPage() {
  const [location] = useLocation();
  const initial = useMemo(() => {
    const qs = typeof window !== "undefined" ? window.location.search : "";
    return new URLSearchParams(qs).get("q") ?? "";
  }, [location]);

  const [query, setQuery] = useState(initial);
  const { data: posts, isLoading } = useListPosts();

  useEffect(() => {
    setQuery(initial);
  }, [initial]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!posts) return [];
    if (!q) return [];
    return posts.filter((p) => {
      const haystack = [p.title, p.excerpt, p.content, p.author, p.categorySlug]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [posts, q]);

  return (
    <div className="container mx-auto px-4 md:px-6 py-12 md:py-16 max-w-4xl">
      <SEO title="Search — Mapletechie" description="Search articles on Mapletechie." />
      <p className="text-primary uppercase tracking-widest text-sm font-bold mb-3">Search</p>
      <h1 className="font-serif text-5xl md:text-6xl font-bold leading-tight mb-8">
        Find a story.
      </h1>

      <div className="relative mb-10">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          autoFocus
          type="search"
          placeholder="Search articles, authors, topics…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-12 h-14 text-lg rounded-none"
          data-testid="input-search"
        />
      </div>

      {q.length === 0 && (
        <p className="text-muted-foreground">Type something above to search every article we've published.</p>
      )}

      {q.length > 0 && isLoading && (
        <p className="text-muted-foreground">Searching…</p>
      )}

      {q.length > 0 && !isLoading && results.length === 0 && (
        <div className="border border-border p-10 text-center">
          <p className="font-bold text-lg mb-1">No matches for "{query}".</p>
          <p className="text-muted-foreground text-sm">Try a different word or browse the latest stories.</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-bold">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
          {results.map((p) => (
            <Link
              key={p.id}
              href={`/blog/${p.slug}`}
              className="block border-b border-border pb-6 hover:text-primary transition-colors"
              data-testid={`link-result-${p.slug}`}
            >
              {p.categorySlug && (
                <p className="text-xs uppercase tracking-widest text-primary font-bold mb-1">
                  {p.categorySlug}
                </p>
              )}
              <h2 className="font-serif text-2xl md:text-3xl font-bold leading-snug mb-2">{p.title}</h2>
              {p.excerpt && (
                <p className="text-muted-foreground line-clamp-2">{p.excerpt}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
