# Deploying Mapletechie to Railway

Step-by-step guide. Everything marked 🧑 needs you to click something;
everything marked 🤖 is handled automatically or by the agent.

---

## Direct-to-main deployment and production safety

Railway production remains connected to GitHub `main`. The normal deployment
flow is:

```text
latest main → implement → validate → canonical commit → fast-forward push
→ Railway production deployment → production verification
```

Before every push, run the repository typecheck, tests, and production build.
Confirm the commit uses the canonical `mattymax98` identity, fetch `main` again,
and push only when the update remains a normal fast-forward. Never force-push or
delete `main` during routine delivery.

Railway pull-request environments are not required. The project has no isolated
preview database or preview-scoped R2 credentials, so do not enable a preview
environment that inherits access to the production PostgreSQL database,
production `mapletechie` R2 bucket, or any other production mutable resource.
Use the existing development environment and `mapletechie-development`
bucket-scoped credentials for pre-production checks.

---

## Phase 1 — Set up Cloudflare R2 (image storage)

Railway doesn't include file storage, so we use Cloudflare R2 — it's free
up to 10 GB and has no fees for serving files.

### 1.1 — Create a Cloudflare account (if you don't have one)

🧑 Go to https://dash.cloudflare.com/sign-up and create a free account.

### 1.2 — Create an R2 bucket

🧑 In the Cloudflare dashboard, click **R2 Object Storage** in the left sidebar.
🧑 Click **Create bucket**.
🧑 Name it `mapletechie` (all lowercase, no spaces).
🧑 Leave the region on **Automatic**. Click **Create bucket**.

### 1.3 — Create an R2 API token

🧑 Still on the R2 page, click **Manage R2 API Tokens** (top right).
🧑 Click **Create API token**.
🧑 Give it any name (e.g. `mapletechie-railway`).
🧑 Under **Permissions**, select **Object Read & Write**.
🧑 Under **Specify bucket**, choose `mapletechie`.
🧑 Click **Create API Token**.

**Save these three values somewhere safe — you'll need them shortly:**

| Value | Where to find it |
|---|---|
| Account ID | Top-right of any R2 page (labelled "Account ID") |
| Access Key ID | Shown once after creating the token |
| Secret Access Key | Shown once after creating the token |

### 1.4 — Note your R2 environment variable values

Based on your bucket name `mapletechie`, set these:

```
R2_ACCOUNT_ID       = <your Cloudflare Account ID>
R2_ACCESS_KEY_ID    = <Access Key ID from step 1.3>
R2_SECRET_ACCESS_KEY = <Secret Access Key from step 1.3>

# These tell the app which bucket/prefixes to use.
PRIVATE_OBJECT_DIR         = /mapletechie/private
PUBLIC_OBJECT_SEARCH_PATHS = /mapletechie/covers,/mapletechie/public
```

These paths are production-only. Development uses the separate
`mapletechie-development` bucket described below.

---

## Phase 2 — Set up isolated development storage

The `mapletechie-development` bucket keeps local tests completely separate from
live article media. In the Cloudflare R2 dashboard, create an **Object Read &
Write** API token scoped only to `mapletechie-development`.

Add that development token to your local `.env` file:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Set the development-only paths:

```text
PRIVATE_OBJECT_DIR=/mapletechie-development/private
PUBLIC_OBJECT_SEARCH_PATHS=/mapletechie-development/covers,/mapletechie-development/public
```

Start the API and verify an authenticated media upload. Development and
production both use R2, but separate buckets and bucket-scoped tokens prevent
local actions from changing production files.

---

## Phase 3 — Set up Railway

### 3.1 — Create a Railway account

🧑 Go to https://railway.app and sign up with your GitHub account.
   (Railway needs GitHub access to deploy your code automatically.)

### 3.2 — Create a new project

🧑 Click **New Project** → **Deploy from GitHub repo**.
🧑 Authorise Railway to access your repositories if prompted.
🧑 Select the `mapletechie` repository.

### 3.3 — Add a PostgreSQL database

🧑 Inside the project, click **+ New** → **Database** → **PostgreSQL**.
   Railway creates a Postgres database and wires `DATABASE_URL` automatically.

### 3.4 — Create the API Server service

🧑 Click **+ New** → **GitHub Repo** → select `mapletechie` again.
🧑 Click the new service → **Settings** tab.
🧑 Set these under **Build & Deploy**:

| Field | Value |
|---|---|
| Root Directory | `/` (the default) |
| Build Command | `pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build` |
| Start Command | `node --enable-source-maps artifacts/api-server/dist/index.mjs` |
| Health Check Path | `/api/healthz` |

🧑 Under **Networking** → click **Generate Domain** to get a temporary URL.
   Note this URL — you'll need it in Phase 4.

### 3.5 — Create the Tech Blog (frontend) service

🧑 Click **+ New** → **GitHub Repo** → select `mapletechie` again.
🧑 Click the new service → **Settings** tab.
🧑 Set these:

| Field | Value |
|---|---|
| Root Directory | `/` |
| Build Command | `pnpm install --frozen-lockfile && pnpm --filter @workspace/tech-blog run build` |
| Start Command | `node --enable-source-maps artifacts/tech-blog/dist/server.mjs` |

---

## Phase 4 — Set environment variables

### API Server — Variables tab

Go to the API Server service → **Variables** tab. Add each of the following:

```
NODE_ENV                    = production
# ⚠️  Must include the https:// prefix — the feed and sitemap generators use
#     this value verbatim when building absolute URLs.
SITE_DOMAIN                 = https://www.mapletechie.com

# Copy these from your development secret store:
SESSION_SECRET              = <from development secret store>
ADMIN_PASSWORD              = <from development secret store>
AUTOMATION_DRAFT_TOKEN      = <from development secret store>
INDEXNOW_KEY                = <from development secret store>
MCP_CONNECTOR_TOKEN         = <from development secret store>

# Resend email — IMPORTANT: use the API key from the Resend workspace that has
# mapletechie.com listed under Domains (resend.com → workspace switcher top-left
# → Domains). The miinikaanens.com workspace will NOT work for mapletechie.com
# sender addresses and Resend will return a 403 domain-not-verified error.
RESEND_API_KEY              = re_...

# External editorial automation is draft-only. These tokens authenticate the
# existing MCP/automation workflow; they never grant publishing authority.

# R2 storage (from Phase 1):
R2_ACCOUNT_ID               = <your Cloudflare Account ID>
R2_ACCESS_KEY_ID            = <from step 1.3>
R2_SECRET_ACCESS_KEY        = <from step 1.3>
PRIVATE_OBJECT_DIR          = /mapletechie/private
PUBLIC_OBJECT_SEARCH_PATHS  = /mapletechie/covers,/mapletechie/public

# DATABASE_URL is added automatically by Railway's PostgreSQL addon.
```

### Tech Blog — Variables tab

Go to the Tech Blog service → **Variables** tab. Add:

```
NODE_ENV   = production
BASE_PATH  = /
SITE_URL   = https://www.mapletechie.com
API_BASE   = https://<api-server-railway-domain>   ← the domain from step 3.4
# Optional GA4 web measurement ID; no private API key is required.
VITE_GA4_MEASUREMENT_ID = G-XXXXXXXXXX
```

---

## Phase 5 — Migrate the database
The export/restore commands below document the original one-time move from
Replit to Railway, **not** the routine migration procedure. For current
production migrations, use the guarded `migrate:railway` command in
`DEVELOPMENT.md`. The guard checks the live Railway cluster identity before
running SQL and stops if the database has been replaced.

🤖 The agent will run these commands to export your legacy Postgres data and
import it into Railway's Postgres.

From the workspace shell:
```bash
# Export from the legacy source database
pg_dump $DATABASE_URL --no-owner --no-acl -Fc -f /tmp/mapletechie.dump

# Import into Railway (replace with your Railway DATABASE_URL)
pg_restore --no-owner --no-acl -d "$RAILWAY_DATABASE_URL" /tmp/mapletechie.dump
```

The agent will get the Railway DATABASE_URL from your Railway Variables tab
and run this for you.

---

## Phase 6 — Point your domain to Railway

🧑 In Railway, go to the Tech Blog service → **Settings** → **Networking**.
🧑 Click **+ Custom Domain**, enter `www.mapletechie.com`.
🧑 Railway shows you a CNAME or ALIAS record to add.

🧑 Log in to wherever you registered `mapletechie.com` (GoDaddy, Namecheap, etc.).
🧑 Find **DNS settings** for the domain.
🧑 Add or update the record Railway showed you.
🧑 Keep the existing apex record in place during verification. Add the
canonical `www` record first. During the initial cutover, do not delete the
old Google-hosted `www` record until the host-by-host checks below pass.

DNS changes typically take 5–30 minutes to propagate.

---

## Phase 7 — Configure and verify the canonical host

The first cutover is deliberately reversible. The existing Railway origin,
database, R2 bucket, Resend configuration, and apex behavior must remain
available until the observation period is complete.

Before changing the apex record, check all four variants:

```bash
for url in \
  https://www.mapletechie.com/ \
  https://mapletechie.com/ \
  http://www.mapletechie.com/ \
  http://mapletechie.com/; do
  curl -sSIL --max-redirs 0 "$url"
done
```

Expected results:

- `https://www.mapletechie.com` serves the current Railway build.
- `https://mapletechie.com`, `http://mapletechie.com`, and
  `http://www.mapletechie.com` return one permanent redirect to the matching
  `https://www.mapletechie.com` path, preserving the query string.
- `www` returns the current API-backed content, `/api/healthz`, media, feeds,
  robots, and sitemap rather than the old Google Frontend response.

### Cloudflare redirect rule

Cloudflare is the single owner of public hostname and HTTP-to-HTTPS redirects.
Create one **Redirect Rule** in the `mapletechie.com` zone:

1. Open **Rules → Redirect Rules → Create rule** and name it
   `Mapletechie canonical host`.
2. Use this incoming-request expression:

   ```
   (http.host eq "mapletechie.com") or
   (http.host eq "www.mapletechie.com" and http.request.scheme eq "http")
   ```

3. Set the target to the dynamic URL expression:

   ```
   concat("https://www.mapletechie.com", http.request.uri.path)
   ```

4. Choose a **301 permanent redirect**, enable **Preserve query string**, and
   deploy the rule. The dynamic target preserves the full path; the query-string
   option preserves tracking parameters and other request queries.
5. Keep both the apex and `www` DNS records proxied through Cloudflare. Do not
   add a second hostname redirect in the Railway application.

This single rule covers HTTPS apex, HTTP apex, and HTTP `www`; HTTPS `www`
passes through directly. If the dashboard presents separate path/query
controls instead of the expression editor, select **Preserve path** and
**Preserve query string** with the same `https://www.mapletechie.com` target.

Run the repeatable deploy check after DNS and the rule are active:

```bash
pnpm --filter @workspace/scripts run verify-canonical-host
```

The check uses a published article plus a query string and verifies that each
alternate variant performs exactly one permanent redirect to the canonical
`www` URL, with the complete path and query preserved. It also requires the
final `200` response to include Railway's request header, so a retired origin
or an unrelated edge response cannot pass as the production site.

### Scheduled public-host canary

The repository's `.github/workflows/canonical-host-canary.yml` runs this same
check once per day at 06:17 UTC and can also be started with **Actions →
Canonical host canary → Run workflow**. It requires no production credentials:
the check only makes read-only requests to the public site.

The workflow fails with the specific public variant that regressed, including
the expected and observed redirect destination when applicable. Configure the
    workflow's `Verify public host redirects` check reports regressions
    independently of normal direct-to-main delivery. A scheduled failure does
    not change Cloudflare or Railway routing; fix the reported DNS, redirect
    rule, or deployment issue and rerun the workflow.

## Phase 8 — Verify & go live

🧑 Visit https://www.mapletechie.com — confirm the site loads.
🧑 Log in to the admin panel and check a few posts.
🧑 Turn off maintenance mode.
🤖 The agent will verify the API health endpoint and confirm images load.

Run the regression gate before retiring the old origin:

- public homepage, article, category, author, contact, careers, and unknown
  paths;
- retired paths still return their existing `410` responses and useful path
  redirects remain intact;
- admin login/session persistence, post save/publish/schedule, media
  upload/read/delete permissions, contact/newsletter/career email paths;
- `/api/healthz`, feeds, `robots.txt`, sitemap, canonical/OG/JSON-LD tags, and
  favicons;
- first-party analytics for ordinary visitors and GA4 pageviews only when
  `VITE_GA4_MEASUREMENT_ID` is configured. Admin/private paths must not be
  sent to GA4.

### Legacy origin retirement record — 2026-09-01

The former origin was retired after the canonical `www` site and Cloudflare
redirects completed the observation period. Its `mapletechie.com` and
`www.mapletechie.com` custom-domain attachments were removed before shutdown.
Public traffic now has one authority:

- `https://www.mapletechie.com` serves the Railway Tech Blog service.
- HTTPS apex, HTTP apex, and HTTP `www` are handled by the existing proxied
  Cloudflare canonical-host rule and redirect once to the HTTPS `www` URL.
- The retired origin is no longer a public DNS destination.
- The Cloudflare apex/`www` records needed for redirects, plus email records,
  remain in place. Production database and R2 data were not removed.

Verification at 2026-09-01 02:01 UTC recorded:

- The retired deployment had no primary or additional deployment URLs.
- The retired origin returned `404` on three consecutive requests and no
  longer served Mapletechie HTML.
- Both public hostnames resolved to Cloudflare, canonical `www` returned a
  Railway response, and `pnpm --filter @workspace/scripts run
  verify-canonical-host` passed all four host/scheme variants.

**Final recovery path:** if the Railway site must be recovered, keep the
Cloudflare records and canonical-host rule in place, restore the Railway Tech
Blog custom-domain attachment for `www.mapletechie.com`, and deploy the last
known-good Railway build from GitHub. Restore the API service alongside it if
needed; Railway Postgres and Cloudflare R2 remain the data sources. Validate
with the canonical-host check and the Phase 8 regression gate. Do not restore
the retired origin or point public DNS back to it.

### Secret and source-control boundary

- Production credentials (`DATABASE_URL`, session/auth secrets, R2, and
  Resend) live only in Railway Variables.
- Development credentials stay in the local environment and are scoped only
  to the separate `mapletechie-development` R2 bucket. Production uses the
  `mapletechie` bucket. Credentials are never copied into the production build.
- External AI clients use only the authenticated MCP/automation boundary.
  They may inspect content, upload media, preview posts, and create drafts, but
  cannot publish, schedule, feature, or set server-controlled authorship.
- GitHub remains the source repository and Railway remains the deployment
  path. Git remotes must use GitHub authorization or a credential-free URL;
  never commit or embed a personal access token in a remote URL.

---

## Environment variable cheat-sheet

| Variable | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Railway (auto) | Added automatically by the Postgres addon |
| `PORT` | Railway (auto) | Injected automatically per service |
| `NODE_ENV` | Set manually | `production` |
| `SESSION_SECRET` | Development secret store | Copy as-is |
| `ADMIN_PASSWORD` | Development secret store | Copy as-is |
| `AUTOMATION_DRAFT_TOKEN` | Development secret store | Copy as-is; automation URLs don't change |
| `INDEXNOW_KEY` | Development secret store | Copy as-is |
| `MCP_CONNECTOR_TOKEN` | Development secret store | Copy all four as-is |
| `R2_ACCOUNT_ID` | Cloudflare | From Phase 1 |
| `R2_ACCESS_KEY_ID` | Cloudflare | From Phase 1 |
| `R2_SECRET_ACCESS_KEY` | Cloudflare | From Phase 1 |
| `PRIVATE_OBJECT_DIR` | Set manually | `/mapletechie/private` |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Set manually | `/mapletechie/covers,/mapletechie/public` |
| `SITE_URL` | Set manually | `https://www.mapletechie.com` (frontend only) |
| `API_BASE` | Set manually | Railway URL of the API service (frontend only) |
| `VITE_GA4_MEASUREMENT_ID` | Google Analytics | Optional public GA4 web measurement ID; loaded only in production, no private API key required |
| `RESEND_API_KEY` | Resend (mapletechie.com workspace) | Must be from the workspace with `mapletechie.com` in Domains — see Phase 4 note |
| `SITE_DOMAIN` | Set manually | `https://www.mapletechie.com` — **must include the https:// prefix** (API only) |
| `BASE_PATH` | Set manually | `/` (frontend only) |

## Schema repair after pg_restore (August 2026)

The pg_restore from the legacy production database stripped FK and PK constraints
from several tables (the source database had an older schema predating these constraints).
Fixed by running the SQL below directly against the Railway DB:

- Added PRIMARY KEY to: `categories`, `jobs`, `audit_logs`, `contacts`, `media`,
  `page_views`, `post_categories`
- Added UNIQUE constraints to: `categories.name`, `categories.slug`, `media.url`,
  `posts.slug`
- Added FK: `posts.category_id → categories.id` (the constraint `assertCategorySchemaInvariants()`
  requires at boot — without it the API server exits immediately)
- Added FKs: `post_categories → posts`, `post_categories → categories`,
  `job_applications → jobs`

**If you restore into a replacement Railway cluster:** it will have a
different identity, so the guarded migration command must stop. Independently
verify the new Railway database before updating its pinned identity. Then
restore these constraints with the reviewed repair SQL through
`pnpm --filter @workspace/scripts run migrate:railway --apply repair-railway-schema.sql --confirm-railway-production`.
Do not point an unguarded Drizzle `push` at production.

### Engagement signals migration (2026-08-17)

Three new columns on `page_views` and two new tables (`search_queries`, `link_clicks`) added by the engagement tracking feature. After verifying a fresh Railway cluster and updating the pinned identity, apply with:

```bash
pnpm --filter @workspace/scripts run migrate:railway --apply 0002_engagement_signals.sql --confirm-railway-production
```

### Maintenance scheduling migration (2026-08-17)

Three columns were added to `site_settings` for scheduled maintenance windows and
banner-vs-lockout severity. Apply to a verified Railway DB with:

```bash
pnpm --filter @workspace/scripts run migrate:railway --apply 0001_maintenance_schedule_and_severity.sql --confirm-railway-production
```

The file is idempotent (`ADD COLUMN IF NOT EXISTS`) and safe to re-run.
