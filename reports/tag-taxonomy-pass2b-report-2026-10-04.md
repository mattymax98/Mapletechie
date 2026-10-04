# Pass 2B taxonomy classification dry run — 2026-10-04

## Status

**Read-only production classification only. No article tags, tag pages, redirects, categories, article URLs, sitemap article entries, or Daily Desk rules were changed in production.**

The final refined dry run ran against the live Railway PostgreSQL database after Pass 1 normalization. It inspected all published posts inside a PostgreSQL `READ ONLY` transaction and classified every current tag into one of four actions:

- **KEEP** — retain as a public reader-navigation subject.
- **MERGE** — replace with a stronger canonical tag and redirect the old tag URL.
- **RETIRE → CATEGORY** — remove the redundant tag from articles and redirect its tag URL to the existing category archive.
- **RETIRE** — remove the tag from articles; the old tag archive should return **410 Gone**, not redirect to an unrelated page.

## Current live inventory

| Metric | Current live value |
| --- | ---: |
| Published posts | 405 |
| Distinct tags | 785 |
| Singleton tags | 553 |
| Two-post tags | 122 |
| Tags used by 3+ posts | 110 |

## Classification result

| Action | Tags |
| --- | ---: |
| KEEP | 450 |
| MERGE | 4 |
| RETIRE → CATEGORY | 12 |
| RETIRE | 319 |
| **Resulting distinct tag taxonomy** | **450** |

The simulated cleanup reduces the taxonomy from **785 tags to 450** without changing any article URL or removing any published article from the main sitemap.

### Thin archives

| Metric | Before | After dry run |
| --- | ---: | ---: |
| One-article tags | 553 | 230 |
| Two-article tags | 122 | 118 |
| 3+ article tag archives | 110 | 102 |

The drop in sitemap-eligible tag archives is intentional: category duplicates and low-value archives disappear, while **all published article URLs remain governed by the article sitemap independently of tags**.

## Category-duplicate retirements

- `Guide` (12) → `/category/guides`
- `AI` (9) → `/category/ai`
- `Business & Policy` (8) → `/category/business`
- `artificial intelligence` (6) → `/category/ai`
- `Canada Tech` (6) → `/category/canada-tech`
- `News` (5) → `/category/news`
- `Gadgets` (4) → `/category/gadgets`
- `Gaming` (4) → `/category/gaming`
- `Guides` (2) → `/category/guides`
- `Review` (1) → `/category/reviews`
- `Reviews` (1) → `/category/reviews`
- `Software & Apps` (1) → `/category/software`

These are 301 candidates because a matching or clearly equivalent category archive exists.

### Category-membership preservation

Before removing those duplicate tags, **7 category memberships must be added** so no relevant article loses its path into the destination category:

- `flock-camera-surveillance-backlash` — add /category/ai because it currently uses the retired `AI` tag while its primary category is Business & Policy.
- `canada-us-tariffs-electronics` — add /category/business because it currently uses the retired `Business & Policy` tag while its primary category is Canada Tech.
- `data-centre-water-disclosure-canada` — add /category/ai because it currently uses the retired `artificial intelligence` tag while its primary category is Business & Policy.
- `north-korea-ai-cyber-operations` — add /category/ai because it currently uses the retired `artificial intelligence` tag while its primary category is News.
- `us-ai-bloc-pressure-canada` — add /category/ai because it currently uses the retired `artificial intelligence` tag while its primary category is Business & Policy.
- `canada-europe-digital-trade-details` — add /category/ai because it currently uses the retired `artificial intelligence` tag while its primary category is Canada Tech.
- `openai-pauses-frontier-model-training` — add /category/news because it currently uses the retired `News` tag while its primary category is AI.

The eventual production migration must add these category memberships in the same transaction before removing the duplicate tags.

## Exact semantic merges

- `Backup` (3) → `backups` (/tag/backups)
- `data breach` (2) → `Data breaches` (/tag/data%20breaches)
- `mobile hotspots` (1) → `mobile hotspot` (/tag/mobile%20hotspot)
- `supply chain` (1) → `supply chains` (/tag/supply%20chains)

No broad synonym merging is authorized. Related-but-distinct concepts such as AI safety, AI regulation, AI governance, AI infrastructure, and AI agents remain separate.

## Refined singleton policy

The first Pass 2B draft was too aggressive because it treated almost every first-use tag as disposable. The final dry run is more conservative.

- Two-post tags are kept by default because recurrence is already demonstrated.
- Established multi-post archives are kept even when they describe a useful cross-category lens, such as `Analysis`.
- A larger strategic set of first-use entities and durable subjects is kept when Mapletechie is reasonably likely to cover them again: examples include Bell Canada, network security, antitrust, AI coding, Machine Learning, iOS, HDMI, roaming, satellites, PC security, payments, and similar recurring beats.
- Single-use article-specific phrases, one-off events, bill/CVE/version labels, headline fragments, and long-tail keyword-like phrases are retired.
- Category names and obvious category aliases are not allowed to survive as tags.

This is intentionally **not** “delete every singleton.” The question is whether a tag deserves to become a reusable reader-facing archive.

## Simulated article impact

| Metric | Result |
| --- | ---: |
| Published posts whose tag arrays would change | 225 |
| Tag assignments removed | 380 |
| Tag assignments merged into canonical tags | 7 |
| Missing category memberships to add first | 7 |
| Article URLs changed | 0 |
| Article titles/bodies changed | 0 |
| Publication timestamps changed | 0 |
| Main article sitemap removals | 0 |

## Future automation policy recommended after cleanup approval

This dry run **does not change the Daily Desk yet**. The production rule change should be a separate committed change:

1. Categories first: categories are the broad editorial sections.
2. Tags are optional, **0–4**, with no minimum quota.
3. A tag must make sense as a reusable reader-facing archive containing several useful Mapletechie articles.
4. Never use a category name or clear category alias as a tag.
5. Reuse the established taxonomy before creating a new tag.
6. At most one genuinely new tag per draft, and only when future recurrence is reasonably likely.
7. `seo_keywords` are different: they may contain exact search phrases, model/version names, one-off event wording, product queries, and long-tail intent. They do **not** create public archive pages.
8. Never create a public tag merely because a phrase is useful for SEO.
9. Backend guardrails should reject category duplicates, known retired aliases, and accidental taxonomy drift even outside the Daily Desk.
10. The existing three-published-post sitemap threshold remains. Thin tag pages can exist for readers but stay noindex/out of the sitemap until they have real depth.

## Files

- `reports/tag-taxonomy-pass2b-classification-2026-10-04.csv` — every current tag, classification, redirect/410 destination, reason, counts, category-backfill needs, categories, and example articles.
- `reports/tag-taxonomy-pass2b-affected-posts-2026-10-04.csv` — exact before/after tag arrays for every affected article.
- `scripts/src/tagTaxonomyPolicy.ts` — deterministic dry-run classification policy.
- `scripts/src/tag-taxonomy-classify.ts` — read-only production simulator.
- Tests lock the category, merge, two-post recurrence, durable singleton, strategic-exception, and established-archive behavior.

## Approval boundary

No production taxonomy change is authorized by this report.

If approved, the next implementation should:

- pin this exact reviewed classification;
- add the 7 missing category memberships before removing duplicate category tags;
- apply article-tag changes transactionally;
- add 301 redirects for **MERGE** and **RETIRE → CATEGORY**;
- return 410 for explicitly retired tag archives;
- preserve article URLs, content, authorship, categories, and publication dates;
- update the Daily Desk and backend guardrails in a separate committed change;
- verify the sitemap and crawler-visible internal-link graph after migration.
