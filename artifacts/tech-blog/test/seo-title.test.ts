import { describe, it, expect } from "vitest";
import {
  buildSeoTitle,
  SEO_TITLE_MAX,
  BRAND_SUFFIX,
  DEFAULT_SITE_TITLE,
} from "../src/lib/seoTitle";

describe("buildSeoTitle", () => {
  it("returns the site default when no page title is given", () => {
    expect(buildSeoTitle()).toBe(DEFAULT_SITE_TITLE);
    expect(buildSeoTitle("")).toBe(DEFAULT_SITE_TITLE);
    expect(buildSeoTitle("   ")).toBe(DEFAULT_SITE_TITLE);
    expect(DEFAULT_SITE_TITLE.length).toBeLessThanOrEqual(SEO_TITLE_MAX);
  });

  it("keeps the full brand suffix for short titles", () => {
    expect(buildSeoTitle("Contact Us")).toBe(`Contact Us${BRAND_SUFFIX}`);
  });

  it("drops the suffix when the combined title would be too long", () => {
    // 64 chars on its own — fits alone, but not with " | Mapletechie".
    const base =
      "PlayStation Network Outage Shows the Risk of Digital-Only Gaming";
    const result = buildSeoTitle(base);
    expect(result).toBe(base);
    expect(result.length).toBeLessThanOrEqual(SEO_TITLE_MAX);
  });

  it("truncates an extreme title at a word boundary with an ellipsis", () => {
    const base =
      "An Extremely Long Editorial Headline That Rambles On And On About Every Topic Imaginable In Tech";
    const result = buildSeoTitle(base);
    expect(result.length).toBeLessThanOrEqual(SEO_TITLE_MAX);
    expect(result.endsWith("…")).toBe(true);
    // Never cut mid-word: everything before the ellipsis must be a prefix of
    // the original ending at a word boundary.
    const stem = result.slice(0, -1);
    expect(base.startsWith(stem)).toBe(true);
    expect(base[stem.length]).toBe(" ");
  });

  it("strips trailing punctuation before the ellipsis", () => {
    const base =
      "A Long Headline Ending Exactly At Punctuation, With More And More And More Words";
    const result = buildSeoTitle(base);
    expect(result).not.toMatch(/[.,;:!?—–\s-]…$/);
    expect(result.length).toBeLessThanOrEqual(SEO_TITLE_MAX);
  });

  it("supports a custom suffix (careers pages)", () => {
    expect(buildSeoTitle("Senior Editor", " | Mapletechie Careers")).toBe(
      "Senior Editor | Mapletechie Careers",
    );
  });
});
