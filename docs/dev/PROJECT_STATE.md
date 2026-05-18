# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: v1.1-S4 — Teacher Exam Authoring UI (2026-05-18)
- Next stage: v1.1-S5 — Student Practice + Simulation Flows
- v1 build window: **CLOSED** — 49/49 stages (Days 1–65 of 75; 10 days banked unused)
- Active branch: `v1.1/exam-content` — 13 commits ahead of origin/main (9376d98 v1.0.0): a7a43d0 v1.1-S1 prep · e76dbfc v1.1-S1 impl · c4c868e v1.1-S1 chore · 3c1afe0 v1.1-S2 prep · 0bdd43b v1.1-S2 impl · f72a7a8 v1.1-S2 chore · ac36e80 ISSUE-0037 remediation · 560e2d2 v1.1-S3 prep · 96b19b5 v1.1-S3 impl · ca9c670 v1.1-S3 chore · 2faeb65 v1.1-S4 prep · b8b8290 v1.1-S4 impl · this chore
- Buffer days consumed total: ~16.5 of 26 allocated (DEV_PLAN §3.1) — v1.1 unbudgeted
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
- Stage 49 actual: 1 day (budget: 2 days per DEV_PLAN). **Buffer at v1 close: +10.5 days banked (net unchanged)**.
- v1.1-S1 actual: ~1 day (v1.1 stages unbudgeted in DEV_PLAN).
- v1.1-S2 actual: ~1 day (v1.1 stages unbudgeted in DEV_PLAN).
- v1.1-S3 actual: ~1 day (v1.1 stages unbudgeted in DEV_PLAN).
- v1.1-S4 actual: ~1 day (v1.1 stages unbudgeted in DEV_PLAN).
- Stages closed: **v1: 49/49 closed; v1.1: 4/7 closed (S1, S2, S3, S4 complete)**

## Test suite

| Suite            | Status       | Count                                                                                              | Last run   |
| ---------------- | ------------ | -------------------------------------------------------------------------------------------------- | ---------- |
| Unit             | ✅ green      | 795 passed / 1 skipped (+ 2 Playwright test.skip-guarded via ISSUE-0038)                         | 2026-05-18 |
| Integration      | n/a          | n/a                                                                                                | n/a        |
| pgTAP            | ✅ green      | 451/451 (migrations 0001–0020); 0021 + 0022 SQL files on disk (deferred-validation)               | 2026-06-07 |
| Contract         | ✅ green      | included in 795 Vitest total                                                                       | 2026-05-18 |
| E2E (Vitest)     | ✅ green      | 1/1 (assignments-svc lifecycle)                                                                    | 2026-05-23 |
| E2E (Playwright) | ⚠ opt-in     | 12 specs / 17 tests (gated; all test.skip-guarded; ISSUE-0035, ISSUE-0038)                        | n/a        |
| RLS              | ✅ green      | 451/451 (53 tables; pgTAP 0001–0020 covers all); 0021 + 0022 deferred-validation                  | 2026-06-07 |
| Replay           | ✅ green      | 58/58 assertions + 100 billing-svc replay assertions (2-pass 50-event)                            | 2026-06-01 |
| axe-core         | ✅ green      | 31 test files / 75 assertions — no regressions (Stage 48 sweep)                                  | 2026-06-07 |

Unit + contract breakdown (full `pnpm -r run test` output 2026-05-18 v1.1-S4 close):
155 (@mm/types) + 58 (@mm/sdk) + 75 (@mm/ui) + 118 (@mm/engines) + 9 (@mm/core) + 60 (content-svc) + 43 (assessment-svc) + 53 (intelligence-svc) + 6 (jobs-worker) + 31 (analytics-svc) + 19 (orchestration-svc) + 25 (assignments-svc incl. e2e) + 17 (notifications-svc) + 7 (users-svc) + 60 (apps/web) + 59 (billing-svc) = **795 passed, 1 skipped** (796 total).

Delta from v1.1-S3 close (770 passed): **+25** — 13 @mm/types (ExamContentFormValues + composer/simulation type schema tests) + 5 assignments-svc (composer_params + simulation_params handler contract tests) + 2 @mm/sdk (assignments hook tests) + 5 apps/web net (exam-content-copy.test.ts; 12 authored incl. 2 axe-core Playwright tests in ISSUE-0038).

Delta from v1.0.0 baseline (696/697): +99 total since v1.0.0 (+33 v1.1-S1 + +24 v1.1-S2 + +17 v1.1-S3 + +25 v1.1-S4).

## Quality gates

| Gate                | Last status                                                                        | Last run   |
| ------------------- | ---------------------------------------------------------------------------------- | ---------- |
| pnpm lint           | ✅ green (17 packages)                                                             | 2026-05-18 |
| pnpm typecheck      | ✅ green (17 packages, 0 turbo-cached — --force run per §Close-ritual)            | 2026-05-18 |
| pnpm test           | ✅ green (795 passed / 1 skipped — 796 total Vitest)                              | 2026-05-18 |
| pnpm test:replay    | ✅ green (58/58 assertions)                                                        | 2026-05-16 |
| pnpm build          | ✅ green (exit 0, 21 routes)                                                       | 2026-05-11 |
| RLS coverage        | ✅ 53/53 tables enabled + tested (pgTAP 0001–0020 451/451); 0021 + 0022 deferred  | 2026-06-07 |
| pnpm audit          | ⚠ 18 findings (0 critical, 6 high, 10 moderate, 2 low) — all v1.1 track          | 2026-06-07 |
| pnpm test:migration | ✅ 451/451 — covers migrations 0001–0020                                          | 2026-06-07 |

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

- ADRs accepted: **38** (ADR-0001 through ADR-0038; ADR-0038 accepted at v1.1-S4 impl close b8b8290 with §Decision 4 amendment)
- ADRs proposed: 0
- Workspaces: **17** — unchanged
- Issues critical / high / medium / low: **0 / 0 / 8 / 15**
  - Medium (8): ISSUE-0009, ISSUE-0010, ISSUE-0011, ISSUE-0014, ISSUE-0021, ISSUE-0023, ISSUE-0027, ISSUE-0030
  - Low (15): ISSUE-0015, ISSUE-0016, ISSUE-0017, ISSUE-0019, ISSUE-0020, ISSUE-0022, ISSUE-0024, ISSUE-0025, ISSUE-0028, ISSUE-0031, ISSUE-0032, ISSUE-0033, ISSUE-0034, ISSUE-0035, ISSUE-0038 (info)
  - Resolved: ISSUE-0005, 0006, 0007, 0008, 0012, 0013, 0018, 0026, 0029, 0036, 0037
- Migrations: **0001–0022** (migrations 0001–0020 pgTAP-verified 451/451; 0021 SQL on disk deferred-validation; 0022 adds composer_params + simulation_params jsonb nullable columns to assignment table — deferred-validation per 0021 pattern)
- Open questions: **0** — Q-1.1-1.0..9 + Q-1.1-2.1..5 + Q-1.1-3.1..5 + Q-1.1-4.1..8 all resolved
- Open bugs: 0
- Deviations logged: **24 total (9 resolved, 15 open)** — unchanged from v1.1-S3 close (no new deviations in S4; DEV-20260515-2 honored)
  - DEV-20260607-1 accepted — DEV_PLAN "47 stages" count vs delivered 49
  - DEV-20260607-2 accepted — DEV_PLAN Stage 49 "spec §4" citation error
  - DEV-20260514-1 open — v1.1 exam-content phase inserted ahead of P1.1–P1.7 (ADR-0035)
  - DEV-20260515-1 open — T3 protocol breach on Q-1.1-2.5 self-resolve (process-only, no rework)
  - DEV-20260515-2 open — atomic commit-and-push announcement process fix (tracking only; honored across S3 + S4)
  - Open carries (v1.1): DEV-20260503-2, DEV-20260519-1, DEV-20260522-1, DEV-20260523-1, DEV-20260524-1, DEV-20260526-1, DEV-20260529-1, DEV-20260530-1, DEV-20260530-2, DEV-20260604-1
- Tag state: `v1-phase-1` pushed (Stage 27). `v1-phase-2-partial` pushed (Stage 41). `v1-phase-4-partial` pushed (Stage 47). **`v1.0.0` on 9376d98 (Stage 49 close commit — push status: unknown — TODO confirm).**
- Branch: `v1.1/exam-content` HEAD = v1.1-S4 chore close commit (this); 13 commits ahead of origin/main.

## Notes for next session

**v1.1-S5 — Student Practice + Simulation Flows** is next. **SECOND UI STAGE — T5 active.**

Before any code:
- Read `docs/dev/v1.1-phase-plan.md §S5` in full.
- Read `UI_CONTRACT.md` in full — T5 mockup-driven layout sketch required for operator approval BEFORE component code. Mid-impl skeleton checkpoint at end of layout pass (before data wiring) — operator may request adjustments.
- Read `apps/web/src/app/(student)/` existing student routes for pattern parity (route structure, auth guards, breadcrumb conventions).
- S5 consumes S2 (composer API) + S3 (simulation) + S4 (assignments); read all three contracts before sketching.
- Apply §N-trap discipline at the spec read.
- Mirror T5 three-gate flow: Checkpoint A sketch → Checkpoint B skeleton → fill → push gate.
- Phase exit review at S5 close.

**Carry-forward operator follow-ups:**

- **ISSUE-0038: axe-core live run** on first preview/CI provision. Spec at `apps/web/playwright/e2e/exam-content-a11y.spec.ts`; clears when first green run lands. No code action required.

- **`.githooks/pre-commit` activation.** Once per clone: `git config core.hooksPath .githooks`. Same activation as the existing commit-msg hook. Local defense ahead of GitHub push-protection.

- **DEV-20260515-1: T3 fidelity reminder.** For future stages, classify each Q-* at impl T1 as structural-vs-tight-detail BEFORE deciding self-resolve eligibility.

- **T2-tightened gap (S4).** Q-1.1-4.6 + Q-1.1-4.7 were filed retroactively at chore close. For S5: file inline Qs in QUESTIONS.md ## Resolved in the same work session, not deferred.

**Launch-window operational verification (owner: deploy operator):**
- Run k6/session-loop.js (500 VU / 1h) + k6/billing-webhook.js against deployed env
- Run Playwright 12 specs / 17 tests against deployed Supabase (incl. ISSUE-0038 axe-core gate)
- Run scripts/validate-content.ts (requires seeded content, 50 items, 10 misconceptions)
- 24h pipeline.dead_letter.count = 0 soak
- Supabase backup + restore drill (staging project)
- Stripe test-mode invoicing + tax verification
- Log all 8 SLA measurements in docs/dev/perf/measurements.md
- Full checklist: docs/dev/stage-49-exit-report.md §9
