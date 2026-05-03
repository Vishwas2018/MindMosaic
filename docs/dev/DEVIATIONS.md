# DEVIATIONS.md — append-only, never pruned

> Every deviation from DEV_PLAN.md, in writing.
> Newest at TOP. Use the template from CLAUDE.md §Templates.

### DEV-20260503-2 — content.recalibration wired as PHASE-2 no-op stub per arch Part XI
<!-- Audit Stage 10 (2026-05-03): still ongoing — resolves v1.1 when content recalibration engine ships. No action needed. -->

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
<!-- Audit Stage 10 (2026-05-03): still ongoing — resolves Stage 15. No action needed. -->

- Date: 2026-04-30
- Stage: 1
- Type: postponement
- What the stage said: Stage 1 deliverables include `packages/engines-client` with `package.json`, `tsconfig.json`, `src/index.ts` re-exporting contract types only.
- What I actually did: Did not create `packages/engines-client`. Created the other 5 packages (`@mm/types`, `@mm/sdk`, `@mm/ui`, `@mm/core`, `@mm/engines`) as specified.
- Why: `engines-client` is a browser-safe thin re-export of `AssessmentEngine` contract types from `@mm/engines`. Those contracts don't exist until Stage 15. An empty package with no real exports adds dead weight to the build graph for 14 stages. See ADR-0001 for full reasoning.
- Impact on later stages: Stage 15 must create `packages/engines-client` per its deliverables list (already specified there — no plan change needed).
- Linked: ADR-0001 (`docs/dev/decisions/0001-engines-client-deferred.md`). Note: DEV_PLAN.md references a legacy ID "DEV-20260426-1" for this same decision from a prior attempt — this entry (DEV-20260430-1) supersedes it with today's date. Do NOT edit DEV_PLAN.md.
- Resolved by: Stage 15
