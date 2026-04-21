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
