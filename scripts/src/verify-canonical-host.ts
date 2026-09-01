const CANONICAL_ORIGIN = "https://www.mapletechie.com";
const ARTICLE_PATH = "/blog/best-laptops-2026-definitive-rankings";
const QUERY = "?canonical_probe=1";
const USER_AGENT = "mapletechie-canonical-host-check/1.0";
const REQUEST_TIMEOUT_MS = 15_000;

const variants = [
  `https://www.mapletechie.com${ARTICLE_PATH}${QUERY}`,
  `https://mapletechie.com${ARTICLE_PATH}${QUERY}`,
  `http://www.mapletechie.com${ARTICLE_PATH}${QUERY}`,
  `http://mapletechie.com${ARTICLE_PATH}${QUERY}`,
] as const;

function fail(message: string): never {
  throw new Error(message);
}

async function request(url: string): Promise<Response> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return fetch(url, {
    redirect: "manual",
    headers: { "user-agent": USER_AGENT },
    signal,
  });
}

function assertRailwayResponse(response: Response, url: string): void {
  if (!response.headers.get("x-railway-request-id")) {
    fail(`Final URL did not return a Railway response: ${url}`);
  }
}

async function verifyCanonical(url: string): Promise<void> {
  let response: Response;
  try {
    response = await request(url);
  } catch (error) {
    fail(`Canonical request failed: ${url}: ${(error as Error).message}`);
  }

  if (response.status !== 200) {
    fail(`Canonical URL returned ${response.status}: ${url}`);
  }
  if (response.headers.get("location")) {
    fail(`Canonical URL unexpectedly redirected: ${url}`);
  }
  assertRailwayResponse(response, url);
  console.log(`PASS 200 Railway ${url}`);
}

async function verifyRedirect(
  variant: string,
  expectedTarget: string,
): Promise<void> {
  let response: Response;
  try {
    response = await request(variant);
  } catch (error) {
    fail(
      `Request failed for public variant ${variant}: ${(error as Error).message}`,
    );
  }

  if (response.status !== 301 && response.status !== 308) {
    fail(
      `Public variant regressed (${variant}): expected a permanent redirect, got ${response.status}`,
    );
  }
  const location = response.headers.get("location");
  if (location !== expectedTarget) {
    fail(
      `Public variant regressed (${variant}): expected ${expectedTarget}, got ${
        location || "(no Location)"
      }`,
    );
  }

  let destination: Response;
  try {
    destination = await request(location);
  } catch (error) {
    fail(
      `Final URL request failed for public variant ${variant} (${location}): ${(error as Error).message}`,
    );
  }
  if (destination.status !== 200) {
    fail(
      `Final URL failed for public variant ${variant}: ${location} returned ${destination.status}`,
    );
  }
  if (destination.headers.get("location")) {
    fail(
      `Public variant regressed (${variant}): final URL redirected again: ${location}`,
    );
  }
  assertRailwayResponse(destination, `${variant} -> ${location}`);
  console.log(
    `PASS ${response.status} ${variant} -> ${location} -> 200 Railway`,
  );
}

async function main(): Promise<void> {
  const expectedTarget = `${CANONICAL_ORIGIN}${ARTICLE_PATH}${QUERY}`;
  await verifyCanonical(variants[0]);

  for (const variant of variants.slice(1)) {
    await verifyRedirect(variant, expectedTarget);
  }
}

main().catch((error: unknown) => {
  console.error(`FAIL ${(error as Error).message}`);
  process.exitCode = 1;
});
