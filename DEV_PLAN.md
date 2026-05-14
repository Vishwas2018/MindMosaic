# MindMosaic — Development Plan (v1.0)

**Status:** Authoritative for v1 scope. **Hard 75-day plan.**
**Companion to:** `BUILD_CONTRACT.md`, `OWNERS.md`, `mindmosaic-spec-v4_4.md` Part III.5, `UI_CONTRACT.md`, `SCREEN_SPECS.md`, `DEV_PLAN.md` §5.
**Source specs (read-only):** `mindmosaic-spec-v4_4.md`, `mindmosaic-backend-arch-v2_0.md`.

The v1 scope is defined here. Anything in v4.4 not listed below is deferred to `DEV_PLAN.md` §5. For per-screen functional specifications (fields, validations, actions, API calls, error states), see `SCREEN_SPECS.md`.

---

## 0. Principles

1. **One stage per day minimum.** 49 stages over 75 days. Buffer = 26 days (35% — comfortable for solo work with realistic illness/blocker absorption).
2. **Linear single-branch.** One commit per stage to `main`. No branches.
3. **Exit criteria are binary.** A stage is done or it isn't. No "mostly done".
4. **Do not advance if CI is red.** Fix `main` before starting the next stage.
5. **If 2+ stages behind schedule, pull from §3 scope-cut menu before adding more work.** Do not silently de-scope.
6. **C-C-D-V prompts for Claude Code.** Context / Constraints / Deliverables / Verification. Archive every prompt to `docs/prompts/YYYY-MM-DD_stage-N.md`.

---

## 1. Phase Summary

26-day buffer distributed by phase risk. Day numbers below are the **target end-of-phase day**, not stage-specific deadlines — use buffer freely within a phase.

| Phase                                           | Days  | Stages | Buffer | Focus                                                                 | Exit criteria                                                                              |
| ----------------------------------------------- | ----- | ------ | ------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **0 — Foundations**                             | 1–17  | 1–14   | 3      | Scaffold, schema, RLS, auth, seed, CI                                 | Fresh DB applies, tenant isolation 100%, signup end-to-end, seed idempotent                |
| **1 — Core Assessment**                         | 18–39 | 15–27  | 9      | Engines, sessions, sync intelligence, exam+practice UI                | Student completes 30-item adaptive session; replay deterministic; 500 concurrent p95<300ms |
| **2 — Intelligence + Dashboards + Assignments** | 40–61 | 28–41  | 8      | Async pipeline, parent/teacher dashboards, assignments, notifications | Async pipeline p95<30s; teacher creates+publishes assignment; parent dashboard<2s p95      |
| **4-slice — Billing**                           | 62–71 | 42–47  | 4      | Stripe checkout, webhook, feature-flag propagation, billing UI        | Upgrade Free→Premium via Stripe propagates flags in 30s; cancellation preserves access     |
| **Launch Prep**                                 | 72–75 | 48–49  | 2      | Hardening, launch gate                                                | All SLAs green 3 consecutive days; `v1.0.0` tagged                                         |

**Phase buffer use rules:**

- Buffer day consumed when a stage exits more than 24h late.
- If a phase consumes all its buffer **before** phase exit → STOP and re-scope from §3 before starting the next phase.
- Buffer cannot be moved between phases (each phase's scope is sized to that phase's buffer).
- Phase 1 has the largest buffer because it contains the highest-risk stages: Stage 5 (atomic response function), Stage 20 (replay determinism), Stage 23 (exam engine + a11y gate).

---

## 2. Stage Catalogue

Each stage has: **Day**, **Title**, **Objective**, **Deliverables**, **Spec refs**, **Exit criteria**, **Risk**.

### Stage 1 — Day 1 — Monorepo & Tooling

- **Objective:** Turborepo + pnpm workspaces + TypeScript strict + ESLint + Prettier + Husky + GitHub Actions matrix + Supabase au-syd project.
- **Deliverables:** `turbo.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `apps/web` Next.js 14 App Router, empty `packages/{types,sdk,ui,core,engines}` with per-package `package.json` + `tsconfig.json`, `.github/workflows/ci.yml` (lint/typecheck/unit/migration-dryrun), `.gitmessage` template, Node 20 + pnpm 9 pinned in `engines` + `packageManager`. (`packages/engines-client` deferred to Stage 15 — see DEV-20260426-1, ADR-0001.)
- **Spec refs:** spec §4 PR 0.1; BUILD_CONTRACT §2, §8; Arch §8.2.
- **Exit criteria:** `pnpm install && pnpm turbo build` green on empty repo. CI matrix green on first commit. `git config commit.template .gitmessage` set.
- **Risk:** Low.

### Stage 2 — Day 2 — Migration 0001 — Enums + Tenancy + Auth

- **Objective:** All custom enums + tenancy/identity tables + RLS helpers + `handle_new_user` + `set_updated_at()`.
- **Deliverables:** `supabase/migrations/0001_enums_tenancy_auth.sql` + `0001_...down.sql` — all enums (Arch §2.1), `tenant`, `user_profile`, `parent_student_link`, `class_group`, `class_student`, `feature_flag` (two partial unique indexes), `admin_action_log`; RLS helpers `auth_tenant_id()`, `auth_user_id()`, `auth_role()`; `handle_new_user()` trigger implementing G1; universal `set_updated_at()` + triggers; RLS policies; pg-tap test `supabase/tests/rls/001_tenancy.sql`.
- **Spec refs:** Arch §1.2, §1.3, §1.6, §2.1, §2.2; Spec §20.2, §20.3.1; G1; G2.
- **Exit criteria:** `supabase db reset` applies. Down migration reverses cleanly. Tenant isolation zero cross-reads on 7 tables. Trigger populates `user_profile.tenant_id` on parent signup path.
- **Risk:** Trigger branching by role is the failure-prone bit. Test both branches.

### Stage 3 — Day 3 — Migration 0002 — Content & Skill Graph

- **Objective:** Skill graph with publish-guard, item versioning, misconception + repair-sequence tables.
- **Deliverables:** `0002_content_skill_graph.sql` — `skill_graph_version`, `skill_node`, `skill_edge` (CHECK constraints), `skill_migration_map` (table only, no worker), `publish_skill_graph()` with cycle detection + **G4 code guard**, `misconception`, `repair_sequence`, `stimulus`, `item`, `item_version`, `v_item_current` view; pg-tap tests: cycle detection length 2/3/5/10, publish guard fires when `skill_mastery` has data, `v_item_current` returns one row per active item.
- **Spec refs:** Spec §5.1–5.4, §22.9.1, §22.9.2; Arch §2.3; G4.
- **Exit criteria:** Publish on cyclic DAG fails with cycle path. Publish on clean DAG succeeds when `skill_mastery` empty. Publish blocked when `skill_mastery` populated unless `app.allow_unsafe_publish=true`.
- **Risk:** Medium. The recursive CTE for cycle detection is easy to get wrong — test exhaustively.

### Stage 4 — Day 4 — Migration 0003 — Assessment Config

- **Objective:** Framework/pathway/blueprint/profile/diagnostic tables.
- **Deliverables:** `0003_assessment_config.sql` — `framework_config`, `pathway`, `blueprint`, `assessment_profile`, `diagnostic_rule`; indexes; RLS Pattern F (admin-write, public-read for active); pg-tap test asserting non-admin writes rejected.
- **Spec refs:** Spec §2–§4, §6; Arch §2.4.
- **Exit criteria:** Non-admin INSERT returns 42501 (insufficient_privilege). `pathway.required_feature_key` present + indexed.
- **Risk:** Low.

### Stage 5 — Day 5 — Migration 0004 — Sessions + Canonical Events

- **Objective:** Core runtime: `session_record` with optimistic lock, immutable responses, atomic response write.
- **Deliverables:** `0004_sessions_events.sql` — `session_record` (one-active partial unique, optimistic lock on state transitions only per Arch §2.5 change log C3), `session_response` (immutable, dedup `(session_id, item_id, sequence_number)`), `response_telemetry` 1:1, `session_checkpoint` (upsert-only), `learning_event` monthly-partitioned via pg_partman (default partition from launch month), `create_session_response_atomic()` function, `api_idempotency_key`; pg-tap tests: atomic 4-write, version-conflict surface, dedup reject, one-active enforcement, checkpoint does NOT bump `session_record.version`.
- **Spec refs:** Spec §3.4–§3.7; Arch §2.5–§2.7.
- **Exit criteria:** Two concurrent response writes with same `expected_version` → one succeeds, other returns VERSION_CONFLICT. Checkpoint writes 100 times, `session_record.version` unchanged. Two concurrent sessions for same student → second rejected by partial unique.
- **Risk:** **High.** `create_session_response_atomic` is the heart of the system. Budget extra test time. Use SQL-level isolation tests, not application-level mocks.

### Stage 6 — Day 6 — Migration 0005 — Intelligence + Orchestration + Analytics

- **Objective:** All intelligence storage: mastery, velocity, behaviour, misconception, repair (table only), audit, plans, overrides, alerts, metric cache.
- **Deliverables:** `0005_intelligence_orchestration.sql` — `skill_mastery`, `learning_velocity`, `behaviour_profile`, `student_misconception`, `repair_record` (partial-unique concurrency indexes per Arch §2.3 change log C7), `intelligence_audit_log` partitioned monthly, `learning_plan`, `plan_revision`, `recommendation`, `plan_override`, `intervention_alert`, `cohort_metric_cache`; RLS Patterns A, B.
- **Spec refs:** Spec §7–§16; Arch §2.8–§2.10.
- **Exit criteria:** Concurrent repair INSERTs for same `(student_id, misconception_id)` → exactly one succeeds via partial unique. Audit log partition visible in `pg_class`.
- **Risk:** Medium. `repair_record` concurrency indexes have exact predicates — pull from Arch §2.3.

### Stage 7 — Day 7 — Migration 0006 — Jobs + Outbox + Rate Limit

- **Objective:** Platform tables for async processing.
- **Deliverables:** `0006_jobs_infra.sql` — `job_queue` (polling composite index, dedup partial unique on `pending|processing`, dead-letter index, stuck detection), `pipeline_event`, `outbox_event` (index on unprocessed), `rate_limit_bucket`; RLS Pattern G (service role only); pg-tap tests: EXPLAIN proves polling index used, duplicate pending job rejected.
- **Spec refs:** Arch §2.15, §5.1–§5.5; Spec §7.7.
- **Exit criteria:** All indexes created, explained, and used.
- **Risk:** Low.

### Stage 8 — Day 8 — Migration 0007 — New Domains

- **Objective:** Assignments + Billing + Engagement + Notifications tables (writers deferred per OWNERS).
- **Deliverables:** `0007_new_domains.sql` — `assignment`, `assignment_target` (XOR check), `assignment_session` + FK `session_record.assignment_id`; `subscription` (one-active-per-tenant partial unique), `billing_customer`, `invoice`, `billing_event`; `engagement_streak`, `achievement_definition`, `student_achievement`; `notification`; RLS.
- **Spec refs:** Spec §24, §25, §26, §27; Arch §2.11–§2.14.
- **Exit criteria:** XOR on `assignment_target` enforced (INSERT with both `student_id` and `class_id` fails). Forward FK `session_record.assignment_id` added cleanly.
- **Risk:** Low.

### Stage 9 — Day 9 — pg_cron Setup

- **Objective:** All scheduled jobs wired idempotently.
- **Deliverables:** `0008_cron.sql` scheduling crons from Arch §5.5 that are v1-relevant: `jobs.reaper`, `jobs.archive`, `pipeline.cleanup`, `idem.cleanup`, `abandoned.cleanup`, `plan.expiry`, `rate_limit.cleanup`, `content.recalibration` (PHASE-2 no-op stub per arch Part XI — DEV-20260503-2). Deferred entirely: `audit.archive` (cold storage v1.1), `engagement.streaks` (v1.1), `follow_up.probe` (v1.1). Idempotent via unschedule-first + `cron.schedule()` API — NOT direct INSERT into `cron.job` (ADR-0017; original "ON CONFLICT DO NOTHING" wording was documentation imprecision corrected at Stage 10 audit).
- **Spec refs:** Arch §5.5.
- **Exit criteria:** `SELECT jobname FROM cron.job` shows v1 crons. Direct function invocation of each works cleanly.
- **Risk:** Low.

### Stage 10 — Day 10 — Outbox Dispatcher

- **Objective:** Every-2s dispatcher drains `outbox_event` to `job_queue`.
- **Deliverables:** `supabase/functions/outbox-dispatcher/index.ts`; Vercel Cron entry in `vercel.json` (or Supabase Scheduled Trigger config) firing every 2s; `FOR UPDATE SKIP LOCKED` batch of 100; type-mapping table outbox→job_type (`session.submitted → pipeline.run_sync`, `assignment.published → notification.create`); integration test — insert 100 outbox events, run dispatcher, assert all become job_queue rows exactly once with correct `job_type`.
- **Spec refs:** Arch §5.1, §5.5; Spec §7.2, §27.3.
- **Exit criteria:** 100 events → 100 jobs, zero duplicates, zero misses. Dispatcher iteration metrics logged.
- **Risk:** Medium. SKIP LOCKED semantics need a real integration test, not unit test.

### Stage 11 — Day 11 — packages/types + Zod Schemas

- **Objective:** Source-of-truth DTOs for client + server + branded IDs + error envelope.
- **Deliverables:** `packages/types/src/` — one file per domain (identity, content, session, intelligence, orchestration, assignments, analytics, billing, engagement, notifications, admin); Zod schemas paired with TS interfaces; branded ID types (`TenantId`, `UserId`, `SessionId`, ...); `ErrorCode` enum + envelope schema; `SCHEMA_VERSION` const; test asserting every DTO in Arch §6 has a schema. Also add `ProficiencyMapDTO` (referenced by Stage 24 Results screen but missing from Arch §6).
- **Spec refs:** Arch §1.4, §1.5, Part VI; Spec §3.6, §19, §21.6.
- **Exit criteria:** `import { CreateSessionResponseSchema } from '@mm/types'` works from any package. Zero `any`. All DTO tests pass.
- **Risk:** Low. Tedious but mechanical.

### Stage 12 — Day 12 — packages/sdk + React Query Hooks

- **Objective:** Typed fetch client + React Query hooks for Phase 1 endpoints.
- **Deliverables:** `packages/sdk/src/client.ts` — fetch wrapper with JWT from Supabase, `X-Trace-Id` generation/propagation, `X-Client-Version: ${SCHEMA_VERSION}` auto-attach (G3), `Idempotency-Key` threading per method, typed `APIError` decoding; `packages/sdk/src/hooks/` one file per endpoint group; `packages/sdk/src/keys.ts` query-key factory `mmKeys.sessions.byId(id)` convention; unit tests.
- **Spec refs:** Arch §4, §1.7, §1.8, §7.3; G3.
- **Exit criteria:** `useCreateSession()` returns typed `CreateSessionResponse`. `APIError` narrowing works on `error.code`. Trace ID visible on every outgoing request.
- **Risk:** Low.

### Stage 13 — Day 13 — packages/ui Primitives + Design Tokens + axe-core Gate

- **Objective:** Design system baseline. axe-core in CI from this stage.
- **Deliverables:** `packages/ui/src/tokens.css` (CSS vars from `00-design-system.html`); primitives from Arch §8.4 Layout/Navigation/Data-display/Forms/Overlay/Feedback — `AppShell`, `Sidebar`, `TopBar`, `PageHeader`, `EmptyState`, `ErrorBoundary`, `LoadingState`, `NavLink`, `Tabs`, `Breadcrumbs`, `Card`, `StatTile`, `ProgressBar`, `SkillBar`, `Table`, `Input`, `Select`, `Checkbox`, `RadioGroup`, `TextArea`, `Button`, `IconButton`, `FormField`, `Dialog`, `Toast`, `Tooltip`; Storybook with `@storybook/addon-a11y`; focus-ring styles + 44px touch targets in tokens; CI extended to run axe on all stories.
- **Spec refs:** Arch §8.4, §8.10; BUILD_CONTRACT §9.
- **Exit criteria:** Storybook runs. Every primitive has ≥1 story. axe-core passes on all stories. Keyboard-only navigation works for every interactive primitive.
- **Risk:** Medium. Token extraction from mockup is fiddly; budget one full day.

### Stage 14 — Day 14 — apps/web Shell + Auth Service + Seed + Phase 0 Gate

- **Objective:** End-to-end signup → login → empty dashboard. Seed meeting G5. Phase 0 exit review.
- **Deliverables:**
  - `apps/web/src/app/` App Router layouts `(student)`, `(parent)`, `(teacher)`, `(admin)`, `(public)`
  - `apps/web/src/middleware.ts` — JWT role read, redirect by role, unauth → `/login`
  - `AuthProvider` + `EntitlementsProvider` (stub entitlements from `/users/me`)
  - Error boundary per layout
  - `supabase/functions/auth-svc/` — `/auth/signup` (G1 branching), `/login`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password` with rate limits
  - `supabase/functions/users-svc/` — `/users/me` GET/PATCH, `/users/me/children` GET/POST
  - Signup + login pages implementing `authentication.html`
  - `supabase/seeds/` 6 files matching OWNERS §seed description; G5 content (50 items, 10 misconceptions, 2 stimuli)
  - `scripts/validate-content.ts` + `scripts/set-tenant-tier.ts`
  - CI extended: `pnpm test:rls`, `pnpm test:migration`, `pnpm validate:content`
  - `docs/dev/PROJECT_STATE.md` Phase 0 exit signed
- **Spec refs:** Arch §4.1, §8.3, §8.5; Spec §20.2; G1, G2, G5
- **Exit criteria:**
  1. Parent signup → email verify → login → `(student)` layout (actually parent layout) loads.
  2. Seed idempotent: `pnpm seed && pnpm seed` produces same row counts.
  3. `validate-content.ts` asserts G5 counts.
  4. CI green on all jobs.
  5. Phase 0 exit checkboxes all ticked in `docs/dev/PROJECT_STATE.md`.
- **Risk:** **High.** This is the most-work stage in Phase 0. Consider splitting into 14a (shell + auth) and 14b (seed + CI gate) if falling behind — using buffer day.

---

### Phase 1 — Core Assessment Flow (Days 18–39, 13 stages, 22-day window with 9-day phase buffer)

> Phase 1 has 22 days available (Days 18–39). Stage day numbers below are estimates within the phase window; use buffer freely within the phase. Phase exits at Day 39.

### Stage 15 — Day 18 — Engine Contracts + LinearEngine

- **Objective:** `AssessmentEngine` interface + ICAS linear implementation.
- **Deliverables:** `packages/engines/src/contracts.ts` — `AssessmentEngine` interface from Spec §3.1, `EngineState`, `TerminationSignal`, `ScoreResult` types; `packages/engines/src/linear.ts` — `LinearEngine` with back-nav, flag, session timer; test harness + unit tests (golden 30-item session, termination at max, nav edge cases); `packages/engines-client/` — `package.json` (`@mm/engines-client`, browser-safe, peer dep `@mm/engines`), `tsconfig.json`, `src/index.ts` re-exporting contract types only (no Node-only deps). (Moved from Stage 1 — see DEV-20260426-1, ADR-0001.)
- **Spec refs:** Spec §3.1, §3.2.2, §4.2; internal v1.1 plan
- **Exit criteria:** All engine unit tests green. Full 30-item session through harness returns expected score. `import { AssessmentEngine } from '@mm/engines-client'` resolves correctly from `apps/web`.

### Stage 16 — Day 19 — SkillEngine + DiagnosticEngine

- **Objective:** Practice + diagnostic engines.
- **Deliverables:** `packages/engines/src/skill.ts` — mastery-driven next-item, up/down difficulty rule, optional timer, immediate feedback; `packages/engines/src/diagnostic.ts` — binary-search-over-difficulty, confidence termination, emits proficiency map; unit tests (cognitive load >0.8 reduces difficulty; mastery threshold terminates).
- **Spec refs:** Spec §3.2.3, §3.2.4
- **Exit criteria:** Both engines pass unit tests in harness.

### Stage 17 — Days 20–21 — AdaptiveEngine (NAPLAN)

- **Objective:** Testlet routing for NAPLAN with stage timer + writing stage.
- **Deliverables:** `packages/engines/src/adaptive.ts` — testlet routing per `framework_config.adaptive_rules`, stage timer (server-authoritative), stage-bound back-nav (not cross-stage), writing-stage text capture (no auto-marking); unit tests: routing table honoured, stage boundaries enforced, back-nav blocked across stages.
- **Spec refs:** Spec §3.2.1, §4.1
- **Exit criteria:** 3-stage NAPLAN session through harness routes correctly per seed's routing table.
- **Risk:** Medium. Routing table JSON structure must match seed exactly.

### Stage 18 — Day 22 — Content Service

- **Objective:** Content endpoints + skill graph cache.
- **Deliverables:** `supabase/functions/content-svc/` — `/pathways` (entitlement-filtered), `/pathways/{slug}`, `/assessment-profiles`, `/content/items/{id}`, `/content/select` (blueprint-driven deterministic ordering), `/content/search`, `/skill-graphs/active`; in-module-scope skill graph cache (shared `packages/core/src/skill-graph-cache.ts` — Map<skill_id, record> + adjacency map, 1h TTL, watermark check); contract tests.
- **Spec refs:** Arch §4.2, §5.3
- **Exit criteria:** `/content/select` returns blueprint-compliant items. Cache hit rate 100% after first load. Cache invalidates on graph publish.

### Stage 19 — Days 23–24 — Assessment Service

- **Objective:** Session lifecycle endpoints.
- **Deliverables:** `supabase/functions/assessment-svc/` with all endpoints listed in OWNERS; feature-flag check on create; `create_session_response_atomic` invocation; `/submit` writes `outbox_event` + invokes sync pipeline inline; idempotency for all POSTs; rate limiting via `rate_limit_bucket`; `_shared/` middleware (idempotency, trace-id, error envelope, feature-gate); contract tests; Playwright e2e — signup → session create → 5 responses → submit → score returned.
- **Spec refs:** Arch §4.3, §7.3; Spec §3.6, §21.0.2.
- **Exit criteria:** Version conflict surfaces 409. Idempotency replay returns cached response. One-active-session DB-enforced. E2E passes end-to-end.
- **Risk:** **High.** Most complex service. Budget 2 days.

### Stage 20 — Day 25 — Intelligence Service Sync (L1 + L2 + L3a)

- **Objective:** Sync intelligence inline from `/sessions/submit` within 3s SLA.
- **Deliverables:** `supabase/functions/intelligence-svc/` — `/intelligence/process-session/{id}` (service-role only, called inline from submit); L1 Foundation (batch UPSERT `skill_mastery`, recompute `learning_velocity` over 14-day window, write `intelligence_audit_log` with `algorithm_version`); L2 Behaviour (per-response `guess_probability` in `learning_event.metadata`, fatigue, persistence; UPDATE `behaviour_profile` with defaults-blend per Spec §9.6); L3a Causal-scoped (touched skills + depth-1 prerequisites only; misconception from `distractor_rationale`; UPSERT `student_misconception`); per-step `pipeline_event` rows; replay-determinism integration test.
- **Spec refs:** Spec §7.2, §7.4.2, §8, §9, §10; Arch §5.2.
- **Exit criteria:** Given fixed input events, output is byte-identical. Algorithm version recorded. Sync p95 < 3s with warm cache under 50 concurrent sessions.
- **Risk:** **High.** Replay determinism is hard — no floats with non-deterministic order, no `Math.random`, no timestamps as inputs.

### Stage 21 — Day 26 — Skill Graph Cache Production Hardening

- **Objective:** Ensure cache is production-correct.
- **Deliverables:** Cold-start cache load + 1h TTL + version watermark check; integration test — first request cold-loads, 1000 subsequent requests skip DB, cache invalidates on publish.
- **Spec refs:** Arch §5.3, §9.3.
- **Exit criteria:** Watermark check cost < 5ms per request.

### Stage 22 — Day 27 — Session Selection + Practice Screens

- **Objective:** First student-facing screens.
- **Deliverables:** `apps/web/src/app/(student)/session-selection/page.tsx` per `session-selection.html` — entitled pathways only, locked pathways show upgrade prompt, recent sessions via `SessionSummaryDTO`; `apps/web/src/app/(student)/session/[id]/practice/page.tsx` per `practice.html` — immediate feedback, in-session summary modal; Playwright e2e.
- **Spec refs:** internal v1.1 plan
- **Exit criteria:** Student navigates to practice session, completes 5 items with feedback, sees summary.

### Stage 23 — Days 28–30 — Exam Engine Screen (a11y Gate)

- **Objective:** **The single most critical v1 UI stage.** Exam engine for Adaptive + Linear with full a11y.
- **Deliverables:** `apps/web/src/app/(student)/session/[id]/exam/page.tsx` per `exam_engine.html` — server-authoritative timer (client sync on each respond), autosave every 30s + on blur (fire-and-forget), `X-Session-Lock` on every respond, navigation from `CreateSessionResponse.navigation`, question map sidebar, flag button, offline queue (local storage + replay on reconnect with idempotency keys); **a11y:** full keyboard nav (Tab to every control, Space/Enter selects, arrow keys on question map), `aria-live="polite"` on timer + feedback, `aria-live="assertive"` on timer-expiry warnings, focus moves to question heading on transition, visible focus on every control, screen-reader labels on icon-only buttons; Playwright e2e keyboard-only completion + axe scan zero serious/critical.
- **Spec refs:** internal v1.1 plan; BUILD_CONTRACT §9.
- **Exit criteria:** Keyboard-only user completes full 30-item session. axe-core: zero serious/critical. Offline: disable network mid-session, answer 3 items, re-enable, verify replay.
- **Risk:** **High.** 3 days allocated. If slipping, simplify offline queue (accept minimal replay) but DO NOT compromise a11y gate.

### Stage 24 — Day 31 — Results Screen

- **Objective:** Mode-aware results.
- **Deliverables:** `apps/web/src/app/(student)/results/[id]/page.tsx` per `results.html` — scored variant (hero ring, topic breakdown, insights, next action), practice variant (no ring, mastery delta, summary), diagnostic variant (proficiency map — bars + confidence intervals, status bands, no score); repair variant stub for v1.1; branch from `session_record.mode`; Playwright e2e for each mode.
- **Spec refs:** Spec §19; G5 (uses `ProficiencyMapDTO` added in Stage 11).
- **Exit criteria:** Each mode's variant renders correctly. No scored components appear for diagnostic mode.

### Stage 25 — Day 32 — Minimal Student Dashboard

- **Objective:** Student home with continue-last + mastery snapshot.
- **Deliverables:** `apps/web/src/app/(student)/page.tsx` minimal `dashboard.html` subset — "Continue last" card (active/interrupted session), mastery snapshot from `/intelligence/learner-profile`, recent sessions table, start-assessment tiles; no weekly plan yet (Stage 40).
- **Spec refs:** internal v1.1 plan
- **Exit criteria:** Logged-in student sees continue-last when applicable, mastery bars for seeded skills.

### Stage 26 — Days 33–34 — Load Test + Replay Determinism

- **Objective:** Phase 1 SLA verification.
- **Deliverables:** `k6/session-loop.js` — 500 concurrent sessions across 20 tenants; CI nightly run; `scripts/test-scoring.ts` — replay 50 deterministic sessions and assert byte-identical `skill_mastery` rows.
- **Spec refs:** internal v1.1 plan; BUILD_CONTRACT §10.
- **Exit criteria:** `session.respond.latency_p95 < 300ms`. Zero cross-tenant reads under load. Replay determinism: 50/50 sessions identical.
- **Risk:** Medium. First time hitting production DB hard — expect index/query tuning needed.

### Stage 27 — Day 35 — Phase 1 Exit Review

- **Objective:** Phase 1 gate.
- **Deliverables:** `docs/dev/PROJECT_STATE.md` Phase 1 all checked, `DAILY_LOG.md` Phase 1 reviewed, git tag `v1-phase-1`, any Phase 1 issues logged in `DEV_PLAN.md` §5 if deferred.
- **Exit criteria:** All Phase 1 exit criteria green (spec §4). No regressions in CI for 3 consecutive commits.

---

### Phase 2 — Intelligence + Dashboards + Assignments (Days 40–61, 14 stages, 22-day window with 8-day phase buffer)

> Phase 2 has 22 days available (Days 40–61). Stage day numbers below are estimates within the phase window; use buffer freely within the phase. Phase exits at Day 61.

### Stage 28 — Days 40–41 — Job Worker + L3b Causal Full

- **Objective:** Generic job worker + first async pipeline step.
- **Deliverables:** `supabase/functions/jobs-worker/` — polls `job_queue` with `FOR UPDATE SKIP LOCKED` ordered by `(priority DESC, scheduled_at ASC)`, exponential backoff retry per job-type config, dead-letter handling, poison detection, per-tenant concurrent throttle, stuck-worker reaper; `pipeline.causal.evaluate_full` job (L3b) — `traverse_upstream` + `traverse_downstream` from Spec §5.1.3/4, refined misconceptions, audit log; failure-injection integration test.
- **Spec refs:** Arch §5; Spec §7.2, §10.2
- **Exit criteria:** 500 jobs enqueued, all processed, zero duplicates. Failure injection drives retries then dead-letter.

### Stage 29 — Day 42 — L5 Predictive

- **Objective:** Readiness forecasting.
- **Deliverables:** `pipeline.predictive_refresh` job — exam readiness, mastery timeline per Spec §12, cached 1h TTL in `cohort_metric_cache` keyed on `(student_id, pathway)`; `/intelligence/predictions/{student_id}/{pathway_slug}` endpoint.
- **Spec refs:** Spec §12
- **Exit criteria:** Prediction returns for seeded student with 10+ sessions.

### Stage 30 — Day 43 — L7 Teacher Intelligence

- **Objective:** Auto-grouping + intervention alerts.
- **Deliverables:** `pipeline.teacher_refresh` job — k-means clustering on feature vectors per Spec §14.1, intervention alerts per §14.2 trigger rules; `/analytics/auto-groups`, `/analytics/intervention-alerts` endpoints.
- **Spec refs:** Spec §14
- **Exit criteria:** Seeded class with 3 students produces groupings and at least one alert trigger.

### Stage 31 — Day 44 — L9 Orchestration Weekly Plan

- **Objective:** Plan generation.
- **Deliverables:** `pipeline.orchestration_replan` job with idempotency (skip if `learning_plan.updated_at > job scheduled_at`); priority queue per Spec §16.2; writes `learning_plan` (supersedes prev) + `plan_revision` + audit log; respects `plan_override`; `GET /orchestration/plan/{student_id}/current` + `POST /orchestration/generate-plan/{student_id}`.
- **Spec refs:** Spec §16
- **Exit criteria:** Plan regeneration deterministic. Override honoured. `stale_since` set on failure path.

### Stage 32 — Day 45 — Intelligence + Analytics Endpoints Complete

- **Objective:** Round out Intelligence + Analytics endpoints.
- **Deliverables:** `/intelligence/learner-profile`, `/intelligence/causal-map`, `/intelligence/behaviour-profile`, `/intelligence/audit-log`, `/intelligence/explain/{decision_id}` (simplified explanation shape); `/analytics/cohort/{group_id}`, `/analytics/pathway-readiness/{student_id}/{pathway_slug}`, `/analytics/generate-assignment`; all return DTOs with `stale_since` on degradation.
- **Spec refs:** Arch §4.5, §4.7
- **Exit criteria:** Contract tests green for every endpoint.

### Stage 33 — Days 46–47 — Assignments Service

- **Objective:** Full assignment lifecycle.
- **Deliverables:** `supabase/functions/assignments-svc/` all endpoints; `POST /assignments/{id}/publish` materialises `assignment_session` rows + writes `outbox_event` for notifications; `POST /assignments/{id}/start` creates session with `assignment_id` populated (delegates to assessment-svc); daily cron `assignments.mark_overdue` transitions past-due to `overdue`; e2e: teacher creates → publishes → student sees → starts → completes → tracking updates.
- **Spec refs:** Spec §24; Arch §4.8
- **Exit criteria:** Full e2e flow passes.

### Stage 34 — Day 48 — Notifications Service

- **Objective:** In-app notifications via outbox.
- **Deliverables:** `supabase/functions/notifications-svc/` — `/notifications/me`, mark-read endpoints; domain events via outbox produce `notification` rows (`assignment_assigned`, `plan_updated`, `intervention_alert`); `Bell` UI component with unread count; test — 10 outbox events → 10 notifications visible in `/notifications/me`.
- **Spec refs:** Spec §27; Arch §4.11
- **Exit criteria:** End-to-end: assignment publish → notification appears for student within 5s.

### Stage 35 — Day 49 — Plan Overrides

- **Objective:** Parent/teacher can pin/dismiss.
- **Deliverables:** `POST /orchestration/overrides`, `DELETE /orchestration/overrides/{id}` (for `pin_skill` + `dismiss_recommendation` types only; `override_plan_item` deferred); orchestration consumes `plan_override` on replan; test — pinned skill appears in plan, dismissed recommendation suppressed, expiry respected (14-day default).
- **Spec refs:** Spec §16.6.1
- **Exit criteria:** Override created → next replan honours it. Expiry auto-removes.

### Stage 36 — Days 50–51 — Parent Dashboard

- **Objective:** Full parent view.
- **Deliverables:** `apps/web/src/app/(parent)/page.tsx` per `parent-dashboard.html` — child switcher (reads `parent_student_link`), readiness ring, subject areas, recent sessions, "What we noticed"/"What would help" cards composed from `ExplanationDTO` via `packages/core/src/explain-format.ts` versioned copy-builder; Playwright e2e; axe-core zero serious/critical.
- **Spec refs:** internal v1.1 plan
- **Exit criteria:** Parent sees linked child's mastery, misconceptions, recent sessions, cards render with explanations.

### Stage 37 — Days 52–53 — Teacher Dashboard

- **Objective:** Full teacher view.
- **Deliverables:** `apps/web/src/app/(teacher)/page.tsx` per `teacher-dashboard.html` — class KPIs, intervention alerts banner from `/analytics/intervention-alerts`, student performance table, topic mastery bars, assignments widget; e2e.
- **Spec refs:** internal v1.1 plan
- **Exit criteria:** Seeded class of 3 students visible with alerts + KPIs.

### Stage 38 — Day 54 — Teacher Student Detail

- **Objective:** Per-student drill-down.
- **Deliverables:** `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx` per `teacher-student-detail.html` — strand performance, misconceptions, recent activity, action buttons (assign, view plan). *(Path corrected Q-38.4: was missing `/teacher/` segment inside routing group; fixed at Stage 38 prep.)*
- **Spec refs:** internal v1.1 plan
- **Exit criteria:** Click student in dashboard → detail loads with complete profile.

### Stage 39 — Day 55 — Assignment Engine (Teacher UI)

- **Objective:** Teacher creates/publishes assignments.
- **Deliverables:** `apps/web/src/app/(teacher)/assignments/page.tsx` per `assignment-engine.html` — multi-step creation wizard, auto-generation via `/analytics/generate-assignment`, tracking view, publish action.
- **Spec refs:** internal v1.1 plan
- **Exit criteria:** Teacher creates assignment, auto-generates option works, publishes → students see in their list.

### Stage 40 — Day 56 — Student Assignments + Dashboard v2

- **Objective:** Student assignment list + full dashboard with plan.
- **Deliverables:** `apps/web/src/app/(student)/assignments/page.tsx` per `student-assignments.html` — tabs Assigned/In-Progress/Completed, overdue markers; upgrade `apps/web/src/app/(student)/page.tsx` — add Weekly Learning Plan widget from `LearningPlanDTO`, Quick Insights from Causal+Behaviour, notifications bell with unread badge.
- **Spec refs:** internal v1.1 plan
- **Exit criteria:** Student sees assignments + weekly plan; bell badge correct.

### Stage 41 — Day 57 — Phase 2 Exit Review

- **Objective:** Phase 2 gate.
- **Deliverables:** k6 run at 1000 concurrent submissions; async pipeline p95 < 30s verified; dead-letter < 0.5% over 24h soak; parent dashboard < 2s p95; `docs/dev/PROJECT_STATE.md` Phase 2 all checked; git tag `v1-phase-2-partial` (remainder deferred).
- **Exit criteria:** All numerical SLAs hit. No stage regressed. Any issues logged in `DEV_PLAN.md` §5.

---

### Phase 4 Slice — Billing (Days 62–71, 6 stages, 10-day window with 4-day phase buffer)

> Phase 4 slice has 10 days available (Days 62–71). Stage day numbers below are estimates within the phase window; use buffer freely within the phase. Phase exits at Day 71.

### Stage 42 — Days 62–63 — Stripe Integration + Webhook

- **Objective:** Stripe account wired + webhook processor.
- **Deliverables:** Stripe products + prices configured (Standard monthly/yearly, Premium monthly/yearly, AU GST via Stripe Tax); `supabase/functions/billing-svc/webhook.ts` — signature verification within 300ms before any state change, writes to `billing_event` atomically, processes via `pipeline.billing_event_apply` job; events: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid/payment_failed`; duplicate `stripe_event_id` is no-op; test with `stripe listen` + 50 replayed events.
- **Spec refs:** Spec §25; Arch §4.9; G2.
- **Exit criteria:** 50 duplicate webhooks processed idempotently. Invalid signature returns 400 in <300ms + writes `billing_event` with `processing_error='invalid_signature'`.
- **Risk:** Medium. Stripe Tax for AU GST needs correct business registration — plan ahead.

### Stage 43 — Day 64 — Billing Endpoints

- **Objective:** User-facing billing endpoints.
- **Deliverables:** `/billing/plans` (public plan catalog DTO), `/billing/checkout` (idempotency-keyed, creates Stripe Checkout session), `/billing/portal` (Stripe Billing Portal URL), `/billing/subscription` (active subscription + tier), `/billing/subscription/cancel` (schedule cancel-at-period-end with `undo` param), `/billing/invoices`; contract tests.
- **Spec refs:** Spec §25.2, §25.6; Arch §4.9.
- **Exit criteria:** All endpoints contract-tested green.

### Stage 44 — Day 65 — Subscription → Feature Flag Propagation

- **Objective:** Replace manual tier script with automated Stripe-driven propagation.
- **Deliverables:** On `subscription` write from webhook processor, UPSERT `feature_flag` rows for tenant per Spec §20.3.1 registry; `admin_action_log` entry with `actor_role='system'`; test — webhook Free→Premium upgrade → feature_flag reflects new tier within 30s.
- **Spec refs:** Spec §25.5
- **Exit criteria:** 30s SLA met. Admin override precedence preserved.

### Stage 45 — Days 66–67 — Billing UI

- **Objective:** Full billing screen.
- **Deliverables:** `apps/web/src/app/(parent)/billing/page.tsx` per `billing.html` — pricing + plan comparison, subscription management, invoice history, payment method (Stripe Elements); e2e: checkout → webhook → dashboard reflects entitlements; axe-core zero serious/critical.
- **Spec refs:** Spec §25.2
- **Exit criteria:** Full upgrade flow e2e passes in Stripe test mode.

### Stage 46 — Day 68 — Cancellation + Access Preservation

- **Objective:** Cancel-at-period-end with undo.
- **Deliverables:** Cancellation flow UI; `subscription.cancel_at` set; user retains full access until period end; `undo=true` query param reverses; `customer.subscription.deleted` webhook drops access to free + sends `access_downgraded` notification; test — cancel, verify access preserved, uncancel, verify `cancel_at` cleared.
- **Spec refs:** Spec §25.6.
- **Exit criteria:** Full cancel/uncancel/expire flow works end-to-end.

### Stage 47 — Day 69 — Phase 4 Slice Exit Review

- **Objective:** Phase 4 slice gate.
- **Deliverables:** 50 Stripe webhooks replayed idempotently in soak test; tier upgrade propagation ≤ 30s p95 over 100 upgrades; all billing endpoints green in contract tests; `docs/dev/PROJECT_STATE.md` Phase 4 slice checked; git tag `v1-phase-4-slice`; dunning + refund + institutional explicitly deferred in `DEV_PLAN.md` §5.
- **Exit criteria:** Billing flows work for at least Free→Standard→Premium→Free cycle.

---

### Launch Prep (Days 72–75, 2 stages, 4-day window with 2-day phase buffer)

> Launch has 4 days available (Days 72–75). Phase exits at Day 75 with the `v1.0.0` tag.

### Stage 48 — Day 72 — Hardening Pass

- **Objective:** Last-mile fixes before launch.
- **Deliverables:**
  - Review `DAILY_LOG.md` blockers — resolve any carried-over issues
  - Run full axe-core sweep across all routes — fix any regression
  - k6 soak at Phase 1 SLA (500 concurrent) for 1 hour — verify no degradation
  - Check `pipeline.dead_letter.count` over 24h — must be 0
  - Run `scripts/validate-content.ts` — verify seed integrity
  - Verify all `.env.example` keys present (including Stripe now)
  - Supabase backup drill — restore to staging, verify data intact
  - All CI jobs green on 3 consecutive commits
- **Exit criteria:** Zero blockers. All checks green.

### Stage 49 — Day 73 — Launch Gate Review + v1.0.0 Tag

- **Objective:** Ship v1.
- **Deliverables:**
  - `docs/dev/PROJECT_STATE.md` final snapshot — all 47 stages ✅, phase 3/5 + deferred items listed
  - Final `DAILY_LOG.md` summary entry
  - Launch gate checklist (from spec §4, v1-applicable items only):
    1. All Phase 4 slice exit criteria met ✅
    2. Load test at 500 concurrent green for 1 hour ✅ (v1 scope; 10k deferred)
    3. `pipeline.dead_letter.count` = 0 for 24h ✅ (v1 scope; 7-day deferred)
    4. Backup + restore drill completed ✅
    5. Stripe taxes + invoicing verified in test mode ✅ (live mode cutover at actual launch)
    6. Content seeded: 50 items, 10 misconceptions ✅
  - `git tag -a v1.0.0 -m "MindMosaic v1.0 — NAPLAN Y5 + ICAS Math + Parent/Teacher dashboards + Stripe billing"`
  - `git push origin v1.0.0`
- **Exit criteria:** Tagged. Deployable. Known deferrals documented.

---

## 3. Buffer Management & Scope-Cut Menu

**Total: 75 days / 49 stages = 26 days buffer (35%).**

### 3.1 Buffer allocation

| Phase                                             | Stage-days | Slippage buffer | Phase window |
| ------------------------------------------------- | ---------- | --------------- | ------------ |
| Phase 0 — Foundations                             | 14         | 3               | Days 1–17    |
| Phase 1 — Core Assessment                         | 18         | 4               | Days 18–39   |
| Phase 2 — Intelligence + Dashboards + Assignments | 18         | 4               | Days 40–61   |
| Phase 4 slice — Billing                           | 8          | 2               | Days 62–71   |
| Launch Prep                                       | 2          | 2               | Days 72–75   |
| **Total**                                         | **60**     | **15**          | **75**       |

> Note: §1's phase-summary buffer counts both multi-day stage stretches and pure slippage; the "Slippage buffer" column above counts only unscheduled days available for actual delays. Difference: Phase 1 has 5 days of stretch in Stages 17, 19, 23, 26 plus 4 days of slippage = 9 days total per §1; Phase 2 similarly; Phase 4 slice 2 + 2; Launch Prep 0 + 2; Phase 0 0 + 3. Total: 11 days stretch + 15 days slippage = 26 days, matching §1.

### 3.2 Buffer rules

1. A buffer day is consumed when a stage exits more than 24h late.
2. If a phase consumes all its slippage buffer **before** phase exit → STOP and apply §3.3 cuts before starting the next phase.
3. Buffer cannot be moved between phases.
4. If two phases in a row consume >50% of their buffer, treat the 75-day target as at risk and proactively apply §3.3.

### 3.3 Pre-approved scope-cut menu

Apply in order. Each cut stays in `DEV_PLAN.md` §5 with a deviation logged in `docs/dev/DEVIATIONS.md`. Do not improvise cuts not listed here without an ADR.

| #                                  | Cut                                                  | Stage(s) affected   | Days saved  | Cost                                                                                |
| ---------------------------------- | ---------------------------------------------------- | ------------------- | ----------- | ----------------------------------------------------------------------------------- |
| 1                                  | Defer Plan Overrides                                 | 35                  | 1           | Parent/teacher cannot pin/dismiss recommendations in v1                             |
| 2                                  | Defer Teacher Student Detail                         | 38                  | 1           | Teacher dashboard ships, but no per-student drill-down page                         |
| 3                                  | Defer L7 Teacher Intelligence (auto-groups + alerts) | 30, parts of 32, 37 | 2           | Teacher dashboard becomes static (no auto-grouping, no intervention alerts)         |
| 4                                  | Reduce Exam Engine offline queue to "minimal replay" | 23                  | 1           | Offline answers may need manual re-entry on reconnect; a11y gate **still required** |
| 5                                  | Cut k6 load test from 500 to 100 concurrent          | 26                  | 1           | Lower confidence in scaling claims; document in launch notes                        |
| 6                                  | Defer entire Phase 4 slice (Billing)                 | 42–47               | 8           | Ship Free-tier-only at launch; billing in post-launch sprint 1                      |
| **Total recoverable via cuts 1–6** |                                                      |                     | **14 days** |                                                                                     |

Cuts 1–4 should be exhausted before cut 5. Cut 6 is a last resort that requires explicit acknowledgement that v1 ships without revenue capture.

---

## 4. Daily Routine

1. **AM (≈30 min):**
   - Run morning prompt (see `CLAUDE.md`). Claude Code reads `docs/dev/PROJECT_STATE.md`, last 3 `DAILY_LOG.md` entries, deviations, open issues, questions, recent ADRs.
   - Pull today's stage from §2. Re-read its exit criteria.
2. **AM → PM:** Execute the C-C-D-V prompt in Claude Code. Run tests locally. Fix until green.
3. **End of day:**
   - `pnpm turbo typecheck lint test && supabase db reset && pnpm test:rls`
   - If green → commit + push to `main` (one stage = one commit).
   - Run evening prompt (see `CLAUDE.md`). Updates `DAILY_LOG.md`, `PROJECT_STATE.md`; files ADRs/deviations/bugs/questions.
   - Commit dev-context separately: `chore(dev-context): stage N close`.
   - Save executed prompt to `docs/prompts/YYYY-MM-DD_stage-N.md`.
4. **If stuck:** Do not push red code. Choose one of:
   - (a) Roll back today's WIP and retry tomorrow,
   - (b) Consume a phase buffer day and re-attempt,
   - (c) Apply a §3.3 scope cut and log a deviation.

5. **Audit days every 5 stages.** On Stages 5, 10, 15, 20, 25, 30,
   35, 40, 45, in addition to deviation/issue triage (ADR-0007):

   (a) Cross-check DEV_PLAN.md §2 deliverables against actual repo
   state. List any deliverable named in the plan but missing or
   named differently. File single docs(dev-plan) commit
   correcting the plan, not deviations for each.

   (b) Re-read every BUILD_CONTRACT binding rule added since the
   last audit. For each, verify it's actually being enforced —
   e.g. is the RLS helper rule applied to every cross-table
   policy added in the last 5 stages?

   (c) Run pnpm test:migration on the full migration history. Not
   just on the most recent migration. Catch drift early.

   (d) Spot-check 3 random ADRs from the last 5 stages: does the
   implementation still match the decision?

---

## 5. Post-Launch Backlog (v1.1+)

This section is the authoritative list of scope deferred from v1. Do not pull items forward without a scope-cut trade in `docs/dev/DEVIATIONS.md`.

Priority labels:

- **P1** — ship in v1.1 (first 4 weeks post-launch). Blocking for meaningful product evolution.
- **P2** — ship in v1.2 (quarter 2). Significant but not urgent.
- **P3** — icebox. Consider after v1.2 based on customer feedback.

### 5.1 P1 — v1.1 (first 4 weeks post-launch)

**v1.1 Exam-Content Authoring Phase** _(operator-prioritized; 5 stages; DEV-20260514-1)_
Inserted ahead of P1.1–P1.7 per operator approval 2026-05-14. Rationale: content authoring
is a hard dependency for the 50-item seed (Stage 49 launch gate item 6) and P1.2 RepairEngine
content. Delivers write-side CRUD on existing `item` / `item_version` / `stimulus` schema
(migration 0002); lifecycle FSM per spec §15.3; Pattern G strict writes; platform_admin +
service-role only in Stage 1; teacher authoring deferred (ADR-0035).

Stage breakdown (branch `v1.1/exam-content`):
- v1.1-S1: Question Bank Foundation — item + item_version + stimulus CRUD; lifecycle FSM
- v1.1-S2 through v1.1-S5: TBD (operator will relay prompts per stage)

P1.1–P1.7 definitions below are unchanged.

**P1.1 Skill Graph Migration Worker** _(5 days)_
Origin: Spec §22.9.2. Why deferred: complex worker (resumability, rollback, multi-table rewrites); not essential while v1 graph is stable. Why P1: blocks any production skill graph republish. Scope: `batch.skill_graph_migration` job consuming `skill_migration_map`; rewrites references in `skill_mastery`, `learning_velocity`, `student_misconception.evidence`, `repair_record.root_cause_skill_id`, `learning_plan.sessions[]`, `plan_override.target`, `assignment.target_skill_ids`; resumable in 10k-row chunks; post-migration verification + rollback; remove G4 code guard.

**P1.2 RepairEngine + Repair Sequences** _(8 days)_
Origin: Spec §3.2.5, §9, §11. Why deferred: significant new engine + UI + content authoring burden. Why P1: core differentiator promised in Spec §1; parents see misconceptions in v1 but no scaffolded repair. Scope: `RepairEngine`; L4 async pipeline `pipeline.repair_queue` with advisory lock, max-3 concurrent repairs/student; repair-session UI variant of exam engine; seed 20 high-value repair sequences; follow-up assessment scheduler cron (7-day recurrence).

**P1.3 Data Subject Rights (APP Compliance)** _(4 days)_
Origin: Spec §22.3.2. Why deferred: regulatory minimum met by manual admin process at launch scale. Why P1: any formal APP/GDPR-style request requires automated export + delete. Scope: `POST /privacy/export-data` + `batch.privacy_export` (signed ZIP); `POST /privacy/delete-account` + 7-day grace + cascade delete; de-identified aggregate preservation; runbooks `tenant-data-export.md`, `tenant-data-delete.md`.

**P1.4 Stripe Dunning + Refund** _(3 days)_
Origin: Spec §25.7, §25.9. Why deferred: Stripe's default retry handles most cases. Why P1: graceful reminder sequence protects retention. Scope: Day 0/3/7/14 reminders on `invoice.payment_failed`; dunning timer state machine; `charge.refunded` webhook → `admin_action_log`; platform_admin refund runbook.

**P1.5 Full Observability v2** _(3 days)_
Origin: Arch §7.1; v1 caveat. Why deferred: Supabase logs + Vercel errors adequate at launch scale. Why P1: per-trace debugging without OTel becomes painful past ~1k MAU. Scope: OpenTelemetry SDK in every Edge Function (W3C TraceContext); export to Honeycomb or Grafana Tempo; Sentry on frontend (errors + web vitals) + Edge Functions (5xx); per-endpoint latency / per-service error / pipeline-health dashboards; Slack/PagerDuty alerts.

**P1.6 Offline Persistence Upgrade (IndexedDB + Service Worker)** _(2 days)_
Origin: UI_CONTRACT §5.1; ADR-0030 (Stage 23); ISSUE-0009. Why deferred: ADR-0030 prioritises a11y gate > offline-resilience > offline-persistence per Stage 23 budget; in-memory queue satisfies "do not block the user" rule; page-reload during offline loses queue, mitigated by 30s autosave + `OfflineBanner` microcopy. Why P1: core exam-resilience promise; IndexedDB queue survives reload; SW shell cache supports cold-start offline. Scope: Replace `useResponseQueue`'s in-memory store with an IndexedDB-backed `idb-keyval` layer behind the same `enqueue`/`flush`/`pendingCount` API; register service worker via `next-pwa` (or hand-rolled `sw.ts`) with runtime-caching strategy for the Exam Engine route shell; add Playwright e2e: queue persists across page reload during offline; cold-start offline shows shell. Affects: `apps/web/src/components/exam/useResponseQueue.ts`, `apps/web/src/components/exam/OfflineBanner.tsx`, `apps/web/next.config.js`, `apps/web/public/sw.js` (new), `apps/web/playwright/e2e/exam-flow-offline.spec.ts` (new).

**P1.7 Adaptive Section-Boundary Banner + `current_testlet_id` DTO** _(2 days)_
Origin: UI_CONTRACT §5.1; SCREEN_SPECS §9; ISSUE-0010; Q-23.4 (Stage 23). Why deferred: requires DTO change + assessment-svc handler change + contract test — exceeded Stage 23 budget while a11y gate was merge-blocker; v1 forward-only navigation is strictly correct for both linear and adaptive. Why P1: removes the linear-session navigation restriction; adds adaptive section-boundary visual for cross-testlet transitions. Scope: (1) Add `current_testlet_id: string | null` to `SessionStateDTOSchema` + `RecordResponseResponseSchema` in `packages/types/src/session.ts`; (2) populate in assessment-svc: adaptive → current testlet id from engine state, linear → null; (3) frontend: replace forward-only sequence-number check with `currentItem.testlet_id === target.testlet_id` for adaptive; render "Section N" banner on testlet transition; (4) add 1 contract test asserting field presence in `/state` + `/respond` 200 responses.

### 5.2 P2 — v1.2 (quarter 2)

| ID   | Item                                                                                                                       | Origin          | Estimate |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | --------------- | -------- |
| P2.1 | L6 Stretch Intelligence                                                                                                    | Spec §13        | 3 days   |
| P2.2 | L8 Content Intelligence Loop (`batch.content_recalibration`, item lifecycle, admin dashboard)                              | Spec §15        | 5 days   |
| P2.3 | Cross-Pathway Intelligence (root cause convergence, context-weighted skill transfer, comprehensive readiness)              | Spec §17        | 4 days   |
| P2.4 | Long-Term + Exam Countdown Plans (`/orchestration/long-term-plan`, `exam-countdown`, `pathway-switch`, milestone tracking) | Spec §16.3–16.5 | 4 days   |
| P2.5 | Engagement Layer (streaks, weekly goals, achievements, nudges; engagement-svc writers; full UI; 20 seeded achievements)    | Spec §26        | 5 days   |
| P2.6 | Audit Log Cold Storage (daily Parquet → Supabase Storage; DuckDB admin tool)                                               | Spec §22.3.1    | 2 days   |
| P2.7 | Override Plan Item — full (`override_plan_item` type)                                                                      | Spec §16.6.1    | 2 days   |
| P2.8 | Admin Jobs + Feature Flags UI (dead-letter retry, poison markers)                                                          | Arch §4.12      | 3 days   |
| P2.9 | Contract Test Staging Environment                                                                                          | —               | 2 days   |
| P2.10 | Results screen deferred content blocks + Dashboard mastery snapshot (ISSUE-0011a–f): topic breakdown, performance insights, question review, mastery delta card, diagnostic proficiency map, learner profile | SCREEN_SPECS §11; Screen 7; ISSUE-0011 | 5 days |

### 5.3 P3 — Icebox (consider after v1.2 based on customer signal)

- **P3.1 Additional Pathways** — Selective Entry (Spec §4.3), Singapore Math (§4.4), Olympiad/AMC (§4.5). Per pathway: framework_config + assessment_profile + blueprint + content library. 5–8 days each + authoring.
- **P3.2 Institutional Tier** (Spec §25.10, §1.1) — flat annual Stripe quote flow, bulk CSV invite, custom branding, SAML SSO, SLA + priority support. 6 days.
- **P3.3 Mobile** — responsive polish + React Native consideration. 8 days responsive / 4 weeks native.
- **P3.4 Advanced Intelligence** — IRT 2PL, BKT, misconception auto-discovery, AI-assisted authoring. Ongoing research.
- **P3.5 Scale + Polish** — 10k concurrent + read replicas; pen test (OWASP + prompt injection); full WCAG 2.1 AA; complete runbook set. 8 days.
- **P3.6 Open Platform** — LMS API (Canvas, Google Classroom, Schoology); i18n; parent Learning Report Card PDF. Ongoing.
- **P3.7 Extended Response Auto-Marking** — NAPLAN writing scoring; rubric model or human-in-loop. Research-heavy.

### 5.4 Spec → Backlog Reference Map

For audit traceability, this is the complete list of items in `mindmosaic-spec-v4_4.md` NOT in v1 scope:

- §3.2.5 RepairEngine → P1.2 · §4.3–§4.5 Additional pathways → P3.1
- §9.x Concept Repair (L4) → P1.2 · §13 L6 Stretch → P2.1
- §15 L8 Content Intelligence → P2.2 · §16.3–16.5 Long-term/countdown/switch → P2.4
- §16.6.1 `override_plan_item` → P2.7 · §17 Cross-Pathway → P2.3
- §22.3.1 Cold storage → P2.6 · §22.3.2 Data Subject Rights → P1.3
- §22.6.2 Full metrics stack → P1.5 · §22.9.2 Skill graph migration → P1.1
- §24.x Auto-overdue cron → P2.8 · §25.7 Dunning → P1.4 · §25.9 Refund → P1.4
- §25.10 Institutional → P3.2 · §26 Engagement → P2.5 · §27 Email/Push transport → P2.5

---

## 6. What Can Go Wrong (Explicit Risks)

| Risk                                                                             | Likelihood           | Impact                           | Mitigation                                                                             |
| -------------------------------------------------------------------------------- | -------------------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| Stage 5 atomic response function has a subtle bug                                | Medium               | Critical — every session corrupt | Integration tests at SQL level, not app mocks                                          |
| Stage 20 replay determinism breaks                                               | Medium               | High — Phase 1 exit blocked      | No `Math.random`, no floats summed in non-deterministic order, no timestamps as inputs |
| Stage 23 a11y gate fails exam engine                                             | Medium               | High — Phase 1 exit blocked      | Budget 3 days explicitly; test keyboard-only mid-stage before polish                   |
| Stripe Tax for AU GST config delays                                              | Low                  | Medium — Phase 4 slice slipped   | Register Stripe Tax on Day 1 (parallel track)                                          |
| Seed content insufficient for real adaptive routing                              | Medium               | Medium — NAPLAN adaptive flaky   | Content validation script runs daily; reseed triggers on content changes               |
| pg_partman monthly partitioning misbehaves on month rollover during build window | Low                  | Medium                           | Pre-create next month's partition in Stage 5                                           |
| Vercel Cron for outbox dispatcher unreliable at 2s cadence                       | Medium               | Medium                           | Supabase Scheduled Trigger fallback at 5s; acceptable latency degradation              |
| Solo developer out sick 2+ days at a time                                        | Certain over 75 days | Medium                           | 26-day total buffer absorbs realistic illness; scope cuts pre-approved (§3.3)          |
| Estimation drift across multiple stages                                          | Likely               | Medium → High if compounding     | Audit days every 5 stages; trigger §3.3 cuts at 50% phase-buffer consumption           |

---

_End of Development Plan v1.0._
