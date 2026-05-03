# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 11 — packages/types + Zod Schemas (2026-05-03)
- Next stage: Stage 12 — SDK + API Client (packages/sdk)
- Days remaining (target 75): 64
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3

## Test suite

| Suite        | Status   | Count     | Last run   |
| ------------ | -------- | --------- | ---------- |
| Unit         | ✅ green  | 97/97     | 2026-05-03 |
| Integration  | n/a      | n/a       | n/a        |
| pgTAP        | ✅ green  | 451/451   | 2026-05-03 |
| Contract     | n/a      | n/a       | n/a        |
| RLS          | ✅ green  | 451/451 (53 tables) | 2026-05-03 |
| E2E          | n/a      | n/a       | n/a        |

## Quality gates

| Gate            | Last status | Last run   |
| --------------- | ----------- | ---------- |
| pnpm lint       | ✅ green (6/6) | 2026-05-03 |
| pnpm typecheck  | ✅ green (6/6) | 2026-05-03 |
| pnpm test       | ✅ green (97/97 unit) | 2026-05-03 |
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

**Stage 11 complete (2026-05-03):**
- packages/types fully populated: 13 source files, 12 domain files + shared + index.
- 10 branded ID types (unique symbol pattern, X2). 16 DB enum schemas (X1 parity, migration 0001
  line citations). ErrorCode (15 codes, arch §1.5). SCHEMA_VERSION '1.0.0' (X4, Stage 12 SDK).
- ProficiencyMapDTO added (4-band MasteryBand: novice/developing/proficient/mastered) — arch §6 gap.
  Distinct from SkillProgressDTO.status which is 5-band per §6.4. No ADR needed (pre-approved Q2).
- 97/97 unit tests: X1 enum parity (16 enums hardcoded + migration citations), X3 schema registry
  (all *Schema exports are ZodType instances), parse/safeParse smoke tests per domain.
- Import graph (DAG, no cycles): orchestration ← intelligence ← analytics; content ← session.
- zod@3.25.76 installed as production dep of @mm/types (was missing before Stage 11).
- Commit: 6536bdc

**Stage 12 entry note:**
- packages/sdk needs SCHEMA_VERSION from @mm/types to attach as X-Client-Version header.
- `import { CreateSessionResponseSchema } from '@mm/types'` verified working (typecheck green).
- No new ADRs in Stage 11.

**ISSUE-0004 (open, low):** outbox_event 7-day cleanup. Stage 14 close. Add pg_cron job
`outbox.cleanup` DELETE WHERE processed_at < now() - interval '7 days'.

**Pre-existing partition RLS advisory:**
intelligence_audit_log_default + learning_event_default reported RLS-disabled by supabase db query.
These are pg_partman default partitions (Stage 5/6). Application code routes through parent tables
(RLS-enabled). Not a Stage 11 issue.

**DEV-20260430-1:** ongoing, resolves Stage 15.
**DEV-20260503-2:** ongoing, resolves v1.1 (content.recalibration stub).

**cron.schedule() pattern (ADR-0017):** Stage 9 onwards uses cron.schedule() / cron.unschedule()
public API. Avoid direct INSERT into cron.job.

**Supabase remote project:** https://tohmshcpdhcdfsubvnok.supabase.co (ap-southeast-2)
