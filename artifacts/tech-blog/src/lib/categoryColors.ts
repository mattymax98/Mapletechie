/**
 * Brand fallback when a category has no color set (matches `--primary`).
 */
export const DEFAULT_CATEGORY_COLOR = "#f97316";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Build a lookup from a list of categories to their accent color, keyed by both
 * name and slug (normalized) since callers sometimes have the display name
 * (`post.category`) and sometimes the slug. Returns a resolver that falls back
 * to the brand orange for unknown / null keys.
 */
export function buildCategoryColorLookup(
  categories: Array<{ name: string; slug: string; color?: string | null }> | undefined,
): (key?: string | null) => string {
  const map = new Map<string, string>();
  for (const c of categories ?? []) {
    const color = c.color || DEFAULT_CATEGORY_COLOR;
    map.set(normalize(c.name), color);
    map.set(normalize(c.slug), color);
  }
  return (key?: string | null) => {
    if (!key) return DEFAULT_CATEGORY_COLOR;
    return map.get(normalize(key)) ?? DEFAULT_CATEGORY_COLOR;
  };
}

/**
 * Pick a readable text color (near-black or white) for text placed on top of a
 * solid `bgHex` fill, using WCAG relative luminance. Light category colors
 * (cyan, lime) get dark text; saturated/dark ones get white.
 */
export function readableTextColor(bgHex: string): string {
  const h = bgHex.replace("#", "");
  if (h.length !== 6) return "#ffffff";
  const toLin = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = toLin(parseInt(h.slice(0, 2), 16));
  const g = toLin(parseInt(h.slice(2, 4), 16));
  const b = toLin(parseInt(h.slice(4, 6), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.42 ? "#0a0a0a" : "#ffffff";
}
