import { useCallback, useEffect, useState } from "react";
import { useParams } from "wouter";
import { Helmet } from "react-helmet-async";
import { Skeleton } from "@/components/ui/skeleton";
import { PostContent } from "@/components/PostContent";

type PreviewPost = {
  id: number | string;
  title: string;
  content: string;
  excerpt?: string | null;
  author?: string | null;
  published_at?: string | null;
  cover_image?: string | null;
  cover_image_alt?: string | null;
};

type PreviewResponse = { post: PreviewPost };

/**
 * Private, signed-token article preview. This intentionally does not use the
 * public Layout, comments, recommendations, ads, or tracking code.
 */
export default function PreviewPost() {
  const { id = "" } = useParams<{ id: string }>();
  const [token] = useState(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    }
    return value;
  });
  const [post, setPost] = useState<PreviewPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    const controller = new AbortController();
    if (!id || !token) {
      setError("This preview link is missing its signed token.");
      return () => controller.abort();
    }
    fetch(`/api/automation/posts/${encodeURIComponent(id)}/preview`, {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { "X-Preview-Token": token },
    })
      .then((response) => {
        if (!response.ok) throw new Error("Preview unavailable or expired.");
        return response.json() as Promise<PreviewResponse>;
      })
      .then((payload) => setPost(payload.post))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Preview unavailable.");
      });
    return () => controller.abort();
  }, [id, token]);

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      {error ? (
        <main className="container mx-auto px-4 py-20 text-center" data-testid="preview-error">
          <h1 className="text-3xl font-black mb-3">Preview unavailable</h1>
          <p className="text-muted-foreground">{error}</p>
        </main>
      ) : !post ? (
        <main className="container mx-auto px-4 py-10 max-w-4xl" data-testid="preview-loading">
          <Skeleton className="w-full h-16 mb-6 rounded-none" />
          <Skeleton className="w-full aspect-video rounded-none" />
        </main>
      ) : (
        <article
          className="w-full"
          data-preview-ready={ready ? "true" : "false"}
          data-testid="preview-article"
        >
          <header className="container mx-auto px-4 md:px-6 py-10 max-w-4xl">
            <p className="text-xs uppercase tracking-widest text-primary font-bold mb-4">Private preview</p>
            <h1 className="text-4xl md:text-6xl font-black leading-tight mb-6">{post.title}</h1>
            {post.excerpt && <p className="text-xl text-muted-foreground font-serif">{post.excerpt}</p>}
            {post.author && <p className="mt-5 text-sm text-muted-foreground">By {post.author}</p>}
          </header>
          {post.cover_image && (
            <div className="w-full max-w-6xl mx-auto px-4 md:px-6 mb-12">
              <img src={post.cover_image} alt={post.cover_image_alt ?? ""} className="w-full h-auto" />
            </div>
          )}
          <div className="container mx-auto px-4 md:px-6 max-w-3xl mb-20">
            <PostContent
              html={post.content}
              enableAds={false}
              onHeadingsExtracted={() => undefined}
              onEmbedsReady={markReady}
            />
          </div>
        </article>
      )}
    </>
  );
}