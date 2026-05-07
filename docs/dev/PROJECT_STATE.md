# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 25 — Student Dashboard v1 (2026-05-15)
- Next stage: Stage 26 — Phase 1 audit / load-test / CI strip
- Days remaining (target 75): 44
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 stages closed: 15, 16, 17, 18, 19, 20, 21, 22 (split into 22a + 22b), **23**, **24**, **25**. Phase 1 buffer: 9 days available; **+2 net banked** (unchanged — Stage 25 closed in 1 day against its 1-day budget, neutral on buffer. +2 carry from prior stages: +1 from Stage 17 + 19 single-session closes minus −1 from Stage 22 split DEV-20260511-1 + another +1 from Stage 23's single-session close against 3-day budget).
- **Phase 1 UI cluster CLOSED at Stage 25.** Student Dashboard shipped. Phase 1 now moves to the audit/load-test/CI strip (Stage 26+).

## Test suite

| Suite       | Status   | Count               | Last run   |
| ----------- | -------- | ------------------- | ---------- |
| Unit        | ✅ green  | 394/394             | 2026-05-15 |
| Integration | n/a      | n/a                 | n/a        |
| pgTAP       | ✅ green  | 451/451             | 2026-05-03 |
| Contract    | ✅ green  | 82/82               | 2026-05-10 |
| RLS         | ✅ green  | 451/451 (53 tables) | 2026-05-03 |
| E2E         | ⚠ opt-in | 5 specs (gated)     | n/a        |

Unit + contract breakdown: 97 (@mm/types) + 27 (@mm/sdk: 13 client + 10 keys + 4 hooks) + 67 (@mm/ui: 27 axe + 40 functional) + 110 (@mm/engines: 28 linear + 27 skill + 22 diagnostic + 33 adaptive) + 24 (@mm/content-svc: 13 endpoint contract + 11 cache) + 30 (@mm/assessment-svc: 5 createSession + 6 respondToSession + 8 submitSession + 3 checkpointSession + 2 resumeSession + 1 abandonSession + 2 listRecentSessions + 3 idempotency middleware) + 28 (@mm/intelligence-svc: 9 helpers + 1 dedup + 4 L1 + 5 L2 + 3 L3a + 2 audit-log + 1 replay-determinism + 3 error paths) + **11 (@mm/web: 3 findActiveSession + 2 sessionsThisWeek + 2 totalSkillsTouched + 4 greetingText — first apps/web unit test file, Stage 25)**. **+11 from Stage 25 dashboard-utils pure-function tests.**

Contract count = 24 (content-svc) + 30 (assessment-svc) + 28 (intelligence-svc) = 82.

E2E: **5 specs**, all `test.skip()`-guarded. (1) `apps/web/playwright/e2e/session-flow.spec.ts` — Stage 19 contract-style happy path. (2) `apps/web/playwright/e2e/practice-flow.spec.ts` — Stage 22b UI happy path. (3) `apps/web/playwright/e2e/exam-flow.spec.ts` — Stage 23 keyboard-only happy path. (4) `apps/web/playwright/e2e/results-flow.spec.ts` — Stage 24 scored happy path. (5) **`apps/web/playwright/e2e/dashboard-flow.spec.ts` — Stage 25 dashboard sections + stubs happy path** (signup → `/dashboard` → verify greeting + 6 sections + mastery stub + streak stub). All five gated on `E2E_BASE_URL` / `E2E_SUPABASE_ANON`; specs (2)–(5) also require `E2E_WEB_URL`. CI integration deferred to Stage 26 per Q-19.9.

pgTAP/RLS not re-run for Stage 25 — no schema changes (frontend-only). **Pre-deploy gate from Stages 19+20 still applies**: `pnpm test:migration` for migrations 0012 + 0013 and `pnpm test:rls` must be run locally before any deploy (sandbox lacks Docker; see DAILY_LOG caveats).

## Quality gates

| Gate                | Last status                              | Last run   |
| ------------------- | ---------------------------------------- | ---------- |
| pnpm lint           | ✅ green (7 packages)                    | 2026-05-15 |
| pnpm typecheck      | ✅ green (10 packages)                   | 2026-05-15 |
| pnpm test           | ✅ green (394/394 unit + contract)       | 2026-05-15 |
| pnpm build          | ✅ green (7 packages — `/dashboard` 2.91 kB First Load) | 2026-05-15 |
| RLS coverage        | ✅ 53/53 tables enabled + tested         | 2026-05-03 |
| pnpm audit          | unknown — TODO measure                   | n/a        |
| pnpm test:migration | ⚠ NOT RUN for 0012 + 0013 (sandbox no Docker) | 2026-05-03 (last clean: 11 migrations) |

`@mm/content-svc`, `@mm/assessment-svc`, `@mm/intelligence-svc` all have typecheck + test scripts only (Q-19.12 precedent) — Deno-only deploy path. Workspace count: 10 (unchanged from Stage 20).

Turborepo warning at Stage 25: "@mm/web#test: no output files found" — turbo.json `outputs: ["coverage/**"]` expects coverage but none is generated. Harmless; will address in Stage 26 CI setup.

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95 |
| --------------------------------- | ---------- | ------------ |
| POST /sessions/{id}/respond       | 300 ms     | n/a          |
| POST /sessions/{id}/submit + sync | 5000 ms    | n/a          |
| Pipeline async                    | 30000 ms   | n/a          |
| Dashboard load                    | 2000 ms    | n/a          |

Latency measurement begins Stage 26 (load test). Stage 21 contract tests assert correctness + the watermark synthetic cost gate (mean over 100 iterations < 50 ms — 10× margin per Q-21.2). Real <5 ms watermark cost gate moves to Stage 26 against a warm Postgres pool.

## Open items

- ADRs accepted: **30** (ADR-0001 through ADR-0030; no new ADRs in Stages 24–25)
- ADRs proposed: 0
- Issues critical / high / medium / low: **0/0/7/0**
  - Medium (7): ISSUE-0005 (`apps/web/.env.local.example` hygiene), ISSUE-0006 (intelligence-svc L3a bypasses skill-graph cache), ISSUE-0007 (SDK X-Session-Lock header not plumbed), ISSUE-0008 (assessment-svc CONFLICT/LOCK_CONFLICT codes not in ErrorCodeSchema), ISSUE-0009 (IndexedDB + SW shell-cache v1.1 upgrade), ISSUE-0010 (adaptive section-boundary banner + DTO field), **ISSUE-0011** (deferred content blocks: Results screen 5 stubs (a–e) + Dashboard mastery snapshot (f))
  - Low (0): ISSUE-0012 resolved at Stage 25 audit day (`.githooks/commit-msg` hook shipped)
- Open questions: 0 (Q-25.1..4 resolved 2026-05-15; all prior questions resolved)
- Open bugs: 0
- Deviations logged: 4 (DEV-20260430-1 resolved Stage 15; DEV-20260503-2 ongoing v1.1; DEV-20260511-1 resolved 2026-05-12; DEV-20260515-1 self-resolved at Stage 25)

## Notes for next session

Stage 26 morning. **Phase 1 audit / load-test / CI strip — first stage after Phase 1 UI cluster close.** Refer `DEV_PLAN.md` Stage 26 for exact deliverables.

Known pending items from Stage 25:
- Turborepo coverage-output warning in `@mm/web#test` — address in Stage 26 CI setup.
- Pre-deploy gate (migrations 0012 + 0013 + RLS) still pending local Docker run (sandbox lacks Docker). Applies to any deploy attempt.
- 5 E2E specs all `test.skip()`-guarded; CI integration is Stage 26 deliverable per Q-19.9.
- ISSUE-0005..0011 all open; ISSUE-0011 has 6 sub-bullets (a–f); all post-Stage 28+ targets.
