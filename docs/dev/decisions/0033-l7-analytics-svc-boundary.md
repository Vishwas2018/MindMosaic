# ADR-0033 — L7 teacher intelligence handler boundary — analytics-svc owns L7 pipeline + read endpoints

- Status: accepted
- Date: 2026-05-20
- Stage: 30
- Tags: backend | architecture | async-pipeline

## Context

Stage 30 adds `processTeacherRefresh` (L7 teacher intervention intelligence), an async batch job dispatched by jobs-worker via `pipeline.teacher_refresh`. ADR-0031 (Stage 28) recorded a speculative routing entry: `pipeline.l7.* / pipeline.l9.* (Stage 36+) → orchestration-svc (TBD)`. Stage 30's concrete deliverables (DEV_PLAN Stage 30) are `/analytics/auto-groups` and `/analytics/intervention-alerts` — both assigned to `analytics-svc` by arch §4.7 and arch §1.2 ownership table (ANL owns `intervention_alert` and `cohort_metric_cache`).

The actual job type from arch §5.2 pipeline steps table is `pipeline.teacher_refresh` (not `pipeline.l7.*`). No `analytics-svc` Edge Function exists prior to Stage 30.

Two service options exist for hosting the L7 handler:

1. **intelligence-svc** — already hosts L1/L2/L3a/L3b/L5 pipeline handlers. Quick to extend; avoids scaffolding a new service.
2. **analytics-svc** — the architecturally correct home per arch §4.7 and arch §1.2. Requires building a new Edge Function from scratch; mirrors the Stage 28 jobs-worker creation effort.

A related question: ADR-0031's speculative routing entry named `orchestration-svc` as the L7 owner. This conflicts with both DEV_PLAN Stage 30 and arch §4.7.

## Options considered

1. **Extend `intelligence-svc`** — add L7 handler and `/analytics/*` routes to intelligence-svc. Pros: no new service scaffold; precedent from L5 (Stage 29). Cons: violates arch §4.7 service ownership; intelligence-svc would own `intervention_alert` and `cohort_metric_cache` which arch §1.2 assigns to analytics-svc; `analytics-svc` endpoints would be served from the wrong service, complicating Stage 32+ when analytics-svc is built for the remaining endpoints.

2. **Create `analytics-svc` Edge Function** — scaffold `supabase/functions/analytics-svc/` as a new workspace package. L7 handler + GET read endpoints live here. Pros: arch §4.7 + arch §1.2 satisfied; OWNERS.md stays authoritative; Stage 32+ analytics endpoints land in the correct service; no ownership confusion. Cons: 1-day budget includes new service scaffold (~same effort as Stage 28 jobs-worker, which took ~3h).

## Decision

Use **Option 2 — create `analytics-svc` Edge Function**.

ADR-0031 routing table amended: speculative `pipeline.l7.* / pipeline.l9.* → orchestration-svc` entry replaced with concrete `pipeline.teacher_refresh → analytics-svc`; `pipeline.l9.* → orchestration-svc` retained as still speculative.

## Rationale

- Arch §4.7 is the API surface authority: `/analytics/auto-groups` and `/analytics/intervention-alerts` belong to `analytics-svc`. Serving them from `intelligence-svc` would mean duplicating or splitting the service boundary at Stage 32.
- Arch §1.2 ownership table assigns `intervention_alert` and `cohort_metric_cache` writes to `analytics-svc` (ANL). Enforcing this at Stage 30 avoids a later migration of writer ownership.
- ADR-0031's speculative entry was explicitly labelled Stage 36+; the concrete Stage 30 deliverable supersedes it. `orchestration-svc` is the wrong owner regardless — the arch owns orchestration endpoints at `/orchestration/*`, not `/analytics/*`.
- 1-day budget: Stage 28 (jobs-worker from scratch) completed in ~3h. analytics-svc at Stage 30 is similar scope (new service + handler + 2 GET routes + 7 contract tests).

## Consequences

- Positive: Arch ownership model preserved; Stage 32+ analytics endpoints land in the correct service with zero structural change; OWNERS.md stays single source of truth.
- Negative: New service scaffold adds ~30 min overhead. `pnpm-workspace.yaml` gains a 12th workspace. `jobs-worker` needs a new `ANALYTICS_SVC_URL` env var.
- Follow-ups: Stage 32 adds remaining analytics endpoints (`/analytics/cohort/{group_id}`, `/analytics/pathway-readiness/...`, `/analytics/generate-assignment`) to the existing `analytics-svc`. Stage 31 resolves `pipeline.l9.*` routing when orchestration-svc is designed.

## Implementation notes

Files: `supabase/functions/analytics-svc/` (new), `supabase/functions/jobs-worker/index.ts` (route map + ANALYTICS_SVC_URL), `pnpm-workspace.yaml` (12th workspace), `docs/dev/decisions/0031-*.md` (amended) ·
Related: ADR-0031, ADR-0032, Q-30.1, Q-30.2, ISSUE-0016
