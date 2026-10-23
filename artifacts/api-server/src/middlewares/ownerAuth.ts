import type { Request, Response, NextFunction } from "express";
import { isSiteOwner } from "../lib/siteOwner";

/** Must follow adminAuth: an admin role alone does not grant private reports. */
export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (!isSiteOwner(req.user)) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.status(req.user ? 403 : 401).json({ error: req.user ? "Forbidden" : "Unauthorized" });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  next();
}
