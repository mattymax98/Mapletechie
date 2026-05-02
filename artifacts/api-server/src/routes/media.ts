import { Router } from "express";
import { db, mediaTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { adminAuth } from "../middlewares/adminAuth";
import { writeAuditLog } from "../lib/audit";

/**
 * Media library. The actual files live in object storage; this table is just
 * a searchable index of "things an editor uploaded for reuse". Editors call
 * /storage/uploads/request-url to get a presigned URL, PUT the bytes there,
 * then POST the resulting public URL here so it shows up in the picker.
 */
const router = Router();

router.get("/admin/media", adminAuth, async (_req, res): Promise<void> => {
  const items = await db.select().from(mediaTable).orderBy(desc(mediaTable.createdAt)).limit(500);
  res.json(items);
});

router.post("/admin/media", adminAuth, async (req, res): Promise<void> => {
  const user = req.user;
  const { url, filename, mimeType, size, alt } = req.body ?? {};
  if (typeof url !== "string" || !url.trim()) {
    res.status(400).json({ error: "url is required" });
    return;
  }
  if (typeof filename !== "string" || !filename.trim()) {
    res.status(400).json({ error: "filename is required" });
    return;
  }

  const [item] = await db
    .insert(mediaTable)
    .values({
      url: url.trim(),
      filename: filename.trim().slice(0, 255),
      mimeType: typeof mimeType === "string" ? mimeType.slice(0, 120) : null,
      size: typeof size === "number" && Number.isFinite(size) ? Math.round(size) : null,
      alt: typeof alt === "string" ? alt.trim().slice(0, 500) : null,
      uploaderId: user?.id ?? null,
      uploaderName: user?.displayName ?? null,
    })
    .returning();

  await writeAuditLog(req, {
    action: "media.create",
    entityType: "media",
    entityId: item.id,
    summary: `Added ${item.filename} to media library`,
  });

  res.status(201).json(item);
});

router.delete("/admin/media/:id", adminAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const user = req.user;
  const [existing] = await db.select().from(mediaTable).where(eq(mediaTable.id, id));
  if (!existing) {
    res.status(204).end();
    return;
  }
  // Editors can only delete their own uploads; admins can delete anything.
  if (user && user.role !== "admin" && existing.uploaderId !== user.id) {
    res.status(403).json({ error: "You can only delete your own uploads." });
    return;
  }

  await db.delete(mediaTable).where(eq(mediaTable.id, id));
  await writeAuditLog(req, {
    action: "media.delete",
    entityType: "media",
    entityId: id,
    summary: `Removed ${existing.filename} from media library`,
  });
  res.status(204).end();
});

export default router;
