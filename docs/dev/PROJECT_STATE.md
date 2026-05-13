# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 46 — Cancellation + Access Preservation notifications (2026-06-05)
- Next stage: Stage 47 — Phase 4 exit review (Day 64, Conditional Go pattern)
- Days remaining (target 75): 12 (Day 63 of 75 complete)
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 complete: Stages 15–27 (13 stages). Phase 1 buffer at close: **+2 days banked**.
- Phase 2 complete: Stages 28–41 (14 stages). **+5.5 days net banked entering Phase 3/4**.
- Stage 42 actual: 1 day (budget: 2 days, 1 day under). **Phase 4 buffer entering Stage 43: +6.5 days banked**.
- Stage 43 actual: 1 day (budget: 2 days, 1 day under). **Phase 4 buffer entering Stage 44: +7.5 days banked**.
- Stage 44 actual: 1 day (budget: 1 day, on budget). **Phase 4 buffer entering Stage 45: +7.5 days banked**.
- Stage 45 actual: 2 days (budget: 2 days, on budget). **Phase 4 buffer: +7.5 days banked**.
- Stage 46 actual: 1 day (budget: 1 day, on budget). **Phase 4 buffer: +7.5 days banked** (unchanged — Stage 46 on budget).
- Stages closed: 46 of 75.

## Test suite

| Suite           | Status       | Count                                                              | Last run   |
| --------------- | ------------ | ------------------------------------------------------------------ | ---------- |
| Unit            | ✅ green      | 696 passed / 1 skipped (+ 4 Playwright test.skip-guarded)         | 2026-06-05 |
| Integration     | n/a          | n/a                                                                | n/a        |
| pgTAP           | ✅ green      | 451/451                                                            | 2026-05-03 |
| Contract        | ✅ green      | included in 696 Vitest total                                       | 2026-06-05 |
| E2E (Vitest)    | ✅ green      | 1/1 (assignments-svc lifecycle)                                    | 2026-05-23 |
| E2E (Playwright)| ⚠ opt-in     | 13 specs / 15 tests (gated; billing-cancel.spec.ts added Stage 46) | n/a        |
| RLS             | ✅ green      | 451/451 (53 tables)                                                | 2026-05-03 |
| Replay          | ✅ green      | 58/58 assertions + 100 billing-svc replay assertions (2-pass 50-event) | 2026-06-01 |

Unit + contract breakdown (full `pnpm -r run test` output 2026-06-05 Stage 46 close):
118 (@mm/types) + 56 (@mm/sdk) + 75 (@mm/ui) + 115 (@mm/engines) + 9 (@mm/core) + 24 (content-svc) + 32 (assessment-svc) + 53 (intelligence-svc) + 6 (jobs-worker) + 31 (analytics-svc) + 19 (orchestration-svc) + 20 (assignments-svc incl. e2e) + **17 (notifications-svc: 15 prior + 2 stage46)** + 7 (users-svc) + 55 (apps/web) + **59 (billing-svc: 14 webhook + 21 stage43 + 18 stage44 + 6 stage46)** = **696 passed, 1 skipped** (697 total).

Stage 46 net change: +8 new (6 billing-svc stage46.contract.test.ts + 2 notifications-svc access_downgraded). Previous: 688 → 696.

Stage 46 new tests (8):
- billing-svc stage46 (6): deleted+parent enqueue both jobs; nfp idempotency_key; deleted+no-parent ffp-only+warn+200; is_active=false+tier=free regression; cancel_at_period_end=true R1; cancel_at_period_end=false R1
- notifications-svc (2): access_downgraded with parent_id → 201; access_downgraded without parent_id → 400

## Quality gates

| Gate                | Last status                                                              | Last run   |
| ------------------- | ------------------------------------------------------------------------ | ---------- |
| pnpm lint           | ✅ green (17 packages)                                                   | 2026-06-05 |
| pnpm typecheck      | ✅ green (17 packages, 0 turbo-cached — --force run per §Close-ritual)  | 2026-06-05 |
| pnpm test           | ✅ green (696 passed / 1 skipped — 697 total Vitest)                    | 2026-06-05 |
| pnpm test:replay    | ✅ green (58/58 assertions)                                              | 2026-05-16 |
| pnpm build          | ✅ green (exit 0, 21 routes)                                             | 2026-05-11 |
| RLS coverage        | ✅ 53/53 tables enabled + tested (no new tables Stage 46)               | 2026-05-03 |
| pnpm audit          | unknown — TODO measure                                                   | n/a        |
| pnpm test:migration | ⚠ NOT RUN for 0012–0020 (sandbox no Docker)                             | 2026-05-03 (last clean: 11 migrations) |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95                                                 |
| --------------------------------- | ---------- | ------------------------------------------------------------ |
| POST /sessions/{id}/respond       | 300 ms     | not measured — Stage 48 hardening pass (requires deployed environment) |
| POST /sessions/{id}/submit + sync | 5000 ms    | not measured — Stage 48 hardening pass (requires deployed environment) |
| Pipeline async                    | 30000 ms   | not measured — Stage 48 hardening pass (requires deployed environment) |
| Dashboard load                    | 2000 ms    | not measured — Stage 48 hardening pass (requires deployed environment) |

## Open items

- ADRs accepted: **34** (ADR-0001 through ADR-0034) — unchanged Stage 46 (no new ADR required)
- ADRs proposed: 0
- Workspaces: **17** — unchanged Stage 46
- Issues critical / high / medium / low: **0/0/8/13** — ISSUE-0034 (low) added Stage 46
  - Medium (8): ISSUE-0009, ISSUE-0010, ISSUE-0011, ISSUE-0014, ISSUE-0021, ISSUE-0023, ISSUE-0027, ISSUE-0030
  - Low (13): ISSUE-0015, ISSUE-0016, ISSUE-0017, ISSUE-0019, ISSUE-0020, ISSUE-0022, ISSUE-0024, ISSUE-0025, ISSUE-0028, ISSUE-0031, ISSUE-0032, ISSUE-0033, **ISSUE-0034**
  - Resolved: ISSUE-0005, 0006, 0007, 0008, 0012, 0026, 0013, 0018, 0029 (Stage 41 audit triage)
- Open questions: **0** — Q-46.1..3 all resolved at prep (2026-06-05)
- Open bugs: 0
- Deviations logged: 17 total (8 resolved, 9 open) — no new deviations Stage 46
- Tag state: `v1-phase-1` pushed to origin (Stage 41). `v1-phase-2-partial` pushed (Stage 41).

## Notes for next session

Stage 47 — Phase 4 exit review (Day 64). Mirrors Stage 41 Conditional Go pattern.

Key notes for Stage 47:
- Read `docs/dev/decisions/` for phase-2-exit-report structure as template.
- OPEN_ISSUES triage: review severity assignments for 8 medium + 13 low issues.
- Deviation review: 9 open deviations — assess whether any require ADRs or scope adjustments.
- v1-phase-4-partial tag candidate: code-verifiable criteria for billing (Stages 42–46) complete; infrastructure criteria (migration Docker runs, k6 SLAs, Playwright E2e against deployed env) deferred to Stage 48.
- Numerical SLAs still deferred to Stage 48 hardening pass (deployment.md §Stage 48 hardening checklist).
- Migration 0020 deploy order documented in deployment.md: run before billing-svc/notifications-svc code deploy.
- ISSUE-0034 (low): single-parent fanout v1 → v1.1 multi-parent fanout tracks this.
