import type { Request, Response, NextFunction } from "express";
import { getMaintenanceState } from "../lib/siteSettings";

/**
 * Public maintenance gate. When maintenance mode is active it responds 503
 * (with a Retry-After hint) to public API requests so crawlers and clients
 * know the site is temporarily down — but it never blocks the things the admin
 * needs to log in, manage the site, or read the maintenance status:
 *
 *   - /admin/*    — the entire admin API (incl. login + settings) stays open
 *   - /healthz    — process health checks must keep passing
 *   - /settings/* — the always-available public status endpoint for polling
 *
 * Paths here are relative to the router mount point ("/api"), so req.path is
 * e.g. "/posts", "/admin/login", "/settings/status".
 */
function isExempt(path: string): boolean {
  return (
    path === "/healthz" ||
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path === "/settings" ||
    path.startsWith("/settings/")
  );
}

export async function publicMaintenanceGate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isExempt(req.path)) {
    next();
    return;
  }

  try {
    const state = await getMaintenanceState();
    if (!state.active) {
      next();
      return;
    }
    res.setHeader("Retry-After", "3600");
    res.status(503).json({
      error: "maintenance",
      maintenance: true,
      message: state.message,
      eta: state.eta,
    });
  } catch (err) {
    // If we can't read the flag, fail open — better to serve the site than to
    // 503 everyone because of a transient DB hiccup.
    req.log?.error({ err }, "maintenance gate check failed; failing open");
    next();
  }
}
