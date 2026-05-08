# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 29 — L5 Predictive Intelligence (2026-05-19)
- Next stage: Stage 30 — L7 Teacher Intelligence (Day 43)
- Days remaining (target 75): 33
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 complete: Stages 15–27 (13 stages). Phase 1 buffer at close: **+2 days banked**.
- Phase 2 in progress: Stages 28–29 shipped within budget. **+2 days net banked entering Stage 30** (no buffer impact from Stage 28 or 29).

## Test suite

| Suite       | Status   | Count                         | Last run   |
| ----------- | -------- | ----------------------------- | ---------- |
| Unit        | ✅ green  | 421 passed / 1 skipped        | 2026-05-19 |
| Integration | n/a      | n/a                           | n/a        |
| pgTAP       | ✅ green  | 451/451                       | 2026-05-03 |
| Contract    | ✅ green  | 103/103                       | 2026-05-19 |
| RLS         | ✅ green  | 451/451 (53 tables)           | 2026-05-03 |
| E2E         | ⚠ opt-in | 5 specs (gated)               | n/a        |
| Replay      | ✅ green  | 58/58 assertions              | 2026-05-16 |

Unit + contract breakdown (full `pnpm -r run test` output — ISSUE-0013 fix applied):
98 (@mm/types) + 32 (@mm/sdk) + 67 (@mm/ui) + 110 (@mm/engines) + 24 (content-svc) + 30 (assessment-svc) + 43 (intelligence-svc) + 6 (jobs-worker) + 11 (apps/web) = **421 passed, 1 skipped** (Docker-guarded Postgres integration test in jobs-worker).

Baseline note: pre-Stage-29 baseline was **412**. Stage 29 adds +9 L5 contract tests to intelligence-svc (34 → 43).

Contract count = 24 (content-svc) + 30 (assessment-svc) + 43 (intelligence-svc) + 6 (jobs-worker) = **103** (was 94 at Stage 28 close).

pgTAP/RLS not re-run for Stage 29 — no RLS policy changes. No new migrations. Pre-deploy gate from Stages 19+20 still applies.

## Quality gates

| Gate                | Last status                                                     | Last run   |
| ------------------- | --------------------------------------------------------------- | ---------- |
| pnpm lint           | ✅ green (7 packages)                                           | 2026-05-19 |
| pnpm typecheck      | ✅ green (11 packages)                                          | 2026-05-19 |
| pnpm test           | ✅ green (421 passed / 1 skipped — full output captured)        | 2026-05-19 |
| pnpm test:replay    | ✅ green (58/58 assertions)                                     | 2026-05-16 |
| pnpm build          | ✅ green (7/7 packages)                                         | 2026-05-18 |
| RLS coverage        | ✅ 53/53 tables enabled + tested                                | 2026-05-03 |
| pnpm audit          | unknown — TODO measure                                          | n/a        |
| pnpm test:migration | ⚠ NOT RUN for 0012 + 0013 + 0014 (sandbox no Docker)           | 2026-05-03 (last clean: 11 migrations) |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95                                        |
| --------------------------------- | ---------- | --------------------------------------------------- |
| POST /sessions/{id}/respond       | 300 ms     | n/a — measurement requires deployed environment    |
| POST /sessions/{id}/submit + sync | 5000 ms    | n/a — measurement requires deployed environment    |
| Pipeline async                    | 30000 ms   | n/a — measurement requires deployed environment    |
| Dashboard load                    | 2000 ms    | n/a — measurement requires deployed environment    |

k6 load test (`k6/session-loop.js`) is ready for execution; nightly CI workflow (`.github/workflows/load-test.yml`) will run when `LOAD_TEST_BASE_URL` + `LOAD_TEST_TOKEN` secrets are configured post-deploy.

## Open items

- ADRs accepted: **32** (ADR-0001 through ADR-0032)
- ADRs proposed: 0
- Issues critical / high / medium / low: **0/0/4/3**
  - Medium (4): ISSUE-0009 (IndexedDB + SW shell-cache v1.1 upgrade — DEV_PLAN §5 P1.6), ISSUE-0010 (adaptive section-boundary banner + DTO field — DEV_PLAN §5 P1.7), ISSUE-0011 (deferred content blocks: Results screen 5 stubs (a–e) + Dashboard mastery snapshot (f) — DEV_PLAN §5 P2.10), ISSUE-0014 (exam_date column + UI ingress — v1.1)
  - Low (3): ISSUE-0013 (evening ritual test count methodology — fix applied from Stage 29), ISSUE-0015 (cohort_metric_cache category mismatch — v1.1), ISSUE-0016 (async_pipeline_event for L5/L7/L9 observability parity post ADR-0032 — v1.1)
  - **Resolved at Stage 28:** ISSUE-0006 (L3a now uses skill-graph-cache via getSkillGraph())
  - **Resolved at Stage 26:** ISSUE-0005, ISSUE-0007, ISSUE-0008
  - **Resolved at Stage 25 audit:** ISSUE-0012
- Open questions: 0
- Open bugs: 0
- Deviations logged: 6
  - DEV-20260430-1 resolved Stage 15
  - DEV-20260503-2 ongoing v1.1
  - DEV-20260511-1 resolved Stage 22b
  - DEV-20260515-1 self-resolved Stage 25
  - DEV-20260518-1 ongoing — spec §5.1.4 student parameter defect, post-launch spec amendment
  - DEV-20260519-1 ongoing — exam_date column deferred; §12.1 projection branch returns null until v1.1

## Notes for next session

Stage 30 — L7 Teacher Intelligence (Day 43). Read DEV_PLAN Stage 30 + Spec §13 + arch §4.6 first; surface Q-30.* before coding.

Pre-deploy gate still pending: migrations 0012 + 0013 + 0014 + RLS must be run locally before any deploy (sandbox lacks Docker).

Phase 1 Exit Report at `docs/dev/phase-1-exit-report.md`. Git tag `v1-phase-1` created locally; **push pending approval** — run `git push origin v1-phase-1` when ready.

Q-28.8 deferral: `SkillGraphCache.adjacency` lacks `strength` + `dependency_class` fields (Option B applied). `// Q-28.8:` grep markers at two sites in `intelligence-svc/handlers.ts`. Address in v1.1 if content team adds enriching edges.
