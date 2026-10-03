import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeTagList,
  chooseCanonicalTagVariant,
  normalizeTagText,
  tagNormalizationKey,
  tagUrlSegment,
} from "./tagNormalizationRules";

test("normalizes only safe presentational differences", () => {
  assert.equal(normalizeTagText("  Business &amp;   Policy "), "Business & Policy");
  assert.equal(normalizeTagText("Privacy\u00a0"), "Privacy");
  assert.equal(tagNormalizationKey("Cybersecurity"), "cybersecurity");
  assert.equal(tagUrlSegment("Business &amp; Policy"), "business%20%26%20policy");
});

test("chooses the most-used established spelling", () => {
  assert.equal(
    chooseCanonicalTagVariant([
      { tag: "Cybersecurity", publishedCount: 14 },
      { tag: "cybersecurity", publishedCount: 27 },
    ]),
    "cybersecurity",
  );
});

test("decodes an entity even when it is the only historical spelling", () => {
  assert.equal(
    chooseCanonicalTagVariant([{ tag: "Business &amp; Policy", publishedCount: 8 }]),
    "Business & Policy",
  );
});

test("canonicalizes and deduplicates a post tag list", () => {
  const canonical = new Map([
    ["privacy", "privacy"],
    ["business & policy", "Business & Policy"],
  ]);
  assert.deepEqual(
    canonicalizeTagList(
      ["Privacy", "privacy", " Business &amp; Policy ", "Business & Policy"],
      canonical,
    ),
    ["privacy", "Business & Policy"],
  );
});
