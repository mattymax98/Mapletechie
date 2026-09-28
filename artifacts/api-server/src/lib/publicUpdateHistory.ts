import sanitizeHtml from "sanitize-html";

export type PublicUpdate = { date: string; summary: string };
type ApprovalEvent = { createdAt: Date; details: unknown };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/**
 * Public summaries are not HTML. Older notes were written for an internal
 * workflow, so unclear, markup-bearing, or internal notes become neutral text.
 */
export function publicUpdateSummary(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "Article updated";
  const text = sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > 350 ||
      /<[^>]*>|&(?:lt|gt|#(?:x3c|60));/i.test(value) ||
      /https?:\/\/|www\.|\[[^\]]+\]\([^)]*\)|\b[\w.-]+\.(?:com|ca|org|net|io|dev)\b|\/(?:api|admin)\/\S*|\b(?:revision|proposal|reviewer|admin|audit|internal|workflow|ticket)\b|\b(?:id|ref)\s*[:#-]?\s*\d+\b|#\d+\b|[<>]/i.test(text)) return "Article updated";
  return text;
}

/** Only an approved, already-published, meaningful change can be public. */
export function buildPublicUpdateHistory(
  events: ApprovalEvent[],
  currentModifiedAt: Date | string | null,
  publishedAt: Date | string | null,
): PublicUpdate[] {
  if (!currentModifiedAt || !publishedAt) return [];
  const modified = new Date(currentModifiedAt).getTime();
  const published = new Date(publishedAt).getTime();
  if (!Number.isFinite(modified) || !Number.isFinite(published)) return [];
  const eligible = events.flatMap(({ createdAt, details }) => {
    const data = record(details);
    const applied = record(data.appliedChanges);
    const date = typeof data.reviewedAt === "string" ? new Date(data.reviewedAt) : new Date(createdAt);
    const after = record(data.postAfterSnapshot);
    if (data.postStatus !== "published" ||
        !["title", "excerpt", "content"].some((field) => Object.hasOwn(applied, field)) ||
        !Number.isFinite(date.getTime()) || date.getTime() < published) return [];
    return [{
      date: date.toISOString(),
      // Historic notes were private even if they happen to look harmless.
      // Only an explicit public-summary approval can release their text.
      summary: data.publicSummaryApproved === true
        ? publicUpdateSummary(data.updateNote) : "Article updated",
      // Used only for consistency checking; never serialized to the client.
      afterModifiedAt: after.contentModifiedAt,
    }];
  }).sort((a, b) => b.date.localeCompare(a.date));

  // A historical approval is not evidence that it is still the article's
  // latest meaningful update. Fail closed if its stored resulting timestamp
  // cannot be matched to the article's current one.
  if (!eligible.length || typeof eligible[0].afterModifiedAt !== "string" ||
      new Date(eligible[0].afterModifiedAt).getTime() !== modified) return [];
  return eligible.slice(0, 20).map(({ date, summary }) => ({ date, summary }));
}