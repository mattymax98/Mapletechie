import { useEffect, useRef, useState } from "react";

/**
 * Designed AdSense ad slots that stay invisible until an ad actually shows.
 *
 * How it works:
 * - We use fixed ad units (NOT Auto Ads): each placement below has a slot id
 *   configured via env, and Google fills it with whatever ads are running.
 * - When a unit is unfilled, AdSense sets `data-ad-status="unfilled"` on the
 *   <ins>; we watch for that and collapse the slot completely — no empty
 *   outline, no "advertisement" label, zero height.
 * - Nothing renders at all (and the AdSense script never loads) unless a
 *   publisher id AND that placement's slot id are configured, and the app is
 *   a production build. Dev/preview pages look exactly as they do today.
 *
 * Configuration (no code changes needed):
 * - VITE_ADSENSE_CLIENT             — publisher id (defaults to the site's)
 * - VITE_ADSENSE_SLOT_SIDEBAR       — tall unit beside homepage sections
 * - VITE_ADSENSE_SLOT_BANNER        — wide banner between homepage sections
 * - VITE_ADSENSE_SLOT_BELOW_ARTICLE — unit below the article body
 * - VITE_ADSENSE_SLOT_IN_ARTICLE    — fluid unit injected mid-article
 * Slot ids come from the AdSense dashboard (Ads → By ad unit).
 */

const env = import.meta.env;

const ADSENSE_CLIENT: string =
  (env.VITE_ADSENSE_CLIENT as string | undefined)?.trim() || "ca-pub-9581001238069953";

export type AdPlacement = "sidebar" | "banner" | "belowArticle" | "inArticle";

const SLOT_IDS: Record<AdPlacement, string | undefined> = {
  sidebar: (env.VITE_ADSENSE_SLOT_SIDEBAR as string | undefined)?.trim() || undefined,
  banner: (env.VITE_ADSENSE_SLOT_BANNER as string | undefined)?.trim() || undefined,
  belowArticle: (env.VITE_ADSENSE_SLOT_BELOW_ARTICLE as string | undefined)?.trim() || undefined,
  inArticle: (env.VITE_ADSENSE_SLOT_IN_ARTICLE as string | undefined)?.trim() || undefined,
};

/** True when this placement is fully configured and ads may run at all. */
export function adPlacementEnabled(placement: AdPlacement): boolean {
  return Boolean(env.PROD && ADSENSE_CLIENT && SLOT_IDS[placement]);
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let scriptLoaded = false;
function ensureAdSenseScript(): void {
  if (scriptLoaded || typeof document === "undefined") return;
  scriptLoaded = true;
  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  document.head.appendChild(s);
}

const PLACEMENT_ATTRS: Record<AdPlacement, Record<string, string>> = {
  // Tall unit next to homepage grids. Responsive=false keeps it from
  // bleeding into the article column on mid-width viewports.
  sidebar: { "data-ad-format": "auto", "data-full-width-responsive": "false" },
  // Wide responsive banner between sections. Uses rectangle/horizontal
  // formats only — no interstitial or overlay units.
  banner: { "data-ad-format": "horizontal", "data-full-width-responsive": "true" },
  // Large responsive unit below the article body — safe distance after
  // the last paragraph so it never overlaps inline content.
  belowArticle: { "data-ad-format": "auto", "data-full-width-responsive": "true" },
  // Google's native in-article format. "fluid" + "in-article" layout
  // tells AdSense to serve a unit that mimics editorial content width
  // and sits between paragraphs without altering line flow.
  inArticle: { "data-ad-format": "fluid", "data-ad-layout": "in-article" },
};

/**
 * Placements that show a small "ADVERTISEMENT" disclosure label above the
 * unit. In-article is omitted — Google's native "fluid" format already
 * carries its own disclosure per AdSense policy.
 */
const SHOW_LABEL: Partial<Record<AdPlacement, boolean>> = {
  sidebar: true,
  banner: true,
  belowArticle: true,
};

/**
 * One designed ad position. Renders nothing at all when unconfigured, in dev,
 * or when Google reports the unit unfilled — the layout collapses as if the
 * slot didn't exist. `className` styles the wrapper (spacing lives here so it
 * disappears together with the ad).
 */
export function AdSlot({ placement, className = "" }: { placement: AdPlacement; className?: string }) {
  const enabled = adPlacementEnabled(placement);
  const [unfilled, setUnfilled] = useState(false);
  const insRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    ensureAdSenseScript();
    const el = insRef.current;
    if (!el) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Blocked or double-push — treat as unfilled so the slot collapses.
      setUnfilled(true);
      return;
    }
    const check = () => {
      if (el.getAttribute("data-ad-status") === "unfilled") setUnfilled(true);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(el, { attributes: true, attributeFilter: ["data-ad-status"] });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  if (!enabled || unfilled) return null;

  return (
    <div className={className} data-testid={`ad-slot-${placement}`}>
      {SHOW_LABEL[placement] && (
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 text-center mb-1 select-none">
          Advertisement
        </p>
      )}
      <ins
        ref={insRef as never}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={SLOT_IDS[placement]}
        {...PLACEMENT_ATTRS[placement]}
      />
    </div>
  );
}

/**
 * Split article HTML into chunks at top-level paragraph boundaries so an
 * in-article ad can sit between paragraphs. Splits happen ONLY after a
 * top-level <p>, so ads can never land inside code blocks, figures,
 * blockquotes, embeds or image captions (those are whole top-level nodes).
 *
 * Rules: no split before `minParagraphs` total, one break every `everyN`
 * paragraphs, at most `maxBreaks` breaks, and never within the final two
 * paragraphs of the article.
 */
export function splitHtmlForInArticleAds(
  html: string,
  { everyN = 6, maxBreaks = 2, minParagraphs = 9 }: { everyN?: number; maxBreaks?: number; minParagraphs?: number } = {},
): string[] {
  if (typeof document === "undefined") return [html];
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const nodes = Array.from(tpl.content.childNodes);
  const totalParagraphs = nodes.filter(
    (n) => n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === "P",
  ).length;
  if (totalParagraphs < minParagraphs) return [html];

  // Serialize through the browser so text nodes stay entity-escaped and
  // comments survive — manual string concatenation would corrupt them.
  const serialize = (group: Node[]): string => {
    const holder = document.createElement("template");
    for (const n of group) holder.content.appendChild(n);
    return holder.innerHTML;
  };

  const chunks: string[] = [];
  let current: Node[] = [];
  let pCount = 0;
  let breaks = 0;
  for (const node of nodes) {
    current.push(node);
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "P") {
      pCount += 1;
      const remaining = totalParagraphs - pCount;
      if (pCount % everyN === 0 && breaks < maxBreaks && remaining >= 2) {
        chunks.push(serialize(current));
        current = [];
        breaks += 1;
      }
    }
  }
  if (current.length > 0) {
    const last = serialize(current);
    if (last.trim()) chunks.push(last);
  }
  return chunks;
}
