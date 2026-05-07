import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapAdmin } from "./lib/auth";
import { startScheduledPublishCron } from "./lib/scheduledPublish";
import { startEditorWeeklyDigestCron } from "./lib/editorWeeklyDigest";
import { seedCuratedCategories } from "./lib/seedCategories";

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

bootstrapAdmin()
  .then(() => seedCuratedCategories())
  .catch((err) => logger.error({ err }, "Bootstrap admin failed"));

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
