import assert from "node:assert/strict";
import test from "node:test";
import {
  acronymExpandedKey,
  highConfidenceSemanticReason,
  normalizeSemanticTag,
  singularSemanticKey,
} from "./tagSemanticAuditRules";

test("semantic normalization removes punctuation without making broad synonym guesses", () => {
  assert.equal(normalizeSemanticTag("Business & Policy"), "business and policy");
  assert.equal(highConfidenceSemanticReason("AI policy", "AI regulation"), null);
  assert.equal(highConfidenceSemanticReason("mobile security", "phone security"), null);
});

test("flags singular/plural wording", () => {
  assert.equal(singularSemanticKey("Data breaches"), singularSemanticKey("Data breach"));
  assert.equal(highConfidenceSemanticReason("Data breaches", "Data breach"), "singular/plural wording");
});

test("flags AI vs artificial intelligence wording", () => {
  assert.equal(acronymExpandedKey("AI"), "artificial intelligence");
  assert.equal(highConfidenceSemanticReason("AI", "Artificial Intelligence"), "AI/acronym wording");
});
