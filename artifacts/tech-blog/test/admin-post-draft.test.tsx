// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminPostForm from "../src/pages/admin/AdminPostForm";

vi.mock("@/context/AdminContext", () => ({ useAdmin: () => ({ user: { id: 1, displayName: "Editor", role: "admin" }, token: null }) }));
vi.mock("@workspace/api-client-react", () => ({
  useListCategories: () => ({ data: [{ id: 1, slug: "news", name: "News" }] }),
  useListEditors: () => ({ data: [{ id: 1, displayName: "Editor" }] }),
  useGetPost: () => ({}), getGetPostQueryKey: () => ["post"],
  useCreatePost: () => ({}), useUpdatePost: () => ({}),
}));
vi.mock("@/components/admin/AdminShell", () => ({ AdminShell: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/RichTextEditor", () => ({ RichTextEditor: ({ value }: any) => <textarea aria-label="Article content" value={value} readOnly /> }));
vi.mock("@/components/ImageUploadField", () => ({ ImageUploadField: () => null }));
vi.mock("@/components/admin/ArticleRevisions", () => ({ ArticleRevisions: () => null }));

beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("opens an older saved draft without losing its writing or crashing on newer fields", () => {
  localStorage.setItem("mapletechie-draft:new", JSON.stringify({
    form: { title: "My saved article", content: "<p>Do not lose this writing.</p>", category: "news" },
    savedAt: Date.now(),
  }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<QueryClientProvider client={new QueryClient()}><AdminPostForm /></QueryClientProvider>);
  expect(screen.getByDisplayValue("My saved article")).toBeTruthy();
  expect(screen.getByDisplayValue("<p>Do not lose this writing.</p>")).toBeTruthy();
  expect(screen.getByRole("button", { name: "News" }).className).toContain("bg-orange-600");
});

it("recovers valid writing when optional saved fields have invalid types", () => {
  localStorage.setItem("mapletechie-draft:new", JSON.stringify({ form: {
    title: "Recoverable writing", content: "<p>Still here.</p>", seoTitle: null,
    categories: "news", pros: [], rating: 5, primaryCategory: null,
  } }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<QueryClientProvider client={new QueryClient()}><AdminPostForm /></QueryClientProvider>);
  expect(screen.getByDisplayValue("Recoverable writing")).toBeTruthy();
  expect(screen.getByDisplayValue("<p>Still here.</p>")).toBeTruthy();
});
