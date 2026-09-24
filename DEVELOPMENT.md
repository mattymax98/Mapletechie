# Development guide

Mapletechie is a pnpm workspace running Node.js 24.

## Prerequisites

- Node.js 24
- pnpm 10.26.1
- PostgreSQL 16
- The `mapletechie-development` Cloudflare R2 bucket and an Object Read & Write
  token scoped only to that bucket

## Setup

1. Run `pnpm install`.
2. Copy `.env.example` to `.env` and fill in development credentials.
3. Start PostgreSQL and set `DATABASE_URL`.
4. Start the API with `pnpm run dev:api`.
5. Start the website with `pnpm run dev:web`.
6. Optionally start component previews with `pnpm run dev:mockups`.

The website development server proxies `/api` to
`http://127.0.0.1:8080`. Override `API_PROXY_TARGET` when the API runs
elsewhere.

### Development object storage

Development must use the separate `mapletechie-development` R2 bucket. Create
an R2 Object Read & Write token scoped only to that bucket, then put its access
key and secret in the local `.env`.

Use these paths:

```text
PRIVATE_OBJECT_DIR=/mapletechie-development/private
PUBLIC_OBJECT_SEARCH_PATHS=/mapletechie-development/covers,/mapletechie-development/public
```

Do not use the production `mapletechie` token for local development. Separate
bucket-scoped credentials prevent test uploads or deletions from touching live
article media.

After adding or replacing development R2 credentials, run:

```bash
pnpm run validate:development-storage
```

This writes, reads, and removes a random disposable object in
`mapletechie-development`, then performs a read-only bucket access check against
`mapletechie`. The command succeeds only when the development operation works
and the production bucket denies access. It never reads, writes, or deletes a
production object.

## Verification

Run these checks before committing:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test
pnpm run build
```

### Production database migrations

The published site uses Railway PostgreSQL. `DATABASE_URL` is for local
development, and `RAILWAY_DATABASE_URL` is the only production migration
target. Use the guarded command from the workspace root:

```bash
pnpm --filter @workspace/scripts run migrate:railway --check
pnpm --filter @workspace/scripts run migrate:railway --apply 0006_author_only_updates_preserve_updated_at.sql --confirm-railway-production
```

Running the command without arguments is also read-only. The second command
requires both an explicit apply flag and a confirmation flag, plus a reviewed SQL
filename from `scripts/migrations/` (or `repair-railway-schema.sql`). Both use
only `RAILWAY_DATABASE_URL` and verify the live Railway database name and
PostgreSQL cluster identity **on the same connection** before any SQL runs.
They fail closed if Railway's database is replaced; independently confirm the
new live service before changing the pinned identity. The runner uses a
transaction with a 5-second lock timeout and a 120-second statement timeout.
Before applying, it prints only the filename and that the pinned identity
matched; it never prints a database URL. Drizzle's development `push` also
rejects connections equivalent to the configured Railway URL at the
same host, port and database, even when credentials or URL options differ.
This is **defense-in-depth only**: hostname aliases can still refer to the same
cluster. The guarded runner is the authoritative production migration path.
Do not use raw `psql` or an unguarded Drizzle `push` for production.
The historical `copy-posts-dev-to-prod` utility is not a routine migration:
it now requires `RAILWAY_DATABASE_URL`, verifies that database's identity, and
refuses to run without an explicit confirmation flag. Its row set must be
separately reviewed and approved before anyone invokes it.

## Validated direct-to-main development

`main` is the production branch and Railway deploys it automatically. Routine
work follows this delivery sequence:

1. Fetch the latest `origin/main` and confirm the working copy is based on it.
2. Implement the requested change.
3. Run the validation commands above.
4. Commit with `mattymax98 <197423417+mattymax98@users.noreply.github.com>` as
   both author and committer, with no additional attribution trailers.
5. Fetch `origin/main` again, confirm the commit is a normal fast-forward, and
   run a targeted HTTPS dry-run push.
6. Push directly to GitHub `main` over HTTPS using the configured GitHub CLI
   credential helper.
7. Confirm Railway deploys that exact commit and verify the affected production
   behavior.

These are normal task-completion steps, not separate prompts for approval.
The repository-local GitHub HTTPS credential helper uses
`gh auth git-credential`; do not fall back to a broken askpass credential,
embed tokens, or add SSH deploy keys. If authentication fails, stop and report
it. Do not force-push, reset, or delete `main` during routine work. If GitHub branch
protection prevents a normal authenticated fast-forward push, report the
owner-side setting instead of bypassing it. Feature branches, pull requests, and
Railway pull-request environments are optional tools for exceptional work, not
requirements for normal delivery.

The scheduled canonical-host canary is independent of this delivery flow and
must remain enabled.

## External editorial automation

AI-assisted research, drafting, and image preparation happen outside the CMS
through the authenticated MCP/automation workflow. That workflow may inspect
content, upload media, preview posts, and create drafts, but it cannot publish,
schedule, feature, or set server-controlled authorship. Keep
`AUTOMATION_DRAFT_TOKEN` and `MCP_CONNECTOR_TOKEN` server-side.

## Deployment

Production is hosted on Railway. The API uses Railway PostgreSQL and
Cloudflare R2. Deployment details and required variables are documented in
`RAILWAY.md`.