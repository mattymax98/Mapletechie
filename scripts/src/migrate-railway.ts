import { readFile } from "node:fs/promises";
import pg from "pg";
import {
  migrationBody,
  MigrationGuardError,
  parseMigrationCommand,
  requireRailwayUrl,
  resolveMigration,
  runOnVerifiedConnection,
} from "./railwayMigrationGuard";

const { Client } = pg;

async function main(): Promise<void> {
  const command = parseMigrationCommand(process.argv.slice(2));

  // Deliberately never fall back to DATABASE_URL: it points at development.
  const connectionString = requireRailwayUrl(process.env);

  const sql = command.mode === "apply"
    ? migrationBody(await readFile(await resolveMigration(command.filename), "utf8"))
    : null;
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await runOnVerifiedConnection(client, command, sql, (filename) => {
      // Print only the reviewed filename and a constant description of the
      // identity that just passed verification; never log connection details.
      console.log(`Verified database railway (pinned cluster identity matched). Applying ${filename}.`);
    });
  } finally {
    if (connected) await client.end();
  }
  console.log(command.mode === "check"
    ? "Verified the live Railway production database (read-only)."
    : `Applied ${command.filename} to the verified Railway production database.`);
}

main().catch((error: unknown) => {
  // Never log connection strings, credentials, or the contents of env vars.
  console.error(error instanceof MigrationGuardError ? error.message : "Migration failed; no credential details are logged. Review the target and SQL.");
  process.exitCode = 1;
});