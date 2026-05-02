import { db, postsTable } from "@workspace/db";
import { and, eq, lte, isNotNull } from "drizzle-orm";
import { logger } from "./logger";

const POLL_MS = 60 * 1000;
let started = false;

/**
 * Promote any post whose `scheduledFor` time has arrived to "published".
 * Runs once a minute. The same flag (status='scheduled') is what keeps the
 * post invisible from the public site until the cron flips it.
 */
async function tick(): Promise<void> {
  try {
    const now = new Date();
    const due = await db
      .select()
      .from(postsTable)
      .where(
        and(
          eq(postsTable.status, "scheduled"),
          isNotNull(postsTable.scheduledFor),
          lte(postsTable.scheduledFor, now),
        ),
      );
    if (due.length === 0) return;

    for (const post of due) {
      await db
        .update(postsTable)
        .set({
          status: "published",
          publishedAt: post.scheduledFor ?? now,
          scheduledFor: null,
        })
        .where(eq(postsTable.id, post.id));
      logger.info({ id: post.id, slug: post.slug }, "Scheduled post auto-published");
    }
  } catch (err) {
    logger.error({ err }, "Scheduled publish tick failed");
  }
}

export function startScheduledPublishCron(): void {
  if (started) return;
  started = true;
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, "tick promise rejected"));
  }, POLL_MS);
  logger.info({ pollMs: POLL_MS }, "Scheduled-publish cron started");
}
