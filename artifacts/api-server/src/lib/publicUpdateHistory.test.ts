import { describe, expect, it } from "vitest";
import { buildPublicUpdateHistory, publicUpdateSummary } from "./publicUpdateHistory";

const publishedAt = "2026-01-01T00:00:00.000Z";
const first = "2026-02-01T10:00:00.000Z";
const second = "2026-03-01T10:00:00.000Z";
function event(date: string, changes: Record<string, unknown>, note: unknown, status = "published", after = date, publicSummaryApproved = true) {
  return {
    createdAt: new Date(date),
    details: {
      postStatus: status, reviewedAt: date, appliedChanges: changes,
      postAfterSnapshot: { contentModifiedAt: after }, updateNote: note,
      publicSummaryApproved,
      reviewerName: "PRIVATE", before: { content: "PRIVATE" }, revisionId: 7,
    },
  };
}

describe("reader-safe update history", () => {
  it("returns no history without a meaningful current update", () => {
    expect(buildPublicUpdateHistory([], null, publishedAt)).toEqual([]);
    expect(buildPublicUpdateHistory([], second, publishedAt)).toEqual([]);
  });

  it("uses each approval date, sorts newest first, and returns date and summary only", () => {
    const events = [
      event(first, { excerpt: "new" }, "Clarified availability."),
      event(second, { content: "<p>new</p>" }, "Expanded instructions."),
    ];
    expect(buildPublicUpdateHistory(events, second, publishedAt)).toEqual([
      { date: second, summary: "Expanded instructions." },
      { date: first, summary: "Clarified availability." },
    ]);
  });

  it("omits metadata, scheduled and prepublication changes, and refuses a mismatched latest timestamp", () => {
    const events = [
      event(first, { title: "new" }, "Prepared early.", "scheduled"),
      event(first, { title: "new" }, "Original draft.", "published", first),
      event(second, { seoTitle: "metadata" }, "SEO update"),
    ];
    expect(buildPublicUpdateHistory(events, second, publishedAt)).toEqual([]);
    expect(buildPublicUpdateHistory([event(second, { title: "new" }, "New title", "published", first)], second, publishedAt)).toEqual([]);
    expect(buildPublicUpdateHistory([event("2025-12-01T00:00:00Z", { title: "new" }, "Early")], second, publishedAt)).toEqual([]);
  });

  it("gives notes without trustworthy reader text neutral wording rather than a generated diff", () => {
    expect(buildPublicUpdateHistory([event(second, { title: "new" }, null)], second, publishedAt)).toEqual([
      { date: second, summary: "Article updated" },
    ]);
    for (const note of [
      '<script>alert("x")</script>Corrected title',
      '<a href="https://example.com">Read this</a>',
      '&lt;iframe&gt;injected&lt;/iframe&gt;',
      'See https://example.com/details',
      'See [the notes](/admin/reviews)',
      'See example.com/details',
      'Case ID 123',
      'Reviewer edited proposal #123',
      'admin workflow changed',
    ]) expect(publicUpdateSummary(note)).toBe("Article updated");
    expect(publicUpdateSummary("  Clarified supported devices.  ")).toBe("Clarified supported devices.");
  });

  it("never publishes a historical private note just because its plain text looks safe", () => {
    const privateNote = "PRIVATE REVIEW NOTE MUST NOT APPEAR";
    expect(publicUpdateSummary(privateNote)).toBe(privateNote);
    expect(buildPublicUpdateHistory([
      event(second, { content: "new" }, privateNote, "published", second, false),
      { ...event(first, { title: "new" }, "Confidential details"), details: {
        ...event(first, { title: "new" }, "Confidential details").details,
        publicSummaryApproved: undefined,
      } },
    ], second, publishedAt)).toEqual([
      { date: second, summary: "Article updated" },
      { date: first, summary: "Article updated" },
    ]);
  });

  it("limits the public result while preserving newest-first ordering", () => {
    const events = Array.from({ length: 30 }, (_, i) =>
      event(new Date(Date.UTC(2026, 1, i + 1)).toISOString(), { title: "changed" }, "Clarified devices."));
    const latest = events.at(-1)!.details.reviewedAt;
    const result = buildPublicUpdateHistory(events, latest, publishedAt);
    expect(result).toHaveLength(20);
    expect(result[0].date).toBe(latest);
  });
});