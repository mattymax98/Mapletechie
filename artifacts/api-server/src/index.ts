import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapAdmin } from "./lib/auth";
import { startScheduledPublishCron } from "./lib/scheduledPublish";
import { startEditorWeeklyDigestCron } from "./lib/editorWeeklyDigest";
import { seedCuratedCategories } from "./lib/seedCategories";
import { auditPostCoverImages } from "./lib/coverImageValidation";
import { seedSiteSettings } from "./lib/siteSettings";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Bootstrap is fatal: seedCuratedCategories() asserts the posts.category_id
// FK is installed before any route can run. If it fails we MUST crash so a
// process supervisor restarts us instead of serving with a broken schema.
bootstrapAdmin()
  .then(() => seedCuratedCategories())
  .then(() => seedSiteSettings())
  .then(() => auditPostCoverImages())
  .catch((err) => {
    logger.error({ err }, "Bootstrap failed — exiting");
    process.exit(1);
  });

// Promote any post whose `scheduledFor` time has arrived to "published".
startScheduledPublishCron();

// Sunday 8pm Toronto: email each editor a summary of the week (their posts,
// totals, and a heads-up that the public newsletter compose is open).
startEditorWeeklyDigestCron();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
