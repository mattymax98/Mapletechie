import { Router } from "express";
import { adminAuth, requireRole } from "../middlewares/adminAuth";
import { writeAuditLog } from "../lib/audit";
import {
  getMaintenanceState,
  getSiteSettings,
  updateSiteSettings,
} from "../lib/siteSettings";

const router = Router();

/**
 * Public, always-available status endpoint. The frontend polls this to decide
 * whether to show the maintenance screen. It is intentionally exempt from the
 * maintenance gate so it keeps working while the site is down.
 */
router.get("/settings/status", async (_req, res): Promise<void> => {
  const state = await getMaintenanceState();
  res.json({
    maintenance: state.active,
    message: state.message,
    eta: state.eta,
    startsAt: state.startsAt,
    endsAt: state.endsAt,
    severity: state.severity,
  });
});

function settingsPayload(row: Awaited<ReturnType<typeof getSiteSettings>>, state: { envForced: boolean; active: boolean; startsAt: string | null; endsAt: string | null; severity: string }) {
  return {
    maintenanceMode: row.maintenanceMode,
    maintenanceMessage: row.maintenanceMessage,
    maintenanceEta: row.maintenanceEta,
    maintenanceStartsAt: row.maintenanceStartsAt ? row.maintenanceStartsAt.toISOString() : null,
    maintenanceEndsAt: row.maintenanceEndsAt ? row.maintenanceEndsAt.toISOString() : null,
    maintenanceSeverity: row.maintenanceSeverity ?? "full",
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
    envForced: state.envForced,
    effectiveMaintenance: state.active,
    notificationEmail: row.notificationEmail ?? null,
    newsletterFromName: row.newsletterFromName ?? null,
    newsletterFromAddress: row.newsletterFromAddress ?? null,
    newsletterReplyTo: row.newsletterReplyTo ?? null,
  };
}

/** Admin: read the full settings row + effective state (incl. env override). */
router.get("/admin/settings", adminAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  const [row, state] = await Promise.all([getSiteSettings(), getMaintenanceState()]);
  res.json(settingsPayload(row, state));
});

/** Admin: update settings (maintenance + email). Audit-logged. */
router.put("/admin/settings", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const {
    maintenanceMode,
    maintenanceMessage,
    maintenanceEta,
    maintenanceStartsAt,
    maintenanceEndsAt,
    maintenanceSeverity,
    notificationEmail,
    newsletterFromName,
    newsletterFromAddress,
    newsletterReplyTo,
  } = body;

  if (maintenanceMode !== undefined && typeof maintenanceMode !== "boolean") {
    res.status(400).json({ error: "maintenanceMode must be a boolean" });
    return;
  }

  // Validate @mapletechie.com constraint for the newsletter from address
  if (
    newsletterFromAddress != null &&
    typeof newsletterFromAddress === "string" &&
    newsletterFromAddress.trim() !== "" &&
    !newsletterFromAddress.trim().toLowerCase().endsWith("@mapletechie.com")
  ) {
    res.status(400).json({ error: "newsletterFromAddress must be a @mapletechie.com address" });
    return;
  }

  // Validate that endsAt is after startsAt when both are provided
  if (
    maintenanceStartsAt != null &&
    maintenanceEndsAt != null &&
    typeof maintenanceStartsAt === "string" &&
    typeof maintenanceEndsAt === "string" &&
    maintenanceStartsAt.trim() !== "" &&
    maintenanceEndsAt.trim() !== ""
  ) {
    const start = new Date(maintenanceStartsAt);
    const end = new Date(maintenanceEndsAt);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end <= start) {
      res.status(400).json({ error: "maintenanceEndsAt must be after maintenanceStartsAt" });
      return;
    }
  }

  const row = await updateSiteSettings({
    maintenanceMode,
    maintenanceMessage,
    maintenanceEta,
    maintenanceStartsAt,
    maintenanceEndsAt,
    maintenanceSeverity,
    updatedBy: req.user?.username ?? null,
    notificationEmail,
    newsletterFromName,
    newsletterFromAddress,
    newsletterReplyTo,
  });

  const state = await getMaintenanceState();

  await writeAuditLog(req, {
    action: "settings.update",
    entityType: "site_settings",
    entityId: row.id,
    summary: `Settings updated by ${req.user?.username ?? "admin"}`,
    details: {
      maintenanceMode: row.maintenanceMode,
      maintenanceSeverity: row.maintenanceSeverity,
      notificationEmail: row.notificationEmail,
      newsletterFromAddress: row.newsletterFromAddress,
    },
  });

  res.json(settingsPayload(row, state));
});

export default router;
