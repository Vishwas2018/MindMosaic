# Stage 49 Exit Report — Launch Gate Review + v1.0.0 Tag

**Date:** 2026-06-07
**Stage:** 49 (Day 73 per DEV_PLAN; actual Day 65 — 8 days ahead of schedule)
**Budget:** 2 days (DEV_PLAN Days 72–75); actual 1 day (Day 65)
**Preceding stage:** 48 — Hardening Pass (2026-06-07)
**Next:** v1.1 / launch-window operational verification

---

## §1 Conditional Go Verdict

**CONDITIONAL GO — Stage 49 closes. v1 build window complete.**

All sandbox-achievable launch gate items are resolved or documented. Deployed-environment items (k6 1h soak, 24h dead-letter soak, Supabase backup drill, Stripe test-mode E2E, content validation, 8 SLA measurements, Playwright 11 specs) are documented in §5 and §9 as launch-window prerequisites, consistent with the Conditional Go pattern applied at Phase 1 (Stage 27), Phase 2 (Stage 41), Phase 4 (Stage 47), and Stage 48.

The v1.0.0 tag is a **code-complete versioning marker**. It is not a production deploy authorization. The launch-window operator owns all items in §5 before any public traffic is admitted.

---

## §2 Launch Gate Checklist

Per DEV_PLAN Stage 49 (6 items):

| # | Item | Status |
|---|---|---|
| 1 | All Phase 4 slice exit criteria met | ✅ Stage 47 Phase 4 Exit Report |
| 2 | Load test at 500 concurrent green for 1 hour | ⏸ k6/session-loop.js; requires deployed env (launch-window) |
| 3 | `pipeline.dead_letter.count` = 0 for 24h | ⏸ Requires deployed env + real pipeline traffic (launch-window) |
| 4 | Backup + restore drill completed | ⏸ Requires deployed Supabase project (launch-window) |
| 5 | Stripe taxes + invoicing verified in test mode | ⏸ Requires Stripe test env + deployed billing-svc (launch-window) |
| 6 | Content seeded: 50 items, 10 misconceptions | ⏸ scripts/validate-content.ts exit 1 locally (no seeded content); launch-window |

Item 1 is the only sandbox-verifiable gate. Items 2–6 are environment-gated; all are required before production deploy.

---

## §3 Sandbox Deliverables Delivered

| Deliverable | Status |
|---|---|
| `docs/dev/v1.0.0-release-notes.md` (NEW) — tag message content | ✅ |
| `docs/dev/stage-49-exit-report.md` (this file) | ✅ |
| `docs/dev/PROJECT_STATE.md` — final snapshot (49/49 stages, v1 window closed) | ✅ |
| `docs/dev/DAILY_LOG.md` — Stage 49 final entry | ✅ |
| `docs/dev/DEVIATIONS.md` — DEV-20260607-1 + DEV-20260607-2 prepended | ✅ |
| `docs/dev/QUESTIONS.md` — Q-49.1..4 added to ## Resolved | ✅ |
| `docs/prompts/2026-06-07_stage-49.md` — C-C-D-V saved | ✅ |
| `pnpm install && pnpm turbo typecheck --force` close-ritual | ✅ (pre-commit) |
| `pnpm -r run lint` | ✅ (pre-commit) |
| `pnpm -r run test` → 696/697 unchanged | ✅ (pre-commit) |

---

## §4 DEV_PLAN Stage 49 Deliverable Discrepancies

Two pre-existing documentation imprecisions in DEV_PLAN Stage 49 were discovered during the T1 morning ritual pre-read. Both are filed as deviations (DEV-20260607-1, DEV-20260607-2). Neither affects code or correctness; both are documentation-only errors in the active stage definition text which CLAUDE.md anti-pattern 1 prohibits editing.

**DEV-20260607-1 — "all 47 stages ✅" in DEV_PLAN line 451.**
DEV_PLAN was authored when 47 stages existed; Stages 48 and 49 were added during the planning pass. PROJECT_STATE final snapshot records 49/49 stages closed (accurate). The "47" in DEV_PLAN line 451 is a pre-existing artifact. Resolution: note in DAILY_LOG; write accurate count in PROJECT_STATE; log deviation.

**DEV-20260607-2 — "from spec §4" citation in DEV_PLAN line 453.**
DEV_PLAN Stage 49 says "Launch gate checklist (from spec §4, v1-applicable items only)." Spec §4 is "Assessment Framework Specifications" (NAPLAN / ICAS / Selective / Singapore / Olympiad pathway specs) — not a launch readiness document. The 6 checklist items are self-authored in DEV_PLAN, not sourced from spec §4. The checklist items themselves are correct; only the citation is wrong. Resolution: note in DAILY_LOG; log deviation; no change to checklist items.

---

## §5 Deployed-Env Deferrals (Launch-Window Items)

These items cannot be completed in the sandbox environment. All are required before any production deploy. The launch-window operator is the owner.

| Item | Reason deferred | Required? |
|---|---|---|
| k6 1h 500-VU soak (`k6/session-loop.js`) | k6 binary absent; deployed Supabase + auth tokens required | Yes — BUILD_CONTRACT §10 SLAs |
| k6 billing-webhook.js execution | k6 binary absent; deployed billing-svc required | Yes — BUILD_CONTRACT §8 (webhook 300ms) + §10 |
| 8 numerical SLA measurements (`docs/dev/perf/measurements.md`) | Requires k6 against running services | Yes — all currently "not measured" |
| Playwright 11 specs / 15 tests | Deployed Supabase + service auth required | Yes — launch gate |
| `billing-cancel.spec.ts` | Deployed Stripe test environment required | Yes — cancel/uncancel/period-end flow |
| Stripe test-mode invoicing + tax verification | Stripe env vars absent in sandbox | Yes — launch gate item 5 |
| 24h `pipeline.dead_letter.count` soak | Requires deployed env + real async pipeline traffic | Yes — launch gate item 3 |
| Supabase backup + restore drill | Deployed project required for backup API | Yes — launch gate item 4 |
| `scripts/validate-content.ts` exit 0 | Local DB has no seeded content | Yes — launch gate item 6 |

Scripts are authored and deploy-ready:
- `k6/session-loop.js` — session loop 500 VU (pre-existing, Stage 22)
- `k6/billing-webhook.js` — webhook p95 + flag propagation (Stage 48)
- `scripts/validate-content.ts` — content seed validator (pre-existing)

---

## §6 Open Issues Carry-Forward

**0 critical / 0 high / 8 medium / 14 low** at Stage 49 close.

Medium (all v1.1 track):
- ISSUE-0009: offline persistence IndexedDB upgrade (Stage 23; P1.6)
- ISSUE-0010: adaptive section-boundary banner + `current_testlet_id` DTO (Stage 23; P1.7)
- ISSUE-0011: results screen content blocks deferred (Stage 24; P2.10)
- ISSUE-0014: `exam_date` column on `user_profile` missing; §12.1 projection branch incomplete (Stage 29)
- ISSUE-0021: `GET /analytics/auto-groups` route shape mismatch — query params vs arch path params (Stage 32)
- ISSUE-0023: Idempotency-Key not enforced server-side in assignments-svc (Stage 33)
- ISSUE-0027: Block 5 Topic Mastery Bars deferred; `class-mastery` endpoint absent (Stage 37)
- ISSUE-0030: teacher student detail ships NAPLAN tab only; pathway→strand mapping absent (Stage 38)

Low (all v1.1 track): ISSUE-0015, 0016, 0017, 0019, 0020, 0022, 0024, 0025, 0028, 0031, 0032, 0033, 0034, 0035.

All issues documented in `docs/dev/OPEN_ISSUES.md`. No critical or high items at v1 close.

---

## §7 Open Deviations Carry-Forward

**12 open deviations** at Stage 49 close (DEV-20260607-1 + DEV-20260607-2 added this stage).

| Deviation | Type | Status |
|---|---|---|
| DEV-20260503-2 | scope-reduction | ongoing v1.1 — `content.recalibration` cron PHASE-2 stub |
| DEV-20260519-1 | scope-reduction | ongoing v1.1 — `exam_date` column deferred (ISSUE-0014) |
| DEV-20260522-1 | substitution | ongoing v1.1 — auto-groups query-param vs path-param shape |
| DEV-20260523-1 | scope-reduction | ongoing v1.1 — Idempotency-Key not enforced assignments-svc |
| DEV-20260524-1 | scope-reduction | ongoing — 5s wall-clock SLA not testable in sandbox (deploy gate) |
| DEV-20260526-1 | substitution | ongoing — PathwayReadiness from learner profile, not analytics-svc |
| DEV-20260529-1 | substitution | ongoing v1.1 — 5-step wizard vs 4-step SCREEN_SPECS §22 |
| DEV-20260530-1 | substitution | ongoing v1.1 — tab labels Assigned/In Progress/Completed vs spec |
| DEV-20260530-2 | substitution | ongoing v1.1 — Review button vs dropdown (Stage 40) |
| DEV-20260604-1 | substitution | ongoing v1.1 — spec §25.6 cancel path drift |
| DEV-20260607-1 | process | accepted — DEV_PLAN "47 stages" vs delivered 49 |
| DEV-20260607-2 | process | accepted — DEV_PLAN Stage 49 "spec §4" citation error |

All deviations documented in `docs/dev/DEVIATIONS.md`.

---

## §8 DEV_PLAN §5 Post-Launch Backlog Summary

P1 (ship in v1.1, first 4 weeks):
- P1.1 Skill Graph Migration Worker (5d) — blocks skill graph republish
- P1.2 RepairEngine + Repair Sequences (8d) — core differentiator for misconception repair
- P1.3 Data Subject Rights / APP Compliance (4d) — export + delete automation
- P1.4 Stripe Dunning + Refund (3d) — graceful reminder sequence + refund handling
- P1.5 Full Observability v2 / OTel (3d) — per-trace debugging past ~1k MAU
- P1.6 Offline Persistence Upgrade: IndexedDB + Service Worker (2d) — queue survives reload
- P1.7 Adaptive Section-Boundary Banner + `current_testlet_id` DTO (2d) — exam UX polish

P2 (ship in v1.2): L6 Stretch Intelligence, L8 Content Loop, Cross-Pathway Intelligence, Long-Term Plans, Engagement Layer, Audit Cold Storage, Override Plan Item, Admin Jobs UI, Contract Test Staging, Results/Dashboard deferred blocks.

P3 (icebox): Additional pathways, Institutional Tier, Mobile, Advanced Intelligence, Scale/Pen test, Open Platform, Extended Response Marking.

Full list: `DEV_PLAN.md §5`.

---

## §9 Final Pre-Deploy Checklist

Combined from Phase 2 + Phase 4 + Stage 48 + Stage 49 carries.

| # | Item | Status |
|---|---|---|
| 1 | pnpm audit — log in security/findings.md | ✅ Done — Stage 48 |
| 2 | .env.example — verify Stripe + service URL keys present | ✅ Done — Stage 48 |
| 3 | git hooks active (pre-commit + commit-msg) | ✅ Active (pre-commit ran at Stage 48 prep commit — 24 tasks, 134ms) |
| 4 | 3-consecutive-commits criterion on origin/main | ✅ Single audit commit per operator instruction; pre-commit hooks active (24 tasks) |
| 5 | pnpm install + pnpm turbo typecheck --force (17/17, 0 cached) | ✅ Close-ritual complete |
| 6 | scripts/validate-content.ts exit 0 (50 items, 10 misconceptions) | ⏸ Exit 1 locally (no seeded content) — launch-window deployed env |
| 7 | Docker migrations 0001–0020 + pgTAP 451/451 | ✅ Done — Stage 48 (ISSUE-0036 fixed) |
| 8 | k6 soak 500 VU / 1h — session-loop.js | ⏸ k6 binary absent — launch-window |
| 9 | k6 billing-webhook.js — billing SLA p95s | ⏸ k6 binary absent — launch-window |
| 10 | Playwright 11 specs / 15 tests (deployed Supabase) | ⏸ Deployed Supabase required — launch-window |
| 11 | billing-cancel.spec.ts against deployed Stripe test env | ⏸ Deployed Stripe test env required — launch-window |
| 12 | Stripe test-mode — invoicing + tax verification | ⏸ Stripe env absent — launch-window |
| 13 | 24h pipeline.dead_letter.count = 0 (soak) | ⏸ Deployed env + real pipeline traffic — launch-window |
| 14 | Supabase backup + restore drill (staging project) | ⏸ Deployed project required — launch-window |
| 15 | 8 SLA measurements vs BUILD_CONTRACT §10 budgets | ⏸ All "not measured" — launch-window k6 runs |
| 16 | Stripe migrations 0017/0019/0020 deploy-order documented | ✅ docs/dev/deployment.md §Migration 0017/0019/0020 (Stages 44–46) |
| 17 | RLS coverage 53/53 tables (no new tables Stages 42–49) | ✅ No new tables; 451/451 pgTAP confirms |
| 18 | PROJECT_STATE.md final snapshot | ✅ Done — Stage 49 |
| 19 | DAILY_LOG.md final entry | ✅ Done — Stage 49 |
| 20 | stage-49-exit-report.md authored | ✅ Done — Stage 49 |
| 21 | v1.0.0-release-notes.md authored | ✅ Done — Stage 49 |
| 22 | v1.0.0 tag created on Stage 49 close commit | ✅ Created — Stage 49 (push = separate approval) |

**Summary:** 12 ✅ done / 10 ⏸ launch-window required.

---

## §10 v1 Build Statistics

| Metric | Value |
|---|---|
| Stages closed | 49 of 75 planned (Stages 1–49; Stage 22b = split from Stage 22) |
| Build window | Days 1–65 (planned Days 1–75; **10 days banked unused**) |
| Buffer at close | +10.5 days banked (DEV_PLAN allocated 26 days buffer; used ~15.5) |
| Vitest suite | 697 total — 696 passed / 1 skipped |
| pgTAP | 451/451 (migrations 0001–0020; 53 tables) |
| axe-core | 31 test files / 75 assertions |
| Playwright | 11 specs / 15 tests (gated; ground truth confirmed Stage 48 — ISSUE-0035) |
| ADRs accepted | 34 (ADR-0001 through ADR-0034) |
| Workspaces | 17 |
| Edge Functions | 12 (assessment-svc, content-svc, intelligence-svc, analytics-svc, orchestration-svc, notifications-svc, assignments-svc, users-svc, billing-svc + 3 Supabase-managed) |
| Migrations | 20 (0001–0020) |
| RLS policies | 53 tables enabled + tested |
| Open critical / high | 0 / 0 |
| Open medium / low | 8 / 14 |
| Open deviations | 12 |
| Open questions | 0 |
| Open bugs | 0 |
| Issues resolved in v1 | 9 prior (ISSUE-0005..8, 0012, 0013, 0018, 0026, 0029) + ISSUE-0036 (Stage 48) = 10 total |
| v1.0.0 tag SHA | Stage 49 close commit (push pending) |
