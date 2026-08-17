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
# Keep the same format as your current Replit values,
# but replace the GCS bucket name with "mapletechie".
PRIVATE_OBJECT_DIR         = /mapletechie/.private
PUBLIC_OBJECT_SEARCH_PATHS = /mapletechie/public
```

> **Note:** If your existing PRIVATE_OBJECT_DIR or PUBLIC_OBJECT_SEARCH_PATHS
> use different prefix names, keep those prefixes and only change the bucket
> name part (the first component after the leading /).

---

## Phase 2 — Migrate your images to R2

🧑 Add the three R2 secrets to your Replit project (Settings → Secrets):
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`

🤖 The agent will run the migration script from the Replit shell:

```bash
node scripts/migrate-storage-to-r2.mjs
```

The script copies every cover image and uploaded file from Replit's storage
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
SITE_DOMAIN                 = mapletechie.com

# Copy these from your Replit Secrets:
SESSION_SECRET              = <from Replit>
ADMIN_PASSWORD              = <from Replit>
AUTOMATION_DRAFT_TOKEN      = <from Replit>
INDEXNOW_KEY                = <from Replit>
MCP_CONNECTOR_TOKEN         = <from Replit>
AI_INTEGRATIONS_OPENAI_API_KEY      = <from Replit>
AI_INTEGRATIONS_OPENAI_BASE_URL     = <from Replit>
AI_INTEGRATIONS_ANTHROPIC_API_KEY   = <from Replit>
AI_INTEGRATIONS_ANTHROPIC_BASE_URL  = <from Replit>

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
SITE_URL   = https://mapletechie.com
API_BASE   = https://<api-server-railway-domain>   ← the domain from step 3.4
```

---

## Phase 5 — Migrate the database

🤖 The agent will run these commands to export your Replit Postgres data and
import it into Railway's Postgres.

From the Replit shell:
```bash
# Export from Replit
pg_dump $DATABASE_URL --no-owner --no-acl -Fc -f /tmp/mapletechie.dump

# Import into Railway (replace with your Railway DATABASE_URL)
pg_restore --no-owner --no-acl -d "$RAILWAY_DATABASE_URL" /tmp/mapletechie.dump
```

The agent will get the Railway DATABASE_URL from your Railway Variables tab
and run this for you.

---

## Phase 6 — Point your domain to Railway

🧑 In Railway, go to the Tech Blog service → **Settings** → **Networking**.
🧑 Click **+ Custom Domain**, enter `mapletechie.com`.
🧑 Railway shows you a CNAME or ALIAS record to add.

🧑 Log in to wherever you registered `mapletechie.com` (GoDaddy, Namecheap, etc.).
🧑 Find **DNS settings** for the domain.
🧑 Add or update the record Railway showed you.
🧑 Do the same for `www.mapletechie.com` if needed.

DNS changes typically take 5–30 minutes to propagate.

---

## Phase 7 — Verify & go live

🧑 Visit https://mapletechie.com — confirm the site loads.
🧑 Log in to the admin panel and check a few posts.
🧑 Turn off maintenance mode.
🤖 The agent will verify the API health endpoint and confirm images load.

---

## Environment variable cheat-sheet

| Variable | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Railway (auto) | Added automatically by the Postgres addon |
| `PORT` | Railway (auto) | Injected automatically per service |
| `NODE_ENV` | Set manually | `production` |
| `SESSION_SECRET` | Replit Secrets | Copy as-is |
| `ADMIN_PASSWORD` | Replit Secrets | Copy as-is |
| `AUTOMATION_DRAFT_TOKEN` | Replit Secrets | Copy as-is; automation URLs don't change |
| `INDEXNOW_KEY` | Replit Secrets | Copy as-is |
| `MCP_CONNECTOR_TOKEN` | Replit Secrets | Copy as-is |
| `AI_INTEGRATIONS_*` | Replit Secrets | Copy all four as-is |
| `R2_ACCOUNT_ID` | Cloudflare | From Phase 1 |
| `R2_ACCESS_KEY_ID` | Cloudflare | From Phase 1 |
| `R2_SECRET_ACCESS_KEY` | Cloudflare | From Phase 1 |
| `PRIVATE_OBJECT_DIR` | Set manually | `/mapletechie/private` |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Set manually | `/mapletechie/covers,/mapletechie/public` |
| `SITE_URL` | Set manually | `https://mapletechie.com` (frontend only) |
| `API_BASE` | Set manually | Railway URL of the API service (frontend only) |
| `SITE_DOMAIN` | Set manually | `mapletechie.com` (API only) |
| `BASE_PATH` | Set manually | `/` (frontend only) |
