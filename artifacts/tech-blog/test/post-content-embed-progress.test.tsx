// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostContent } from "../src/components/PostContent";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PostContent embed progress", () => {
  it("marks unresolved embeds failed after the bounded watchdog", async () => {
    vi.useFakeTimers();
    const onEmbedProgress = vi.fn();
    render(
      <PostContent
        html={'<div data-social-embed data-url="https://www.youtube.com/watch?v=vcID0OafOts"></div>'}
        enableAds={false}
        onHeadingsExtracted={() => undefined}
        onEmbedProgress={onEmbedProgress}
      />,
    );

    expect(onEmbedProgress).toHaveBeenLastCalledWith({
      total: 1,
      loading: 1,
      rendered: 0,
      fallback: 0,
      failed: 0,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(onEmbedProgress).toHaveBeenLastCalledWith({
      total: 1,
      loading: 0,
      rendered: 0,
      fallback: 0,
      failed: 1,
    });
  });

  it("uses YouTube player readiness and lets a later error replace rendered state", async () => {
    vi.useFakeTimers();
    const onEmbedProgress = vi.fn();

    render(
      <PostContent
        html={'<div data-social-embed data-url="https://www.youtube.com/watch?v=vcID0OafOts"></div>'}
        enableAds={false}
        onHeadingsExtracted={() => undefined}
        onEmbedProgress={onEmbedProgress}
      />,
    );

    const iframe = document.querySelector<HTMLIFrameElement>('[data-testid="embed-youtube-player"]');
    expect(iframe?.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(iframe?.src).toContain("enablejsapi=1");
    expect(iframe?.src).toContain(encodeURIComponent(window.location.origin));

    act(() => window.dispatchEvent(new MessageEvent("message", {
      data: JSON.stringify({ event: "onReady" }),
      origin: "https://www.youtube-nocookie.com",
      source: iframe?.contentWindow,
    })));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(onEmbedProgress).toHaveBeenLastCalledWith({
      total: 1, loading: 0, rendered: 1, fallback: 0, failed: 0,
    });

    act(() => window.dispatchEvent(new MessageEvent("message", {
      data: JSON.stringify({ event: "onError", info: 153 }),
      origin: "https://www.youtube-nocookie.com",
      source: iframe?.contentWindow,
    })));
    expect(onEmbedProgress).toHaveBeenLastCalledWith({
      total: 1, loading: 0, rendered: 0, fallback: 0, failed: 1,
    });
    expect(document.querySelector('[data-testid="embed-youtube-fallback"]')).toBeNull();
    expect(document.querySelector('[data-testid="embed-youtube-player"]')).not.toBeNull();
  });

  it("tracks two YouTube failures independently alongside a rendered X embed", async () => {
    vi.useFakeTimers();
    const onEmbedProgress = vi.fn();
    window.twttr = {
      widgets: {
        createTweet: vi.fn().mockResolvedValue(document.createElement("div")),
      },
    };

    render(
      <PostContent
        html={[
          '<div data-social-embed data-url="https://x.com/mapletechie/status/123456789"></div>',
          '<div data-social-embed data-url="https://www.youtube.com/watch?v=vcID0OafOts"></div>',
          '<div data-social-embed data-url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"></div>',
        ].join("")}
        enableAds={false}
        onHeadingsExtracted={() => undefined}
        onEmbedProgress={onEmbedProgress}
      />,
    );

    const twitterScript = document.querySelector<HTMLScriptElement>('script[src="https://platform.twitter.com/widgets.js"]');
    act(() => twitterScript?.onload?.(new Event("load")));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const youtubeFrames = Array.from(document.querySelectorAll<HTMLIFrameElement>('[data-testid="embed-youtube-player"]'));
    expect(youtubeFrames).toHaveLength(2);
    act(() => {
      for (const iframe of youtubeFrames) {
        window.dispatchEvent(new MessageEvent("message", {
          data: JSON.stringify({ event: "onReady" }),
          origin: "https://www.youtube-nocookie.com",
          source: iframe.contentWindow,
        }));
      }
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    act(() => {
      for (const iframe of youtubeFrames) {
        window.dispatchEvent(new MessageEvent("message", {
          data: JSON.stringify({ event: "onError", info: 153 }),
          origin: "https://www.youtube-nocookie.com",
          source: iframe.contentWindow,
        }));
      }
    });

    expect(onEmbedProgress).toHaveBeenLastCalledWith({
      total: 3, loading: 0, rendered: 1, fallback: 0, failed: 2,
    });
    expect(document.querySelectorAll('[data-testid="embed-youtube-player"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-testid="embed-youtube-fallback"]')).toHaveLength(0);
  });
});