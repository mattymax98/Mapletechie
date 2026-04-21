import { useGetFeaturedPosts, useGetLatestPosts, useGetTrendingPosts, useGetFeaturedProducts, useGetFeaturedEditor } from "@workspace/api-client-react";
import { SEO } from "@/components/SEO";
import { Link } from "wouter";
import { format } from "date-fns";
import { ArrowRight, Clock, Eye, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

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
  const { data: products } = useGetFeaturedProducts();
  const { data: editor } = useGetFeaturedEditor();

  const heroPost = featuredPosts?.[0];
  const subHeroPosts = featuredPosts?.slice(1, 3) || [];

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
                <img loading="lazy" decoding="async"
                  src={heroPost.coverImage || "/images/hero-post.png"}
                  alt={heroPost.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
              </div>
              <div className="relative z-10 max-w-3xl">
                <Badge className="bg-primary text-primary-foreground hover:bg-primary rounded-none uppercase font-bold tracking-wider mb-4 border-none">
                  {heroPost.category}
                </Badge>
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
                    src={post.coverImage || `/images/post-${idx + 1}.png`}
                    alt={post.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
                </div>
                <div className="relative z-10">
                  <Badge variant="outline" className="text-white border-white/30 rounded-none uppercase font-bold text-[10px] tracking-wider mb-2 bg-black/20 backdrop-blur-sm">
                    {post.category}
                  </Badge>
                  <h3 className="text-xl font-serif font-bold leading-tight text-white group-hover:text-primary transition-colors line-clamp-2">
                    {post.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* ============ TOP ARTICLES (rotated label) ============ */}
      {(() => {
        const top3 = trendingPosts?.slice(0, 3) || [];
        if (!loadingTrending && top3.length === 0) return null;
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
                          What's Hot
                        </span>
                      </div>
                      <h2 className="font-serif font-black tracking-tight text-6xl lg:text-7xl leading-[0.9]">
                        Top <span className="italic text-primary">Articles</span>
                      </h2>
                    </div>
                  </div>
                  {/* Mobile fallback header (no rotation) */}
                  <div className="md:hidden">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="block w-8 h-px bg-primary" />
                      <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-primary">
                        What's Hot
                      </span>
                    </div>
                    <h2 className="font-serif font-black tracking-tight text-4xl leading-none">
                      Top <span className="italic text-primary">Articles</span>
                    </h2>
                  </div>
                </div>

                {/* Three articles in a staggered, editorial row */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                  {loadingTrending
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="aspect-[4/5] rounded-none" />
                      ))
                    : top3.map((post, idx) => (
                        <Link
                          key={post.id}
                          href={`/blog/${post.slug}`}
                          className={`group block ${
                            idx === 1 ? "md:mt-10" : idx === 2 ? "md:mt-20" : ""
                          }`}
                          data-testid={`top-article-${idx}`}
                        >
                          <div className="relative overflow-hidden bg-muted aspect-[4/5] border border-border">
                            <img
                              loading="lazy"
                              decoding="async"
                              src={post.coverImage || `/images/post-${(idx % 3) + 1}.png`}
                              alt={post.title}
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/20 to-transparent" />
                            <div className="absolute top-4 left-4">
                              <span className="font-serif font-black text-5xl lg:text-6xl text-primary leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                                {String(idx + 1).padStart(2, "0")}
                              </span>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 p-5">
                              <Badge
                                variant="outline"
                                className="text-white border-white/40 rounded-none uppercase font-bold text-[10px] tracking-wider mb-2 bg-black/30 backdrop-blur-sm"
                              >
                                {post.category}
                              </Badge>
                              <h3 className="text-lg lg:text-xl font-serif font-bold leading-tight text-white group-hover:text-primary transition-colors line-clamp-3">
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
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: idx * 0.08 }}
                  key={post.id}
                >
                  <Link href={`/blog/${post.slug}`} className="group flex flex-col gap-4">
                    <div className="overflow-hidden border border-border aspect-video bg-muted relative">
                      <img loading="lazy" decoding="async"
                        src={post.coverImage || `/images/post-${(idx % 2) + 1}.png`}
                        alt={post.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <span className="text-primary">{post.category}</span>
                        <span>&bull;</span>
                        <span>{format(new Date(post.publishedAt), 'MMM dd')}</span>
                      </div>
                      <h3 className="text-xl font-serif font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2 mb-2">
                        {post.title}
                      </h3>
                      <p className="text-muted-foreground text-sm line-clamp-2">
                        {post.excerpt}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>

          <aside className="lg:col-span-4 flex flex-col gap-10">
            <div className="bg-card border border-border p-6">
              <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2 mb-6 border-b border-border pb-4">
                <TrendingUp className="h-5 w-5 text-primary" />
                Trending Now
              </h3>
              <div className="flex flex-col gap-6">
                {loadingTrending ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-4">
                      <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="w-full h-4 rounded-none" />
                        <Skeleton className="w-2/3 h-4 rounded-none" />
                      </div>
                    </div>
                  ))
                ) : trendingPosts?.slice(0, 4).map((post, idx) => (
                  <Link key={post.id} href={`/blog/${post.slug}`} className="group flex gap-4 items-start">
                    <span className="font-serif text-4xl font-black text-muted/30 group-hover:text-primary transition-colors w-10 text-center shrink-0 leading-none">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="font-bold leading-snug group-hover:text-primary transition-colors line-clamp-2 mb-1 text-sm">
                        {post.title}
                      </h4>
                      <div className="flex items-center text-xs text-muted-foreground gap-2 font-medium">
                        <span>{post.category}</span>
                        <span>&bull;</span>
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {post.viewCount.toLocaleString()}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {products && products.length > 0 && (
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2 mb-6 border-b border-border pb-4">
                  <span className="w-3 h-3 bg-accent block" />
                  Featured Gear
                </h3>
                <div className="flex flex-col gap-4">
                  {products.slice(0, 3).map((product, idx) => (
                    <Link key={product.id} href="/shop" className="group flex items-center gap-4 bg-card border border-border p-3 hover:border-primary transition-colors">
                      <div className="w-20 h-20 bg-muted shrink-0 flex items-center justify-center p-2">
                         <img loading="lazy" decoding="async" src={product.imageUrl || `/images/product-${idx + 1}.png`} alt={product.name} className="max-w-full max-h-full object-contain mix-blend-multiply dark:mix-blend-normal" />
                      </div>
                      <div className="flex-1">
                        {product.badge && <Badge variant="outline" className="text-[10px] rounded-none uppercase tracking-wider mb-1 text-primary border-primary">{product.badge}</Badge>}
                        <h4 className="font-bold text-sm line-clamp-1 group-hover:text-primary transition-colors">{product.name}</h4>
                        <div className="text-sm font-bold mt-1">${product.price.toFixed(2)} <span className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">{product.currency || 'CAD'}</span></div>
                      </div>
                    </Link>
                  ))}
                  <Button asChild variant="outline" className="w-full rounded-none font-bold uppercase tracking-wider mt-2">
                    <Link href="/shop">View All Gear</Link>
                  </Button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

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
                    src={editor?.avatarUrl || `${import.meta.env.BASE_URL}author-matthew.png`}
                    alt={`${editor?.displayName || "Editor"}, Editor`}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-xs uppercase tracking-[0.25em] font-bold text-primary mb-2">A note from the editor</p>
                <h2 className="font-serif text-3xl md:text-4xl font-black leading-[1.1] mb-4">
                  I started Mapletechies because I was tired of reading the same review, twice.
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
