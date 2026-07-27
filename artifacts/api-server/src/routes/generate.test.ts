import { describe, it, expect } from "vitest";
import { buildSystemPrompt, CATEGORY_TO_COVER } from "./generate";

// The AI draft generator once carried a hardcoded category list that drifted
// from the real site categories, so drafts could be filed under categories
// whose pages 404. The prompt is now built from the database at request time;
// these tests pin the contract.

describe("buildSystemPrompt", () => {
  it("lists exactly the categories it is given, slug first", () => {
    const prompt = buildSystemPrompt([
      { slug: "ai", name: "AI" },
      { slug: "canada-tech", name: "Canada Tech" },
    ]);
    expect(prompt).toContain("- ai (AI)");
    expect(prompt).toContain("- canada-tech (Canada Tech)");
    // None of the old phantom slugs may be baked into the template itself.
    for (const phantom of [
      "ai-machine-learning",
      "cybersecurity",
      "electric-vehicles",
      "science-space",
    ]) {
      expect(prompt).not.toContain(phantom);
    }
  });

  it("still instructs the model to pick exactly one category and return JSON", () => {
    const prompt = buildSystemPrompt([{ slug: "ai", name: "AI" }]);
    expect(prompt).toContain("you MUST pick exactly one");
    expect(prompt).toContain('"category": "one of the slugs above"');
  });
});

describe("CATEGORY_TO_COVER", () => {
  it("only maps real category slugs", () => {
    const realSlugs = new Set([
      "ai",
      "business",
      "canada-tech",
      "gadgets",
      "gaming",
      "news",
      "reviews",
      "software",
    ]);
    for (const slug of Object.keys(CATEGORY_TO_COVER)) {
      expect(realSlugs.has(slug), `unexpected cover mapping for "${slug}"`).toBe(true);
    }
  });
});
