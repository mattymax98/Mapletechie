// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ArticleRevisions } from "../src/components/admin/ArticleRevisions";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("corrections on a temporarily unpublished article", () => {
  it("offers a proposal and explains that approval will not republish the draft", async () => {
    const requests: { url: string; options?: RequestInit }[] = [];
    let revisions: unknown[] = [];
    const live = {
      id: 7, status: "draft", title: "Original title", slug: "original-title",
      publishedAt: "2025-01-01T00:00:00Z", publishedOnceAt: "2025-01-01T00:00:00Z",
      scheduledFor: null, contentModifiedAt: "2025-01-02T00:00:00Z",
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      requests.push({ url, options });
      if (options?.method === "POST") {
        revisions = [{
          id: 31, status: "pending", stale: false, source: "editor",
          changes: { title: "Corrected title" }, updateNote: null,
          createdAt: "2025-01-03T00:00:00Z",
        }];
        return { ok: true, json: async () => ({ revision: revisions[0] }) };
      }
      return { ok: true, json: async () => ({ live, revisions }) };
    }));

    render(<ArticleRevisions postId={7} token="test-token" canApprove={false} />);
    expect(await screen.findByText(/temporarily unpublished\. Approval updates the private draft/)).toBeTruthy();
    fireEvent.click(screen.getByText("Propose a correction"));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Corrected title" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));

    await waitFor(() => expect(requests.some(({ options }) => options?.method === "POST")).toBe(true));
    const request = requests.find(({ options }) => options?.method === "POST")!;
    expect(request.url).toBe("/api/admin/posts/7/revisions");
    expect(JSON.parse(String(request.options?.body))).toEqual({
      changes: { title: "Corrected title" }, updateNote: null,
    });
    expect(await screen.findByText(/Proposal #31/)).toBeTruthy();
    expect(screen.getByText("Current draft")).toBeTruthy();
  });

  it("refreshes the parent editor after approving a correction without publishing", async () => {
    const onApproved = vi.fn();
    const live = {
      id: 7, status: "draft", title: "Original title", slug: "original-title",
      publishedAt: "2025-01-01T00:00:00Z", publishedOnceAt: "2025-01-01T00:00:00Z",
      contentModifiedAt: "2025-01-02T00:00:00Z", scheduledFor: null,
    };
    let approved = false;
    const revision = {
      id: 31, status: "pending", stale: false, source: "editor",
      changes: { title: "Corrected title" }, updateNote: null,
      createdAt: "2025-01-03T00:00:00Z",
    };
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") approved = true;
      return {
        ok: true,
        json: async () => options?.method === "POST"
          ? { status: "approved" }
          : { live: { ...live, title: approved ? "Corrected title" : live.title },
              revisions: [{ ...revision, status: approved ? "approved" : "pending" }] },
      };
    }));

    render(<ArticleRevisions postId={7} token="test-token" canApprove onApproved={onApproved} />);
    expect(await screen.findByText(/Proposal #31/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve correction" }));
    await waitFor(() => expect(onApproved).toHaveBeenCalledWith(expect.objectContaining({
      status: "draft", title: "Corrected title",
      publishedAt: live.publishedAt, contentModifiedAt: live.contentModifiedAt,
    })));
  });
});