# ADR-0034 — Stripe Integration Patterns

- Status: accepted
- Date: 2026-06-01
- Stage: 42
- Tags: backend | security | billing | infra

## Context

Stage 42 introduces the first Stripe code in the codebase. Arch §11.2 mandates
zero Stripe code before Stage 42 (`G2` guard). Five integration-pattern decisions
must be made before billing-svc is written: key management strategy, webhook
authentication, event idempotency, entitlement source of truth, and PCI scope.

Six questions were raised (Q-42.1–Q-42.6) in the Stage 42 morning ritual and
resolved before implementation. This ADR documents the decisions and their
rationale, including the explicit contrast between billing-svc webhook idempotency
and the ISSUE-0023 REST idempotency pattern — a deliberate divergence, not drift.

## Options considered

### 1. Stripe key strategy (Q-42.1)

1. **Single `STRIPE_SECRET_KEY`** — value prefix (`sk_test_`/`sk_live_`) determines
   mode. Mode is deployment config, not code config.
2. **Split `STRIPE_SECRET_KEY_TEST` + `STRIPE_SECRET_KEY_LIVE`** + `STRIPE_MODE`
   toggle — allows parallel environments from the same deployment binary, but adds
   runtime mode-branching in code.

### 2. Webhook authentication (Q-42.3)

1. **`stripe-signature` header only** — no MindMosaic JWT on the webhook endpoint.
   Inbound auth is Stripe's HMAC signature. Service-role Supabase client initialised
   from env for internal DB writes.
2. **JWT + signature** — adds unnecessary complexity; Stripe cannot supply a
   MindMosaic JWT.

### 3. Event idempotency (Q-42.4)

1. **`billing_event.stripe_event_id UNIQUE NOT NULL` + `ON CONFLICT DO NOTHING`** —
   atomic dedup at the DB INSERT level; return HTTP 200 to Stripe on duplicate.
2. **`withIdempotency` shared middleware** (from `_shared/idempotency.ts`) — the
   existing mechanism for REST endpoints with client-generated `Idempotency-Key`
   headers.

### 4. Entitlement source of truth (Q-42.2)

1. **`subscription.tier` (active row) → `feature_flag` resolution surface** — arch
   §2.12 DDL defines `subscription` with `is_active = true` uniqueness per tenant;
   arch §11.2 names `feature_flag` as the entitlement resolution surface (tenant
   override → subscription → platform default). No `tier` column on `tenant`.
2. **`tenant.tier` column** — absent from arch DDL; not a valid option.

### 5. PCI scope (Q-42.5)

1. **SAQ A — Stripe-hosted Checkout + Stripe Customer Portal only** — card data
   never touches MindMosaic servers or JavaScript. All Phase 4 checkout uses
   redirect to Stripe-hosted pages.
2. **SAQ A-EP or SAQ D** — would be required if Stripe Elements (embedded) were
   used; deferred to v1.1+ if ever needed.

### 6. Feature-flag propagation job name (Q-42.6)

1. **`pipeline.feature_flag_propagate` (arch §11.2 name)** — dispatch to
   `billing-svc POST /billing/pipeline/flag-propagate`. Webhook handler updates
   `subscription` synchronously, enqueues this job for async flag propagation.
   Stage 44 implements the handler body; Stage 42 stubs the route.
2. **`pipeline.billing_event_apply` (DEV_PLAN planning shorthand)** — conflates
   synchronous subscription update with async flag propagation; not an arch name.

## Decision

1. **Single `STRIPE_SECRET_KEY`** — value determines mode. Separate
   `STRIPE_WEBHOOK_SECRET` per environment (always different per Stripe's model).
   No mode-toggle branching in code.

2. **`stripe-signature` sole inbound auth** on `POST /billing/webhook/stripe`.
   Mirrors the `outbox-dispatcher` pattern: no JWT, service-role DB writes
   internally.

3. **`billing_event.stripe_event_id UNIQUE NOT NULL` + `ON CONFLICT DO NOTHING`**
   for webhook idempotency. The `withIdempotency` middleware is NOT used for
   webhooks.

4. **`subscription.tier` is the tier record; `feature_flag` is the resolved
   entitlement surface.** No `tenant.tier` column.

5. **SAQ A** — Stripe-hosted Checkout only. No Stripe Elements in v1.

6. **`pipeline.feature_flag_propagate`** per arch §11.2. ADR-0031 fifth amendment
   adds `billing-svc → POST /billing/pipeline/flag-propagate`. DEV_PLAN's
   `pipeline.billing_event_apply` is planning shorthand only — must never appear
   as a `job_type` string in code.

## Rationale

**Decision 1 (key strategy):** Stripe's own guidance recommends a single key var
whose prefix signals mode. Code that detects `sk_test_` vs `sk_live_` at runtime
is a maintenance footgun — a misconfigured `STRIPE_MODE` env var could cause
live-mode writes from a staging deployment. Single var + separate deployments
enforce separation at the infrastructure level where it belongs.

**Decision 2 (webhook auth):** Stripe cannot supply a MindMosaic JWT. Adding a
second auth layer (shared secret / IP allowlist) creates redundancy with
`stripe-signature` without reducing attack surface meaningfully — the signature
already proves the payload is from Stripe and unmodified. Service-role key for
internal DB writes is the correct internal auth model (same as all other
service-role-only backend paths).

**Decision 3 (idempotency divergence from ISSUE-0023):**

ISSUE-0023 (`withIdempotency` middleware) handles REST idempotency:
- Client generates `Idempotency-Key` UUID header
- Key stored in `api_idempotency_key` table with `(key, tenant_id)`
- Replays exact cached response body on duplicate

Billing webhook idempotency is architecturally different:
- Stripe generates `stripe_event_id` (globally unique across Stripe)
- Dedup key is `stripe_event_id`, NOT a client-generated header
- No response body to cache — Stripe ignores webhook response body
- Correct response to duplicate: HTTP 200 (2xx expected; non-2xx triggers Stripe retry)
- Dedup must be atomic at INSERT: `ON CONFLICT (stripe_event_id) DO NOTHING`

Both patterns are correct for their contexts. The divergence is architectural,
not a drift from ISSUE-0023. ADR-0034 explicitly documents this contrast so
future readers understand why `withIdempotency` is absent from billing-svc.

**Decision 4 (entitlement source):** Arch DDL has no `tenant.tier`. Arch §11.2
names `feature_flag` as the entitlement surface that applications read. The
`subscription` table is the Stripe-mirrored record. `pipeline.feature_flag_propagate`
bridges the two. This three-tier model (Stripe → subscription → feature_flag)
enables admin overrides to coexist without touching subscription rows.

**Decision 5 (PCI scope):** Stripe-hosted Checkout removes all card-data handling
from MindMosaic scope. SAQ A requires only that the payment form be served from
Stripe's domain — met by Checkout redirect. Elements (embedded) would require SAQ
A-EP or D, adding significant PCI compliance overhead. Deferred to v1.1+ if
market demand justifies it.

**Decision 6 (job name):** ADR-0031 established arch ownership model as authoritative
for job_type strings. `pipeline.feature_flag_propagate` is the arch §11.2 name.
DEV_PLAN's `pipeline.billing_event_apply` was a planning-phase label that conflates
two distinct operations (subscription state update = synchronous in handler;
feature_flag propagation = async job). Using the DEV_PLAN shorthand as the actual
job_type would create a mismatch between the jobs-worker route table and every
future architectural reference.

## Consequences

- Positive: billing-svc has the simplest possible inbound auth surface; no
  mode-branching code; idempotency is enforced at the DB layer (cannot be bypassed
  by a code path); PCI scope is minimal; job names are consistent with arch.
- Negative: `STRIPE_WEBHOOK_SECRET` must be rotated carefully — a single active
  secret means zero-downtime rotation requires a dual-secret acceptance window
  (ISSUE-0032, v1.1). Production key migration (test → live) requires redeployment.
- Follow-ups:
  - ISSUE-0032: dual-secret rotation window for webhook secret (v1.1)
  - Stage 44: implement `pipeline.feature_flag_propagate` handler body in billing-svc
  - Stage 47: Phase 4 exit review includes Stripe test-mode → live-mode cutover plan

## Implementation notes

Files:
- `supabase/functions/billing-svc/index.ts` (new)
- `supabase/functions/billing-svc/handlers.ts` (new)
- `supabase/migrations/0018_billing.sql` (new)
- `supabase/functions/jobs-worker/index.ts` (amended — ADR-0031 fifth amendment)
- `docs/dev/deployment.md` (billing section added)

Commit: Stage 42 impl commit (pending)
Related: ADR-0031 (fifth amendment), ISSUE-0023 (REST idempotency contrast),
ISSUE-0032 (webhook secret rotation), Q-42.1–Q-42.6
