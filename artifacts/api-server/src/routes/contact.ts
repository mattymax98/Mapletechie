import { Router } from "express";
import { db, contactsTable } from "@workspace/db";
import { SubmitContactBody } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";
import { adminAuth, requirePermission } from "../middlewares/adminAuth";
import { contactLimiter } from "../middlewares/rateLimit";
import { getSiteSettings } from "../lib/siteSettings";
import { sendEmail, escapeHtml } from "../lib/email";
import { logger } from "../lib/logger";

const DEFAULT_NOTIFY = "matthew@mapletechie.com";
const SYSTEM_FROM = "Mapletechie <noreply@mapletechie.com>";

const router = Router();

router.post("/contact", contactLimiter, async (req, res): Promise<void> => {
  const parsed = SubmitContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.message });
    return;
  }
  await db.insert(contactsTable).values(parsed.data);
  res.json({ success: true, message: "Thank you! We'll be in touch soon." });

  // Fire-and-forget: send a notification email to the configured address.
  // Any failure here must never affect the already-sent 200 response.
  try {
    const settings = await getSiteSettings();
    const notifyTo = settings.notificationEmail ?? DEFAULT_NOTIFY;
    const { name, email, subject, message } = parsed.data as {
      name: string;
      email: string;
      subject: string;
      message: string;
    };
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
    await sendEmail({
      to: notifyTo,
      from: SYSTEM_FROM,
      replyTo: email,
      subject: `[Contact] ${subject}`,
      html: `
        <p style="font-family:sans-serif;color:#1a1a1a">
          You have a new contact form submission on <strong>Mapletechie</strong>.
        </p>
        <table style="font-family:sans-serif;border-collapse:collapse;width:100%;max-width:560px">
          <tr><td style="padding:6px 0;color:#666;width:110px">From</td>
              <td style="padding:6px 0"><strong>${safeName}</strong> &lt;${safeEmail}&gt;</td></tr>
          <tr><td style="padding:6px 0;color:#666">Subject</td>
              <td style="padding:6px 0">${safeSubject}</td></tr>
        </table>
        <hr style="margin:16px 0;border:none;border-top:1px solid #eee">
        <p style="font-family:sans-serif;color:#1a1a1a;white-space:pre-wrap">${safeMessage}</p>
        <hr style="margin:16px 0;border:none;border-top:1px solid #eee">
        <p style="font-family:sans-serif;font-size:12px;color:#999">
          Hit reply to respond directly to ${safeName} — the reply-to is set to their address.
        </p>
      `,
      text: `New contact form submission\n\nFrom: ${name} <${email}>\nSubject: ${subject}\n\n${message}`,
    });
  } catch (err) {
    logger.warn({ err }, "Contact notification email failed (submission still saved)");
  }
});

router.get("/admin/contacts", adminAuth, requirePermission("inbox"), async (_req, res): Promise<void> => {
  const items = await db.select().from(contactsTable).orderBy(desc(contactsTable.createdAt));
  res.json(items);
});

router.delete("/admin/contacts/:id", adminAuth, requirePermission("inbox"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(contactsTable).where(eq(contactsTable.id, id));
  res.status(204).end();
});

export default router;
