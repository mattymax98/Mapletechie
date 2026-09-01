# Mapletechie daily editorial automation

The canonical operating contract is maintained in
`artifacts/api-server/src/lib/editorialAutomationContract.ts`. The connected
MCP client can retrieve the same contract with the read-only
`get_mapletechie_editorial_contract` tool. Keep the external daily routine's
instruction/message synchronized with that source; do not create a second
long-form prompt that can drift.

## Schedule

| Setting | Value |
| --- | --- |
| Cadence | Every day, Sunday through Saturday |
| Local time | 7:00 AM |
| Time zone | `America/Thunder_Bay` |
| Cron representation | `0 7 * * *` |
| Volume | At least five fresh completed drafts; no artificial maximum |
| Authority | Research, writing, image preparation, validation, and draft submission only |
| Human control | Editors review every item and alone publish or schedule it |

The routine is an external scheduled client, not a server-side publishing job.
Routine execution can begin slightly before or after the scheduled minute.
If the workspace routine is missing or its metadata is stale, recreate/update
its message from the canonical contract and refresh/publish the MCP tool
metadata before the next run. Never put connector credentials in this
repository or in the routine message.

## Required run order

1. Call `get_mapletechie_editorial_contract`.
2. Call `list_mapletechie_categories` and use only the live categories.
3. Call `list_mapletechie_posts` for recent `published`, `scheduled`, and
   `draft` coverage. Compare search intent, titles, slugs, and categories before
   selecting candidates.
4. Keep fresh daily candidates separate from backlog/catch-up and maintenance
   candidates. Maintenance candidates may be identified, but there is no
   separate archive maintenance desk in this workflow.
5. Research from multiple defensible sources, select rights-safe imagery, and
   complete the factual, originality, prose, SEO, linking, structured-data,
   image-rights, alt-text, HTML, and visual checks.
6. Upload images with `upload_mapletechie_image` where possible. Submit each
   completed article with `create_mapletechie_draft` and a stable,
   article-specific `Idempotency-Key`/`idempotency_key`.
7. Verify the returned `status` is exactly `draft`, retain the `id` and edit
   URL, and complete post-submission QA. A draft response is not a publication
   response.

The private API and MCP tool reject `status`, `author`, `author_id`,
`author_avatar`, `published_at`, `scheduled_for`, and `is_featured`. They also
reject unsupported fields, unknown categories, duplicate slugs, unsafe or
empty sanitized HTML, missing image alt text, unsupported image sources, and
invalid image replacements. A new draft is also blocked if image persistence
falls back to an external URL, so a partially stored article is never reported
as completed. The automation must not try to work around those errors.

`backfill_mapletechie_images` is only for an explicitly identified repair on
an existing post. It can update image-related fields, including on a published
post, but preserves that post's author, byline, status, slug, and publication
time. It is not a new-article submission or a publishing mechanism.

## Completion report

Use this order and vocabulary in the run report:

```text
RUN — YYYY-MM-DD HH:MM America/Thunder_Bay
FRESH — completed N / minimum 5
COMPLETED
- id; title; category; edit URL
  sources: source name + URL
  image: source/creator + license or permission basis + stored URL
  QA: status=draft; returned fields checked; content/image/alt/SEO/link checks

BACKLOG / CATCH-UP
- candidate; label; outcome

BLOCKED
- candidate; exact stage; exact blocker; sources/images checked; next manual action

PARTIAL
- draft id if accepted; unresolved QA or reporting check; connector limitation;
  explicitly not counted as COMPLETED

LIMITATIONS — exact connector or MCP metadata limitation, if any
NEXT MANUAL ACTION — editor review, rights check, metadata refresh, or other action
```

`COMPLETED` means the API accepted a review-only draft and post-submission QA
passed. `BLOCKED` means no draft was accepted. `PARTIAL` means a draft may have
been accepted but a required verification remains unresolved; it is never
counted toward five. If the run cannot reach five fresh items, report the
shortfall plainly rather than submitting filler or claiming success.

## Connector/MCP recovery

When the MCP connector is unavailable, unauthorized, or advertising an old
tool schema, report the exact limitation and stop claiming that the article
was submitted. The operator must verify the connector URL and authorization,
refresh/publish the MCP metadata snapshot, and then retry with the same stable
idempotency key. The API's idempotency ledger makes a safe retry return the
existing draft instead of creating a duplicate.