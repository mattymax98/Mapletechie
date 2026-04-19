import { useListProducts, useListCategories } from "@workspace/api-client-react";
import { Link, useSearch } from "wouter";
import { Star, ExternalLink, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

export default function Shop() {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const categoryParam = searchParams.get('category') || undefined;

  const { data: products, isLoading } = useListProducts({ category: categoryParam });
  const { data: categories } = useListCategories();

  return (
    <div className="container mx-auto px-4 md:px-6 py-10">
      <div className="mb-12 border-b border-border pb-10 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-6">Tech Gear & Deals</h1>
        <p className="text-xl text-muted-foreground">
          Curated tech products, gadgets, and software we actually use and recommend. Buying through our links supports the publication.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Filters Sidebar */}
        <aside className="w-full md:w-64 shrink-0">
          <div className="sticky top-24">
            <h3 className="font-bold uppercase tracking-widest text-sm flex items-center gap-2 mb-4">
              <Filter className="h-4 w-4" /> Filters
            </h3>
            <div className="flex flex-col gap-2">
              <Button 
                asChild 
                variant={!categoryParam ? "default" : "ghost"} 
                className={`justify-start rounded-none uppercase font-bold tracking-wider text-xs ${!categoryParam ? '' : 'text-muted-foreground'}`}
              >
                <Link href="/shop">All Products</Link>
              </Button>
              {categories?.map(cat => (
                <Button 
                  key={cat.id} 
                  asChild 
                  variant={categoryParam === cat.slug ? "default" : "ghost"} 
                  className={`justify-start rounded-none uppercase font-bold tracking-wider text-xs ${categoryParam === cat.slug ? '' : 'text-muted-foreground'}`}
                >
                  <Link href={`/shop?category=${cat.slug}`}>{cat.name}</Link>
                </Button>
              ))}
            </div>
          </div>
        </aside>

        {/* Product Grid */}
        <div className="flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="border border-border bg-card p-4 flex flex-col gap-4">
                  <Skeleton className="w-full aspect-square rounded-none" />
                  <Skeleton className="w-3/4 h-6 rounded-none" />
                  <Skeleton className="w-1/2 h-4 rounded-none" />
                  <Skeleton className="w-full h-10 mt-auto rounded-none" />
                </div>
              ))
            ) : products?.length === 0 ? (
              <div className="col-span-full py-20 text-center border border-dashed border-border">
                <h3 className="text-xl font-bold text-muted-foreground">No products found in this category.</h3>
              </div>
            ) : (
              products?.map((product, idx) => (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                  key={product.id}
                  className="group flex flex-col bg-card border border-border hover:border-primary transition-colors relative"
                >
                  {product.badge && (
                    <div className="absolute top-4 left-4 z-10">
                      <Badge className="bg-primary text-primary-foreground rounded-none uppercase font-black tracking-wider text-[10px] px-2 py-1 shadow-md border-none">
                        {product.badge}
                      </Badge>
                    </div>
                  )}
                  
                  <div className="aspect-square bg-muted/50 p-6 flex items-center justify-center border-b border-border overflow-hidden">
                    <img 
                      src={product.imageUrl || `/images/product-${(idx % 3) + 1}.png`} 
                      alt={product.name} 
                      className="max-w-full max-h-full object-contain mix-blend-multiply dark:mix-blend-normal group-hover:scale-110 transition-transform duration-500"
                    />
                  </div>
                  
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-center gap-1 mb-3 text-yellow-500">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-4 w-4 ${i < Math.floor(product.rating) ? 'fill-current' : 'text-muted-foreground opacity-30'}`} />
                      ))}
                      <span className="text-xs text-muted-foreground font-bold tracking-wider ml-2">
                        ({product.reviewCount})
                      </span>
                    </div>
                    
                    <h3 className="text-lg font-bold leading-tight mb-2 group-hover:text-primary transition-colors">
                      {product.name}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                      {product.description}
                    </p>
                    
                    <div className="mt-auto flex items-end justify-between pt-4">
                      <div>
                        {product.originalPrice && (
                          <div className="text-xs text-muted-foreground line-through font-bold">
                            ${product.originalPrice.toFixed(2)}
                          </div>
                        )}
                        <div className="text-2xl font-black text-foreground">
                          ${product.price.toFixed(2)}
                        </div>
                      </div>
                      
                      <Button asChild className="rounded-none font-bold uppercase tracking-wider group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <a href={product.affiliateUrl} target="_blank" rel="noopener noreferrer">
                          Get It <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
