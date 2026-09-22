import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const previewPostId = 42;
const previewToken = randomBytes(32).toString("base64url");
const redacted = "[REDACTED]";
const previewContent = [
  "<p>Production preview smoke body.</p>",
  '<div data-social-embed data-url="https://x.com/mapletechie/status/123456789"></div>',
  '<div data-social-embed data-url="https://www.youtube.com/watch?v=M7lc1UVf-VE"></div>',
  '<div data-social-embed data-url="https://youtu.be/M7lc1UVf-VE"></div>',
].join("");

const apiRequests = [];
const childOutput = [];

function sanitize(value) {
  return String(value).split(previewToken).join(redacted);
}

function findChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/repl/tools/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  assert.ok(
    executable,
    "Chromium is required. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to its executable.",
  );
  return executable;
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Production server exited early (${child.exitCode}).\n${childOutput.join("")}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for production server.\n${childOutput.join("")}`);
}

function startMockApi(port) {
  const server = http.createServer((request, response) => {
    if (request.url === "/api/settings/status") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ maintenance: false, message: null, eta: null }));
      return;
    }
    if (request.url === `/api/automation/posts/${previewPostId}/preview`) {
      apiRequests.push({ method: request.method, url: request.url, headers: request.headers });
      if (request.headers["x-preview-token"] !== previewToken) {
        response.writeHead(401, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
      });
      response.end(JSON.stringify({
        post: {
          id: previewPostId,
          title: "Live signed-preview smoke",
          content: previewContent,
          embed_report: { requested: 3, preserved: 3, removed: 0 },
        },
      }));
      return;
    }
    response.writeHead(404);
    response.end("Not found");
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

const twitterFixture = `
  window.twttr = {
    widgets: {
      createTweet: async function(id, holder) {
        const widget = document.createElement("div");
        widget.setAttribute("data-smoke-x-widget", id);
        widget.style.height = "250px";
        holder.appendChild(widget);
        return widget;
      }
    }
  };
`;

function assertOriginOnlyReferrer(value, siteOrigin) {
  assert.ok(value, "YouTube iframe request omitted its Referer");
  const referrer = new URL(value);
  assert.equal(referrer.origin, siteOrigin);
  assert.equal(referrer.pathname, "/");
  assert.equal(referrer.search, "");
  assert.equal(referrer.hash, "");
}

async function checkViewport(browser, siteOrigin, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{
    name: "preview-smoke-cookie",
    value: "must-not-leak",
    url: siteOrigin,
  }]);
  const page = await context.newPage();
  const youtubeRequests = [];
  const browserErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.addInitScript(() => {
    window.__previewSmokeYouTubeErrors = [];
    window.addEventListener("message", (event) => {
      if (event.origin !== "https://www.youtube-nocookie.com" &&
          event.origin !== "https://www.youtube.com") return;
      let payload = event.data;
      try { if (typeof payload === "string") payload = JSON.parse(payload); } catch {}
      if (!payload || typeof payload !== "object" || payload.event !== "onError") return;
      const frame = Array.from(document.querySelectorAll("iframe"))
        .find((candidate) => candidate.contentWindow === event.source);
      window.__previewSmokeYouTubeErrors.push({
        code: payload.info,
        src: frame?.getAttribute("src") ?? "unknown",
      });
    });
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "www.youtube-nocookie.com" &&
        url.pathname.startsWith("/embed/") &&
        request.resourceType() === "document") {
      youtubeRequests.push({
        url: request.url(),
        referer: request.headers().referer,
      });
    }
  });
  await page.route("https://platform.twitter.com/widgets.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: twitterFixture,
    });
  });
  const path = `/preview/posts/${previewPostId}`;
  const response = await page.goto(`${siteOrigin}${path}#token=${previewToken}`, {
    waitUntil: "domcontentloaded",
  });
  assert.ok(response);
  assert.equal(response.status(), 200);
  assert.equal(response.headers()["cache-control"], "private, no-store");
  assert.equal(response.headers()["x-robots-tag"], "noindex, nofollow, noarchive");
  assert.equal(response.headers()["referrer-policy"], "strict-origin-when-cross-origin");

  await page.waitForSelector('[data-preview-ready="true"]', { timeout: 15_000 });
  assert.equal(page.url(), `${siteOrigin}${path}`);
  assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex, nofollow, noarchive");
  assert.equal(
    await page.locator('meta[name="referrer"]').getAttribute("content"),
    "strict-origin-when-cross-origin",
  );

  const article = page.locator('[data-testid="preview-article"]');
  assert.ok(!(await page.content()).includes(previewToken));
  const counters = await article.evaluate((element) => ({
    total: element.getAttribute("data-preview-total"),
    loading: element.getAttribute("data-preview-loading"),
    rendered: element.getAttribute("data-preview-rendered"),
    fallback: element.getAttribute("data-preview-fallback"),
    failed: element.getAttribute("data-preview-failed"),
    requested: element.getAttribute("data-preview-requested"),
    preserved: element.getAttribute("data-preview-preserved"),
    removed: element.getAttribute("data-preview-removed"),
  }));
  const youtubeErrors = await page.evaluate(() => window.__previewSmokeYouTubeErrors);
  assert.deepEqual(counters, {
    total: "3",
    loading: "0",
    rendered: "3",
    fallback: "0",
    failed: "0",
    requested: "3",
    preserved: "3",
    removed: "0",
  }, `Unexpected final embed counters. YouTube errors: ${JSON.stringify(youtubeErrors)}. Browser errors: ${browserErrors.join(" | ") || "none"}`);

  const youtubeFrames = page.locator('[data-testid="embed-youtube-player"]');
  assert.equal(await youtubeFrames.count(), 2);
  for (let index = 0; index < 2; index += 1) {
    const src = await youtubeFrames.nth(index).getAttribute("src");
    assert.ok(src?.startsWith("https://www.youtube-nocookie.com/embed/"));
    assert.notEqual(src, "about:blank");
  }
  assert.equal(await page.locator("[data-smoke-x-widget]").count(), 1);
  assert.equal(youtubeRequests.length, 2);
  for (const request of youtubeRequests) {
    assertOriginOnlyReferrer(request.referer, siteOrigin);
    assert.ok(!request.url.includes(previewToken));
  }
  assert.ok(!browserErrors.some((message) => /\b153\b|about:blank/i.test(message)), browserErrors.join("\n"));

  await context.close();
}

let mockApi;
let productionServer;
let browser;

try {
  const [apiPort, webPort] = await Promise.all([reservePort(), reservePort()]);
  mockApi = await startMockApi(apiPort);
  const siteOrigin = `http://127.0.0.1:${webPort}`;
  productionServer = spawn(process.execPath, ["--enable-source-maps", "./dist/server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(webPort),
      API_BASE: `http://127.0.0.1:${apiPort}`,
      SITE_URL: siteOrigin,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  productionServer.stdout.on("data", (chunk) => childOutput.push(sanitize(chunk)));
  productionServer.stderr.on("data", (chunk) => childOutput.push(sanitize(chunk)));
  await waitForServer(`${siteOrigin}/preview/posts/${previewPostId}`, productionServer);

  browser = await chromium.launch({
    executablePath: findChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  await checkViewport(browser, siteOrigin, { width: 1280, height: 900 });
  await checkViewport(browser, siteOrigin, { width: 390, height: 844 });

  assert.equal(apiRequests.length, 2);
  for (const request of apiRequests) {
    assert.equal(request.method, "GET");
    assert.equal(request.url, `/api/automation/posts/${previewPostId}/preview`);
    assert.equal(request.headers["x-preview-token"], previewToken);
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers.referer, undefined);
  }
  process.stdout.write("Signed-preview production smoke passed at desktop and mobile sizes. Token redacted.\n");
} catch (error) {
  process.stderr.write(`${sanitize(error?.stack ?? error)}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (productionServer && productionServer.exitCode === null) {
    productionServer.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => productionServer.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (productionServer.exitCode === null) productionServer.kill("SIGKILL");
  }
  if (mockApi) await new Promise((resolve) => mockApi.close(resolve));
}