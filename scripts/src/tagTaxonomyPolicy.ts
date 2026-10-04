import { normalizeSemanticTag } from "./tagSemanticAuditRules";

export type TaxonomyAction = "KEEP" | "MERGE" | "RETIRE_CATEGORY" | "RETIRE";

export interface TaxonomyTagInput {
  tag: string;
  count: number;
  keywordNormalized: number;
}

export interface TaxonomyDecision {
  action: TaxonomyAction;
  destination?: string;
  reason: string;
}

const CATEGORY_DESTINATIONS = new Map<string, string>([
  ["ai", "/category/ai"],
  ["artificial intelligence", "/category/ai"],
  ["business and policy", "/category/business"],
  ["business policy", "/category/business"],
  ["canada tech", "/category/canada-tech"],
  ["gadgets", "/category/gadgets"],
  ["gaming", "/category/gaming"],
  ["guide", "/category/guides"],
  ["guides", "/category/guides"],
  ["news", "/category/news"],
  ["review", "/category/reviews"],
  ["reviews", "/category/reviews"],
  ["software and apps", "/category/software"],
  ["software", "/category/software"],
  ["apps", "/category/software"],
]);

const EXPLICIT_MERGES = new Map<string, string>([
  ["backup", "backups"],
  ["supply chain", "supply chains"],
  ["data breach", "Data breaches"],
  ["mobile hotspots", "mobile hotspot"],
]);

const FORMAT_TAGS = new Set([
  "explainer",
  "opinion",
  "buying guide",
  "consumer guide",
  "security guide",
]);

// Single-use tags are retired by default. This is the deliberately small
// exception list for entities/technologies central enough to Mapletechie's
// beats that keeping a first-use archive is reasonable even before recurrence.
const STRATEGIC_SINGLETONS = new Set([
  "1password",
  "5g",
  "activation lock",
  "agi",
  "airpods",
  "alibaba",
  "amd",
  "apple intelligence",
  "apple watch",
  "asml",
  "azure",
  "bank of canada",
  "bitcoin",
  "bitlocker",
  "bitwarden",
  "bluetooth",
  "broadcom",
  "cira",
  "cisa",
  "competition bureau",
  "coreweave",
  "deepfakes",
  "deepseek",
  "digital health",
  "digital legacy",
  "e commerce",
  "encryption",
  "eu ai act",
  "evs",
  "facebook",
  "fido",
  "filevault",
  "fintech",
  "fizz",
  "foldable phones",
  "geforce now",
  "github copilot",
  "gitlab",
  "google deepmind",
  "gpt 5",
  "grok",
  "ibm",
  "icloud private relay",
  "imessage",
  "ised",
  "lenovo",
  "mac",
  "medical devices",
  "microsoft 365",
  "nokia",
  "ollama",
  "open banking",
  "oracle",
  "pipeda",
  "pixel",
  "post quantum cryptography",
  "qwen",
  "ransomware",
  "robotics",
  "roku",
  "satellite internet",
  "sd wan",
  "signal",
  "sim swap",
  "siri",
  "smartphone security",
  "smartwatches",
  "starlink",
  "streaming services",
  "telus",
  "tpu",
  "transunion",
  "usb power delivery",
  "vpn",
  "volte",
  "wear os",
  "wi fi 7",
  "wi fi calling",
  "xai",
  "xiaomi",
  "youtube",
]);

const TRANSIENT_PATTERNS: RegExp[] = [
  /^cve[- ]?\d/i,
  /^bill c[- ]?\d/i,
  /^sb \d/i,
  /\b\d{2}h\d\b/i,
  /\bend of support\b/i,
  /\b20\d{2}\b/,
  /\bvs\b/i,
  /\bprice\b/i,
  /\bpricing\b/i,
  /\bchecklist\b/i,
];

export function classifyTaxonomyTag(input: TaxonomyTagInput): TaxonomyDecision {
  const key = normalizeSemanticTag(input.tag);

  const categoryDestination = CATEGORY_DESTINATIONS.get(key);
  if (categoryDestination) {
    return {
      action: "RETIRE_CATEGORY",
      destination: categoryDestination,
      reason: "duplicates an existing category or an obvious singular/category alias",
    };
  }

  const mergeTarget = EXPLICIT_MERGES.get(key);
  if (mergeTarget) {
    return {
      action: "MERGE",
      destination: mergeTarget,
      reason: "high-confidence semantic duplicate of an established tag",
    };
  }

  if (FORMAT_TAGS.has(key)) {
    return {
      action: "RETIRE",
      reason: "editorial format, not a reusable reader subject",
    };
  }

  if (input.count >= 3) {
    return {
      action: "KEEP",
      reason: "already supports a useful multi-article archive",
    };
  }

  if (input.count === 2) {
    const transient = TRANSIENT_PATTERNS.some((pattern) => pattern.test(key));
    if (transient) {
      return {
        action: "RETIRE",
        reason: "thin article-specific or transient wording",
      };
    }
    return {
      action: "KEEP",
      reason: "two-article recurring subject; retain while it approaches archive depth",
    };
  }

  if (STRATEGIC_SINGLETONS.has(key)) {
    return {
      action: "KEEP",
      reason: "strategic durable entity/technology likely to recur",
    };
  }

  if (TRANSIENT_PATTERNS.some((pattern) => pattern.test(key))) {
    return {
      action: "RETIRE",
      reason: "single-use transient/version/event/search-intent wording",
    };
  }

  if (input.keywordNormalized > 0) {
    return {
      action: "RETIRE",
      reason: "single-use tag also duplicates article-specific SEO keyword intent",
    };
  }

  return {
    action: "RETIRE",
    reason: "single-use archive with no demonstrated recurrence",
  };
}

export const taxonomyPolicyMetadata = {
  categoryDestinations: CATEGORY_DESTINATIONS,
  explicitMerges: EXPLICIT_MERGES,
  formatTags: FORMAT_TAGS,
  strategicSingletons: STRATEGIC_SINGLETONS,
};
