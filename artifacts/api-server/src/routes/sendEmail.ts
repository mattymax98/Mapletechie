import { Router } from "express";
import { adminAuth, requirePermission } from "../middlewares/adminAuth";
import { sendEmail, escapeHtml, SITE_URL } from "../lib/email";
import { writeAuditLog } from "../lib/audit";
import { emailSendLimiter } from "../middlewares/rateLimit";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAPLETECHIE_EMAIL_RE = /@mapletechie\.com$/i;

function parseRecipients(raw: unknown): { ok: true; emails: string[] } | { ok: false; error: string } {
  if (!raw) return { ok: true, emails: [] };
  if (typeof raw !== "string") return { ok: false, error: "Recipients must be a comma-separated string." };
  const parts = raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length > 25) return { ok: false, error: "Maximum 25 recipients per message." };
  for (const e of parts) {
    if (!EMAIL_RE.test(e)) return { ok: false, error: `Invalid email address: ${e}` };
  }
  return { ok: true, emails: parts };
}

function composedHtml(args: { message: string; senderName: string }): string {
  const safeMsg = escapeHtml(args.message).replace(/\n/g, "<br />");
  return `<!doctype html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">
    <div style="height:6px;background:#f97316;"></div>
    <div style="padding:32px 32px 8px 32px;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#111;letter-spacing:-0.01em;">
        Maple<span style="color:#f97316;font-style:italic;">techies</span>
      </div>
    </div>
    <div style="padding:8px 32px 32px 32px;font-size:15px;line-height:1.6;color:#222;">
      <div style="margin:16px 0;">${safeMsg}</div>
      <p style="margin:24px 0 4px 0;">Best,</p>
      <p style="margin:0;font-weight:600;">${escapeHtml(args.senderName)}</p>
      <p style="margin:0;color:#666;font-size:13px;">Mapletechies</p>
    </div>
    <div style="border-top:1px solid #eee;padding:16px 32px;font-size:12px;color:#888;">
      <a href="${SITE_URL}" style="color:#f97316;text-decoration:none;">mapletechie.com</a>
    </div>
  </div>
</body></html>`;
}

function composedText(args: { message: string; senderName: string }): string {
  return `${args.message}

Best,
${args.senderName}
Mapletechies
${SITE_URL}
`;
}

router.post(
  "/admin/send-email",
  adminAuth,
  requirePermission("email"),
  emailSendLimiter,
  async (req, res): Promise<void> => {
    const senderEmail = (req.user?.email || "").trim();
    const senderName = req.user?.displayName || req.user?.username || "Mapletechies";

    if (!senderEmail || !MAPLETECHIE_EMAIL_RE.test(senderEmail)) {
      res.status(400).json({
        error: "No sender address configured",
        message:
          "Your editor profile needs an @mapletechie.com email address before you can send mail. Ask the founding admin to set one in Manage Editors.",
      });
      return;
    }

    const toResult = parseRecipients(req.body?.to);
    if (!toResult.ok) {
      res.status(400).json({ error: "Invalid recipients", message: toResult.error });
      return;
    }
    if (toResult.emails.length === 0) {
      res.status(400).json({ error: "Missing recipients", message: "Add at least one email address in the To field." });
      return;
    }

    const ccResult = parseRecipients(req.body?.cc);
    if (!ccResult.ok) {
      res.status(400).json({ error: "Invalid CC", message: ccResult.error });
      return;
    }
    const bccResult = parseRecipients(req.body?.bcc);
    if (!bccResult.ok) {
      res.status(400).json({ error: "Invalid BCC", message: bccResult.error });
      return;
    }

    const subject = String(req.body?.subject || "").trim();
    const message = String(req.body?.message || "").trim();
    if (!subject || subject.length > 200) {
      res.status(400).json({ error: "Invalid subject", message: "Subject is required and must be at most 200 characters." });
      return;
    }
    if (!message || message.length > 20000) {
      res.status(400).json({ error: "Invalid message", message: "Message is required and must be at most 20,000 characters." });
      return;
    }

    if (!process.env["RESEND_API_KEY"]) {
      res.status(503).json({
        error: "Email service not configured",
        message: "RESEND_API_KEY is missing on the server. Add it in Secrets, then try again.",
      });
      return;
    }

    const safeDisplay = senderName.replace(/[<>"\r\n,]/g, " ").trim() || "Mapletechies";
    const fromAddress = `${safeDisplay} <${senderEmail}>`;

    try {
      await sendEmail({
        from: fromAddress,
        replyTo: senderEmail,
        to: toResult.emails,
        subject,
        html: composedHtml({ message, senderName: safeDisplay }),
        text: composedText({ message, senderName: safeDisplay }),
        // CC/BCC support: Resend accepts these as top-level arrays. We pass them
        // via headers since the SendEmailInput shape doesn't expose them yet —
        // the helper just passes `headers` straight through to Resend.
        ...(ccResult.emails.length || bccResult.emails.length
          ? {
              headers: {
                ...(ccResult.emails.length ? { Cc: ccResult.emails.join(", ") } : {}),
                ...(bccResult.emails.length ? { Bcc: bccResult.emails.join(", ") } : {}),
              },
            }
          : {}),
      });
    } catch (err: any) {
      req.log.error({ err: err?.message || String(err), from: fromAddress }, "Failed to send composed email");
      res.status(502).json({
        error: "Email send failed",
        message: err?.message || "Resend rejected the message.",
      });
      return;
    }

    const PREVIEW_LEN = 200;
    const messagePreview =
      message.length > PREVIEW_LEN ? `${message.slice(0, PREVIEW_LEN)}…` : message;
    const allRecipients = [...toResult.emails, ...ccResult.emails, ...bccResult.emails];

    await writeAuditLog(req, {
      action: "email.sent",
      summary: `${senderName} sent "${subject}" to ${allRecipients.length} recipient${allRecipients.length === 1 ? "" : "s"}`,
      details: {
        from: fromAddress,
        to: toResult.emails,
        cc: ccResult.emails,
        bcc: bccResult.emails,
        subject,
        messagePreview,
        messageLength: message.length,
      },
    });

    res.json({
      success: true,
      message: `Sent to ${allRecipients.length} recipient${allRecipients.length === 1 ? "" : "s"}.`,
      from: fromAddress,
    });
  },
);

export default router;
