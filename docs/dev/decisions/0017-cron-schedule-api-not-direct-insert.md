# ADR-0017 — Cron job registration via cron.schedule() API, not direct INSERT into cron.job

- Status: accepted
- Date: 2026-05-03
- Stage: 9
- Tags: backend | infra | dx

## Context

Stage 9 introduces 8 pg_cron jobs. DEV_PLAN.md Stage 9 described cron job registration using
`INSERT INTO cron.job (...) ON CONFLICT DO NOTHING`, treating `cron.job` as an ordinary table.

pg_cron exposes two public API functions: `cron.schedule(jobname, schedule, command)` (returns
bigint jobid) and `cron.unschedule(jobid)` / `cron.unschedule(jobname)`. These are the documented
registration interface. The `cron.job` catalog table is an internal implementation detail.

Prior art: the pg_cron changelog notes that direct table manipulation was supported in early
versions but the column layout of `cron.job` has changed between major releases (e.g., `nodename`,
`nodeport`, `database` columns added/modified across pg_cron 1.x). Migrations using `INSERT INTO
cron.job` risk breakage on any pg_cron upgrade.

## Options considered

1. **Direct INSERT into cron.job with ON CONFLICT DO NOTHING** — matches DEV_PLAN.md text.
   Pros: a single statement per job, familiar SQL. Cons: fragile against pg_cron version drift
   (required column set changes), bypasses API invariants, breaks idempotency if column defaults
   differ across versions.

2. **cron.schedule() / cron.unschedule() public API with unschedule-first pattern** — documented
   stable interface. Pros: version-stable, idempotent (unschedule-first removes any stale
   registration before re-registering), API invariants enforced. Cons: two statements per job
   (unschedule + schedule); DEV_PLAN.md text is imprecise and will be corrected at Stage 10 audit.

## Decision

Use **cron.schedule() / cron.unschedule() public API** (Option 2). The unschedule-first pattern:

```sql
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = '<name>';
SELECT cron.schedule('<name>', '<schedule>', 'SELECT <fn>()');
```

The `FROM cron.job WHERE jobname = '<name>'` lookup is safe — it queries the catalog table
(read-only) rather than inserting into it. If no job matches, zero rows are returned and
`cron.unschedule` is never called (safe).

## Rationale

The pg_cron public API is the stable, documented interface. Direct INSERT bypasses it and
creates schema-coupling to an internal catalog table. The DEV_PLAN.md "ON CONFLICT DO NOTHING"
wording was documentation imprecision; the corrected pattern is recorded here. Stage 10 audit
will note the DEV_PLAN.md discrepancy.

## Consequences

- Positive: version-safe registrations; idempotent migrations; matches pg_cron documentation.
- Negative: two statements per job instead of one; DEV_PLAN.md text requires a Stage 10 note
  (not an edit — DEV_PLAN.md is immutable per CLAUDE.md; file a deviation instead).
- Follow-ups: Stage 10 audit to note DEV_PLAN.md imprecision and confirm no action needed
  (deviation already logged as DEV-20260503-2).

## Implementation notes

Files: `supabase/migrations/0008_cron.sql` · Commit: d2d2090
Related: DEV-20260503-2
