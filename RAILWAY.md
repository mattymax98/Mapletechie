# Deploying Mapletechie to Railway

Step-by-step guide. Everything marked 🧑 needs you to click something;
everything marked 🤖 is handled automatically or by the agent.

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

# These tell the app which bucket/prefix to use.
# Keep the same format as your current development values,
# but replace the GCS bucket name with "mapletechie".
PRIVATE_OBJECT_DIR         = /mapletechie/.private
PUBLIC_OBJECT_SEARCH_PATHS = /mapletechie/public
```

> **Note:** If your existing PRIVATE_OBJECT_DIR or PUBLIC_OBJECT_SEARCH_PATHS
> use different prefix names, keep those prefixes and only change the bucket
> name part (the first component after the leading /).

---

## Phase 2 — Migrate your images to R2

🧑 Add the three R2 secrets to your development secret store:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`

🤖 The agent will run the migration script from the workspace shell:

```bash
node scripts/migrate-storage-to-r2.mjs
```

The script copies every cover image and uploaded file from the legacy GCS storage
into R2. It skips files already copied, so it's safe to run multiple times.

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

# AI integrations — development proxy values (localhost:1106) don't work in
# Railway.  Supply real API keys from platform.openai.com / console.anthropic.com
# OR leave these unset to disable AI-draft generation on Railway.
AI_INTEGRATIONS_OPENAI_API_KEY      = sk-...
AI_INTEGRATIONS_OPENAI_BASE_URL     = https://api.openai.com/v1
AI_INTEGRATIONS_ANTHROPIC_API_KEY   = sk-ant-...
AI_INTEGRATIONS_ANTHROPIC_BASE_URL  = https://api.anthropic.com

# R2 storage (from Phase 1):
R2_ACCOUNT_ID               = <your Cloudflare Account ID>
R2_ACCESS_KEY_ID            = <from step 1.3>
R2_SECRET_ACCESS_KEY        = <from step 1.3>
PRIVATE_OBJECT_DIR          = /mapletechie/.private
PUBLIC_OBJECT_SEARCH_PATHS  = /mapletechie/public

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
canonical `www` record first; do not delete the old Google-hosted `www`
record until the host-by-host checks below pass.

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
`www` URL, with the complete path and query preserved.

Keep the old Google hosting account and DNS rollback record during the defined
observation period; do not delete it as part of the initial deployment.

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

### Secret and source-control boundary

- Production credentials (`DATABASE_URL`, session/auth secrets, R2,
  Resend, and optional AI credentials) live only in Railway Variables.
- Development credentials and Replit sidecar storage remain in the
  development environment; they are not copied into the production build.
- AI generation remains admin-only, on-demand, and disabled when its Railway
  credentials are absent. Normal reads, publishing, analytics, storage, and
  email do not call Anthropic or OpenAI.
- GitHub remains the source repository and Railway remains the deployment
  path. Git remotes must use GitHub/Replit authorization or a credential-free
  URL; never commit or embed a personal access token in a remote URL.

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

**If you ever run pg_restore again:** always run
`pnpm --filter @workspace/db run push` (with `DATABASE_URL` pointing at Railway)
immediately after to restore these constraints. Or apply the repair SQL in
`scripts/repair-railway-schema.sql`.

### Engagement signals migration (2026-08-17)

Three new columns on `page_views` and two new tables (`search_queries`, `link_clicks`) added by the engagement tracking feature. Apply to any fresh Railway DB with:

```sql
psql "$RAILWAY_DATABASE_URL" -f scripts/migrations/0002_engagement_signals.sql
```

### Maintenance scheduling migration (2026-08-17)

Three columns were added to `site_settings` for scheduled maintenance windows and
banner-vs-lockout severity. Apply to any fresh Railway DB with:

```sql
psql "$RAILWAY_DATABASE_URL" -f scripts/migrations/0001_maintenance_schedule_and_severity.sql
```

The file is idempotent (`ADD COLUMN IF NOT EXISTS`) and safe to re-run.
