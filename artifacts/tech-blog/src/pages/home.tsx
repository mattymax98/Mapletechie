import {
  useGetFeaturedPosts,
  useGetLatestPosts,
  useGetTrendingPosts,
  useGetFeaturedEditor,
  useListCategories,
  useListPosts,
  useSubscribeNewsletter,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SEO } from "@/components/SEO";
import { Link } from "wouter";
import { format } from "date-fns";
import { ArrowRight, Clock, MessageCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/Reveal";
import { useToast } from "@/hooks/use-toast";
import { responsiveCoverProps, COVER_SIZES } from "@/lib/responsiveImage";
import { CategoryChip } from "@/components/CategoryChip";
import { DEFAULT_CATEGORY_COLOR } from "@/lib/categoryColors";

const PRINCIPLES = [
  { n: "01", t: "Independent.",   d: "No press junkets, no sponsored takes dressed up as reviews. We pay for our own gear and tell you what's actually true." },
  { n: "02", t: "Opinionated.",   d: "We have a point of view. If a product is overpriced, we'll say it. If a launch is forgettable, we won't pretend." },
  { n: "03", t: "Plain-spoken.",  d: "No buzzword soup. Tech should be explained in language a smart person can actually use, not jargon nobody verifies." },
  { n: "04", t: "Built in Canada.", d: "We write from Toronto with a global lens — covering the tech that matters, with prices and context that include you." },
];

export default function Home() {
  const { data: featuredPosts, isLoading: loadingFeatured } = useGetFeaturedPosts();
  const { data: latestPosts, isLoading: loadingLatest } = useGetLatestPosts({ limit: 6 });
  const { data: trendingPosts, isLoading: loadingTrending } = useGetTrendingPosts();
  const { data: editor } = useGetFeaturedEditor();
  const { data: categories } = useListCategories();
  const { data: discussedPosts, isLoading: loadingDiscussed } = useQuery({
    queryKey: ["posts", "most-discussed"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/posts/most-discussed`);
      if (!res.ok) return [] as any[];
      return (await res.json()) as Array<{ id: number; slug: string; title: string; category: string; commentCount: number }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const heroPost = featuredPosts?.[0];
  const subHeroPosts = featuredPosts?.slice(1, 3) || [];

  // Top categories (by published post count) for the magazine sections below.
  const sectionCategories = (categories ?? [])
    .filter((c) => (c.postCount ?? 0) > 0)
    .sort((a, b) => (b.postCount ?? 0) - (a.postCount ?? 0))
    .slice(0, 4);

  return (
    <div className="w-full">
      <SEO />

      {/* ============ MANIFESTO HERO ============ */}
      <section className="relative overflow-hidden border-b border-border bg-background">
        <div className="container mx-auto px-4 md:px-6 py-10 md:py-14 relative">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-block w-8 h-px bg-primary" />
            <span className="text-[11px] uppercase tracking-[0.25em] font-bold text-primary">
              Independent Tech Publication
            </span>
          </div>

          <h1 className="font-serif font-black tracking-tight leading-[0.95] text-4xl sm:text-5xl md:text-6xl max-w-4xl">
            Tech, <span className="italic text-primary">told straight</span>.
          </h1>

          <div className="mt-5 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <p className="max-w-2xl text-base md:text-lg text-muted-foreground leading-relaxed">
              No press junkets. No hype cycles. <span className="text-foreground font-medium">Sharp opinion, real reviews,</span> and the context the spec sheets leave out.
            </p>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Button asChild className="rounded-none font-bold uppercase tracking-wider">
                <Link href="/blog">Read the latest <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline" className="rounded-none font-bold uppercase tracking-wider border-2">
                <Link href="/about">About us</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FEATURED STORIES ============ */}
      <div className="container mx-auto px-4 md:px-6 py-14">
        <div className="flex items-end justify-between mb-8 border-b border-border pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] font-bold text-primary mb-1">This Week</p>
            <h2 className="text-3xl md:text-4xl font-serif font-black tracking-tight">The stories worth your time</h2>
          </div>
          <Link href="/blog" className="hidden sm:flex text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-primary items-center gap-1">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {loadingFeatured ? (
            <Skeleton className="col-span-1 lg:col-span-2 aspect-[16/9] lg:aspect-auto h-full min-h-[400px] rounded-none" />
          ) : heroPost ? (
            <Link href={`/blog/${heroPost.slug}`} className="group relative col-span-1 lg:col-span-2 overflow-hidden bg-muted min-h-[400px] lg:min-h-[500px] flex flex-col justify-end p-6 md:p-10 border border-border">
              <div className="absolute inset-0 z-0">
                <img
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  width={1200}
                  height={675}
                  {...responsiveCoverProps(heroPost.coverImage || "/images/hero-post.webp", COVER_SIZES.hero)}
                  alt={heroPost.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
              </div>
              <div className="relative z-10 max-w-3xl">
                <CategoryChip category={heroPost.category} variant="solid" className="mb-4" />
                <h3 className="text-3xl md:text-5xl font-serif font-black leading-[1.05] text-white mb-4 group-hover:text-primary transition-colors line-clamp-3">
                  {heroPost.title}
                </h3>
                <p className="text-gray-200 text-lg mb-6 line-clamp-2 hidden md:block">
                  {heroPost.excerpt}
                </p>
                <div className="flex items-center text-sm text-gray-300 font-medium uppercase tracking-wide gap-4">
                  <span>{heroPost.author}</span>
                  <span className="w-1 h-1 rounded-full bg-primary" />
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {heroPost.readTime} min read</span>
                </div>
              </div>
            </Link>
          ) : null}

          <div className="flex flex-col gap-6 col-span-1">
            {loadingFeatured ? (
              <>
                <Skeleton className="flex-1 min-h-[200px] rounded-none" />
                <Skeleton className="flex-1 min-h-[200px] rounded-none" />
              </>
            ) : subHeroPosts.map((post, idx) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="group relative flex-1 overflow-hidden bg-muted min-h-[240px] flex flex-col justify-end p-6 border border-border">
                <div className="absolute inset-0 z-0">
                  <img loading="lazy" decoding="async"
                    {...responsiveCoverProps(post.coverImage || `/images/post-${idx + 1}.png`, COVER_SIZES.sidebar)}
                    alt={post.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
                </div>
                <div className="relative z-10">
                  <CategoryChip category={post.category} variant="solid" className="mb-2" />
                  <h3 className="text-xl font-serif font-bold leading-tight text-white group-hover:text-primary transition-colors line-clamp-2">
                    {post.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* ============ EXPLORE BY CATEGORY (real, colored) ============ */}
      {(categories?.length ?? 0) > 0 && (
        <section className="border-t border-border bg-background">
          <div className="container mx-auto px-4 md:px-6 py-12 md:py-14">
            <div className="flex items-end justify-between mb-8 border-b border-border pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] font-bold text-primary mb-1">Explore</p>
                <h2 className="text-3xl md:text-4xl font-serif font-black tracking-tight">Pick your beat</h2>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {categories?.map((cat) => {
                const color = cat.color || DEFAULT_CATEGORY_COLOR;
                return (
                  <Link
                    key={cat.id}
                    href={`/category/${cat.slug}`}
                    className="group inline-flex items-center gap-2 border border-border hover:border-transparent px-4 py-2.5 transition-colors bg-card/30 hover:text-white"
                    style={{ ["--cat-color" as any]: color }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = color)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                    data-testid={`home-category-${cat.slug}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden />
                    <span className="font-bold uppercase tracking-wider text-sm">{cat.name}</span>
                    {(cat.postCount ?? 0) > 0 && (
                      <span className="text-xs opacity-60 font-medium">{cat.postCount}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ============ EDITOR'S PICKS (rotated label) ============ */}
      {(() => {
        const topPosts = trendingPosts?.slice(0, 4) || [];
        if (!loadingTrending && topPosts.length === 0) return null;
        return (
          <section className="border-t border-border bg-background">
            <div className="container mx-auto px-4 md:px-6 py-14 md:py-20">
              <div className="flex flex-col md:flex-row gap-8 md:gap-10">
                {/* Rotated header — vertical on md+, horizontal on mobile */}
                <div className="md:shrink-0 md:w-32 lg:w-40 flex md:items-start">
                  <div className="hidden md:flex h-[520px] lg:h-[580px] w-full relative items-center justify-center">
                    <div
                      className="origin-center whitespace-nowrap"
                      style={{ transform: "rotate(-90deg)" }}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className="block w-8 h-px bg-primary" />
                        <span className="text-[10px] uppercase tracking-[0.4em] font-bold text-primary">
                          Hand-picked
                        </span>
                      </div>
                      <h2 className="font-serif font-black tracking-tight text-6xl lg:text-7xl leading-[0.9]">
                        Editor's <span className="italic text-primary">Picks</span>
                      </h2>
                    </div>
                  </div>
                  {/* Mobile fallback header (no rotation) */}
                  <div className="md:hidden">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="block w-8 h-px bg-primary" />
                      <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-primary">
                        Hand-picked
                      </span>
                    </div>
                    <h2 className="font-serif font-black tracking-tight text-4xl leading-none">
                      Editor's <span className="italic text-primary">Picks</span>
                    </h2>
                  </div>
                </div>

                {/* Four articles in a staggered, editorial row */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 md:gap-6">
                  {loadingTrending
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="aspect-[4/5] rounded-none" />
                      ))
                    : topPosts.map((post, idx) => (
                        <Link
                          key={post.id}
                          href={`/blog/${post.slug}`}
                          className={`group block ${
                            idx === 1 ? "md:mt-8" : idx === 2 ? "md:mt-16" : idx === 3 ? "md:mt-24" : ""
                          }`}
                          data-testid={`top-article-${idx}`}
                        >
                          <div className="relative overflow-hidden bg-muted aspect-[4/5] border border-border">
                            <img
                              loading="lazy"
                              decoding="async"
                              {...responsiveCoverProps(post.coverImage || `/images/post-${(idx % 3) + 1}.png`, COVER_SIZES.grid3)}
                              alt={post.title}
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/20 to-transparent" />
                            <div className="absolute top-3 left-3">
                              <span className="font-serif font-black text-4xl lg:text-5xl text-primary leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                                {String(idx + 1).padStart(2, "0")}
                              </span>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 p-4">
                              <CategoryChip category={post.category} variant="solid" className="mb-2" />
                              <h3 className="text-base lg:text-lg font-serif font-bold leading-tight text-white group-hover:text-primary transition-colors line-clamp-3">
                                {post.title}
                              </h3>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center text-xs text-muted-foreground font-medium uppercase tracking-wide gap-3">
                            <span className="truncate">{post.author}</span>
                            <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                            <span className="flex items-center gap-1 shrink-0">
                              <Clock className="h-3 w-3" /> {post.readTime} min
                            </span>
                          </div>
                        </Link>
                      ))}
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* ============ PER-CATEGORY MAGAZINE SECTIONS ============ */}
      {sectionCategories.map((cat) => (
        <CategorySection key={cat.id} category={cat} />
      ))}

      {/* ============ WHAT WE BELIEVE ============ */}
      <section className="border-y border-border bg-card/30">
        <div className="container mx-auto px-4 md:px-6 py-16 md:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4">
              <p className="text-xs uppercase tracking-[0.25em] font-bold text-primary mb-3">The Manifesto</p>
              <h2 className="text-4xl md:text-5xl font-serif font-black leading-[1.05] tracking-tight mb-4">
                What we <span className="italic text-primary">stand for</span>.
              </h2>
              <p className="text-muted-foreground text-base leading-relaxed">
                Most tech coverage today is recycled press releases with adjectives. We're trying to be the opposite of that.
              </p>
            </div>
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
              {PRINCIPLES.map((p) => (
                <div key={p.n} className="flex gap-4">
                  <span className="font-serif text-3xl font-black text-primary leading-none w-12 shrink-0">{p.n}</span>
                  <div>
                    <h3 className="font-bold text-lg mb-1">{p.t}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{p.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ LATEST + SIDEBAR ============ */}
      <div className="container mx-auto px-4 md:px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-8">
            <div className="flex items-center justify-between mb-8 border-b border-border pb-4">
              <h2 className="text-2xl md:text-3xl font-serif font-black tracking-tight flex items-center gap-3">
                <span className="w-2 h-7 bg-primary block" />
                Latest News
              </h2>
              <Link href="/blog" className="text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-primary flex items-center gap-1">
                View All <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {loadingLatest ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-3">
                    <Skeleton className="w-full aspect-video rounded-none" />
                    <Skeleton className="w-3/4 h-6 rounded-none" />
                    <Skeleton className="w-full h-4 rounded-none" />
                    <Skeleton className="w-1/2 h-4 rounded-none" />
                  </div>
                ))
              ) : latestPosts?.map((post, idx) => (
                <Reveal key={post.id} delay={idx * 80}>
                  <Link href={`/blog/${post.slug}`} className="group flex flex-col gap-4">
                    <div className="overflow-hidden border border-border aspect-video bg-muted relative">
                      <img loading="lazy" decoding="async"
                        {...responsiveCoverProps(post.coverImage || `/images/post-${(idx % 2) + 1}.png`, COVER_SIZES.grid2)}
                        alt={post.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-2 text-xs text-muted-foreground">
                        <CategoryChip category={post.category} variant="dot" className="text-xs" />
                        <span>&bull;</span>
                        <span className="font-bold uppercase tracking-wider">{format(new Date(post.publishedAt), 'MMM dd')}</span>
                      </div>
                      <h3 className="text-xl font-serif font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2 mb-2">
                        {post.title}
                      </h3>
                      <p className="text-muted-foreground text-sm line-clamp-2">
                        {post.excerpt}
                      </p>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>

          <aside className="lg:col-span-4 flex flex-col gap-10">
            {(loadingDiscussed || (discussedPosts && discussedPosts.length > 0)) && (
              <div className="bg-card border border-border p-6">
                <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2 mb-6 border-b border-border pb-4">
                  <MessageCircle className="h-5 w-5 text-primary" />
                  Most Discussed
                </h2>
                <div className="flex flex-col gap-6">
                  {loadingDiscussed ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex gap-4">
                        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="w-full h-4 rounded-none" />
                          <Skeleton className="w-2/3 h-4 rounded-none" />
                        </div>
                      </div>
                    ))
                  ) : discussedPosts?.slice(0, 4).map((post, idx) => (
                    <Link key={post.id} href={`/blog/${post.slug}#comments`} className="group flex gap-4 items-start">
                      <span className="font-serif text-4xl font-black text-muted/30 group-hover:text-primary transition-colors w-10 text-center shrink-0 leading-none">
                        {idx + 1}
                      </span>
                      <div>
                        <h3 className="font-bold leading-snug group-hover:text-primary transition-colors line-clamp-2 mb-1 text-sm">
                          {post.title}
                        </h3>
                        <div className="flex items-center text-xs text-muted-foreground gap-2 font-medium">
                          <CategoryChip category={post.category} variant="dot" className="text-[11px]" />
                          <span>&bull;</span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="h-3 w-3" /> {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

          </aside>
        </div>
      </div>

      {/* ============ NEWSLETTER CTA ============ */}
      <HomeNewsletter />

      {/* ============ EDITOR'S NOTE ============ */}
      <section className="border-t border-border bg-gradient-to-br from-background via-card/40 to-background">
        <div className="container mx-auto px-4 md:px-6 py-16 md:py-20">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start gap-6 md:gap-10 flex-col md:flex-row">
              <div className="shrink-0">
                <div className="w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden border-2 border-primary">
                  <img
                    loading="lazy"
                    decoding="async"
                    src={editor?.avatarUrl || `${import.meta.env.BASE_URL}author-matthew.webp`}
                    alt={`${editor?.displayName || "Editor"}, Editor`}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-xs uppercase tracking-[0.25em] font-bold text-primary mb-2">A note from the editor</p>
                <h2 className="font-serif text-3xl md:text-4xl font-black leading-[1.1] mb-4">
                  I started Mapletechie because I was tired of reading the same review, twice.
                </h2>
                <p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-3">
                  Every product launch produces a hundred articles that all sound exactly alike — because most of them were written from the same press kit. That's not journalism. That's stenography.
                </p>
                <p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-6">
                  We're building something different here: opinionated, plain-spoken coverage of the technology shaping our lives, written by people who actually use the things they write about. If that sounds like a publication you'd want to read, you're in the right place.
                </p>
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="font-serif italic text-lg">— {editor?.displayName || "Matthew Mbaka"}, Founding Editor</span>
                  <Button asChild variant="outline" size="sm" className="rounded-none font-bold uppercase tracking-wider">
                    <Link href="/about">More about us</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * A magazine-style section for a single category: a large lead story plus a
 * short list of recent headlines, accented with the category's color. Renders
 * nothing if the category has no published posts.
 */
function CategorySection({
  category,
}: {
  category: { id: number; name: string; slug: string; color?: string | null; postCount?: number };
}) {
  const { data: posts, isLoading } = useListPosts({ category: category.slug, limit: 4 });
  if (!isLoading && (!posts || posts.length === 0)) return null;
  const color = category.color || DEFAULT_CATEGORY_COLOR;
  const lead = posts?.[0];
  const rest = posts?.slice(1, 4) ?? [];

  return (
    <section className="border-t border-border bg-background">
      <div className="container mx-auto px-4 md:px-6 py-14 md:py-16">
        <div className="flex items-end justify-between mb-8 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <span className="block w-1.5 h-8 rounded-none shrink-0" style={{ backgroundColor: color }} aria-hidden />
            <h2 className="text-2xl md:text-3xl font-serif font-black tracking-tight">{category.name}</h2>
          </div>
          <Link
            href={`/category/${category.slug}`}
            className="text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Skeleton className="aspect-video rounded-none" />
            <div className="flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-none" />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
            {lead && (
              <Link href={`/blog/${lead.slug}`} className="group flex flex-col gap-4">
                <div className="overflow-hidden border border-border aspect-video bg-muted relative">
                  <img
                    loading="lazy"
                    decoding="async"
                    {...responsiveCoverProps(lead.coverImage || "/images/hero-post.webp", COVER_SIZES.grid2)}
                    alt={lead.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-3 left-3">
                    <CategoryChip category={lead.category} variant="solid" />
                  </div>
                </div>
                <h3 className="text-2xl font-serif font-black leading-tight group-hover:text-primary transition-colors line-clamp-2">
                  {lead.title}
                </h3>
                <p className="text-muted-foreground text-sm line-clamp-2">{lead.excerpt}</p>
                <div className="flex items-center text-xs text-muted-foreground font-medium uppercase tracking-wide gap-3">
                  <span>{lead.author}</span>
                  <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {lead.readTime} min</span>
                </div>
              </Link>
            )}

            <div className="flex flex-col divide-y divide-border">
              {rest.length === 0 ? (
                <p className="text-muted-foreground text-sm">More {category.name} stories coming soon.</p>
              ) : (
                rest.map((post) => (
                  <Link key={post.id} href={`/blog/${post.slug}`} className="group flex gap-4 py-4 first:pt-0 items-start">
                    <div className="w-24 h-20 shrink-0 overflow-hidden border border-border bg-muted">
                      <img
                        loading="lazy"
                        decoding="async"
                        {...responsiveCoverProps(post.coverImage || "/images/hero-post.webp", COVER_SIZES.sidebar)}
                        alt={post.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-serif font-bold leading-snug group-hover:text-primary transition-colors line-clamp-2 mb-1">
                        {post.title}
                      </h4>
                      <div className="flex items-center text-xs text-muted-foreground gap-2 font-medium uppercase tracking-wide">
                        <span>{post.author}</span>
                        <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {post.readTime} min</span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Prominent on-brand newsletter signup, reusing the same subscribe mutation as
 * the footer form.
 */
function HomeNewsletter() {
  const [email, setEmail] = useState("");
  const { toast } = useToast();
  const submit = useSubscribeNewsletter();

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    submit.mutate(
      { data: { email: trimmed, source: "home" } },
      {
        onSuccess: (res) => {
          toast({
            title: "Almost there",
            description: res?.message || "Check your inbox to confirm your subscription.",
          });
          setEmail("");
        },
        onError: () => {
          toast({
            title: "Something went wrong",
            description: "Please try again in a moment.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <section className="border-t border-border bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 md:px-6 py-16 md:py-20">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center justify-center gap-2 mb-4">
            <Mail className="h-5 w-5" />
            <span className="text-xs uppercase tracking-[0.3em] font-bold">The Mapletechie Brief</span>
          </div>
          <h2 className="font-serif font-black tracking-tight text-3xl md:text-5xl leading-[1.05] mb-4">
            The week in tech, told straight.
          </h2>
          <p className="text-primary-foreground/80 text-base md:text-lg leading-relaxed mb-8 max-w-2xl mx-auto">
            One email. The stories that actually matter, the reviews worth reading, and the context the headlines skip. No spam — just signal.
          </p>
          <form className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto" onSubmit={handleSubscribe}>
            <Input
              type="email"
              placeholder="you@email.com"
              className="rounded-none bg-background text-foreground h-12 flex-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="input-home-newsletter-email"
            />
            <Button
              type="submit"
              variant="secondary"
              className="rounded-none font-bold uppercase tracking-wider h-12 px-8 bg-background text-foreground hover:bg-background/90"
              disabled={submit.isPending}
              data-testid="button-home-newsletter-join"
            >
              {submit.isPending ? "Joining…" : "Subscribe"}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
