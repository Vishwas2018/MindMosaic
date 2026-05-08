# ADR-0032 — Pipeline observability split: non-session-scoped stages use domain artifacts only

- Status: accepted
- Amended: 2026-05-20 (Stage 30) — scope extended to L7; `intelligence_audit_log.student_id NOT NULL` also blocks class-scoped writes; pattern generalised (see Stage 30 amendment section below).
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

---

## Stage 30 Amendment — intelligence_audit_log also unusable for class-scoped L7; generalised pattern

**Additional constraint discovered (Stage 30 morning pre-read, Q-30.2).**

`intelligence_audit_log` was established as the universal observability fallback in this ADR — every pipeline layer that cannot write `pipeline_event` writes here instead. However, the `intelligence_audit_log` schema (arch §2.8, migration 0005) enforces:

```sql
student_id uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE
```

L7 teacher intelligence (`pipeline.teacher_refresh`, Stage 30) operates at **class + skill** granularity — it aggregates mastery, velocity, misconceptions and behaviour profiles across all students in a class roster. There is no single `student_id` to supply. The constraint is load-bearing: it enforces referential integrity and drives the per-student index. Weakening it would require a migration and would impact all downstream audit queries.

**Resolution (Q-30.2 → Option B):** Skip `intelligence_audit_log` for L7 as well. Extend the ADR-0032 pattern.

**Generalised pattern (applies to L7, and any future pipeline stage that is neither session-scoped nor student-scoped):**

> A pipeline stage that cannot supply `session_id` (pipeline_event constraint) AND cannot supply `student_id` (intelligence_audit_log constraint) uses its **domain artifact writes** as the sole observability surface. For L7 this means: (1) `intervention_alert` INSERT rows for each triggered alert type per student, and (2) the `cohort_metric_cache` UPSERT carrying the full cluster group payload + `computed_at` + `processing_time_ms`. These artifacts are queryable, auditable, and sufficient for monitoring dashboard parity.

**Code markers:** `analytics-svc/handlers.ts` carries a `// ADR-0032: intelligence_audit_log skipped — student_id NOT NULL blocks class-scoped writes; observability via intervention_alert + cohort_metric_cache` comment at the non-call site.

**Follow-ups:** ISSUE-0016 extended to include the audit_log gap. ISSUE-0016 now covers: (1) `pipeline_event.session_id NOT NULL` gap for L5/L7/L9, (2) `intelligence_audit_log.student_id NOT NULL` gap for L7 (and any future class/cohort-scoped stage). Long-term fix remains the `async_pipeline_event` + `analytics_audit_log` tables proposed in ISSUE-0016.

**Files:** `supabase/functions/analytics-svc/handlers.ts` (L7 handler — no pipeline_event calls, no intelligence_audit_log calls) · Related: Q-30.2, ADR-0033, ISSUE-0016, ISSUE-0017
