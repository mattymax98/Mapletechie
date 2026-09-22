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
});