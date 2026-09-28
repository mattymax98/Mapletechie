import { describe, it, expect } from "vitest";
import { buildAnalyticsCsv, type AnalyticsCsvData } from "../src/lib/exportAnalyticsCsv";

const base: AnalyticsCsvData = {
  daily: [{ day: "2026-08-01", views: 12 }],
  topPosts: [{ title: "Hello, \"World\"", slug: "hello-world", views: 5 }],
  topSources: [{ label: "https://news.ycombinator.com/", value: 3 }],
  topCountries: [{ code: "CA", label: "Canada", value: 9 }],
  searchQueries: [{ query: "vite tips", count: 2 }],
};

describe("buildAnalyticsCsv", () => {
  it("contains all five sections with headers and data", () => {
    const csv = buildAnalyticsCsv(base, "30d");
    for (const section of [
      "Daily summary",
      "Top posts",
      "Top traffic sources",
      "Top countries",
      "Search queries",
    ]) {
      expect(csv).toContain(section);
    }
    expect(csv).toContain("range: 30d");
    expect(csv).toContain("2026-08-01,12");
    expect(csv).toContain("CA,Canada,9");
    expect(csv).toContain("vite tips,2");
  });

  it("quotes cells containing commas and doubles embedded quotes", () => {
    const csv = buildAnalyticsCsv(base, "7d");
    expect(csv).toContain('"Hello, ""World""",hello-world,5');
  });

  it("neutralises formula-leading values in reader/editor-controlled cells", () => {
    const csv = buildAnalyticsCsv(
      {
        ...base,
        searchQueries: [
          { query: "=HYPERLINK(\"http://evil\",\"x\")", count: 1 },
          { query: "+1+1", count: 1 },
          { query: "-2+3", count: 1 },
          { query: "@cmd", count: 1 },
        ],
        topPosts: [{ title: "=SUM(A1:A9)", slug: "safe-slug", views: 1 }],
      },
      "7d",
    );
    // Every formula-leading value is prefixed with an apostrophe
    expect(csv).toContain("'=SUM(A1:A9)");
    expect(csv).toContain("'+1+1");
    expect(csv).toContain("'-2+3");
    expect(csv).toContain("'@cmd");
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    // No line begins a cell with a bare formula character
    for (const line of csv.split("\r\n")) {
      for (const cell of line.split(",")) {
        expect(/^[=+@]/.test(cell.replace(/^"/, ""))).toBe(false);
      }
    }
  });
});
