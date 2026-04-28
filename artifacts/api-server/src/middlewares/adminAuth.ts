import { Request, Response, NextFunction } from "express";
import { getUserBySession } from "../lib/auth";
import type { User } from "@workspace/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function adminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);

  // Session-only auth. The legacy ADMIN_PASSWORD bearer-token fallback was
  // removed: it created a global bypass key with no expiry, no audit trail,
  // and no rotation. All admin work must go through a real user session
  // issued by POST /admin/login.
  const user = await getUserBySession(token);
  if (!user) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  req.user = user;
  next();
}

export function requireRole(role: "admin") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.role !== role) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export type AdminPermission = "shop" | "jobs" | "inbox" | "editors";

export function requirePermission(...perms: AdminPermission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role === "admin") {
      next();
      return;
    }
    const map: Record<AdminPermission, boolean> = {
      shop: !!req.user.canManageShop,
      jobs: !!req.user.canManageJobs,
      inbox: !!req.user.canViewInbox,
      editors: !!req.user.canManageEditors,
    };
    if (perms.some((p) => map[p])) {
      next();
      return;
    }
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.status(403).json({ error: "Forbidden" });
  };
}
