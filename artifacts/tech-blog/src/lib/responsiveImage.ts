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
 * Bundled brand cover/hero images that ship as static `.webp` files with
 * pre-generated `-400` / `-800` width variants (the originals are 1408w). These
 * are the seeded post covers (`/covers/*`) and the homepage hero fallback.
 *
 * Only these exact base names have width variants committed under `public/`, so
 * the responsive `srcset` is gated to this set — any other `/covers/*` path is
 * still normalized to `.webp` (below) but served as a single file, never an
 * `-400`/`-800` URL that would 404. Admin-uploaded covers go to object storage
 * (`/api/storage/objects/`), not here, so this set stays the full source list.
 */
const STATIC_COVER_VARIANTS = new Set([
  "ai-trends",
  "cybersecurity",
  "ev-future",
  "gadgets",
  "laptops",
  "quantum",
  "software",
  "hero-post",
]);

/**
 * Normalize a bundled cover/hero path to its `.webp` form (rewriting any legacy
 * `.png` so the browser never pays the 301 redirect hop), or null if the path
 * isn't a bundled cover. Returns whether pre-generated width variants exist.
 */
function staticCoverWebp(src: string): { webp: string; hasVariants: boolean } | null {
  const m = /^\/(?:covers|images)\/([^/]+)\.(?:png|webp)$/i.exec(src);
  if (!m) return null;
  return { webp: src.replace(/\.png$/i, ".webp"), hasVariants: STATIC_COVER_VARIANTS.has(m[1]) };
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
  if (src.startsWith("/api/storage/objects/")) {
    const srcSet = VARIANT_WIDTHS.map((w) => `${buildVariantUrl(src, w)} ${w}w`).join(", ");
    return { src, srcSet, sizes };
  }
  // Bundled brand covers/hero: serve the small pre-generated variant the layout
  // actually needs (was shipping the full 1408w file to every viewport).
  const cover = staticCoverWebp(src);
  if (cover) {
    if (!cover.hasVariants) {
      // Normalize to .webp (no 301) but serve the single original file.
      return { src: cover.webp };
    }
    const base = cover.webp.replace(/\.webp$/i, "");
    const srcSet = [
      `${base}-400.webp 400w`,
      `${base}-800.webp 800w`,
      `${cover.webp} 1408w`,
    ].join(", ");
    return { src: cover.webp, srcSet, sizes };
  }
  return { src };
}

const BODY_IMG_SIZES = "(min-width: 1280px) 1200px, (min-width: 768px) 90vw, 100vw";

/**
 * Rewrite the article HTML string so every <img> pointing at our object
 * storage carries srcset/sizes (plus lazy loading) BEFORE first render.
 * Doing it on the string (instead of mutating the DOM afterwards) means the
 * browser's preload scanner never kicks off a full-size download first, and
 * client-side navigations are covered automatically since the transformed
 * HTML is what gets rendered. External image URLs are left untouched.
 */
export function makeArticleHtmlResponsive(html: string): string {
  if (!html || !html.includes("/api/storage/objects/")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>("img"))) {
    const src = img.getAttribute("src") || "";
    if (!src.startsWith("/api/storage/objects/")) continue;
    img.setAttribute(
      "srcset",
      VARIANT_WIDTHS.map((w) => `${buildVariantUrl(src, w)} ${w}w`).join(", "),
    );
    img.setAttribute("sizes", BODY_IMG_SIZES);
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    img.dataset.responsive = "1";
  }
  return doc.body.innerHTML;
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
