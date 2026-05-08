# DEVIATIONS.md — append-only, never pruned

> Every deviation from DEV_PLAN.md, in writing.
> Newest at TOP. Use the template from CLAUDE.md §Templates.

### DEV-20260519-1 — Spec §12.1 predict_exam_readiness: exam_date column deferred

- Date: 2026-05-19
- Stage: 29
- Type: scope-reduction (v1.1 deferral)
- What the stage said: Implement spec §12.1 `predict_exam_readiness(student, pathway, exam_date)` fully, including the `days_remaining` projection branch that requires `exam_date`.
- What I actually did: `exam_date` accepted as an optional payload field (`exam_date?: string | null`). When null, `projected_readiness` and `on_track` are returned as null; `current_readiness_score`, per-skill mastery levels, gap skills, and mastery timelines are still computed. `user_profile.exam_date` column not added to migration.
- Why: No migration has `exam_date` on `user_profile`. Adding it requires a new migration and a teacher/student UI ingress path that is out of scope for the 1-day Stage 29 budget. Q-29.2 Resolution: Option B (optional payload field).
- Impact on later stages: ISSUE-0014 filed to track the full implementation. Stage 32+ (intelligence endpoints round-out) or a dedicated UI stage must add the column and wire the ingress. Spec amendment deferred post-launch.
- Linked: Q-29.2, ISSUE-0014
- Resolved by: v1.1 (when exam_date ingress ships)

### DEV-20260515-1 — Stage 25 route target: DEV_PLAN says `(student)/page.tsx`; actual implementation at `(student)/dashboard/page.tsx`
<!-- Resolved 2026-05-15, Stage 25, commit 975e815: dashboard/page.tsx implemented at the correct path; self-resolving. -->

- Date: 2026-05-15
- Stage: 25
- Type: substitution
- What the stage said: DEV_PLAN.md Stage 25 deliverables list
  `apps/web/src/app/(student)/page.tsx` as the target file.
- What I actually did: Replaced
  `apps/web/src/app/(student)/dashboard/page.tsx` (the existing
  EmptyState stub) instead of creating a root-level `page.tsx`.
- Why: `apps/web/src/lib/auth/role-home.ts` maps `student →
  '/dashboard'`; `apps/web/src/middleware.ts` redirects
  authenticated students to `getRoleHome('student')` =
  `/dashboard`. A root-level `(student)/page.tsx` would be
  unreachable — middleware would never route there. The stub at
  `dashboard/page.tsx` is the load-bearing entry point. DEV_PLAN
  route was authored pre-crystallisation of the middleware + role-
  home routing layer. CLAUDE.md anti-pattern rule prohibits
  editing DEV_PLAN.md mid-build.
- Impact on later stages: None. All dashboard references in
  DEV_PLAN Stages 26–40 use `/dashboard` path language; only the
  file path on the Stage 25 deliverable line was wrong. The
  correct file is now implemented at the correct path.
- Linked: Q-25.1 (resolved 2026-05-15),
  `apps/web/src/lib/auth/role-home.ts`,
  `apps/web/src/middleware.ts`
- Resolved by: Stage 25 (this deviation is self-resolving — the
  correct file is implemented)

### DEV-20260511-1 — Stage 22 splits into 22a (infrastructure) + 22b (screens)
<!-- Resolved 2026-05-12: Stage 22b shipped commit b1dafe6 (Session Selection
+ Practice screens + route guard + Playwright e2e); -1 buffer day spent net
of 22a infrastructure work (already debited at 22a evening). -->

- Date: 2026-05-11
- Stage: 22
- Type: scope-reduction (today) + carry-forward
- What the stage said: DEV_PLAN.md Stage 22 (Day 27, 1-day budget)
  ships Session Selection + Practice screens, with Playwright e2e.
- What I actually did: Stage 22 split into **22a (today)** and
  **22b (tomorrow)**. Stage 22a delivers the SDK infrastructure
  needed to consume real Edge Functions — service-prefix routing
  per ADR-0029, full SDK→dispatcher path reconciliation per Q-22.2,
  `MmClientProvider` mounted in `apps/web` `Providers.tsx`. Stage
  22b carries forward the visual screens (Session Selection +
  Practice + Playwright e2e).
- Why: §2A walkthrough at implementation start surfaced two
  pre-existing architectural gaps that block real route
  consumption: (1) `MmClient`'s single `baseUrl` config does not
  map to the per-service Edge Function URL shape
  (`${SUPABASE_URL}/functions/v1/<svc>/<path>`); (2) several SDK
  hooks call paths that do not match their dispatcher's actual
  route. Both surfaced exactly as the green-light prompt warned
  ("first stage to wire SDK hooks into apps/web routes; watch for
  SDK hook gaps surfaced by real route consumption"). Building
  the screens against broken SDK plumbing would compound the gap;
  fixing both correctly is a discrete chunk of work that is the
  honest content of "today's stage" given the surface area.
- Impact on later stages: Stage 22b ships tomorrow against the
  reconciled SDK. **−1 day on the Phase 1 buffer.** Phase 1
  buffer balance: was 9 days available, +2 banked from Stages
  17 + 19 = 11 effective; now 10 effective after this −1.
  Stages 23–25 (Exam Engine, Results, Student Dashboard)
  unaffected — they consume the same SDK shape Stage 22a now
  fixes.
- Linked: ADR-0029 (single-client + service-prefix-in-hook
  pattern), Q-22.2 (mechanical SDK path correction), Q-22.3
  (baseUrl strategy decision).
- Resolved by: **Stage 22b shipped 2026-05-12 commit `b1dafe6`;
  −1 buffer day spent net of 22a infrastructure work** (already
  debited at 22a evening close).

### DEV-20260503-2 — content.recalibration wired as PHASE-2 no-op stub per arch Part XI
<!-- Audit Stage 10 (2026-05-03): still ongoing — resolves v1.1 when content recalibration engine ships. No action needed. -->
<!-- Audit Stage 19 (2026-05-08): still ongoing — v1.1 deferral by design (arch Part XI). No Stage 15–19 work touched fn_recalibrate_content() or the cron registration. No action. -->

- Date: 2026-05-03
- Stage: 9
- Type: scope-reduction (v1.1 deferral)
- What the stage said: DEV_PLAN.md Stage 9 listed content.recalibration as one of 8 cron jobs,
  implying it should perform real content recalibration.
- What I actually did: Created fn_recalibrate_content() with a no-op body
  (`UPDATE job_queue SET status = status WHERE FALSE` — valid LANGUAGE sql RETURNS void no-op).
  Registered `content.recalibration` cron job pointing to this stub. PHASE-2 comment applied.
- Why: arch Part XI explicitly states the content recalibration job "exists from Stage 9 but
  invokes a no-op function in v1". The content recalibration engine is a v1.1 feature. Wiring
  a real implementation would require v1.1 tables and logic that don't exist yet.
- Impact on later stages: v1.1 migration must replace fn_recalibrate_content() body with real
  implementation. The cron job registration in 0008_cron.sql stands (correct schedule 0 * * * *);
  only the function body changes.
- Linked: ADR-0017, arch Part XI, commit d2d2090
- Resolved by: v1.1 migration (when content recalibration engine ships)

### DEV-20260430-1 — engines-client deferred from Stage 1 to Stage 15
<!-- Resolved Stage 15 (2026-05-04, commit 14cd96b): packages/engines-client created with peer dep @mm/engines: workspace:*; src/index.ts re-exports contract types verbatim from @mm/engines; apps/web smoke verified via apps/web/src/lib/engines.ts type-only import. -->

- Date: 2026-04-30
- Stage: 1
- Type: postponement
- What the stage said: Stage 1 deliverables include `packages/engines-client` with `package.json`, `tsconfig.json`, `src/index.ts` re-exporting contract types only.
- What I actually did: Did not create `packages/engines-client`. Created the other 5 packages (`@mm/types`, `@mm/sdk`, `@mm/ui`, `@mm/core`, `@mm/engines`) as specified.
- Why: `engines-client` is a browser-safe thin re-export of `AssessmentEngine` contract types from `@mm/engines`. Those contracts don't exist until Stage 15. An empty package with no real exports adds dead weight to the build graph for 14 stages. See ADR-0001 for full reasoning.
- Impact on later stages: Stage 15 must create `packages/engines-client` per its deliverables list (already specified there — no plan change needed).
- Linked: ADR-0001 (`docs/dev/decisions/0001-engines-client-deferred.md`), ADR-0022 (engines as pure-function namespaces). Note: DEV_PLAN.md references a legacy ID "DEV-20260426-1" for this same decision from a prior attempt — this entry (DEV-20260430-1) supersedes it with today's date. Do NOT edit DEV_PLAN.md.
- Resolved by: Stage 15 (commit `14cd96b`, 2026-05-04). `packages/engines-client` shipped with peer dep `@mm/engines: workspace:*`, Bundler module resolution, and a verbatim re-export of every export from `@mm/engines`. Smoke check at `apps/web/src/lib/engines.ts` (type-only import) compiles via `apps/web` typecheck and is included in the apps/web Next build.

### DEV-20260518-1 — spec §5.1.4 traverse_downstream missing student parameter

- Date: 2026-05-18
- Stage: 28
- Type: substitution
- What the stage said: Implement `traverse_downstream` per spec §5.1.4 pseudocode signature
  `traverse_downstream(skill, visited)`.
- What I actually did: Added an explicit `masteryMap: Map<string, number>` parameter to
  `traverseDownstreamHelper` (and `masteryMap` to `traverseUpstreamHelper` for symmetry).
  The spec §5.1.4 body references `mastery(student, prereq)` but `student` is absent from
  the signature — the pseudocode is internally inconsistent. Without the student parameter
  the prereq-mastery check cannot be performed. Filed as Q-28.7 (resolved).
- Why: Spec defect — `traverse_downstream(skill, visited)` pseudocode signature calls
  `mastery(student, prereq_id)` in the body without `student` in scope. Function would be
  unimplementable as-written. Implementation passes `masteryMap` (equivalent to "student
  mastery context") as an explicit parameter — the correct and only sensible reading.
- Impact on later stages: None. No external contract exposes the traversal signature;
  it is internal to `processCausalFull`. Spec amendment to add `student` parameter
  deferred post-launch (product owner action).
- Linked: Q-28.7, commit (Stage 28 implementation commit)
- Resolved by: Stage 28 (implementation in `traverseUpstreamHelper` + `traverseDownstreamHelper`)
