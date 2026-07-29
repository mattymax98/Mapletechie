import { Router } from "express";
import { db, subscribersTable, postsTable, categoriesTable } from "@workspace/db";
import { eq, desc, and, gte, inArray, getTableColumns } from "drizzle-orm";
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
import { runEditorWeeklyDigestNow } from "../lib/editorWeeklyDigest";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function weekLabel(date: Date = new Date()): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Fetch a specific set of posts by ID, preserving the caller's order. */
async function fetchPostsByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ ...getTableColumns(postsTable), category: categoriesTable.name })
    .from(postsTable)
    .innerJoin(categoriesTable, eq(postsTable.categoryId, categoriesTable.id))
    .where(inArray(postsTable.id, ids));
  // Re-sort to match the caller-supplied order.
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
}

/** Return published posts from the last N days — used for the picker candidates list. */
async function fetchRecentPosts(daysBack = 30) {
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
 * Return published posts from the last 30 days for the newsletter article
 * picker. The admin UI displays these as a checklist; the admin selects which
 * ones to include before sending.
 */
router.get(
  "/admin/newsletter/posts",
  adminAuth,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    const posts = await fetchRecentPosts(30);
    res.json(
      posts.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        category: p.category,
        publishedAt: p.publishedAt,
      })),
    );
  },
);

/**
 * Send a test of the editor-composed digest to a single recipient.
 * Body: { to, subject, editorNote, postIds?: number[] }
 * When postIds is provided, only those posts are included.
 * When postIds is omitted or empty, the email contains only the editor's note.
 */
router.post(
  "/admin/newsletter/test",
  adminAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const to = String(req.body?.to || req.body?.email || "").trim().toLowerCase();
    const subject = String(req.body?.subject || "").trim();
    const editorNote = String(req.body?.editorNote || "").trim();
    const rawIds = req.body?.postIds;
    const postIds: number[] = Array.isArray(rawIds)
      ? rawIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [];

    if (!EMAIL_RE.test(to)) {
      res.status(400).json({ success: false, message: "Provide a valid test recipient email." });
      return;
    }
    if (!subject) {
      res.status(400).json({ success: false, message: "Subject is required." });
      return;
    }
    try {
      const posts = await fetchPostsByIds(postIds);
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
        text:
          editorNote +
          (posts.length
            ? `\n\nThis issue:\n${posts.map((p) => `• ${p.title} — ${SITE_URL}/blog/${p.slug}`).join("\n")}`
            : ""),
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
 * Send the editor-composed digest to every active subscriber.
 * Body: { subject, editorNote, postIds?: number[] }
 * Only the articles whose IDs appear in postIds are included; empty = note only.
 */
router.post(
  "/admin/newsletter/send-now",
  adminAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const subject = String(req.body?.subject || "").trim();
    const editorNote = String(req.body?.editorNote || "").trim();
    const rawIds = req.body?.postIds;
    const postIds: number[] = Array.isArray(rawIds)
      ? rawIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [];

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

      const posts = await fetchPostsByIds(postIds);
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
            text:
              editorNote +
              (posts.length
                ? `\n\nThis issue:\n${posts.map((p) => `• ${p.title} — ${SITE_URL}/blog/${p.slug}`).join("\n")}`
                : "") +
              `\n\nUnsubscribe: ${unsubUrl}`,
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

/**
 * Manually trigger the internal editor weekly digest. No auto-schedule —
 * fires only when an admin clicks the button in the newsletter admin page.
 */
router.post(
  "/admin/newsletter/send-editor-digest",
  adminAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    try {
      await runEditorWeeklyDigestNow();
      await writeAuditLog(req, {
        action: "newsletter.editor_digest",
        summary: "Manually triggered editor weekly digest",
      });
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Manual editor digest failed");
      const msg = err instanceof Error ? err.message : "Send failed";
      res.status(500).json({ success: false, message: msg });
    }
  },
);

export default router;
