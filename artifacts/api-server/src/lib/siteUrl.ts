const DEFAULT_SITE_URL = "https://www.mapletechie.com";

/**
 * Return the public site's absolute URL with one canonical hostname.
 * Staging/custom hosts are preserved, but a stale production apex value is
 * upgraded so generated links cannot silently drift back to the apex.
 */
export function canonicalSiteUrl(value: string | undefined): string {
  const raw = (value || DEFAULT_SITE_URL).trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (url.hostname.toLowerCase() === "mapletechie.com") {
      url.hostname = "www.mapletechie.com";
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function getSiteUrl(): string {
  return canonicalSiteUrl(process.env.SITE_DOMAIN);
}