import { describe, expect, it } from "vitest";
import { buildCanonicalTagMap, canonicalizeTagList, normalizeTagText, tagNormalizationKey } from "./tagNormalization";

describe("tag normalization", () => {
  it("normalizes safe presentational differences", () => {
    expect(normalizeTagText("  Business &amp;   Policy ")).toBe("Business & Policy");
    expect(tagNormalizationKey("Cybersecurity")).toBe("cybersecurity");
  });

  it("prefers the most-used established spelling", () => {
    const map = buildCanonicalTagMap([
      { tag: "Cybersecurity", publishedCount: 14, totalCount: 14 },
      { tag: "cybersecurity", publishedCount: 27, totalCount: 27 },
    ]);
    expect(map.get("cybersecurity")).toBe("cybersecurity");
  });

  it("decodes historical HTML entities and deduplicates aliases", () => {
    const map = buildCanonicalTagMap([
      { tag: "Business &amp; Policy", publishedCount: 8, totalCount: 8 },
    ]);
    expect(canonicalizeTagList(["Business &amp; Policy", "Business & Policy"], map)).toEqual(["Business & Policy"]);
  });
});
