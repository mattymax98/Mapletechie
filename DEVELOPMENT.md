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

## Deployment

Production is hosted on Railway. The API uses Railway PostgreSQL and
Cloudflare R2. Deployment details and required variables are documented in
`RAILWAY.md`.