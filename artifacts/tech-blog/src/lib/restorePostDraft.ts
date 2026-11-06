/** Browser drafts can outlive changes to the editor's form schema. */
export function restorePostDraft<T extends Record<string, string | number | boolean | string[]>>(
  saved: unknown,
  defaults: T,
): T {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return { ...defaults };
  const source = saved as Record<string, unknown>;
  const restored: Record<string, string | number | boolean | string[]> = { ...defaults };
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = source[key];
    if (Array.isArray(fallback)) {
      if (Array.isArray(value)) restored[key] = value.filter((item): item is string => typeof item === "string");
    } else if (typeof value === typeof fallback && (typeof value !== "number" || Number.isFinite(value))) {
      restored[key] = value as string | number | boolean;
    }
  }
  // Before multi-category support, drafts used a single category slug.
  if (!Array.isArray(source.categories) && typeof source.category === "string" && source.category) {
    restored.categories = [source.category];
  }
  const categories = restored.categories;
  if (Array.isArray(categories) && !categories.includes(restored.primaryCategory as string)) {
    restored.primaryCategory = categories[0] ?? "";
  }
  return restored as T;
}
