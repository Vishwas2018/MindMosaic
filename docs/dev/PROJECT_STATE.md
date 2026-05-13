# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 47 — Phase 4 Exit Review (2026-06-06)
- Next stage: Stage 48 — Hardening Pass (Days 72–75 per DEV_PLAN; actual Day 65 — 8 days ahead of schedule)
- Days remaining (target 75): 11 (Day 64 of 75 complete)
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 complete: Stages 15–27 (13 stages). Phase 1 buffer at close: **+2 days banked**.
- Phase 2 complete: Stages 28–41 (14 stages). **+5.5 days net banked entering Phase 3/4**.
- Stage 42 actual: 1 day (budget: 2 days, 1 day under). **Phase 4 buffer entering Stage 43: +6.5 days banked**.
- Stage 43 actual: 1 day (budget: 2 days, 1 day under). **Phase 4 buffer entering Stage 44: +7.5 days banked**.
- Stage 44 actual: 1 day (budget: 1 day, on budget). **Phase 4 buffer entering Stage 45: +7.5 days banked**.
- Stage 45 actual: 2 days (budget: 2 days, on budget). **Phase 4 buffer: +7.5 days banked**.
- Stage 46 actual: 1 day (budget: 1 day, on budget). **Phase 4 buffer: +7.5 days banked** (unchanged).
- Stage 47 actual: 1 day (budget: 1 day audit, on budget). **Phase 4 buffer: +7.5 days banked** (unchanged).
- Stages closed: 47 of 75.

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

Unit + contract breakdown (full `pnpm -r run test` output 2026-06-05 Stage 46 close — unchanged at Stage 47 docs-only):
118 (@mm/types) + 56 (@mm/sdk) + 75 (@mm/ui) + 115 (@mm/engines) + 9 (@mm/core) + 24 (content-svc) + 32 (assessment-svc) + 53 (intelligence-svc) + 6 (jobs-worker) + 31 (analytics-svc) + 19 (orchestration-svc) + 20 (assignments-svc incl. e2e) + 17 (notifications-svc: 15 prior + 2 stage46) + 7 (users-svc) + 55 (apps/web) + 59 (billing-svc: 14 webhook + 21 stage43 + 18 stage44 + 6 stage46) = **696 passed, 1 skipped** (697 total).

## Quality gates

| Gate                | Last status                                                              | Last run   |
| ------------------- | ------------------------------------------------------------------------ | ---------- |
| pnpm lint           | ✅ green (17 packages)                                                   | 2026-06-05 |
| pnpm typecheck      | ✅ green (17 packages, 0 turbo-cached — --force run per §Close-ritual)  | 2026-06-05 |
| pnpm test           | ✅ green (696 passed / 1 skipped — 697 total Vitest)                    | 2026-06-05 |
| pnpm test:replay    | ✅ green (58/58 assertions)                                              | 2026-05-16 |
| pnpm build          | ✅ green (exit 0, 21 routes)                                             | 2026-05-11 |
| RLS coverage        | ✅ 53/53 tables enabled + tested (no new tables Stages 42–47)           | 2026-05-03 |
| pnpm audit          | unknown — TODO measure                                                   | n/a        |
| pnpm test:migration | ⚠ NOT RUN for 0012–0020 (sandbox no Docker)                             | 2026-05-03 (last clean: 11 migrations) |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95                                                 |
| --------------------------------- | ---------- | ------------------------------------------------------------ |
| POST /sessions/{id}/respond       | 300 ms     | not measured — Stage 48 hardening pass (requires deployed environment) |
| POST /sessions/{id}/submit + sync | 5000 ms    | not measured — Stage 48 hardening pass (requires deployed environment) |
| Pipeline async                    | 30000 ms   | not measured — Stage 48 hardening pass (requires deployed environment) |
| Dashboard load                    | 2000 ms    | not measured — Stage 48 hardening pass (requires deployed environment) |
| Billing webhook p95               | 300 ms     | not measured — Stage 48 hardening pass (requires deployed environment) |
| Flag propagation p95              | 30 s       | not measured — Stage 48 hardening pass (requires deployed environment) |

## Open items

- ADRs accepted: **34** (ADR-0001 through ADR-0034) — unchanged Stage 47 (no new ADR required)
- ADRs proposed: 0
- Workspaces: **17** — unchanged Stage 47
- Issues critical / high / medium / low: **0/0/8/13** — unchanged Stage 47 (audit-only)
  - Medium (8): ISSUE-0009, ISSUE-0010, ISSUE-0011, ISSUE-0014, ISSUE-0021, ISSUE-0023, ISSUE-0027, ISSUE-0030
  - Low (13): ISSUE-0015, ISSUE-0016, ISSUE-0017, ISSUE-0019, ISSUE-0020, ISSUE-0022, ISSUE-0024, ISSUE-0025, ISSUE-0028, ISSUE-0031, ISSUE-0032, ISSUE-0033, ISSUE-0034
  - Resolved: ISSUE-0005, 0006, 0007, 0008, 0012, 0026, 0013, 0018, 0029 (Stage 41 audit triage)
- Open questions: **0** — Q-47.1..3 all resolved at morning ritual (2026-06-06)
- Open bugs: 0
- Deviations logged: 18 total (8 resolved, 10 open) — DEV-20260606-1 added Stage 47
  - DEV-20260430-1 resolved Stage 15
  - DEV-20260511-1 resolved Stage 22b
  - DEV-20260515-1 self-resolved Stage 25
  - DEV-20260518-1 resolved Stage 28
  - DEV-20260522-2 resolved Stage 32
  - DEV-20260511-2 self-resolved Stage 40
  - DEV-20260527-1 resolved Stage 41 (documentation side — deployment.md)
  - DEV-20260524-1 resolved Stage 41 (close-ritual cache-bust canonised)
  - DEV-20260503-2 ongoing v1.1
  - DEV-20260519-1 ongoing — exam_date column deferred
  - DEV-20260522-1 ongoing v1.1 — auto-groups route shape
  - DEV-20260523-1 ongoing v1.1 — Idempotency-Key enforcement
  - DEV-20260524-1 ongoing — PathwayReadiness from learner profile, not analytics-svc (DEV-20260526-1)
  - DEV-20260529-1 ongoing — 5-step wizard vs 4-step SCREEN_SPECS §22 (Stage 39)
  - DEV-20260530-1 ongoing — tab labels Assigned/In Progress/Completed vs spec
  - DEV-20260530-2 ongoing — Review button vs dropdown (Stage 40)
  - DEV-20260604-1 ongoing — spec §25.6 cancel path drift; v1.1 spec reconciliation (no Stage 48 action)
  - DEV-20260606-1 accepted — tag name v1-phase-4-slice → v1-phase-4-partial (immutable)
- Tag state: `v1-phase-1` pushed to origin (Stage 41). `v1-phase-2-partial` pushed (Stage 41). **`v1-phase-4-partial` pending push (separate approval, Stage 47 close).**

## Notes for next session

Stage 48 — Hardening Pass (Days 72–75 per DEV_PLAN; actual Day 65 — 8 days ahead of schedule on +7.5 buffer).

Key notes for Stage 48:
1. **Push `v1-phase-4-partial` tag first** (separate approval from Stage 47 audit commit — do not bundle).
2. Migrations 0012–0020 Docker run (requires Docker; last clean run: 0001–0013 pgTAP 451/451 on 2026-05-03). Migration deploy orders documented in `docs/dev/deployment.md` (0017 alert_type, 0019 user_role, 0020 notification_type).
3. k6 SLA measurement against deployed environment — 8 budgets; log in `docs/dev/perf/measurements.md`.
4. Playwright E2e 13 specs / 15 tests against deployed Stripe test environment.
5. 24h soak: `pipeline.dead_letter.count` must be 0 over 24h.
6. Full axe-core sweep across all 21 routes — fix any regression.
7. `scripts/validate-content.ts` — seed integrity check.
8. Review DAILY_LOG blockers from prior stages.
9. `pnpm audit` — security scan; log in `docs/dev/security/findings.md`.
10. Stage 46 delivery is complete — no backlog from Phase 4 to deliver at Stage 48. Stage 48 is pure hardening.
