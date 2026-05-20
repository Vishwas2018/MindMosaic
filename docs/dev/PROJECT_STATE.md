# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: v1.1-S7-prep step 1c — exam_family enum rename (a5140e0 feat + this chore, 2026-05-20)
- Next stage: v1.1-S7 — Content Authoring & Bank Population (S7 opened with legal re-review deferred to pre-launch gate per DEV-20260520-1; S7 morning ritual next)
- v1 build window: **CLOSED** — 49/49 stages (Days 1–65 of 75; 10 days banked unused)
- Active branch: `v1.1/exam-content` — 26 commits ahead of origin/main (9376d98 v1.0.0):
  a7a43d0 v1.1-S1 prep · e76dbfc v1.1-S1 impl · c4c868e v1.1-S1 chore · 3c1afe0 v1.1-S2 prep · 0bdd43b v1.1-S2 impl · f72a7a8 v1.1-S2 chore · ac36e80 ISSUE-0037 remediation · 560e2d2 v1.1-S3 prep · 96b19b5 v1.1-S3 impl · ca9c670 v1.1-S3 chore · 2faeb65 v1.1-S4 prep · b8b8290 v1.1-S4 impl · 5c9692f v1.1-S4 chore · 7b63e2a v1.1-S5 prep · 18aac21 v1.1-S5 impl · efb27e7 v1.1-S5 chore · dc851cf audit+ADR-0040 · b3eb668 ISSUE-0042 fix · 27ded4d ISSUE-0042 docs close · 3340c93 v1.1-S6 prep · 28e85e2 v1.1-S6 impl · 8c86690 v1.1-S6 chore · 4453ddc S7-prep step 1a · bd3a310 S7-prep step 1b feat · 5dd8f4e S7-prep step 1b chore · a5140e0 S7-prep step 1c feat · this chore
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
- v1.1-S1 through v1.1-S6 actual: ~1 day each. (v1.1 stages unbudgeted in DEV_PLAN.)
- Stages closed: **v1: 49/49 closed; v1.1: 6/7 closed (S1–S6 complete; S7 in progress — S7-prep steps 1a + 1b + 1c complete; legal re-review gate next)**

## Test suite

| Suite            | Status       | Count                                                                                                                              | Last run   |
| ---------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Unit             | ✅ green      | 843 passed / 1 skipped (+ 4 Playwright axe-core test.skip-guarded via ISSUE-0038)                                                | 2026-05-19 |
| Integration      | n/a          | n/a                                                                                                                                | n/a        |
| pgTAP            | ✅ green      | 451/451 (migrations 0001–0020); 0021 + 0022 SQL files on disk (deferred-validation)                                               | 2026-06-07 |
| Contract         | ✅ green      | included in 839 Vitest total                                                                                                       | 2026-05-19 |
| E2E (Vitest)     | ✅ green      | 1/1 (assignments-svc lifecycle)                                                                                                    | 2026-05-23 |
| E2E (Playwright) | ⚠ opt-in     | 13 specs / 19 tests (gated; all test.skip-guarded; ISSUE-0035, ISSUE-0038)                                                        | n/a        |
| RLS              | ✅ green      | 451/451 (53 tables; pgTAP 0001–0020 covers all); 0021 + 0022 deferred-validation                                                  | 2026-06-07 |
| Replay           | ✅ green      | 58/58 assertions + 100 billing-svc replay assertions (2-pass 50-event)                                                            | 2026-06-01 |
| axe-core         | ✅ green      | 31 Vitest files / 75 assertions (Stage 48 sweep); S4+S5 added 2 Playwright axe-core specs / 4 guarded tests pending ISSUE-0038   | 2026-06-07 |

Unit + contract breakdown (full `pnpm -r run test` 2026-05-20 v1.1-S7-prep step 1c close):
155 (@mm/types) + 58 (@mm/sdk) + 75 (@mm/ui) + 118 (@mm/engines) + 9 (@mm/core) + 73 (content-svc) + 46 (assessment-svc) + 53 (intelligence-svc) + 6 (jobs-worker) + 31 (analytics-svc) + 19 (orchestration-svc) + 25 (assignments-svc incl. e2e) + 17 (notifications-svc) + 7 (users-svc) + 92 (apps/web) + 59 (billing-svc) = **843 passed, 1 skipped** (844 total).

Delta from v1.1-S7-prep step 1b close: **0** — step 1c is a rename sweep (no new tests; existing 843 now test renamed values).

Delta from v1.0.0 baseline (696/697): +143 total since v1.0.0 (+33 v1.1-S1 + +24 v1.1-S2 + +17 v1.1-S3 + +25 v1.1-S4 + +33 v1.1-S5 + +11 v1.1-S6).

## Quality gates

| Gate                | Last status                                                                        | Last run   |
| ------------------- | ---------------------------------------------------------------------------------- | ---------- |
| pnpm lint           | ✅ green (17 packages)                                                             | 2026-05-19 |
| pnpm typecheck      | ✅ green (17 packages, 0 turbo-cached — --force run per §Close-ritual)            | 2026-05-19 |
| pnpm test           | ✅ green (843 passed / 1 skipped — 844 total Vitest)                              | 2026-05-19 |
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

- ADRs accepted: **41** (ADR-0001 through ADR-0041; ADR-0041 Step 1c addendum appended 2026-05-20 — Q-1.1-S7-LEGAL-2.1..2.5 resolutions, enum rename mapping, migration 0024 DDL note, intelligence-svc DB-lookup fix, EXAM_FAMILY_DISPLAY_LABELS pattern, ISSUE-0051 cross-ref)
- ADRs proposed: **0**
- Workspaces: **17** — unchanged
- Issues critical / high / medium / low: **0 / 0 / 16 / 19**
  - High (0): none
  - Medium (16): ISSUE-0009, ISSUE-0010, ISSUE-0011, ISSUE-0014, ISSUE-0021, ISSUE-0023, ISSUE-0027, ISSUE-0030, ISSUE-0039, ISSUE-0040, ISSUE-0041, ISSUE-0043, ISSUE-0045, ISSUE-0049, ISSUE-0050, **ISSUE-0051** (trademark strings in non-enum surfaces — Q-2.4 carry; legal re-review TBD)
  - Low (19): ISSUE-0015, ISSUE-0016, ISSUE-0017, ISSUE-0019, ISSUE-0020, ISSUE-0022, ISSUE-0024, ISSUE-0025, ISSUE-0028, ISSUE-0031, ISSUE-0032, ISSUE-0033, ISSUE-0034, ISSUE-0035, ISSUE-0038 (info), ISSUE-0044, ISSUE-0046, ISSUE-0047, ISSUE-0048
  - Resolved: ISSUE-0005, 0006, 0007, 0008, 0012, 0013, 0018, 0026, 0029, 0036, 0037, **0042** (content-svc scope; b3eb668 2026-05-19)
- Migrations: **0001–0024** (migrations 0001–0020 pgTAP-verified 451/451; 0021 SQL on disk deferred-validation; 0022 adds composer_params + simulation_params jsonb nullable columns — deferred-validation per 0021 pattern; 0023 adds authoring_method NOT NULL to item_version — deferred-validation per 0021 pattern; **0024 renames exam_family enum values naplan→au_numeracy_y5_format + icas→au_math_paper_c_format — deferred-validation per 0021 pattern**)
- Open questions: **0** — Q-1.1-1.0..9 + Q-1.1-2.1..5 + Q-1.1-3.1..5 + Q-1.1-4.1..8 + Q-1.1-5.1..6 + Q-1.1-6.1..8 + Q-1.1-S7-LEGAL-2.1..2.5 all resolved
- Open bugs: 0
- Deviations logged: **24 total (9 resolved, 15 open)** — unchanged (no new deviations in S6; DEV-20260515-2 honored)
  - DEV-20260607-1 accepted — DEV_PLAN "47 stages" count vs delivered 49
  - DEV-20260607-2 accepted — DEV_PLAN Stage 49 "spec §4" citation error
  - DEV-20260514-1 open — v1.1 exam-content phase inserted ahead of P1.1–P1.7 (ADR-0035)
  - DEV-20260515-1 open — T3 protocol breach on Q-1.1-2.5 self-resolve (process-only, no rework)
  - DEV-20260515-2 open — atomic commit-and-push announcement process fix (tracking only; honored S3–S6)
  - Open carries (v1.1): DEV-20260503-2, DEV-20260519-1, DEV-20260522-1, DEV-20260523-1, DEV-20260524-1, DEV-20260526-1, DEV-20260529-1, DEV-20260530-1, DEV-20260530-2, DEV-20260604-1
- Tag state: `v1-phase-1` pushed (Stage 27). `v1-phase-2-partial` pushed (Stage 41). `v1-phase-4-partial` pushed (Stage 47). **`v1.0.0` on 9376d98 (Stage 49 close commit — push status: unknown — TODO confirm).**
- Branch: `v1.1/exam-content` HEAD = v1.1-S7-prep step 1c chore close commit (this); 26 commits ahead of origin/main.

## Notes for next session

**S7-prep legal response complete.** Steps 1a + 1b + 1c all landed on `v1.1/exam-content`:
- 1a: spec rename + disclaimers, AI clause, prohibitions, privacy, a11y, jurisdiction (4453ddc)
- 1b: authoring_method provenance column + migration 0023 (bd3a310)
- 1c: exam_family enum rename + migration 0024 (a5140e0 feat + this chore)

**Next gate: legal re-review** of `docs/content/specs/australian-y5-numeracy.md` by operator-side legal (Step 2 in v1.1-phase-plan.md §S7-prep Legal Review Tracking). No code action required. S7 morning ritual begins on sign-off.

**ISSUE-0051** filed (Q-2.4 carry) — non-enum trademark surfaces (program column, display_name, slugs, feature_key, UI copy). Pre-launch blocker status: TBD by legal re-review. Do not scope remediation until legal direction received.

**S7.1 sub-batch target:** ~50 NAPLAN-style Year 5 Numeracy original items. Author against `docs/content/specs/australian-y5-numeracy.md` → `POST /content/import` (dry-run first) → lifecycle `draft → review → active`. Idempotency-Key required on all live imports.

**ISSUE-0042 CLOSED** (b3eb668 2026-05-19 — content-svc scope). assessment-svc index.ts:222 type-assertion gap carries non-blocking per ADR-0040.

**ISSUE-0050 FILED** (2026-05-19 — cross-import exact-match dedup; Q-1.1-6.7 + Q-1.1-6.8 upgrade path). Post-launch; implement when content bank reaches meaningful size (~100+ items).

**Carry-forward operator follow-ups:**

- **Legal review gate (S7.1 pre-condition).** Review `docs/content/specs/australian-y5-numeracy.md` and confirm sign-off before S7.1 authoring begins. ADR-0041 §Decision 4 records the gate.
- **ISSUE-0038: axe-core live run** on first preview/CI provision. Covers `exam-content-a11y.spec.ts` (S4) + `student-composer-a11y.spec.ts` (S5). Clears when first green run lands. No code action.
- **`.githooks/pre-commit` activation.** Once per clone: `git config core.hooksPath .githooks`.
- **DEV-20260515-1: T3 fidelity reminder.** Classify each Q-* at impl T1 as structural-vs-tight-detail BEFORE deciding self-resolve eligibility.

**Launch-window operational verification (owner: deploy operator):**
- Run k6/session-loop.js (500 VU / 1h) + k6/billing-webhook.js against deployed env
- Run Playwright 13 specs / 19 tests against deployed Supabase (incl. ISSUE-0038 axe-core gate)
- Run scripts/validate-content.ts (requires seeded content, 50 items, 10 misconceptions)
- 24h pipeline.dead_letter.count = 0 soak
- Supabase backup + restore drill (staging project)
- Stripe test-mode invoicing + tax verification
- Log all 8 SLA measurements in docs/dev/perf/measurements.md
- Full checklist: docs/dev/stage-49-exit-report.md §9
