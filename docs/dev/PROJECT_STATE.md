# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 10 — Outbox Dispatcher (2026-05-03)
- Next stage: Stage 11 — packages/types + Zod Schemas
- Days remaining (target 75): 65
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3

## Test suite

| Suite        | Status   | Count     | Last run   |
| ------------ | -------- | --------- | ---------- |
| Unit         | ✅ green  | 0 (pass-with-no-tests) | 2026-05-03 |
| Integration  | n/a      | n/a       | n/a        |
| pgTAP        | ✅ green  | 451/451   | 2026-05-03 |
| Contract     | n/a      | n/a       | n/a        |
| RLS          | ✅ green  | 451/451 (53 tables) | 2026-05-03 |
| E2E          | n/a      | n/a       | n/a        |

## Quality gates

| Gate            | Last status | Last run   |
| --------------- | ----------- | ---------- |
| pnpm lint       | ✅ green (6/6, cached) | 2026-05-03 |
| pnpm typecheck  | ✅ green (6/6, cached) | 2026-05-03 |
| pnpm test       | ✅ green (6/6, cached) | 2026-05-03 |
| pnpm build      | ✅ green (cached from Stage 1) | 2026-04-30 |
| RLS coverage    | ✅ 53/53 tables enabled + tested | 2026-05-03 |
| pnpm audit      | unknown — TODO measure | n/a |
| pnpm test:migration | ✅ green (roundtrip up→down→up, 10 migrations) | 2026-05-03 |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95 |
| --------------------------------- | ---------- | ------------ |
| POST /sessions/{id}/respond       | 300 ms     | n/a          |
| POST /sessions/{id}/submit + sync | 5000 ms    | n/a          |
| Pipeline async                    | 30000 ms   | n/a          |
| Dashboard load                    | 2000 ms    | n/a          |

## Open items

- ADRs accepted: 18 (ADR-0001 through ADR-0018)
- ADRs proposed: 0
- Issues critical / high / medium / low: 0/0/0/1
- Open questions: 0
- Open bugs: 0
- Deviations logged: 2 (DEV-20260430-1 ongoing Stage 15; DEV-20260503-2 ongoing v1.1)

## Notes for next session

**Stage 10 complete (2026-05-03):**
- Audit tasks: ISSUE-0002 closed (migration 0009, 440/440), ISSUE-0003 closed (GHA @v5),
  DEV_PLAN.md cron text correction, audit chore commit.
- Deliverable: migration 0010 — fn_drain_outbox_batch + outbox.dispatch cron (every minute).
  Edge Function: supabase/functions/outbox-dispatcher/index.ts (thin wrapper, { drained, took_ms }).
- pgTAP: 451/451. Roundtrip: all 10 migrations clean.
- ADR-0018 filed: outbox every-minute vs arch "every 2s"; v1.1 = Database Webhook rewrite.
- ISSUE-0004 filed: outbox_event 7-day cleanup, low, Stage 14 deadline.

**X1 privilege pattern (durable — Stage 10):**
fn_drain_outbox_batch proacl = "postgres=X/postgres, service_role=X/postgres".
Supabase did NOT auto-grant EXECUTE to PUBLIC on LANGUAGE plpgsql (non-SECURITY DEFINER).
Triple REVOKE idempotent. GRANT TO service_role required for Edge Function RPC path.
Pattern going forward: cron-only functions (no RPC callers) need no GRANT; functions with
an Edge Function RPC caller need explicit GRANT TO service_role.

**ISSUE-0004 (open, low):** outbox_event 7-day cleanup. Stage 14 close. Add pg_cron job
`outbox.cleanup` DELETE WHERE processed_at < now() - interval '7 days'.

**Pre-existing partition RLS advisory:**
intelligence_audit_log_default + learning_event_default reported RLS-disabled by supabase db query.
These are pg_partman default partitions (Stage 5/6). Application code routes through parent tables
(RLS-enabled). Not a Stage 10 issue. Note for Stage 11+ if partition RLS becomes relevant.

**Stage 15+ pipeline_event forward-flag:**
Pipeline worker creates pipeline_event rows when consuming pipeline.run_sync jobs per arch §5.1.

**DEV-20260430-1:** ongoing, resolves Stage 15.
**DEV-20260503-2:** ongoing, resolves v1.1 (content.recalibration stub).

**cron.schedule() pattern (ADR-0017):** Stage 9 onwards uses cron.schedule() / cron.unschedule()
public API. Avoid direct INSERT into cron.job.

**realtime.subscription conflict (Stage 8):** Always add relnamespace filter to pg_class queries;
schemaname filter to pg_policies queries.

**Supabase remote project:** https://tohmshcpdhcdfsubvnok.supabase.co (ap-southeast-2)
