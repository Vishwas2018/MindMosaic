# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 24 — Results screen (2026-05-14)
- Next stage: Stage 25 — Student Dashboard v1 (1-day budget, Day 33)
- Days remaining (target 75): 45
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 stages closed: 15, 16, 17, 18, 19, 20, 21, 22 (split into 22a + 22b), **23**, **24**. Phase 1 buffer: 9 days available; **+2 net banked** (unchanged — Stage 24 closed in 1 day against its 1-day budget, neutral on buffer. +2 carry from prior stages: +1 from Stage 17 + 19 single-session closes minus −1 from Stage 22 split DEV-20260511-1 + another +1 from Stage 23's single-session close against 3-day budget).
- **Phase 1 UI cluster closes at Stage 25.** Stage 24 (Results screen) is the second-to-last Phase 1 UI screen. Stage 25 (Student Dashboard) is the last. After Stage 25, Phase 1 moves to the audit/load-test/CI strip.

## Test suite

| Suite       | Status   | Count               | Last run   |
| ----------- | -------- | ------------------- | ---------- |
| Unit        | ✅ green  | 383/383             | 2026-05-14 |
| Integration | n/a      | n/a                 | n/a        |
| pgTAP       | ✅ green  | 451/451             | 2026-05-03 |
| Contract    | ✅ green  | 82/82               | 2026-05-10 |
| RLS         | ✅ green  | 451/451 (53 tables) | 2026-05-03 |
| E2E         | ⚠ opt-in | 4 specs (gated)     | n/a        |

Unit + contract breakdown: 97 (@mm/types) + 27 (@mm/sdk: 13 client + 10 keys + 4 hooks) + **67 (@mm/ui: 27 axe + 40 functional — was 63; +4 from FocusHeader: 1 axe + 3 functional)** + 110 (@mm/engines: 28 linear + 27 skill + 22 diagnostic + 33 adaptive) + 24 (@mm/content-svc: 13 endpoint contract + 11 cache — 5 Stage 18 + 6 Stage 21 hardening) + 30 (@mm/assessment-svc: 5 createSession + 6 respondToSession + 8 submitSession + 3 checkpointSession + 2 resumeSession + 1 abandonSession + 2 listRecentSessions + 3 idempotency middleware) + 28 (@mm/intelligence-svc: 9 helpers + 1 dedup + 4 L1 + 5 L2 + 3 L3a + 2 audit-log + 1 replay-determinism + 3 error paths). **+4 from Stage 24 FocusHeader (1 axe scan + 3 functional: onExit fires, centre/helper slots render, exitLabel prop).**

Contract count = 24 (content-svc) + 30 (assessment-svc) + 28 (intelligence-svc) = 82.

E2E: **4 specs**, all `test.skip()`-guarded. (1) `apps/web/playwright/e2e/session-flow.spec.ts` — Stage 19 contract-style happy path. (2) `apps/web/playwright/e2e/practice-flow.spec.ts` — Stage 22b UI happy path. (3) `apps/web/playwright/e2e/exam-flow.spec.ts` — Stage 23 keyboard-only happy path. (4) **`apps/web/playwright/e2e/results-flow.spec.ts` — Stage 24 scored happy path** (signup → session-selection → answer 5 items → submit → assert `/results/{id}` renders score % + "Start new session" CTA + keyboard tab focus). All four gated on `E2E_BASE_URL` / `E2E_TEST_PATHWAY_ID` / `E2E_SUPABASE_ANON`; specs (2)–(4) also require `E2E_WEB_URL`. CI integration deferred to Stage 26 per Q-19.9.

pgTAP/RLS not re-run for Stage 24 — no schema changes (frontend-only). **Pre-deploy gate from Stages 19+20 still applies**: `pnpm test:migration` for migrations 0012 + 0013 and `pnpm test:rls` must be run locally before any deploy (sandbox lacks Docker; see DAILY_LOG caveats).

## Quality gates

| Gate                | Last status                              | Last run   |
| ------------------- | ---------------------------------------- | ---------- |
| pnpm lint           | ✅ green (7 packages)                    | 2026-05-14 |
| pnpm typecheck      | ✅ green (10 packages)                   | 2026-05-14 |
| pnpm test           | ✅ green (383/383 unit + contract)       | 2026-05-14 |
| pnpm build          | ✅ green (7 packages — `/results/[id]` 2.51 kB First Load) | 2026-05-14 |
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

- ADRs accepted: **30** (ADR-0001 through ADR-0030; no new ADRs in Stage 24)
- ADRs proposed: 0
- Issues critical / high / medium / low: **0/0/7/1**
  - Medium (7): ISSUE-0005 (`apps/web/.env.local.example` hygiene), ISSUE-0006 (intelligence-svc L3a bypasses skill-graph cache), ISSUE-0007 (SDK X-Session-Lock header not plumbed), ISSUE-0008 (assessment-svc CONFLICT/LOCK_CONFLICT codes not in ErrorCodeSchema), ISSUE-0009 (IndexedDB + SW shell-cache v1.1 upgrade), ISSUE-0010 (adaptive section-boundary banner + DTO field), **ISSUE-0011** (Results screen 5 deferred content blocks: topic breakdown, perf insights, question review, mastery delta, proficiency map)
  - Low (1): **ISSUE-0012** (`.git/hooks/pre-commit` absent; BUILD_CONTRACT §11.2 trailer prohibition unenforced)
- Open questions: 0 (Q-24.1..7 resolved 2026-05-14; all prior questions resolved)
- Open bugs: 0
- Deviations logged: 3 (DEV-20260430-1 resolved Stage 15; DEV-20260503-2 ongoing v1.1; DEV-20260511-1 resolved 2026-05-12 by Stage 22b commit `b1dafe6`)

## Notes for next session

Stage 25 morning. **Student Dashboard v1 (`/`) — last Phase 1 UI screen, 1-day budget (Day 33)**. Closes the Phase 1 UI cluster; Phase 1 audit day triggers at Stage 25 close (per CLAUDE.md "every 5 stages" cadence — last audit was Stage 19).

Visual references: SCREEN_SPECS Screen 7 + "Dashboards" section, UI_CONTRACT, `docs/mockups/02-dashboard.html`, `docs/design/prototypes/external/portal-codebase-2026-05-06/StudentHome.jsx` + `StudentDashboard.jsx` (visual reference only per INDEX.md prohibition list — never copy code in). `tokens.css` wins all divergences.

**v1 minimal scope:**
- Greeting card (student name + pathway name)
- "Continue" or "Start first session" CTA (from `useListRecentSessions` — first consumer of Q-22.1 hook)
- Quick-start pathway tiles
- Mastery snapshot (skills_touched_count + placeholder bar — real data post-Stage 28)
- Recent sessions row (`useListRecentSessions`)
- Engagement strip (display-only: streak + sessions-this-week — stub if no DTO available)
- **NO Weekly Plan widget** (Stage 40)

**Side-task candidate (opportunistic):** ISSUE-0012 `commit-msg` hook (low severity; only if Dashboard closes with budget to spare).

**Audit day at Stage 25 close:** Full `OPEN_ISSUES.md` pruning pass (resolved → `## Resolved`), `QUESTIONS.md` review, `DEVIATIONS.md` check. ISSUE-0005..12 all candidates for triage.

Pre-deploy gate (migrations 0012 + 0013 + RLS) remains pending local Docker run. Stage 25 is frontend-only; gate stays open.
