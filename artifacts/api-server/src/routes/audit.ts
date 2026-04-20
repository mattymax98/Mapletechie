import { Router } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { adminAuth, requireRole } from "../middlewares/adminAuth";

const router = Router();

router.get("/admin/audit-logs", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const rows = await db
    .select()
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);
  res.json(rows);
});

export default router;
