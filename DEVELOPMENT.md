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
pnpm run typecheck
pnpm run test
pnpm run build
```

## Validated direct-to-main development

`main` is the production branch and Railway deploys it automatically. Routine
work follows this delivery sequence:

1. Fetch the latest `origin/main` and confirm the working copy is based on it.
2. Implement the requested change.
3. Run the validation commands above.
4. Commit with `mattymax98 <197423417+mattymax98@users.noreply.github.com>` as
   both author and committer, with no additional attribution trailers.
5. Fetch `origin/main` again and confirm the commit can be pushed as a normal
   fast-forward.
6. Push directly to `main`.
7. Confirm Railway deploys that exact commit and verify the affected production
   behavior.

Do not force-push, reset, or delete `main` during routine work. If GitHub branch
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