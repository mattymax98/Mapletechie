import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapAdmin } from "./lib/auth";
import { startScheduledPublishCron } from "./lib/scheduledPublish";
import { seedCuratedCategories } from "./lib/seedCategories";
import { auditPostCoverImages } from "./lib/coverImageValidation";
import { seedSiteSettings } from "./lib/siteSettings";
import { backfillPostCategories } from "./lib/postCategoryHelpers";

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

// Log key env-var presence at startup so Railway deploy logs confirm what
// the runtime actually received (values are never logged, only presence).
logger.info({
  resendConfigured: Boolean(process.env["RESEND_API_KEY"]),
  siteDomain: process.env["SITE_DOMAIN"] ?? "(not set — using fallback)",
}, "Startup env check");

// Bootstrap is fatal: seedCuratedCategories() asserts the posts.category_id
// FK is installed before any route can run. If it fails we MUST crash so a
// process supervisor restarts us instead of serving with a broken schema.
bootstrapAdmin()
  .then(() => seedCuratedCategories())
  .then(() => seedSiteSettings())
  // Self-heals a freshly-migrated DB: every post gets a primary row in
  // post_categories matching its posts.category_id.
  .then(() => backfillPostCategories())
  .then(() => auditPostCoverImages())
  .catch((err) => {
    logger.error({ err }, "Bootstrap failed — exiting");
    process.exit(1);
  });

// Promote any post whose `scheduledFor` time has arrived to "published".
startScheduledPublishCron();


app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
