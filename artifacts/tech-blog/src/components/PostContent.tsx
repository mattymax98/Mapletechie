import { useCallback, useEffect, useMemo, useRef } from "react";
import { applyResponsiveImages, makeArticleHtmlResponsive } from "@/lib/responsiveImage";
import { ensureImgAlt } from "@/lib/ensureImgAlt";
import { splitSocialEmbeds, SocialEmbedView, type ArticleSegment, type EmbedTerminalStatus } from "@/components/SocialEmbeds";
import { AdSlot, adPlacementEnabled, splitHtmlForInArticleAds } from "@/components/AdSlot";

export function PostContent({
  html,
  onHeadingsExtracted,
  onEmbedsReady,
  onEmbedProgress,
  enableAds = true,
}: {
  html: string;
  onHeadingsExtracted: (headings: { id: string; text: string }[]) => void;
  onEmbedsReady?: () => void;
  onEmbedProgress?: (progress: { total: number; loading: number; rendered: number; fallback: number; failed: number }) => void;
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
        out.push({ key: `e-${i}-${seg.embed.provider}-${seg.embed.id}`, node: "embed", seg });
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
  const expectedEmbedKeys = useMemo(
    () => rendered.filter((item) => item.node === "embed").map((item) => item.key),
    [rendered],
  );
  const statusByKey = useRef(new Map<string, EmbedTerminalStatus>());
  const lifecycleHtml = useRef(html);
  const lifecycleGeneration = useRef(0);
  if (lifecycleHtml.current !== html) {
    lifecycleHtml.current = html;
    lifecycleGeneration.current++;
    statusByKey.current = new Map();
  }
  const generation = lifecycleGeneration.current;
  const completed = useRef(false);
  const markEmbedsReady = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    onEmbedsReady?.();
  }, [onEmbedsReady]);
  useEffect(() => {
    completed.current = false;
    const initialStatuses = Array.from(statusByKey.current.values());
    onEmbedProgress?.({
      total: embedCount,
      loading: embedCount - initialStatuses.length,
      rendered: initialStatuses.filter((s) => s === "rendered").length,
      fallback: initialStatuses.filter((s) => s === "fallback").length,
      failed: initialStatuses.filter((s) => s === "failed").length,
    });
    if (embedCount === 0) {
      markEmbedsReady();
      return;
    }
    if (initialStatuses.length >= embedCount) {
      markEmbedsReady();
      return;
    }
    // Third-party scripts can be blocked by privacy tools. Never hold a
    // preview indefinitely; rendered/fallback widgets normally win first.
    const timeout = window.setTimeout(() => {
      const unresolved = embedCount - statusByKey.current.size;
      if (unresolved > 0) {
        // Watchdog failures are intentionally terminal and counted separately.
        let failed = 0;
        for (const key of expectedEmbedKeys) {
          if (!statusByKey.current.has(key)) {
            statusByKey.current.set(key, "failed");
            failed++;
          }
        }
        const values = Array.from(statusByKey.current.values());
        onEmbedProgress?.({
          total: embedCount,
          loading: 0,
          rendered: values.filter((s) => s === "rendered").length,
          fallback: values.filter((s) => s === "fallback").length,
          failed: values.filter((s) => s === "failed").length,
        });
      }
      markEmbedsReady();
    }, 12000);
    return () => window.clearTimeout(timeout);
  }, [embedCount, expectedEmbedKeys, markEmbedsReady, onEmbedProgress]);
  const embedStatus = useCallback((key: string, status: EmbedTerminalStatus) => {
    if (generation !== lifecycleGeneration.current) return;
    if (statusByKey.current.has(key)) return;
    statusByKey.current.set(key, status);
    const values = Array.from(statusByKey.current.values());
    onEmbedProgress?.({
      total: embedCount,
      loading: embedCount - values.length,
      rendered: values.filter((s) => s === "rendered").length,
      fallback: values.filter((s) => s === "fallback").length,
      failed: values.filter((s) => s === "failed").length,
    });
    if (values.length >= embedCount) markEmbedsReady();
  }, [embedCount, generation, markEmbedsReady, onEmbedProgress]);

  return (
    <div ref={ref} className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80 prose-img:border prose-img:border-border font-serif leading-relaxed prose-headings:scroll-mt-24">
      {rendered.map((item) =>
        item.node === "embed" && item.seg?.kind === "embed" ? (
          <SocialEmbedView key={item.key} embed={item.seg.embed} embedKey={item.key} onStatus={embedStatus} />
        ) : item.node === "ad" ? (
          <AdSlot key={item.key} placement="inArticle" className="not-prose my-8" />
        ) : (
          <div key={item.key} dangerouslySetInnerHTML={{ __html: item.html ?? "" }} />
        ),
      )}
    </div>
  );
}