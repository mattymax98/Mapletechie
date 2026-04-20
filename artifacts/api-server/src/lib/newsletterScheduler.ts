import { db, subscribersTable, newsletterSendsTable, postsTable, usersTable } from "@workspace/db";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { sendEmail, SITE_URL } from "./email";
import { digestEmailHtml } from "./newsletterTemplates";
import { logger } from "./logger";

const SEND_DAY = 5;
const SEND_HOUR = 17;
const TIMEZONE = "America/Toronto";

function nowInTz(date: Date = new Date()): { day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const wd = parts.find((p) => p.type === "weekday")?.value || "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: map[wd] ?? -1, hour, minute };
}

function weekLabel(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TIMEZONE });
  return `${fmt(start)} – ${fmt(end)}`;
}

async function getEditorNote(): Promise<string> {
  const [admin] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.isActive, true), eq(usersTable.role, "admin")))
    .orderBy(usersTable.id)
    .limit(1);
  if (!admin) return "";
  return `This week's reading list — opinion, reviews, and the context the spec sheets leave out. — ${admin.displayName}`;
}

export async function runWeeklyDigest(opts: { force?: boolean } = {}): Promise<{
  sent: number;
  skipped: number;
  postCount: number;
}> {
  const now = new Date();

  const [lastSend] = await db
    .select()
    .from(newsletterSendsTable)
    .orderBy(desc(newsletterSendsTable.sentAt))
    .limit(1);

  if (!opts.force && lastSend) {
    const ageHours = (now.getTime() - new Date(lastSend.sentAt).getTime()) / (1000 * 60 * 60);
    if (ageHours < 24) {
      logger.info({ ageHours }, "Skipping digest — last send <24h ago");
      return { sent: 0, skipped: 0, postCount: 0 };
    }
  }

  const windowEnd = now;
  const windowStart = new Date(windowEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fallbackStart = lastSend ? new Date(lastSend.windowEnd) : windowStart;
  const effectiveStart = fallbackStart < windowStart ? fallbackStart : windowStart;

  const recentPosts = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.status, "published"), gte(postsTable.publishedAt, effectiveStart)))
    .orderBy(desc(postsTable.publishedAt));

  if (recentPosts.length === 0) {
    logger.info("No new posts this week — skipping digest send");
    return { sent: 0, skipped: 0, postCount: 0 };
  }

  const subs = await db
    .select()
    .from(subscribersTable)
    .where(eq(subscribersTable.status, "active"));

  if (subs.length === 0) {
    logger.info("No active subscribers — skipping digest send");
    return { sent: 0, skipped: 0, postCount: recentPosts.length };
  }

  const editorNote = await getEditorNote();
  const label = weekLabel(effectiveStart, windowEnd);
  const subject = `The Mapletechies Weekly · ${label}`;

  let sent = 0;
  let skipped = 0;
  const sentIds: number[] = [];

  for (const sub of subs) {
    let postsForThisSub = recentPosts;
    if (sub.lastSentAt) {
      const cutoff = new Date(sub.lastSentAt);
      postsForThisSub = recentPosts.filter((p) => new Date(p.publishedAt) > cutoff);
    }
    if (postsForThisSub.length === 0) {
      skipped++;
      continue;
    }

    const unsubUrl = `${SITE_URL}/api/newsletter/unsubscribe?token=${sub.unsubToken}`;
    const html = digestEmailHtml({
      posts: postsForThisSub,
      editorNote,
      unsubUrl,
      weekLabel: label,
    });

    try {
      await sendEmail({
        to: sub.email,
        subject,
        html,
        text: postsForThisSub.map((p) => `${p.title}\n${SITE_URL}/blog/${p.slug}\n`).join("\n"),
        headers: { "List-Unsubscribe": `<${unsubUrl}>` },
      });
      sent++;
      sentIds.push(sub.id);
    } catch (err) {
      logger.error({ err, email: sub.email }, "Digest send failed");
    }
  }

  if (sentIds.length > 0) {
    await db
      .update(subscribersTable)
      .set({ lastSentAt: now })
      .where(inArray(subscribersTable.id, sentIds));
  }

  await db.insert(newsletterSendsTable).values({
    windowStart: effectiveStart,
    windowEnd,
    subject,
    postIds: recentPosts.map((p) => p.id).join(","),
    recipientCount: sent,
  });

  logger.info({ sent, skipped, postCount: recentPosts.length }, "Weekly digest complete");
  return { sent, skipped, postCount: recentPosts.length };
}

export async function sendTestDigest(toEmail: string): Promise<{ postCount: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentPosts = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.status, "published"), gte(postsTable.publishedAt, windowStart)))
    .orderBy(desc(postsTable.publishedAt));

  const editorNote = await getEditorNote();
  const label = weekLabel(windowStart, now);
  const fallbackPosts =
    recentPosts.length > 0
      ? recentPosts
      : await db.select().from(postsTable).where(eq(postsTable.status, "published")).orderBy(desc(postsTable.publishedAt)).limit(3);

  const html = digestEmailHtml({
    posts: fallbackPosts,
    editorNote,
    unsubUrl: `${SITE_URL}/api/newsletter/unsubscribe?token=test`,
    weekLabel: label,
  });

  await sendEmail({
    to: toEmail,
    subject: `[TEST] The Mapletechies Weekly · ${label}`,
    html,
    text: fallbackPosts.map((p) => `${p.title} — ${SITE_URL}/blog/${p.slug}`).join("\n"),
  });
  return { postCount: fallbackPosts.length };
}

let started = false;

export function startNewsletterScheduler(): void {
  if (started) return;
  started = true;
  let lastTriggeredKey = "";

  setInterval(() => {
    const { day, hour, minute } = nowInTz();
    if (day !== SEND_DAY || hour !== SEND_HOUR || minute !== 0) return;
    const key = `${new Date().toISOString().slice(0, 10)}-${hour}`;
    if (key === lastTriggeredKey) return;
    lastTriggeredKey = key;
    logger.info({ day, hour }, "Triggering scheduled weekly digest");
    runWeeklyDigest().catch((err) => logger.error({ err }, "Scheduled digest failed"));
  }, 60 * 1000);

  logger.info(
    { day: SEND_DAY, hour: SEND_HOUR, tz: TIMEZONE },
    "Newsletter scheduler started",
  );
}
