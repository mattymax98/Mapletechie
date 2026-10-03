import { db, postsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lt: "<",
  gt: ">",
};

export interface TagVariant {
  tag: string;
  publishedCount: number;
  totalCount: number;
}

export function decodeTagEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|nbsp|lt|gt);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) {
      const codePoint = Number.parseInt(lower.slice(2), 16);
      return Number.isSafeInteger(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (lower.startsWith("#")) {
      const codePoint = Number.parseInt(lower.slice(1), 10);
      return Number.isSafeInteger(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return NAMED_ENTITIES[lower] ?? match;
  });
}

export function normalizeTagText(value: string): string {
  return decodeTagEntities(value).normalize("NFKC").replace(/[\u00a0\s]+/g, " ").trim();
}

export function tagNormalizationKey(value: string): string {
  return normalizeTagText(value).toLocaleLowerCase("en-CA");
}

export function chooseCanonicalTagVariant(variants: TagVariant[]): string {
  const ranked = variants
    .map((variant) => ({ ...variant, cleaned: normalizeTagText(variant.tag) }))
    .filter((variant) => variant.cleaned.length > 0)
    .sort((a, b) =>
      b.publishedCount - a.publishedCount ||
      b.totalCount - a.totalCount ||
      Number(b.tag === b.cleaned) - Number(a.tag === a.cleaned) ||
      a.cleaned.localeCompare(b.cleaned, "en-CA", { sensitivity: "base" }) ||
      a.tag.localeCompare(b.tag, "en-CA"),
    );
  return ranked[0]?.cleaned ?? "";
}

export function canonicalizeTagList(tags: string[], canonicalByKey: ReadonlyMap<string, string>): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const cleaned = normalizeTagText(raw);
    if (!cleaned) continue;
    const key = tagNormalizationKey(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(canonicalByKey.get(key) ?? cleaned);
  }
  return output;
}

export function buildCanonicalTagMap(variants: TagVariant[]): Map<string, string> {
  const grouped = new Map<string, TagVariant[]>();
  for (const variant of variants) {
    const key = tagNormalizationKey(variant.tag);
    if (!key) continue;
    const bucket = grouped.get(key) ?? [];
    bucket.push(variant);
    grouped.set(key, bucket);
  }
  return new Map([...grouped].map(([key, bucket]) => [key, chooseCanonicalTagVariant(bucket)]));
}

export async function canonicalizeTagsForWrite(value: unknown): Promise<string[]> {
  if (!Array.isArray(value)) return [];
  const rawTags = value.filter((tag): tag is string => typeof tag === "string");
  if (!rawTags.length) return [];
  const result = await db.execute(sql`
    SELECT tag,
      COUNT(DISTINCT ${postsTable.id}) FILTER (WHERE ${postsTable.status} = 'published')::int AS published_count,
      COUNT(DISTINCT ${postsTable.id})::int AS total_count
    FROM ${postsTable}, unnest(${postsTable.tags}) AS tag
    GROUP BY tag
  `);
  const rows = ((result as any).rows ?? result) as Array<{ tag: string; published_count: number | string; total_count: number | string }>;
  const canonical = buildCanonicalTagMap(rows.map((row) => ({
    tag: row.tag,
    publishedCount: Number(row.published_count),
    totalCount: Number(row.total_count),
  })));
  return canonicalizeTagList(rawTags, canonical);
}
