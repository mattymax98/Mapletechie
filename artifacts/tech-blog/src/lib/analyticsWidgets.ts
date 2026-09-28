/**
 * Widget registry + localStorage persistence for the admin analytics page.
 * Visibility preferences are stored under `mt_analytics_widgets`.
 */

export type WidgetId =
  | "summary"
  | "traffic"
  | "hourly"
  | "devices"
  | "newVsReturning"
  | "topPosts"
  | "readingTime"
  | "sources"
  | "countries"
  | "categories"
  | "searchQueries"
  | "linkClicks"
  | "needsAttention";

export interface WidgetDef {
  id: WidgetId;
  label: string;
  defaultVisible: boolean;
}

export const WIDGET_REGISTRY: readonly WidgetDef[] = [
  { id: "summary", label: "Summary stats", defaultVisible: true },
  { id: "traffic", label: "Traffic over time", defaultVisible: true },
  { id: "hourly", label: "Hourly heatmap", defaultVisible: true },
  { id: "devices", label: "Devices & browsers", defaultVisible: true },
  { id: "newVsReturning", label: "New vs. returning", defaultVisible: true },
  { id: "topPosts", label: "Top posts", defaultVisible: true },
  { id: "readingTime", label: "Reading time", defaultVisible: true },
  { id: "sources", label: "Traffic sources", defaultVisible: true },
  { id: "countries", label: "Countries", defaultVisible: true },
  { id: "categories", label: "Categories", defaultVisible: true },
  { id: "searchQueries", label: "Search queries", defaultVisible: true },
  { id: "linkClicks", label: "Social & outbound clicks", defaultVisible: true },
  { id: "needsAttention", label: "Needs attention", defaultVisible: true },
] as const;

export const WIDGETS_STORAGE_KEY = "mt_analytics_widgets";

export type WidgetVisibility = Record<WidgetId, boolean>;

export function defaultVisibility(): WidgetVisibility {
  const out = {} as WidgetVisibility;
  for (const w of WIDGET_REGISTRY) out[w.id] = w.defaultVisible;
  return out;
}

export function loadWidgetVisibility(): WidgetVisibility {
  const defaults = defaultVisibility();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(WIDGETS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaults;
    for (const w of WIDGET_REGISTRY) {
      if (typeof parsed[w.id] === "boolean") defaults[w.id] = parsed[w.id];
    }
    return defaults;
  } catch {
    return defaults;
  }
}

export function saveWidgetVisibility(v: WidgetVisibility): void {
  try {
    localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(v));
  } catch {
    // storage full / private mode — preference just won't persist
  }
}
