// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import AuthorPage from "../src/pages/author";
import { buildPersonJsonLd, type AuthorRichProfile } from "../src/lib/personSchema";

// Component tests for the browser-side author page: the Person JSON-LD it
// emits via Helmet must be byte-for-byte the same schema the crawler
// prerender serves to Google, and the visible reference-link buttons must
// track the same validation rules.

interface ApiAuthor extends AuthorRichProfile {
  id: number;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  twitterUrl: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
}

const richAuthor: ApiAuthor = {
  id: 1,
  username: "jane",
  displayName: "Jane Doe",
  bio: "I write about tech.",
  avatarUrl: null,
  alternateName: "Jane Q. Doe",
  jobTitle: "Editor",
  locationCity: "Thunder Bay",
  locationRegion: "ON",
  locationCountry: "CA",
  education: ["Lakehead University"],
  knowsAbout: ["Tech", "Safety"],
  organizations: [{ name: "Mapletechie", url: "https://mapletechie.com" }],
  memberships: [{ name: "Council", parentOrganization: "Parachute" }],
  profileLinks: [
    { label: "Council post", url: "https://linkedin.com/posts/123" },
    { label: "Bad link", url: "javascript:alert(1)" },
    { label: "Ftp link", url: "ftp://files.example.com" },
  ],
  twitterUrl: "https://x.com/jane",
  linkedinUrl: null,
  instagramUrl: null,
  githubUrl: null,
  websiteUrl: null,
};

const plainAuthor: ApiAuthor = {
  id: 2,
  username: "plainjoe",
  displayName: "Plain Joe",
  bio: null,
  avatarUrl: null,
  twitterUrl: null,
  linkedinUrl: null,
  instagramUrl: null,
  githubUrl: null,
  websiteUrl: null,
};

function mockApi(author: ApiAuthor) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/authors/by-username/")) {
        return new Response(JSON.stringify(author), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes(`/api/authors/${author.id}/posts`)) {
        return new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    }),
  );
}

function renderAuthorPage(username: string) {
  const { hook } = memoryLocation({ path: `/author/${username}` });
  return render(
    <HelmetProvider>
      <Router hook={hook}>
        <Route path="/author/:username" component={AuthorPage} />
      </Router>
    </HelmetProvider>,
  );
}

// With React 19, react-helmet-async lets React render head tags natively.
// React 19 hoists <title>/<meta> into <head>, but inline scripts stay where
// they render — crawlers read JSON-LD anywhere in the document, so we do too.
function personScripts(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
  ).filter((s) => {
    try {
      return JSON.parse(s.textContent || "")["@type"] === "Person";
    } catch {
      return false;
    }
  });
}

beforeEach(() => {
  document.head.innerHTML = "";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AuthorPage Person JSON-LD", () => {
  it("emits a Helmet script matching buildPersonJsonLd for a rich-profile author", async () => {
    mockApi(richAuthor);
    const { findByRole } = renderAuthorPage("jane");
    await findByRole("heading", { name: "Jane Doe" });

    await waitFor(() => expect(personScripts()).toHaveLength(1));
    const emitted = JSON.parse(personScripts()[0].textContent!);
    expect(emitted).toEqual(buildPersonJsonLd(richAuthor));
    // Sanity: the schema really carries the rich fields Google reads.
    expect(emitted.name).toBe("Jane Doe");
    expect(emitted.jobTitle).toBe("Editor");
    expect(emitted.sameAs).toContain("https://x.com/jane");
  });

  it("emits no Person script for a plain author", async () => {
    mockApi(plainAuthor);
    const { findByRole } = renderAuthorPage("plainjoe");
    await findByRole("heading", { name: "Plain Joe" });

    expect(buildPersonJsonLd(plainAuthor)).toBeNull();
    // Give Helmet a tick to flush any head updates, then assert absence.
    await waitFor(() => expect(document.head.innerHTML).toContain("Plain Joe"));
    expect(personScripts()).toHaveLength(0);
  });
});

describe("AuthorPage reference-link buttons", () => {
  it("renders visible buttons only for valid http(s) profile links", async () => {
    mockApi(richAuthor);
    const { findByRole, queryByRole } = renderAuthorPage("jane");

    const good = await findByRole("link", { name: "Council post" });
    expect(good).toHaveProperty("href", "https://linkedin.com/posts/123");
    expect(queryByRole("link", { name: "Bad link" })).toBeNull();
    expect(queryByRole("link", { name: "Ftp link" })).toBeNull();
  });

  it("renders no reference-link buttons when the author has none", async () => {
    mockApi(plainAuthor);
    const { findByRole, container } = renderAuthorPage("plainjoe");
    await findByRole("heading", { name: "Plain Joe" });

    expect(container.querySelectorAll('a[rel~="me"]')).toHaveLength(0);
  });
});
