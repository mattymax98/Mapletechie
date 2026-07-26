import { useEffect, useRef, useState } from "react";
import { Youtube, Twitter, Instagram, Music2, ExternalLink, Play } from "lucide-react";
import {
  parseSocialUrl,
  PROVIDER_LABELS,
  type ParsedSocialEmbed,
  type SocialProvider,
} from "@/lib/socialEmbedProviders";

/* ------------------------------------------------------------------ */
/* Shared script loader — loads each provider script at most once,     */
/* and only when an embed is actually on the page.                     */
/* ------------------------------------------------------------------ */
const scriptPromises = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const existing = scriptPromises.get(src);
  if (existing) return existing;
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromises.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(s);
  });
  scriptPromises.set(src, p);
  return p;
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains("dark");
}

/* ------------------------------------------------------------------ */
/* Fallback link card (broken embed, deleted post, blocked script)     */
/* ------------------------------------------------------------------ */
const PROVIDER_ICONS: Record<SocialProvider, typeof Youtube> = {
  youtube: Youtube,
  twitter: Twitter,
  instagram: Instagram,
  tiktok: Music2,
};

function LinkCard({ embed }: { embed: ParsedSocialEmbed }) {
  const Icon = PROVIDER_ICONS[embed.provider];
  return (
    <a
      href={embed.url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="embed-link-card"
      className="not-prose my-6 flex items-center gap-3 rounded border border-border bg-muted/40 px-4 py-3 no-underline hover:border-primary transition-colors"
    >
      <Icon className="w-5 h-5 text-primary shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">
          View this post on {PROVIDER_LABELS[embed.provider]}
        </span>
        <span className="block text-xs text-muted-foreground truncate">{embed.url}</span>
      </span>
      <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* YouTube — click-to-load: thumbnail first, iframe only on click      */
/* ------------------------------------------------------------------ */
function YouTubeEmbed({ embed }: { embed: ParsedSocialEmbed }) {
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return (
      <div className="not-prose my-6 aspect-video w-full overflow-hidden rounded border border-border">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${embed.id}?autoplay=1`}
          title="YouTube video"
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      data-testid="embed-youtube-thumb"
      onClick={() => setPlaying(true)}
      className="not-prose group relative my-6 block aspect-video w-full overflow-hidden rounded border border-border bg-black"
      aria-label="Play YouTube video"
    >
      <img
        src={`https://i.ytimg.com/vi/${embed.id}/hqdefault.jpg`}
        alt="YouTube video thumbnail"
        loading="lazy"
        className="h-full w-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-14 w-20 items-center justify-center rounded bg-black/70 group-hover:bg-primary transition-colors">
          <Play className="h-7 w-7 fill-white text-white" />
        </span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* X / Twitter — widgets.js, with fallback card on failure             */
/* ------------------------------------------------------------------ */
declare global {
  interface Window {
    twttr?: { widgets: { createTweet: (id: string, el: HTMLElement, opts?: object) => Promise<HTMLElement | null> } };
    instgrm?: { Embeds: { process: () => void } };
  }
}

function TweetEmbed({ embed }: { embed: ParsedSocialEmbed }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "done" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setState((s) => (s === "loading" ? "failed" : s));
    }, 10000);
    loadScript("https://platform.twitter.com/widgets.js")
      .then(() => {
        if (cancelled || !holderRef.current || !window.twttr) throw new Error("no twttr");
        return window.twttr.widgets.createTweet(embed.id, holderRef.current, {
          theme: isDarkMode() ? "dark" : "light",
          dnt: true,
          align: "center",
        });
      })
      .then((el) => {
        if (cancelled) return;
        setState(el ? "done" : "failed"); // null => tweet deleted/protected
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [embed.id]);

  if (state === "failed") return <LinkCard embed={embed} />;
  return (
    <div className="not-prose my-6 flex justify-center" data-testid="embed-tweet">
      <div ref={holderRef} className="w-full max-w-[550px]" />
      {state === "loading" && (
        <span className="sr-only">Loading post from X…</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Instagram / TikTok — official blockquote + provider script          */
/* ------------------------------------------------------------------ */
function InstagramEmbed({ embed }: { embed: ParsedSocialEmbed }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadScript("https://www.instagram.com/embed.js")
      .then(() => {
        if (!cancelled) window.instgrm?.Embeds.process();
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [embed.url]);

  if (failed) return <LinkCard embed={embed} />;
  return (
    <div className="not-prose my-6 flex justify-center" data-testid="embed-instagram">
      <blockquote
        className="instagram-media"
        data-instgrm-permalink={embed.url}
        data-instgrm-version="14"
        style={{ maxWidth: 540, width: "100%", margin: 0 }}
      >
        <a href={embed.url} target="_blank" rel="noopener noreferrer">
          View this post on Instagram
        </a>
      </blockquote>
    </div>
  );
}

function TikTokEmbed({ embed }: { embed: ParsedSocialEmbed }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadScript("https://www.tiktok.com/embed.js").catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [embed.url]);

  if (failed) return <LinkCard embed={embed} />;
  return (
    <div className="not-prose my-6 flex justify-center" data-testid="embed-tiktok">
      <blockquote
        className="tiktok-embed"
        cite={embed.url}
        data-video-id={embed.id}
        style={{ maxWidth: 540, width: "100%", margin: 0 }}
      >
        <a href={embed.url} target="_blank" rel="noopener noreferrer">
          View this video on TikTok
        </a>
      </blockquote>
    </div>
  );
}

export function SocialEmbedView({ embed }: { embed: ParsedSocialEmbed }) {
  switch (embed.provider) {
    case "youtube":
      return <YouTubeEmbed embed={embed} />;
    case "twitter":
      return <TweetEmbed embed={embed} />;
    case "instagram":
      return <InstagramEmbed embed={embed} />;
    case "tiktok":
      return <TikTokEmbed embed={embed} />;
    default:
      return <LinkCard embed={embed} />;
  }
}

export type ArticleSegment =
  | { kind: "html"; html: string }
  | { kind: "embed"; embed: ParsedSocialEmbed };

/**
 * Split saved article HTML into plain-HTML segments and social embed blocks
 * so embeds render as real React components (click-to-load YouTube, tweet
 * widgets, ...) instead of relying on post-mount DOM hydration.
 *
 * DOM-aware on purpose: the HTML is parsed and only TOP-LEVEL
 * `div[data-social-embed]` blocks become embed segments, so surrounding
 * markup can never be sliced apart mid-element. Placeholders nested inside
 * other containers (blockquote, list, table...) are left in the HTML flow —
 * their inner fallback link still renders. Every URL is re-validated against
 * the provider whitelist.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function splitSocialEmbeds(html: string): ArticleSegment[] {
  if (typeof DOMParser === "undefined" || !/data-social-embed/i.test(html)) {
    return [{ kind: "html", html }];
  }
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const segments: ArticleSegment[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      segments.push({ kind: "html", html: buf });
      buf = "";
    }
  };
  for (const node of Array.from(body.childNodes)) {
    if (
      node.nodeType === 1 &&
      (node as Element).tagName === "DIV" &&
      (node as Element).hasAttribute("data-social-embed")
    ) {
      const parsed = parseSocialUrl((node as Element).getAttribute("data-url") || "");
      if (parsed) {
        flush();
        segments.push({ kind: "embed", embed: parsed });
        continue;
      }
    }
    if (node.nodeType === 1) {
      buf += (node as Element).outerHTML;
    } else if (node.nodeType === 3) {
      // Re-escape text nodes — textContent decodes entities, which would turn
      // previously-escaped text back into live HTML inside
      // dangerouslySetInnerHTML.
      buf += escapeHtml(node.textContent ?? "");
    }
    // Other node types (comments etc.) are dropped.
  }
  flush();
  return segments.length ? segments : [{ kind: "html", html }];
}
