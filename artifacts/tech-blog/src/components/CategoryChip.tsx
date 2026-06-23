import { useMemo } from "react";
import { Link } from "wouter";
import { useListCategories } from "@workspace/api-client-react";
import {
  buildCategoryColorLookup,
  readableTextColor,
  DEFAULT_CATEGORY_COLOR,
} from "@/lib/categoryColors";

/**
 * Resolve a category name/slug to its accent color. Reuses the cached
 * `useListCategories` query so the lookup is shared across the tree.
 */
export function useCategoryColor(): (key?: string | null) => string {
  const { data: categories } = useListCategories();
  return useMemo(() => buildCategoryColorLookup(categories), [categories]);
}

interface CategoryChipProps {
  /** Category display name (e.g. `post.category`) or slug. */
  category?: string | null;
  /** Optional slug to link to `/category/:slug`. */
  slug?: string | null;
  /**
   * - `solid`: filled chip in the category color (auto-contrast text). Use over
   *   images and as the primary badge.
   * - `dot`: a colored dot + label in the inherited text color. Use in inline
   *   meta rows where a full chip would be too heavy (keeps contrast safe on
   *   light backgrounds).
   */
  variant?: "solid" | "dot";
  className?: string;
}

/**
 * Renders a category label tinted by its admin-assigned color. Falls back to the
 * brand orange for unknown categories.
 */
export function CategoryChip({
  category,
  slug,
  variant = "solid",
  className = "",
}: CategoryChipProps) {
  const colorFor = useCategoryColor();
  if (!category) return null;
  const color = colorFor(slug || category);

  const content =
    variant === "solid" ? (
      <span
        className={`inline-block rounded-none uppercase font-bold text-[10px] tracking-wider px-2 py-1 ${className}`}
        style={{ backgroundColor: color, color: readableTextColor(color) }}
      >
        {category}
      </span>
    ) : (
      <span className={`inline-flex items-center gap-1.5 uppercase font-bold tracking-wider ${className}`}>
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        {category}
      </span>
    );

  if (slug) {
    return (
      <Link
        href={`/category/${slug}`}
        className="inline-block hover:opacity-80 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </Link>
    );
  }
  return content;
}

export { DEFAULT_CATEGORY_COLOR };
