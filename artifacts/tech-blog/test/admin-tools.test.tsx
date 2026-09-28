// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import AdminTools from "../src/pages/admin/AdminTools";

const { useAdminMock } = vi.hoisted(() => ({ useAdminMock: vi.fn() }));

vi.mock("@/context/AdminContext", () => ({ useAdmin: useAdminMock }));
vi.mock("@/components/admin/AdminShell", () => ({
  AdminShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section><h1>{title}</h1>{children}</section>
  ),
}));
vi.mock("@/pages/admin/AdminJobs", () => ({
  default: () => <div>Jobs tool content</div>,
}));
vi.mock("@/pages/admin/AdminInbox", () => ({
  default: () => <div>Inbox tool content</div>,
}));
vi.mock("@/pages/admin/AdminSendEmail", () => ({
  default: () => <div>Send email tool content</div>,
}));

const userFor = (permissions: Record<string, boolean> = {}) => ({
  role: "editor",
  ...permissions,
});

function renderTools(path: string, permissions: Record<string, boolean> = {}, legacy?: "jobs" | "inbox" | "email") {
  const [pathname, search = ""] = path.split("?");
  const location = memoryLocation({ path: pathname, searchPath: search, record: true });
  useAdminMock.mockReturnValue({ user: userFor(permissions) });
  const view = render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <AdminTools legacy={legacy} />
    </Router>,
  );
  return { ...view, location };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("admin Tools navigation", () => {
  it("shows only authorized tabs for independent permissions and role combinations", () => {
    const cases = [
      { permissions: { canManageJobs: true }, labels: ["Jobs"] },
      { permissions: { canViewInbox: true }, labels: ["Inbox"] },
      { permissions: { canSendEmail: true }, labels: ["Send email"] },
      { permissions: { canManageJobs: true, canSendEmail: true }, labels: ["Jobs", "Send email"] },
      { permissions: { canManageJobs: true, canViewInbox: true, canSendEmail: true }, labels: ["Jobs", "Inbox", "Send email"] },
    ];

    for (const { permissions, labels } of cases) {
      cleanup();
      const { getByRole, queryByRole } = renderTools("/admin/tools", permissions);
      const nav = getByRole("navigation", { name: "Admin tools" });
      for (const label of labels) expect(within(nav).getByRole("link", { name: label })).toBeTruthy();
      for (const label of ["Jobs", "Inbox", "Send email"]) {
        if (!labels.includes(label)) expect(within(nav).queryByRole("link", { name: label })).toBeNull();
      }
      expect(queryByRole("heading", { name: "Tools access unavailable" })).toBeNull();
    }
  });

  it("uses the requested authorized tab and falls back when it is unauthorized", async () => {
    const { findByText, getByRole } = renderTools(
      "/admin/tools?tab=email",
      { canManageJobs: true, canViewInbox: true, canSendEmail: true },
    );
    expect(await findByText("Send email tool content")).toBeTruthy();
    expect(getByRole("navigation", { name: "Admin tools" }).querySelector('a[href="/admin/tools?tab=email"]')?.className)
      .toContain("border-orange-500");

    cleanup();
    const fallback = renderTools("/admin/tools?tab=inbox", { canManageJobs: true, canSendEmail: true });
    expect(await fallback.findByText("Jobs tool content")).toBeTruthy();
    await waitFor(() => expect(fallback.location.history.at(-1)).toBe("/admin/tools?tab=jobs"));
  });

  it.each([
    ["/admin/jobs", "Jobs tool content", "/admin/tools?tab=jobs", "jobs"],
    ["/admin/inbox", "Inbox tool content", "/admin/tools?tab=inbox", "inbox"],
    ["/admin/send-email", "Send email tool content", "/admin/tools?tab=email", "email"],
  ] as const)("maps legacy route %s to its corresponding tool", async (legacyPath, content, canonicalPath, tab) => {
    const { findByText, location } = renderTools(
      legacyPath,
      { canManageJobs: true, canViewInbox: true, canSendEmail: true },
      tab,
    );
    expect(await findByText(content)).toBeTruthy();
    await waitFor(() => expect(location.history.at(-1)).toBe(canonicalPath));
  });

  it("shows the unavailable state when the user has no tool permissions", () => {
    const { getByRole, queryByRole } = renderTools("/admin/tools");
    expect(getByRole("heading", { name: "Tools access unavailable" })).toBeTruthy();
    expect(queryByRole("navigation", { name: "Admin tools" })).toBeNull();
  });
});