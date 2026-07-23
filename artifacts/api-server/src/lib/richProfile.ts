import type { ProfileOrganization, ProfileMembership, ProfileLink, User } from "@workspace/db";

/**
 * Validation for the structured "rich profile" fields editors can set
 * themselves (used for Person schema markup on public author pages).
 *
 * All fields are optional; present-but-empty values clear the column (null).
 * URLs must be http(s) so no unsafe values (javascript:, data:) ever reach
 * the public page or the JSON-LD sameAs list.
 */

const MAX_TEXT = 200;
const MAX_ITEMS = 20;

export const RICH_PROFILE_TEXT_FIELDS = [
  "alternateName",
  "jobTitle",
  "locationCity",
  "locationRegion",
  "locationCountry",
] as const;

export class RichProfileError extends Error {}

function cleanText(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new RichProfileError(`${field} must be a string`);
  const t = value.trim();
  if (t.length > MAX_TEXT) throw new RichProfileError(`${field} must be at most ${MAX_TEXT} characters`);
  return t || null;
}

// Looks like a bare domain the user forgot the scheme on, e.g.
// "linkedin.com/in/jane" or "www.example.ca?x=1".
const BARE_DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i;

function cleanHttpUrl(value: unknown, field: string): string {
  if (typeof value !== "string") throw new RichProfileError(`${field} must be a string URL`);
  let t = value.trim();
  if (t.length > 500) throw new RichProfileError(`${field} is too long`);
  // Forgive a missing scheme: normalize bare domains to https.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t) && BARE_DOMAIN_RE.test(t)) {
    t = `https://${t}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(t);
  } catch {
    throw new RichProfileError(`${field} must be a valid URL (e.g. https://example.com)`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new RichProfileError(`${field} must start with http:// or https://`);
  }
  return t;
}

function cleanArray<T>(value: unknown, field: string, map: (item: unknown, i: number) => T | null): T[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) throw new RichProfileError(`${field} must be a list`);
  if (value.length > MAX_ITEMS) throw new RichProfileError(`${field} can have at most ${MAX_ITEMS} entries`);
  const out = value.map(map).filter((v): v is T => v !== null);
  return out.length ? out : null;
}

/**
 * Extracts and validates any rich-profile fields present in a request body.
 * Returns a partial user update. Throws RichProfileError on invalid input.
 */
export function sanitizeRichProfile(body: Record<string, unknown>): Partial<User> {
  const update: Partial<User> = {};

  for (const k of RICH_PROFILE_TEXT_FIELDS) {
    if (k in body) update[k] = cleanText(body[k], k);
  }

  if ("education" in body) {
    update.education = cleanArray(body.education, "education", (item, i) => cleanText(item, `education[${i}]`));
  }
  if ("knowsAbout" in body) {
    update.knowsAbout = cleanArray(body.knowsAbout, "knowsAbout", (item, i) => cleanText(item, `knowsAbout[${i}]`));
  }
  if ("organizations" in body) {
    update.organizations = cleanArray<ProfileOrganization>(body.organizations, "organizations", (item, i) => {
      if (item == null || typeof item !== "object") throw new RichProfileError(`organizations[${i}] must be an object`);
      const o = item as Record<string, unknown>;
      const name = cleanText(o.name, `organizations[${i}].name`);
      if (!name) return null;
      const url =
        o.url != null && String(o.url).trim() !== ""
          ? cleanHttpUrl(o.url, `organizations[${i}].url`)
          : undefined;
      return url ? { name, url } : { name };
    });
  }
  if ("memberships" in body) {
    update.memberships = cleanArray<ProfileMembership>(body.memberships, "memberships", (item, i) => {
      if (item == null || typeof item !== "object") throw new RichProfileError(`memberships[${i}] must be an object`);
      const m = item as Record<string, unknown>;
      const name = cleanText(m.name, `memberships[${i}].name`);
      if (!name) return null;
      const parentOrganization = cleanText(m.parentOrganization, `memberships[${i}].parentOrganization`) ?? undefined;
      return parentOrganization ? { name, parentOrganization } : { name };
    });
  }
  if ("profileLinks" in body) {
    update.profileLinks = cleanArray<ProfileLink>(body.profileLinks, "profileLinks", (item, i) => {
      if (item == null || typeof item !== "object") throw new RichProfileError(`profileLinks[${i}] must be an object`);
      const l = item as Record<string, unknown>;
      const label = cleanText(l.label, `profileLinks[${i}].label`);
      if (label == null && (l.url == null || String(l.url).trim() === "")) return null;
      if (!label) throw new RichProfileError(`profileLinks[${i}] needs a label`);
      const url = cleanHttpUrl(l.url, `profileLinks[${i}].url`);
      return { label, url };
    });
  }

  return update;
}
