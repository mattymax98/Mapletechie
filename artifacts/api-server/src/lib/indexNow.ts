/**
 * IndexNow — real-time URL submission to Bing (and Yandex, Seznam).
 *
 * IndexNow lets the site push article URLs to search engines the moment they
 * change instead of waiting for the next Bingbot crawl cycle. Submissions are
 * fire-and-forget: errors are logged but never thrown so a transient network
 * hiccup can never block a publish action.
 *
 * Protocol spec: https://www.indexnow.org/documentation
 */

const SITE_DOMAIN = (process.env.SITE_DOMAIN || "https://mapletechie.com").replace(/\/+$/, "");
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";
const BATCH_SIZE = 10_000; // IndexNow's documented per-request URL limit

/** Read the key at call-time so tests can override it via vi.stubEnv. */
function getKey(): string {
  return (process.env.INDEXNOW_KEY || "").trim();
}

/**
 * Submit a list of canonical URLs to the IndexNow API in batches of up to
 * BATCH_SIZE (10,000) URLs. Each batch is sent as a separate POST request.
 *
 * Returns the total number of URLs that were dispatched to the API across all
 * batches. Returns 0 when skipped (key not configured or empty list). Errors
 * per-batch are suppressed and logged; the caller is never interrupted.
 */
export async function submitToIndexNow(urls: string[]): Promise<number> {
  const key = getKey();
  if (!key || urls.length === 0) return 0;

  const host = SITE_DOMAIN.replace(/^https?:\/\//, "");
  let dispatched = 0;

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(urls.length / BATCH_SIZE);

    try {
      const res = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host,
          key,
          keyLocation: `${SITE_DOMAIN}/${key}.txt`,
          urlList: batch,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      dispatched += batch.length;
      if (res.ok) {
        console.log(
          `[indexnow] batch ${batchNum}/${totalBatches}: submitted ${batch.length} URL(s) — HTTP ${res.status}`,
        );
      } else {
        const body = await res.text().catch(() => "");
        console.error(
          `[indexnow] batch ${batchNum}/${totalBatches}: HTTP ${res.status} ${body.slice(0, 200)}`,
        );
      }
    } catch (err) {
      console.error(
        `[indexnow] batch ${batchNum}/${totalBatches} error:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return dispatched;
}

/** Whether IndexNow is configured (key env var is set and non-empty). */
export function isIndexNowConfigured(): boolean {
  return getKey().length > 0;
}

/**
 * Build the canonical URL set for a published post: the article URL plus all
 * of its category pages. Accepts all categories (primary + secondary) so the
 * full category membership is reflected in every IndexNow submission.
 */
export function buildPostUrls(post: {
  slug: string;
  categorySlugs?: string[] | null;
}): string[] {
  const urls: string[] = [`${SITE_DOMAIN}/blog/${post.slug}`];
  for (const slug of post.categorySlugs ?? []) {
    if (slug) urls.push(`${SITE_DOMAIN}/category/${slug}`);
  }
  return urls;
}
