import { lstat, realpath } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

// Pin the current live Railway Postgres cluster, not just a variable name or
// hostname. A restored/replaced cluster must be independently verified before
// this value is updated; failing closed is intentional.
export const RAILWAY_CLUSTER_ID = "7674885296521752631";

export class MigrationGuardError extends Error {}

export type MigrationCommand = { mode: "check" } | { mode: "apply"; filename: string };

export function parseMigrationCommand(args: string[]): MigrationCommand {
  if (args.length === 0 || (args.length === 1 && args[0] === "--check")) return { mode: "check" };
  if (args.length === 3 && args[0] === "--apply" && args[2] === "--confirm-railway-production") {
    return { mode: "apply", filename: args[1] };
  }
  throw new MigrationGuardError("Usage: migrate:railway [--check] | --apply <filename.sql> --confirm-railway-production");
}

export function requireRailwayUrl(env: Record<string, string | undefined>): string {
  if (!env.RAILWAY_DATABASE_URL) throw new MigrationGuardError("RAILWAY_DATABASE_URL is required. No SQL was applied.");
  return env.RAILWAY_DATABASE_URL;
}

export function assertRailwayTarget(row: { database_name?: unknown; system_identifier?: unknown } | undefined): void {
  if (!row || row.database_name !== "railway" || row.system_identifier !== RAILWAY_CLUSTER_ID) {
    throw new MigrationGuardError("Database identity does not match the pinned Railway production cluster. No SQL was applied.");
  }
}

export async function assertRegularMigrationFile(file: string): Promise<void> {
  if (!(await lstat(file)).isFile()) throw new MigrationGuardError("Migration symlink or non-file is not allowed.");
}

export async function resolveMigration(name: string): Promise<string> {
  if (name === "repair-railway-schema.sql") {
    const expected = resolve(import.meta.dirname, "../repair-railway-schema.sql");
    await assertRegularMigrationFile(expected);
    if (await realpath(expected) !== expected) throw new MigrationGuardError("Migration symlink is not allowed.");
    return expected;
  }
  if (!/^[0-9]{4}_[a-z0-9_]+\.sql$/.test(name) || basename(name) !== name) {
    throw new MigrationGuardError("Choose a numbered SQL file from scripts/migrations.");
  }
  const directory = await realpath(resolve(import.meta.dirname, "../migrations"));
  const expected = resolve(directory, name);
  await assertRegularMigrationFile(expected);
  const file = await realpath(expected);
  if (dirname(file) !== directory || file !== expected) throw new MigrationGuardError("Migration symlink is not allowed.");
  return file;
}

export function migrationBody(sql: string): string {
  // Ignore SQL strings, dollar-quoted PL/pgSQL bodies, and comments when
  // looking for top-level transaction commands. They must never commit the
  // runner's transaction before it has completed.
  const masked = maskQuotedSql(sql);
  const statements: { start: number; end: number; text: string }[] = [];
  let start = 0;
  for (let i = 0; i <= masked.length; i++) {
    if (i !== masked.length && masked[i] !== ";") continue;
    const text = masked.slice(start, i).trim();
    if (text) statements.push({ start, end: i, text });
    start = i + 1;
  }
  if (!statements.length) throw new MigrationGuardError("Migration SQL is empty.");
  const first = statements[0];
  const last = statements[statements.length - 1];
  const wrapped = first.text.toUpperCase() === "BEGIN" && last.text.toUpperCase() === "COMMIT" && statements.length > 2;
  const inner = wrapped ? statements.slice(1, -1) : statements;
  if (
    inner.some(({ text }) => /^(?:BEGIN\b|START\s+TRANSACTION\b|COMMIT\b|ROLLBACK\b|ABORT\b|END\b|SAVEPOINT\b|RELEASE\s+SAVEPOINT\b|PREPARE\s+TRANSACTION\b|SET\s+TRANSACTION\b)/i.test(text)) ||
    (!wrapped && (first.text.toUpperCase() === "BEGIN" || last.text.toUpperCase() === "COMMIT"))
  ) {
    throw new MigrationGuardError("Transaction-control SQL is not supported in a migration file.");
  }
  if (inner.some(({ text }) =>
    /^(?:VACUUM\b|(?:CREATE|REINDEX)\b[\s\S]*\bCONCURRENTLY\b|(?:CREATE|DROP)\s+DATABASE\b|ALTER\s+SYSTEM\b)/i.test(text)
  )) {
    throw new MigrationGuardError("This SQL cannot safely run in the guarded transaction; review it separately.");
  }
  // 0003 has BEGIN/COMMIT around its updates. Remove only this outer pair;
  // the runner's transaction owns the identity check and every update.
  return wrapped ? sql.slice(first.end + 1, last.start) : sql;
}

function maskQuotedSql(sql: string): string {
  const masked = sql.split("");
  const hide = (from: number, to: number) => {
    for (let k = from; k < to; k++) masked[k] = " ";
  };
  for (let i = 0; i < sql.length;) {
    const start = i;
    if (sql.startsWith("--", i)) {
      i = sql.indexOf("\n", i + 2);
      if (i === -1) i = sql.length;
    } else if (sql.startsWith("/*", i)) {
      i += 2;
      let depth = 1;
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) { depth++; i += 2; }
        else if (sql.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new MigrationGuardError("Unclosed SQL comment.");
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i++];
      const escaped = quote === "'" && /(?:^|[^a-z0-9_])E$/i.test(sql.slice(Math.max(0, start - 2), start));
      let closed = false;
      while (i < sql.length) {
        if (escaped && sql[i] === "\\") { i += 2; continue; }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) throw new MigrationGuardError("Unclosed SQL string.");
    } else {
      const delimiter = sql.slice(i).match(/^\$(?:[a-z_][a-z0-9_]*)?\$/i)?.[0];
      if (delimiter) {
        const end = sql.indexOf(delimiter, i + delimiter.length);
        if (end === -1) throw new MigrationGuardError("Unclosed dollar-quoted SQL body.");
        i = end + delimiter.length;
      } else {
        i++;
        continue;
      }
    }
    hide(start, i);
  }
  return masked.join("");
}

type QueryClient = { query(sql: string): Promise<{ rows: unknown[] }> };

export async function runOnVerifiedConnection(
  client: QueryClient,
  command: MigrationCommand,
  sql: string | null,
  beforeApply: (filename: string) => void = () => {},
): Promise<void> {
  if (command.mode === "apply" && !sql) throw new MigrationGuardError("An approved migration file is required.");
  if (command.mode === "check" && sql !== null) throw new MigrationGuardError("Read-only check cannot execute SQL.");
  await client.query(command.mode === "check" ? "BEGIN READ ONLY" : "BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    const { rows } = await client.query(
      "SELECT current_database() AS database_name, system_identifier::text AS system_identifier FROM pg_catalog.pg_control_system()",
    );
    if (rows.length !== 1) throw new MigrationGuardError("Could not verify Railway database identity.");
    assertRailwayTarget(rows[0] as { database_name?: unknown; system_identifier?: unknown });
    if (command.mode === "apply") {
      beforeApply(command.filename);
      await client.query(sql!);
    }
    await client.query(command.mode === "check" ? "ROLLBACK" : "COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}