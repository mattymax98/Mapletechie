import { useListPosts, useListCategories } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { Clock, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { SEO } from "@/components/SEO";

export default function CategoryIndex() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";

  const { data: posts, isLoading } = useListPosts({ category: slug, limit: 20 });
  const { data: categories } = useListCategories();

  const category = categories?.find(c => c.slug === slug);

  return (
    <div className="w-full">
      <SEO
        title={category?.name || slug.replace(/-/g, " ")}
        description={
          category?.description ||
          `Latest ${category?.name || slug.replace(/-/g, " ")} stories on Mapletechie.`
        }
        image={`/api/og/category/${encodeURIComponent(slug)}.png`}
        url={`/category/${slug}`}
      />
      {/* Category Header */}
      <div className="bg-card border-b border-border py-16 md:py-24 text-center">
        <div className="container mx-auto px-4">
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-4">
            {category?.name || slug.replace('-', ' ')}
          </h1>
          {category?.description && (
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-serif">
              {category.description}
            </p>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <Skeleton className="w-full aspect-[4/3] rounded-none" />
                <Skeleton className="w-full h-6 rounded-none mt-2" />
                <Skeleton className="w-3/4 h-6 rounded-none" />
                <Skeleton className="w-1/2 h-4 rounded-none" />
              </div>
            ))
          ) : posts?.length === 0 ? (
            <div className="col-span-full py-20 text-center border border-dashed border-border">
              <h3 className="text-xl font-bold text-muted-foreground">No posts found in this category.</h3>
              <Button asChild variant="outline" className="mt-4 rounded-none font-bold uppercase">
                <Link href="/blog">View All Posts</Link>
              </Button>
            </div>
          ) : (
            posts?.map((post, idx) => (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                key={post.id}
              >
                <Link href={`/blog/${post.slug}`} className="group flex flex-col gap-4 h-full border border-transparent hover:border-border p-2 -m-2 transition-colors">
                  <div className="overflow-hidden aspect-[4/3] bg-muted relative border border-border">
                    <img loading="lazy" decoding="async" 
                      src={post.coverImage || `/images/post-${(idx % 2) + 1}.png`} 
                      alt={post.title} 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex-1 flex flex-col pt-2">
                    <div className="flex items-center gap-3 mb-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      <span className="text-primary">{post.author}</span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {post.readTime}m</span>
                    </div>
                    <h3 className="text-2xl font-bold leading-tight group-hover:text-primary transition-colors line-clamp-3 mb-3 tracking-tight">
                      {post.title}
                    </h3>
                    <p className="text-muted-foreground text-sm line-clamp-2 mt-auto font-serif">
                      {post.excerpt}
                    </p>
                  </div>
                </Link>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
