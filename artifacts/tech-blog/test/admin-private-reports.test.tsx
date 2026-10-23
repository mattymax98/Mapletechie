// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AdminShell } from "../src/components/admin/AdminShell";
import { AdminGuard } from "../src/components/AdminGuard";

const { useAdminMock } = vi.hoisted(() => ({ useAdminMock: vi.fn() }));
vi.mock("@/context/AdminContext", () => ({ useAdmin: useAdminMock }));
vi.mock("@/lib/adminFetch", () => ({ adminJson: vi.fn(async () => ({ pendingCount: 0 })) }));

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

describe("Private report navigation and direct page access", () => {
  for (const user of [
    { id: 1, role: "admin", isOwner: true },
    { id: 9, role: "admin", isOwner: false },
    { id: 2, role: "editor", isOwner: false },
    { id: 1, role: "admin" }, // Old cached user must fail closed until refreshed.
  ]) {
    it(`gates reports for ${JSON.stringify(user)}`, () => {
      useAdminMock.mockReturnValue({ isAdmin: true, user, logout: vi.fn() });
      const { hook } = memoryLocation({ path: "/admin/analytics" });
      render(<HelmetProvider><Router hook={hook}>
        <AdminShell title="Posts"><main>Posts</main></AdminShell>
        <AdminGuard ownerOnly><div>Private report content</div></AdminGuard>
      </Router></HelmetProvider>);
      expect(!!screen.queryByRole("link", { name: "Analytics", exact: true })).toBe(user.isOwner === true);
      expect(!!screen.queryByRole("link", { name: "Activity", exact: true })).toBe(user.isOwner === true);
      expect(!!screen.queryByText("Private report content")).toBe(user.isOwner === true);
      expect(screen.getByRole("link", { name: "Posts", exact: true })).toBeTruthy();
    });
  }
});
