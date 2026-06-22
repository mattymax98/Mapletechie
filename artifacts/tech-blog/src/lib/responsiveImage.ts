/**
 * Inject responsive srcset/sizes attributes on every <img> in a rendered post body
 * whose src points at our object storage. Browsers then pick the smallest file
 * that's big enough for the viewport — sharp on retina, fast on mobile.
 */
const VARIANT_WIDTHS = [400, 800, 1200, 1600, 2400] as const;

function buildVariantUrl(originalSrc: string, width: number): string {
  // /api/storage/objects/uploads/abc -> /api/storage/img/{width}/objects/uploads/abc
  return originalSrc.replace(/^\/api\/storage\/objects\//, `/api/storage/img/${width}/objects/`);
}

/**
 * Standard `sizes` hints for cover images in their common layout contexts.
 * These tell the browser how wide the image renders so it can pick the
 * smallest matching srcset variant.
 */
export const COVER_SIZES = {
  /** Large hero (home featured, ~2/3 width on desktop). */
  hero: "(min-width: 1024px) 66vw, 100vw",
  /** Full-width article cover (max ~1152px container). */
  full: "(min-width: 1152px) 1152px, 100vw",
  /** 3-column card grid (blog index, category, related). */
  grid3: "(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw",
  /** 2-column card grid (home latest). */
  grid2: "(min-width: 768px) 50vw, 100vw",
  /** Narrow sidebar column (home sub-hero). */
  sidebar: "(min-width: 1024px) 33vw, 100vw",
} as const;

/**
 * Build responsive <img> props for a cover image. When the src points at our
 * own object storage we attach a srcset of resizer variants + the given sizes
 * hint, so phones fetch a small file and large/retina screens fetch a sharp one.
 * External URLs and bundled fallback images are returned untouched.
 */
export function responsiveCoverProps(
  src: string,
  sizes: string,
): { src: string; srcSet?: string; sizes?: string } {
  if (!src.startsWith("/api/storage/objects/")) {
    return { src };
  }
  const srcSet = VARIANT_WIDTHS.map((w) => `${buildVariantUrl(src, w)} ${w}w`).join(", ");
  return { src, srcSet, sizes };
}

export function applyResponsiveImages(root: HTMLElement | null): void {
  if (!root) return;
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  for (const img of imgs) {
    const src = img.getAttribute("src") || "";
    // Only rewrite our own uploads — leave external URLs untouched.
    if (!src.startsWith("/api/storage/objects/")) continue;
    if (img.dataset.responsive === "1") continue;

    const srcset = VARIANT_WIDTHS.map((w) => `${buildVariantUrl(src, w)} ${w}w`).join(", ");
    img.setAttribute("srcset", srcset);
    img.setAttribute("sizes", "(min-width: 1280px) 1200px, (min-width: 768px) 90vw, 100vw");
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    img.dataset.responsive = "1";
  }
}
