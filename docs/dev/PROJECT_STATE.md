# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 26 — Phase 1 audit / load-test / CI strip (2026-05-16)
- Next stage: Stage 27 — (refer DEV_PLAN.md)
- Days remaining (target 75): 42
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 stages closed: 15–26 (12 stages). Phase 1 buffer at Stage 26 close: **+2 days banked** (unchanged from Stage 25 — Stage 26 closed within its 2-day budget).

## Test suite

| Suite       | Status   | Count               | Last run   |
| ----------- | -------- | ------------------- | ---------- |
| Unit        | ✅ green  | 399/399             | 2026-05-16 |
| Integration | n/a      | n/a                 | n/a        |
| pgTAP       | ✅ green  | 451/451             | 2026-05-03 |
| Contract    | ✅ green  | 82/82               | 2026-05-16 |
| RLS         | ✅ green  | 451/451 (53 tables) | 2026-05-03 |
| E2E         | ⚠ opt-in | 5 specs (gated)     | n/a        |
| Replay      | ✅ green  | 58/58 assertions    | 2026-05-16 |

Unit + contract breakdown: 97 (@mm/types) + **32** (@mm/sdk: **18** client [+5 ADR-0026 lock-token tests] + 10 keys + 4 hooks) + 67 (@mm/ui) + 110 (@mm/engines) + 24 (@mm/content-svc) + 30 (@mm/assessment-svc) + 28 (@mm/intelligence-svc) + 11 (@mm/web) = **399 total** (+5 from Stage 26 ADR-0026 tests).

Contract count = 24 (content-svc) + 30 (assessment-svc) + 28 (intelligence-svc) = 82 (unchanged — no new contract tests added in Stage 26 beyond the 5 SDK header tests which are unit tests, not contract tests).

Replay harness: `scripts/test-scoring.ts` — 50 LinearEngine sessions (5 patterns × 10 replays), 58 assertions, <1 s runtime. `pnpm test:replay`.

pgTAP/RLS not re-run for Stage 26 — no schema changes. Pre-deploy gate from Stages 19+20 still applies.

## Quality gates

| Gate                | Last status                              | Last run   |
| ------------------- | ---------------------------------------- | ---------- |
| pnpm lint           | ✅ green (7 packages)                    | 2026-05-16 |
| pnpm typecheck      | ✅ green (10 packages)                   | 2026-05-16 |
| pnpm test           | ✅ green (399/399 unit + contract)       | 2026-05-16 |
| pnpm test:replay    | ✅ green (58/58 assertions)              | 2026-05-16 |
| pnpm build          | n/a (no app changes in Stage 26)         | 2026-05-15 |
| RLS coverage        | ✅ 53/53 tables enabled + tested         | 2026-05-03 |
| pnpm audit          | unknown — TODO measure                   | n/a        |
| pnpm test:migration | ⚠ NOT RUN for 0012 + 0013 (sandbox no Docker) | 2026-05-03 (last clean: 11 migrations) |

Turborepo coverage-output warning **resolved** at Stage 26 (D3: `turbo.json` `outputs: []`).

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95                        |
| --------------------------------- | ---------- | ----------------------------------- |
| POST /sessions/{id}/respond       | 300 ms     | n/a — measurement requires deployed environment |
| POST /sessions/{id}/submit + sync | 5000 ms    | n/a — measurement requires deployed environment |
| Pipeline async                    | 30000 ms   | n/a — measurement requires deployed environment |
| Dashboard load                    | 2000 ms    | n/a — measurement requires deployed environment |

k6 load test (`k6/session-loop.js`) is ready for execution; nightly CI workflow (`.github/workflows/load-test.yml`) will run when `LOAD_TEST_BASE_URL` + `LOAD_TEST_TOKEN` secrets are configured post-deploy.

## Open items

- ADRs accepted: **30** (ADR-0001 through ADR-0030; no new ADRs in Stages 24–26)
- ADRs proposed: 0
- Issues critical / high / medium / low: **0/0/4/0**
  - Medium (4): ISSUE-0006 (intelligence-svc L3a bypasses skill-graph cache), ISSUE-0009 (IndexedDB + SW shell-cache v1.1 upgrade), ISSUE-0010 (adaptive section-boundary banner + DTO field), ISSUE-0011 (deferred content blocks: Results screen 5 stubs (a–e) + Dashboard mastery snapshot (f))
  - **Resolved at Stage 26:** ISSUE-0005 (env hygiene), ISSUE-0007 (SDK X-Session-Lock), ISSUE-0008 (error-code reconciliation)
- Open questions: 0
- Open bugs: 0
- Deviations logged: 4 (DEV-20260430-1 resolved Stage 15; DEV-20260503-2 ongoing v1.1; DEV-20260511-1 resolved 2026-05-12; DEV-20260515-1 self-resolved Stage 25)

## Notes for next session

Stage 27. Refer `DEV_PLAN.md` Stage 27 for deliverables.

Pre-deploy gate still pending: migrations 0012 + 0013 + RLS must be run locally before any deploy (sandbox lacks Docker).
