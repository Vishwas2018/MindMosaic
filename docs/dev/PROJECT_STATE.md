# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 32 — Intelligence + Analytics Endpoints Complete (2026-05-22)
- Next stage: Stage 33 — Assignments Service (Days 46–47, 2-day budget)
- Days remaining (target 75): 30 (Day 45 of 75 complete)
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 complete: Stages 15–27 (13 stages). Phase 1 buffer at close: **+2 days banked**.
- Phase 2 in progress: Stages 28–32 all shipped within 1-day budget. **+2 days net banked entering Stage 33** (no buffer impact from Stages 28–32).

## Test suite

| Suite       | Status   | Count                         | Last run   |
| ----------- | -------- | ----------------------------- | ---------- |
| Unit        | ✅ green  | 467 passed / 1 skipped        | 2026-05-22 |
| Integration | n/a      | n/a                           | n/a        |
| pgTAP       | ✅ green  | 451/451                       | 2026-05-03 |
| Contract    | ✅ green  | 144/144                       | 2026-05-22 |
| RLS         | ✅ green  | 451/451 (53 tables)           | 2026-05-03 |
| E2E         | ⚠ opt-in | 5 specs (gated)               | n/a        |
| Replay      | ✅ green  | 58/58 assertions              | 2026-05-16 |

Unit + contract breakdown (full `pnpm -r run test` output):
98 (@mm/types) + 32 (@mm/sdk) + 67 (@mm/ui) + 115 (@mm/engines) + 24 (content-svc) + 30 (assessment-svc) + 53 (intelligence-svc) + 6 (jobs-worker) + 22 (analytics-svc) + 9 (orchestration-svc) + 11 (apps/web) = **467 passed, 1 skipped**

Stage 32 adds +20: +10 intelligence-svc (53, was 43) + +10 analytics-svc (22, was 12).

Contract count = 24 (content-svc) + 30 (assessment-svc) + 53 (intelligence-svc) + 6 (jobs-worker) + 22 (analytics-svc) + 9 (orchestration-svc) = **144** (was 124 at Stage 31 close).

pgTAP/RLS not re-run for Stages 28–32 — no new migrations, no RLS policy changes.

## Quality gates

| Gate                | Last status                                                     | Last run   |
| ------------------- | --------------------------------------------------------------- | ---------- |
| pnpm lint           | ✅ green (13 packages)                                          | 2026-05-22 |
| pnpm typecheck      | ✅ green (13 packages)                                          | 2026-05-22 |
| pnpm test           | ✅ green (467 passed / 1 skipped — full output captured)        | 2026-05-22 |
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

- ADRs accepted: **33** (ADR-0001 through ADR-0033)
- ADRs proposed: 0
- Workspaces: **13** (orchestration-svc added at Stage 31; no new workspace at Stage 32)
- Issues critical / high / medium / low: **0/0/5/8**
  - Medium (5): ISSUE-0009 (IndexedDB + SW shell-cache v1.1 upgrade — DEV_PLAN §5 P1.6), ISSUE-0010 (adaptive section-boundary banner + DTO field — DEV_PLAN §5 P1.7), ISSUE-0011 (deferred content blocks: Results screen 5 stubs (a–e) + Dashboard mastery snapshot (f) — DEV_PLAN §5 P2.10), ISSUE-0014 (exam_date column + UI ingress — v1.1), ISSUE-0021 (auto-groups route shape query-vs-path-param arch drift — v1.1)
  - Low (8): ISSUE-0013 (evening ritual test count methodology — fix applied from Stage 29), ISSUE-0015 (cohort_metric_cache category mismatch — v1.1), ISSUE-0016 (async_pipeline_event + analytics_audit_log observability parity — v1.1), ISSUE-0017 (high-fatigue alert deferred — v1.1), ISSUE-0018 (INTELLIGENCE_SVC_URL + ANALYTICS_SVC_URL + ORCHESTRATION_SVC_URL undocumented in env.example/deployment docs), ISSUE-0019 (tooling guard: amend-over-pushed-commit pattern), ISSUE-0020 (POST /orchestration/generate-plan synchronous in v1; async deferred — v1.1), ISSUE-0022 (audit-log cursor pagination deferred to v1.1)
  - **Resolved at Stage 28:** ISSUE-0006
  - **Resolved at Stage 26:** ISSUE-0005, ISSUE-0007, ISSUE-0008
  - **Resolved at Stage 25 audit:** ISSUE-0012
- Open questions: 0 (Q-32.1–Q-32.7 all resolved)
- Open bugs: 0
- Deviations logged: 7 (2 resolved, 5 open)
  - DEV-20260430-1 resolved Stage 15
  - DEV-20260503-2 ongoing v1.1 (content.recalibration no-op)
  - DEV-20260511-1 resolved Stage 22b
  - DEV-20260515-1 self-resolved Stage 25
  - DEV-20260518-1 ongoing — spec §5.1.4 student parameter defect
  - DEV-20260519-1 ongoing — exam_date column deferred; §12.1 projection branch null until v1.1
  - DEV-20260522-1 ongoing v1.1 — auto-groups query-vs-path-param (Stage 37 fix)
  - DEV-20260522-2 resolved Stage 32 — generate-assignment C-C-D-V gate placement error; corrected in same commit

## Notes for next session

Stage 33 — Assignments Service (Days 46–47, 2-day budget; first 2-day Phase 2 stage). Likely new workspace `assignments-svc` per OWNERS.md. Pre-read MUST verify spec section number (T1 — DEV_PLAN says §X; read spec TOC before assuming). Stage 32 prep lesson: walk route auth model when placing endpoints; do not paste-merge gate boilerplate without checking handler auth type.

**Operator decision required at Stage 33 morning ritual (before implementation begins):** T3 hybrid Option 3 — operator round-trip REQUIRED for Qs touching DTO shape / scope / schema / auth model; self-resolve PERMITTED for tight implementation details (thresholds, filter inclusivity) with documented options + default. Alternatives: Option 1 (all mid-impl Qs pause), Option 2 (current T2-equivalent pattern is the rule). Default if undecided = Option 3.

Pre-deploy gate still pending: migrations 0012 + 0013 + 0014 + RLS must be run locally before any deploy (sandbox lacks Docker).

Phase 1 Exit Report at `docs/dev/phase-1-exit-report.md`. Git tag `v1-phase-1` created locally; **push pending approval** — run `git push origin v1-phase-1` when ready.

Q-28.8 deferral: `SkillGraphCache.adjacency` lacks `strength` + `dependency_class` fields (Option B applied). `// Q-28.8:` grep markers at two sites in `intelligence-svc/handlers.ts`. Address in v1.1 if content team adds enriching edges.
