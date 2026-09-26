import { afterEach, describe, expect, it } from "vitest";
import { formatLocalDateTime } from "../src/lib/localDateTime";

const originalTz = process.env.TZ;
afterEach(() => { process.env.TZ = originalTz; });

describe("scheduled post editor time", () => {
  it("uses the editor's local wall-clock time and preserves the instant on resave", () => {
    process.env.TZ = "America/Toronto";
    for (const instant of ["2026-07-10T14:30:00.000Z", "2026-12-10T15:30:00.000Z"]) {
      const local = formatLocalDateTime(instant);
      expect(local.endsWith("10:30")).toBe(true);
      expect(new Date(local).toISOString()).toBe(instant);
    }
  });

  it("does not format invalid timestamps", () => {
    expect(formatLocalDateTime("invalid")).toBe("");
  });
});