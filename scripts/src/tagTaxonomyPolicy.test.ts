import assert from "node:assert/strict";
import test from "node:test";
import { classifyTaxonomyTag } from "./tagTaxonomyPolicy";

test("category duplicates retire to the category", () => {
  assert.deepEqual(
    classifyTaxonomyTag({ tag:"AI", count:9, keywordNormalized:0 }),
    { action:"RETIRE_CATEGORY", destination:"/category/ai", reason:"duplicates an existing category or an obvious singular/category alias" },
  );
  assert.equal(classifyTaxonomyTag({ tag:"Guide", count:12, keywordNormalized:0 }).destination, "/category/guides");
});

test("obvious semantic duplicates merge", () => {
  const d=classifyTaxonomyTag({ tag:"supply chain", count:1, keywordNormalized:0 });
  assert.equal(d.action,"MERGE");
  assert.equal(d.destination,"supply chains");
});

test("multi-article subject archives survive unless they are formats/categories", () => {
  assert.equal(classifyTaxonomyTag({ tag:"privacy", count:35, keywordNormalized:0 }).action,"KEEP");
  assert.equal(classifyTaxonomyTag({ tag:"Analysis", count:15, keywordNormalized:0 }).action,"RETIRE");
});

test("singletons default to retirement, with strategic exceptions", () => {
  assert.equal(classifyTaxonomyTag({ tag:"wildfire smoke air purifier", count:1, keywordNormalized:1 }).action,"RETIRE");
  assert.equal(classifyTaxonomyTag({ tag:"VPN", count:1, keywordNormalized:0 }).action,"KEEP");
  assert.equal(classifyTaxonomyTag({ tag:"CVE-2026-76504", count:1, keywordNormalized:0 }).action,"RETIRE");
});
