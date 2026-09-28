import type { Request } from "express";
import { db, auditLogsTable } from "@workspace/db";

function getClientIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0]!.trim();
  if (Array.isArray(xff) && xff.length > 0) return xff[0]!.split(",")[0]!.trim();
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

export interface AuditLogInput {
  action: string;
  entityType?: string | null;
  entityId?: string | number | null;
  summary?: string | null;
  details?: Record<string, unknown> | null;
}

export async function writeAuditLog(req: Request, input: AuditLogInput): Promise<void> {
  try {
    const u = req.user;
    await db.insert(auditLogsTable).values({
      userId: u?.id ?? null,
      username: u?.username ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId == null ? null : String(input.entityId),
      summary: input.summary ?? null,
      details: (input.details as never) ?? null,
      ip: getClientIp(req),
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
    });
  } catch (err) {
    // Never let logging break the actual request.
    // eslint-disable-next-line no-console
    console.error("[audit] failed to write log", err);
  }
}

export async function writeAuditLogForUser(
  req: Request,
  user: { id: number; username: string } | null,
  input: AuditLogInput,
): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      userId: user?.id ?? null,
      username: user?.username ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId == null ? null : String(input.entityId),
      summary: input.summary ?? null,
      details: (input.details as never) ?? null,
      ip: getClientIp(req),
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[audit] failed to write log", err);
  }
}
