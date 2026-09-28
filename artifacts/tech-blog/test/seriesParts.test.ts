import { describe, expect, it } from "vitest";
import { seriesPartLabel } from "../src/lib/seriesParts";

describe("public series part labels", () => {
  it("uses the assigned number even when earlier parts are unpublished", () => {
    expect(seriesPartLabel([{ seriesPosition: 3 }], 0)).toBe("Part 3");
  });
  it("distinguishes pre-existing duplicate part numbers without changing records", () => {
    const parts = [{ seriesPosition: 2 }, { seriesPosition: 2 }, { seriesPosition: 4 }];
    expect(parts.map((_, index) => seriesPartLabel(parts, index))).toEqual([
      "Part 2 (entry 1)", "Part 2 (entry 2)", "Part 4",
    ]);
  });
});