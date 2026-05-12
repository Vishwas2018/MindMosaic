# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 45 — Billing UI / Screen 17 (2026-06-04)
- Next stage: Stage 46 — Cancellation + Access Preservation UI (Day 63, 1-day budget)
- Days remaining (target 75): 13 (Day 62 of 75 complete)
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 complete: Stages 15–27 (13 stages). Phase 1 buffer at close: **+2 days banked**.
- Phase 2 complete: Stages 28–41 (14 stages). **+5.5 days net banked entering Phase 3/4**.
- Stage 42 actual: 1 day (budget: 2 days, 1 day under). **Phase 4 buffer entering Stage 43: +6.5 days banked**.
- Stage 43 actual: 1 day (budget: 2 days, 1 day under). **Phase 4 buffer entering Stage 44: +7.5 days banked**.
- Stage 44 actual: 1 day (budget: 1 day, on budget). **Phase 4 buffer entering Stage 45: +7.5 days banked** (unchanged — Stage 44 on budget).
- Stage 45 actual: 2 days (budget: 2 days, on budget). **Phase 4 buffer: +7.5 days banked** (unchanged — Stage 45 consumed its full 2-day budget).
- Stages closed: 45 of 75.

## Test suite

| Suite           | Status       | Count                                                              | Last run   |
| --------------- | ------------ | ------------------------------------------------------------------ | ---------- |
| Unit            | ✅ green      | 688 passed / 1 skipped (+ 3 Playwright test.skip-guarded)         | 2026-06-04 |
| Integration     | n/a          | n/a                                                                | n/a        |
| pgTAP           | ✅ green      | 451/451                                                            | 2026-05-03 |
| Contract        | ✅ green      | included in 688 Vitest total                                       | 2026-06-04 |
| E2E (Vitest)    | ✅ green      | 1/1 (assignments-svc lifecycle)                                    | 2026-05-23 |
| E2E (Playwright)| ⚠ opt-in     | 12 specs / 15 tests (gated)                                        | n/a        |
| RLS             | ✅ green      | 451/451 (53 tables)                                                | 2026-05-03 |
| Replay          | ✅ green      | 58/58 assertions + 100 billing-svc replay assertions (2-pass 50-event) | 2026-06-01 |

Unit + contract breakdown (full `pnpm -r run test` output 2026-06-04 Stage 45 close):
118 (@mm/types) + 56 (@mm/sdk) + 75 (@mm/ui) + 115 (@mm/engines) + 9 (@mm/core) + 24 (content-svc) + 32 (assessment-svc) + 53 (intelligence-svc) + 6 (jobs-worker) + 31 (analytics-svc) + 19 (orchestration-svc) + 20 (assignments-svc incl. e2e) + 15 (notifications-svc) + 7 (users-svc) + **55 (apps/web: 26 prior + 29 stage45)** + 53 (billing-svc: 14 webhook + 21 stage43 + 18 stage44) = **688 passed, 1 skipped** (689 total).

Stage 45 net change: +29 new (billing.page.test.tsx — 29 pure function tests for formatAud, formatDate, BILLING_COPY). Previous: 659 → 688.

Stage 45 apps/web new tests (29):
- formatAud: returns $ for zero, formats 100/1999/10000/99900 cents, contains AUD identifier (6)
- formatDate: returns string, contains year, contains day number (3)
- BILLING_COPY.faq: ≥3 items, non-empty q, non-empty a (3)
- BILLING_COPY.compareRows: ≥5 rows, feature+free+standard+premium fields, boolean|string values, unique features (4)
- BILLING_COPY.trustBullets: exactly 3, non-empty strings (2)
- BILLING_COPY.paymentMethodNote: non-empty string, mentions Stripe (2)
- BILLING_COPY.cancelDialog: title non-empty, body is function, body includes date, mentions Free, confirm/keep labels (6)
- BILLING_COPY.pathways: is Record<string,string>, naplan mapping, icas mapping (3)

Previous count (Stage 44 close): 659 passed / 1 skipped = 660 total.

## Quality gates

| Gate                | Last status                                                              | Last run   |
| ------------------- | ------------------------------------------------------------------------ | ---------- |
| pnpm lint           | ✅ green (17 packages)                                                   | 2026-06-04 |
| pnpm typecheck      | ✅ green (17 packages, 0 turbo-cached — --force run per §Close-ritual)  | 2026-06-04 |
| pnpm test           | ✅ green (688 passed / 1 skipped — 689 total Vitest)                    | 2026-06-04 |
| pnpm test:replay    | ✅ green (58/58 assertions)                                              | 2026-05-16 |
| pnpm build          | ✅ green (exit 0, 21 routes)                                             | 2026-05-11 |
| RLS coverage        | ✅ 53/53 tables enabled + tested (no new tables Stage 45)               | 2026-05-03 |
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

- ADRs accepted: **34** (ADR-0001 through ADR-0034) — unchanged Stage 45 (no new ADR required)
- ADRs proposed: 0
- Workspaces: **17** — unchanged Stage 45
- Issues critical / high / medium / low: **0/0/8/12** — unchanged Stage 45 (no new issues)
  - Medium (8): ISSUE-0009, ISSUE-0010, ISSUE-0011, ISSUE-0014, ISSUE-0021, ISSUE-0023, ISSUE-0027, ISSUE-0030
  - Low (12): ISSUE-0015, ISSUE-0016, ISSUE-0017, ISSUE-0019, ISSUE-0020, ISSUE-0022, ISSUE-0024, ISSUE-0025, ISSUE-0028, ISSUE-0031, ISSUE-0032, ISSUE-0033
  - Resolved: ISSUE-0005, 0006, 0007, 0008, 0012, 0026, 0013, 0018, 0029 (Stage 41 audit triage)
- Open questions: **0** — Q-45.1–9 all resolved (Q-45.9 T2-tightened mid-impl); Q-44.1–5 all resolved; Q-42.7 closed
- Open bugs: 0
- Deviations logged: 17 total (8 resolved, 9 open) — DEV-20260604-1 added Stage 45 prep
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
  - DEV-20260604-1 ongoing — spec §25.6 cancel path `/billing/subscription/cancel` vs SDK `/billing/cancel`
- Tag state: `v1-phase-1` pushed to origin (Stage 41). `v1-phase-2-partial` pushed (Stage 41).

## Notes for next session

Stage 46 — Cancellation + Access Preservation UI (Day 63, 1-day budget).

Key notes for Stage 46:
- `useCancelSubscription` already live (Stage 43 + 45 cancel dialog uses it); Stage 46 adds access preservation verification and Playwright opt-in E2e spec.
- Verify access preservation through `current_period_end`: subscription data in EntitlementsProvider should reflect `is_active=true` until period end even after cancellation.
- Cancel dialog copy is already in `BILLING_COPY.cancelDialog` — Stage 46 may refine UI flow for cancellation journey (confirmation email note, access countdown).
- T5 light: cancel dialog polish only; no full layout sketch required.
- DEV-20260604-1 remains open: spec §25.6 vs SDK path drift — no Stage 46 changes needed.
- ISSUE-0032 (low): single STRIPE_WEBHOOK_SECRET — no Stage 46 changes, v1.1.
