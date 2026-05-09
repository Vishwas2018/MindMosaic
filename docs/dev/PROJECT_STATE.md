# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 34 — Notifications Service (2026-05-24)
- Next stage: Stage 35 — Plan Overrides (Day 49, 1-day budget)
- Days remaining (target 75): 27 (Day 48 of 75 complete)
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 complete: Stages 15–27 (13 stages). Phase 1 buffer at close: **+2 days banked**.
- Phase 2 in progress: Stages 28–34 all shipped within budget. **+2 days net banked entering Stage 35** (no buffer impact from Stages 28–34).

## Test suite

| Suite           | Status       | Count                          | Last run   |
| --------------- | ------------ | ------------------------------ | ---------- |
| Unit            | ✅ green      | 505 passed / 1 skipped         | 2026-05-24 |
| Integration     | n/a          | n/a                            | n/a        |
| pgTAP           | ✅ green      | 451/451                        | 2026-05-03 |
| Contract        | ✅ green      | 178/178                        | 2026-05-24 |
| E2E (Vitest)    | ✅ green      | 1/1 (assignments-svc lifecycle)| 2026-05-23 |
| E2E (Playwright)| ⚠ opt-in     | 5 specs (gated)                | n/a        |
| RLS             | ✅ green      | 451/451 (53 tables)            | 2026-05-03 |
| Replay          | ✅ green      | 58/58 assertions               | 2026-05-16 |

Unit + contract breakdown (full `pnpm -r run test` output):
101 (@mm/types) + 32 (@mm/sdk) + 67 (@mm/ui) + 115 (@mm/engines) + 24 (content-svc) + 30 (assessment-svc) + 53 (intelligence-svc) + 6 (jobs-worker) + 22 (analytics-svc) + 9 (orchestration-svc) + 19 (assignments-svc contract) + 1 (assignments-svc e2e) + 15 (notifications-svc contract) + 11 (apps/web) = **505 passed, 1 skipped**

Stage 34 adds +18: +15 (notifications-svc contract.test.ts) + +3 (@mm/types — 3 new Zod schemas auto-generate 3 new cases in schemas.test.ts).

Contract count = 24 (content-svc) + 30 (assessment-svc) + 53 (intelligence-svc) + 6 (jobs-worker) + 22 (analytics-svc) + 9 (orchestration-svc) + 19 (assignments-svc) + 15 (notifications-svc) = **178** (was 163 at Stage 33 close).

pgTAP/RLS not re-run for Stages 28–34 — no new RLS policies. Migration 0016 amends `fn_drain_outbox_batch` (OR REPLACE); no new tables or policies.

## Quality gates

| Gate                | Last status                                                     | Last run   |
| ------------------- | --------------------------------------------------------------- | ---------- |
| pnpm lint           | ✅ green (15 packages)                                          | 2026-05-24 |
| pnpm typecheck      | ✅ green (15 packages)                                          | 2026-05-24 |
| pnpm test           | ✅ green (505 passed / 1 skipped — full output captured)        | 2026-05-24 |
| pnpm test:replay    | ✅ green (58/58 assertions)                                     | 2026-05-16 |
| pnpm build          | ✅ green (7/7 packages)                                         | 2026-05-18 |
| RLS coverage        | ✅ 53/53 tables enabled + tested                                | 2026-05-03 |
| pnpm audit          | unknown — TODO measure                                          | n/a        |
| pnpm test:migration | ⚠ NOT RUN for 0012–0016 (sandbox no Docker)                    | 2026-05-03 (last clean: 11 migrations) |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95                                        |
| --------------------------------- | ---------- | --------------------------------------------------- |
| POST /sessions/{id}/respond       | 300 ms     | n/a — measurement requires deployed environment    |
| POST /sessions/{id}/submit + sync | 5000 ms    | n/a — measurement requires deployed environment    |
| Pipeline async                    | 30000 ms   | n/a — measurement requires deployed environment    |
| Dashboard load                    | 2000 ms    | n/a — measurement requires deployed environment    |

k6 load test (`k6/session-loop.js`) is ready for execution; nightly CI workflow (`.github/workflows/load-test.yml`) will run when `LOAD_TEST_BASE_URL` + `LOAD_TEST_TOKEN` secrets are configured post-deploy.

Stage 34 SLA note: outbox → notifications 5s wall-clock SLA (DEV-20260524-1) cannot be measured in sandbox (pg_cron worst-case ~120s). Contract tests mock the chain directly. Deferred to Stage 41 deploy gate.

## Open items

- ADRs accepted: **33** (ADR-0001 through ADR-0033)
- ADRs proposed: 0
- Workspaces: **15** (notifications-svc added at Stage 34)
- Issues critical / high / medium / low: **0/0/6/10**
  - Medium (6): ISSUE-0009 (IndexedDB + SW shell-cache v1.1 upgrade — DEV_PLAN §5 P1.6), ISSUE-0010 (adaptive section-boundary banner + DTO field — DEV_PLAN §5 P1.7), ISSUE-0011 (deferred content blocks: Results screen 5 stubs (a–e) + Dashboard mastery snapshot (f) — DEV_PLAN §5 P2.10), ISSUE-0014 (exam_date column + UI ingress — v1.1), ISSUE-0021 (auto-groups route shape query-vs-path-param arch drift — v1.1), ISSUE-0023 (Idempotency-Key enforcement deferred — v1.1)
  - Low (10): ISSUE-0013 (evening ritual test count methodology — fix applied from Stage 29), ISSUE-0015 (cohort_metric_cache category mismatch — v1.1), ISSUE-0016 (async_pipeline_event + analytics_audit_log observability parity — v1.1), ISSUE-0017 (high-fatigue alert deferred — v1.1), ISSUE-0018 (undocumented env vars: 5 service URL vars — INTELLIGENCE_SVC_URL, ANALYTICS_SVC_URL, ORCHESTRATION_SVC_URL, ASSESSMENT_SVC_URL, NOTIFICATIONS_SVC_URL), ISSUE-0019 (tooling guard: amend-over-pushed-commit pattern), ISSUE-0020 (POST /orchestration/generate-plan synchronous in v1; async deferred — v1.1), ISSUE-0022 (audit-log cursor pagination deferred to v1.1), ISSUE-0024 (real-time tracking upgrade cron → outbox-driven deferred to v1.1), ISSUE-0025 (notification spam guard: 1h dedup window production-tuning deferred — v1.1)
  - **Resolved at Stage 28:** ISSUE-0006
  - **Resolved at Stage 26:** ISSUE-0005, ISSUE-0007, ISSUE-0008
  - **Resolved at Stage 25 audit:** ISSUE-0012
- Open questions: 0 (Q-34.1–Q-34.6 all resolved)
- Open bugs: 0
- Deviations logged: 10 total (4 resolved, 6 open)
  - DEV-20260430-1 resolved Stage 15
  - DEV-20260503-2 ongoing v1.1 (content.recalibration no-op)
  - DEV-20260511-1 resolved Stage 22b
  - DEV-20260515-1 self-resolved Stage 25
  - DEV-20260518-1 ongoing — spec §5.1.4 student parameter defect
  - DEV-20260519-1 ongoing — exam_date column deferred; §12.1 projection branch null until v1.1
  - DEV-20260522-1 ongoing v1.1 — auto-groups query-vs-path-param (Stage 37 fix)
  - DEV-20260522-2 resolved Stage 32 — generate-assignment C-C-D-V gate placement error
  - DEV-20260523-1 ongoing v1.1 — Idempotency-Key enforcement deferred (assignments-svc)
  - DEV-20260524-1 ongoing — outbox→notifications 5s SLA not testable in sandbox (pg_cron worst-case ~120s); deferred to Stage 41 deploy gate

## Notes for next session

Stage 35 — Plan Overrides (Day 49, 1-day budget). Pre-read: confirm which tables plan overrides write to (likely `learning_plan` with an override column or a dedicated `plan_override` table — verify arch §4.6 and spec §13). Verify outbox pattern: does a plan override trigger a replan event or just a direct UPDATE?

T2 timing gap — second occurrence at Stage 34 (Stage 31 was first). Tightening rule now documented in DAILY_LOG.md Stage 34 retro: file mid-impl self-resolve Qs in same work session as resolving code, not deferred to pre-push verification.

T3 Option 3 hybrid now two stages of evidence (Stage 31 + Stage 34). Rule is stable: operator round-trip REQUIRED for Qs touching DTO shape / scope / schema / auth model; self-resolve PERMITTED for tight implementation details (thresholds, filter inclusivity, internal plumbing keys) with documented options + default.

Pre-deploy gate still pending: migrations 0012–0016 + RLS must be run locally before any deploy (sandbox lacks Docker).

Phase 1 Exit Report at `docs/dev/phase-1-exit-report.md`. Git tag `v1-phase-1` created locally; **push pending approval** — run `git push origin v1-phase-1` when ready.

ISSUE-0018 now at 5 undocumented env vars: `INTELLIGENCE_SVC_URL`, `ANALYTICS_SVC_URL`, `ORCHESTRATION_SVC_URL`, `ASSESSMENT_SVC_URL`, `NOTIFICATIONS_SVC_URL`. Address in docs/dev/deployment.md at v1 close or Stage 36.

Q-28.8 deferral: `SkillGraphCache.adjacency` lacks `strength` + `dependency_class` fields (Option B applied). `// Q-28.8:` grep markers at two sites in `intelligence-svc/handlers.ts`. Address in v1.1 if content team adds enriching edges.
