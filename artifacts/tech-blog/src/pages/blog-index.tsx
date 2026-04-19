import { useListPosts, useListCategories } from "@workspace/api-client-react";
import { SEO } from "@/components/SEO";
import { Link, useSearch } from "wouter";
import { format } from "date-fns";
import { Search, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { motion } from "framer-motion";

export default function BlogIndex() {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const categoryParam = searchParams.get('category') || undefined;
  
  const [searchQuery, setSearchQuery] = useState("");

  const { data: posts, isLoading: loadingPosts } = useListPosts({ 
    category: categoryParam,
    limit: 20
  });
  
  const { data: categories } = useListCategories();

  const filteredPosts = posts?.filter(post => 
    post.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    post.excerpt.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 md:px-6 py-10">
      <SEO
        title="Blog"
        description="Latest tech news, gadget reviews, AI breakthroughs, and cybersecurity coverage from the Mapletechie team."
        url="/blog"
      />
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 border-b border-border pb-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">Latest News</h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            The stories that matter in technology, science, and digital culture.
          </p>
        </div>
        <div className="w-full md:w-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search articles..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 w-full md:w-[300px] rounded-none bg-background focus-visible:ring-primary"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-10">
        <Button 
          asChild 
          variant={!categoryParam ? "default" : "outline"} 
          className="rounded-none uppercase font-bold text-xs tracking-wider"
        >
          <Link href="/blog">All</Link>
        </Button>
        {categories?.map(cat => (
          <Button 
            key={cat.id} 
            asChild 
            variant={categoryParam === cat.slug ? "default" : "outline"} 
            className="rounded-none uppercase font-bold text-xs tracking-wider"
          >
            <Link href={`/blog?category=${cat.slug}`}>{cat.name}</Link>
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loadingPosts ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="w-full aspect-[4/3] rounded-none" />
              <Skeleton className="w-1/4 h-4 rounded-none mt-2" />
              <Skeleton className="w-full h-6 rounded-none" />
              <Skeleton className="w-3/4 h-6 rounded-none" />
            </div>
          ))
        ) : filteredPosts?.length === 0 ? (
          <div className="col-span-full py-20 text-center border border-dashed border-border">
            <h3 className="text-xl font-bold text-muted-foreground">No posts found.</h3>
          </div>
        ) : (
          filteredPosts?.map((post, idx) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.05 }}
              key={post.id}
            >
              <Link href={`/blog/${post.slug}`} className="group flex flex-col gap-4 h-full">
                <div className="overflow-hidden border border-border aspect-[4/3] bg-muted relative">
                  <img 
                    src={post.coverImage || `/images/post-${(idx % 2) + 1}.png`} 
                    alt={post.title} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-3 left-3 bg-background/90 backdrop-blur text-xs font-bold uppercase tracking-wider px-2 py-1">
                    {post.category}
                  </div>
                </div>
                <div className="flex-1 flex flex-col">
                  <div className="flex items-center gap-3 mb-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <span>{format(new Date(post.publishedAt), 'MMMM dd, yyyy')}</span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {post.readTime}m</span>
                  </div>
                  <h3 className="text-xl font-bold leading-tight group-hover:text-primary transition-colors line-clamp-3 mb-3">
                    {post.title}
                  </h3>
                  <p className="text-muted-foreground text-sm line-clamp-2 mt-auto">
                    {post.excerpt}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))
        )}
      </div>

      {!loadingPosts && filteredPosts && filteredPosts.length > 0 && (
        <div className="mt-16 flex justify-center border-t border-border pt-8">
          <Button variant="outline" className="rounded-none font-bold uppercase tracking-widest px-8">
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
