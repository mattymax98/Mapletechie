// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import AdminInbox from "../src/pages/admin/AdminInbox";

const { useAdminMock } = vi.hoisted(() => ({ useAdminMock: vi.fn() }));
vi.mock("@/context/AdminContext", () => ({ useAdmin: useAdminMock }));
vi.mock("@/components/admin/AdminShell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Inbox job applications permission", () => {
  it("does not offer or fetch job applications for an inbox-only editor", async () => {
    useAdminMock.mockReturnValue({ user: { role: "editor", canViewInbox: true, canManageJobs: false } });
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminInbox embedded />);
    expect(screen.queryByRole("button", { name: /Job Applications/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Article Comments/ })).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/admin/applications"))).toBe(false);
  });

  it("retains the applications tab for a jobs-authorized editor", async () => {
    useAdminMock.mockReturnValue({ user: { role: "editor", canViewInbox: true, canManageJobs: true } });
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminInbox embedded />);
    expect(screen.getByRole("button", { name: /Job Applications/ })).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/admin/applications"))).toBe(true));
  });
});