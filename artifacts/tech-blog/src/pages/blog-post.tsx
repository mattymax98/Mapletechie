import {
  useGetPostBySlug,
  useListPosts,
  useListComments,
  getGetPostBySlugQueryKey,
  getListPostsQueryKey,
  getListCommentsQueryKey,
} from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import {
  Clock,
  Eye,
  MessageCircle,
  Twitter,
  Linkedin,
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
import { applyResponsiveImages, makeArticleHtmlResponsive, responsiveCoverProps, socialImageUrl, COVER_SIZES } from "@/lib/responsiveImage";
import { ensureImgAlt } from "@/lib/ensureImgAlt";
import { SeriesBanner } from "@/components/SeriesBanner";
import { CategoryChip } from "@/components/CategoryChip";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { buildArticleJsonLd, buildBreadcrumbJsonLd } from "@/lib/articleSchema";
import { splitSocialEmbeds, SocialEmbedView } from "@/components/SocialEmbeds";
import { AdSlot, adPlacementEnabled, splitHtmlForInArticleAds } from "@/components/AdSlot";

const SITE_URL = "https://mapletechie.com";

// "Jul 25, 2026 at 3:00 AM EDT" in the reader's local timezone.
function formatDateTimeWithZone(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
  return `${date} at ${time}`;
}

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
    // Safety net for anything the pre-render pass missed (e.g. content
    // injected by browser extensions); normally a no-op thanks to the
    // data-responsive marker.
    applyResponsiveImages(ref.current);
  }, [html, onHeadingsExtracted]);

  // Inject srcset/sizes into the HTML string before first render so the
  // preload scanner never downloads the full-size original on phones.
  // ensureImgAlt backfills alt="" on legacy images saved without one, so the
  // hydrated page matches the crawler-prerendered markup.
  const responsiveHtml = useMemo(() => ensureImgAlt(makeArticleHtmlResponsive(html)), [html]);
  // Split out social-embed placeholders so they render as real React
  // components (click-to-load YouTube, tweet widgets, ...) instead of the
  // static fallback link inside the saved HTML.
  const segments = useMemo(() => splitSocialEmbeds(responsiveHtml), [responsiveHtml]);

  // On longer articles, break the HTML segments at safe top-level paragraph
  // boundaries so an in-article ad can sit between paragraphs (never inside
  // code blocks, figures or embeds). Max 2 per article; short posts get none.
  // With no ad config (or in dev) this is a no-op and nothing changes.
  const MAX_IN_ARTICLE_ADS = 2;
  const rendered = useMemo(() => {
    const out: Array<{ key: string; node: "embed" | "html" | "ad"; seg?: (typeof segments)[number]; html?: string }> = [];
    let adBudget = adPlacementEnabled("inArticle") ? MAX_IN_ARTICLE_ADS : 0;
    segments.forEach((seg, i) => {
      if (seg.kind === "embed") {
        out.push({ key: `e-${i}`, node: "embed", seg });
        return;
      }
      if (adBudget <= 0) {
        out.push({ key: `h-${i}`, node: "html", html: seg.html });
        return;
      }
      const chunks = splitHtmlForInArticleAds(seg.html, { maxBreaks: adBudget });
      chunks.forEach((chunk, j) => {
        out.push({ key: `h-${i}-${j}`, node: "html", html: chunk });
        if (j < chunks.length - 1) {
          out.push({ key: `a-${i}-${j}`, node: "ad" });
          adBudget -= 1;
        }
      });
    });
    return out;
  }, [segments]);

  return (
    <div
      ref={ref}
      className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80 prose-img:border prose-img:border-border font-serif leading-relaxed prose-headings:scroll-mt-24"
    >
      {rendered.map((item) =>
        item.node === "embed" && item.seg?.kind === "embed" ? (
          <SocialEmbedView key={item.key} embed={item.seg.embed} />
        ) : item.node === "ad" ? (
          <AdSlot key={item.key} placement="inArticle" className="not-prose my-8" />
        ) : (
          <div key={item.key} dangerouslySetInnerHTML={{ __html: item.html ?? "" }} />
        ),
      )}
    </div>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`Rated ${rating} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, rating - i));
        return (
          <span key={i} className="relative inline-block text-2xl leading-none">
            <span className="text-muted-foreground/30">★</span>
            <span
              className="absolute inset-0 overflow-hidden text-primary"
              style={{ width: `${fill * 100}%` }}
            >
              ★
            </span>
          </span>
        );
      })}
    </div>
  );
}

function VerdictBox({
  rating,
  pros,
  cons,
  verdict,
}: {
  rating: number | null | undefined;
  pros: string[] | null | undefined;
  cons: string[] | null | undefined;
  verdict: string | null | undefined;
}) {
  const hasRating = typeof rating === "number" && Number.isFinite(rating);
  const prosList = (pros ?? []).filter(Boolean);
  const consList = (cons ?? []).filter(Boolean);
  const hasVerdict = !!(verdict && verdict.trim());
  if (!hasRating && !hasVerdict && prosList.length === 0 && consList.length === 0) {
    return null;
  }
  return (
    <aside className="mb-12 border-2 border-primary bg-primary/5" data-testid="verdict-box">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 md:p-6 border-b-2 border-primary">
        <div>
          <p className="text-xs uppercase tracking-widest font-bold text-primary mb-1">The verdict</p>
          {hasVerdict && (
            <p className="text-lg md:text-xl font-serif font-medium leading-snug">{verdict}</p>
          )}
        </div>
        {hasRating && (
          <div className="flex flex-col items-end shrink-0">
            <span className="text-4xl font-black tabular-nums leading-none">{rating!.toFixed(1)}</span>
            <RatingStars rating={rating!} />
            <span className="text-xs uppercase tracking-widest text-muted-foreground mt-1">out of 5</span>
          </div>
        )}
      </div>
      {(prosList.length > 0 || consList.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-primary/30">
          {prosList.length > 0 && (
            <div className="p-5 md:p-6 bg-background">
              <p className="text-xs uppercase tracking-widest font-bold text-emerald-500 mb-3">Pros</p>
              <ul className="space-y-2">
                {prosList.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm md:text-base">
                    <span className="text-emerald-500 font-bold shrink-0">+</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {consList.length > 0 && (
            <div className="p-5 md:p-6 bg-background">
              <p className="text-xs uppercase tracking-widest font-bold text-rose-500 mb-3">Cons</p>
              <ul className="space-y-2">
                {consList.map((c, i) => (
                  <li key={i} className="flex gap-2 text-sm md:text-base">
                    <span className="text-rose-500 font-bold shrink-0">−</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </aside>
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

  const { data: post, isLoading } = useGetPostBySlug(slug, {
    query: { enabled: !!slug, queryKey: getGetPostBySlugQueryKey(slug) },
  });
  const relatedParams = { category: post?.category ?? undefined, limit: 4 };
  const { data: relatedByCategory } = useListPosts(relatedParams, {
    query: {
      enabled: !!post?.category,
      queryKey: getListPostsQueryKey(relatedParams),
    },
  });

  const [headings, setHeadings] = useState<{ id: string; text: string }[]>([]);

  const { data: comments } = useListComments(
    { postSlug: slug },
    { query: { enabled: !!slug, queryKey: getListCommentsQueryKey({ postSlug: slug }) } },
  );
  const commentCount = comments?.length ?? 0;

  const canonicalUrl = post ? `${SITE_URL}/blog/${post.slug}` : SITE_URL;

  // Shared with the crawler prerender server so the schema browsers emit is
  // byte-for-byte what Google gets in the prerendered HTML.
  const jsonLd = useMemo(
    () => (post ? buildArticleJsonLd(post, { siteUrl: SITE_URL }) : null),
    [post],
  );

  const breadcrumbsLd = useMemo(
    () => (post ? buildBreadcrumbJsonLd(post, { siteUrl: SITE_URL }) : null),
    [post],
  );

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
        image={socialImageUrl((post as any).ogImage) || `${SITE_URL}/api/og/post/${post.slug}.png`}
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
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Blog", href: "/blog" },
            ...(post.category
              ? [{ label: post.category, href: `/category/${post.categorySlug ?? post.category}` }]
              : []),
          ]}
        />

        <div className="flex items-center gap-3 mb-6">
          {(post.categories?.length
            ? post.categories
            : [{ id: 0, name: post.category ?? "", slug: post.categorySlug ?? "" }]
          ).map((c) => (
            <CategoryChip key={c.slug || c.name} category={c.name} slug={c.slug || undefined} variant="solid" className="text-xs px-3 py-1.5" />
          ))}
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span data-testid="text-publish-datetime">{formatDateTimeWithZone(post.publishedAt)}</span>
            <a
              href="#comments"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("comments")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="flex items-center gap-1.5 hover:text-primary transition-colors"
              data-testid="link-comment-count"
            >
              <MessageCircle className="h-4 w-4" />
              {commentCount} {commentCount === 1 ? "comment" : "comments"}
            </a>
          </div>

          <ShareButtons title={post.title} url={canonicalUrl} />
        </div>
      </header>

      {/* Series banner (if part of a series) */}
      {(post as any).seriesId && (
        <SeriesBanner seriesId={(post as any).seriesId} currentPostId={post.id} />
      )}

      {/* Cover Image */}
      <div className="w-full max-w-6xl mx-auto px-4 md:px-6 mb-12 mt-8">
        <div className="w-full bg-muted border border-border">
          {/* Fluid cover: rendered at the image's natural aspect ratio (no 16:9
              crop), so pasted images of any shape display uncropped at full
              quality. width/height are only a pre-load layout hint. */}
          <img
            loading="eager"
            fetchPriority="high"
            decoding="async"
            width={1200}
            height={675}
            {...responsiveCoverProps(post.coverImage || "/images/hero-post.webp", COVER_SIZES.full)}
            alt={(post as any).coverImageAlt ?? ""}
            className="w-full h-auto"
          />
        </div>
        {/* Compact Verge-style byline right under the cover image */}
        <div className="mt-4">
          <AuthorBio
            authorId={(post as any).authorId ?? null}
            fallbackName={post.author}
            fallbackAvatar={post.authorAvatar}
          />
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 md:px-6 max-w-3xl mb-20">
        <TableOfContents headings={headings} />
        <VerdictBox
          rating={(post as any).rating}
          pros={(post as any).pros}
          cons={(post as any).cons}
          verdict={(post as any).verdict}
        />
        <PostContent html={post.content} onHeadingsExtracted={setHeadings} />

        {/* Designed ad slot below the article body — collapses to nothing
            when no ad is served or ads aren't configured. */}
        <AdSlot placement="belowArticle" className="mt-12" />

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
                      {...responsiveCoverProps(rp.coverImage || `/images/post-${(idx % 2) + 1}.png`, COVER_SIZES.grid3Narrow)}
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
