// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import AdminReview from "../src/pages/admin/AdminReview";

const { adminJsonMock } = vi.hoisted(() => ({ adminJsonMock: vi.fn() }));

vi.mock("@/lib/adminFetch", () => ({ adminJson: adminJsonMock }));
vi.mock("@/components/admin/AdminShell", () => ({
  AdminShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div><h1>{title}</h1>{children}</div>
  ),
}));

function renderReview() {
  const { hook } = memoryLocation({ path: "/admin/review" });
  return render(<Router hook={hook}><AdminReview /></Router>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("admin review queue", () => {
  it("links each proposal to its article editor and marks stale proposals", async () => {
    adminJsonMock.mockResolvedValue({
      items: [
        {
          id: 701, postId: 42, title: "First article", postStatus: "published",
          publishedAt: null, scheduledFor: null, source: "editor", createdAt: "2025-01-01T00:00:00Z",
          fields: ["title"], stale: true,
        },
        {
          id: 702, postId: 93, title: "Second article", postStatus: "scheduled",
          publishedAt: null, scheduledFor: null, source: "editor", createdAt: "2025-01-02T00:00:00Z",
          fields: ["summary"], stale: false,
        },
      ],
      total: 2,
      pendingCount: 2,
      page: 1,
      pageSize: 20,
    });

    const { findByText, findAllByRole, queryByText } = renderReview();
    const first = await findByText("First article");
    const second = await findByText("Second article");
    expect(await findByText("Re-review required")).toBeTruthy();
    expect(queryByText("Queue is clear")).toBeNull();
    expect(await findByText("Post #42 · Proposal #701")).toBeTruthy();
    expect(await findByText("Post #93 · Proposal #702")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();

    const firstCard = first.closest("article");
    const secondCard = second.closest("article");
    expect(firstCard).not.toBeNull();
    expect(secondCard).not.toBeNull();
    expect(within(firstCard!).getByRole("link", { name: "First article" }).getAttribute("href"))
      .toBe("/admin/posts/42/edit#editorial-corrections");
    expect(within(firstCard!).getByRole("link", { name: /Review/ }).getAttribute("href"))
      .toBe("/admin/posts/42/edit#editorial-corrections");
    expect(within(secondCard!).getByRole("link", { name: "Second article" }).getAttribute("href"))
      .toBe("/admin/posts/93/edit#editorial-corrections");
    expect(within(secondCard!).getByRole("link", { name: /Review/ }).getAttribute("href"))
      .toBe("/admin/posts/93/edit#editorial-corrections");
    expect(await findAllByRole("link", { name: /Review/ })).toHaveLength(2);
  });

  it("shows the empty queue state and a zero pending count", async () => {
    adminJsonMock.mockResolvedValue({
      items: [], total: 0, pendingCount: 0, page: 1, pageSize: 20,
    });

    const { findByText } = renderReview();
    expect(await findByText("No articles are waiting for review.")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("pending")).toBeTruthy();
  });

  it("labels a temporarily unpublished article by its original publication date", async () => {
    adminJsonMock.mockResolvedValue({
      items: [{
        id: 703, postId: 94, title: "Unpublished article", postStatus: "draft",
        publishedAt: "2025-01-01T00:00:00Z", scheduledFor: null,
        source: "editor", createdAt: "2025-01-02T00:00:00Z",
        fields: ["title"], stale: false,
      }],
      total: 1, pendingCount: 1, page: 1, pageSize: 20,
    });
    const { findByText, queryByText } = renderReview();
    expect(await findByText("Unpublished article")).toBeTruthy();
    expect(await findByText("Previously published")).toBeTruthy();
    expect(queryByText("Scheduled for")).toBeNull();
  });
});