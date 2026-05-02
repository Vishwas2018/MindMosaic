# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 3 — Migration 0002 — Content & Skill Graph (2026-05-02)
- Next stage: Stage 4 — Migration 0003 — Assessment Configuration
- Days remaining (target 75): 72
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3

## Test suite

| Suite        | Status   | Count     | Last run   |
| ------------ | -------- | --------- | ---------- |
| Unit         | ✅ green  | 0 (pass-with-no-tests) | 2026-05-02 |
| Integration  | n/a      | n/a       | n/a        |
| pgTAP        | ✅ green  | 105/105   | 2026-05-02 |
| Contract     | n/a      | n/a       | n/a        |
| RLS          | ✅ green  | 105/105 (16 tables) | 2026-05-02 |
| E2E          | n/a      | n/a       | n/a        |

## Quality gates

| Gate            | Last status | Last run   |
| --------------- | ----------- | ---------- |
| pnpm lint       | ✅ green (6/6 workspaces, cached) | 2026-05-02 |
| pnpm typecheck  | ✅ green (6/6 workspaces, cached) | 2026-05-02 |
| pnpm test       | ✅ green (6/6 workspaces, cached) | 2026-05-02 |
| pnpm build      | ✅ green (cached from Stage 1) | 2026-04-30 |
| RLS coverage    | ✅ 16/16 tables enabled + tested | 2026-05-02 |
| pnpm audit      | unknown — TODO measure | n/a |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95 |
| --------------------------------- | ---------- | ------------ |
| POST /sessions/{id}/respond       | 300 ms     | n/a          |
| POST /sessions/{id}/submit + sync | 5000 ms    | n/a          |
| Pipeline async                    | 30000 ms   | n/a          |
| Dashboard load                    | 2000 ms    | n/a          |

## Open items

- ADRs accepted: 8 (ADR-0001 through ADR-0008)
- ADRs proposed: 0
- Issues critical / high / medium / low: 0/0/1/0
- Open questions: 0
- Open bugs: 0
- Deviations logged: 1 (DEV-20260430-1)

## Notes for next session

- Stage 4 is Migration 0003 — Assessment Configuration per DEV_PLAN.md §2 Stage 4.
- Stage 4 is a schema/policy stage → must run §2A pre-implementation review before C-C-D-V.
- Stage 4 deliverables: framework_config, pathway, blueprint, assessment_profile, diagnostic_rule
  tables + Pattern F RLS + seed scripts for framework config + pathway records.
- **Stage 5 forward-flag**: Stage 5 must extend UTA-table RLS policies (tenant, user_profile,
  parent_student_link, class_group, class_student, feature_flag) with per-role SELECT granularity.
  ADR-0004 documents the decision. Reminder: include this in Stage 5 §2A plan under item (c).
- **ISSUE-0001 (Node CI upgrade)**: `.github/workflows/ci.yml` must bump `node-version` from
  `'20'` to `'22'` LTS before GitHub Actions deprecation hard-deadline 2026-06-02. Due: Stage 5
  audit day.
- Supabase project: https://tohmshcpdhcdfsubvnok.supabase.co (ap-southeast-2).
- **ADR-0007 correction**: G4 guard requires `IF to_regclass() IS NOT NULL THEN EXECUTE '...' END IF`
  pattern (not plain SELECT short-circuit). PL/pgSQL parses full SQL at execution time regardless
  of boolean short-circuit; EXECUTE defers parsing. Confirmed by Stage 3 pgTAP failures + fix.
- **ADR-0008 corrections applied**: 
  - publish_skill_graph requires double REVOKE (PUBLIC + authenticated) — Supabase local dev
    may apply default execute grants to authenticated.
  - Use throws_like(sql, '%pattern%', description) for message checks; throws_ok 3-arg form
    treats arg3 as errmsg not description; 4-arg with NULL arg3 crashes pgTAP in this env.
  - Use has_function_privilege() catalog check to test no-execute-grant assertion (avoids
    SET ROLE + throws_ok NULL-arg combination).
- pgTAP patterns established in Stages 2–3 (skeleton not needed in §2A unless NEW pattern):
  - SELECT isolation: `SET ROLE authenticated; SELECT set_config(...); SELECT is(COUNT(*)::int, ...)`
  - DML deny (silent): `WITH x AS (UPDATE/DELETE ... RETURNING 1) SELECT is(..., 0, ...)`
  - DML deny (raises INSERT): `SELECT throws_ok(sql, '42501', description)` [3-arg = errcode + desc]
  - Trigger sentinel: insert with `updated_at = '2000-01-01'`; assert `> '2000-01-01'` after UPDATE
  - Function raises (no code check): `SELECT throws_like(sql, '%ERROR_KEY%', description)`
  - Function raises (code check): `SELECT throws_ok(sql, 'PCODE', description)` [3-arg: code + no-msg]
  - Publish success: `SELECT lives_ok($$SELECT fn()$$, description)`
  - Permission check (no-execute): `NOT has_function_privilege('role', 'public.fn(argtype)', 'execute')`
  - G4 guard stub: `CREATE TABLE stub (id uuid); INSERT ...; throws_like; DELETE; lives_ok`
