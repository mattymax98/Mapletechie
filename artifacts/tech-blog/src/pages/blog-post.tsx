import { useGetPostBySlug, useListPosts, useGetAuthor } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import {
  Clock,
  Eye,
  Share2,
  Twitter,
  Linkedin,
  Instagram,
  Github,
  Globe,
  Facebook,
  Link2,
  ArrowUp,
  List,
} from "lucide-react";
import { Helmet } from "react-helmet-async";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SEO } from "@/components/SEO";
import { AuthorBio } from "@/components/AuthorBio";
import { CommentsSection } from "@/components/CommentsSection";
import { applyResponsiveImages } from "@/lib/responsiveImage";

const SITE_URL = "https://mapletechie.com";

function PostContent({
  html,
  onHeadingsExtracted,
}: {
  html: string;
  onHeadingsExtracted: (headings: { id: string; text: string }[]) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const h2s = Array.from(ref.current.querySelectorAll("h2"));
    const headings = h2s.map((h, i) => {
      const text = (h.textContent || "").trim();
      const id =
        text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .slice(0, 60) || `section-${i + 1}`;
      h.id = id;
      return { id, text };
    });
    onHeadingsExtracted(headings);
    applyResponsiveImages(ref.current);
  }, [html, onHeadingsExtracted]);

  return (
    <div
      ref={ref}
      className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80 prose-img:border prose-img:border-border font-serif leading-relaxed prose-headings:scroll-mt-24"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const scrolled = h.scrollTop;
      const total = h.scrollHeight - h.clientHeight;
      setProgress(total > 0 ? Math.min(100, (scrolled / total) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="fixed top-0 left-0 right-0 h-1 z-50 bg-transparent pointer-events-none">
      <div
        className="h-full bg-primary transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function TableOfContents({ headings }: { headings: { id: string; text: string }[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: [0, 1] },
    );
    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <nav className="border border-border p-5 mb-10 bg-card/40">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-muted-foreground mb-3">
        <List className="h-3.5 w-3.5" />
        In this article
      </div>
      <ul className="space-y-2">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                history.replaceState(null, "", `#${h.id}`);
              }}
              className={`block text-sm leading-snug border-l-2 pl-3 transition-colors ${
                activeId === h.id
                  ? "border-primary text-primary font-bold"
                  : "border-border text-muted-foreground hover:text-primary"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ShareButtons({ title, url }: { title: string; url: string }) {
  const enc = encodeURIComponent;
  const links = [
    {
      title: "Share on X (Twitter)",
      Icon: Twitter,
      href: `https://twitter.com/intent/tweet?text=${enc(title)}&url=${enc(url)}`,
    },
    {
      title: "Share on LinkedIn",
      Icon: Linkedin,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
    },
    {
      title: "Share on Facebook",
      Icon: Facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
    },
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      alert("Link copied to clipboard");
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex gap-2">
      {links.map(({ title: t, Icon, href }) => (
        <Button
          key={t}
          asChild
          variant="outline"
          size="icon"
          className="rounded-none border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
          title={t}
        >
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label={t}>
            <Icon className="h-4 w-4" />
          </a>
        </Button>
      ))}
      <Button
        variant="outline"
        size="icon"
        className="rounded-none border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
        title="Copy link"
        onClick={copy}
      >
        <Link2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 800);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-6 right-6 z-40 bg-primary text-primary-foreground p-3 border border-primary shadow-lg hover:bg-primary/90 transition-colors"
      aria-label="Back to top"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}

export default function BlogPost() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";

  const { data: post, isLoading } = useGetPostBySlug(slug, { query: { enabled: !!slug } });
  const { data: relatedByCategory } = useListPosts(
    { category: post?.category ?? undefined, limit: 4 },
    { query: { enabled: !!post?.category } },
  );

  const [headings, setHeadings] = useState<{ id: string; text: string }[]>([]);

  const canonicalUrl = post ? `${SITE_URL}/blog/${post.slug}` : SITE_URL;

  const jsonLd = useMemo(() => {
    if (!post) return null;
    return {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
      headline: post.title,
      description: post.excerpt || undefined,
      image: post.coverImage ? [post.coverImage.startsWith("http") ? post.coverImage : `${SITE_URL}${post.coverImage}`] : undefined,
      datePublished: post.publishedAt,
      dateModified: post.publishedAt,
      author: { "@type": "Person", name: post.author },
      publisher: {
        "@type": "Organization",
        name: "Mapletechie",
        logo: { "@type": "ImageObject", url: `${SITE_URL}/logo-favicon.png` },
      },
      articleSection: post.category || undefined,
      keywords: (post as any).seoKeywords && (post as any).seoKeywords.length
        ? (post as any).seoKeywords.join(", ")
        : undefined,
    };
  }, [post, canonicalUrl]);

  const breadcrumbsLd = useMemo(() => {
    if (!post) return null;
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
        post.category && {
          "@type": "ListItem",
          position: 3,
          name: post.category,
          item: `${SITE_URL}/category/${post.category}`,
        },
        { "@type": "ListItem", position: 4, name: post.title, item: canonicalUrl },
      ].filter(Boolean),
    };
  }, [post, canonicalUrl]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-10 max-w-4xl">
        <Skeleton className="w-24 h-6 mb-6 rounded-none" />
        <Skeleton className="w-full h-16 mb-4 rounded-none" />
        <Skeleton className="w-3/4 h-16 mb-8 rounded-none" />
        <Skeleton className="w-full aspect-video mb-10 rounded-none" />
        <div className="space-y-4">
          <Skeleton className="w-full h-4 rounded-none" />
          <Skeleton className="w-full h-4 rounded-none" />
          <Skeleton className="w-5/6 h-4 rounded-none" />
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl font-black mb-4">Post Not Found</h1>
        <p className="text-muted-foreground mb-8">The article you're looking for doesn't exist or has been removed.</p>
        <Button asChild className="rounded-none uppercase font-bold tracking-wider">
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    );
  }

  const related = (relatedByCategory ?? []).filter((p) => p.id !== post.id).slice(0, 3);

  return (
    <article className="w-full">
      <ReadingProgress />
      <BackToTop />

      <SEO
        title={(post as any).seoTitle || post.title}
        description={(post as any).seoDescription || post.excerpt || undefined}
        image={(post as any).ogImage || `${SITE_URL}/api/og/post/${post.slug}.png`}
        url={`/blog/${post.slug}`}
        type="article"
        publishedTime={post.publishedAt ?? undefined}
        author={post.author ?? undefined}
        keywords={
          (post as any).seoKeywords && (post as any).seoKeywords.length > 0
            ? (post as any).seoKeywords
            : post.category
              ? [post.category, "tech", "technology"]
              : ["tech", "technology"]
        }
      />
      {jsonLd && (
        <Helmet>
          <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
          {breadcrumbsLd && (
            <script type="application/ld+json">{JSON.stringify(breadcrumbsLd)}</script>
          )}
        </Helmet>
      )}

      {/* Header */}
      <header className="container mx-auto px-4 md:px-6 py-10 md:py-16 max-w-4xl">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-muted-foreground mb-6" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-primary">Home</Link>
          <span>/</span>
          <Link href="/blog" className="hover:text-primary">Blog</Link>
          {post.category && (
            <>
              <span>/</span>
              <Link href={`/category/${post.category}`} className="hover:text-primary">
                {post.category}
              </Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-3 mb-6">
          <Badge className="bg-primary text-primary-foreground hover:bg-primary rounded-none uppercase font-bold tracking-wider border-none">
            {post.category}
          </Badge>
          <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Clock className="h-3 w-3" /> {post.readTime} min read
          </span>
          <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Eye className="h-3 w-3" /> {post.viewCount.toLocaleString()}
          </span>
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-black leading-[1.1] tracking-tight mb-6">
          {post.title}
        </h1>

        <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed font-serif mb-8 border-l-4 border-primary pl-6">
          {post.excerpt}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-4 py-6 border-y border-border">
          <BylineAuthor
            authorId={post.authorId}
            fallbackName={post.author}
            fallbackAvatar={post.authorAvatar}
            publishedAt={post.publishedAt}
          />

          <div className="flex flex-wrap gap-2">
            <AuthorSocials authorId={post.authorId} />
            <ShareButtons title={post.title} url={canonicalUrl} />
          </div>
        </div>
      </header>

      {/* Cover Image */}
      <div className="w-full max-w-6xl mx-auto px-4 md:px-6 mb-12">
        <div className="aspect-video w-full bg-muted border border-border">
          <img
            loading="lazy"
            decoding="async"
            src={post.coverImage || "/images/hero-post.png"}
            alt={post.title}
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 md:px-6 max-w-3xl mb-20">
        <TableOfContents headings={headings} />
        <PostContent html={post.content} onHeadingsExtracted={setHeadings} />

        {/* Inline newsletter CTA */}
        <div className="mt-12 p-6 md:p-8 border-2 border-primary bg-primary/5">
          <p className="text-xs uppercase tracking-widest font-bold text-primary mb-2">Don't miss the next one</p>
          <h3 className="text-2xl md:text-3xl font-black mb-3">Get our weekly tech digest.</h3>
          <p className="text-muted-foreground mb-4 font-serif">
            One email, every Sunday. The week's biggest stories, sharpest takes, and what to read next.
          </p>
          <Button asChild className="rounded-none uppercase font-bold tracking-wider">
            <Link href="/#newsletter">Subscribe free</Link>
          </Button>
        </div>

        {post.tags && post.tags.length > 0 && (
          <div className="mt-12 pt-8 border-t border-border flex flex-wrap gap-2">
            <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground mr-4 flex items-center">Tags:</span>
            {post.tags.map(tag => (
              <Link key={tag} href={`/tag/${encodeURIComponent(tag.toLowerCase())}`}>
                <Badge variant="secondary" className="rounded-none uppercase tracking-wider font-bold hover:bg-primary hover:text-primary-foreground cursor-pointer">
                  #{tag}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Author Bio */}
      <div className="container mx-auto px-4 md:px-6 max-w-4xl pb-10">
        <AuthorBio
          authorId={(post as any).authorId ?? null}
          fallbackName={post.author}
          fallbackAvatar={post.authorAvatar}
        />
      </div>

      {/* Comments */}
      <CommentsSection postSlug={post.slug} />

      {/* Related Posts (by category) */}
      {related.length > 0 && (
        <div className="bg-card border-t border-border py-20">
          <div className="container mx-auto px-4 md:px-6 max-w-6xl">
            <h2 className="text-3xl font-black uppercase tracking-tight mb-2 flex items-center gap-3">
              <span className="w-4 h-4 bg-primary block" /> More in {post.category}
            </h2>
            <p className="text-muted-foreground mb-10 font-serif">Keep going down the rabbit hole.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {related.map((rp, idx) => (
                <Link key={rp.id} href={`/blog/${rp.slug}`} className="group flex flex-col gap-4">
                  <div className="overflow-hidden border border-border aspect-video bg-muted relative">
                    <img
                      loading="lazy"
                      decoding="async"
                      src={rp.coverImage || `/images/post-${(idx % 2) + 1}.png`}
                      alt={rp.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                      {rp.title}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function AuthorSocials({ authorId }: { authorId?: number }) {
  const { data: author } = useGetAuthor(authorId ?? 0, {
    query: { enabled: !!authorId },
  });
  if (!author) return null;
  const links: { url?: string; Icon: typeof Twitter; title: string }[] = [
    { url: author.twitterUrl, Icon: Twitter, title: "Twitter / X" },
    { url: author.linkedinUrl, Icon: Linkedin, title: "LinkedIn" },
    { url: author.instagramUrl, Icon: Instagram, title: "Instagram" },
    { url: author.githubUrl, Icon: Github, title: "GitHub" },
    { url: author.websiteUrl, Icon: Globe, title: "Website" },
  ].filter((l): l is { url: string; Icon: typeof Twitter; title: string } => !!l.url && l.url.trim() !== "");
  if (links.length === 0) return null;
  return (
    <>
      {links.map(({ url, Icon, title }) => (
        <Button
          key={title}
          asChild
          variant="outline"
          size="icon"
          className="rounded-none border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
          title={`${author.displayName} on ${title}`}
        >
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Icon className="h-4 w-4" />
          </a>
        </Button>
      ))}
    </>
  );
}

function BylineAuthor({
  authorId,
  fallbackName,
  fallbackAvatar,
  publishedAt,
}: {
  authorId?: number;
  fallbackName: string;
  fallbackAvatar?: string;
  publishedAt: string;
}) {
  const { data: author } = useGetAuthor(authorId ?? 0, {
    query: { enabled: !!authorId },
  });
  const name = author?.displayName || fallbackName;
  const avatar = author?.avatarUrl || fallbackAvatar;
  const username = (author as any)?.username as string | undefined;
  const NameWrap = username
    ? ({ children }: { children: React.ReactNode }) => (
        <Link href={`/author/${username}`} className="hover:text-primary transition-colors">
          {children}
        </Link>
      )
    : ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return (
    <div className="flex items-center gap-4">
      <NameWrap>
        <div className="w-12 h-12 bg-muted rounded-full overflow-hidden border border-border cursor-pointer">
          {avatar ? (
            <img src={avatar} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-bold text-lg bg-primary/10 text-primary">
              {name.charAt(0)}
            </div>
          )}
        </div>
      </NameWrap>
      <div>
        <NameWrap>
          <div className="font-bold tracking-wide cursor-pointer">{name}</div>
        </NameWrap>
        <div className="text-sm text-muted-foreground">{format(new Date(publishedAt), 'MMMM dd, yyyy')}</div>
      </div>
    </div>
  );
}
