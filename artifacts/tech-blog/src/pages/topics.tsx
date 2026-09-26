import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { Clock, ArrowRight } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { SEO } from "@/components/SEO";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildTrailBreadcrumbJsonLd, DEFAULT_SITE_URL } from "@/lib/articleSchema";

interface TopicCluster {
  id?: number;
  slug: string;
  title?: string;
  name?: string;
  description?: string | null;
  introduction?: string | null;
}

interface TopicPost {
  id: number;
  slug: string;
  title: string;
  excerpt?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  readTime?: number | null;
  coverImage?: string | null;
  category?: string | null;
  clusterRole?: "pillar" | "supporting" | string | null;
}

interface TopicsResponse {
  topics?: TopicCluster[];
  clusters?: TopicCluster[];
}

interface TopicResponse {
  cluster: TopicCluster;
  posts: TopicPost[];
}

function topicTitle(cluster: TopicCluster): string {
  return cluster.title || cluster.name || cluster.slug.replace(/-/g, " ");
}

function topicDescription(cluster: TopicCluster): string | null {
  return cluster.description || cluster.introduction || null;
}

function useJson<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(response.status === 404 ? "Topic not found." : "Topics could not be loaded.");
        }
        return response.json() as Promise<T>;
      })
      .then((json) => setData(json))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Topics could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url]);

  return { data, loading, error };
}

function TopicsIndex() {
  const { data, loading, error } = useJson<TopicsResponse | TopicCluster[]>("/api/topics");
  const topics = Array.isArray(data) ? data : data?.topics ?? data?.clusters ?? [];

  return (
    <main className="container mx-auto max-w-5xl px-4 md:px-6 py-12 md:py-16">
      <SEO
        title="Explore Topics"
        description="Explore Mapletechie topic guides and follow connected articles across technology, gadgets, AI, software, and more."
        url="/topics"
        noindex={!loading && !error && topics.length === 0}
      />
      {topics.length > 0 && (
        <Helmet>
          <script type="application/ld+json">
            {JSON.stringify(buildTrailBreadcrumbJsonLd([
              { name: "Home", item: DEFAULT_SITE_URL },
              { name: "Topics", item: `${DEFAULT_SITE_URL}/topics` },
            ]))}
          </script>
        </Helmet>
      )}
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Topics" }]} />
      <header className="mb-10 border-b border-border pb-8">
        <p className="text-sm font-bold uppercase tracking-widest text-primary mb-3">Explore Mapletechie</p>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4">Topics</h1>
        <p className="max-w-3xl text-lg md:text-xl font-serif leading-relaxed text-muted-foreground">
          Follow a subject across our connected guides, analysis, and reporting.
        </p>
      </header>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : error ? (
        <p role="alert" className="border border-destructive/40 p-5 text-destructive">{error}</p>
      ) : topics.length === 0 ? (
        <p className="border border-dashed border-border p-8 text-center text-muted-foreground">
          No topic guides are available yet.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {topics.map((topic) => (
            <li key={topic.slug}>
              <Link href={`/topics/${encodeURIComponent(topic.slug)}`} className="group block h-full border border-border p-6 transition-colors hover:border-primary">
                <h2 className="mb-2 text-2xl font-bold group-hover:text-primary">{topicTitle(topic)}</h2>
                {topicDescription(topic) && <p className="mb-5 text-muted-foreground font-serif leading-relaxed">{topicDescription(topic)}</p>}
                <span className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-primary">
                  Explore topic <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function TopicDetail({ slug }: { slug: string }) {
  const { data, loading, error } = useJson<TopicResponse>(`/api/topics/${encodeURIComponent(slug)}`);

  if (loading) {
    return (
      <main className="container mx-auto max-w-4xl px-4 py-16">
        <Skeleton className="mb-4 h-5 w-32" />
        <Skeleton className="mb-6 h-12 w-2/3" />
        <Skeleton className="h-28 w-full" />
      </main>
    );
  }
  if (error || !data?.cluster) {
    return (
      <main className="container mx-auto max-w-4xl px-4 py-20 text-center">
        <SEO title="Topic Not Found" description="This topic guide could not be found." noindex />
        <h1 className="mb-4 text-4xl font-black">Topic Not Found</h1>
        <p className="mb-8 text-muted-foreground">{error || "This topic guide could not be found."}</p>
        <Button asChild className="rounded-none uppercase font-bold tracking-wider"><Link href="/topics">Browse topics</Link></Button>
      </main>
    );
  }

  const { cluster, posts = [] } = data;
  const title = topicTitle(cluster);
  const pillar = posts.find((post) => post.clusterRole === "pillar");
  const supporting = posts
    .filter((post) => post.clusterRole !== "pillar")
    .sort((a, b) => {
      const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 20);
  return (
    <main className="w-full">
      <SEO
        title={`${title} — Topic Guide`}
        description={topicDescription(cluster) || `Explore Mapletechie articles about ${title}.`}
        url={`/topics/${cluster.slug}`}
      />
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(buildTrailBreadcrumbJsonLd([
            { name: "Home", item: DEFAULT_SITE_URL },
            { name: "Topics", item: `${DEFAULT_SITE_URL}/topics` },
            { name: title, item: `${DEFAULT_SITE_URL}/topics/${cluster.slug}` },
          ]))}
        </script>
      </Helmet>
      <header className="border-b border-border bg-card py-14 md:py-20">
        <div className="container mx-auto max-w-4xl px-4 md:px-6">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Topics", href: "/topics" }, { label: title }]} />
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-primary">Topic guide · {posts.length} {posts.length === 1 ? "article" : "articles"}</p>
          <h1 className="mb-5 text-4xl font-black tracking-tight md:text-6xl">{title}</h1>
          {topicDescription(cluster) && <p className="max-w-3xl font-serif text-lg leading-relaxed text-muted-foreground md:text-xl">{topicDescription(cluster)}</p>}
        </div>
      </header>

      <section className="container mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-16" aria-labelledby="topic-articles-heading">
        <h2 id="topic-articles-heading" className="mb-8 text-2xl font-black uppercase tracking-tight">Articles in this topic</h2>
        {posts.length === 0 ? (
          <p className="border border-dashed border-border p-8 text-center text-muted-foreground">No published articles are available in this topic yet.</p>
        ) : (
          <>
            {pillar && (
              <article className="mb-10 border-2 border-primary bg-primary/5 p-6 md:p-8">
                <p className="mb-3 text-xs font-black uppercase tracking-widest text-primary">Pillar article</p>
                <Link href={`/blog/${pillar.slug}`} className="group">
                  <h3 className="mb-3 text-2xl font-black leading-tight group-hover:text-primary md:text-4xl">{pillar.title}</h3>
                  {pillar.excerpt && <p className="mb-5 max-w-3xl font-serif text-lg leading-relaxed text-muted-foreground">{pillar.excerpt}</p>}
                  <span className="text-sm font-bold uppercase tracking-wider text-primary">Start with the guide →</span>
                </Link>
              </article>
            )}
            <h3 className="mb-5 text-xl font-black uppercase tracking-tight">Recent supporting coverage</h3>
            {supporting.length === 0 ? (
              <p className="text-muted-foreground">No additional supporting articles are available yet.</p>
            ) : (
              <ol className="space-y-5">
                {supporting.map((post) => (
                  <li key={post.id}>
                    <Link href={`/blog/${post.slug}`} className="group block border border-border p-5 transition-colors hover:border-primary md:p-6">
                      {post.category && <p className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">{post.category}</p>}
                      <h4 className="mb-2 text-xl font-bold leading-tight group-hover:text-primary md:text-2xl">{post.title}</h4>
                      {post.excerpt && <p className="mb-4 line-clamp-2 font-serif text-muted-foreground">{post.excerpt}</p>}
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {post.author && <span>{post.author}</span>}
                        {post.publishedAt && <time dateTime={post.publishedAt}>{format(new Date(post.publishedAt), "MMM d, yyyy")}</time>}
                        {post.readTime != null && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{post.readTime} min read</span>}
                      </p>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default function TopicsPage() {
  const params = useParams<{ slug?: string }>();
  return params.slug ? <TopicDetail slug={params.slug} /> : <TopicsIndex />;
}