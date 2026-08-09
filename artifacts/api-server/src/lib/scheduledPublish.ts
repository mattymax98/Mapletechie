import { db, postsTable, categoriesTable, postCategoriesTable } from "@workspace/db";
import { and, eq, inArray, lte, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
import { submitToIndexNow, buildPostUrls } from "./indexNow";

const POLL_MS = 60 * 1000;
let started = false;

/**
 * Promote any post whose `scheduledFor` time has arrived to "published".
 * Runs once a minute. The same flag (status='scheduled') is what keeps the
 * post invisible from the public site until the cron flips it.
 *
 * After publishing, pings IndexNow so Bing picks up newly-public articles
 * immediately rather than waiting for the next crawl cycle.
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

    // Batch-fetch all category memberships for the newly-published posts so we
    // can include every category page (not just the primary) in the IndexNow
    // submission. One query covers all posts in this tick.
    const postIds = due.map((p) => p.id);
    const memberships = await db
      .select({
        postId: postCategoriesTable.postId,
        categorySlug: categoriesTable.slug,
      })
      .from(postCategoriesTable)
      .innerJoin(categoriesTable, eq(postCategoriesTable.categoryId, categoriesTable.id))
      .where(inArray(postCategoriesTable.postId, postIds));

    // Build postId → categorySlugs map.
    const slugsByPost = new Map<number, string[]>();
    for (const row of memberships) {
      const list = slugsByPost.get(row.postId) ?? [];
      list.push(row.categorySlug);
      slugsByPost.set(row.postId, list);
    }

    // Collect all URLs across all newly-published posts, then submit once.
    const urlSet = new Set<string>();
    for (const post of due) {
      for (const url of buildPostUrls({
        slug: post.slug,
        categorySlugs: slugsByPost.get(post.id) ?? [],
      })) {
        urlSet.add(url);
      }
    }

    if (urlSet.size > 0) {
      void submitToIndexNow([...urlSet]);
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
