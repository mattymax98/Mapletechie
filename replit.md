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
- Pages: Home, Blog, Blog Post, Contact, Category, Admin (the standalone Shop and Reader-Reviews pages were removed in May 2026)
- SEO: react-helmet-async applied to all pages (title, description, OG tags, Twitter cards)
- Admin panel at `/admin` (password-protected, no Layout wrapper)
- `public/robots.txt` included; sitemap.xml served dynamically from API

### API Server (`artifacts/api-server`)
- Preview path: `/api`
- Express 5 REST API
- Routes: posts (CRUD + scheduled publish), categories, contact, stats, admin login, media library, newsletter, send-email, sitemap.xml. The legacy `products` and `reviews` routers were removed in May 2026.
- Admin auth: `Authorization: Bearer <session-token>` header required for protected routes. Sessions are issued by `POST /api/admin/login` against the `users` table (bcrypt-hashed passwords). The legacy `ADMIN_PASSWORD` bearer-token bypass and `/admin/verify` endpoint were removed.
- Rate limiting: `express-rate-limit` middleware in `src/middlewares/rateLimit.ts` protects public-write endpoints (`/contact`, `/comments`, `/newsletter/subscribe`, `/advertise`, `/admin/login`, `/admin/generate-post`) plus a per-editor `emailSendLimiter` (50 sends / 24 h, keyed by `user:<id>` using `ipKeyGenerator` for IPv6 fallback) on `/admin/send-email`. `app.set('trust proxy', 1)` so limiters see the real client IP behind the Replit/Cloudflare proxy.

### Posts: scheduled publishing
- `posts.status` enum is `draft | scheduled | published`. `posts.scheduledFor` (timestamp, nullable) holds the future go-live time.
- `startScheduledPublishCron` polls every minute (in `src/lib/scheduledPublishCron.ts`) and atomically promotes any `status='scheduled' && scheduledFor <= now()` row to `published` (`scheduledFor` cleared, `publishedAt` set).
- The public `GET /api/posts*` endpoints filter to `status='published'`. Only the owner/admin sees scheduled rows in `/api/admin/posts`.
- UI: `AdminPostForm` shows a "Schedule for later" datetime-local picker. Picking a future time switches the submit to "Schedule Post"; the dashboard list shows a blue Scheduled badge with the run time.

### Media library
- New `media` table (`src/lib/db/src/schema/media.ts`): `id, url, filename, mime_type, size, uploader_id, created_at`.
- Routes: `GET/POST /api/admin/media` (any authed editor) and `DELETE /api/admin/media/:id` (admin or original uploader).
- UI: `/admin/media` (`AdminMedia.tsx`) — upload via `ImageUploadField`, browse the library grid, copy URL, delete.

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
- Permission flags on each user: `canPublishDirectly`, `canManageJobs`, `canViewInbox`, `canManageEditors`, `canSendEmail`. (The legacy `canManageShop` flag still exists in the DB column for historical rows but the UI toggle and the `/admin/products` enforcement were removed.) The `admin` role bypasses all checks. Only the admin can set role or permission flags. Editor email is locked: `users.email` is always derived from `username + "@mapletechie.com"` on create, and `PUT /admin/me` and `PUT /admin/users/:id` strip `email` and `username` from the editable list — changing them requires deleting and recreating the account.
- AI generation (`/admin/generate-post`) is gated to `requireRole("admin")` — editors cannot trigger it. The `/admin/generate` page is wrapped in `<AdminGuard adminOnly>` so non-admin editors get redirected.
- Server enforcement: `requirePermission(...perms)` middleware in `artifacts/api-server/src/middlewares/adminAuth.ts` gates `/admin/products` (shop), `/admin/jobs` + `/admin/applications` (jobs), `/admin/contacts` + `/admin/reviews` + `/admin/ad-inquiries` + `/admin/inbox-counts` (inbox), `/admin/users` (editors).
- Admin nav buttons in dashboard render conditionally based on the same flags.

## Newsletter

- Reader newsletter is **manual** — the auto-`startNewsletterScheduler` was removed in May 2026. An admin composes each digest on `/admin/newsletter`: `subject` (required) + optional `editorNote` markdown, with a live preview of the past-7-days posts that will be appended via `digestEmailHtml`. `POST /api/admin/newsletter/test` accepts `{to, subject, editorNote}` (single test send); `POST /api/admin/newsletter/send-now` accepts `{subject, editorNote}` and broadcasts to every `status='active'` subscriber.
- A separate weekly **editor digest** cron (`startEditorWeeklyDigestCron`, Sunday 8 PM America/Toronto) emails the founding admin a week-in-review of new posts, comments, and inbox activity — purely internal, never sent to subscribers.
- Provider: Resend (used directly via `RESEND_API_KEY` secret — user dismissed the Replit Resend integration).
- Sender: `Mapletechies <newsletter@mapletechie.com>` (requires DNS records in Namecheap: SPF TXT, DKIM TXT records from Resend, optional DMARC).
- Footer subscribe form uses `useSubscribeNewsletter` hook.
- Admin page `/admin/newsletter` (admin-only): stats, send test, send now, subscriber list with delete.
- Shared email helper: `artifacts/api-server/src/lib/email.ts` exports `sendEmail`, `NEWSLETTER_FROM`, `CAREERS_FROM` (default `Mapletechies Careers <careers@mapletechie.com>`), `CAREERS_REPLY_TO` (default `matthew@mapletechie.com`), `SITE_URL`. All sender/reply-to addresses are env-overridable.
- Careers reply: admin endpoint `POST /api/admin/applications/:id/reply` (jobs permission). Sends a branded HTML email via Resend, sets `applications.status = "replied"`, writes an audit log, returns 503 if `RESEND_API_KEY` is missing. UI lives inline on the Inbox → Applications tab in `AdminInbox.tsx` with template chips (forward / pass / clarify / blank).
- Careers replies are intentionally always sent **from and replied-to** the shared `careers@` mailbox so all editors see/handle one shared candidate thread. The replying editor's name appears only in the sign-off. The HTML/text wrapper auto-prepends `Hi {firstName},` and appends the `Best, {Display}` sign-off — chip templates must NOT include either, or the candidate sees a duplicate greeting.

### General-purpose Send Email (admin compose)

- Permission flag: `users.canSendEmail` (boolean, default false). Founding admin always has it; other editors must be granted it via Admin → Manage Editors → "Send Email" toggle (admin-only toggle).
- Permission key: `"email"` in `requirePermission(...)`; mapped to `req.user.canSendEmail` in `adminAuth.ts`.
- Endpoint: `POST /api/admin/send-email` in `artifacts/api-server/src/routes/sendEmail.ts`. Validates `to` (1–25 emails, comma/semicolon/newline-separated), optional `cc`/`bcc`, `subject` (≤200), `message` (≤20,000). Returns 400 if the editor's `users.email` is not an `@mapletechie.com` address (Resend only sends from our verified domain). Sends via `sendEmail` as `"Display Name <user.email>"` with `replyTo = user.email`. Audit-logs as `email.sent` with recipients + 200-char message preview. CC/BCC are passed through Resend `headers`.
- UI: `artifacts/tech-blog/src/pages/admin/AdminSendEmail.tsx` at `/admin/send-email`. Compose form with To/CC/BCC/Subject/Message, char counters, 4 starter templates (intro, press request, partnership, blank), plain-text body (line breaks preserved). Banners warn if the editor lacks an `@mapletechie.com` profile email. Nav icon (Send) appears in `AdminDashboard.tsx` for `isAdmin || canSendEmail`.
- Editor onboarding: route the new `name@mapletechie.com` address in Cloudflare Email Routing (forward to their personal inbox + verify), then set that address on their profile in Manage Editors.

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
