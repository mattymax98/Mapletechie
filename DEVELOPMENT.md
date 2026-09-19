# Development guide

Mapletechie is a pnpm workspace running Node.js 24.

## Prerequisites

- Node.js 24
- pnpm 10.26.1
- PostgreSQL 16
- A Cloudflare R2 bucket and API credentials for media storage

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