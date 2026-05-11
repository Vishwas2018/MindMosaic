# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 42 — Stripe Integration + Webhook (Phase 4 slice) (2026-06-01)
- Next stage: Stage 43 — Billing Endpoints (Days 64–65, 2-day budget)
- Days remaining (target 75): 17 (Day 58 of 75 complete)
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 complete: Stages 15–27 (13 stages). Phase 1 buffer at close: **+2 days banked**.
- Phase 2 complete: Stages 28–41 (14 stages). **+5.5 days net banked entering Phase 3/4**.
- Stage 42 actual: 1 day (budget: 2 days, 1 day under). **Phase 4 buffer: +6.5 days banked**.
- Stages closed: 42 of 75.

## Test suite

| Suite           | Status       | Count                                                         | Last run   |
| --------------- | ------------ | ------------------------------------------------------------- | ---------- |
| Unit            | ✅ green      | 609 passed / 1 skipped (+ 3 Playwright test.skip-guarded)    | 2026-06-01 |
| Integration     | n/a          | n/a                                                           | n/a        |
| pgTAP           | ✅ green      | 451/451                                                       | 2026-05-03 |
| Contract        | ✅ green      | included in 609 Vitest total                                  | 2026-06-01 |
| E2E (Vitest)    | ✅ green      | 1/1 (assignments-svc lifecycle)                               | 2026-05-23 |
| E2E (Playwright)| ⚠ opt-in     | 12 specs / 15 tests (gated)                                   | n/a        |
| RLS             | ✅ green      | 451/451 (53 tables)                                           | 2026-05-03 |
| Replay          | ✅ green      | 58/58 assertions + 100 billing-svc replay assertions (2-pass 50-event) | 2026-06-01 |

Unit + contract breakdown (full `pnpm -r run test` output 2026-06-01 Stage 42 close):
115 (@mm/types) + 46 (@mm/sdk) + 75 (@mm/ui) + 115 (@mm/engines) + 9 (@mm/core) + 24 (content-svc) + 32 (assessment-svc) + 53 (intelligence-svc) + 6 (jobs-worker) + 31 (analytics-svc) + 19 (orchestration-svc) + 20 (assignments-svc incl. e2e) + 15 (notifications-svc) + 7 (users-svc) + 26 (apps/web) + **16 (billing-svc new)** = **609 passed, 1 skipped** (610 total).

Stage 42 adds 16 billing-svc contract tests: invalid_signature, dup 23505, dup ON CONFLICT, checkout.session.completed, subscription.created/updated/deleted, invoice.paid/payment_failed, customer.updated, unknown event, no customer field, arch §3.4.1 sig-first, 50-event replay (evt_test_0001…0050 ×2 passes = 100 assertions), flag-propagate stub ×2.

Previous count (Stage 41 close, unchanged): 593 passed / 1 skipped = 594 total.

## Quality gates

| Gate                | Last status                                                        | Last run   |
| ------------------- | ------------------------------------------------------------------ | ---------- |
| pnpm lint           | ✅ green (17 packages)                                             | 2026-06-01 |
| pnpm typecheck      | ✅ green (17 packages, 0 turbo-cached — --force run per §Close-ritual) | 2026-06-01 |
| pnpm test           | ✅ green (609 passed / 1 skipped — 610 total Vitest)               | 2026-06-01 |
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

- ADRs accepted: **34** (ADR-0001 through ADR-0034)
- ADRs proposed: 0
- Workspaces: **17** (billing-svc added Stage 42)
- Issues critical / high / medium / low: **0/0/8/11**
  - Medium (8): ISSUE-0009, ISSUE-0010, ISSUE-0011, ISSUE-0014, ISSUE-0021, ISSUE-0023, ISSUE-0027, ISSUE-0030
  - Low (11): ISSUE-0015, ISSUE-0016, ISSUE-0017, ISSUE-0019, ISSUE-0020, ISSUE-0022, ISSUE-0024, ISSUE-0025, ISSUE-0028, ISSUE-0031, **ISSUE-0032**
  - Resolved: ISSUE-0005, 0006, 0007, 0008, 0012, 0026, **0013, 0018, 0029** (Stage 41 audit triage)
- Open questions: 0
- Open bugs: 0
- Deviations logged: 16 total (8 resolved, 8 open) — unchanged Stage 42 (no new deviations)
  - DEV-20260430-1 resolved Stage 15
  - DEV-20260511-1 resolved Stage 22b
  - DEV-20260515-1 self-resolved Stage 25
  - DEV-20260518-1 resolved Stage 28
  - DEV-20260522-2 resolved Stage 32
  - DEV-20260511-2 self-resolved Stage 40
  - DEV-20260527-1 resolved Stage 41 (close-ritual cache-bust canonised)
  - DEV-20260524-1 resolved Stage 41 (documentation side — deployment.md)
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

Stage 43 — Billing Endpoints (Days 64–65, 2-day budget).

Key notes for Stage 43:
- Pre-read arch §4.9 verbatim (all 7 billing endpoints — /billing/checkout, /billing/portal, /billing/subscription, /billing/invoices already pinned at Stage 42 R4; /billing/webhook/stripe done; /billing/pipeline/flag-propagate stub done).
- `withIdempotency` middleware applies on POST /billing/checkout per ISSUE-0023 pattern — architecturally distinct from Stage 42 billing_event webhook dedup (ADR-0034 §Decision 3 rationale).
- Stripe-hosted Checkout redirect flow per Q-42.5 SAQ A — no card data stored in app.
- ADR-0029 SDK prefix returns to relevance if billing endpoints use SDK hooks; grep before wiring.
- No new migration expected — all 4 billing tables (subscription, billing_customer, invoice, billing_event) shipped Stage 42 migration 0018.
- T5 still deferred to Stage 45 (next UI stage); T1–T4 + push-gate fully canonised.
- ISSUE-0032 (low): webhook secret rotation — watch for any Stage 43 work that touches billing-svc env loading.
- Q-42.7 deferred to Stage 44: admin_action_log sentinel system user. Option A (sentinel user_profile row) recommended; round-trip to operator if Option A not acceptable.
- T-discipline state: T1–T5 canonised; push gate canonised; close-ritual cache-bust canonised; ADR-0034 canonises Stripe integration patterns.
