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
  });
});

/** Admin: read the full settings row + effective state (incl. env override). */
router.get("/admin/settings", adminAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  const [row, state] = await Promise.all([getSiteSettings(), getMaintenanceState()]);
  res.json({
    maintenanceMode: row.maintenanceMode,
    maintenanceMessage: row.maintenanceMessage,
    maintenanceEta: row.maintenanceEta,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
    envForced: state.envForced,
    effectiveMaintenance: state.active,
  });
});

/** Admin: update maintenance settings. Audit-logged. */
router.put("/admin/settings", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const { maintenanceMode, maintenanceMessage, maintenanceEta } = body;

  if (maintenanceMode !== undefined && typeof maintenanceMode !== "boolean") {
    res.status(400).json({ error: "maintenanceMode must be a boolean" });
    return;
  }

  const row = await updateSiteSettings({
    maintenanceMode,
    maintenanceMessage,
    maintenanceEta,
    updatedBy: req.user?.username ?? null,
  });

  const state = await getMaintenanceState();

  await writeAuditLog(req, {
    action: "settings.update",
    entityType: "site_settings",
    entityId: row.id,
    summary: `Maintenance mode ${row.maintenanceMode ? "enabled" : "disabled"}`,
    details: {
      maintenanceMode: row.maintenanceMode,
      maintenanceMessage: row.maintenanceMessage,
      maintenanceEta: row.maintenanceEta,
    },
  });

  res.json({
    maintenanceMode: row.maintenanceMode,
    maintenanceMessage: row.maintenanceMessage,
    maintenanceEta: row.maintenanceEta,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
    envForced: state.envForced,
    effectiveMaintenance: state.active,
  });
});

export default router;
