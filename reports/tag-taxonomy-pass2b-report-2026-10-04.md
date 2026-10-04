# Pass 2B taxonomy classification dry run — 2026-10-04

## Status

**Read-only production classification only. No article tags, tag pages, redirects, categories, article URLs, sitemap article entries, or Daily Desk rules were changed in production.**

The refined dry run ran against the live Railway PostgreSQL database after Pass 1 normalization. It inspected all currently published posts inside a PostgreSQL `READ ONLY` transaction and classified every current tag into one of four actions:

- **KEEP** — retain as a public reader-navigation subject.
- **MERGE** — replace with a stronger canonical tag and redirect the old tag URL.
- **RETIRE → CATEGORY** — remove the redundant tag from articles and redirect its tag URL to the existing category archive.
- **RETIRE** — remove the tag from articles; the old tag archive should return **410 Gone**, not redirect to an unrelated page.

## Current live inventory

New articles were published during the cleanup work, so this report uses the latest live inventory rather than the earlier 400-post snapshot.

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
| KEEP | 298 |
| MERGE | 4 |
| RETIRE → CATEGORY | 12 |
| RETIRE | 471 |
| **Resulting distinct tag taxonomy** | **299** |

The simulated cleanup reduces the taxonomy from **785 tags to 299** without changing any article URL or removing any published article from the main sitemap.

### Thin archives

| Metric | Before | After dry run |
| --- | ---: | ---: |
| One-article tags | 553 | 82 |
| Two-article tags | 122 | 115 |
| 3+ article tag archives | 110 | 102 |

The drop from 110 to 102 sitemap-eligible tag archives is intentional. It removes duplicate/category-like or low-value archives, not article URLs.

**All published article URLs remain governed by the article sitemap independently of tags.**

## Exact category-duplicate retirements

These tag archives are classified to retire in favour of the existing category page:

| Tag | Uses | Destination |
| --- | ---: | --- |
| Guide | 12 | /category/guides |
| AI | 9 | /category/ai |
| Business & Policy | 8 | /category/business |
| artificial intelligence | 6 | /category/ai |
| Canada Tech | 6 | /category/canada-tech |
| News | 5 | /category/news |
| Gadgets | 4 | /category/gadgets |
| Gaming | 4 | /category/gaming |
| Guides | 2 | /category/guides |
| Review | 1 | /category/reviews |
| Reviews | 1 | /category/reviews |
| Software & Apps | 1 | /category/software |

These are **301 redirect** candidates because an exact or clearly equivalent archive exists.

### Category-membership preservation

The refined audit checked the many-to-many `post_categories` table, not only each post's primary category. Before removing category-duplicate tags, **7 article/category memberships would need to be added** so no relevant article disappears from the destination category archive.

That is an important safety condition for the eventual migration. The production cleanup must add those missing category memberships in the same transaction before removing the duplicate tags.

## Exact semantic merges

| Old tag | Uses | Canonical tag | Redirect |
| --- | ---: | --- | --- |
| Backup | 3 | backups | /tag/backups |
| data breach | 2 | Data breaches | /tag/data%20breaches |
| mobile hotspots | 1 | mobile hotspot | /tag/mobile%20hotspot |
| supply chain | 1 | supply chains | /tag/supply%20chains |

No broad synonym merging was attempted. Related-but-distinct concepts such as `AI safety`, `AI regulation`, `AI governance`, `AI infrastructure`, and `AI agents` remain separate.

## Analysis archive

The first draft classified `Analysis` as a format label to retire. That was too aggressive.

The refined policy **keeps `Analysis`** because it already contains 15 published pieces across several categories and currently provides a useful cross-category archive. If Mapletechie later introduces a dedicated analysis content type or section, that can replace the tag intentionally.

This is a good example of why Pass 2B is a dry run rather than a mass-delete script.

## Garbage / low-value taxonomy policy used in this dry run

The dry run treats a tag archive as a reader-navigation product, not as an SEO-keyword bucket.

A tag is retired when one of these conditions applies:

1. it duplicates a category or a clear category alias;
2. it is a single-use article-specific phrase with no demonstrated recurrence;
3. it is a single-use version, CVE, bill number, support-deadline, pricing phrase, or similar transient label;
4. it is a single-use tag that also duplicates the post's own SEO-keyword intent, unless it is on the strategic durable-topic exception list;
5. it is a thin format-like label already better served by a category or stronger archive.

The policy intentionally preserves a small set of first-use strategic entities/technologies such as `VPN`, `5G`, `AMD`, `Broadcom`, `PIPEDA`, `Starlink`, `Signal`, `Wi-Fi 7`, `post-quantum cryptography`, `ransomware`, and other subjects likely to become recurring Mapletechie coverage.

Two-post subjects are generally retained because they already demonstrate recurrence. They remain outside the sitemap until they reach the existing three-published-post threshold.

## Simulated article impact

| Metric | Result |
| --- | ---: |
| Published posts whose tag arrays would change | 276 |
| Tag assignments removed | 534 |
| Tag assignments merged into canonical tags | 7 |
| Missing category memberships to add first | 7 |
| Article URLs changed | 0 |
| Article titles/bodies changed | 0 |
| Publication timestamps changed | 0 |
| Main article sitemap removals | 0 |

The complete before/after list for all 276 affected posts is committed separately.

## Future automation rules recommended after approval

This dry run does **not** change the Daily Desk yet. The production rule change I recommend after the taxonomy cleanup is approved:

1. **Categories first.** Category is the broad editorial section.
2. **Tags are optional, 0–4.** No minimum quota. A story with one excellent tag is better than padding it with disposable ones.
3. **A tag must be a reusable reader-facing subject archive.** It should make sense as a page containing several useful Mapletechie articles.
4. **Never use a category name as a tag.**
5. **Do not use category-like format labels as tags** when an existing category or archive already serves that purpose.
6. **Reuse existing taxonomy before creating anything new.**
7. **At most one genuinely new tag per draft**, and only when future recurrence is reasonably likely.
8. **SEO keywords are different.** `seo_keywords` may contain exact search phrases, model/version names, one-off event wording, product queries, and long-tail intent. They do not create public archive pages.
9. **Do not create a tag merely because a phrase is a useful keyword.**
10. **Backend enforcement should reject category duplicates and known retired aliases**, so the taxonomy cannot drift back even if a draft is created outside the Daily Desk.

## Files

- `reports/tag-taxonomy-pass2b-classification-2026-10-04.csv` — every current tag, its action, destination/410, reason, counts, category-backfill count, categories, and example articles.
- `reports/tag-taxonomy-pass2b-affected-posts-2026-10-04.csv` — every affected article with exact before/after tag arrays.
- `scripts/src/tagTaxonomyPolicy.ts` — deterministic classification policy.
- `scripts/src/tag-taxonomy-classify.ts` — read-only production simulator.
- tests lock the category, merge, singleton, strategic-exception, and established-archive behaviour.

## Approval boundary

No production taxonomy change is authorized by this report.

If approved, the next implementation should:

- pin the exact reviewed classification;
- add the 7 missing category memberships before removing category-duplicate tags;
- apply all article-tag changes transactionally;
- add 301 redirects for **MERGE** and **RETIRE → CATEGORY**;
- return 410 for explicitly retired tag archives;
- preserve article URLs, content, authorship, categories, and publication dates;
- update the Daily Desk and backend guardrails in a separate committed change;
- run a post-migration sitemap/internal-link verification before declaring the cleanup complete.
