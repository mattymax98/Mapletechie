/**
 * Person structured data (JSON-LD) for author profile pages.
 *
 * Built from the structured profile fields each editor fills in on their
 * admin Profile page (alternate name, job title, location, education,
 * organizations, memberships, reference links). Shared by the crawler
 * prerender server (server.ts) and the SPA author page so both emit the
 * same schema.
 */

export interface AuthorRichProfile {
  username: string;
  displayName?: string | null;
  bio?: string | null;
  alternateName?: string | null;
  jobTitle?: string | null;
  locationCity?: string | null;
  locationRegion?: string | null;
  locationCountry?: string | null;
  education?: string[] | null;
  knowsAbout?: string[] | null;
  organizations?: { name: string; url?: string }[] | null;
  memberships?: { name: string; parentOrganization?: string }[] | null;
  profileLinks?: { label: string; url: string }[] | null;
  twitterUrl?: string | null;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
}

/** True when the author filled in at least one structured profile field. */
export function hasRichProfile(a: AuthorRichProfile): boolean {
  return Boolean(
    a.bio?.trim() ||
      a.alternateName ||
      a.jobTitle ||
      a.locationCity ||
      a.locationRegion ||
      a.locationCountry ||
      a.education?.length ||
      a.knowsAbout?.length ||
      a.organizations?.length ||
      a.memberships?.length ||
      a.profileLinks?.length ||
      socialProfileUrls(a).length,
  );
}

/** Only ever link to http(s) URLs (the API validates too; belt and braces). */
function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Normalize a social/website field to a valid http(s) URL, or null.
 * Editors sometimes save bare domains ("mapletechie.com"); prepend https://
 * when the value looks like a hostname, otherwise skip it entirely.
 */
export function normalizeHttpUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const candidate = isHttpUrl(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    // Require a plausible hostname (contains a dot, no spaces).
    if (!/^[^\s]+\.[^\s.]+$/.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Valid http(s) social-profile URLs from the author's dedicated social fields. */
export function socialProfileUrls(a: AuthorRichProfile): string[] {
  return [a.twitterUrl, a.instagramUrl, a.linkedinUrl, a.githubUrl, a.websiteUrl]
    .map(normalizeHttpUrl)
    .filter((u): u is string => u !== null);
}

/** Public reference links to render visibly on the author page. */
export function visibleProfileLinks(a: AuthorRichProfile): { label: string; url: string }[] {
  return (a.profileLinks ?? []).filter((l) => l.label && l.url && isHttpUrl(l.url));
}

/**
 * Builds a schema.org Person object from an author's profile fields.
 * Returns null when the author has no structured fields filled in.
 */
export function buildPersonJsonLd(
  author: AuthorRichProfile,
  opts: { siteUrl?: string } = {},
): Record<string, unknown> | null {
  if (!hasRichProfile(author)) return null;
  const siteUrl = (opts.siteUrl || "https://mapletechie.com").replace(/\/+$/, "");
  const bio = author.bio?.trim();

  const address =
    author.locationCity || author.locationRegion || author.locationCountry
      ? {
          "@type": "PostalAddress",
          ...(author.locationCity ? { addressLocality: author.locationCity } : {}),
          ...(author.locationRegion ? { addressRegion: author.locationRegion } : {}),
          ...(author.locationCountry ? { addressCountry: author.locationCountry } : {}),
        }
      : null;

  const alumniOf = (author.education ?? []).map((name) => ({
    "@type": "EducationalOrganization",
    name,
  }));

  const worksFor = (author.organizations ?? []).map((o) => ({
    "@type": "Organization",
    name: o.name,
    ...(o.url && isHttpUrl(o.url) ? { url: o.url } : {}),
  }));

  const memberOf = (author.memberships ?? []).map((m) => ({
    "@type": "Organization",
    name: m.name,
    ...(m.parentOrganization
      ? { parentOrganization: { "@type": "Organization", name: m.parentOrganization } }
      : {}),
  }));

  // sameAs = social profiles + reference links, deduped (social fields first —
  // they're exactly what Google uses for entity reconciliation).
  const sameAs = Array.from(
    new Set([...socialProfileUrls(author), ...visibleProfileLinks(author).map((l) => l.url)]),
  );

  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.displayName || author.username,
    ...(author.alternateName ? { alternateName: author.alternateName } : {}),
    ...(author.jobTitle ? { jobTitle: author.jobTitle } : {}),
    url: `${siteUrl}/author/${encodeURIComponent(author.username)}`,
    ...(bio ? { description: bio } : {}),
    ...(address ? { address } : {}),
    ...(alumniOf.length ? { alumniOf: alumniOf.length === 1 ? alumniOf[0] : alumniOf } : {}),
    ...(author.knowsAbout?.length ? { knowsAbout: author.knowsAbout } : {}),
    ...(worksFor.length ? { worksFor: worksFor.length === 1 ? worksFor[0] : worksFor } : {}),
    ...(memberOf.length ? { memberOf: memberOf.length === 1 ? memberOf[0] : memberOf } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}
