import { useCallback, useEffect, useMemo, useRef } from "react";
import { applyResponsiveImages, makeArticleHtmlResponsive } from "@/lib/responsiveImage";
import { ensureImgAlt } from "@/lib/ensureImgAlt";
import { splitSocialEmbeds, SocialEmbedView, type ArticleSegment } from "@/components/SocialEmbeds";
import { AdSlot, adPlacementEnabled, splitHtmlForInArticleAds } from "@/components/AdSlot";

export function PostContent({
  html,
  onHeadingsExtracted,
  onEmbedsReady,
  enableAds = true,
}: {
  html: string;
  onHeadingsExtracted: (headings: { id: string; text: string }[]) => void;
  onEmbedsReady?: () => void;
  /** Preview pages deliberately omit advertising and its side effects. */
  enableAds?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const h2s = Array.from(ref.current.querySelectorAll("h2"));
    onHeadingsExtracted(h2s.map((h, i) => {
      const text = (h.textContent || "").trim();
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || `section-${i + 1}`;
      h.id = id;
      return { id, text };
    }));
    applyResponsiveImages(ref.current);
  }, [html, onHeadingsExtracted]);

  const responsiveHtml = useMemo(() => ensureImgAlt(makeArticleHtmlResponsive(html)), [html]);
  const segments = useMemo(() => splitSocialEmbeds(responsiveHtml), [responsiveHtml]);
  const rendered = useMemo(() => {
    const out: Array<{ key: string; node: "embed" | "html" | "ad"; seg?: ArticleSegment; html?: string }> = [];
    let adBudget = enableAds && adPlacementEnabled("inArticle") ? 2 : 0;
    segments.forEach((seg, i) => {
      if (seg.kind === "embed") {
        out.push({ key: `e-${i}`, node: "embed", seg });
      } else if (adBudget <= 0) {
        out.push({ key: `h-${i}`, node: "html", html: seg.html });
      } else {
        const chunks = splitHtmlForInArticleAds(seg.html, { maxBreaks: adBudget });
        chunks.forEach((chunk, j) => {
          out.push({ key: `h-${i}-${j}`, node: "html", html: chunk });
          if (j < chunks.length - 1) {
            out.push({ key: `a-${i}-${j}`, node: "ad" });
            adBudget--;
          }
        });
      }
    });
    return out;
  }, [segments, enableAds]);

  const embedCount = segments.filter((s) => s.kind === "embed").length;
  const readyCount = useRef(0);
  const completed = useRef(false);
  const markEmbedsReady = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    onEmbedsReady?.();
  }, [onEmbedsReady]);
  useEffect(() => {
    readyCount.current = 0;
    completed.current = false;
    if (embedCount === 0) {
      markEmbedsReady();
      return;
    }
    // Third-party scripts can be blocked by privacy tools. Never hold a
    // preview indefinitely; rendered/fallback widgets normally win first.
    const timeout = window.setTimeout(markEmbedsReady, 12000);
    return () => window.clearTimeout(timeout);
  }, [embedCount, markEmbedsReady]);
  const embedReady = useCallback(() => {
    readyCount.current++;
    if (readyCount.current >= embedCount) markEmbedsReady();
  }, [embedCount, markEmbedsReady]);

  return (
    <div ref={ref} className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80 prose-img:border prose-img:border-border font-serif leading-relaxed prose-headings:scroll-mt-24">
      {rendered.map((item) =>
        item.node === "embed" && item.seg?.kind === "embed" ? (
          <SocialEmbedView key={item.key} embed={item.seg.embed} onReady={embedReady} />
        ) : item.node === "ad" ? (
          <AdSlot key={item.key} placement="inArticle" className="not-prose my-8" />
        ) : (
          <div key={item.key} dangerouslySetInnerHTML={{ __html: item.html ?? "" }} />
        ),
      )}
    </div>
  );
}