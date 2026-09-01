const CANONICAL_ORIGIN = "https://www.mapletechie.com";
const ARTICLE_PATH = "/blog/best-laptops-2026-definitive-rankings";
const QUERY = "?canonical_probe=1";

const variants = [
  `https://www.mapletechie.com${ARTICLE_PATH}${QUERY}`,
  `https://mapletechie.com${ARTICLE_PATH}${QUERY}`,
  `http://www.mapletechie.com${ARTICLE_PATH}${QUERY}`,
  `http://mapletechie.com${ARTICLE_PATH}${QUERY}`,
];

function fail(message: string): never {
  throw new Error(message);
}

async function request(url: string): Promise<Response> {
  return fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "mapletechie-canonical-host-check/1.0" },
  });
}

async function main(): Promise<void> {
  const expectedTarget = `${CANONICAL_ORIGIN}${ARTICLE_PATH}${QUERY}`;
  const canonicalResponse = await request(variants[0]);
  if (canonicalResponse.status !== 200) {
    fail(`Canonical URL returned ${canonicalResponse.status}: ${variants[0]}`);
  }
  if (canonicalResponse.headers.get("location")) {
    fail(`Canonical URL unexpectedly redirected: ${variants[0]}`);
  }
  console.log(`PASS 200 ${variants[0]}`);

  for (const variant of variants.slice(1)) {
    const response = await request(variant);
    if (response.status !== 301 && response.status !== 308) {
      fail(`Expected a permanent redirect, got ${response.status}: ${variant}`);
    }
    const location = response.headers.get("location");
    if (location !== expectedTarget) {
      fail(`Expected ${expectedTarget}, got ${location || "(no Location)"}: ${variant}`);
    }

    const destination = await request(location);
    if (destination.status !== 200) {
      fail(`Redirect destination returned ${destination.status}: ${location}`);
    }
    if (destination.headers.get("location")) {
      fail(`Redirect destination redirected again: ${location}`);
    }
    console.log(`PASS ${response.status} ${variant} -> ${location} -> 200`);
  }
}

main().catch((error: unknown) => {
  console.error(`FAIL ${(error as Error).message}`);
  process.exitCode = 1;
});