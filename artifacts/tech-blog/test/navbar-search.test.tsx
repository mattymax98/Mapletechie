// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { Navbar } from "../src/components/layout/Navbar";

vi.mock("@workspace/api-client-react", () => ({
  useListCategories: () => ({ data: [] }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "dark",
    resolvedTheme: "dark",
    setTheme: vi.fn(),
  }),
}));

afterEach(() => cleanup());

describe("public navbar search", () => {
  it("keeps Search visible in the mobile header and navigates to the search page", () => {
    const location = memoryLocation({ path: "/", record: true });
    render(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <Navbar />
      </Router>,
    );

    const search = screen.getByRole("button", { name: "Search" });
    expect(search.className).not.toContain("hidden");
    expect(screen.getByRole("button", { name: "Open menu" })).toBeTruthy();

    fireEvent.click(search);
    expect(location.history.at(-1)).toBe("/search");
  });
});
