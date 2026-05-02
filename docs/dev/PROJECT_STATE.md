# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 4 — Migration 0003 — Assessment Configuration (2026-05-02)
- Next stage: Stage 5 — Migration 0004 — Sessions + Canonical Events
- Days remaining (target 75): 71
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3

## Test suite

| Suite        | Status   | Count     | Last run   |
| ------------ | -------- | --------- | ---------- |
| Unit         | ✅ green  | 0 (pass-with-no-tests) | 2026-05-02 |
| Integration  | n/a      | n/a       | n/a        |
| pgTAP        | ✅ green  | 145/145   | 2026-05-02 |
| Contract     | n/a      | n/a       | n/a        |
| RLS          | ✅ green  | 145/145 (21 tables) | 2026-05-02 |
| E2E          | n/a      | n/a       | n/a        |

## Quality gates

| Gate            | Last status | Last run   |
| --------------- | ----------- | ---------- |
| pnpm lint       | ✅ green (18/18, cached) | 2026-05-02 |
| pnpm typecheck  | ✅ green (18/18, cached) | 2026-05-02 |
| pnpm test       | ✅ green (18/18, cached) | 2026-05-02 |
| pnpm build      | ✅ green (cached from Stage 1) | 2026-04-30 |
| RLS coverage    | ✅ 21/21 tables enabled + tested | 2026-05-02 |
| pnpm audit      | unknown — TODO measure | n/a |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95 |
| --------------------------------- | ---------- | ------------ |
| POST /sessions/{id}/respond       | 300 ms     | n/a          |
| POST /sessions/{id}/submit + sync | 5000 ms    | n/a          |
| Pipeline async                    | 30000 ms   | n/a          |
| Dashboard load                    | 2000 ms    | n/a          |

## Open items

- ADRs accepted: 9 (ADR-0001 through ADR-0009)
- ADRs proposed: 0
- Issues critical / high / medium / low: 0/0/1/0
- Open questions: 0
- Open bugs: 0
- Deviations logged: 1 (DEV-20260430-1)

## Notes for next session

- Stage 5 is Migration 0004 — Sessions + Canonical Events per DEV_PLAN.md §2 Stage 5.
- Stage 5 is a schema/policy stage → must run §2A pre-implementation review before C-C-D-V.
- Stage 5 risk: **High** — `create_session_response_atomic` is the heart of the system.
  Budget extra test time. Use SQL-level isolation tests, not application-level mocks.
- Stage 5 deliverables: session_record (optimistic lock), session_response (immutable),
  response_telemetry, session_checkpoint, learning_event, api_idempotency_key, outbox_event;
  create_session_response_atomic function; RLS Patterns A, B, G.
- **ISSUE-0001 (Node CI upgrade)**: `.github/workflows/ci.yml` must bump `node-version` from
  `'20'` to `'22'` LTS before GitHub Actions deprecation hard-deadline 2026-06-02. Due: Stage 5
  audit day.
- **Stage 5 forward-flag**: Stage 5 must extend UTA-table RLS policies (tenant, user_profile,
  parent_student_link, class_group, class_student, feature_flag) with per-role SELECT granularity.
  ADR-0004 documents the decision.
- **Stage 14 forward-flag (pathway.required_feature_key convention)**: Stage 14 seeders must
  populate pathway.required_feature_key for every pathway including free-tier. Recommended
  convention: pathway.feature.<exam_family>.<program> (e.g., pathway.feature.naplan.numeracy_y5)
  for paid pathways; reserved value 'pathway.feature.public' for free-tier pathways. Stage 19
  assessment-svc entitlement check treats 'public' as always-granted. Stage 14 to confirm or
  revise. No CHECK constraint added in Migration 0003 — convention can evolve through Stage 14.
- **ADR-0009 table-classification heuristic (Stages 5–10)**: A table is platform-catalog
  (platform_admin write only) if it has no tenant_id column — same row read identically by
  every tenant. A table is tenant-scoped (auth_tenant_id() isolation pattern) if it has
  tenant_id. See ADR-0009 Follow-ups for canonical examples.
- **ADR-0007 correction**: G4 guard requires IF+EXECUTE pattern for forward-compat checks.
- **ADR-0008 corrections**: double REVOKE for SECURITY DEFINER functions; throws_like for
  message checks; has_function_privilege() for permission-denied assertions.
- **pgTAP JWT claims role simulation (new in Stage 4)**:
  `set_config('request.jwt.claims', '{"sub":"...","app_metadata":{"role":"ROLE","tenant_id":"..."}}', true)` before `SET ROLE authenticated`. auth_role() reads `-> 'app_metadata' ->> 'role'` (nested, not top-level).
- Supabase project: https://tohmshcpdhcdfsubvnok.supabase.co (ap-southeast-2).
- pgTAP patterns established in Stages 2–4 (skeleton not needed in §2A unless NEW pattern):
  - SELECT isolation: `SET ROLE authenticated; SELECT set_config(...); SELECT is(COUNT(*)::int, ...)`
  - DML deny (silent): `WITH x AS (UPDATE/DELETE ... RETURNING 1) SELECT is(..., 0, ...)`
  - DML deny (raises INSERT): `SELECT throws_like(sql, '%row-level security%', description)`
  - Trigger sentinel: insert with `updated_at = '2000-01-01'`; assert `> '2000-01-01'` after UPDATE
  - Function raises (no code check): `SELECT throws_like(sql, '%ERROR_KEY%', description)`
  - Function raises (code check): `SELECT throws_ok(sql, 'PCODE', description)` [3-arg: code + no-msg]
  - Publish success: `SELECT lives_ok($$SELECT fn()$$, description)`
  - Permission check (no-execute): `NOT has_function_privilege('role', 'public.fn(argtype)', 'execute')`
  - G4 guard stub: `CREATE TABLE stub (id uuid); INSERT ...; throws_like; DELETE; lives_ok`
  - JWT claims role simulation: `set_config('request.jwt.claims', '{"sub":"...","app_metadata":{"role":"ROLE","tenant_id":"..."}}', true); SET ROLE authenticated;`
