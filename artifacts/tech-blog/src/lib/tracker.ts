const SESSION_KEY = "mt_session_id";
const ADMIN_TOKEN_KEY = "mapletechie_admin_token";

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

export function trackPageView(path: string): void {
  // Don't track admin views
  if (path.startsWith("/admin")) return;
  // Don't track when logged into admin (they're not real readers)
  try { if (localStorage.getItem(ADMIN_TOKEN_KEY)) return; } catch { /* noop */ }

  const payload = {
    path,
    postSlug: derivePostSlug(path),
    category: deriveCategory(path),
    referrer: document.referrer || null,
    sessionId: getSessionId(),
  };

  const url = `${import.meta.env.BASE_URL}api/track`;
  let beaconOk = false;
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      beaconOk = navigator.sendBeacon(url, blob);
    }
  } catch { /* fall through to fetch */ }
  if (beaconOk) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => { /* swallow */ });
}
