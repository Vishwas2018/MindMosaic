# DEVIATIONS.md — append-only, never pruned

> Every deviation from DEV_PLAN.md, in writing.
> Newest at TOP. Use the template from CLAUDE.md §Templates.

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
