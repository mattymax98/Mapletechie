import { useGetFeaturedPosts, useGetLatestPosts, useGetTrendingPosts, useGetSiteSummary, useGetFeaturedProducts } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ArrowRight, Clock, Eye, TrendingUp, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

export default function Home() {
  const { data: featuredPosts, isLoading: loadingFeatured } = useGetFeaturedPosts();
  const { data: latestPosts, isLoading: loadingLatest } = useGetLatestPosts({ limit: 6 });
  const { data: trendingPosts, isLoading: loadingTrending } = useGetTrendingPosts();
  const { data: stats } = useGetSiteSummary();
  const { data: products } = useGetFeaturedProducts();

  const heroPost = featuredPosts?.[0];
  const subHeroPosts = featuredPosts?.slice(1, 3) || [];

  return (
    <div className="w-full">
      {/* Site Stats Banner */}
      {stats && (
        <div className="bg-primary text-primary-foreground py-2 px-4 text-xs font-bold uppercase tracking-widest overflow-hidden relative">
          <div className="container mx-auto flex justify-between items-center whitespace-nowrap overflow-x-auto gap-8 no-scrollbar">
            <span className="flex items-center gap-2"><BarChart3 className="h-3 w-3" /> Network Stats</span>
            <span>Total Posts: {stats.totalPosts.toLocaleString()}</span>
            <span>Total Views: {stats.totalViews.toLocaleString()}</span>
            <span>Categories: {stats.totalCategories.toLocaleString()}</span>
            <span>Products Reviewed: {stats.totalProducts.toLocaleString()}</span>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 md:px-6 py-8">
        {/* Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-16">
          {loadingFeatured ? (
            <Skeleton className="col-span-1 lg:col-span-2 aspect-[16/9] lg:aspect-auto h-full min-h-[400px] rounded-none" />
          ) : heroPost ? (
            <Link href={`/blog/${heroPost.slug}`} className="group relative col-span-1 lg:col-span-2 overflow-hidden bg-muted min-h-[400px] lg:min-h-[500px] flex flex-col justify-end p-6 md:p-10 border border-border">
              <div className="absolute inset-0 z-0">
                <img 
                  src={heroPost.coverImage || "/images/hero-post.png"} 
                  alt={heroPost.title} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent mix-blend-multiply" />
              </div>
              <div className="relative z-10 max-w-3xl">
                <Badge className="bg-primary text-primary-foreground hover:bg-primary rounded-none uppercase font-bold tracking-wider mb-4 border-none">
                  {heroPost.category}
                </Badge>
                <h1 className="text-3xl md:text-5xl font-black leading-tight text-white mb-4 group-hover:text-primary transition-colors line-clamp-3">
                  {heroPost.title}
                </h1>
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
                  <img 
                    src={post.coverImage || `/images/post-${idx + 1}.png`} 
                    alt={post.title} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent mix-blend-multiply" />
                </div>
                <div className="relative z-10">
                  <Badge variant="outline" className="text-white border-white/30 rounded-none uppercase font-bold text-[10px] tracking-wider mb-2 bg-black/20 backdrop-blur-sm">
                    {post.category}
                  </Badge>
                  <h2 className="text-xl font-bold leading-tight text-white group-hover:text-primary transition-colors line-clamp-2">
                    {post.title}
                  </h2>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Main Content */}
          <div className="lg:col-span-8">
            <div className="flex items-center justify-between mb-8 border-b border-border pb-4">
              <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
                <span className="w-3 h-3 bg-primary block" />
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
                  transition={{ duration: 0.4, delay: idx * 0.1 }}
                  key={post.id}
                >
                  <Link href={`/blog/${post.slug}`} className="group flex flex-col gap-4">
                    <div className="overflow-hidden border border-border aspect-video bg-muted relative">
                      <img 
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
                      <h3 className="text-xl font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2 mb-2">
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

          {/* Sidebar */}
          <aside className="lg:col-span-4 flex flex-col gap-10">
            {/* Trending */}
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
                    <span className="text-3xl font-black text-muted/30 group-hover:text-primary transition-colors w-8 text-center shrink-0 leading-none">
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

            {/* Featured Gear */}
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
                         <img src={product.imageUrl || `/images/product-${idx + 1}.png`} alt={product.name} className="max-w-full max-h-full object-contain mix-blend-multiply dark:mix-blend-normal" />
                      </div>
                      <div className="flex-1">
                        {product.badge && <Badge variant="outline" className="text-[10px] rounded-none uppercase tracking-wider mb-1 text-primary border-primary">{product.badge}</Badge>}
                        <h4 className="font-bold text-sm line-clamp-1 group-hover:text-primary transition-colors">{product.name}</h4>
                        <div className="text-sm font-bold mt-1">${product.price.toFixed(2)}</div>
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
    </div>
  );
}
