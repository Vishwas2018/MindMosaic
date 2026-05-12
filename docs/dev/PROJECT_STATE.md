# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 44 — Feature Flag Propagation Handler (2026-06-03)
- Next stage: Stage 45 — Billing UI (Days 67–68, 2-day budget). T5 reactivates.
- Days remaining (target 75): 15 (Day 60 of 75 complete)
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 complete: Stages 15–27 (13 stages). Phase 1 buffer at close: **+2 days banked**.
- Phase 2 complete: Stages 28–41 (14 stages). **+5.5 days net banked entering Phase 3/4**.
- Stage 42 actual: 1 day (budget: 2 days, 1 day under). **Phase 4 buffer entering Stage 43: +6.5 days banked**.
- Stage 43 actual: 1 day (budget: 2 days, 1 day under). **Phase 4 buffer entering Stage 44: +7.5 days banked**.
- Stage 44 actual: 1 day (budget: 1 day, on budget). **Phase 4 buffer: +7.5 days banked** (unchanged — Stage 44 consumed its full 1-day budget).
- Stages closed: 44 of 75.

## Test suite

| Suite           | Status       | Count                                                              | Last run   |
| --------------- | ------------ | ------------------------------------------------------------------ | ---------- |
| Unit            | ✅ green      | 659 passed / 1 skipped (+ 3 Playwright test.skip-guarded)         | 2026-06-03 |
| Integration     | n/a          | n/a                                                                | n/a        |
| pgTAP           | ✅ green      | 451/451                                                            | 2026-05-03 |
| Contract        | ✅ green      | included in 659 Vitest total                                       | 2026-06-03 |
| E2E (Vitest)    | ✅ green      | 1/1 (assignments-svc lifecycle)                                    | 2026-05-23 |
| E2E (Playwright)| ⚠ opt-in     | 12 specs / 15 tests (gated)                                        | n/a        |
| RLS             | ✅ green      | 451/451 (53 tables)                                                | 2026-05-03 |
| Replay          | ✅ green      | 58/58 assertions + 100 billing-svc replay assertions (2-pass 50-event) | 2026-06-01 |

Unit + contract breakdown (full `pnpm -r run test` output 2026-06-03 Stage 44 close):
118 (@mm/types) + 56 (@mm/sdk) + 75 (@mm/ui) + 115 (@mm/engines) + 9 (@mm/core) + 24 (content-svc) + 32 (assessment-svc) + 53 (intelligence-svc) + 6 (jobs-worker) + 31 (analytics-svc) + 19 (orchestration-svc) + 20 (assignments-svc incl. e2e) + 15 (notifications-svc) + 7 (users-svc) + 26 (apps/web) + **53 (billing-svc: 14 webhook + 21 stage43 + 18 stage44)** = **659 passed, 1 skipped** (660 total).

Stage 44 net change: −2 stub tests (handleFlagPropagateStub removed from webhook.contract.test.ts) + 18 new (stage44.contract.test.ts) = **+16 net-new tests**. Previous: 643 → 659.

Stage 44 adds 18 contract tests:
- stage44.contract.test.ts: free/standard/premium tier propagation (3), admin_override preservation (2), sessions.monthly_limit config shape (2), pathway.* max_pathways (3), admin_action_log write (1), idempotency (1), return shape (1), missing tenantId 400 (1), missing subscription → free-tier (1), institutional propagation (1) = 16... see file for exact names. Total: 18 tests.

Previous count (Stage 43 close): 643 passed / 1 skipped = 644 total.

## Quality gates

| Gate                | Last status                                                              | Last run   |
| ------------------- | ------------------------------------------------------------------------ | ---------- |
| pnpm lint           | ✅ green (17 packages)                                                   | 2026-06-03 |
| pnpm typecheck      | ✅ green (17 packages, 0 turbo-cached — --force run per §Close-ritual)  | 2026-06-03 |
| pnpm test           | ✅ green (659 passed / 1 skipped — 660 total Vitest)                    | 2026-06-03 |
| pnpm test:replay    | ✅ green (58/58 assertions)                                              | 2026-05-16 |
| pnpm build          | ✅ green (exit 0, 21 routes)                                             | 2026-05-11 |
| RLS coverage        | ✅ 53/53 tables enabled + tested (migration 0019 DDL-only — no new tables) | 2026-05-03 |
| pnpm audit          | unknown — TODO measure                                                   | n/a        |
| pnpm test:migration | ⚠ NOT RUN for 0012–0019 (sandbox no Docker)                             | 2026-05-03 (last clean: 11 migrations) |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95                                                 |
| --------------------------------- | ---------- | ------------------------------------------------------------ |
| POST /sessions/{id}/respond       | 300 ms     | not measured — Stage 48 hardening pass (requires deployed environment) |
| POST /sessions/{id}/submit + sync | 5000 ms    | not measured — Stage 48 hardening pass (requires deployed environment) |
| Pipeline async                    | 30000 ms   | not measured — Stage 48 hardening pass (requires deployed environment) |
| Dashboard load                    | 2000 ms    | not measured — Stage 48 hardening pass (requires deployed environment) |

## Open items

- ADRs accepted: **34** (ADR-0001 through ADR-0034) — unchanged Stage 44 (no new ADR required)
- ADRs proposed: 0
- Workspaces: **17** — unchanged Stage 44
- Issues critical / high / medium / low: **0/0/8/12** — unchanged Stage 44 (no new issues)
  - Medium (8): ISSUE-0009, ISSUE-0010, ISSUE-0011, ISSUE-0014, ISSUE-0021, ISSUE-0023, ISSUE-0027, ISSUE-0030
  - Low (12): ISSUE-0015, ISSUE-0016, ISSUE-0017, ISSUE-0019, ISSUE-0020, ISSUE-0022, ISSUE-0024, ISSUE-0025, ISSUE-0028, ISSUE-0031, ISSUE-0032, ISSUE-0033
  - Resolved: ISSUE-0005, 0006, 0007, 0008, 0012, 0026, 0013, 0018, 0029 (Stage 41 audit triage)
- Open questions: **0** — Q-44.1–5 all resolved; Q-42.7 closed
- Open bugs: 0
- Deviations logged: 16 total (8 resolved, 8 open) — unchanged Stage 44 (no new deviations)
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

Stage 45 — Billing UI (Days 67–68, 2-day budget). T5 reactivates.

Key notes for Stage 45:
- T5 mandatory: layout sketch required BEFORE component code. Read `docs/dev/mockups/04-billing.html` (CLAUDE_DESIGN_PROMPTS.md prototype reference).
- Screen 17: billing settings page (subscription status, plan selector, payment method, invoice history).
- EntitlementsProvider stub (from Stage 42) should be wired to live subscription state via `useSubscription` hook (packages/sdk).
- FEATURE_REGISTRY + `handleFlagPropagate` are now live; entitlement reads use `feature_flag` table via RLS.
- ISSUE-0032 (low): single STRIPE_WEBHOOK_SECRET — no Stage 45 changes needed, noted for v1.1 dual-secret rotation.
- ISSUE-0033 (low): GET /billing/invoices LIMIT 50 + truncated flag — UI must handle `truncated: true` gracefully.
- Mockup prototype: `CLAUDE_DESIGN_PROMPTS.md` Screen 17 billing UI prototype.
