# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 49 — Launch Gate Review + v1.0.0 Tag (2026-06-07)
- Next: v1.1 sprint / launch-window operational verification
- v1 build window: **CLOSED** — 49/49 stages (Days 1–65 of 75; 10 days banked unused)
- Buffer days consumed total: ~15.5 of 26 allocated (DEV_PLAN §3.1)
- Phase 0 complete: Stages 1–14. Phase 0 buffer at close: 0 of 3 consumed.
- Phase 1 complete: Stages 15–27 (13 stages). Phase 1 buffer at close: **+2 days banked**.
- Phase 2 complete: Stages 28–41 (14 stages). **+5.5 days net banked entering Phase 3/4**.
- Stage 42 actual: 1 day (budget: 2 days). **Phase 4 buffer entering Stage 43: +6.5 days banked**.
- Stage 43 actual: 1 day (budget: 2 days). **Phase 4 buffer entering Stage 44: +7.5 days banked**.
- Stage 44 actual: 1 day (budget: 1 day). **Phase 4 buffer entering Stage 45: +7.5 days banked**.
- Stage 45 actual: 2 days (budget: 2 days). **Phase 4 buffer: +7.5 days banked**.
- Stage 46 actual: 1 day (budget: 1 day). **Phase 4 buffer: +7.5 days banked** (unchanged).
- Stage 47 actual: 1 day (budget: 1 day). **Phase 4 buffer: +7.5 days banked** (unchanged).
- Stage 48 actual: 1 day (budget: 4 days per DEV_PLAN). **Effective buffer entering Stage 49: +10.5 days banked**.
- Stage 49 actual: 1 day (budget: 2 days per DEV_PLAN). **Buffer at v1 close: +10.5 days banked (net unchanged; 1-day actual vs 2-day budget = +0.5 additional; effective ~+11 days of the original 26 remain unused)**.
- Stages closed: **49 of 75** (v1 build window complete; Stages 50–75 = DEV_PLAN §5 v1.1+ backlog, not active)

## Test suite

| Suite           | Status       | Count                                                              | Last run   |
| --------------- | ------------ | ------------------------------------------------------------------ | ---------- |
| Unit            | ✅ green      | 696 passed / 1 skipped (+ 4 Playwright test.skip-guarded)         | 2026-06-05 |
| Integration     | n/a          | n/a                                                                | n/a        |
| pgTAP           | ✅ green      | 451/451 (migrations 0001–0020)                                     | 2026-06-07 |
| Contract        | ✅ green      | included in 696 Vitest total                                       | 2026-06-05 |
| E2E (Vitest)    | ✅ green      | 1/1 (assignments-svc lifecycle)                                    | 2026-05-23 |
| E2E (Playwright)| ⚠ opt-in     | 11 specs / 15 tests (gated; all test.skip-guarded; ground truth confirmed Stage 48 — ISSUE-0035) | n/a |
| RLS             | ✅ green      | 451/451 (53 tables; pgTAP 0001–0020 covers all)                    | 2026-06-07 |
| Replay          | ✅ green      | 58/58 assertions + 100 billing-svc replay assertions (2-pass 50-event) | 2026-06-01 |
| axe-core        | ✅ green      | 31 test files / 75 assertions — no regressions (Stage 48 sweep)   | 2026-06-07 |

Unit + contract breakdown (full `pnpm -r run test` output 2026-06-05 Stage 46 close — unchanged at Stages 47–49):
118 (@mm/types) + 56 (@mm/sdk) + 75 (@mm/ui) + 115 (@mm/engines) + 9 (@mm/core) + 24 (content-svc) + 32 (assessment-svc) + 53 (intelligence-svc) + 6 (jobs-worker) + 31 (analytics-svc) + 19 (orchestration-svc) + 20 (assignments-svc incl. e2e) + 17 (notifications-svc) + 7 (users-svc) + 55 (apps/web) + 59 (billing-svc) = **696 passed, 1 skipped** (697 total).

## Quality gates

| Gate                | Last status                                                              | Last run   |
| ------------------- | ------------------------------------------------------------------------ | ---------- |
| pnpm lint           | ✅ green (17 packages)                                                   | 2026-06-07 |
| pnpm typecheck      | ✅ green (17 packages, 0 turbo-cached — --force run per §Close-ritual)  | 2026-06-07 |
| pnpm test           | ✅ green (696 passed / 1 skipped — 697 total Vitest)                    | 2026-06-07 |
| pnpm test:replay    | ✅ green (58/58 assertions)                                              | 2026-05-16 |
| pnpm build          | ✅ green (exit 0, 21 routes)                                             | 2026-05-11 |
| RLS coverage        | ✅ 53/53 tables enabled + tested (pgTAP 0001–0020 451/451)              | 2026-06-07 |
| pnpm audit          | ⚠ 18 findings (0 critical, 6 high, 10 moderate, 2 low) — all v1.1 track | 2026-06-07 |
| pnpm test:migration | ✅ 451/451 — covers migrations 0001–0020                                | 2026-06-07 |

## Performance vs BUILD_CONTRACT §10 budgets

All 8 SLA budgets require k6 execution against deployed environment. Deferred to launch-window operational verification.
Reference scripts: `k6/session-loop.js` (session loop) + `k6/billing-webhook.js` (billing, Stage 48).
Full table: `docs/dev/perf/measurements.md`.

| Endpoint                          | Budget p95 | Measured p95                                                 |
| --------------------------------- | ---------- | ------------------------------------------------------------ |
| Item delivery                     | 200 ms     | not measured — launch-window k6 run (requires deployed env) |
| POST /sessions/create             | 1000 ms    | not measured — launch-window k6 run (requires deployed env) |
| POST /sessions/{id}/respond       | 300 ms     | not measured — launch-window k6 run (requires deployed env) |
| POST /sessions/{id}/submit + sync | 5000 ms    | not measured — launch-window k6 run (requires deployed env) |
| Pipeline async                    | 30000 ms   | not measured — launch-window k6 run (requires deployed env) |
| Dashboard load                    | 2000 ms    | not measured — launch-window k6 run (requires deployed env) |
| Billing webhook p95               | 300 ms     | not measured — launch-window k6 run (requires deployed env) |
| Flag propagation p95              | 30 s       | not measured — launch-window k6 run (requires deployed env) |

## Open items

- ADRs accepted: **34** (ADR-0001 through ADR-0034) — unchanged Stage 49
- ADRs proposed: 0
- Workspaces: **17** — unchanged Stage 49
- Issues critical / high / medium / low: **0/0/8/14** — unchanged Stage 49
  - Medium (8): ISSUE-0009, ISSUE-0010, ISSUE-0011, ISSUE-0014, ISSUE-0021, ISSUE-0023, ISSUE-0027, ISSUE-0030
  - Low (14): ISSUE-0015, ISSUE-0016, ISSUE-0017, ISSUE-0019, ISSUE-0020, ISSUE-0022, ISSUE-0024, ISSUE-0025, ISSUE-0028, ISSUE-0031, ISSUE-0032, ISSUE-0033, ISSUE-0034, ISSUE-0035
  - Resolved at Stage 49: none (all v1.1 track)
  - Prior resolved: ISSUE-0005, 0006, 0007, 0008, 0012, 0013, 0018, 0026, 0029, 0036
- Open questions: **0**
- Open bugs: 0
- Deviations logged: **21 total (9 resolved, 12 open)** — DEV-20260607-1 + DEV-20260607-2 added Stage 49
  - DEV-20260607-1 accepted — DEV_PLAN "47 stages" count vs delivered 49
  - DEV-20260607-2 accepted — DEV_PLAN Stage 49 "spec §4" citation error
  - Open carries: DEV-20260503-2, DEV-20260519-1, DEV-20260522-1, DEV-20260523-1, DEV-20260524-1, DEV-20260526-1, DEV-20260529-1, DEV-20260530-1, DEV-20260530-2, DEV-20260604-1 (all v1.1)
- Tag state: `v1-phase-1` pushed (Stage 27/41). `v1-phase-2-partial` pushed (Stage 41). `v1-phase-4-partial` pushed (Stage 47). **`v1.0.0` created on Stage 49 close commit — push pending separate "create the tag push" approval.**

## Notes for next session

**v1 build window is closed.** Stage 49 = final stage.

**Launch-window operational verification (owner: deploy operator, not this build context):**
- Run k6/session-loop.js (500 VU / 1h) + k6/billing-webhook.js against deployed env
- Run Playwright 11 specs / 15 tests against deployed Supabase
- Run scripts/validate-content.ts (requires seeded content, 50 items, 10 misconceptions)
- 24h pipeline.dead_letter.count = 0 soak
- Supabase backup + restore drill (staging project)
- Stripe test-mode invoicing + tax verification
- Log all 8 SLA measurements in docs/dev/perf/measurements.md
- Full checklist: docs/dev/stage-49-exit-report.md §9

**v1.1 development:** DEV_PLAN §5.1 P1 backlog (see stage-49-exit-report.md §8).
