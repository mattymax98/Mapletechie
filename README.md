# Mapletechies

Independent tech publication — mapletechie.com.

A bold editorial site covering AI, electric vehicles, cybersecurity, and consumer
gadgets, with a multi-user admin panel, weekly newsletter, reader reviews,
careers and advertising pages, and on-site analytics.

## Stack

- pnpm workspace monorepo (Node 24, TypeScript 5.9)
- Frontend: React + Vite + Tailwind + shadcn/ui
- Backend: Express 5 + Drizzle ORM + PostgreSQL
- Email: Resend
- Hosted on Replit

## Project layout

```
artifacts/
  tech-blog/      # Public website (React + Vite)
  api-server/     # REST API (Express)
  mockup-sandbox/ # Internal component preview
lib/              # Shared packages (db, api-spec, api-client-react, etc.)
scripts/          # Helper scripts
```

## Local commands

```bash
pnpm install            # install dependencies
pnpm -r run typecheck   # type-check everything
pnpm run build          # build all artifacts
```

Each artifact has its own `dev` script (`pnpm --filter @workspace/tech-blog run dev`, etc.).

## Required environment variables

Set these as secrets in your hosting environment (never commit them):

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — random string for session signing
- `ADMIN_PASSWORD` — admin panel password
- `RESEND_API_KEY` — Resend API key for the newsletter
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` — object storage config

## License

All rights reserved.
