# Tag normalization Pass 1 dry run — 2026-10-03

## Status

**Read-only production audit. No post, tag, article URL, title, body, author, publication date, category, series, topic cluster, or sitemap article entry was modified.**

The dry run executed successfully against the live Railway PostgreSQL database at 2026-10-03T22:43:32.769Z. The script opened a PostgreSQL `READ ONLY` transaction and inspected published posts only.

## Approved Pass 1 scope

This pass recognizes only safe presentational aliases:

- case-only differences;
- supported HTML entity encoding such as `&amp;`;
- Unicode NFKC normalization;
- repeated/leading/trailing whitespace;
- equivalent duplicates within one post.

It does **not** make semantic decisions such as merging `AI agents` into `AI`, `iCloud` into `cloud storage`, or `used phones` into `smartphones`.

For an alias group, the canonical display spelling is the historical spelling used by the largest number of published posts, after safe text cleanup.

## Production dry-run result

| Metric | Result |
| --- | ---: |
| Published posts scanned | 400 |
| Distinct stored tag spellings before | 832 |
| Safe canonical tag identities after | 770 |
| Safe alias groups | 61 |
| Published posts whose stored tag spelling would change | 63 |
| Duplicate tag assignments removed within posts | 0 |
| Sitemap-eligible tag identities before | 109 |
| Sitemap-eligible tag identities after | 109 |
| Newly canonical sitemap identity | 1 |
| Historical alias URL redirects needed | 71 |

The one newly canonical sitemap identity is **Business & Policy**, used by 8 published posts. The stored historical spelling is `Business &amp; Policy`, so this is entity cleanup rather than a semantic retag.

The sitemap-eligible count stays at 109 because the existing sitemap already groups most case-only variants with `lower(tag)`. Pass 1 primarily improves stored taxonomy consistency, internal linking, canonical tag URLs, and future writes rather than increasing the raw number of sitemap tag archives.

## Representative safe aliases

| Canonical tag | Historical variants / published uses |
| --- | --- |
| cybersecurity | `cybersecurity` 27, `Cybersecurity` 14 |
| privacy | `privacy` 22, `Privacy` 12 |
| data centres | `data centres` 12, `Data Centres` 3, `Data centres` 1 |
| AI safety | `AI safety` 9, `AI Safety` 6 |
| AI infrastructure | `AI infrastructure` 11, `AI Infrastructure` 2 |
| AI policy | `AI policy` 6, `AI Policy` 3 |
| troubleshooting | `troubleshooting` 8, `Troubleshooting` 3 |
| passwords | `passwords` 3, `Passwords` 2 |
| phishing | `phishing` 5, `Phishing` 1 |
| semiconductors | `semiconductors` 6, `Semiconductors` 2 |
| consumer rights | `consumer rights` 4, `Consumer Rights` 2 |
| Telecom | `Telecom` 3, `telecom` 1 |
| Business & Policy | historical `Business &amp; Policy` 8 |

## Code prepared in this pass

- a reusable safe tag-normalization library;
- tests for entity decoding, casing, whitespace and deduplication;
- a production dry-run script that requires the guarded Railway production database variable and performs no writes;
- write-time normalization for manual/admin post edits and Daily Desk drafts so known aliases do not keep multiplying;
- permanent redirects from historical safe alias tag URLs to one canonical lowercase tag URL;
- crawler tests for the canonical tag redirects.

## Deliberately not applied

The existing 400 published posts have **not** been updated. The next step, if separately approved, is a committed guarded migration that changes only `posts.tags` according to this exact safe normalization policy and leaves all editorial fields untouched.

Semantic consolidation remains a separate Pass 2 review and is not authorized by this report.
