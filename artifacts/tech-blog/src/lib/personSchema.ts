/**
 * Person structured data (JSON-LD) for founder/editor profile pages.
 *
 * Currently only Matthew's author page carries a Person schema — the facts
 * below (alternate name, education, organizations, memberships) are not
 * stored in the users table, so they live here as a single source shared by
 * the crawler prerender server (server.ts) and the SPA author page.
 */

export const MATTHEW_USERNAME = "matthew";

/** Public links that back up the schema's claims, also rendered visibly. */
export const MATTHEW_PROFILE_LINKS = [
  { label: "TownZest", url: "https://townzest.ca" },
  {
    label: "Canadian Youth Road Safety Council",
    url: "https://www.linkedin.com/posts/cyrsw2025-ourfutureroads-share-7385038629305454592-O87s",
  },
] as const;

export function matthewPersonJsonLd(opts: { bio?: string | null; siteUrl?: string } = {}) {
  const siteUrl = (opts.siteUrl || "https://mapletechie.com").replace(/\/+$/, "");
  const bio = opts.bio?.trim();
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Matthew Mbaka",
    alternateName: "Matthew Mbaka Ogbu",
    jobTitle: "Founder & Editor, Mapletechie",
    url: `${siteUrl}/author/${MATTHEW_USERNAME}`,
    ...(bio ? { description: bio } : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: "Thunder Bay",
      addressRegion: "ON",
      addressCountry: "CA",
    },
    alumniOf: [
      { "@type": "EducationalOrganization", name: "Abia State University" },
      { "@type": "EducationalOrganization", name: "Lakehead University" },
    ],
    knowsAbout: [
      "Electrical and Electronics Engineering",
      "Web Design",
      "Technology Journalism",
      "Social Work",
      "Road Safety",
    ],
    worksFor: [
      { "@type": "Organization", name: "Mapletechie", url: siteUrl },
      { "@type": "Organization", name: "TownZest", url: "https://townzest.ca" },
    ],
    memberOf: {
      "@type": "Organization",
      name: "Canadian Youth Road Safety Council",
      parentOrganization: { "@type": "Organization", name: "Parachute" },
    },
    affiliation: { "@type": "Organization", name: "Canadian Red Cross" },
    sameAs: MATTHEW_PROFILE_LINKS.map((l) => l.url),
  };
}
