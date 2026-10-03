import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { assertRailwayTarget, MigrationGuardError, requireRailwayUrl } from "./railwayMigrationGuard";

const MIGRATIONS_DIR = resolve(import.meta.dirname, "../migrations");
const USAGE = "Usage: railway-schema-compatibility --base <git-ref> --head <git-ref> [--requires <none|comma-separated SQL filenames>]";

type ColumnCheck = { table: string; column: string };
type ConstraintCheck = { table: string; name: string };
type IndexCheck = { table: string; name: string };
type TriggerCheck = { table: string; name: string; functionName: string; functionBody?: string | string[] };
type FunctionCheck = { name: string; body: string | string[] };
type SchemaCheck = {
  tables?: string[];
  columns?: ColumnCheck[];
  constraints?: ConstraintCheck[];
  indexes?: IndexCheck[];
  triggers?: TriggerCheck[];
  functions?: FunctionCheck[];
};

const updatedAtInitialBody = `
  NEW.updated_at = now();
  RETURN NEW;
`;
const updatedAtAuthorOnlyBody = `
  IF NEW.author IS DISTINCT FROM OLD.author
     AND (to_jsonb(NEW) - 'author' - 'updated_at')
       = (to_jsonb(OLD) - 'author' - 'updated_at') THEN
    NEW.updated_at = OLD.updated_at;
  ELSE
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
`;
const publishedIdentityBody = `
  IF OLD.status = 'published' AND OLD.published_once_at IS NULL THEN
    NEW.published_once_at = OLD.published_at;
  END IF;
  IF OLD.published_once_at IS NOT NULL THEN
    NEW.published_once_at = OLD.published_once_at;
  END IF;
  IF NEW.status = 'published' AND NEW.published_once_at IS NULL THEN
    NEW.published_once_at = NEW.published_at;
  END IF;
  IF OLD.published_once_at IS NOT NULL AND
     NEW.published_once_at IS DISTINCT FROM OLD.published_once_at THEN
    RAISE EXCEPTION 'Original publication marker cannot be changed';
  END IF;
  IF (OLD.status = 'published' OR OLD.published_once_at IS NOT NULL) AND
     (NEW.slug IS DISTINCT FROM OLD.slug OR NEW.published_at IS DISTINCT FROM OLD.published_at) THEN
    RAISE EXCEPTION 'Published post URL and publication date cannot be changed';
  END IF;
  RETURN NEW;
`;

// This registry is deliberately explicit: every numbered migration needs a
// reviewed entry before it can be used to claim production compatibility.
export const RAILWAY_MIGRATION_SCHEMA: Readonly<Record<string, SchemaCheck>> = {
  "0001_maintenance_schedule_and_severity.sql": {
    columns: [
      { table: "site_settings", column: "maintenance_starts_at" },
      { table: "site_settings", column: "maintenance_ends_at" },
      { table: "site_settings", column: "maintenance_severity" },
    ],
  },
  "0002_engagement_signals.sql": {
    tables: ["search_queries", "link_clicks"],
    columns: [
      ...["scroll_depth", "duration_ms", "device_type", "browser", "is_returning", "reading_time_sec"]
        .map((column) => ({ table: "page_views", column })),
      ...["id", "query", "path", "session_id", "created_at"].map((column) => ({ table: "search_queries", column })),
      ...["id", "link_type", "href", "post_slug", "session_id", "created_at"].map((column) => ({ table: "link_clicks", column })),
    ],
    constraints: [
      { table: "search_queries", name: "search_queries_pkey" },
      { table: "link_clicks", name: "link_clicks_pkey" },
    ],
    indexes: [
      { table: "search_queries", name: "search_queries_created_at_idx" },
      { table: "link_clicks", name: "link_clicks_created_at_idx" },
      { table: "link_clicks", name: "link_clicks_post_slug_created_at_idx" },
    ],
  },
  // 0003 performs data-only URL/content updates; it creates no schema objects.
  "0003_ahrefs_internal_link_cleanup.sql": {},
  "0004_posts_updated_at.sql": {
    columns: [{ table: "posts", column: "updated_at" }],
    // 0006 intentionally replaces this function without changing the trigger.
    functions: [{ name: "set_posts_updated_at", body: [updatedAtInitialBody, updatedAtAuthorOnlyBody] }],
    triggers: [{
      table: "posts",
      name: "posts_set_updated_at",
      functionName: "set_posts_updated_at",
      functionBody: [updatedAtInitialBody, updatedAtAuthorOnlyBody],
    }],
  },
  "0005_posts_embed_report.sql": {
    columns: [{ table: "posts", column: "embed_report" }],
  },
  "0006_author_only_updates_preserve_updated_at.sql": {
    // This must remain distinct from 0004's initial trigger body.
    functions: [{ name: "set_posts_updated_at", body: updatedAtAuthorOnlyBody }],
    triggers: [{
      table: "posts",
      name: "posts_set_updated_at",
      functionName: "set_posts_updated_at",
      functionBody: updatedAtAuthorOnlyBody,
    }],
  },
  "0007_topic_clusters.sql": {
    tables: ["topics"],
    columns: [
      ...["id", "name", "slug", "introduction", "is_public", "created_at", "updated_at"]
        .map((column) => ({ table: "topics", column })),
      { table: "posts", column: "cluster_id" },
      { table: "posts", column: "cluster_role" },
    ],
    constraints: [
      { table: "topics", name: "topics_pkey" },
      { table: "topics", name: "topics_slug_key" },
      { table: "posts", name: "posts_cluster_role_pair_check" },
      { table: "posts", name: "posts_cluster_id_fkey" },
    ],
    indexes: [{ table: "posts", name: "posts_cluster_one_pillar_uq" }],
  },
  "0008_post_editorial_revisions.sql": {
    tables: ["post_revisions"],
    columns: [
      ...["content_modified_at", "update_note", "published_once_at"].map((column) => ({ table: "posts", column })),
      ...[
        "id", "post_id", "base_hash", "changes", "update_note", "source", "status",
        "proposed_by", "reviewed_by", "created_at", "reviewed_at",
      ].map((column) => ({ table: "post_revisions", column })),
    ],
    constraints: [
      { table: "post_revisions", name: "post_revisions_pkey" },
      { table: "post_revisions", name: "post_revisions_post_id_fkey" },
      { table: "post_revisions", name: "post_revisions_status_check" },
    ],
    indexes: [{ table: "post_revisions", name: "post_revisions_post_status_idx" }],
    functions: [{ name: "preserve_published_identity", body: publishedIdentityBody }],
    triggers: [{
      table: "posts",
      name: "posts_preserve_published_identity",
      functionName: "preserve_published_identity",
      functionBody: publishedIdentityBody,
    }],
  },
  // 0009 is a data-only tag normalization; it creates no schema objects.
  "0009_normalize_safe_tag_aliases.sql": {},
};

export type CompatibilityCommand = { base: string; head: string; requires?: "none" | string[] };

export function parseCompatibilityCommand(args: string[]): CompatibilityCommand {
  let base: string | undefined;
  let head: string | undefined;
  let requires: string | undefined;
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!value || value.startsWith("--") || (flag !== "--base" && flag !== "--head" && flag !== "--requires")) {
      throw new MigrationGuardError(USAGE);
    }
    if (flag === "--base" && base === undefined) base = value;
    else if (flag === "--head" && head === undefined) head = value;
    else if (flag === "--requires" && requires === undefined) requires = value;
    else throw new MigrationGuardError(USAGE);
  }
  if (!base || !head) throw new MigrationGuardError(USAGE);
  if (requires === undefined) return { base, head };
  if (requires === "none") return { base, head, requires: "none" };
  const filenames = requires.split(",");
  if (filenames.some((name) => !/^[0-9]{4}_[a-z0-9_]+\.sql$/.test(name)) ||
      new Set(filenames).size !== filenames.length) {
    throw new MigrationGuardError(`${USAGE}. --requires must be none or unique numbered SQL filenames.`);
  }
  return { base, head, requires: filenames };
}

export type ChangedFiles = {
  backend: string[];
  schema: string[];
  migrations: string[];
};

export function classifyChangedFiles(paths: string[]): ChangedFiles {
  const backend: string[] = [];
  const schema: string[] = [];
  const migrations: string[] = [];
  for (const path of paths) {
    if (/^scripts\/migrations\/[^/]+\.sql$/.test(path)) {
      migrations.push(path);
      schema.push(path);
      continue;
    }
    if (/^lib\/db\/(?:src\/schema\/|drizzle\/)/.test(path) ||
        /^lib\/db\/(?:drizzle\.config|src\/schema)\.(?:ts|js)$/.test(path)) {
      schema.push(path);
      continue;
    }
    if (/^artifacts\/api-server\/(?:src\/|server\.ts$)/.test(path) ||
        /^artifacts\/tech-blog\/src\//.test(path) ||
        /^artifacts\/tech-blog\/server\.ts$/.test(path) ||
        /^artifacts\/[^/]+\/(?:server|src\/server|src\/lib\/server)\//.test(path) ||
        /^lib\/(?:db|api-spec|api-zod)\/src\//.test(path) ||
        /^(?:server|api)\//.test(path)) {
      backend.push(path);
    }
  }
  return { backend, schema, migrations };
}

export function validateCompatibilityReview(changes: ChangedFiles, requires?: "none" | string[]): void {
  if (requires === undefined && (changes.backend.length > 0 || changes.schema.length > 0)) {
    throw new MigrationGuardError("Backend or schema changes require an explicit --requires review (none or migration filename(s)).");
  }
  if (requires === "none" && changes.backend.length > 0 && changes.migrations.length > 0) {
    throw new MigrationGuardError("Backend changes include migration SQL; --requires none is not allowed.");
  }
  if (requires === "none" && changes.schema.length > 0) {
    throw new MigrationGuardError("Schema source changed; --requires none is not allowed. Declare the required migration filename(s).");
  }
  if (requires !== undefined && requires !== "none") {
    const changedMigrations = changes.migrations.map((path) => path.split("/").at(-1)!);
    const undeclared = changedMigrations.filter((filename) => !requires.includes(filename));
    if (undeclared.length) {
      throw new MigrationGuardError(`Changed migration SQL must be declared in --requires: ${undeclared.join(", ")}.`);
    }
  }
}

type QueryClient = {
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
};

function normalizeBody(body: string): string {
  // pg_proc.prosrc includes the PL/pgSQL BEGIN/END wrapper; the reviewed
  // registry stores the statements inside it.
  return body.replace(/^\s*BEGIN\b/i, "").replace(/\bEND;\s*$/i, "").replace(/\s+/g, " ").trim();
}

function matchesBody(actual: unknown, expected: string | string[]): boolean {
  return typeof actual === "string" &&
    (Array.isArray(expected) ? expected : [expected])
      .some((body) => normalizeBody(actual) === normalizeBody(body));
}

async function hasRows(client: QueryClient, sql: string, values: unknown[]): Promise<boolean> {
  const result = await client.query(sql, values);
  return result.rows.length > 0;
}

export async function checkRequiredMigrationSchema(
  client: QueryClient,
  requiredMigrations: string[],
): Promise<string[]> {
  const missing: string[] = [];
  for (const filename of requiredMigrations) {
    const check = RAILWAY_MIGRATION_SCHEMA[filename];
    if (!check) throw new MigrationGuardError(`No curated schema registry entry for migration ${filename}.`);
    const label = (object: string) => `${filename}: ${object}`;
    if (Object.keys(check).length === 0) {
      missing.push(label("data-only migration cannot be verified from schema; review separately"));
      continue;
    }
    for (const table of check.tables ?? []) {
      const found = await hasRows(client,
        "SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind IN ('r', 'p')",
        [table]);
      if (!found) missing.push(label(`table public.${table}`));
    }
    for (const { table, column } of check.columns ?? []) {
      const found = await hasRows(client,
        "SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = $1 AND a.attname = $2 AND a.attnum > 0 AND NOT a.attisdropped",
        [table, column]);
      if (!found) missing.push(label(`column public.${table}.${column}`));
    }
    for (const { table, name } of check.constraints ?? []) {
      const found = await hasRows(client,
        "SELECT 1 FROM pg_catalog.pg_constraint co JOIN pg_catalog.pg_class c ON c.oid = co.conrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = $1 AND co.conname = $2 AND co.convalidated",
        [table, name]);
      if (!found) missing.push(label(`validated constraint public.${table}.${name}`));
    }
    for (const { table, name } of check.indexes ?? []) {
      const found = await hasRows(client,
        "SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class idx ON idx.oid = i.indexrelid JOIN pg_catalog.pg_class tbl ON tbl.oid = i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid = tbl.relnamespace WHERE n.nspname = 'public' AND tbl.relname = $1 AND idx.relname = $2 AND i.indisvalid AND i.indislive",
        [table, name]);
      if (!found) missing.push(label(`valid index public.${name} on ${table}`));
    }
    for (const { table, name, functionName, functionBody } of check.triggers ?? []) {
      const rows = await client.query(
        "SELECT p.prosrc AS function_body, p.proname AS function_name FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid WHERE n.nspname = 'public' AND c.relname = $1 AND t.tgname = $2 AND NOT t.tgisinternal AND t.tgenabled <> 'D'",
        [table, name]);
      const trigger = rows.rows[0] as { function_body?: unknown; function_name?: unknown } | undefined;
      if (!trigger) {
        missing.push(label(`enabled trigger public.${table}.${name}`));
      } else if (trigger.function_name !== functionName ||
                  (functionBody !== undefined && !matchesBody(trigger.function_body, functionBody))) {
        missing.push(label(`trigger public.${table}.${name} with expected ${functionName} function body`));
      }
    }
    for (const { name, body } of check.functions ?? []) {
      const rows = await client.query(
        "SELECT p.prosrc AS function_body FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1 AND p.prorettype = 'trigger'::regtype",
        [name]);
      const found = rows.rows.some((row) => {
        const value = row as { function_body?: unknown };
        return matchesBody(value.function_body, body);
      });
      if (!found) missing.push(label(`function public.${name} with expected body`));
    }
  }
  return missing;
}

export async function runOnVerifiedReadOnlyConnection(
  client: QueryClient,
  requiredMigrations: string[],
): Promise<string[]> {
  await client.query("BEGIN READ ONLY");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    const { rows } = await client.query(
      "SELECT current_database() AS database_name, system_identifier::text AS system_identifier FROM pg_catalog.pg_control_system()");
    if (rows.length !== 1) throw new MigrationGuardError("Could not verify Railway database identity.");
    assertRailwayTarget(rows[0] as { database_name?: unknown; system_identifier?: unknown });
    const missing = await checkRequiredMigrationSchema(client, requiredMigrations);
    await client.query("ROLLBACK");
    return missing;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

export async function assertCompatibleOnVerifiedConnection(
  client: QueryClient,
  requiredMigrations: string[],
): Promise<void> {
  const missing = await runOnVerifiedReadOnlyConnection(client, requiredMigrations);
  if (missing.length) {
    throw new MigrationGuardError(`Railway schema compatibility check failed. Missing production schema objects:\n${missing.map((item) => `- ${item}`).join("\n")}\nRelease is blocked until the declared migration is applied.`);
  }
}

async function gitChangedFiles(base: string, head: string): Promise<string[]> {
  const result = spawnSync("git", ["diff", "--name-only", "--diff-filter=ACMRTD", `${base}..${head}`, "--"], {
    cwd: resolve(import.meta.dirname, "../.."),
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new MigrationGuardError("Could not inspect git diff. Verify the supplied base and head refs.");
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

export async function validateMigrationRegistry(): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql"));
  const unregistered = files.filter((file) => !Object.hasOwn(RAILWAY_MIGRATION_SCHEMA, file));
  const removed = Object.keys(RAILWAY_MIGRATION_SCHEMA).filter((file) => !files.includes(file));
  if (unregistered.length || removed.length) {
    throw new MigrationGuardError(`Migration registry does not match reviewed SQL files. Unregistered: ${unregistered.join(", ") || "none"}; removed: ${removed.join(", ") || "none"}.`);
  }
}

async function main(): Promise<void> {
  const command = parseCompatibilityCommand(process.argv.slice(2));
  await validateMigrationRegistry();
  const changes = classifyChangedFiles(await gitChangedFiles(command.base, command.head));
  validateCompatibilityReview(changes, command.requires);
  const required = !command.requires || command.requires === "none" ? [] : command.requires;
  for (const filename of required) {
    if (!Object.hasOwn(RAILWAY_MIGRATION_SCHEMA, filename)) {
      throw new MigrationGuardError(`No curated schema registry entry for required migration ${filename}.`);
    }
  }
  if (changes.backend.length === 0 && changes.schema.length === 0) {
    console.log("No backend or schema changes in the selected git diff; Railway schema check skipped.");
    return;
  }
  const connectionString = requireRailwayUrl(process.env);
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await assertCompatibleOnVerifiedConnection(client, required);
  } finally {
    if (connected) await client.end();
  }
  console.log(required.length
    ? `Verified Railway production schema compatibility for: ${required.join(", ")}.`
    : "Verified pinned Railway production database (read-only); backend changes were reviewed with no new migration requirement.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof MigrationGuardError
      ? error.message
      : "Railway schema compatibility check failed; no credential details are logged.");
    process.exitCode = 1;
  });
}