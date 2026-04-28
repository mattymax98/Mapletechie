# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains "Mapletechie" (mapletechie.com) — a tech blog website inspired by The Verge and TechCrunch, with a React frontend and Express API backend.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/tech-blog)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **UI**: Tailwind CSS, shadcn/ui, framer-motion
- **SEO**: react-helmet-async (Open Graph, Twitter Cards, JSON-LD ready)

## Artifacts

### Tech Blog (`artifacts/tech-blog`)
- Preview path: `/`
- Full tech blog site: Mapletechie (mapletechie.com)
- Pages: Home, Blog, Blog Post, Shop, Contact, Category, Admin
- SEO: react-helmet-async applied to all pages (title, description, OG tags, Twitter cards)
- Admin panel at `/admin` (password-protected, no Layout wrapper)
- `public/robots.txt` included; sitemap.xml served dynamically from API

### API Server (`artifacts/api-server`)
- Preview path: `/api`
- Express 5 REST API
- Routes: posts (CRUD), categories, products, contact, stats, admin login, sitemap.xml
- Admin auth: `Authorization: Bearer <session-token>` header required for protected routes. Sessions are issued by `POST /api/admin/login` against the `users` table (bcrypt-hashed passwords). The legacy `ADMIN_PASSWORD` bearer-token bypass and `/admin/verify` endpoint were removed.
- Rate limiting: `express-rate-limit` middleware in `src/middlewares/rateLimit.ts` protects public-write endpoints (`/contact`, `/comments`, `/newsletter/subscribe`, `/reviews`, `/advertise`, `/admin/login`, `/admin/generate-post`). `app.set('trust proxy', 1)` so the limiter sees the real client IP behind the Replit/Cloudflare proxy.
- 401/403 admin responses set `X-Robots-Tag: noindex, nofollow` so search engines don't index error pages.

## Database Schema

Tables: `posts`, `categories`, `products`, `contact_submissions`, `jobs`, `job_applications`, `reviews`, `ad_inquiries`.

Seeded with: 6 posts, 6 categories, 6 products, 1 job (`senior-editor`).

## Public Pages (Mapletechie)

Home, Latest, Blog Post, Category, Shop, About, Contact, **Careers** (`/careers`, `/careers/:slug`), **Advertise** (`/advertise`), **Reader Reviews** (`/reviews`).

## Admin Pages

Dashboard, Posts (CRUD), Users, Profile, **Jobs** (`/admin/jobs` — full CRUD), **Inbox** (`/admin/inbox` — unified view of job applications, reader reviews w/ approve/reject, ad inquiries, and contact messages).

## Admin Panel

- URL: `/admin` (redirects to `/admin/login` if not logged in)
- Founding admin: username `matthew` (password set via `ADMIN_PASSWORD` env secret — not stored in repo)
- Multi-user: editors with per-user permissions
- Permission flags on each user: `canPublishDirectly`, `canManageShop`, `canManageJobs`, `canViewInbox`, `canManageEditors`. The `admin` role bypasses all checks. Only the admin can set role or permission flags, and the founding admin account cannot be modified or deleted by non-admins.
- Server enforcement: `requirePermission(...perms)` middleware in `artifacts/api-server/src/middlewares/adminAuth.ts` gates `/admin/products` (shop), `/admin/jobs` + `/admin/applications` (jobs), `/admin/contacts` + `/admin/reviews` + `/admin/ad-inquiries` + `/admin/inbox-counts` (inbox), `/admin/users` (editors).
- Admin nav buttons in dashboard render conditionally based on the same flags.

## Newsletter

- Weekly digest, Friday 5pm America/Toronto, scheduled in `artifacts/api-server/src/lib/newsletterScheduler.ts`.
- Provider: Resend (used directly via `RESEND_API_KEY` secret — user dismissed the Replit Resend integration).
- Sender: `Mapletechies <newsletter@mapletechie.com>` (requires DNS records in Namecheap: SPF TXT, DKIM TXT records from Resend, optional DMARC).
- Footer subscribe form uses `useSubscribeNewsletter` hook.
- Admin page `/admin/newsletter` (admin-only): stats, send test, send now, subscriber list with delete.

## SEO Setup

- `SEO` component: `artifacts/tech-blog/src/components/SEO.tsx`
- Applied to: Home, Blog Index, Blog Post, Shop, Contact pages
- Dynamic sitemap: `GET /api/sitemap.xml`
- robots.txt: `artifacts/tech-blog/public/robots.txt` (points sitemap to mapletechie.com)
- Site domain constant in SEO.tsx: update `SITE_URL` when deploying

## API Spec

Located at `lib/api-spec/openapi.yaml`. Run codegen with:
```
pnpm --filter @workspace/api-spec run codegen
```

## Key Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-managed by Replit)
- `SESSION_SECRET` — Session secret (set in Replit Secrets)
- `ADMIN_PASSWORD` — Used **only** to bootstrap the founding admin (`matthew`) on first boot via `bootstrapAdmin()`. After that, login goes through `POST /api/admin/login` against the `users` table. Not used as an auth bypass anywhere else.
- `SITE_DOMAIN` — Used in sitemap.xml generation (default: `https://mapletechie.com`)
