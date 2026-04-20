import { Router } from "express";
import { db, subscribersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { sendEmail, SITE_URL } from "../lib/email";
import {
  confirmEmailHtml,
  welcomeEmailHtml,
} from "../lib/newsletterTemplates";
import { runWeeklyDigest, sendTestDigest } from "../lib/newsletterScheduler";
import { adminAuth, requireRole } from "../middlewares/adminAuth";
import { logger } from "../lib/logger";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/newsletter/subscribe", async (req, res): Promise<void> => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const source = typeof req.body?.source === "string" ? req.body.source : "footer";
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ success: false, message: "Please enter a valid email." });
    return;
  }

  const [existing] = await db.select().from(subscribersTable).where(eq(subscribersTable.email, email));

  if (existing && existing.status === "active") {
    res.json({ success: true, message: "You're already subscribed — thanks!" });
    return;
  }

  const confirmToken = randomBytes(24).toString("hex");
  const unsubToken = existing?.unsubToken || randomBytes(24).toString("hex");

  if (existing) {
    await db
      .update(subscribersTable)
      .set({
        status: "pending",
        confirmToken,
        unsubscribedAt: null,
        source,
      })
      .where(eq(subscribersTable.id, existing.id));
  } else {
    await db.insert(subscribersTable).values({
      email,
      status: "pending",
      confirmToken,
      unsubToken,
      source,
    });
  }

  const confirmUrl = `${SITE_URL}/api/newsletter/confirm?token=${confirmToken}`;
  try {
    await sendEmail({
      to: email,
      subject: "Confirm your Mapletechies subscription",
      html: confirmEmailHtml(confirmUrl),
      text: `Confirm your Mapletechies subscription:\n\n${confirmUrl}\n\nIf you didn't sign up, ignore this email.`,
    });
  } catch (err) {
    logger.error({ err, email }, "Failed to send confirm email");
  }

  res.json({
    success: true,
    message: "Almost there — check your inbox to confirm your email.",
  });
});

router.get("/newsletter/confirm", async (req, res): Promise<void> => {
  const token = String(req.query["token"] || "");
  if (!token) {
    res.redirect(`${SITE_URL}/?newsletter=invalid`);
    return;
  }
  const [sub] = await db.select().from(subscribersTable).where(eq(subscribersTable.confirmToken, token));
  if (!sub) {
    res.redirect(`${SITE_URL}/?newsletter=invalid`);
    return;
  }
  if (sub.status !== "active") {
    await db
      .update(subscribersTable)
      .set({ status: "active", confirmedAt: new Date() })
      .where(eq(subscribersTable.id, sub.id));
    const unsubUrl = `${SITE_URL}/api/newsletter/unsubscribe?token=${sub.unsubToken}`;
    try {
      await sendEmail({
        to: sub.email,
        subject: "You're in — welcome to Mapletechies",
        html: welcomeEmailHtml(unsubUrl),
        text: `Welcome to the Mapletechies weekly. Unsubscribe any time: ${unsubUrl}`,
      });
    } catch (err) {
      logger.error({ err }, "Failed to send welcome email");
    }
  }
  res.redirect(`${SITE_URL}/?newsletter=confirmed`);
});

router.get("/newsletter/unsubscribe", async (req, res): Promise<void> => {
  const token = String(req.query["token"] || "");
  if (!token) {
    res.redirect(`${SITE_URL}/?newsletter=invalid`);
    return;
  }
  const [sub] = await db.select().from(subscribersTable).where(eq(subscribersTable.unsubToken, token));
  if (!sub) {
    res.redirect(`${SITE_URL}/?newsletter=invalid`);
    return;
  }
  await db
    .update(subscribersTable)
    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(eq(subscribersTable.id, sub.id));
  res.redirect(`${SITE_URL}/?newsletter=unsubscribed`);
});

router.get(
  "/admin/subscribers",
  adminAuth,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    const subs = await db.select().from(subscribersTable).orderBy(desc(subscribersTable.createdAt));
    res.json(
      subs.map((s) => ({
        id: s.id,
        email: s.email,
        status: s.status,
        source: s.source,
        createdAt: s.createdAt,
        confirmedAt: s.confirmedAt,
        unsubscribedAt: s.unsubscribedAt,
        lastSentAt: s.lastSentAt,
      })),
    );
  },
);

router.delete(
  "/admin/subscribers/:id",
  adminAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db.delete(subscribersTable).where(eq(subscribersTable.id, id));
    res.status(204).end();
  },
);

router.post(
  "/admin/newsletter/test",
  adminAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const to = String(req.body?.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(to)) {
      res.status(400).json({ success: false, message: "Provide a valid test email." });
      return;
    }
    try {
      const result = await sendTestDigest(to);
      res.json({ success: true, ...result });
    } catch (err) {
      logger.error({ err }, "Test digest failed");
      const msg = err instanceof Error ? err.message : "Send failed";
      res.status(500).json({ success: false, message: msg });
    }
  },
);

router.post(
  "/admin/newsletter/send-now",
  adminAuth,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    try {
      const result = await runWeeklyDigest({ force: true });
      res.json({ success: true, ...result });
    } catch (err) {
      logger.error({ err }, "Send-now digest failed");
      const msg = err instanceof Error ? err.message : "Send failed";
      res.status(500).json({ success: false, message: msg });
    }
  },
);

export default router;
