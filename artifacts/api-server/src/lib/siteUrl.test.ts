import { describe, expect, it } from "vitest";
import { canonicalSiteUrl } from "./siteUrl";

describe("canonicalSiteUrl", () => {
  it("defaults to the HTTPS www hostname", () => {
    expect(canonicalSiteUrl(undefined)).toBe("https://www.mapletechie.com");
  });

  it("upgrades a stale apex production value", () => {
    expect(canonicalSiteUrl("https://mapletechie.com/")).toBe(
      "https://www.mapletechie.com",
    );
    expect(canonicalSiteUrl("mapletechie.com")).toBe(
      "https://www.mapletechie.com",
    );
  });

  it("preserves non-production hosts for tests and staging", () => {
    expect(canonicalSiteUrl("https://staging.example.test/")).toBe(
      "https://staging.example.test",
    );
  });
});