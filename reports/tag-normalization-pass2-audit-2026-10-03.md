# Tag normalization Pass 2 audit — 2026-10-03

## Status

**Read-only audit only. No semantic tag merges, tag deletions, category changes, article edits, redirects, or sitemap changes were applied in Pass 2.**

The production audit ran successfully against the live Railway database after Pass 1 normalization. It inspected all 400 published posts inside a PostgreSQL `READ ONLY` transaction.

## What Pass 2 found

| Metric | Result |
| --- | ---: |
| Published posts | 400 |
| Distinct canonical tags after Pass 1 | 770 |
| Tags used on exactly one published post | 540 |
| Tags used on exactly two published posts | 121 |
| Tags used on 3+ published posts | 109 |
| Category names also being used as tags | 9 |
| Editorial-format tags found | 7 |
| High-confidence semantic duplicate pairs | 7 |

**661 of 770 tags (85.8%) are currently used by only one or two published posts.** That is the main taxonomy problem now. Pass 1 fixed spelling fragmentation; Pass 2 shows that most remaining bloat comes from one-off entities, article-specific concepts, category duplication, and editorial-format labels.

## Category duplication

These tags exactly duplicate existing category names:

| Tag | Published posts using it |
| --- | ---: |
| AI | 9 |
| Business & Policy | 8 |
| Canada Tech | 6 |
| News | 5 |
| Gadgets | 4 |
| Gaming | 4 |
| Guides | 2 |
| Reviews | 1 |
| Software & Apps | 1 |

This does not mean they should automatically be deleted. It means they should be reviewed as a class because category pages already provide the broader archive. If retired as tags, old tag URLs should redirect to the matching category URL rather than disappear.

## Editorial-format tags

The audit found these format labels in the tag system:

| Tag | Published posts |
| --- | ---: |
| Analysis | 15 |
| Guide | 12 |
| News | 5 |
| Guides | 2 |
| Explainer | 1 |
| Review | 1 |
| Reviews | 1 |

`Guide` / `Guides`, `News`, and `Review` / `Reviews` overlap directly with category or content-type concepts. `Analysis` is used enough to be potentially useful, so it should not be removed merely because it describes format.

## High-confidence semantic duplicate candidates

These are lexical/semantic review candidates only. No merge has been applied.

| Candidate A | Uses | Candidate B | Uses | Combined | Co-occur on same post | Audit reason |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| AI | 9 | artificial intelligence | 6 | 15 | 0 | acronym wording |
| Guide | 12 | Guides | 2 | 14 | 0 | singular/plural |
| backups | 4 | Backup | 3 | 7 | 0 | singular/plural |
| supply chains | 3 | supply chain | 1 | 4 | 0 | singular/plural |
| data breach | 2 | Data breaches | 2 | 4 | 0 | singular/plural |
| mobile hotspot | 1 | mobile hotspots | 1 | 2 | 0 | singular/plural |
| Review | 1 | Reviews | 1 | 2 | 0 | singular/plural |

The strongest actual topic merges are `backups` / `Backup`, `supply chains` / `supply chain`, `data breach` / `Data breaches`, and `mobile hotspot` / `mobile hotspots`.

`Guide` / `Guides` and `Review` / `Reviews` should probably be treated as redundant format/category tags rather than merged into another permanent tag archive.

`AI` / `artificial intelligence` needs a taxonomy decision because `AI` is also an existing category. A merge is technically obvious, but the cleaner long-term answer may be to avoid duplicating the AI category with an AI tag.

## Examples of why the remaining 540 singleton tags need a policy, not a mass merge

The singleton inventory includes both useful entities and very article-specific labels, for example:

- `1Password`, `AMD`, `AirPods`, `Apple Watch` — real entities/products that may recur later.
- `120 Hz`, `4K gaming`, `AI evaluation`, `AI forecasting` — concepts that may or may not deserve durable archives.
- `9/11`, `America.gov`, `Activation Lock`, `App Tracking Transparency` — highly specific story subjects.
- `AI assistants`, `AI benchmarks`, `AI coding`, `AI hardware`, `AI jobs`, `AI music`, `AI transparency` — a good example of tag fragmentation inside one larger beat.

Deleting every singleton would be as wrong as keeping every singleton. The taxonomy needs a durability rule.

## Proposed Pass 2 policy

Before any production migration, I recommend adopting these rules:

1. **Categories and tags should not duplicate each other by default.** A category already provides the broad archive.
2. **Tags should represent reusable subjects, not every entity or phrase mentioned in one story.**
3. **New first-use tags should be exceptional.** The editor/Daily Desk should first search the established taxonomy and reuse a durable tag when it fits.
4. **Entity tags can remain when recurring coverage is likely or already established.** One-off bill numbers, CVEs, individual transactions, and transient event labels normally should not become permanent archives.
5. **Do not force broader semantic merges.** `AI policy`, `AI regulation`, `AI safety`, and `AI governance` are related but meaningfully different and should not be collapsed merely to reduce tag count.
6. **Keep the 3-post sitemap threshold.** Thin tag pages can remain available to readers but should stay out of the sitemap/noindex until they have real depth.
7. **Add a warning, not a hard block, for brand-new tags.** This prevents accidental sprawl while still allowing genuinely new beats to emerge.
8. **Redirect retired tag archives.** When a tag is merged or replaced by a category, preserve old URLs with a 301 to the closest canonical archive.

## Recommended first production batch for Pass 2

The safest first semantic batch would be small and reversible:

- merge `backups` + `Backup`;
- merge `supply chain` + `supply chains`;
- merge `data breach` + `Data breaches`;
- merge `mobile hotspot` + `mobile hotspots`;
- retire `Guide` / `Guides` as tags in favour of the Guides category;
- retire `Review` / `Reviews` as tags in favour of the Reviews category;
- retire `News` as a tag in favour of the News category.

I would leave `AI` / `artificial intelligence`, `Analysis`, and the other category-duplicate tags for a second decision after checking how often they serve useful cross-category navigation.

## Next approval boundary

No production data changes are authorized by this audit. The next production change should be another exact dry run showing:

- every affected post;
- before/after tag arrays;
- old tag URL -> destination redirect;
- resulting distinct-tag count;
- resulting singleton/doubleton counts;
- resulting sitemap-eligible tag count.

Only after that review should Pass 2 write to production.
