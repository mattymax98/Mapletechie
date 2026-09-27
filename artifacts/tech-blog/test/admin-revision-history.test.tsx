// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import AdminReview from "../src/pages/admin/AdminReview";
import AdminAudit from "../src/pages/admin/AdminAudit";

const { adminJsonMock } = vi.hoisted(() => ({ adminJsonMock: vi.fn() }));
vi.mock("@/lib/adminFetch", () => ({ adminJson: adminJsonMock }));
vi.mock("@/components/admin/AdminShell", () => ({
  AdminShell: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
vi.mock("@/components/ErrorBanner", () => ({ default: ({ message }: { message: string }) => message ? <div role="alert">{message}</div> : null }));

function renderAt(path: string, page: React.ReactNode) {
  window.history.replaceState({}, "", path);
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{page}</Router>);
}
const historyList = (items = [{
  id: 501, postId: 27, title: "A precise correction", currentStatus: "published", source: "editor",
  proposedByName: "Mira Chen", createdAt: "2025-02-01T10:00:00Z", reviewedByName: "Noah Reid",
  reviewedAt: "2025-02-01T11:00:00Z", status: "approved", fields: ["title"], updateNote: "Corrected a date.",
}]) => ({ items, total: items.length, page: 1, pageSize: 20 });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("revision history workspace", () => {
  it("keeps Pending as the default and visibly shows a zero count", async () => {
    adminJsonMock.mockResolvedValue({ items: [], total: 0, pendingCount: 0, page: 1, pageSize: 20 });
    renderAt("/admin/review", <AdminReview />);
    expect(await screen.findByText("No articles are waiting for review.")).toBeTruthy();
    expect(screen.getByTestId("pending-count").textContent).toBe("0");
    expect(screen.getByTestId("tab-pending").getAttribute("aria-current")).toBe("page");
  });

  it("filters the paginated history request, shows zero results, and provides status controls", async () => {
    adminJsonMock.mockResolvedValue(historyList([]));
    renderAt("/admin/review?tab=history", <AdminReview />);
    expect(await screen.findByText("No revisions in this view.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("filter-rejected"));
    fireEvent.change(screen.getByTestId("history-search"), { target: { value: "27" } });
    await waitFor(() => expect(adminJsonMock).toHaveBeenLastCalledWith(expect.stringContaining("status=rejected")));
    expect(adminJsonMock).toHaveBeenLastCalledWith(expect.stringContaining("search=27"));
    expect(screen.getByTestId("filter-rejected").getAttribute("aria-pressed")).toBe("true");
  });

  it("links a history row to detail and safely displays before, proposed, and approved values", async () => {
    adminJsonMock.mockImplementation((url: string) => {
      if (url.includes("/history/501")) return Promise.resolve({
        ...historyList().items[0], before: { title: "Old heading" }, proposed: { title: "New heading" },
        final: { title: "Reviewed heading" }, applied: null, reviewerEdits: [],
        completeness: { before: true, proposed: true, final: true },
      });
      return Promise.resolve(historyList());
    });
    renderAt("/admin/review?tab=history", <AdminReview />);
    const link = await screen.findByTestId("view-changes-501");
    expect(link.getAttribute("href")).toBe("/admin/review?tab=history&revision=501");
    expect(screen.getByText("Article published")).toBeTruthy();
    expect(screen.getByText("Corrected a date.")).toBeTruthy();
    cleanup();
    renderAt("/admin/review?tab=history&revision=501", <AdminReview />);
    expect(await screen.findByTestId("revision-detail")).toBeTruthy();
    expect(screen.getByText("Old heading")).toBeTruthy();
    expect(screen.getByText("New heading")).toBeTruthy();
    expect(screen.getByText("Reviewed heading")).toBeTruthy();
  });

  it("labels missing legacy values unknown and renders article HTML only as text", async () => {
    adminJsonMock.mockImplementation((url: string) => url.includes("/history/501")
      ? Promise.resolve({
        ...historyList().items[0], fields: ["content"], before: null, proposed: { content: "<script>not markup</script>" },
        final: null, applied: null, reviewerEdits: [], completeness: { before: false, proposed: true, final: false },
      })
      : Promise.resolve(historyList()));
    renderAt("/admin/review?tab=history&revision=501", <AdminReview />);
    expect(await screen.findByText(/Unknown — not recorded in this legacy revision/)).toBeTruthy();
    expect(screen.getByText("<script>not markup</script>")).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("Final value not recorded.")).toBeTruthy();
  });
});

describe("activity revision links", () => {
  it("exposes only a revision link from structured revision details", async () => {
    localStorage.setItem("mapletechie_admin_token", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => [{
        id: 8, userId: 1, username: "Mira", action: "revision.approve", entityType: "revision", entityId: "501",
        summary: "Approved correction", details: { revisionId: 501, confidential: "do not render" },
        ip: null, userAgent: null, createdAt: "2025-02-01T11:00:00Z",
      }, {
        id: 9, userId: 1, username: "Mira", action: "revision.create", entityType: "revision", entityId: "502",
        summary: "Proposed correction", details: { revisionId: 502, postId: 31 },
        ip: null, userAgent: null, createdAt: "2025-02-02T11:00:00Z",
      }, {
        id: 10, userId: 1, username: "Noah", action: "revision.update", entityType: "revision", entityId: "503",
        summary: "Edited proposal", details: JSON.stringify({ revisionId: 503, postId: "44" }),
        ip: null, userAgent: null, createdAt: "2025-02-03T11:00:00Z",
      }, {
        id: 11, userId: 1, username: "Noah", action: "revision.update", entityType: "revision", entityId: null,
        summary: "Unassociated edit", details: { revisionId: 504 },
        ip: null, userAgent: null, createdAt: "2025-02-04T11:00:00Z",
      }],
    }));
    renderAt("/admin/audit", <AdminAudit />);
    const revisionLink = await screen.findByRole("link", { name: "View revision #501" });
    expect(revisionLink.getAttribute("href")).toBe("/admin/review?tab=history&revision=501");
    expect(screen.getByTestId("audit-revision-9").getAttribute("href")).toBe("/admin/posts/31/edit#editorial-corrections");
    expect(screen.getByTestId("audit-revision-10").getAttribute("href")).toBe("/admin/posts/44/edit#editorial-corrections");
    expect(screen.queryByTestId("audit-revision-11")).toBeNull();
    expect(screen.queryByText("do not render")).toBeNull();
    expect(within(revisionLink).getByText("View revision #501")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});