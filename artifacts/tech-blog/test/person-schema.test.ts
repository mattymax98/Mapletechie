import { describe, it, expect } from "vitest";
import {
  hasRichProfile,
  buildPersonJsonLd,
  socialProfileUrls,
  visibleProfileLinks,
  type AuthorRichProfile,
} from "../src/lib/personSchema";

// Unit tests for the Person JSON-LD builder that powers author Google
// profile cards. A silent regression here would only surface after Google
// re-crawls the live page, so every field-to-schema mapping is pinned down.

const base: AuthorRichProfile = { username: "jane" };

describe("hasRichProfile", () => {
  it("is true for an author with only a bio", () => {
    expect(hasRichProfile({ ...base, bio: "I write about tech." })).toBe(true);
  });

  it("is false for an empty or whitespace-only bio", () => {
    expect(hasRichProfile({ ...base, bio: "" })).toBe(false);
    expect(hasRichProfile({ ...base, bio: "   \n\t " })).toBe(false);
  });

  it("is false when no fields are filled in", () => {
    expect(hasRichProfile(base)).toBe(false);
    expect(
      hasRichProfile({
        ...base,
        bio: null,
        education: [],
        knowsAbout: [],
        organizations: [],
        memberships: [],
        profileLinks: [],
      }),
    ).toBe(false);
  });

  it("is true when only alternate/structured fields are set", () => {
    expect(hasRichProfile({ ...base, alternateName: "Jane Q. Doe" })).toBe(true);
    expect(hasRichProfile({ ...base, jobTitle: "Editor" })).toBe(true);
    expect(hasRichProfile({ ...base, locationCity: "Thunder Bay" })).toBe(true);
    expect(hasRichProfile({ ...base, education: ["Lakehead University"] })).toBe(true);
    expect(hasRichProfile({ ...base, knowsAbout: ["Road safety"] })).toBe(true);
    expect(hasRichProfile({ ...base, organizations: [{ name: "Acme" }] })).toBe(true);
    expect(hasRichProfile({ ...base, memberships: [{ name: "Guild" }] })).toBe(true);
    expect(
      hasRichProfile({ ...base, profileLinks: [{ label: "Site", url: "https://x.com" }] }),
    ).toBe(true);
  });

  it("is true when only a social profile URL is set", () => {
    expect(hasRichProfile({ ...base, twitterUrl: "https://x.com/jane" })).toBe(true);
    // Bare domains count too — they get normalized to https://.
    expect(hasRichProfile({ ...base, websiteUrl: "jane.example.com" })).toBe(true);
  });
});

describe("buildPersonJsonLd", () => {
  it("returns null when the author has no rich profile", () => {
    expect(buildPersonJsonLd(base)).toBeNull();
    expect(buildPersonJsonLd({ ...base, bio: "   " })).toBeNull();
  });

  it("emits a Person with description from the bio", () => {
    const jsonLd = buildPersonJsonLd({
      ...base,
      displayName: "Jane Doe",
      bio: "  I write about tech.  ",
    })!;
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("Person");
    expect(jsonLd.name).toBe("Jane Doe");
    expect(jsonLd.description).toBe("I write about tech.");
    expect(jsonLd.url).toBe("https://mapletechie.com/author/jane");
  });

  it("falls back to the username and respects a custom siteUrl", () => {
    const jsonLd = buildPersonJsonLd(
      { ...base, bio: "Hi" },
      { siteUrl: "https://example.org///" },
    )!;
    expect(jsonLd.name).toBe("jane");
    expect(jsonLd.url).toBe("https://example.org/author/jane");
  });

  it("includes sameAs from profile links, excluding non-http URLs", () => {
    const jsonLd = buildPersonJsonLd({
      ...base,
      bio: "Hi",
      profileLinks: [
        { label: "Council post", url: "https://linkedin.com/posts/123" },
        { label: "Bad", url: "javascript:alert(1)" },
        { label: "Ftp", url: "ftp://files.example.com" },
      ],
    })!;
    expect(jsonLd.sameAs).toEqual(["https://linkedin.com/posts/123"]);
  });

  it("merges social profiles into sameAs first and dedupes", () => {
    const jsonLd = buildPersonJsonLd({
      ...base,
      bio: "Hi",
      twitterUrl: "https://x.com/jane",
      websiteUrl: "jane.example.com",
      profileLinks: [
        { label: "X", url: "https://x.com/jane" },
        { label: "Other", url: "https://other.example.com" },
      ],
    })!;
    expect(jsonLd.sameAs).toEqual([
      "https://x.com/jane",
      "https://jane.example.com/",
      "https://other.example.com",
    ]);
  });

  it("omits optional keys that have no data", () => {
    const jsonLd = buildPersonJsonLd({ ...base, bio: "Hi" })!;
    for (const key of [
      "alternateName",
      "jobTitle",
      "address",
      "alumniOf",
      "knowsAbout",
      "worksFor",
      "memberOf",
      "sameAs",
    ]) {
      expect(jsonLd).not.toHaveProperty(key);
    }
  });

  it("maps structured fields to schema.org shapes", () => {
    const jsonLd = buildPersonJsonLd({
      ...base,
      alternateName: "Jane Q. Doe",
      jobTitle: "Editor",
      locationCity: "Thunder Bay",
      locationRegion: "ON",
      locationCountry: "CA",
      education: ["Lakehead University"],
      knowsAbout: ["Tech", "Safety"],
      organizations: [
        { name: "Mapletechie", url: "https://mapletechie.com" },
        { name: "NoUrl Org", url: "javascript:x" },
      ],
      memberships: [{ name: "Council", parentOrganization: "Parachute" }],
    })!;
    expect(jsonLd.alternateName).toBe("Jane Q. Doe");
    expect(jsonLd.jobTitle).toBe("Editor");
    expect(jsonLd.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Thunder Bay",
      addressRegion: "ON",
      addressCountry: "CA",
    });
    // Single-item arrays collapse to a bare object.
    expect(jsonLd.alumniOf).toEqual({
      "@type": "EducationalOrganization",
      name: "Lakehead University",
    });
    expect(jsonLd.knowsAbout).toEqual(["Tech", "Safety"]);
    expect(jsonLd.worksFor).toEqual([
      { "@type": "Organization", name: "Mapletechie", url: "https://mapletechie.com" },
      { "@type": "Organization", name: "NoUrl Org" }, // unsafe url dropped
    ]);
    expect(jsonLd.memberOf).toEqual({
      "@type": "Organization",
      name: "Council",
      parentOrganization: { "@type": "Organization", name: "Parachute" },
    });
  });

  it("keeps multi-item arrays as arrays", () => {
    const jsonLd = buildPersonJsonLd({
      ...base,
      education: ["Abia State University", "Lakehead University"],
    })!;
    expect(Array.isArray(jsonLd.alumniOf)).toBe(true);
    expect((jsonLd.alumniOf as unknown[]).length).toBe(2);
  });

  it("URL-encodes unusual usernames in the profile url", () => {
    const jsonLd = buildPersonJsonLd({ username: "j doe", bio: "Hi" })!;
    expect(jsonLd.url).toBe("https://mapletechie.com/author/j%20doe");
  });
});

describe("socialProfileUrls", () => {
  it("normalizes bare domains and drops invalid values", () => {
    expect(
      socialProfileUrls({
        ...base,
        twitterUrl: "https://x.com/jane",
        websiteUrl: "jane.example.com",
        linkedinUrl: "not a url",
        githubUrl: "   ",
        instagramUrl: null,
      }),
    ).toEqual(["https://x.com/jane", "https://jane.example.com/"]);
  });
});

describe("visibleProfileLinks", () => {
  it("keeps only labeled http(s) links", () => {
    expect(
      visibleProfileLinks({
        ...base,
        profileLinks: [
          { label: "Good", url: "https://a.com" },
          { label: "", url: "https://b.com" },
          { label: "Bad", url: "javascript:x" },
        ],
      }),
    ).toEqual([{ label: "Good", url: "https://a.com" }]);
  });
});
