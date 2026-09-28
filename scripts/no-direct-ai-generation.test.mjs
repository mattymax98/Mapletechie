import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = [
  "artifacts/api-server/src",
  "artifacts/tech-blog/src",
];
const forbiddenReferences = [
  "/admin/" + "generate",
  "generate-" + "post",
  "generate-cover-" + "image",
  "Admin" + "Generate",
  "AI_INTEGRATIONS_" + "ANTHROPIC",
  "AI_INTEGRATIONS_" + "OPENAI",
];

async function sourceFiles(relativePath) {
  const absolutePath = join(workspaceRoot, relativePath);
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const child = join(relativePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(child));
    } else if ([".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(extname(entry.name))) {
      files.push(child);
    }
  }

  return files;
}

test("the CMS has no direct AI generation routes or controls", async () => {
  const files = (await Promise.all(sourceRoots.map(sourceFiles))).flat();
  const matches = [];

  for (const file of files) {
    const source = await readFile(join(workspaceRoot, file), "utf8");
    for (const reference of forbiddenReferences) {
      if (source.includes(reference)) {
        matches.push(`${file}: ${reference}`);
      }
    }
  }

  assert.deepEqual(matches, []);
});