# Mapletechie operations handover

This is the canonical operational handover for Mapletechie after retiring the
former hosted development workspace. It describes the current source,
production, editorial automation, deployment, migration, email, storage, and
incident-response model.

The repository, Railway production project, Resend account, Mapletechie MCP
connector, and ChatGPT scheduled editorial routines are the active control
plane. No production workload depends on the retired development workspace.

## 1. Ownership map

| System | Role | Source of truth / control |
| --- | --- | --- |
| GitHub | Source code and Git history | `mattymax98/Mapletechie`, default branch `main` |
| GitHub Actions | Branch validation and manual guarded migrations | `.github/workflows/` |
| Railway | Production hosting and PostgreSQL | Project `authentic-generosity`, environment `production` |
| Cloudflare R2 | Production article/media object storage | Credentials injected only into Railway API service |
| Resend | Transactional/newsletter email | Verified `mapletechie.com` sending domain |
| Mapletechie MCP | Draft/revision automation boundary | Authenticated `/api/mcp` on production API |
| ChatGPT automations | Daily editorial scheduling | Mapletechie Daily Desk and Story Radar |
| Cloudflare DNS/edge | Public DNS/canonical redirects | Owner-managed outside this repository |

The GitHub repository is currently public. Treat every tracked file, commit,
workflow, issue, and build log as public information. Secrets must never enter
Git.

## 2. Source control

Repository:

`mattymax98/Mapletechie`

Default / production branch:

`main`

Canonical Git identity for Mapletechie delivery:

`mattymax98 <197423417+mattymax98@users.noreply.github.com>`

Do not add co-author, agent, platform, task, model, or automation attribution
trailers to commits.

The September 2026 Git history cleanup intentionally collapsed the previously
reachable development history to a clean owner-attributed baseline and removed
the earlier credential-bearing workspace configuration from normal refs.
Do not reconnect or push from an old clone that still contains the discarded
history. Start from a fresh GitHub checkout.

### Normal connected-agent delivery

For changes made through ChatGPT/GitHub:

1. Read current `main` and create a temporary branch from its exact SHA.
2. Make the smallest scoped change.
3. Let the GitHub `CI` workflow run on that branch.
4. Require CI to pass: frozen install, typecheck, full tests, and builds.
5. For backend/schema work, separately review migration requirements before
   promotion.
6. Re-read `main` to ensure it did not move.
7. Fast-forward `main` to the already-tested commit. Never create a platform
   merge commit merely to promote the branch.
8. Confirm both Railway application services deploy that exact SHA.
9. Run/read the relevant production checks and inspect Railway logs for the
   changed path.

This preserves the simple direct-to-main production model while using a
temporary branch as the validation environment.

### Human/local delivery

A local engineer may still use the workflow in `DEVELOPMENT.md`, including the
versioned pre-push hook. Local clones must be fresh after any intentional
history rewrite.

## 3. GitHub Actions

### CI

`.github/workflows/ci.yml` runs for branch pushes and pull requests.

It uses:

- Node.js 24
- pnpm 10.26.1
- `pnpm install --frozen-lockfile`
- `pnpm run typecheck`
- `pnpm run test`
- workspace builds

Railway should never be used as the first compiler/test environment for a normal
change when GitHub CI can validate the branch first.

### Canonical-host canary

`.github/workflows/canonical-host-canary.yml` independently verifies public
host redirects on schedule. Keep it enabled.

### Production database migrations

`.github/workflows/railway-migration.yml` is manual only
(`workflow_dispatch`). It requires:

- a reviewed SQL filename;
- explicit `APPLY` confirmation;
- the repository Actions secret `RAILWAY_DATABASE_URL`.

The workflow calls the existing pinned database guard before writing.

**One owner setup step is required:** add the GitHub Actions repository secret
`RAILWAY_DATABASE_URL` using the Railway Postgres **public/external** database
URL. GitHub-hosted runners cannot use Railway's private-network hostname.

Do not put that URL in a tracked file, workflow literal, issue, chat paste, or
commit message.

A normal Git push is never permission to run a migration.

## 4. Railway production

Railway project:

`authentic-generosity`

Environment:

`production`

Region currently used by application/database workloads:

`ams`

### API service: Mapletechie

Source:

- GitHub repository: `mattymax98/Mapletechie`
- branch: `main`
- Dockerfile: `/Dockerfile.api`

Runtime:

`node --enable-source-maps artifacts/api-server/dist/index.mjs`

Railway service domain:

`mapletechie-production.up.railway.app`

The API holds application secrets and connects to PostgreSQL, R2 and Resend.

Important application variable names include:

- `DATABASE_URL`
- `SESSION_SECRET`
- `ADMIN_PASSWORD` (bootstrap only; not normal login authentication)
- `AUTOMATION_DRAFT_TOKEN`
- `MCP_CONNECTOR_TOKEN`
- `INDEXNOW_KEY`
- `RESEND_API_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `PRIVATE_OBJECT_DIR`
- `PUBLIC_OBJECT_SEARCH_PATHS`
- `SITE_DOMAIN`

The Railway OAuth connection used by ChatGPT exposes variable names but redacts
values. Never work around that by logging secret values.

Some legacy/optional AI integration variable names are still present in Railway.
The current application intentionally does not use a direct in-CMS AI publishing
workflow. Remove unused secrets later only after verifying no remaining runtime
path needs them.

### Web service: tech-blog

Source:

- GitHub repository: `mattymax98/Mapletechie`
- branch: `main`
- Dockerfile: `/Dockerfile.blog`

Runtime:

`node --enable-source-maps artifacts/tech-blog/dist/server.mjs`

Domains currently attached:

- `www.mapletechie.com`
- `mapletechie.com`
- Railway service domain `tech-blog-production-d24d.up.railway.app`

Important variable names include:

- `API_BASE`
- `NODE_ENV`
- `SITE_DOMAIN`
- `CANONICAL_REDIRECT_ENABLED`

### PostgreSQL service

Railway service:

`Postgres`

Persistent volume:

`/var/lib/postgresql/data`

The guarded migration code pins the live PostgreSQL cluster system identifier.
If Railway ever replaces/restores the database cluster, the migration guard must
fail until the new production database is independently verified and the pin is
deliberately updated.

Do not run raw production `psql`, unguarded Drizzle push, or an unverified
migration target.

### Deploy verification

After every production promotion:

1. Confirm API and web deployments both report `SUCCESS`.
2. Confirm their deployment metadata references the promoted Git SHA.
3. Inspect startup/build logs for errors.
4. Verify `/api/healthz`, public home/article behavior, and the feature changed.
5. Run the production smoke check when practical:

`pnpm --filter @workspace/scripts run smoke:production https://www.mapletechie.com`

## 5. Database and schema rules

Production migration SQL lives under:

`scripts/migrations/`

Canonical migration tools:

- `scripts/src/railwayMigrationGuard.ts`
- `scripts/src/railwaySchemaCompatibility.ts`

The migration runner:

- requires `RAILWAY_DATABASE_URL`;
- verifies database name and PostgreSQL cluster system identifier on the same
  connection;
- uses a guarded transaction;
- applies only reviewed filenames;
- has lock and statement timeouts;
- rejects unsafe transaction-control patterns.

For migration-backed features use expand-first delivery:

1. commit/review the additive migration;
2. explicitly authorize and apply it;
3. verify live schema;
4. deploy code that uses it;
5. remove obsolete schema only in a later, separately verified release.

### Revision compatibility note

Current production `post_revisions_status_check` retains the original
three-value row-status constraint. Supersession is therefore represented as a
durable `post.revision.superseded` audit decision, and actionable read paths
consult terminal audit history. Do not reintroduce writes of
`status = 'superseded'` without an explicit schema migration.

## 6. Object storage

Production article/media storage uses Cloudflare R2.

Production R2 credentials are injected into the Railway API service only.

Local/development work must use the separate
`mapletechie-development` bucket and bucket-scoped credentials.

Upload boundaries:

- `POST /storage/uploads/request-url` requires `adminAuth`.
- `POST /storage/uploads` requires `adminAuth` and raster validation.
- `GET /storage/public-objects/*` is public by design.
- `GET /storage/objects/*` is public by design because published article
  media uses those URLs.

External image persistence is SSRF-sensitive and must retain its private-network
and image-safety checks.

## 7. Email / Resend

Resend is the outbound email provider.

Verified sending domain:

`mapletechie.com`

Current domain state at handover:

- verified;
- sending enabled;
- receiving disabled;
- open tracking disabled;
- click tracking disabled.

A single current API key is present in the Resend account. Its value must remain
only in secret storage. The earlier exposed key was replaced.

Application mail uses Railway's `RESEND_API_KEY`; no email dependency remains
on the retired development workspace.

For deliverability incidents check:

- Resend email/log status;
- SPF;
- DKIM;
- DMARC;
- sender/domain alignment;
- bounce/complaint rates;
- message content and unsubscribe behavior for bulk mail.

## 8. Authentication and admin bootstrap

Normal admin login verifies bcrypt hashes stored in PostgreSQL.

`ADMIN_PASSWORD` is only used when the users table is empty. Once a user
exists, bootstrap skips password creation and does not use that environment
variable as a login credential.

For an established production installation, changing `ADMIN_PASSWORD` does not
change the existing admin password.

Sessions are bearer tokens stored in PostgreSQL and currently expire after
30 days.

## 9. Editorial automation / MCP

Production MCP endpoint:

`POST /api/mcp`

It is authenticated with `MCP_CONNECTOR_TOKEN` and fails closed when the
secret is missing/invalid.

The connector can:

- search the full archive;
- inspect categories, posts and topic clusters;
- read the canonical editorial contract;
- upload images;
- create review-only drafts;
- read back posts;
- generate signed previews;
- repair draft images;
- propose review-only corrections for published/scheduled posts.

It cannot directly publish, schedule, feature, change authorship, or bypass
human revision approval.

Published corrections preserve URL, original publication date and authorship.
Only meaningful approved title/excerpt/body revisions establish public
editorial freshness.

The public update-history summary is separate from the private internal diff.

## 10. Daily editorial automations

Two ChatGPT automations are currently active.

### Mapletechie Daily Desk

Schedule:

- daily;
- 7:00 AM;
- `America/Toronto`.

Authority:

- research;
- draft writing;
- images;
- QA;
- review-only submission.

It cannot publish.

A normal successful run has a **minimum floor of five** fresh qualifying
drafts. Quality gates may never be weakened to hit the floor. If fewer than
five qualify, submit only the passing work and report the run short of the
minimum with exact blockers.

The canonical contract lives in:

`artifacts/api-server/src/lib/editorialAutomationContract.ts`

and is exposed by:

`get_mapletechie_editorial_contract`.

Do not maintain a conflicting copy elsewhere.

### Mapletechie Story Radar

A separate discovery-only ChatGPT automation currently runs daily at 6:00 AM in
`America/Thunder_Bay`.

It researches/ranks story opportunities and does not draft or publish.

This is independent of the Daily Desk. Disable it separately if it is no longer
wanted.

## 11. Review and publication rules

Human editors retain publication control.

The automation/MCP path may create drafts and review-only correction proposals,
but publishing/scheduling remains an authenticated human action.

Published protected fields use the revision workflow. Review History is the
authoritative internal record.

Public Update history exposes only sanitized reader-facing summaries and
timestamps. It must never leak raw proposal/audit/reviewer data.

A Review queue badge represents genuinely actionable pending proposals, not
terminal approved/rejected/superseded decisions.

## 12. Security baseline

The canonical current threat model is `threat_model.md`.

Key invariants:

- no secrets in Git;
- admin routes enforce server-side authorization;
- upload writes require authentication;
- public media reads are intentional;
- automation/MCP is token-protected and draft/review-only;
- external image fetches retain SSRF defenses;
- production DB writes use guarded migrations;
- public API serializers must not leak revision/audit internals;
- direct in-CMS AI publication/generation remains absent.

The repository is public. Security scanners must distinguish:

- confirmed exploitable findings;
- defense-in-depth improvements;
- stale/historical findings;
- intended public behavior;
- unable-to-verify findings.

## 13. Known cleanup items that are not Replit blockers

These do not prevent retirement of the former workspace, but should be handled
deliberately:

1. Add GitHub Actions secret `RAILWAY_DATABASE_URL` for the guarded manual
   migration workflow.
2. Railway Postgres currently shows some application-level variable names that
   are unnecessary for the database service. Remove unnecessary variables
   through Railway's dashboard when convenient.
3. The API service still lists optional/legacy AI integration variable names;
   verify and remove unused values rather than carrying unnecessary secrets.
4. `ADMIN_PASSWORD` can be removed from established production after confirming
   the production user table is initialized and a supported admin password-reset
   path exists.
5. The GitHub repository is public. Make it private only if that is an
   intentional product/operations decision; visibility is not a substitute for
   secret hygiene.
6. Temporary branches left from recent work all point to the same cleaned
   history. They may be deleted later for tidiness.

## 14. Replit retirement checklist

Before deleting/cancelling the account:

- [ ] Confirm GitHub `main` contains the final handover commit.
- [ ] Confirm GitHub CI passes on that commit.
- [ ] Confirm API and web Railway deployments are `SUCCESS` on the same SHA.
- [ ] Confirm the Mapletechie MCP connector still lists/executes tools.
- [ ] Confirm the Daily Desk remains enabled at 7:00 AM America/Toronto.
- [ ] Add the GitHub `RAILWAY_DATABASE_URL` Actions secret if future migrations
      should be runnable without any local machine.
- [ ] Confirm there are no unique notes/files in the old workspace that were
      never committed to GitHub.
- [ ] Revoke the old workspace's GitHub authorization/integration.
- [ ] Remove/revoke any workspace-only secrets or API tokens that are no longer
      used anywhere else.
- [ ] Cancel paid workspace billing only after the above checks.
- [ ] Never push the old pre-history-rewrite clone back to GitHub.

Once those checks pass, production does not require the retired workspace.

## 15. Incident playbooks

### Production deploy fails

1. Read Railway build/deploy logs.
2. Confirm exact deployed Git SHA.
3. Determine whether failure is build, startup, schema, secret, network, or data.
4. Do not apply a migration merely because startup failed.
5. If necessary, fast-forward/revert to a known-good Git state through the same
   controlled GitHub workflow.

### API returns 500

1. Reproduce the exact route/action.
2. Inspect Railway HTTP + deploy logs for that request.
3. Inspect current code and live schema assumptions.
4. Prefer read-only production diagnosis.
5. Fix code first when the schema is intentionally legacy-compatible.
6. Do not hide a failed write behind a frontend success state.

### Review queue inconsistency

Inspect both the revision row and terminal audit history. Approved, rejected,
or superseded decisions are authoritative for actionability.

### Database migration required

Do not put migration execution inside normal app startup. Use the guarded manual
workflow after explicit approval, verify the database identity/schema, then
deploy code that depends on it.

### Email deliverability problem

Use Resend logs/metrics plus authentication headers before changing application
code. Verify SPF/DKIM/DMARC and sender alignment first.

### MCP connector appears stale

Production publishes live MCP metadata through authenticated `POST /api/mcp`.
If ChatGPT still advertises an old tool snapshot, refresh/reconnect the
connector. Do not create a second checked-in manifest.

## 16. Where to look first

- Application setup: `README.md`
- Local engineering: `DEVELOPMENT.md`
- Railway deployment: `RAILWAY.md`
- Editorial automation: `EDITORIAL_AUTOMATION.md`
- Canonical editorial contract:
  `artifacts/api-server/src/lib/editorialAutomationContract.ts`
- MCP tools: `artifacts/api-server/src/routes/mcp.ts`
- Revision workflow: `artifacts/api-server/src/routes/postRevisions.ts`
- Security model: `threat_model.md`
- Production migration guard: `scripts/src/railwayMigrationGuard.ts`
- Schema compatibility: `scripts/src/railwaySchemaCompatibility.ts`
- Production smoke checks: `scripts/src/productionSmoke.ts`
