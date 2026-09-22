// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostContent } from "../src/components/PostContent";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.YT;
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
    let events: {
      onReady: (event: { target: { destroy: () => void } }) => void;
      onError: (event: { target: { destroy: () => void }; data: number }) => void;
    } | undefined;
    const destroy = vi.fn();
    window.YT = {
      Player: class {
        destroy = destroy;
        constructor(_element: HTMLIFrameElement, options: { events: typeof events }) {
          events = options.events;
        }
      },
    };

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
    await act(async () => {
      await Promise.resolve();
    });
    expect(events).toBeDefined();

    act(() => events?.onReady({ target: { destroy } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(onEmbedProgress).toHaveBeenLastCalledWith({
      total: 1, loading: 0, rendered: 1, fallback: 0, failed: 0,
    });

    act(() => events?.onError({ target: { destroy }, data: 153 }));
    expect(onEmbedProgress).toHaveBeenLastCalledWith({
      total: 1, loading: 0, rendered: 0, fallback: 0, failed: 1,
    });
    expect(document.querySelector('[data-testid="embed-youtube-fallback"]')).toBeNull();
    expect(document.querySelector('[data-testid="embed-youtube-player"]')).not.toBeNull();
  });

  it("tracks two YouTube failures independently alongside a rendered X embed", async () => {
    vi.useFakeTimers();
    const onEmbedProgress = vi.fn();
    const players: Array<{
      onReady: (event: { target: { destroy: () => void } }) => void;
      onError: (event: { target: { destroy: () => void }; data: number }) => void;
    }> = [];
    window.YT = {
      Player: class {
        destroy = vi.fn();
        constructor(_element: HTMLIFrameElement, options: { events: typeof players[number] }) {
          players.push(options.events);
        }
      },
    };
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
    expect(players).toHaveLength(2);
    act(() => {
      players[0].onReady({ target: { destroy: vi.fn() } });
      players[1].onReady({ target: { destroy: vi.fn() } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    act(() => {
      players[0].onError({ target: { destroy: vi.fn() }, data: 153 });
      players[1].onError({ target: { destroy: vi.fn() }, data: 153 });
    });

    expect(onEmbedProgress).toHaveBeenLastCalledWith({
      total: 3, loading: 0, rendered: 1, fallback: 0, failed: 2,
    });
    expect(document.querySelectorAll('[data-testid="embed-youtube-player"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-testid="embed-youtube-fallback"]')).toHaveLength(0);
  });
});