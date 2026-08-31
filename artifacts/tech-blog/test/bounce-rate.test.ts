import { describe, expect, it } from "vitest";
import {
  BOUNCE_RATE_DEFINITION,
  formatBounceRate,
} from "../src/lib/bounceRate";

describe("bounce-rate display", () => {
  it("explains that empty session data is insufficient", () => {
    expect(formatBounceRate(null, 0)).toBe("Not enough data");
  });

  it("displays a one-page session rate", () => {
    expect(formatBounceRate(100, 1)).toBe("100%");
  });

  it("displays a multi-page session rate", () => {
    expect(formatBounceRate(0, 1)).toBe("0%");
  });

  it("keeps the metric definition beside the display", () => {
    expect(BOUNCE_RATE_DEFINITION).toContain("Single-page sessions");
    expect(BOUNCE_RATE_DEFINITION).toContain("valid session ID");
  });
});