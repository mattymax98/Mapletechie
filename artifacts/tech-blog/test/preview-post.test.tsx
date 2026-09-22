// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import PreviewPost from "../src/pages/preview-post";

const content = [
  "<p>Stored preview body.</p>",
  '<div data-social-embed data-url="https://www.youtube.com/watch?v=abc123"></div>',
  '<div data-social-embed data-url="https://x.com/mapletechie/status/123456789"></div>',
].join("");

function renderPreview(path = "/preview/posts/42") {
  const { hook } = memoryLocation({ path });
  return render(
    <HelmetProvider>
      <Router hook={hook}>
        <Route path="/preview/posts/:id" component={PreviewPost} />
      </Router>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  document.head.innerHTML = "";
  window.history.replaceState({}, "", "/preview/posts/42#token=signed-token");
  // Provider script loading is deliberately simulated as blocked. The preview
  // must render its stored content and fallback cards without live X/YouTube.
  const appendChild = document.head.appendChild.bind(document.head);
  vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
    const result = appendChild(node);
    if (node instanceof HTMLScriptElement) queueMicrotask(() => node.onerror?.(new Event("error")));
    return result;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("signed post preview", () => {
  it("fetches the automation preview with no credentials and no referrer", async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      expect(window.location.hash).toBe("");
      return Promise.resolve(new Response(JSON.stringify({ post: { id: 42, title: "Preview title", content: "<p>Stored preview body.</p>" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPreview();
    await waitFor(() => expect(document.querySelector("h1")?.textContent).toBe("Preview title"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/automation/posts/42/preview",
      expect.objectContaining({
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: expect.any(AbortSignal),
        headers: { "X-Preview-Token": "signed-token" },
      }),
    );
    expect(window.location.hash).toBe("");
  });

  it("renders stored HTML with a ready YouTube player and visible X fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          post: {
            id: 42,
            title: "Embed preview",
            content,
            embed_report: { requested: 3, preserved: 2, removed: 1 },
          },
        }), { status: 200 }),
      ),
    );

    renderPreview();
    await waitFor(() => {
      expect(document.body.textContent).toContain("Stored preview body.");
      expect(
        document.querySelector('[data-testid="embed-tweet"]') ??
        document.querySelector('[data-testid="embed-link-card"][href*="x.com"]'),
      ).not.toBeNull();
    });
    const youtube = document.querySelector<HTMLIFrameElement>('[data-testid="embed-youtube-player"]');
    expect(youtube).not.toBeNull();
    window.dispatchEvent(new MessageEvent("message", {
      data: JSON.stringify({ event: "onReady" }),
      origin: "https://www.youtube-nocookie.com",
      source: youtube?.contentWindow,
    }));
    await waitFor(() => expect(document.querySelector("[data-preview-ready]")?.getAttribute("data-preview-ready")).toBe("true"));
    const article = document.querySelector("[data-preview-ready]");
    expect(article?.getAttribute("data-preview-total")).toBe("2");
    expect(article?.getAttribute("data-preview-loading")).toBe("0");
    expect(article?.getAttribute("data-preview-rendered")).toBe("1");
    expect(article?.getAttribute("data-preview-fallback")).toBe("1");
    expect(article?.getAttribute("data-preview-failed")).toBe("0");
    expect(article?.getAttribute("data-preview-requested")).toBe("3");
    expect(article?.getAttribute("data-preview-preserved")).toBe("2");
    expect(article?.getAttribute("data-preview-removed")).toBe("1");
    expect(document.querySelectorAll("script[src*='twitter.com']")).toHaveLength(1);
  });

  it("keeps noindex while allowing only an origin-level cross-origin referrer", async () => {
    document.head.innerHTML = [
      '<meta name="robots" content="noindex, nofollow, noarchive" />',
      '<meta name="referrer" content="strict-origin-when-cross-origin" />',
    ].join("");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ post: { id: 42, title: "Metadata preview", content: "<p>Body</p>" } }), { status: 200 }),
    ));
    renderPreview();
    await waitFor(() => expect(document.querySelector("h1")?.textContent).toBe("Metadata preview"));
    expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow, noarchive");
    expect(document.head.querySelectorAll('meta[name="referrer"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[name="referrer"]')?.getAttribute("content")).toBe("strict-origin-when-cross-origin");
  });

  it("shows an explicit error for an expired or rejected preview", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("expired", { status: 410 })));
    renderPreview();
    await waitFor(() => expect(document.querySelector('[data-testid="preview-error"]')?.textContent).toContain("Preview unavailable or expired."));
  });
});