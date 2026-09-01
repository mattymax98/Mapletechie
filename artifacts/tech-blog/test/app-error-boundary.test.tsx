// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  AppErrorBoundary,
  isStaleChunkError,
  reloadOnceForStaleChunk,
  __resetReloadGuardForTests,
} from "../src/components/AppErrorBoundary";

describe("isStaleChunkError", () => {
  it("recognises the browser messages produced by a stale lazy chunk", () => {
    const messages = [
      "Failed to fetch dynamically imported module: https://www.mapletechie.com/assets/our-team-abc.js",
      "error loading dynamically imported module",
      "Importing a module script failed.",
      "Failed to load module script: The server responded with a non-JavaScript MIME type",
    ];
    for (const m of messages) {
      expect(isStaleChunkError(new Error(m))).toBe(true);
    }
  });

  it("ignores unrelated errors", () => {
    expect(isStaleChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe("reloadOnceForStaleChunk", () => {
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    __resetReloadGuardForTests();
    reload.mockClear();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      writable: true,
    });
  });

  it("reloads on the first stale-chunk failure", () => {
    expect(reloadOnceForStaleChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does NOT reload again within the cooldown window (no reload loop)", () => {
    expect(reloadOnceForStaleChunk()).toBe(true);
    expect(reloadOnceForStaleChunk()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("allows another reload after the cooldown has passed (next publish)", () => {
    sessionStorage.setItem("mapletechie_chunk_reload", String(Date.now() - 120_000));
    expect(reloadOnceForStaleChunk()).toBe(true);
  });

  it("still reloads at most once when sessionStorage is unavailable", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });
    try {
      expect(reloadOnceForStaleChunk()).toBe(true);
      expect(reloadOnceForStaleChunk()).toBe(false); // in-memory guard holds
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

describe("AppErrorBoundary", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function Boom(): never {
    throw new Error("render exploded");
  }

  it("renders children normally", () => {
    render(
      <AppErrorBoundary>
        <p>all good</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeTruthy();
  });

  it("shows the friendly fallback with a reload button instead of a blank screen", () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByRole("button", { name: /reload page/i })).toBeTruthy();
  });
});
