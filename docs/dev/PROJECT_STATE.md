# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 22b — Session Selection + Practice screens (2026-05-12)
- Next stage: Stage 23 — Exam Engine (3-day budget, Days 29-31; **the critical a11y gate** per UI_CONTRACT §5.1)
- Days remaining (target 75): 47
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 stages closed: 15, 16, 17, 18, 19, 20, 21, **22 (split into 22a + 22b; both shipped)**. Phase 1 buffer: 9 days available; **+1 net banked** (was +2 from Stages 17 + 19 single-session closes; −1 spent on the Stage 22 split per DEV-20260511-1; debit booked at 22a evening close, no further buffer impact at 22b close).
- **Phase 1 UI cluster opened.** Stage 22 (Session Selection + Practice) shipped end-to-end. SDK ↔ Edge Function routing reconciled (22a). Visual screens consume the reconciled SDK (22b). DEV-20260511-1 resolved. Stages 23–25 (Exam Engine, Results, Student Dashboard) consume the same SDK shape. Two pre-existing SDK ↔ dispatcher correctness gaps surfaced during 22b composition (ISSUE-0007 lock-token plumbing, ISSUE-0008 error-code surface) — both medium, pre-launch, non-blocking for visual-screens delivery.

## Test suite

| Suite       | Status   | Count               | Last run   |
| ----------- | -------- | ------------------- | ---------- |
| Unit        | ✅ green  | 375/375             | 2026-05-12 |
| Integration | n/a      | n/a                 | n/a        |
| pgTAP       | ✅ green  | 451/451             | 2026-05-03 |
| Contract    | ✅ green  | 82/82               | 2026-05-10 |
| RLS         | ✅ green  | 451/451 (53 tables) | 2026-05-03 |
| E2E         | ⚠ opt-in | 2 specs (gated)     | n/a        |

Unit + contract breakdown: 97 (@mm/types) + 27 (@mm/sdk: 13 client + 10 keys + 4 hooks) + 59 (@mm/ui: 27 axe + 32 functional) + 110 (@mm/engines: 28 linear + 27 skill + 22 diagnostic + 33 adaptive) + 24 (@mm/content-svc: 13 endpoint contract + 11 cache — 5 Stage 18 + 6 Stage 21 hardening) + 30 (@mm/assessment-svc: 5 createSession + 6 respondToSession + 8 submitSession + 3 checkpointSession + 2 resumeSession + 1 abandonSession + 2 listRecentSessions + 3 idempotency middleware) + 28 (@mm/intelligence-svc: 9 helpers + 1 dedup + 4 L1 + 5 L2 + 3 L3a + 2 audit-log + 1 replay-determinism + 3 error paths). **Test count unchanged from Stage 22a close per stage discipline — no new test surface added at 22b (Stage 22b is page-level composition, no new primitives, no new SDK code).**

Contract count = 24 (content-svc) + 30 (assessment-svc) + 28 (intelligence-svc) = 82.

E2E: 2 specs, both `test.skip()`-guarded. (1) `apps/web/playwright/e2e/session-flow.spec.ts` — Stage 19 contract-style happy path (signup → respond ×5 → submit + outbox). (2) `apps/web/playwright/e2e/practice-flow.spec.ts` — **Stage 22b UI happy path** (signup → /session-selection → click Practice → answer 5 items → End session → assert /results/{id}). Both gated on `E2E_BASE_URL` / `E2E_TEST_PATHWAY_ID` / `E2E_SUPABASE_ANON`; the new spec also requires `E2E_WEB_URL`. CI integration deferred to Stage 26 per Q-19.9.

pgTAP/RLS not re-run for Stage 22b — no schema changes (web-only). **Pre-deploy gate from Stages 19+20 still applies**: `pnpm test:migration` for migrations 0012 + 0013 and `pnpm test:rls` must be run locally before any deploy (sandbox lacks Docker; see DAILY_LOG caveats).

## Quality gates

| Gate                | Last status                              | Last run   |
| ------------------- | ---------------------------------------- | ---------- |
| pnpm lint           | ✅ green (7 packages)                    | 2026-05-12 |
| pnpm typecheck      | ✅ green (10 packages)                   | 2026-05-12 |
| pnpm test           | ✅ green (375/375 unit + contract)       | 2026-05-12 |
| pnpm build          | ✅ green (7 packages — new routes detected: `/session-selection` + `/session/[id]/practice`) | 2026-05-12 |
| RLS coverage        | ✅ 53/53 tables enabled + tested         | 2026-05-03 |
| pnpm audit          | unknown — TODO measure                   | n/a        |
| pnpm test:migration | ⚠ NOT RUN for 0012 + 0013 (sandbox no Docker) | 2026-05-03 (last clean: 11 migrations) |

`@mm/content-svc`, `@mm/assessment-svc`, `@mm/intelligence-svc` all have typecheck + test scripts only (Q-19.12 precedent) — Deno-only deploy path. Workspace count: 10 (unchanged from Stage 20).

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95 |
| --------------------------------- | ---------- | ------------ |
| POST /sessions/{id}/respond       | 300 ms     | n/a          |
| POST /sessions/{id}/submit + sync | 5000 ms    | n/a          |
| Pipeline async                    | 30000 ms   | n/a          |
| Dashboard load                    | 2000 ms    | n/a          |

Latency measurement begins Stage 26 (load test). Stage 21 contract tests assert correctness + the watermark synthetic cost gate (mean over 100 iterations < 50 ms — 10× margin per Q-21.2). Real <5 ms watermark cost gate moves to Stage 26 against a warm Postgres pool.

## Open items

- ADRs accepted: 29 (ADR-0001 through ADR-0029). No new ADR at 22b close.
- ADRs proposed: 0
- Issues critical / high / medium / low: **0/0/4/0** (ISSUE-0005 — `apps/web/.env.local.example` hygiene, medium; ISSUE-0006 — intelligence-svc L3a bypasses skill-graph cache, medium, pre-launch; **ISSUE-0007 — SDK record/checkpoint/abandon hooks do not plumb `X-Session-Lock` header per ADR-0026, medium, pre-launch**; **ISSUE-0008 — assessment-svc dispatcher emits `CONFLICT` / `LOCK_CONFLICT` codes not in `@mm/types` `ErrorCodeSchema`, medium, pre-launch**)
- Open questions: 0 (Q-19.1..13 resolved 2026-05-08; Q-20.1..15 resolved 2026-05-09; Q-21.1..5 resolved 2026-05-09; Q-22.1..3 resolved 2026-05-11; **Q-22.4 resolved 2026-05-12 = A**)
- Open bugs: 0
- Deviations logged: 3 (DEV-20260430-1 resolved Stage 15; DEV-20260503-2 ongoing v1.1; **DEV-20260511-1 resolved 2026-05-12 by Stage 22b commit `b1dafe6`**)

## Notes for next session

Stage 23 morning. **Exam Engine — 3-day budget (Days 29-31)**. Most variant-heavy UI screen in v1: timer warn/danger/offline transitions, autosave (every 30s + on blur + on nav with idempotency-keyed `(item_id + sequence_number)` hash), question-map sidebar (240px desktop, bottom-sheet mobile), version-conflict + lock-expired + session-abandoned modals, submit-confirm dialog with unanswered count, adaptive section-banner (Stage 17 testlet routing), service-worker offline shell + IndexedDB queue. UI_CONTRACT §5.1 is the **a11y critical-screen contract** — axe-core zero serious/critical is a merge blocker. Visual references: SCREEN_SPECS §9 (line 488), UI_CONTRACT §5.1, `docs/mockups/07-exam-engine.html`, `docs/design/prototypes/external/portal-codebase-2026-05-06/ExamEngine.jsx` (visual reference only per `docs/design/prototypes/INDEX.md` prohibition list, never copy code in). Quota check on Claude Design before Day 29 — existing references may suffice. ISSUE-0007 + ISSUE-0008 are pre-launch and do not block Stage 23 (Exam Engine consumes the same SDK shape Stage 22b proved out). Pre-deploy gate (migrations 0012 + 0013 + RLS) remains pending local Docker run.
