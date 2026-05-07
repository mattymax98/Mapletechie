import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.join(__dirname, "server.ts")],
  outfile: path.join(__dirname, "dist", "server.mjs"),
  platform: "node",
  format: "esm",
  target: "node20",
  bundle: true,
  sourcemap: true,
  minify: false,
  packages: "external",
  logLevel: "info",
});
