# ADR-0032 — Pipeline observability split: L5 writes only intelligence_audit_log

- Status: accepted
- Date: 2026-05-19
- Stage: 29
- Tags: backend | architecture | async-pipeline | observability

## Context

Stage 29 adds `processPredictiveRefresh` (L5), an async pipeline handler
dispatched by jobs-worker. The existing sync pipeline (L1/L2/L3a via
`processSession`) and async L3b handler (`processCausalFull`) both write
`pipeline_event` rows for observability (steps 1–4). The natural expectation
is that L5 would write a `pipeline_event` row for step 5.

Migration 0006 defines `pipeline_event` with:

```sql
CREATE TABLE pipeline_event (
  ...
  session_id uuid NOT NULL REFERENCES session_record(id),
  ...
);
```

The `session_id NOT NULL` constraint is load-bearing: pipeline_event rows are
keyed to a specific session (L1/L2/L3a share one session; L3b is invoked per
submitted session via `pipeline.causal.evaluate_full` job). L5 predictive-
refresh operates at the student+pathway level, aggregating across all pathway
sessions — it has no session_id to supply.

## Options considered

1. **Make session_id nullable** — alter migration 0006 (or add migration 0015)
   to add `ALTER TABLE pipeline_event ALTER COLUMN session_id DROP NOT NULL`.
   Pros: uniform step coverage across all layers. Cons: requires a new
   migration; all existing queries that join pipeline_event → session_record
   must add null-checks; the 1-day Stage 29 budget makes this scope-expansion
   risky. Risk of breaking L1/L2/L3a/L3b coverage tests.

2. **Skip pipeline_event for L5; use intelligence_audit_log only** — L5
   writes its result and metadata to `intelligence_audit_log` (already
   universal across all layers). Pros: no migration needed; no changes to
   existing pipeline_event consumers; `intelligence_audit_log` already
   provides all observability needed (event_type, input_snapshot, output,
   algorithm_version, trace_id). Cons: pipeline_event step coverage has a gap
   at step 5; monitoring queries that enumerate pipeline steps will not see L5.

## Decision

Use **Option 2 — skip pipeline_event for L5; use intelligence_audit_log exclusively**.

`processPredictiveRefresh` writes one `intelligence_audit_log` row on
completion (and one on insufficient_data early return) and does NOT write
`pipeline_event`. All L5 observability (dedup, audit trail, input/output
snapshot) is captured via `intelligence_audit_log`.

## Rationale

- `session_id NOT NULL` is a correctness constraint protecting referential
  integrity for session-scoped pipeline steps. Weakening it for a non-session
  step introduces nullable FKs that must be handled in all downstream queries.
- `intelligence_audit_log` is already the universal observability surface:
  every pipeline layer (L1 through L3b) writes there. Adding L5 to that table
  is the zero-risk path consistent with ADR-0027.
- 1-day Stage 29 budget cannot absorb the migration + query audit scope.
- ISSUE-0016 filed to evaluate a dedicated `async_pipeline_event` table
  (without session_id constraint) for L5/L7/L9 observability in v1.1.

## Consequences

- Positive: No migration needed; existing pipeline_event consumers unchanged;
  intelligence_audit_log stays authoritative for all pipeline layers.
- Negative: Step-5 gap in pipeline_event coverage; monitoring dashboards that
  track step coverage by step number will miss L5 progress.
- Follow-ups: ISSUE-0016 — evaluate `async_pipeline_event` table for L5/L7/L9
  in v1.1. L7/L9 handlers (Stage 36+) must follow the same pattern until
  ISSUE-0016 is resolved.

## Implementation notes

Files: `supabase/functions/intelligence-svc/handlers.ts` (L5 handler — no
pipeline_event calls), `supabase/functions/intelligence-svc/__tests__/contract.test.ts`
(L5 test suite — no pipeline_event stub expected) ·
Related: ADR-0027, ADR-0031, Q-29.4, ISSUE-0016
