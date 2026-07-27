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

### Posts: review toolkit
- Optional review fields on `posts` (`lib/db/src/schema/posts.ts`): `rating` (doublePrecision, 0–5, nullable), `pros` (text[], default []), `cons` (text[], default []), `verdict` (text, nullable). Server clamps rating to 0–5 and `cleanText`s verdict/pros/cons in both POST insert and PUT `allowed` paths (`artifacts/api-server/src/routes/posts.ts`).
- Exposed through OpenAPI `Post`/`NewPostInput`/`UpdatePostInput`. Editors fill them in the "Review toolkit" section of `AdminPostForm.tsx` (rating number input; verdict/pros/cons textareas, pros/cons one-per-line).
- Rendered on `blog-post.tsx` via `VerdictBox` + `RatingStars` (orange-bordered card before the article body: verdict, partial-fill star rating, green pros / red cons). Returns null when the post has no review data, so regular posts are unaffected.

### Media library
- New `media` table (`src/lib/db/src/schema/media.ts`): `id, url, filename, mime_type, size, uploader_id, created_at`.
- Routes: `GET/POST /api/admin/media` (any authed editor) and `DELETE /api/admin/media/:id` (admin or original uploader).
- UI: `/admin/media` (`AdminMedia.tsx`) — upload via `ImageUploadField`, browse the library grid, copy URL, delete.

## Database Schema

Tables: `posts`, `categories`, `products`, `contact_submissions`, `jobs`, `job_applications`, `reviews`, `ad_inquiries`.

Seeded with: 6 posts, 6 categories, 6 products, 1 job (`senior-editor`).

## Public Pages (Mapletechie)

Home, Latest, Blog Post, Category, Shop, About, Contact, **Our Team** (`/team`), **Careers** (`/careers`, `/careers/:slug`), **Advertise** (`/advertise`), **Reader Reviews** (`/reviews`).

### Our Team (`/team`)
- `our-team.tsx` masthead grid of all active editors via `useListEditors`. Cards show avatar, "Founding Editor" badge (role `admin`), published-post count, bio, and socials; link to `/author/:username` when a username is present.
- Backed by `GET /editors` (`artifacts/api-server/src/routes/admin.ts`), extended to also return `username`, `role`, and `postCount` (grouped count of `status='published'` posts by `authorId`). These three were added as optional fields on the shared OpenAPI `AuthorProfile` schema.
- Linked from the navbar (desktop + mobile) and footer "Company" column.

### Category colors
- Category accent colors live in the DB `categories.color` column and render through `CategoryChip` (`readableTextColor` picks accessible text). The curated palette in `seedCategories.ts` and all existing rows use a warm, brand-aligned set (orange/amber-biased, moderate saturation) rather than a saturated rainbow, so chips read as one family with the orange brand. Admins can still override per-category colors in the admin UI.

## Admin Pages

Dashboard, Posts (CRUD), Users, Profile, **Jobs** (`/admin/jobs` — full CRUD), **Inbox** (`/admin/inbox` — unified view of job applications, reader reviews w/ approve/reject, ad inquiries, and contact messages).

## Admin Panel

- URL: `/admin` (redirects to `/admin/login` if not logged in)
- Founding admin: username `matthew` (password set via `ADMIN_PASSWORD` env secret — not stored in repo)
- Multi-user: editors with per-user permissions
- Permission flags on each user: `canPublishDirectly`, `canManageJobs`, `canViewInbox`, `canManageEditors`, `canSendEmail`, `canManageCategories`. (The legacy `canManageShop` flag still exists in the DB column for historical rows but the UI toggle and the `/admin/products` enforcement were removed.) The `admin` role bypasses all checks. Only the admin can set role or permission flags. Editor email is locked: `users.email` is always derived from `username + "@mapletechie.com"` on create, and `PUT /admin/me` and `PUT /admin/users/:id` strip `email` and `username` from the editable list — changing them requires deleting and recreating the account.
- AI generation (`/admin/generate-post`) is gated to `requireRole("admin")` — editors cannot trigger it. The `/admin/generate` page is wrapped in `<AdminGuard adminOnly>` so non-admin editors get redirected.
- Server enforcement: `requirePermission(...perms)` middleware in `artifacts/api-server/src/middlewares/adminAuth.ts` gates `/admin/products` (shop), `/admin/jobs` + `/admin/applications` (jobs), `/admin/contacts` + `/admin/reviews` + `/admin/ad-inquiries` + `/admin/inbox-counts` (inbox), `/admin/users` (editors), and the `POST/PUT/DELETE /admin/categories` writes (`categories` permission key → `canManageCategories`). Public `GET /categories` is open.

### Categories seed
- `seedCuratedCategories()` runs at boot (after `bootstrapAdmin`) from `artifacts/api-server/src/lib/seedCategories.ts`. It upserts the 8 curated categories (News, Reviews, AI, Gadgets, Software & Apps, Gaming, Business & Policy, Canada Tech) by slug, deletes any non-curated category that has zero posts, and logs a warning (with post count) for non-curated categories that still have posts so the admin can reassign them. Curated `postCount`s are recomputed after the upsert.
- Admin nav buttons in dashboard render conditionally based on the same flags.

## Newsletter

- Reader newsletter is **manual** — the auto-`startNewsletterScheduler` was removed in May 2026. An admin composes each digest on `/admin/newsletter`: `subject` (required) + optional `editorNote` markdown, with a live preview of the past-7-days posts that will be appended via `digestEmailHtml`. `POST /api/admin/newsletter/test` accepts `{to, subject, editorNote}` (single test send); `POST /api/admin/newsletter/send-now` accepts `{subject, editorNote}` and broadcasts to every `status='active'` subscriber.
- A separate weekly **editor digest** cron (`startEditorWeeklyDigestCron`, Sunday 8 PM America/Toronto) emails the founding admin a week-in-review of new posts, comments, and inbox activity — purely internal, never sent to subscribers.
- Provider: Resend (used directly via `RESEND_API_KEY` secret — user dismissed the Replit Resend integration).
- Sender: `Mapletechie <newsletter@mapletechie.com>` (requires DNS records in Namecheap: SPF TXT, DKIM TXT records from Resend, optional DMARC).
- Footer subscribe form uses `useSubscribeNewsletter` hook.
- Admin page `/admin/newsletter` (admin-only): stats, send test, send now, subscriber list with delete.
- Shared email helper: `artifacts/api-server/src/lib/email.ts` exports `sendEmail`, `NEWSLETTER_FROM`, `CAREERS_FROM` (default `Mapletechie Careers <careers@mapletechie.com>`), `CAREERS_REPLY_TO` (default `matthew@mapletechie.com`), `SITE_URL`. All sender/reply-to addresses are env-overridable.
- Careers reply: admin endpoint `POST /api/admin/applications/:id/reply` (jobs permission). Sends a branded HTML email via Resend, sets `applications.status = "replied"`, writes an audit log, returns 503 if `RESEND_API_KEY` is missing. UI lives inline on the Inbox → Applications tab in `AdminInbox.tsx` with template chips (forward / pass / clarify / blank).
- Careers replies are intentionally always sent **from and replied-to** the shared `careers@` mailbox so all editors see/handle one shared candidate thread. The replying editor's name appears only in the sign-off. The HTML/text wrapper auto-prepends `Hi {firstName},` and appends the `Best, {Display}` sign-off — chip templates must NOT include either, or the candidate sees a duplicate greeting.

### General-purpose Send Email (admin compose)

- Permission flag: `users.canSendEmail` (boolean, default false). Founding admin always has it; other editors must be granted it via Admin → Manage Editors → "Send Email" toggle (admin-only toggle).
- Permission key: `"email"` in `requirePermission(...)`; mapped to `req.user.canSendEmail` in `adminAuth.ts`.
- Endpoint: `POST /api/admin/send-email` in `artifacts/api-server/src/routes/sendEmail.ts`. Validates `to` (1–25 emails, comma/semicolon/newline-separated), optional `cc`/`bcc`, `subject` (≤200), `message` (≤20,000). Returns 400 if the editor's `users.email` is not an `@mapletechie.com` address (Resend only sends from our verified domain). Sends via `sendEmail` as `"Display Name <user.email>"` with `replyTo = user.email`. Audit-logs as `email.sent` with recipients + 200-char message preview. CC/BCC are passed through Resend `headers`.
- UI: `artifacts/tech-blog/src/pages/admin/AdminSendEmail.tsx` at `/admin/send-email`. Compose form with To/CC/BCC/Subject/Message, char counters, 4 starter templates (intro, press request, partnership, blank), plain-text body (line breaks preserved). Banners warn if the editor lacks an `@mapletechie.com` profile email. Nav icon (Send) appears in `AdminDashboard.tsx` for `isAdmin || canSendEmail`.
- Editor onboarding: route the new `name@mapletechie.com` address in Cloudflare Email Routing (forward to their personal inbox + verify), then set that address on their profile in Manage Editors.

## Editor safety net (May 2026)

- **Local-draft autosave** in `AdminPostForm.tsx`: every form change is debounced (800 ms) and written to `localStorage` under `mapletechie-draft:new` (new posts) or `mapletechie-draft:<id>` (edits). On open, if a saved draft is found, the editor is prompted to restore or discard. Successful create/update clears the draft. A small "Draft autosaved locally at HH:MM" indicator appears under the form header.
- **Unsaved-changes warning**: a `beforeunload` listener fires when the form is dirty (differs from the server baseline for edits, or has any non-empty title/slug/content for new posts), so closing the tab or navigating away surfaces the browser's native warning.
- **Validation errors scroll to the bad field**: each required-field wrapper has an `id` (`field-title`, `field-slug`, `field-category`, `field-cover`, `field-content`, `field-og`) plus a `scroll-mt-24` offset so the sticky header doesn't cover it. `submit()`'s `fail(msg, fieldId)` helper scrolls to the specific field, focuses the first input inside it, and auto-opens the SEO collapsible panel when the bad field is the OG image. Mutation `onError` handlers fall back to scrolling the red error banner. (The prior silent-fail / banner-only behavior is what caused the May 2026 lost-post incident.)
- **Audit-log body snapshots** in `posts.ts`: `post.create` writes `{ snapshot: inserted }`, `post.update` writes `{ before, after }` (full raw rows), `post.delete` writes `{ snapshot: existing }`. JSONB column stores them; recovery is now a single SELECT against `audit_logs.details`.
- **Restoring a lost post**: admins call `POST /api/admin/posts/:id/restore` (admin role required). It finds the newest audit entry for that post id (`details.snapshot` or `details.after`), re-inserts the row with its original id, and brings it back **as a draft** for review before republishing. It refuses if the post still exists, the slug is taken by another post, or the snapshot's category was deleted (recreate the category first). Manual fallback: `SELECT details FROM audit_logs WHERE entity_type='post' AND entity_id='<id>' ORDER BY id DESC` and rebuild from the JSON.
- **Unknown category slugs return 404**: `category-index.tsx` now renders the `NotFound` component once the categories list has loaded and the slug isn't in it. Stops Google from re-crawling thin shells like `/category/uncategorized/`.

## Site Maintenance Mode

- Singleton `site_settings` table (`lib/db/src/schema/siteSettings.ts`): one row (`id=1`) holding `maintenanceMode` (bool), `maintenanceMessage`, `maintenanceEta`, `updatedAt`, `updatedBy`. Seeded at boot via `seedSiteSettings()` (after `seedCuratedCategories`).
- Server logic in `artifacts/api-server/src/lib/siteSettings.ts`: `getMaintenanceState()` combines the DB row with the `MAINTENANCE_MODE` env break-glass override (env always wins, short-circuits before any DB read, and tolerates DB outage). The DB row is cached in-process 5s; any PUT busts the cache.
- Middleware `publicMaintenanceGate` (`src/middlewares/maintenance.ts`) mounted before the API router in `app.ts`. When maintenance is active it returns `503` + `Retry-After: 3600` for public API paths, but exempts `/healthz`, `/admin/*` (incl. login + settings), and `/settings/*`. On a DB read error in the non-env path it fails open (serves the site).
- Routes (`src/routes/settings.ts`): `GET /api/settings/status` — public, always-available, never gated (frontend polls it). `GET/PUT /api/admin/settings` — `adminAuth + requireRole("admin")`, PUT audit-logged as `settings.update`.
- Frontend: `MaintenanceGate` (`artifacts/tech-blog/src/components/MaintenanceGate.tsx`) wraps the public route tree in `App.tsx`, polls `getMaintenanceStatus` every 30s, and shows `MaintenanceScreen.tsx` (on-brand dark/orange, Fraunces+Inter, wrench animation, message + ETA). Signed-in admins/editors bypass the gate. Admin UI at `/admin/settings` (`AdminSettings.tsx`, admin-only) — toggle + message/ETA fields, env-forced banner when the override is active. Nav icon (Settings) in `AdminDashboard.tsx` for admins.

## SEO Setup

- `SEO` component: `artifacts/tech-blog/src/components/SEO.tsx`
- Applied to: Home, Blog Index, Blog Post, Shop, Contact pages
- Dynamic sitemap: `GET /api/sitemap.xml`
- robots.txt: `artifacts/tech-blog/public/robots.txt` (points sitemap to mapletechie.com)
- Site domain constant in SEO.tsx: update `SITE_URL` when deploying
- Homepage LCP: a server handler in `artifacts/tech-blog/server.ts` (registered **before** the sirv middleware, which otherwise serves `/` as static index.html and shadows it) injects a `<link rel="preload" as="image" fetchpriority="high">` with responsive `imagesrcset`/`imagesizes` for the current featured post's cover, so the hero image downloads before React boots. Built via `buildHeroPreloadLink` reusing `responsiveCoverProps(..., COVER_SIZES.hero)` to match the hero `<img>` exactly. Crawlers/empty-featured fall through unchanged.

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

## AdSense ad slots

Fixed, designed ad units (`artifacts/tech-blog/src/components/AdSlot.tsx`) — Auto Ads are NOT used. Slots collapse to nothing when unfilled, unconfigured, or in dev builds; the AdSense script only loads in production when configured. Placements: homepage sidebar + between-sections banner (`home.tsx`), below-article + auto-injected in-article (max 2, only between top-level paragraphs) on post pages (`blog-post.tsx`).

Frontend env vars (set for the deployment; slot ids come from the AdSense dashboard, Ads → By ad unit):
- `VITE_ADSENSE_CLIENT` — publisher id (defaults to `ca-pub-9581001238069953`)
- `VITE_ADSENSE_SLOT_SIDEBAR`, `VITE_ADSENSE_SLOT_BANNER`, `VITE_ADSENSE_SLOT_BELOW_ARTICLE`, `VITE_ADSENSE_SLOT_IN_ARTICLE` — per-placement slot ids; a placement renders nothing until its slot id is set
