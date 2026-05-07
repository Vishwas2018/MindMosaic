# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 23 — Exam Engine (2026-05-13)
- Next stage: Stage 24 — Results screen (1-day budget, Day 32)
- Days remaining (target 75): 46
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 stages closed: 15, 16, 17, 18, 19, 20, 21, 22 (split into 22a + 22b), **23**. Phase 1 buffer: 9 days available; **+2 net banked** (was +1 entering Stage 23 — +2 from Stages 17 + 19 single-session closes minus −1 from Stage 22 split per DEV-20260511-1; Stage 23 closed in a single session against the explicit 3-day budget so **+2 banked back** for a net +2; Stages 20 + 21 + 22a + 22b also closed in single sessions against 1-day budgets — neutral on the buffer).
- **Phase 1 a11y gate cleared.** Stage 23 (Exam Engine) shipped with the merge-blocker a11y contract intact: keyboard-only navigation full sweep, axe-core zero serious/critical on the new `QuestionMap` primitive (toolbar pattern; `aria-current="step"` + per-cell `aria-disabled`), three-state server-authoritative timer with threshold-only `aria-live` announcements, focus-on-question-heading transitions, skip link as first focusable element on the focus shell. Offline resilience via in-memory `useResponseQueue` + `OfflineBanner` (ADR-0030; IndexedDB + service-worker upgrade tracked as ISSUE-0009 for v1.1). Adaptive section-boundary banner deferred to v1.1 via ISSUE-0010 pending DTO field. ISSUE-0007 amplification guard (`maxAttempts: 3` + bail-this-drain) verified working — no 409 retry loops.

## Test suite

| Suite       | Status   | Count               | Last run   |
| ----------- | -------- | ------------------- | ---------- |
| Unit        | ✅ green  | 379/379             | 2026-05-13 |
| Integration | n/a      | n/a                 | n/a        |
| pgTAP       | ✅ green  | 451/451             | 2026-05-03 |
| Contract    | ✅ green  | 82/82               | 2026-05-10 |
| RLS         | ✅ green  | 451/451 (53 tables) | 2026-05-03 |
| E2E         | ⚠ opt-in | 3 specs (gated)     | n/a        |

Unit + contract breakdown: 97 (@mm/types) + 27 (@mm/sdk: 13 client + 10 keys + 4 hooks) + **63 (@mm/ui: 27 axe + 36 functional — was 32; +4 from QuestionMap: 1 axe + 3 functional)** + 110 (@mm/engines: 28 linear + 27 skill + 22 diagnostic + 33 adaptive) + 24 (@mm/content-svc: 13 endpoint contract + 11 cache — 5 Stage 18 + 6 Stage 21 hardening) + 30 (@mm/assessment-svc: 5 createSession + 6 respondToSession + 8 submitSession + 3 checkpointSession + 2 resumeSession + 1 abandonSession + 2 listRecentSessions + 3 idempotency middleware) + 28 (@mm/intelligence-svc: 9 helpers + 1 dedup + 4 L1 + 5 L2 + 3 L3a + 2 audit-log + 1 replay-determinism + 3 error paths). **+4 from Stage 23 QuestionMap (1 axe scan + 3 functional: aria-current, aria-disabled non-trigger, enabled-cell trigger).**

Contract count = 24 (content-svc) + 30 (assessment-svc) + 28 (intelligence-svc) = 82.

E2E: **3 specs**, all `test.skip()`-guarded. (1) `apps/web/playwright/e2e/session-flow.spec.ts` — Stage 19 contract-style happy path (signup → respond ×5 → submit + outbox). (2) `apps/web/playwright/e2e/practice-flow.spec.ts` — Stage 22b UI happy path (signup → /session-selection → click Practice → answer 5 items → End session → assert /results/{id}). (3) **`apps/web/playwright/e2e/exam-flow.spec.ts` — Stage 23 keyboard-only happy path** (signup → /session-selection → focus first Exam button + Enter → answer 5 items keyboard-only → End session → submit-confirm dialog → assert /results/{id}). All three gated on `E2E_BASE_URL` / `E2E_TEST_PATHWAY_ID` / `E2E_SUPABASE_ANON`; specs (2) + (3) also require `E2E_WEB_URL`. CI integration deferred to Stage 26 per Q-19.9.

pgTAP/RLS not re-run for Stage 23 — no schema changes (frontend-only). **Pre-deploy gate from Stages 19+20 still applies**: `pnpm test:migration` for migrations 0012 + 0013 and `pnpm test:rls` must be run locally before any deploy (sandbox lacks Docker; see DAILY_LOG caveats).

## Quality gates

| Gate                | Last status                              | Last run   |
| ------------------- | ---------------------------------------- | ---------- |
| pnpm lint           | ✅ green (7 packages)                    | 2026-05-13 |
| pnpm typecheck      | ✅ green (10 packages)                   | 2026-05-13 |
| pnpm test           | ✅ green (379/379 unit + contract)       | 2026-05-13 |
| pnpm build          | ✅ green (7 packages — `/session/[id]/exam` 5.02 kB First Load) | 2026-05-13 |
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

- ADRs accepted: **30** (ADR-0001 through ADR-0030; ADR-0030 added Stage 23 morning for in-memory offline queue / IndexedDB + SW deferral to v1.1).
- ADRs proposed: 0
- Issues critical / high / medium / low: **0/0/6/0** (ISSUE-0005 — `apps/web/.env.local.example` hygiene, medium; ISSUE-0006 — intelligence-svc L3a bypasses skill-graph cache, medium, pre-launch; ISSUE-0007 — SDK record/checkpoint/abandon hooks do not plumb `X-Session-Lock` header per ADR-0026, medium, pre-launch; ISSUE-0008 — assessment-svc dispatcher emits `CONFLICT`/`LOCK_CONFLICT` codes not in `@mm/types` `ErrorCodeSchema`, medium, pre-launch; **ISSUE-0009 — upgrade offline persistence to IndexedDB queue + SW shell-cache in v1.1, medium**; **ISSUE-0010 — adaptive section-boundary banner pending server-authoritative `current_testlet_id` in `SessionStateDTO` + `RecordResponseResponse`, medium**)
- Open questions: 0 (Q-19.1..13 resolved 2026-05-08; Q-20.1..15 resolved 2026-05-09; Q-21.1..5 resolved 2026-05-09; Q-22.1..3 resolved 2026-05-11; Q-22.4 resolved 2026-05-12; **Q-23.1..5 resolved 2026-05-13**)
- Open bugs: 0
- Deviations logged: 3 (DEV-20260430-1 resolved Stage 15; DEV-20260503-2 ongoing v1.1; DEV-20260511-1 resolved 2026-05-12 by Stage 22b commit `b1dafe6`)

## Notes for next session

Stage 24 morning. **Results screen at `/results/[id]` — 1-day budget (Day 32)**. Visual bar already set at `docs/design/prototypes/stage-24_results-flagship.{html,jsx}` (Path B baseline per `docs/design/prototypes/INDEX.md`; the prototype replaces `docs/mockups/09-results.html` as the Stage 24 visual reference). Three mode variants per UI_CONTRACT §5.2: **scored** (NAPLAN/ICAS — hero ring at 120px with `stroke-dashoffset` animation, accuracy %, topic breakdown, performance insights, next action CTA), **practice** (no ring; mastery delta card; question summary), **diagnostic** (proficiency map — horizontal bars with confidence-interval shading; no score; status bands Developing/Proficient/Advanced); **repair** is v1.1 stub. Branch from `session_record.mode`. Print-safe per UI_CONTRACT §5.2.

Visual references: SCREEN_SPECS §11 (line 723), UI_CONTRACT §5.2 (line ~525), `docs/mockups/09-results.html` (Phase 0 baseline), `docs/design/prototypes/external/portal-codebase-2026-05-06/StudentResults.jsx` (visual reference only per INDEX.md prohibition list — never copy code in), plus the flagship prototype itself. `tokens.css` wins divergences.

**Side-task candidate**: lift `FocusHeader` to `@mm/ui` and adopt it in the Practice page (Stage 22b). Clears UI-DIVERGENCE entry (e) from Stage 23 close. Only if Stage 24's 1-day budget allows; otherwise carry forward.

ISSUE-0007 / 0008 / 0009 / 0010 remain open. The next audit day is Stage 25 close (per CLAUDE.md "every 5 stages" cadence — last audit was Stage 19, so the next falls at Stage 25 by stage count, though calendar drift may shift the trigger).

Pre-deploy gate (migrations 0012 + 0013 + RLS) remains pending local Docker run. Stage 24 is frontend-only; gate stays open.
