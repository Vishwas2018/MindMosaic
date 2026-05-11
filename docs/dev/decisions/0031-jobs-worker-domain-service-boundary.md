# ADR-0031 — Jobs-worker / domain-service boundary

- Status: accepted
- Amended: 2026-05-19 (Stage 29) — `pipeline.predictive_refresh` route added; speculative `pipeline.l5.*` → `analytics-svc` entry removed.
- Amended: 2026-05-20 (Stage 30) — `pipeline.teacher_refresh` → `analytics-svc` added (concrete); speculative `pipeline.l7.* → orchestration-svc` entry replaced; `pipeline.l9.* → orchestration-svc` retained as still speculative. Q-30.1 resolved. ADR-0033 filed for location decision.
- Amended: 2026-05-21 (Stage 31) — `pipeline.l9.*` wildcard replaced with concrete `pipeline.orchestration_replan → orchestration-svc → POST /orchestration/pipeline/orchestration-replan`. orchestration-svc confirmed as correct owner per arch §4.6 + §1.2. Q-31.1–Q-31.4 resolved. Third amendment.
- Amended: 2026-05-24 (Stage 34) — `notification.create → notifications-svc → POST /notifications/pipeline/create` added (concrete). Q-34.1 resolved: outbox event_type `assignment_assigned` (Stage 33) → `notification.create` job; migration 0016 fixes fn_drain_outbox_batch alignment. Q-34.4 resolved: `plan_updated` + `intervention_alert` outbox events added to orchestration-svc replan + analytics-svc post-alert-INSERT paths respectively; migration 0016 adds both branches. Fourth amendment.
- Amended: 2026-06-01 (Stage 42) — `pipeline.feature_flag_propagate → billing-svc → POST /billing/pipeline/flag-propagate` added. `BILLING_SVC_URL` env var added. Fifth amendment. Q-42.6 resolved. ADR-0034 filed.
- Date: 2026-05-18
- Stage: 28
- Tags: backend | architecture | async-pipeline

## Context

Stage 28 introduces the generic job worker (`supabase/functions/jobs-worker/`) to
process entries from `job_queue`. The worker picks up jobs using `FOR UPDATE SKIP
LOCKED` (advisory-lock-free exactly-once pattern). The first concrete job type is
`pipeline.causal.evaluate_full` (L3b), which must extend the intelligence pipeline
already established in Stages 20–21.

Two architectural shapes are possible:

1. **Inline logic** — the worker contains the L3b implementation directly. Simple,
   but couples domain logic to the runtime; every new job type adds domain code to
   the worker.

2. **HTTP dispatch** — the worker is a generic runtime; each `job_type` is mapped to
   an owning service called via HTTP (service-role key + `x-mm-trace-id` propagated).
   Domain logic stays in the service that owns it.

The first shape violates the ownership model established by OWNERS.md (intelligence-svc
owns all pipeline steps) and would make L5/L7/L9 a maintenance burden in the worker.
The second shape raises a deployment dependency question and retry-ownership ambiguity:
who owns the retry counter when a domain-service call fails?

ADR-0027 (intelligence pipeline replay determinism) names intelligence-svc as the
determinism boundary. ADR-0017 pins cron registration to `cron.schedule()`. ADR-0018
establishes the outbox-dispatcher → job_queue chain. This ADR resolves the ownership
of retry state and the HTTP dispatch contract.

## Options considered

1. **Inline logic in jobs-worker** — worker contains L3b code. Pros: no inter-service
   HTTP in async path. Cons: violates OWNERS.md; couples worker to domain; L5/L7/L9
   would all leak into worker; replay determinism boundary shifts ambiguously.

2. **HTTP dispatch to owning service** — worker is a generic runtime; `job_type →
   service URL` routing table; retry + backoff state owned by worker. Pros: clean
   ownership boundary; OWNERS.md stays authoritative; determinism boundary stays in
   intelligence-svc per ADR-0027; L5/L7/L9 follow the same pattern with zero
   worker changes. Cons: one additional HTTP hop per async pipeline step; failure
   taxonomy (timeout vs 4xx vs 5xx) must be codified in the worker.

## Decision

Use **Option 2 — HTTP dispatch to owning service**.

The jobs-worker contains: job pickup (`FOR UPDATE SKIP LOCKED`), retry counter
increment, dead-letter promotion (`dead_lettered_at`, `failure_reason`), and cron
trigger registration (via ADR-0017 `cron.schedule()`). It contains **no domain logic**.

Each `job_type` maps to an owning service URL:

| job_type | Owning service | HTTP path |
| -------- | -------------- | --------- |
| `pipeline.causal.evaluate_full` | `intelligence-svc` | `POST /intelligence/pipeline/causal-full` |
| `pipeline.predictive_refresh` | `intelligence-svc` | `POST /intelligence/pipeline/predictive-refresh` |
| `pipeline.teacher_refresh` | `analytics-svc` | `POST /analytics/pipeline/teacher-refresh` |
| `pipeline.orchestration_replan` | `orchestration-svc` | `POST /orchestration/pipeline/orchestration-replan` |
| `notification.create` | `notifications-svc` | `POST /notifications/pipeline/create` |
| `pipeline.feature_flag_propagate` | `billing-svc` | `POST /billing/pipeline/flag-propagate` |

HTTP call uses `SUPABASE_SERVICE_ROLE_KEY` (`x-mm-service-role` header) and propagates
`x-mm-trace-id`. The owning service is responsible for idempotency (audit-log dedup
on `(session_id, algorithm_version)` per ADR-0027 Q-20.7 resolution).

Retry + backoff state (`attempt_count`, `next_attempt_at`, `dead_lettered_at`,
`failure_reason`) lives in `job_queue` and is managed **only by the worker**, not by
the domain-service handler.

## Rationale

- OWNERS.md ownership model is preserved — intelligence-svc owns L3b just as it owns
  L1/L2/L3a.
- ADR-0027 replay-determinism boundary stays at intelligence-svc. The worker is not
  in the determinism-relevant code path.
- L5/L7/L9 (Stages 32–36) add new `job_type` → service URL entries to the worker's
  routing table and new handlers to their owning services; zero structural change to
  the worker runtime.
- Retry idempotency is already handled by audit-log dedup (ADR-0027/Q-20.7) — the
  worker can safely re-dispatch after a transient failure.
- One extra HTTP hop in the async path is outside the synchronous user-facing budget;
  BUILD_CONTRACT §10 pipeline-async budget is 30 s, which easily absorbs a single
  internal round-trip.

## Consequences

- Positive: Clean separation of concerns; OWNERS.md stays single source of truth;
  worker complexity is O(1) as new pipeline stages are added.
- Negative: Worker must correctly classify HTTP failure categories (timeout, 4xx,
  5xx) to decide retry vs dead-letter; a bug in the classifier could cause runaway
  retries or silent drops.
- Follow-ups: Stage 32+ jobs must document `job_type → service URL` mapping in
  OWNERS.md. Intelligence-svc must expose `POST /intelligence/pipeline/causal-full`
  as a service-role-only endpoint (no student JWT path). Future service splits
  (dedicated `analytics-svc` for analytics/L6 + `orchestration-svc` for L7/L9)
  deferred to when those services are designed; route map updated when they land.

## Implementation notes

Files: `supabase/functions/jobs-worker/index.ts`,
`supabase/functions/jobs-worker/handlers.ts`,
`supabase/functions/intelligence-svc/index.ts` (new route),
`supabase/functions/intelligence-svc/handlers.ts` (L3b handler),
`supabase/migrations/` (job_queue schema additions per Q-28.3/Q-28.4),
`supabase/functions/jobs-worker/__tests__/contract.test.ts` ·
Related: ADR-0017, ADR-0018, ADR-0027, ADR-0028, ISSUE-0006

Amended 2026-05-19 (Stage 29): `pipeline.predictive_refresh →
intelligence-svc /intelligence/pipeline/predictive-refresh` route
added to jobs-worker route map. Q-29.1 resolved.

Amended 2026-05-24 (Stage 34): `notification.create → notifications-svc
POST /notifications/pipeline/create` added to jobs-worker route map.
`NOTIFICATIONS_SVC_URL` env var added to jobs-worker. `fn_drain_outbox_batch`
in migration 0016 replaces the speculative `assignment.published` branch (dead
code — Stage 33 never wrote that event type) with `assignment_assigned` +
adds `plan_updated` + `intervention_alert` branches. orchestration-svc replan
completion + analytics-svc post-alert-INSERT write outbox_event rows for the
two new event types. Q-34.1 and Q-34.4 resolved. ISSUE-0025 filed for
spam-guard dedup window tuning.

Amended 2026-06-01 (Stage 42, fifth amendment): `pipeline.feature_flag_propagate →
billing-svc POST /billing/pipeline/flag-propagate` added to jobs-worker route map.
`BILLING_SVC_URL` env var added (default: `${SUPABASE_URL}/functions/v1/billing-svc`).
Stage 42 stubs the handler body in billing-svc with 200 + audit log + explicit
`// Stage 44 pending` marker; Stage 44 implements the full feature_flag propagation
logic. ADR-0034 documents why the job name is `pipeline.feature_flag_propagate`
(arch §11.2 authoritative) and not `pipeline.billing_event_apply` (DEV_PLAN planning
shorthand). Q-42.6 resolved.
