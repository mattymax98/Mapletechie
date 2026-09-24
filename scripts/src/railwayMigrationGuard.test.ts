import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  assertRailwayTarget,
  assertRegularMigrationFile,
  migrationBody,
  parseMigrationCommand,
  RAILWAY_CLUSTER_ID,
  requireRailwayUrl,
  resolveMigration,
  runOnVerifiedConnection,
} from "./railwayMigrationGuard";

test("only the pinned live Railway database is accepted", () => {
  assert.doesNotThrow(() => assertRailwayTarget({ database_name: "railway", system_identifier: RAILWAY_CLUSTER_ID }));
  assert.throws(() => assertRailwayTarget({ database_name: "neondb", system_identifier: RAILWAY_CLUSTER_ID }), /does not match/);
  assert.throws(() => assertRailwayTarget({ database_name: "railway", system_identifier: "0" }), /does not match/);
  assert.throws(() => assertRailwayTarget(undefined), /does not match/);
});

test("migrations cannot escape the approved SQL directory", async () => {
  assert.match(await resolveMigration("0006_author_only_updates_preserve_updated_at.sql"), /scripts\/migrations\/0006_author_only_updates_preserve_updated_at\.sql$/);
  assert.match(await resolveMigration("repair-railway-schema.sql"), /scripts\/repair-railway-schema\.sql$/);
  await assert.rejects(resolveMigration("../repair-railway-schema.sql"), /numbered SQL file/);
  await assert.rejects(resolveMigration("/tmp/0006_author_only_updates_preserve_updated_at.sql"), /numbered SQL file/);
  await assert.rejects(resolveMigration("SELECT 1;"), /numbered SQL file/);
  await assert.rejects(resolveMigration("0006_missing.sql"), /ENOENT/);
});

test("symlinked SQL is rejected even if it points inside the same directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "railway-migration-guard-"));
  try {
    const file = join(directory, "approved.sql");
    const link = join(directory, "alias.sql");
    await writeFile(file, "SELECT 1;");
    await symlink(file, link);
    await assertRegularMigrationFile(file);
    await assert.rejects(assertRegularMigrationFile(link), /symlink/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("default is read-only, and apply requires both the filename and confirmation", () => {
  assert.deepEqual(parseMigrationCommand([]), { mode: "check" });
  assert.deepEqual(parseMigrationCommand(["--check"]), { mode: "check" });
  assert.deepEqual(parseMigrationCommand(["--apply", "0001_maintenance_schedule_and_severity.sql", "--confirm-railway-production"]), {
    mode: "apply", filename: "0001_maintenance_schedule_and_severity.sql",
  });
  for (const args of [["--apply"], ["--apply", "0001_maintenance_schedule_and_severity.sql"], ["--check", "--apply"], ["--apply", "0001_maintenance_schedule_and_severity.sql", "--confirm-railway-production", "extra"]]) {
    assert.throws(() => parseMigrationCommand(args), /Usage/);
  }
});

test("target URL never falls back to the retired or development URL", () => {
  const env = { PROD_DATABASE_URL: "retired", DATABASE_URL: "development" };
  assert.throws(() => requireRailwayUrl(env), /RAILWAY_DATABASE_URL is required/);
  assert.throws(() => requireRailwayUrl({ ...env, RAILWAY_DATABASE_URL: "" }), /RAILWAY_DATABASE_URL is required/);
  assert.equal(requireRailwayUrl({ ...env, RAILWAY_DATABASE_URL: "live" }), "live");
});

test("historical outer transaction is owned by the guarded connection", async () => {
  assert.equal(migrationBody("-- heading\nBEGIN;\nSELECT 1;\nCOMMIT;\n"), "\nSELECT 1;");
  assert.equal(migrationBody("CREATE FUNCTION f() RETURNS void AS $$ BEGIN NULL; END $$ LANGUAGE plpgsql;"), "CREATE FUNCTION f() RETURNS void AS $$ BEGIN NULL; END $$ LANGUAGE plpgsql;");
  assert.throws(() => migrationBody("BEGIN; SELECT 1;"), /Transaction-control/);
  assert.throws(() => migrationBody("SELECT 1; COMMIT; SELECT 2;"), /Transaction-control/);
  assert.throws(() => migrationBody("SELECT 1; ROLLBACK;"), /Transaction-control/);
  assert.throws(() => migrationBody("SELECT 1; END;"), /Transaction-control/);
  assert.throws(() => migrationBody("CREATE INDEX CONCURRENTLY idx ON posts(id);"), /cannot safely run/);
  assert.throws(() => migrationBody("VACUUM posts;"), /cannot safely run/);
  assert.equal(migrationBody("SELECT 'COMMIT;'; -- ROLLBACK;\nSELECT $$BEGIN; END;$$;"), "SELECT 'COMMIT;'; -- ROLLBACK;\nSELECT $$BEGIN; END;$$;");
  for (const name of [
    "0001_maintenance_schedule_and_severity.sql",
    "0002_engagement_signals.sql",
    "0003_ahrefs_internal_link_cleanup.sql",
    "0004_posts_updated_at.sql",
    "0005_posts_embed_report.sql",
    "0006_author_only_updates_preserve_updated_at.sql",
    "repair-railway-schema.sql",
  ]) {
    assert.ok(migrationBody(await readFile(await resolveMigration(name), "utf8")).trim(), name);
  }
});

function fakeClient(identity: { database_name: string; system_identifier: string }) {
  const calls: string[] = [];
  const client = {
    async query(sql: string): Promise<{ rows: unknown[] }> {
      calls.push(sql);
      return { rows: sql.includes("pg_control_system()") ? [identity] : [] };
    },
  };
  return { client, calls };
}

test("read-only check validates the server identity and executes no migration", async () => {
  const { client, calls } = fakeClient({ database_name: "railway", system_identifier: RAILWAY_CLUSTER_ID });
  await runOnVerifiedConnection(client, { mode: "check" }, null);
  assert.deepEqual(calls, [
    "BEGIN READ ONLY",
    "SET LOCAL lock_timeout = '5s'",
    "SET LOCAL statement_timeout = '120s'",
    "SELECT current_database() AS database_name, system_identifier::text AS system_identifier FROM pg_catalog.pg_control_system()",
    "ROLLBACK",
  ]);
  await assert.rejects(runOnVerifiedConnection(client, { mode: "check" }, "SELECT 1;"), /Read-only/);
});

test("retired Neon or ambiguous target cannot run migration SQL", async () => {
  for (const identity of [
    { database_name: "neondb", system_identifier: "0" },
    { database_name: "neondb", system_identifier: RAILWAY_CLUSTER_ID },
    { database_name: "railway", system_identifier: "0" },
  ]) {
    const { client, calls } = fakeClient(identity);
    await assert.rejects(runOnVerifiedConnection(client, { mode: "apply", filename: "0001_reviewed.sql" }, "SELECT 1;"), /does not match/);
    assert.equal(calls.at(-1), "ROLLBACK");
    assert.ok(!calls.includes("SELECT 1;"));
    assert.ok(!calls.includes("COMMIT"));
  }
});

test("an approved apply checks identity then reports filename before SQL and commits", async () => {
  const { client, calls } = fakeClient({ database_name: "railway", system_identifier: RAILWAY_CLUSTER_ID });
  let reportedAt = -1;
  await runOnVerifiedConnection(client, { mode: "apply", filename: "0001_reviewed.sql" }, "SELECT 1;", (name) => {
    assert.equal(name, "0001_reviewed.sql");
    reportedAt = calls.length;
  });
  assert.equal(reportedAt, 4);
  assert.deepEqual(calls.slice(-2), ["SELECT 1;", "COMMIT"]);
  await assert.rejects(runOnVerifiedConnection(client, { mode: "apply", filename: "0001_reviewed.sql" }, null), /approved migration file/);
});

test("reformatted database URLs cannot evade the Drizzle development guard", () => {
  const source = "postgres://example.invalid:5432/railway?sslmode=require";
  const equivalent = "postgresql://EXAMPLE.INVALID/railway?application_name=example";
  for (const targetVariable of ["PROD_DATABASE_URL", "RAILWAY_DATABASE_URL"]) {
    const result = spawnSync(process.execPath, [
      "--import", "tsx", "-e",
      "import('../lib/db/drizzle.config.ts').catch(error => { console.error(error.message); process.exitCode = 1 })",
    ], {
      cwd: resolve(import.meta.dirname, ".."),
      env: {
        ...process.env,
        DATABASE_URL: equivalent,
        PROD_DATABASE_URL: "postgres://other.invalid/other",
        RAILWAY_DATABASE_URL: "postgres://other.invalid/other",
        [targetVariable]: source,
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Refusing an unguarded schema push/);
    assert.ok(!result.stderr.includes(source));
  }
});