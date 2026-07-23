import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    // The suite builds the production bundle and boots a child process, so it
    // needs a long hook timeout and must not run alongside other suites that
    // could contend for the same build output.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
