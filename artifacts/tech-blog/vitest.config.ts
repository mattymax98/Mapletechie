import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The suite builds the production bundle and boots a child process, so it
    // needs a long hook timeout and must not run alongside other suites that
    // could contend for the same build output.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
