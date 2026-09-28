import { db, usersTable, postsTable } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";
import { sendEmail, SITE_URL, escapeHtml } from "./email";
import { logger } from "./logger";

/**
 * Internal summary emailed to every active admin/editor. Previously fired
 * automatically every Sunday at 8pm Toronto time; the auto-scheduler has
 * been removed (35+ articles/week made it overwhelming). An admin can now
 * trigger this manually from the newsletter admin page.
 */

function emailHtml(args: {
  displayName: string;
  yourPosts: { title: string; slug: string; viewCount: number }[];
  allPostCount: number;
  siteTotalViews: number;
}): string {
  const yourList = args.yourPosts.length
    ? args.yourPosts
        .map(
          (p) =>
            `<li style="margin-bottom:8px;"><a href="${SITE_URL}/blog/${p.slug}" style="color:#f97316;text-decoration:none;font-weight:600;">${escapeHtml(p.title)}</a> <span style="color:#71717a;font-size:12px;">— ${p.viewCount} views</span></li>`,
        )
        .join("")
    : `<li style="color:#a1a1aa;">No posts published this week — a good week to draft something.</li>`;

  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:32px 16px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e5e5;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background:#171717;border:1px solid #27272a;">
<tr><td style="padding:28px 32px;border-bottom:1px solid #27272a;">
<span style="color:#f97316;font-weight:900;font-size:22px;letter-spacing:-0.02em;">MAPLE<span style="color:#fafafa;">TECHIE</span></span>
<p style="margin:6px 0 0;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:0.2em;font-weight:700;">Editor Weekly</p>
</td></tr>
<tr><td style="padding:28px 32px;">
<h1 style="margin:0 0 12px;color:#fafafa;font-size:22px;">Hey ${escapeHtml(args.displayName)},</h1>
<p style="margin:0 0 20px;color:#d4d4d8;line-height:1.6;font-size:15px;">Quick recap of the past 7 days at Mapletechie.</p>
<p style="margin:0 0 8px;color:#71717a;text-transform:uppercase;letter-spacing:0.2em;font-size:11px;font-weight:700;">Your posts this week</p>
<ul style="margin:0 0 24px;padding-left:18px;color:#d4d4d8;font-size:14px;line-height:1.6;">${yourList}</ul>
<p style="margin:0 0 8px;color:#71717a;text-transform:uppercase;letter-spacing:0.2em;font-size:11px;font-weight:700;">Site totals</p>
<p style="margin:0 0 20px;color:#d4d4d8;font-size:14px;line-height:1.6;">${args.allPostCount} new posts published · ${args.siteTotalViews.toLocaleString()} total reads on your work this week</p>
<p style="margin:24px 0 0;color:#a1a1aa;font-size:13px;line-height:1.6;">The reader newsletter doesn't go out automatically — open the <a href="${SITE_URL}/admin/newsletter" style="color:#f97316;text-decoration:none;">admin compose page</a> to write and send this week's digest when you're ready.</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #27272a;color:#71717a;font-size:12px;">
You're getting this because you're an active editor on <a href="${SITE_URL}" style="color:#a1a1aa;">mapletechie.com</a>.
</td></tr>
</table></body></html>`;
}

async function runDigest(): Promise<void> {
  const editors = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.isActive, true));

  if (editors.length === 0) return;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentAll = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.status, "published"), gte(postsTable.publishedAt, since)));

  for (const u of editors) {
    if (!u.email) continue;
    const yours = recentAll.filter((p) => p.authorId === u.id);
    const yourViews = yours.reduce((acc, p) => acc + (p.viewCount || 0), 0);
    try {
      await sendEmail({
        to: u.email,
        subject: `Your week at Mapletechie — ${yours.length} post${yours.length === 1 ? "" : "s"}`,
        html: emailHtml({
          displayName: u.displayName || u.username,
          yourPosts: yours.map((p) => ({ title: p.title, slug: p.slug, viewCount: p.viewCount || 0 })),
          allPostCount: recentAll.length,
          siteTotalViews: yourViews,
        }),
        text: `Hey ${u.displayName}, here's your week at Mapletechie. ${yours.length} of your posts went live, totalling ${yourViews} reads. Open ${SITE_URL}/admin/newsletter to compose this week's reader digest.`,
      });
    } catch (err) {
      logger.error({ err, email: u.email }, "Editor digest send failed");
    }
  }

  logger.info(
    { editorCount: editors.length, recentPosts: recentAll.length },
    "Editor weekly digest complete",
  );
}

/**
 * The auto-scheduler has been intentionally removed. With 35+ articles a
 * week the Sunday digest was overwhelming. Use the manual "Send digest to
 * editors" button in the admin newsletter page instead.
 */

export { runDigest as runEditorWeeklyDigestNow };
