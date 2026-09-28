// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AdminShell } from "../src/components/admin/AdminShell";

const { useAdminMock, adminJsonMock } = vi.hoisted(() => ({
  useAdminMock: vi.fn(),
  adminJsonMock: vi.fn(),
}));

vi.mock("@/context/AdminContext", () => ({ useAdmin: useAdminMock }));
vi.mock("@/lib/adminFetch", () => ({ adminJson: adminJsonMock }));

function renderShell(pendingCount: number) {
  const { hook } = memoryLocation({ path: "/admin/review" });
  useAdminMock.mockReturnValue({
    user: { role: "admin", username: "editor", displayName: "Editor" },
    logout: vi.fn(),
  });
  adminJsonMock.mockResolvedValue({ pendingCount });
  return render(
    <Router hook={hook}>
      <AdminShell title="Review queue"><main>Queue</main></AdminShell>
    </Router>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe("admin review navigation count", () => {
  it("does not display a badge when the pending count is zero", async () => {
    renderShell(0);
    const link = await screen.findByRole("link", { name: /Review queue/ });
    await vi.waitFor(() => expect(adminJsonMock).toHaveBeenCalled());
    expect(within(link).queryByText("0")).toBeNull();
  });

  it("displays the positive pending count beside Review queue", async () => {
    renderShell(7);
    await waitFor(() => expect(adminJsonMock).toHaveBeenCalled());
    expect(await screen.findByText("7")).toBeTruthy();
    expect(within(screen.getByRole("link", { name: /Review queue/ })).getByText("7")).toBeTruthy();
  });
});