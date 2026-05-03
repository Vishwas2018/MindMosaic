# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 9 — Migration 0008 — pg_cron Setup (2026-05-03)
- Current: Stage 10 audit tasks complete; Outbox Dispatcher deliverable in progress
- Next stage after Stage 10: Stage 11 — packages/types + Zod Schemas
- Days remaining (target 75): 66
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3

## Test suite

| Suite        | Status   | Count     | Last run   |
| ------------ | -------- | --------- | ---------- |
| Unit         | ✅ green  | 0 (pass-with-no-tests) | 2026-05-03 |
| Integration  | n/a      | n/a       | n/a        |
| pgTAP        | ✅ green  | 440/440   | 2026-05-03 |
| Contract     | n/a      | n/a       | n/a        |
| RLS          | ✅ green  | 440/440 (53 tables) | 2026-05-03 |
| E2E          | n/a      | n/a       | n/a        |

## Quality gates

| Gate            | Last status | Last run   |
| --------------- | ----------- | ---------- |
| pnpm lint       | ✅ green (18/18, cached) | 2026-05-03 |
| pnpm typecheck  | ✅ green (18/18, cached) | 2026-05-03 |
| pnpm test       | ✅ green (18/18, cached) | 2026-05-03 |
| pnpm build      | ✅ green (cached from Stage 1) | 2026-04-30 |
| RLS coverage    | ✅ 53/53 tables enabled + tested | 2026-05-03 |
| pnpm audit      | unknown — TODO measure | n/a |
| pnpm test:migration | ✅ green (roundtrip up→down→up) | 2026-05-03 |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95 |
| --------------------------------- | ---------- | ------------ |
| POST /sessions/{id}/respond       | 300 ms     | n/a          |
| POST /sessions/{id}/submit + sync | 5000 ms    | n/a          |
| Pipeline async                    | 30000 ms   | n/a          |
| Dashboard load                    | 2000 ms    | n/a          |

## Open items

- ADRs accepted: 17 (ADR-0001 through ADR-0017)
- ADRs proposed: 0
- Issues critical / high / medium / low: 0/0/0/0
- Open questions: 0
- Open bugs: 0
- Deviations logged: 2 (DEV-20260430-1 ongoing Stage 15; DEV-20260503-2 ongoing v1.1)

## Notes for next session

**Stage 10 audit tasks complete (2026-05-03):**
- ISSUE-0002 closed: migration 0009 triple-REVOKE retrofit, 440/440 pgTAP (commit 75ac299)
- ISSUE-0003 closed: GHA actions @v4 → @v5 (commit 9eb2f4b), ahead of 2026-06-02 deadline
- DEV_PLAN.md Stage 9 corrected: cron.schedule() API + content.recalibration stub noted
- All deviations reviewed; DEV-20260430-1 and DEV-20260503-2 still ongoing as expected
- Quality gates: all green (440/440 pgTAP, 18/18 turbo cached)
- Phase buffer: 0/3 consumed; 10 stages through audit tasks; Outbox Dispatcher in progress

**Outbox Dispatcher (Stage 10 deliverable, in progress):**
See DAILY_LOG Stage 10 entry after deliverable complete.

**Triple-REVOKE A1 canonical — fully remediated (Stage 10 audit):**
All SECURITY DEFINER helpers now comply: Stage 2/3 retrofitted via migration 0009.
Stage 8+ helpers used correct pattern from creation. No remaining ISSUE on this topic.

**pgTAP retrofit pattern (established Stage 10):**
Security permission retrofits get a standalone test file (009_security_definer_retrofit.sql).
Do not modify existing test file plan counts for retrofits.

**DEV-20260430-1:** ongoing, resolves Stage 15.
**DEV-20260503-2:** ongoing, resolves v1.1 (content.recalibration stub).

**cron.schedule() pattern (ADR-0017):** Stage 9 onwards uses cron.schedule() / cron.unschedule()
public API. Avoid direct INSERT into cron.job.

**LANGUAGE sql function ordering:** Functions referencing tables in same migration must be
defined AFTER those tables.

**realtime.subscription conflict (Stage 8):** Always add relnamespace filter to pg_class queries;
schemaname filter to pg_policies queries.

**Supabase remote project:** https://tohmshcpdhcdfsubvnok.supabase.co (ap-southeast-2)
