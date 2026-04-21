import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { Clock, Twitter, Linkedin, Instagram, Github, Globe } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";

interface AuthorProfile {
  id: number;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  twitterUrl: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
}

interface PostRow {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  coverImage: string | null;
  readTime: number;
  publishedAt: string;
}

export default function AuthorPage() {
  const params = useParams<{ username: string }>();
  const username = params.username || "";

  const [author, setAuthor] = useState<AuthorProfile | null>(null);
  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const r = await fetch(`/api/authors/by-username/${encodeURIComponent(username)}`);
        if (!r.ok) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const a = (await r.json()) as AuthorProfile;
        if (cancelled) return;
        setAuthor(a);
        const p = await fetch(`/api/authors/${a.id}/posts`);
        if (!p.ok) return;
        const list = (await p.json()) as PostRow[];
        if (!cancelled) setPosts(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (loading && !author) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <Skeleton className="w-40 h-40 rounded-full mb-6" />
        <Skeleton className="w-64 h-10 mb-3" />
        <Skeleton className="w-96 h-5" />
      </div>
    );
  }

  if (notFound || !author) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl font-black mb-4">Author Not Found</h1>
        <p className="text-muted-foreground mb-8">We couldn't find an author with that name.</p>
        <Button asChild className="rounded-none uppercase font-bold tracking-wider">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  const socials = [
    { url: author.twitterUrl, Icon: Twitter, title: "Twitter / X" },
    { url: author.linkedinUrl, Icon: Linkedin, title: "LinkedIn" },
    { url: author.instagramUrl, Icon: Instagram, title: "Instagram" },
    { url: author.githubUrl, Icon: Github, title: "GitHub" },
    { url: author.websiteUrl, Icon: Globe, title: "Website" },
  ].filter((l) => !!l.url && l.url.trim() !== "");

  return (
    <div className="w-full">
      <SEO
        title={`${author.displayName} — Author`}
        description={author.bio || `Articles by ${author.displayName} on Mapletechie.`}
        image={`/api/og/author/${encodeURIComponent(author.username)}.png`}
        url={`/author/${author.username}`}
      />

      <div className="bg-card border-b border-border py-16 md:py-20">
        <div className="container mx-auto px-4 md:px-6 max-w-4xl flex flex-col md:flex-row items-start gap-8">
          <div className="w-32 h-32 md:w-40 md:h-40 bg-muted rounded-full overflow-hidden border border-border shrink-0">
            {author.avatarUrl ? (
              <img
                src={author.avatarUrl}
                alt={author.displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-5xl font-black bg-primary/10 text-primary">
                {author.displayName.charAt(0)}
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="text-primary uppercase tracking-widest text-sm font-bold mb-2">
              Author
            </p>
            <h1 className="font-black text-4xl md:text-6xl tracking-tight mb-4">
              {author.displayName}
            </h1>
            {author.bio && (
              <p className="text-lg text-muted-foreground font-serif leading-relaxed mb-5 max-w-2xl">
                {author.bio}
              </p>
            )}
            {socials.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {socials.map(({ url, Icon, title }) => (
                  <Button
                    key={title}
                    asChild
                    variant="outline"
                    size="icon"
                    className="rounded-none border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                    title={`${author.displayName} on ${title}`}
                  >
                    <a href={url!} target="_blank" rel="noopener noreferrer">
                      <Icon className="h-4 w-4" />
                    </a>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 max-w-6xl py-16">
        <h2 className="text-2xl font-black uppercase tracking-tight mb-8 flex items-center gap-3">
          <span className="w-3 h-3 bg-primary block" /> Recent stories
        </h2>
        {posts && posts.length === 0 && (
          <div className="border border-dashed border-border p-10 text-center">
            <p className="text-lg font-bold mb-1">No published stories yet.</p>
            <p className="text-muted-foreground text-sm">Check back soon.</p>
          </div>
        )}
        {posts && posts.length > 0 && (
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
