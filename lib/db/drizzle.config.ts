import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

function databaseEndpoint(connectionString: string): string | null {
  try {
    const url = new URL(connectionString);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return null;
    // Ignore credentials, URL scheme, default-port spelling and query options.
    // This is only an extra guard; aliases can still name the same cluster.
    return `${url.hostname.toLowerCase()}:${url.port || "5432"}/${decodeURIComponent(url.pathname.slice(1))}`;
  } catch {
    return null;
  }
}

// Drizzle push is for development only. Catch accidental variable swaps before
// it connects; production SQL must use the identity-checked Railway runner.
const pushTarget = databaseEndpoint(process.env.DATABASE_URL);
if (!pushTarget) throw new Error("DATABASE_URL is not a valid PostgreSQL URL.");
if (
  process.env.RAILWAY_DATABASE_URL &&
  databaseEndpoint(process.env.RAILWAY_DATABASE_URL) === pushTarget
) {
  throw new Error("Refusing an unguarded schema push to the live production database. Use migrate:railway.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
