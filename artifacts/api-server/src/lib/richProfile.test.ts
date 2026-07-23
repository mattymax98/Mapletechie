import { describe, it, expect } from "vitest";
import { sanitizeRichProfile, RichProfileError } from "./richProfile";

describe("sanitizeRichProfile", () => {
  it("trims text fields and clears empties to null", () => {
    const u = sanitizeRichProfile({ alternateName: "  Jane Q  ", jobTitle: "   " });
    expect(u.alternateName).toBe("Jane Q");
    expect(u.jobTitle).toBeNull();
  });

  it("ignores fields not present in the body", () => {
    expect(sanitizeRichProfile({ bio: "hi" })).toEqual({});
  });

  it("rejects non-http(s) URLs in profile links", () => {
    expect(() =>
      sanitizeRichProfile({ profileLinks: [{ label: "x", url: "javascript:alert(1)" }] }),
    ).toThrow(RichProfileError);
    expect(() =>
      sanitizeRichProfile({ profileLinks: [{ label: "x", url: "data:text/html,hi" }] }),
    ).toThrow(RichProfileError);
    expect(() =>
      sanitizeRichProfile({ profileLinks: [{ label: "x", url: "not a url" }] }),
    ).toThrow(RichProfileError);
  });

  it("drops org extra keys and optional empty urls", () => {
    const u = sanitizeRichProfile({
      organizations: [{ name: " Acme ", url: "", __proto__: { hacked: true }, evil: 1 }],
    });
    expect(u.organizations).toEqual([{ name: "Acme" }]);
  });

  it("clears list fields with empty arrays or null", () => {
    expect(sanitizeRichProfile({ education: [] }).education).toBeNull();
    expect(sanitizeRichProfile({ education: null }).education).toBeNull();
    expect(sanitizeRichProfile({ profileLinks: [{ label: "", url: "" }] }).profileLinks).toBeNull();
  });

  it("caps oversize input", () => {
    expect(() => sanitizeRichProfile({ alternateName: "x".repeat(201) })).toThrow(RichProfileError);
    expect(() =>
      sanitizeRichProfile({ education: Array.from({ length: 21 }, (_, i) => `School ${i}`) }),
    ).toThrow(RichProfileError);
  });

  it("keeps valid structured data", () => {
    const u = sanitizeRichProfile({
      education: ["A U", " B U "],
      memberships: [{ name: "Council", parentOrganization: "Parent" }],
      profileLinks: [{ label: "Site", url: "https://example.com" }],
    });
    expect(u.education).toEqual(["A U", "B U"]);
    expect(u.memberships).toEqual([{ name: "Council", parentOrganization: "Parent" }]);
    expect(u.profileLinks).toEqual([{ label: "Site", url: "https://example.com" }]);
  });
});
