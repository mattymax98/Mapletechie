import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Detects the "stale deployment" failure mode: a lazily-loaded route chunk
 * whose fingerprinted file was replaced by a newer publish. These errors are
 * fixed by a single reload (which fetches the new index.html and chunk map).
 */
export function isStaleChunkError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to load module script/i.test(
    message,
  );
}

const RELOAD_FLAG = "mapletechie_chunk_reload";

// Minimum time between auto-reloads. A stale-deployment recovery only ever
// needs ONE reload; if chunks are still failing right after a reload, the
// server is genuinely unhealthy and reloading again would just loop.
const RELOAD_COOLDOWN_MS = 60_000;

// In-memory fallback guard for contexts where sessionStorage is unavailable
// (locked-down privacy modes). Not reload-persistent, but each reload creates
// a fresh page that still has to fail again before the NEXT reload — combined
// with the storage guard this prevents tight reload loops in all contexts.
let memoryLastReload = 0;

/**
 * Reload the page to pick up a fresh deployment, at most once per cooldown
 * window (tracked in sessionStorage, with an in-memory fallback) so a genuine
 * outage can't cause a reload loop. Returns true if a reload was triggered.
 */
export function reloadOnceForStaleChunk(): boolean {
  const now = Date.now();
  if (now - memoryLastReload < RELOAD_COOLDOWN_MS) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0);
    if (now - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_FLAG, String(now));
  } catch {
    // sessionStorage unavailable — rely on the in-memory guard above.
  }
  memoryLastReload = now;
  window.location.reload();
  return true;
}

/** Test-only: reset the in-memory guard. */
export function __resetReloadGuardForTests(): void {
  memoryLastReload = 0;
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    // A stale-chunk crash that slipped past vite:preloadError (e.g. thrown
    // from React.lazy during render) — reload once instead of showing the
    // error screen.
    if (isStaleChunkError(error) && reloadOnceForStaleChunk()) return;
    // eslint-disable-next-line no-console
    console.error("App crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "2rem",
            textAlign: "center",
            background: "#0a0a0a",
            color: "#e5e5e5",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ margin: 0, color: "#a3a3a3", maxWidth: "28rem" }}>
            Sorry about that — an unexpected error stopped this page from loading.
            Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "0.5rem",
              padding: "0.6rem 1.4rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#ea580c",
              color: "#fff",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
