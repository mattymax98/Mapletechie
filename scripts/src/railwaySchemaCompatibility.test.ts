import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  assertCompatibleOnVerifiedConnection,
  classifyChangedFiles,
  parseCompatibilityCommand,
  RAILWAY_MIGRATION_SCHEMA,
  runOnVerifiedReadOnlyConnection,
  validateCompatibilityReview,
  validateMigrationRegistry,
} from "./railwaySchemaCompatibility";
import { MigrationGuardError, RAILWAY_CLUSTER_ID } from "./railwayMigrationGuard";

function fakeClient(
  identity: { database_name: string; system_identifier: string },
  hasSchemaObjects = true,
) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const client = {
    async query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }> {
      calls.push({ sql, values });
      if (sql.includes("pg_control_system()")) return { rows: [identity] };
      if (sql === "ROLLBACK" || sql === "BEGIN READ ONLY" || sql.startsWith("SET LOCAL")) return { rows: [] };
      return { rows: hasSchemaObjects ? [{}] : [] };
    },
  };
  return { client, calls };
}

test("CLI parses explicit base/head and migration review declarations", () => {
  assert.deepEqual(parseCompatibilityCommand([
    "--base", "main", "--head", "HEAD", "--requires", "none",
  ]), { base: "main", head: "HEAD", requires: "none" });
  assert.deepEqual(parseCompatibilityCommand([
    "--requires", "0007_topic_clusters.sql,0008_post_editorial_revisions.sql",
    "--head", "HEAD", "--base", "main",
  ]), {
    base: "main",
    head: "HEAD",
    requires: ["0007_topic_clusters.sql", "0008_post_editorial_revisions.sql"],
  });
  assert.deepEqual(parseCompatibilityCommand(["--base", "main", "--head", "HEAD"]), {
    base: "main", head: "HEAD",
  });
  assert.throws(() => parseCompatibilityCommand(["--base", "main", "--head", "HEAD", "--requires", "nope.sql"]), /numbered SQL/);
});

test("the curated registry covers every SQL migration and no migration is data/schema conflated", async () => {
  await validateMigrationRegistry();
  const migrationDirectory = resolve(import.meta.dirname, "../migrations");
  const filenames = (await readdir(migrationDirectory)).filter((filename) => filename.endsWith(".sql"));
  assert.deepEqual(filenames.filter((filename) => !Object.hasOwn(RAILWAY_MIGRATION_SCHEMA, filename)), []);
  assert.deepEqual(RAILWAY_MIGRATION_SCHEMA["0003_ahrefs_internal_link_cleanup.sql"], {});
  assert.notDeepEqual(
    RAILWAY_MIGRATION_SCHEMA["0004_posts_updated_at.sql"].functions,
    RAILWAY_MIGRATION_SCHEMA["0006_author_only_updates_preserve_updated_at.sql"].functions,
  );
});

test("schema source changes require a migration and backend changes require an explicit review", () => {
  const schemaChanges = classifyChangedFiles(["lib/db/src/schema/posts.ts"]);
  assert.equal(schemaChanges.schema.length, 1);
  assert.throws(() => validateCompatibilityReview(schemaChanges), /explicit --requires review/);
  assert.throws(() => validateCompatibilityReview(schemaChanges, "none"), /Schema source changed/);
  const backendChanges = classifyChangedFiles([
    "artifacts/api-server/src/routes/posts.ts",
    "artifacts/tech-blog/server.ts",
    "artifacts/tech-blog/src/pages/Home.tsx",
  ]);
  assert.equal(backendChanges.backend.length, 3);
  assert.throws(() => validateCompatibilityReview(backendChanges), /explicit --requires review/);
  assert.doesNotThrow(() => validateCompatibilityReview(backendChanges, "none"));
  const backendMigration = classifyChangedFiles([
    "artifacts/api-server/src/routes/posts.ts",
    "scripts/migrations/0008_post_editorial_revisions.sql",
  ]);
  assert.throws(() => validateCompatibilityReview(backendMigration, "none"), /migration SQL/);
});

test("a deleted schema file remains in the candidate diff and cannot be declared migration-free", () => {
  const changes = classifyChangedFiles(["lib/db/src/schema/posts.ts"]);
  assert.throws(() => validateCompatibilityReview(changes, "none"), /Schema source changed/);
});

test("the reviewed initial updated-at migration recognizes its later author-only replacement", () => {
  const original = RAILWAY_MIGRATION_SCHEMA["0004_posts_updated_at.sql"].functions?.[0].body;
  const replacement = RAILWAY_MIGRATION_SCHEMA["0006_author_only_updates_preserve_updated_at.sql"].functions?.[0].body;
  assert.ok(Array.isArray(original));
  assert.equal(original.length, 2);
  assert.equal(original[1], replacement);
});

test("migration 0007 and 0008 missing objects block release with exact labels", async () => {
  const { client, calls } = fakeClient(
    { database_name: "railway", system_identifier: RAILWAY_CLUSTER_ID },
    false,
  );
  await assert.rejects(
    assertCompatibleOnVerifiedConnection(client, [
      "0007_topic_clusters.sql",
      "0008_post_editorial_revisions.sql",
    ]),
    (error: unknown) => {
      assert.ok(error instanceof MigrationGuardError);
      assert.match(error.message, /Release is blocked/);
      assert.match(error.message, /0007_topic_clusters\.sql: table public\.topics/);
      assert.match(error.message, /0007_topic_clusters\.sql: column public\.posts\.cluster_id/);
      assert.match(error.message, /0007_topic_clusters\.sql: valid index public\.posts_cluster_one_pillar_uq/);
      assert.match(error.message, /0008_post_editorial_revisions\.sql: table public\.post_revisions/);
      assert.match(error.message, /0008_post_editorial_revisions\.sql: column public\.posts\.published_once_at/);
      assert.match(error.message, /0008_post_editorial_revisions\.sql: enabled trigger public\.posts\.posts_preserve_published_identity/);
      return true;
    },
  );
  assert.equal(calls[0].sql, "BEGIN READ ONLY");
  assert.ok(calls.some(({ sql }) => sql.includes("pg_control_system()")));
  assert.ok(calls.at(-1)?.sql === "ROLLBACK");
  assert.ok(!calls.some(({ sql }) => /^(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i.test(sql)));
});

test("data-only migrations cannot be falsely reported as applied by a schema check", async () => {
  const { client } = fakeClient({ database_name: "railway", system_identifier: RAILWAY_CLUSTER_ID });
  await assert.rejects(
    assertCompatibleOnVerifiedConnection(client, ["0003_ahrefs_internal_link_cleanup.sql"]),
    /data-only migration cannot be verified from schema/,
  );
});

test("the pinned target is verified before any production catalog query", async () => {
  const { client, calls } = fakeClient({ database_name: "railway", system_identifier: "wrong-cluster" });
  await assert.rejects(runOnVerifiedReadOnlyConnection(client, ["0007_topic_clusters.sql"]), /does not match/);
  assert.deepEqual(calls.map(({ sql }) => sql), [
    "BEGIN READ ONLY",
    "SET LOCAL lock_timeout = '5s'",
    "SET LOCAL statement_timeout = '120s'",
    "SELECT current_database() AS database_name, system_identifier::text AS system_identifier FROM pg_catalog.pg_control_system()",
    "ROLLBACK",
  ]);
  assert.ok(!calls.some(({ sql }) => sql.includes("pg_catalog.pg_class")));
});

test("schema objects are checked only after successful identity verification in one read-only transaction", async () => {
  const { client, calls } = fakeClient({ database_name: "railway", system_identifier: RAILWAY_CLUSTER_ID });
  const missing = await runOnVerifiedReadOnlyConnection(client, ["0007_topic_clusters.sql"]);
  assert.deepEqual(missing, []);
  const identityIndex = calls.findIndex(({ sql }) => sql.includes("pg_control_system()"));
  const catalogIndex = calls.findIndex(({ sql }) => sql.includes("pg_catalog.pg_class"));
  assert.ok(identityIndex >= 0 && catalogIndex > identityIndex);
  assert.equal(calls[0].sql, "BEGIN READ ONLY");
  assert.equal(calls.at(-1)?.sql, "ROLLBACK");
});