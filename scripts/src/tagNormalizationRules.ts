export interface TagVariant {
  tag: string;
  publishedCount: number;
  totalCount?: number;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lt: "<",
  gt: ">",
};

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
  return decodeTagEntities(value)
    .normalize("NFKC")
    .replace(/[\u00a0\s]+/g, " ")
    .trim();
}

export function tagNormalizationKey(value: string): string {
  return normalizeTagText(value).toLocaleLowerCase("en-CA");
}

export function tagUrlSegment(value: string): string {
  return encodeURIComponent(tagNormalizationKey(value));
}

export function chooseCanonicalTagVariant(variants: TagVariant[]): string {
  if (!variants.length) return "";
  const ranked = variants
    .map((variant) => ({ ...variant, cleaned: normalizeTagText(variant.tag) }))
    .filter((variant) => variant.cleaned.length > 0)
    .sort((a, b) =>
      b.publishedCount - a.publishedCount ||
      (b.totalCount ?? b.publishedCount) - (a.totalCount ?? a.publishedCount) ||
      Number(b.tag === b.cleaned) - Number(a.tag === a.cleaned) ||
      a.cleaned.localeCompare(b.cleaned, "en-CA", { sensitivity: "base" }) ||
      a.tag.localeCompare(b.tag, "en-CA")
    );
  return ranked[0]?.cleaned ?? "";
}

export function canonicalizeTagList(
  tags: string[],
  canonicalByKey: ReadonlyMap<string, string>,
): string[] {
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
