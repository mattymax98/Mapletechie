import { db, usersTable } from "@workspace/db";
import { eq, and, ne, inArray } from "drizzle-orm";
import { sendEmail, SITE_URL, escapeHtml } from "./email";
import { logger } from "./logger";
import { BOT_USERNAME } from "../routes/automation";

/**
 * Best-effort email to every active admin/editor when the automation
 * pipeline creates a new AI draft. Failures are logged, never thrown —
 * notification problems must not block draft creation.
 */

function emailHtml(args: { title: string; editLink: string; excerpt: string | null }): string {
  const excerptHtml = args.excerpt
    ? `<p style="margin:0 0 20px;color:#a1a1aa;font-size:14px;line-height:1.6;">${escapeHtml(args.excerpt)}</p>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:32px 16px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e5e5;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background:#171717;border:1px solid #27272a;">
<tr><td style="padding:28px 32px;border-bottom:1px solid #27272a;">
<span style="color:#f97316;font-weight:900;font-size:22px;letter-spacing:-0.02em;">MAPLE<span style="color:#fafafa;">TECHIE</span></span>
<p style="margin:6px 0 0;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:0.2em;font-weight:700;">New AI Draft</p>
</td></tr>
<tr><td style="padding:28px 32px;">
<h1 style="margin:0 0 12px;color:#fafafa;font-size:20px;">${escapeHtml(args.title)}</h1>
${excerptHtml}
<p style="margin:0 0 24px;color:#d4d4d8;line-height:1.6;font-size:15px;">The Mapletechie AI pipeline just submitted a new draft. It won't go live until a human editor reviews and publishes it.</p>
<a href="${args.editLink}" style="display:inline-block;background:#f97316;color:#0a0a0a;font-weight:700;font-size:14px;padding:12px 20px;text-decoration:none;">Review &amp; edit draft</a>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #27272a;color:#71717a;font-size:12px;">
You're getting this because you're an active editor on <a href="${SITE_URL}" style="color:#a1a1aa;">mapletechie.com</a>.
</td></tr>
</table></body></html>`;
}

export async function notifyEditorsOfAutomationDraft(args: {
  postId: number;
  title: string;
  excerpt?: string | null;
  editUrl: string;
}): Promise<void> {
  try {
    const editors = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.isActive, true),
          inArray(usersTable.role, ["admin", "editor"]),
          ne(usersTable.username, BOT_USERNAME),
        ),
      );
    const recipients = editors.filter((u) => !!u.email);
    if (recipients.length === 0) {
      logger.warn({ postId: args.postId }, "automation: no active editors with email to notify about new AI draft");
      return;
    }
    const html = emailHtml({ title: args.title, editLink: args.editUrl, excerpt: args.excerpt ?? null });
    const text = `The Mapletechie AI pipeline submitted a new draft: "${args.title}". Review and edit it at ${args.editUrl}. It won't go live until a human publishes it.`;
    const results = await Promise.allSettled(
      recipients.map((u) =>
        sendEmail({
          to: u.email as string,
          subject: `New AI draft: ${args.title}`,
          html,
          text,
        }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected");
    for (const r of failed) {
      logger.error({ err: (r as PromiseRejectedResult).reason, postId: args.postId }, "automation: draft notification email failed");
    }
    logger.info(
      { postId: args.postId, sent: results.length - failed.length, failed: failed.length },
      "automation: draft notification emails processed",
    );
  } catch (err) {
    // Never let notification issues surface to the automation client.
    logger.error({ err, postId: args.postId }, "automation: draft notification failed");
  }
}
