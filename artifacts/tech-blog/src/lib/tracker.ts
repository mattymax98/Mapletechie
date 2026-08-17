const SESSION_KEY = "mt_session_id";
const ADMIN_TOKEN_KEY = "mapletechie_admin_token";
const RETURNING_KEY = "mt_returning";

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 64);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function deriveCategory(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "category" && parts[1]) return parts[1];
  if (parts[0] === "blog" && !parts[1]) return "blog-index";
  if (parts[0] === "blog" && parts[1]) return null; // category not known here
  if (parts[0]) return parts[0];
  return "home";
}

function derivePostSlug(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "blog" && parts[1]) return parts[1];
  return null;
}

// ---------------------------------------------------------------------------
// Device / browser detection (small inline UA parser — good enough for
// aggregate analytics, not for feature detection)
// ---------------------------------------------------------------------------

export function detectDeviceType(ua: string): "mobile" | "tablet" | "desktop" {
  if (/ipad|tablet|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "mobile";
  return "desktop";
}

export function detectBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/firefox\/|fxios/i.test(ua)) return "Firefox";
  if (/chrome\/|crios/i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua)) return "Safari";
  return "Other";
}

/**
 * New-vs-returning: a localStorage marker that survives across sessions.
 * The first ever page view is "new" (false); every visit after the marker
 * exists reports returning = true.
 */
function isReturningVisitor(): boolean {
  try {
    const seen = localStorage.getItem(RETURNING_KEY);
    if (!seen) {
      localStorage.setItem(RETURNING_KEY, String(Date.now()));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function shouldSkipTracking(path: string): boolean {
  if (path.startsWith("/admin")) return true;
  try {
    if (localStorage.getItem(ADMIN_TOKEN_KEY)) return true;
  } catch {
    /* noop */
  }
  return false;
}

function sendJson(url: string, payload: unknown): void {
  let beaconOk = false;
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      beaconOk = navigator.sendBeacon(url, blob);
    }
  } catch {
    /* fall through to fetch */
  }
  if (beaconOk) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    /* swallow */
  });
}

// ---------------------------------------------------------------------------
// Per-page engagement state (scroll depth, foreground reading time)
// ---------------------------------------------------------------------------

let pageOpenedAt = typeof performance !== "undefined" ? performance.now() : 0;
let maxScrollDepth = 0;
let foregroundMs = 0;
let foregroundSince: number | null = null;
let currentPath: string | null = null;
let readingBeaconSent = false;
let listenersInstalled = false;

function computeScrollDepth(): number {
  try {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return 100;
    const pct = Math.round(((window.scrollY || doc.scrollTop || 0) / scrollable) * 100);
    return Math.min(100, Math.max(0, pct));
  } catch {
    return 0;
  }
}

function accumulateForeground(): void {
  if (foregroundSince != null) {
    foregroundMs += performance.now() - foregroundSince;
    foregroundSince = null;
  }
}

function sendReadingBeacon(): void {
  if (readingBeaconSent || !currentPath) return;
  accumulateForeground();
  const seconds = Math.round(foregroundMs / 1000);
  if (seconds <= 0) return;
  readingBeaconSent = true;
  sendJson(`${import.meta.env.BASE_URL}api/track`, {
    path: currentPath,
    postSlug: derivePostSlug(currentPath),
    category: deriveCategory(currentPath),
    sessionId: getSessionId(),
    readingTimeSec: Math.min(32000, seconds),
    scrollDepth: maxScrollDepth,
    durationMs: Math.round(performance.now() - pageOpenedAt),
    readingBeacon: true,
  });
}

function installGlobalListeners(): void {
  if (listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = true;

  window.addEventListener(
    "scroll",
    () => {
      const d = computeScrollDepth();
      if (d > maxScrollDepth) maxScrollDepth = d;
    },
    { passive: true },
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      accumulateForeground();
      sendReadingBeacon();
    } else {
      foregroundSince = performance.now();
      readingBeaconSent = false; // may re-send with updated totals on next hide
    }
  });

  window.addEventListener("beforeunload", () => {
    sendReadingBeacon();
  });
}

export function trackPageView(path: string): void {
  if (shouldSkipTracking(path)) return;

  installGlobalListeners();

  // Flush reading time for the previous SPA page before resetting state
  if (currentPath && currentPath !== path) {
    sendReadingBeacon();
  }
  currentPath = path;
  pageOpenedAt = performance.now();
  maxScrollDepth = computeScrollDepth();
  foregroundMs = 0;
  foregroundSince = document.visibilityState === "visible" ? performance.now() : null;
  readingBeaconSent = false;

  const ua = navigator.userAgent || "";
  const payload = {
    path,
    postSlug: derivePostSlug(path),
    category: deriveCategory(path),
    referrer: document.referrer || null,
    sessionId: getSessionId(),
    scrollDepth: maxScrollDepth,
    durationMs: 0,
    deviceType: detectDeviceType(ua),
    browser: detectBrowser(ua),
    isReturning: isReturningVisitor(),
  };

  sendJson(`${import.meta.env.BASE_URL}api/track`, payload);
}

// ---------------------------------------------------------------------------
// Click-level events: social shares, outbound links, on-site searches
// ---------------------------------------------------------------------------

export type TrackEventType = "social" | "outbound" | "search";

export function trackEvent(type: TrackEventType, data: Record<string, unknown> = {}): void {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  if (shouldSkipTracking(path)) return;

  sendJson(`${import.meta.env.BASE_URL}api/track/event`, {
    type,
    path,
    postSlug: derivePostSlug(path),
    sessionId: getSessionId(),
    ...data,
  });
}
