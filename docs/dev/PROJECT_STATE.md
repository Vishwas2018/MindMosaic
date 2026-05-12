# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 43 — Billing Endpoints (2026-06-02)
- Next stage: Stage 44 — Feature Flag Propagation Handler (Day 60, 1-day budget)
- Days remaining (target 75): 16 (Day 59 of 75 complete)
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 complete: Stages 15–27 (13 stages). Phase 1 buffer at close: **+2 days banked**.
- Phase 2 complete: Stages 28–41 (14 stages). **+5.5 days net banked entering Phase 3/4**.
- Stage 42 actual: 1 day (budget: 2 days, 1 day under). **Phase 4 buffer entering Stage 43: +6.5 days banked**.
- Stage 43 actual: 1 day (budget: 2 days, 1 day under). **Phase 4 buffer: +7.5 days banked**.
- Stages closed: 43 of 75.

## Test suite

| Suite           | Status       | Count                                                         | Last run   |
| --------------- | ------------ | ------------------------------------------------------------- | ---------- |
| Unit            | ✅ green      | 643 passed / 1 skipped (+ 3 Playwright test.skip-guarded)    | 2026-06-02 |
| Integration     | n/a          | n/a                                                           | n/a        |
| pgTAP           | ✅ green      | 451/451                                                       | 2026-05-03 |
| Contract        | ✅ green      | included in 643 Vitest total                                  | 2026-06-02 |
| E2E (Vitest)    | ✅ green      | 1/1 (assignments-svc lifecycle)                               | 2026-05-23 |
| E2E (Playwright)| ⚠ opt-in     | 12 specs / 15 tests (gated)                                   | n/a        |
| RLS             | ✅ green      | 451/451 (53 tables)                                           | 2026-05-03 |
| Replay          | ✅ green      | 58/58 assertions + 100 billing-svc replay assertions (2-pass 50-event) | 2026-06-01 |

Unit + contract breakdown (full `pnpm -r run test` output 2026-06-02 Stage 43 close):
118 (@mm/types) + 56 (@mm/sdk) + 75 (@mm/ui) + 115 (@mm/engines) + 9 (@mm/core) + 24 (content-svc) + 32 (assessment-svc) + 53 (intelligence-svc) + 6 (jobs-worker) + 31 (analytics-svc) + 19 (orchestration-svc) + 20 (assignments-svc incl. e2e) + 15 (notifications-svc) + 7 (users-svc) + 26 (apps/web) + **37 (billing-svc: 16 webhook + 21 stage43)** = **643 passed, 1 skipped** (644 total).

Stage 43 adds 31 net-new tests:
- 21 billing-svc stage43.contract.test.ts: handleGetPlans (2), handleGetSubscription (3), handleGetInvoices (3), handleCreateCheckout (5), handleCreatePortalSession (3), handleCancelSubscription (5).
- 10 packages/sdk billing.test.ts: mmKeys.billing (3), usePlanCatalog/useSubscription/useInvoices (3 query), useCreateCheckout/useCreatePortalSession/useCancelSubscription×2 (4 mutation).
- 3 @mm/types (new PortalResponseSchema, InvoicesResponseSchema, CancelResponseSchema schema tests).

Previous count (Stage 42 close, unchanged): 609 passed / 1 skipped = 610 total.

## Quality gates

| Gate                | Last status                                                        | Last run   |
| ------------------- | ------------------------------------------------------------------ | ---------- |
| pnpm lint           | ✅ green (17 packages)                                             | 2026-06-02 |
| pnpm typecheck      | ✅ green (17 packages, 0 turbo-cached — --force run per §Close-ritual) | 2026-06-02 |
| pnpm test           | ✅ green (643 passed / 1 skipped — 644 total Vitest)               | 2026-06-02 |
| pnpm test:replay    | ✅ green (58/58 assertions)                                        | 2026-05-16 |
| pnpm build          | ✅ green (exit 0, 21 routes)                                       | 2026-05-11 |
| RLS coverage        | ✅ 53/53 tables enabled + tested (0018 adds 4 tables — deferred-validation pending Docker) | 2026-05-03 |
| pnpm audit          | unknown — TODO measure                                             | n/a        |
| pnpm test:migration | ⚠ NOT RUN for 0012–0018 (sandbox no Docker)                       | 2026-05-03 (last clean: 11 migrations) |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95                                                 |
| --------------------------------- | ---------- | ------------------------------------------------------------ |
| POST /sessions/{id}/respond       | 300 ms     | not measured — Stage 48 hardening pass (requires deployed environment) |
| POST /sessions/{id}/submit + sync | 5000 ms    | not measured — Stage 48 hardening pass (requires deployed environment) |
| Pipeline async                    | 30000 ms   | not measured — Stage 48 hardening pass (requires deployed environment) |
| Dashboard load                    | 2000 ms    | not measured — Stage 48 hardening pass (requires deployed environment) |

## Open items

- ADRs accepted: **34** (ADR-0001 through ADR-0034) — unchanged Stage 43
- ADRs proposed: 0
- Workspaces: **17** — unchanged Stage 43
- Issues critical / high / medium / low: **0/0/8/12**
  - Medium (8): ISSUE-0009, ISSUE-0010, ISSUE-0011, ISSUE-0014, ISSUE-0021, ISSUE-0023, ISSUE-0027, ISSUE-0030
  - Low (12): ISSUE-0015, ISSUE-0016, ISSUE-0017, ISSUE-0019, ISSUE-0020, ISSUE-0022, ISSUE-0024, ISSUE-0025, ISSUE-0028, ISSUE-0031, ISSUE-0032, **ISSUE-0033**
  - Resolved: ISSUE-0005, 0006, 0007, 0008, 0012, 0026, 0013, 0018, 0029 (Stage 41 audit triage)
- Open questions: 0
- Open bugs: 0
- Deviations logged: 16 total (8 resolved, 8 open) — unchanged Stage 43 (no new deviations)
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
  - DEV-20260526-1 ongoing — PathwayReadiness from learner profile, not analytics-svc
  - DEV-20260529-1 ongoing — 5-step wizard vs 4-step SCREEN_SPECS §22 (Stage 39)
  - DEV-20260530-1 ongoing — tab labels Assigned/In Progress/Completed vs spec
  - DEV-20260530-2 ongoing — Review button vs dropdown (Stage 40)
- Tag state: `v1-phase-1` pushed to origin (Stage 41). `v1-phase-2-partial` pushed (Stage 41).

## Notes for next session

Stage 44 — Feature Flag Propagation Handler (Day 60, 1-day budget).

Key notes for Stage 44:
- Replace `handleFlagPropagateStub` in billing-svc/handlers.ts with real `pipeline.feature_flag_propagate` body.
- Pre-read arch §11.2 verbatim — feature_flag propagation rules (tier → feature flags mapping).
- Pre-read spec §20.3.1 — feature registry governing which flags propagate per tier.
- Wire `admin_action_log` write (Q-42.7 deferral): sentinel system user required (Option A: insert a sentinel `user_profile` row with a fixed UUID and `role='system'`; actor_id FK uses this UUID). Round-trip to operator before implementing if Option A not acceptable.
- `jobs-worker` dispatches `pipeline.feature_flag_propagate` to billing-svc (ADR-0031 fifth amendment — already wired Stage 42). Stage 44 = filling the handler body only; no new routes, no new migration expected.
- T5 still deferred to Stage 45 (next UI stage); T1–T4 + push-gate fully canonised.
- ISSUE-0032 (low): webhook secret rotation — no Stage 44 billing-svc env loading changes expected.
- ADR-0034 Decision 6 (feature_flag.source enum values) — verify against migration 0018 schema before writing propagation logic.
