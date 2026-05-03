# ADR-0018 — Outbox dispatcher scheduled every minute via pg_cron; v1.1 upgrade path is Database Webhook

- Status: accepted
- Date: 2026-05-03
- Stage: 10
- Tags: backend | infra

## Context

Arch Part XI §5 specifies the outbox dispatcher should poll "every 2 seconds". pg_cron's minimum
schedule resolution is 1 minute (`* * * * *`). Stage 10 introduces the outbox dispatcher on top
of the pg_cron infrastructure added in Stage 9. The gap means outbox events may wait up to 59
seconds before dispatch in v1. The v1 async pipeline latency budget (BUILD_CONTRACT §10) is
30,000 ms — a worst-case 59-second dispatch window is within this budget end-to-end.

## Options considered

1. **Every minute via pg_cron** — matches existing infrastructure, zero additional setup.
   Pros: no new infrastructure; reuses Stage 9 pg_cron; within latency budget.
   Cons: 58-second worst-case dispatch window vs arch "every 2s" specification.

2. **Supabase Database Webhook → Edge Function (sub-second on INSERT)** — fires the
   `outbox-dispatcher` Edge Function on every `outbox_event` INSERT via Realtime.
   Pros: matches arch spec; sub-second dispatch.
   Cons: requires Supabase Realtime webhook wiring not provisioned until v1.1; adds
   infrastructure dependency that is out of scope for Stage 10.

## Decision

Use **Option 1** (pg_cron every minute) for v1.

## Rationale

The v1 async pipeline latency budget (BUILD_CONTRACT §10) is 30,000 ms. A worst-case
59-second dispatch window sits within this budget. The arch "every 2s" target was written
anticipating the v1.1 Database Webhook path; it was not a hard v1 constraint. Shipping
Option 2 in Stage 10 would introduce Realtime infrastructure before the rest of the system
is ready to consume it. pg_cron every-minute is the minimal-risk path that satisfies v1 correctness.

The v1.1 upgrade is a **rewrite** (remove `outbox.dispatch` cron job, add Supabase Database
Webhook targeting `outbox-dispatcher` Edge Function on `outbox_event` INSERT), not a tuning
of the cron schedule.

## Consequences

- Positive: Zero new infrastructure; reuses Stage 9 pg_cron; migration is straightforward.
- Negative: Up to 59-second dispatch latency vs arch "every 2s" target; deviation documented.
- Follow-ups: v1.1 — remove `outbox.dispatch` cron registration; wire Supabase Database Webhook
  on `outbox_event` INSERT → `outbox-dispatcher` Edge Function. ISSUE-0004 (outbox_event 7-day
  cleanup, arch §5.6) deferred to Stage 14.

## Implementation notes

Files: `supabase/migrations/0010_outbox_dispatcher.sql` (Section 3),
       `supabase/functions/outbox-dispatcher/index.ts`
Commit: TBD · Related: ADR-0017, ISSUE-0004, DEV-20260503-2
