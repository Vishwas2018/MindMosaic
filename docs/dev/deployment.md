# deployment.md — MindMosaic v1 Deployment Reference

> Living document. Append-only for new env vars, migration notes, and
> checklist items. Never invent values — if unknown, write "unknown — TODO measure".
> Resolves ISSUE-0018. Created Stage 41 (2026-05-31).

---

## Required environment variables

All Supabase Edge Functions are deployed as individual Deno runtimes under
`supabase/functions/<service-name>/`. The following env vars must be configured
in the Supabase project dashboard (Settings > Edge Functions) or via the Supabase
CLI (`supabase secrets set`) before deploying any service that consumes them.

### Core Supabase (required by all services)

| Variable | Source | Notes |
|---|---|---|
| `SUPABASE_URL` | Supabase project dashboard > Project URL | e.g. `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project dashboard > API > service_role | Used for inter-service calls and pipeline dispatch. Never expose to client. |
| `SUPABASE_ANON_KEY` | Supabase project dashboard > API > anon | Used by apps/web for public client init. |

### Service URL vars (jobs-worker inter-service dispatch)

`supabase/functions/jobs-worker/index.ts` dispatches pipeline jobs to owning
services via HTTP. Each service URL var falls back to `${SUPABASE_URL}/functions/v1/<service-name>`
if not set, but the fallback is not documented anywhere in code — deployers must
either set explicit values or rely on the default URL pattern below.

| Variable | Consuming service | Default (if not set) | Resolves |
|---|---|---|---|
| `INTELLIGENCE_SVC_URL` | jobs-worker | `${SUPABASE_URL}/functions/v1/intelligence-svc` | ISSUE-0018 |
| `ANALYTICS_SVC_URL` | jobs-worker | `${SUPABASE_URL}/functions/v1/analytics-svc` | ISSUE-0018 |
| `ORCHESTRATION_SVC_URL` | jobs-worker + assignments-svc | `${SUPABASE_URL}/functions/v1/orchestration-svc` | ISSUE-0018 |
| `ASSESSMENT_SVC_URL` | assignments-svc | `${SUPABASE_URL}/functions/v1/assessment-svc` | ISSUE-0018 |
| `NOTIFICATIONS_SVC_URL` | jobs-worker | `${SUPABASE_URL}/functions/v1/notifications-svc` | ISSUE-0018 |
| `BILLING_SVC_URL` | jobs-worker | `${SUPABASE_URL}/functions/v1/billing-svc` | ADR-0031 fifth amendment |

**Note on fallback behaviour.** The default fallback (`${SUPABASE_URL}/functions/v1/<name>`)
is correct for a standard Supabase project where all functions share the same
Supabase URL. Set explicit vars only when functions are deployed to different
projects or custom URLs (e.g., self-hosted Supabase, regional splits).

### apps/web client vars

Set in `apps/web/.env.local` (local dev) or Vercel environment variables
(production). Template at `apps/web/.env.local.example` (contains placeholder
values only — never real credentials).

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL` above |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` above |

### Stripe / billing-svc vars (Stage 42+)

**Elevated criticality — payment data.** These vars grant the ability to
process real Stripe events and write to financial audit tables. Guard with
the same care as `SUPABASE_SERVICE_ROLE_KEY`. Never commit real values;
`.env.local` is gitignored, `.env.example` has placeholder values only.

| Variable | Consuming service | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | billing-svc (Edge Function) | `sk_test_…` for dev/staging; `sk_live_…` for production. Single key per Q-42.1 (ADR-0034). |
| `STRIPE_WEBHOOK_SECRET` | billing-svc (Edge Function) | `whsec_…` from Stripe CLI (`stripe listen`) for local dev; Dashboard > Webhooks for production. ISSUE-0032: single-secret; v1.1 needs dual-secret rotation window. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | apps/web | `pk_test_…` / `pk_live_…`. Safe to expose to client. |
| `STRIPE_PRICE_ID_STANDARD_MONTHLY` | apps/web (checkout) | From `scripts/stripe-seed.sh` output. |
| `STRIPE_PRICE_ID_STANDARD_YEARLY` | apps/web (checkout) | From `scripts/stripe-seed.sh` output. |
| `STRIPE_PRICE_ID_PREMIUM_MONTHLY` | apps/web (checkout) | From `scripts/stripe-seed.sh` output. |
| `STRIPE_PRICE_ID_PREMIUM_YEARLY` | apps/web (checkout) | From `scripts/stripe-seed.sh` output. |

**Local dev webhook listening:**
```bash
stripe listen --forward-to localhost:54321/functions/v1/billing-svc/billing/webhook/stripe
```
The CLI prints the `whsec_…` secret on startup — set it as `STRIPE_WEBHOOK_SECRET` in `.env.local`.

**Seed test products + prices:**
```bash
bash scripts/stripe-seed.sh
```
Output includes all price IDs. Copy into `.env.local` and Supabase Edge Function env vars.

### Load test vars (CI activation)

| Variable | Consuming workflow | Notes |
|---|---|---|
| `LOAD_TEST_BASE_URL` | `.github/workflows/load-test.yml` | Activates nightly k6 run when set. Points to deployed Supabase URL. |
| `LOAD_TEST_TOKEN` | `.github/workflows/load-test.yml` | Auth token for k6 session loop. |

### Playwright E2E vars

| Variable | Consuming workflow | Notes |
|---|---|---|
| `E2E_BASE_URL` | `.github/workflows/ci.yml` E2E job | Activates Playwright CI E2E when set. |
| `E2E_WEB_URL` | Playwright specs (`test.skip` guard) | Full web app URL including port. |
| `E2E_SUPABASE_URL` | Playwright setup | Supabase URL for E2E seeding. |
| `E2E_SUPABASE_ANON_KEY` | Playwright setup | Anon key for E2E. |
| `E2E_ANON` | Playwright specs (`test.skip` guard) | Shorthand anon token. |

---

## Migration deploy order

Migrations are in `supabase/migrations/` and must be applied in sequential
order. The following migrations have deployment-order constraints beyond the
standard sequential requirement.

### Migration 0017 — `ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'manual'`

**File:** `supabase/migrations/0017_alert_type_manual.sql`

**Constraint:** `ALTER TYPE ... ADD VALUE` is non-transactional in PostgreSQL
12+. It cannot be rolled back inside a transaction. Once applied, removing the
value requires `DROP TYPE ... CASCADE` + `CREATE TYPE` + re-adding all dependent
columns — a destructive operation.

**Deploy order requirement:**
1. Run migration 0017 against the production database.
2. Wait for migration to commit (verify with `SELECT enum_range(NULL::alert_type)`).
3. THEN deploy `analytics-svc` code that inserts `alert_type='manual'`
   (`supabase/functions/analytics-svc/handlers.ts` — `createInterventionAlert`
   handler inserts `alert_type='manual'`).

**If analytics-svc is deployed BEFORE migration 0017:** the `createInterventionAlert`
handler will throw a PostgreSQL enum constraint violation on every manual alert
creation, returning 500 to all teacher flag-for-review actions.

**Linked:** Stage 38 DAILY_LOG retro (e); Q-38.6.

### Migration 0018 — Billing domain tables

**File:** `supabase/migrations/0018_billing.sql`

**Tables:** `subscription`, `billing_customer`, `invoice`, `billing_event`.

**Deploy order requirement:**
1. Run migration 0018 against the production database BEFORE deploying `billing-svc`.
2. Verify tables exist: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('subscription', 'billing_customer', 'invoice', 'billing_event');`
3. THEN deploy `billing-svc` Edge Function.

**If billing-svc is deployed BEFORE migration 0018:** all webhook calls will
return 500 (relation does not exist). Stripe will retry; catch-up processing
occurs once migration is applied and `billing_event` idempotency dedups replays.

**Financial audit log constraint (arch §1.3, §8.3):**
`billing_event` is IMMUTABLE after insert. NEVER run `UPDATE` or `DELETE` on
`billing_event` rows in production — they are a financial audit log retained 7 years.
Export to cold storage before any schema changes that touch this table.

**Rollback strategy:**
```sql
-- Order must respect foreign keys:
-- billing_event → invoice → billing_customer → subscription
DROP TABLE IF EXISTS billing_event;
DROP TABLE IF EXISTS invoice;
DROP TABLE IF EXISTS billing_customer;
DROP TABLE IF EXISTS subscription;
```
WARNING: `DROP CASCADE` is irreversible for financial records. Export
`billing_event` to cold storage before any production DROP.

**Deferred validation:** Migration 0018 has not been run against a real
PostgreSQL instance in this sandbox (no Docker). Follow the same Docker
validation steps as migrations 0012–0017 below.

### Migration 0019 — `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'system'`

**File:** `supabase/migrations/0019_user_role_system.sql`

**Constraint:** `ALTER TYPE ... ADD VALUE` is non-transactional in PostgreSQL 12+.
It cannot be rolled back inside a transaction (same class as migration 0017). Once
applied, removing the value requires `DROP TYPE ... CASCADE` + `CREATE TYPE` +
re-adding all dependent columns — a destructive operation. Use `IF NOT EXISTS` for
idempotent replay.

**Deploy order requirement:**
1. Run migration 0019 against the production database.
2. Wait for migration to commit (verify with `SELECT enum_range(NULL::user_role)` —
   must include `'system'`).
3. THEN deploy `billing-svc` code that calls `handleFlagPropagate`
   (`supabase/functions/billing-svc/handlers.ts` — `handleFlagPropagate` inserts
   `admin_action_log` row with `actor_role='system'`).

**If billing-svc is deployed BEFORE migration 0019:** `handleFlagPropagate` will
throw a PostgreSQL enum constraint violation on every `pipeline.feature_flag_propagate`
dispatch, returning 500 and causing the jobs-worker to dead-letter the job.

**Sentinel row:** Migration 0019 also inserts the sentinel `user_profile` row
(`id='00000000-0000-0000-0000-000000000001'`, `role='system'`) with
`ON CONFLICT (id) DO NOTHING` for idempotency. This row satisfies the
`admin_action_log.actor_id` NOT NULL FK constraint for system pipeline writes (Q-42.7 / Q-44.1).

**Linked:** Stage 44 DAILY_LOG; Q-44.1; Q-42.7.

### Migration 0020 — `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'access_downgraded'`

**File:** `supabase/migrations/0020_notification_type_access_downgraded.sql`

**Constraint:** `ALTER TYPE ... ADD VALUE` is non-transactional in PostgreSQL 12+. It cannot be rolled back inside a transaction (same class as migrations 0017 and 0019). Once applied, removing the value requires `DROP TYPE ... CASCADE` + `CREATE TYPE` + re-adding all dependent columns — a destructive operation. Use `IF NOT EXISTS` for idempotent replay.

**Deploy order requirement:**
1. Run migration 0020 against the production database.
2. Wait for migration to commit (verify with `SELECT enum_range(NULL::notification_type)` — must include `'access_downgraded'`).
3. THEN deploy `billing-svc` and `notifications-svc` code that references `'access_downgraded'` (`supabase/functions/billing-svc/handlers.ts` — `customer.subscription.deleted` enqueues `notification.create` with `notification_type: 'access_downgraded'`; `supabase/functions/notifications-svc/handlers.ts` — `createNotification` inserts row with `type = 'access_downgraded'`).

**If billing-svc/notifications-svc are deployed BEFORE migration 0020:** the `notification.create` job will fail with a PostgreSQL enum constraint violation when notifications-svc attempts to INSERT a row with `type = 'access_downgraded'`, returning 500 and causing the jobs-worker to dead-letter the job. Flag propagation (`pipeline.feature_flag_propagate`) is a separate job and is unaffected.

**Deferred validation:** Migration 0020 has not been run against a real PostgreSQL instance in this sandbox (no Docker available). Same validation requirement as migrations 0012–0019.

**Linked:** Stage 46; Q-46.1; ISSUE-0034.

### Migrations 0012–0017 — Docker integration test required

Migrations 0012 through 0017 have not been run against a real PostgreSQL
instance in this sandbox (no Docker available). They must be validated locally
against a real Postgres before production deploy.

**Steps:**
```bash
# Start local Supabase with Docker
supabase start

# Apply all migrations sequentially
supabase db reset

# Run pgTAP tests
supabase test db
```

Expected outcome: all 451+ pgTAP tests pass (last confirmed green: 451/451
on migrations 0001–0013, 2026-05-03).

---

## Git hooks activation

The `.githooks/commit-msg` hook enforces BUILD_CONTRACT §11.2 (no AI
Co-Authored-By trailers). It must be activated per clone:

```bash
git config core.hooksPath .githooks
```

This command must be run once after each fresh `git clone`. It is NOT automatic.
The hook will exit 1 if any `Co-Authored-By:` line appears in the commit message.
Reference: Stage 25 (ISSUE-0012 resolution, commit `975e815`).

---

## Stage 48 hardening checklist (numerical SLAs)

The following measurements are deferred from Stage 41 (Conditional Go — Q-41.1
Option A) to Stage 48 hardening pass. They require a deployed environment.
Results must be logged in `docs/dev/perf/measurements.md` (no invented numbers).

| SLA | Budget | Measurement method | Status |
|---|---|---|---|
| POST /sessions/{id}/respond p95 | 300 ms | k6 `session-loop.js` | not measured — Stage 48 |
| POST /sessions/{id}/submit + sync p95 | 5000 ms | k6 `session-loop.js` | not measured — Stage 48 |
| Async pipeline (L3b/L5/L7/L9) p95 | 30000 ms | k6 `pipeline-soak.js` (TBD) | not measured — Stage 48 |
| Parent dashboard load p95 | 2000 ms | k6 `dashboard-load.js` (TBD) | not measured — Stage 48 |
| Dead-letter rate over 24h soak | < 0.5% | Monitor `job_queue.dead_lettered_at IS NOT NULL` count | not measured — Stage 48 |
| Notification path wall-clock | < 5s | Outbox → dispatcher → jobs-worker → notifications-svc → visible in `/notifications/me` | not measured — Stage 48 (DEV-20260524-1) |

k6 harness (`k6/session-loop.js`) created at Stage 26 D1. Activates when
`LOAD_TEST_BASE_URL` + `LOAD_TEST_TOKEN` secrets are configured. Nightly CI
workflow at `.github/workflows/load-test.yml`.

---

## Tag conventions

| Tag | Meaning | Created at |
|---|---|---|
| `v1-phase-1` | Phase 1 complete (Stages 1–27, Conditional Go) | Stage 27 locally; push approved Stage 41 |
| `v1-phase-2-partial` | Phase 2 complete (Stages 28–41, Conditional Go — numerical SLAs deferred) | Stage 41 |
| `v1.0.0` | Full launch gate passed (Stage 49) | Stage 49 |

**Conditional Go:** code-verifiable criteria complete; infrastructure-verifiable
criteria (migrations Docker run, k6 SLAs, Playwright E2E against deployed env)
deferred to the next hardening pass. No production deploy until all checklist
items in §Migration deploy order and §Stage 48 hardening checklist are cleared.
