import { useGetPostBySlug, useGetLatestPosts, useGetAuthor } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { Clock, Eye, Share2, Facebook, Twitter, Linkedin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { SEO } from "@/components/SEO";
import { AuthorBio } from "@/components/AuthorBio";

export default function BlogPost() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  
  const { data: post, isLoading } = useGetPostBySlug(slug, { query: { enabled: !!slug } });
  const { data: relatedPosts } = useGetLatestPosts({ limit: 3 });

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

  return (
    <article className="w-full">
      <SEO
        title={(post as any).seoTitle || post.title}
        description={(post as any).seoDescription || post.excerpt || undefined}
        image={(post as any).ogImage || post.coverImage || undefined}
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
      {/* Header */}
      <header className="container mx-auto px-4 md:px-6 py-10 md:py-16 max-w-4xl">
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

        <div className="flex items-center justify-between py-6 border-y border-border">
          <BylineAuthor
            authorId={post.authorId}
            fallbackName={post.author}
            fallbackAvatar={post.authorAvatar}
            publishedAt={post.publishedAt}
          />
          
          <div className="flex gap-2">
            <Button
              asChild
              variant="outline"
              size="icon"
              className="rounded-none border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
              title="Share on X / Twitter"
            >
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(`https://mapletechie.com/blog/${post.slug}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Twitter className="h-4 w-4" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="icon"
              className="rounded-none border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
              title="Share on Facebook"
            >
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`https://mapletechie.com/blog/${post.slug}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Facebook className="h-4 w-4" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="icon"
              className="rounded-none border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
              title="Share on LinkedIn"
            >
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://mapletechie.com/blog/${post.slug}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Linkedin className="h-4 w-4" />
              </a>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-none border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
              title="Copy link"
              onClick={async () => {
                const url = `https://mapletechie.com/blog/${post.slug}`;
                try {
                  if (navigator.share) {
                    await navigator.share({ title: post.title, url });
                  } else {
                    await navigator.clipboard.writeText(url);
                    alert("Link copied to clipboard");
                  }
                } catch {
                  // user cancelled
                }
              }}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Cover Image */}
      <div className="w-full max-w-6xl mx-auto px-4 md:px-6 mb-12">
        <div className="aspect-video w-full bg-muted border border-border">
          <img loading="lazy" decoding="async" 
            src={post.coverImage || "/images/hero-post.png"} 
            alt={post.title} 
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 md:px-6 max-w-3xl mb-20">
        <div 
          className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80 prose-img:border prose-img:border-border font-serif leading-relaxed"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
        
        {post.tags && post.tags.length > 0 && (
          <div className="mt-12 pt-8 border-t border-border flex flex-wrap gap-2">
            <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground mr-4 flex items-center">Tags:</span>
            {post.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="rounded-none uppercase tracking-wider font-bold hover:bg-primary hover:text-primary-foreground cursor-pointer">
                #{tag}
              </Badge>
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

      {/* Related Posts */}
      <div className="bg-card border-t border-border py-20">
        <div className="container mx-auto px-4 md:px-6 max-w-6xl">
          <h2 className="text-3xl font-black uppercase tracking-tight mb-10 flex items-center gap-3">
            <span className="w-4 h-4 bg-primary block" /> Read Next
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {relatedPosts?.filter(p => p.id !== post.id).slice(0, 3).map((rp, idx) => (
              <Link key={rp.id} href={`/blog/${rp.slug}`} className="group flex flex-col gap-4">
                <div className="overflow-hidden border border-border aspect-video bg-muted relative">
                  <img loading="lazy" decoding="async" 
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
    </article>
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
  return (
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 bg-muted rounded-full overflow-hidden border border-border">
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-bold text-lg bg-primary/10 text-primary">
            {name.charAt(0)}
          </div>
        )}
      </div>
      <div>
        <div className="font-bold tracking-wide">{name}</div>
        <div className="text-sm text-muted-foreground">{format(new Date(publishedAt), 'MMMM dd, yyyy')}</div>
      </div>
    </div>
  );
}
