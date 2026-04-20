import { SITE_URL, escapeHtml } from "./email";
import type { Post } from "@workspace/db";

const BRAND = "Mapletechies";
const ORANGE = "#f97316";

function shell(inner: string, footer: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e5e5;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#171717;border:1px solid #27272a;">
<tr><td style="padding:28px 32px;border-bottom:1px solid #27272a;">
<a href="${SITE_URL}" style="text-decoration:none;color:${ORANGE};font-weight:900;font-size:22px;letter-spacing:-0.02em;">MAPLE<span style="color:#fafafa;">TECHIES</span></a>
</td></tr>
${inner}
<tr><td style="padding:24px 32px;border-top:1px solid #27272a;font-size:12px;color:#71717a;line-height:1.6;">
${footer}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function confirmEmailHtml(confirmUrl: string): string {
  const inner = `<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:24px;color:#fafafa;font-weight:800;">Confirm your subscription</h1>
<p style="margin:0 0 16px;line-height:1.6;color:#d4d4d8;">Thanks for signing up for the ${BRAND} weekly newsletter. Click the button below to confirm your email address — after that, you'll start getting the Friday recap of everything we published that week.</p>
<p style="margin:24px 0;"><a href="${confirmUrl}" style="display:inline-block;background:${ORANGE};color:#0a0a0a;padding:14px 28px;text-decoration:none;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;font-size:14px;">Confirm subscription</a></p>
<p style="margin:0;line-height:1.6;color:#71717a;font-size:13px;">Or paste this link into your browser:<br><a href="${confirmUrl}" style="color:${ORANGE};word-break:break-all;">${confirmUrl}</a></p>
</td></tr>`;
  const footer = `If you didn't sign up, just ignore this email — you won't be added to the list.`;
  return shell(inner, footer);
}

export function welcomeEmailHtml(unsubUrl: string): string {
  const inner = `<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:24px;color:#fafafa;font-weight:800;">You're in.</h1>
<p style="margin:0 0 16px;line-height:1.6;color:#d4d4d8;">Welcome to the ${BRAND} weekly. Every Friday evening, you'll get a short note from the editor and a recap of every story we published that week — opinionated, plain-spoken coverage of the technology shaping our lives.</p>
<p style="margin:0;line-height:1.6;color:#d4d4d8;">No spam. Unsubscribe any time with one click.</p>
</td></tr>`;
  const footer = `You're receiving this because you confirmed a subscription at ${SITE_URL}. <a href="${unsubUrl}" style="color:#a1a1aa;">Unsubscribe</a>.`;
  return shell(inner, footer);
}

export function digestEmailHtml(args: {
  posts: Post[];
  editorNote: string;
  unsubUrl: string;
  weekLabel: string;
}): string {
  const { posts, editorNote, unsubUrl, weekLabel } = args;
  const editorBlock = editorNote
    ? `<tr><td style="padding:28px 32px 8px;">
<p style="margin:0 0 12px;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:${ORANGE};font-weight:800;">A note from the editor</p>
<p style="margin:0;font-size:16px;line-height:1.65;color:#d4d4d8;">${escapeHtml(editorNote)}</p>
</td></tr>`
    : "";

  const postRows = posts
    .map((p) => {
      const url = `${SITE_URL}/blog/${p.slug}`;
      const cover = p.coverImage
        ? `<a href="${url}" style="display:block;margin-bottom:14px;"><img src="${p.coverImage.startsWith("http") ? p.coverImage : `${SITE_URL}${p.coverImage}`}" alt="" width="536" style="width:100%;max-width:536px;height:auto;display:block;border:1px solid #27272a;"></a>`
        : "";
      return `<tr><td style="padding:24px 32px;border-top:1px solid #27272a;">
${cover}
<p style="margin:0 0 6px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${ORANGE};font-weight:800;">${escapeHtml(p.category)}</p>
<h2 style="margin:0 0 10px;font-size:22px;line-height:1.25;color:#fafafa;font-weight:800;"><a href="${url}" style="color:#fafafa;text-decoration:none;">${escapeHtml(p.title)}</a></h2>
<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#a1a1aa;">${escapeHtml(p.excerpt)}</p>
<p style="margin:0;"><a href="${url}" style="color:${ORANGE};font-weight:700;text-decoration:none;font-size:14px;">Read the article →</a></p>
</td></tr>`;
    })
    .join("");

  const inner = `<tr><td style="padding:28px 32px 0;">
<p style="margin:0;font-size:12px;letter-spacing:0.25em;text-transform:uppercase;color:#71717a;font-weight:700;">The Mapletechies Weekly · ${escapeHtml(weekLabel)}</p>
</td></tr>
${editorBlock}
${postRows}`;

  const footer = `You're getting this because you subscribed at ${SITE_URL}. <a href="${unsubUrl}" style="color:#a1a1aa;">Unsubscribe</a> any time.`;
  return shell(inner, footer);
}
