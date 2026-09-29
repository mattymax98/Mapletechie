# Threat model

This document describes the current production security model for Mapletechie.
It is an operational reference, not a substitute for periodic code review or
external testing.

## Architecture

Mapletechie is a public React/Vite site backed by an Express 5 API and
PostgreSQL. Production runs on Railway. Public article/media delivery uses
Cloudflare R2-backed object storage, and outbound mail uses Resend.

Human editors use the authenticated admin application. External editorial
automation reaches only the token-protected automation/MCP boundary and is
review-only: it can inspect content, upload media, create drafts, preview posts,
and propose corrections, but it cannot publish, schedule, feature, or set
server-controlled authorship/publication fields.

## Assets

- Admin/editor passwords and 30-day session tokens.
- Railway, PostgreSQL, R2, Resend, MCP, and automation credentials.
- Published and scheduled editorial content.
- Revision/audit history and editorial decision metadata.
- Newsletter subscriber addresses, contact submissions, job applications, and
  other reader-provided data.
- Uploaded media and the production R2 bucket.
- Email sending reputation for the verified Mapletechie domain.

## Trust boundaries

### Public Internet -> public site/API

Published posts, categories, tags, authors, search, feeds, sitemaps, selected
settings, public comments/job listings, and article media are intentionally
public.

Uploaded article objects under `GET /storage/objects/*` are also intentionally
public because published posts use those URLs. Public read access is not an
upload permission.

### Admin browser -> admin API

The browser UI is not a security boundary. Admin/editor permissions are enforced
server-side with `adminAuth`, role checks, and permission checks. Login verifies
the stored bcrypt password hash.

`ADMIN_PASSWORD` is only a fresh-database bootstrap input. When any user
already exists, bootstrap returns without changing existing login credentials.
It is not a login bypass.

### Uploads -> object storage

Both upload-grant and direct upload routes are authenticated:

- `POST /storage/uploads/request-url` requires `adminAuth`.
- `POST /storage/uploads` requires `adminAuth`, accepted raster MIME types,
  Sharp decoding, format verification, pixel limits, and supported dimensions.

Public-object delivery remains unauthenticated by design. Write capability must
stay authenticated.

### External editorial automation -> automation/MCP

The raw automation API and MCP connector use independent server-side secrets.
MCP authentication is constant-time compared and fails closed when its secret is
missing or too short.

Automation-created posts are forced to draft status and a server-controlled bot
byline. Forbidden publication/authorship fields are rejected rather than
silently ignored. Published/scheduled corrections go through review-only
revision proposals and require human approval.

Direct in-CMS AI publication/generation is not part of the current production
workflow; repository tests guard against reintroducing it.

### API -> PostgreSQL

Drizzle parameterization is the default database access path. Production
migrations must go through the pinned Railway migration guard, which verifies
the database name and PostgreSQL cluster system identifier on the same
connection before any write.

### API -> external image hosts

External image persistence is an SSRF-sensitive boundary. The existing image
pipeline resolves/validates remote hosts and blocks private/internal targets.
Any future image-fetch feature must reuse the same protections.

### API -> Resend

Only the server holds `RESEND_API_KEY`. Client code must never receive it.
The sending domain is independently verified in Resend.

## Editorial integrity controls

- Published URL/original-publication identity is guarded in the database.
- Protected published content changes use the revision workflow.
- Meaningful title/excerpt/body approvals may advance
  `contentModifiedAt`; metadata-only edits do not.
- Public Update history exposes only sanitized date + reader-facing summary.
  Raw diffs, audit payloads, reviewers, rejected proposals, and superseded
  workflow data stay private.
- Supersession is a durable audit decision. Current production schema retains a
  legacy three-value revision-row status constraint, so actionable read paths
  also consult terminal audit decisions.

## Credential/source-control boundary

The GitHub repository is public. No secret may be committed, placed in
documentation, generated fixtures, workflow files, or build arguments.

Production credentials live in Railway Variables. Development credentials must
live in an untracked local environment or another secret manager and should use
the separate development R2 bucket.

The earlier committed workspace-configuration credential exposure was removed
from reachable repository history during the September 2026 history cleanup.
That cleanup does not replace credential rotation; exposed credentials must
remain revoked/replaced.

## Key risks to continue monitoring

- Long-lived stolen admin session tokens.
- Credential leakage into a public repository or CI logs.
- Authorization regressions on admin, revision, upload, or MCP routes.
- SSRF regressions in external image fetching.
- Unsafe raster/image decoder inputs or dependency regressions.
- Public API serializers accidentally leaking internal revision/audit fields.
- Abuse of contact/newsletter/comment/email endpoints despite rate limits.
- Broken migration/deploy ordering that ships code before required live schema.
- Incorrect cache/crawler behavior exposing private preview or admin material.
- Email-domain reputation, bounce, complaint, SPF/DKIM/DMARC alignment.

## Security review anchors

Start reviews with:

- `artifacts/api-server/src/middlewares/adminAuth.ts`
- `artifacts/api-server/src/routes/admin.ts`
- `artifacts/api-server/src/routes/posts.ts`
- `artifacts/api-server/src/routes/postRevisions.ts`
- `artifacts/api-server/src/routes/storage.ts`
- `artifacts/api-server/src/routes/automation.ts`
- `artifacts/api-server/src/routes/mcp.ts`
- `artifacts/api-server/src/lib/persistExternalImage.ts`
- `scripts/src/railwayMigrationGuard.ts`
- `scripts/src/railwaySchemaCompatibility.ts`

For scanner findings, distinguish confirmed exploitability from stale findings,
intentional public behavior, and defense-in-depth improvements before changing
production behavior.
