// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import TopicsPage from "../src/pages/topics";

const cluster = {
  id: 9,
  slug: "artificial-intelligence",
  name: "Artificial Intelligence",
  introduction: "Reporting and analysis about AI.",
};

const topicPosts = [
  {
    id: 1,
    slug: "ai-pillar",
    title: "The Pillar Guide",
    excerpt: "Start here.",
    publishedAt: "2026-01-01T12:00:00.000Z",
    clusterRole: "pillar",
  },
  {
    id: 2,
    slug: "ai-supporting-old",
    title: "An Earlier Supporting Article",
    publishedAt: "2026-02-01T12:00:00.000Z",
    clusterRole: "supporting",
  },
  {
    id: 3,
    slug: "ai-supporting-new",
    title: "The Newest Supporting Article",
    publishedAt: "2026-03-01T12:00:00.000Z",
    clusterRole: "supporting",
  },
];

function mockTopicsApi(payload: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  })));
}

function renderTopics(path: string) {
  const { hook } = memoryLocation({ path });
  return render(
    <HelmetProvider>
      <Router hook={hook}>
        <Route path="/topics" component={TopicsPage} />
        <Route path="/topics/:slug" component={TopicsPage} />
      </Router>
    </HelmetProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public topics pages", () => {
  it("renders a prominent pillar and recent supporting coverage in recency order", async () => {
    mockTopicsApi({ cluster, posts: topicPosts });
    renderTopics(`/topics/${cluster.slug}`);

    expect(await screen.findByText("Pillar article")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "The Pillar Guide" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recent supporting coverage" })).toBeTruthy();
    await waitFor(() => {
      const items = Array.from(document.querySelectorAll("ol li"));
      expect(items[0]?.textContent).toContain("The Newest Supporting Article");
      expect(items[1]?.textContent).toContain("An Earlier Supporting Article");
    });
  });

  it("shows recent supporting coverage when no pillar article is configured", async () => {
    mockTopicsApi({
      cluster,
      posts: topicPosts.filter((post) => post.clusterRole !== "pillar"),
    });
    renderTopics(`/topics/${cluster.slug}`);

    expect(await screen.findByRole("heading", { name: "Recent supporting coverage" })).toBeTruthy();
    expect(screen.queryByText("Pillar article")).toBeNull();
  });

  it("consumes the public topics endpoint's array response and links to eligible topics", async () => {
    mockTopicsApi([cluster]);
    renderTopics("/topics");

    const topicLink = await screen.findByRole("link", { name: /Artificial Intelligence/ });
    expect((topicLink as HTMLAnchorElement).href).toContain(`/topics/${cluster.slug}`);
  });
});