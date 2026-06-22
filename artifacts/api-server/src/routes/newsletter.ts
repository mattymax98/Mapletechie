import { Router } from "express";
import { db, subscribersTable, postsTable, categoriesTable } from "@workspace/db";
import { eq, desc, and, gte, getTableColumns } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { sendEmail, SITE_URL } from "../lib/email";
import {
  confirmEmailHtml,
  welcomeEmailHtml,
  digestEmailHtml,
} from "../lib/newsletterTemplates";
import { adminAuth, requireRole } from "../middlewares/adminAuth";
import { writeAuditLog } from "../lib/audit";
import { logger } from "../lib/logger";
import { newsletterLimiter } from "../middlewares/rateLimit";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function weekLabel(date: Date = new Date()): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

async function fetchWeekPosts(daysBack = 7) {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  return db
    .select({ ...getTableColumns(postsTable), category: categoriesTable.name })
    .from(postsTable)
    .innerJoin(categoriesTable, eq(postsTable.categoryId, categoriesTable.id))
    .where(and(eq(postsTable.status, "published"), gte(postsTable.publishedAt, since)))
    .orderBy(desc(postsTable.publishedAt));
}

router.post("/newsletter/subscribe", newsletterLimiter, async (req, res): Promise<void> => {
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
      subject: "Confirm your Mapletechie subscription",
      html: confirmEmailHtml(confirmUrl),
      text: `Confirm your Mapletechie subscription:\n\n${confirmUrl}\n\nIf you didn't sign up, ignore this email.`,
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
        subject: "You're in — welcome to Mapletechie",
        html: welcomeEmailHtml(unsubUrl),
        text: `Welcome to the Mapletechie weekly. Unsubscribe any time: ${unsubUrl}`,
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

/**
 * Preview the posts that the newsletter compose page will append. Used by
 * the admin UI to show "this week's recap" before sending.
 */
router.get(
  "/admin/newsletter/preview",
  adminAuth,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    const posts = await fetchWeekPosts(7);
    res.json({ weekLabel: weekLabel(), posts });
  },
);

/**
 * Send a test of the editor-composed digest to a single recipient. Body must
 * contain { to, subject, editorNote } so the test exactly matches what the
 * real send would produce.
 */
router.post(
  "/admin/newsletter/test",
  adminAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const to = String(req.body?.to || req.body?.email || "").trim().toLowerCase();
    const subject = String(req.body?.subject || "").trim();
    const editorNote = String(req.body?.editorNote || "").trim();
    if (!EMAIL_RE.test(to)) {
      res.status(400).json({ success: false, message: "Provide a valid test recipient email." });
      return;
    }
    if (!subject) {
      res.status(400).json({ success: false, message: "Subject is required." });
      return;
    }
    try {
      const posts = await fetchWeekPosts(7);
      const html = digestEmailHtml({
        posts,
        editorNote,
        unsubUrl: `${SITE_URL}/api/newsletter/unsubscribe?token=preview`,
        weekLabel: weekLabel(),
      });
      await sendEmail({
        to,
        subject: `[TEST] ${subject}`,
        html,
        text: `${editorNote}\n\nThis week:\n${posts.map((p) => `• ${p.title} — ${SITE_URL}/blog/${p.slug}`).join("\n")}`,
      });
      res.json({ success: true, posts: posts.length });
    } catch (err) {
      logger.error({ err }, "Test digest failed");
      const msg = err instanceof Error ? err.message : "Send failed";
      res.status(500).json({ success: false, message: msg });
    }
  },
);

/**
 * Editor-composed digest: takes a hand-written subject + editor note from the
 * admin panel, appends the past week's published posts, and emails every
 * confirmed subscriber. There is no scheduler — sends only happen when an
 * admin explicitly clicks "Send now".
 */
router.post(
  "/admin/newsletter/send-now",
  adminAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const subject = String(req.body?.subject || "").trim();
    const editorNote = String(req.body?.editorNote || "").trim();
    if (!subject) {
      res.status(400).json({ success: false, message: "Subject is required." });
      return;
    }

    try {
      const subs = await db
        .select()
        .from(subscribersTable)
        .where(eq(subscribersTable.status, "active"));
      if (subs.length === 0) {
        res.json({ success: true, sent: 0, failed: 0, posts: 0, message: "No active subscribers." });
        return;
      }

      const posts = await fetchWeekPosts(7);
      const label = weekLabel();
      let sent = 0;
      let failed = 0;
      const failedEmails: string[] = [];

      for (const s of subs) {
        const unsubUrl = `${SITE_URL}/api/newsletter/unsubscribe?token=${s.unsubToken}`;
        const html = digestEmailHtml({ posts, editorNote, unsubUrl, weekLabel: label });
        try {
          await sendEmail({
            to: s.email,
            subject,
            html,
            text: `${editorNote}\n\nThis week:\n${posts.map((p) => `• ${p.title} — ${SITE_URL}/blog/${p.slug}`).join("\n")}\n\nUnsubscribe: ${unsubUrl}`,
          });
          await db
            .update(subscribersTable)
            .set({ lastSentAt: new Date() })
            .where(eq(subscribersTable.id, s.id));
          sent++;
        } catch (err) {
          failed++;
          failedEmails.push(s.email);
          logger.error({ err, email: s.email }, "Newsletter send failed for subscriber");
        }
      }

      await writeAuditLog(req, {
        action: "newsletter.send",
        summary: `Sent editor digest "${subject}" to ${sent} subscribers (${failed} failed, ${posts.length} posts)`,
      });

      res.json({ success: true, sent, failed, posts: posts.length, failedEmails: failedEmails.slice(0, 20) });
    } catch (err) {
      logger.error({ err }, "Send-now digest failed");
      const msg = err instanceof Error ? err.message : "Send failed";
      res.status(500).json({ success: false, message: msg });
    }
  },
);

export default router;
