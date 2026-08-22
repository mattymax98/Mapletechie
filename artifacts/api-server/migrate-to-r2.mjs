/**
 * migrate-storage-to-r2.mjs
 *
 * Copies every file from legacy object storage (Google Cloud Storage,
 * accessed via the development sidecar) to Cloudflare R2.
 *
 * Run this ONCE before cutting over to Railway:
 *
 *   R2_ACCOUNT_ID=xxx R2_ACCESS_KEY_ID=xxx R2_SECRET_ACCESS_KEY=xxx \
 *     node scripts/migrate-storage-to-r2.mjs
 *
 * The script reads PRIVATE_OBJECT_DIR and PUBLIC_OBJECT_SEARCH_PATHS from
 * the environment to know which GCS buckets/prefixes to copy.
 *
 * On success every file is in R2 under the same /<bucket>/<key> path.
 * Run it again at any time — it skips files that already exist in R2.
 */

import { Storage } from "@google-cloud/storage";
import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

// ─── Config ───────────────────────────────────────────────────────────────────

const SIDECAR = "http://127.0.0.1:1106";

const R2_ACCOUNT_ID     = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID  = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET         = process.env.R2_SECRET_ACCESS_KEY;
// The R2 bucket to write into (GCS bucket name is different).
const R2_BUCKET_NAME    = process.env.R2_BUCKET_NAME ?? "mapletechie";

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET) {
  console.error(
    "❌  Missing R2 credentials.\n" +
    "    Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and re-run.",
  );
  process.exit(1);
}

console.log(`→ Target R2 bucket: ${R2_BUCKET_NAME}`);

// Parse /<bucket>/<prefix> paths from env vars.
function parsePaths(envVar) {
  return (process.env[envVar] ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      if (!p.startsWith("/")) p = `/${p}`;
      const [, bucket, ...rest] = p.split("/");
      return { bucket, prefix: rest.join("/") };
    });
}

const privatePath  = parsePaths("PRIVATE_OBJECT_DIR");
const publicPaths  = parsePaths("PUBLIC_OBJECT_SEARCH_PATHS");
const allPaths     = [...privatePath, ...publicPaths];

if (allPaths.length === 0) {
  console.error(
    "❌  PRIVATE_OBJECT_DIR and PUBLIC_OBJECT_SEARCH_PATHS are both empty.\n" +
    "    Nothing to migrate.",
  );
  process.exit(1);
}

// ─── Clients ─────────────────────────────────────────────────────────────────

const gcs = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET },
  forcePathStyle: true,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function existsInR2(bucket, key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 404 || err.name === "NotFound" || err.name === "NoSuchKey") {
      return false;
    }
    throw err;
  }
}

async function copyFile(gcsBucket, gcsFile) {
  const [metadata] = await gcsFile.getMetadata();
  const contentType = metadata.contentType ?? "application/octet-stream";
  const customMeta  = metadata.metadata ?? {};

  // Sanitize metadata keys for S3 (no colons).
  const r2Meta = {};
  for (const [k, v] of Object.entries(customMeta)) {
    const sanitized = k === "custom:aclPolicy"
      ? "aclpolicy"
      : k.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
    r2Meta[sanitized] = v;
  }

  // Write into the R2 bucket (name differs from GCS); preserve the same key.
  const bucket = R2_BUCKET_NAME;
  const key    = gcsFile.name;

  if (await existsInR2(bucket, key)) {
    return "skipped";
  }

  // Stream from GCS → buffer → R2.
  const chunks = [];
  await new Promise((resolve, reject) => {
    const stream = gcsFile.createReadStream();
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  const body = Buffer.concat(chunks);

  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: r2Meta,
    }),
  );
  return "copied";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function migrate() {
  let total = 0;
  let copied = 0;
  let skipped = 0;
  let failed = 0;

  // Deduplicate buckets.
  const buckets = [...new Set(allPaths.map((p) => p.bucket))];

  for (const bucketName of buckets) {
    console.log(`\n📦  Scanning GCS bucket: ${bucketName}`);
    const bucket = gcs.bucket(bucketName);

    let pageToken;
    do {
      const [files, , nextQuery] = await bucket.getFiles({ pageToken });
      pageToken = nextQuery?.pageToken;

      for (const file of files) {
        total++;
        try {
          const result = await copyFile(bucket, file);
          if (result === "copied") {
            copied++;
            console.log(`  ✅  ${file.name}`);
          } else {
            skipped++;
            console.log(`  ⏭   ${file.name}  (already in R2)`);
          }
        } catch (err) {
          failed++;
          console.error(`  ❌  ${file.name}  —  ${err.message}`);
        }
      }
    } while (pageToken);
  }

  console.log(
    `\n─────────────────────────────────\n` +
    `Done.  total=${total}  copied=${copied}  skipped=${skipped}  failed=${failed}\n`,
  );

  if (failed > 0) {
    console.error("⚠️   Some files failed. Re-run the script to retry them.");
    process.exit(1);
  }
}

migrate().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
