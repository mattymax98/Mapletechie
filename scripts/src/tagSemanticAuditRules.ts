export function normalizeSemanticTag(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-CA")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularizeToken(token: string): string {
  if (token.length <= 4) return token;
  if (/ies$/.test(token) && token.length > 5) return token.slice(0, -3) + "y";
  if (/(ches|shes|xes|zes)$/.test(token)) return token.slice(0, -2);
  if (/ses$/.test(token) && !/sses$/.test(token)) return token.slice(0, -1);
  if (/s$/.test(token) && !/(ss|us|is)$/.test(token)) return token.slice(0, -1);
  return token;
}

export function singularSemanticKey(value: string): string {
  return normalizeSemanticTag(value)
    .split(" ")
    .filter(Boolean)
    .map(singularizeToken)
    .join(" ");
}

export function acronymExpandedKey(value: string): string {
  return normalizeSemanticTag(value)
    .split(" ")
    .flatMap((token) => token === "ai" ? ["artificial", "intelligence"] : [token])
    .join(" ");
}

export function highConfidenceSemanticReason(a: string, b: string): string | null {
  const normalizedA = normalizeSemanticTag(a);
  const normalizedB = normalizeSemanticTag(b);
  if (!normalizedA || !normalizedB || normalizedA === normalizedB) return null;
  if (singularSemanticKey(a) === singularSemanticKey(b)) return "singular/plural wording";
  if (acronymExpandedKey(a) === acronymExpandedKey(b)) return "AI/acronym wording";
  return null;
}
