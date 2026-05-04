# DAILY_LOG.md — append-only, never pruned

> Newest entry at TOP. Use the template from CLAUDE.md §Templates.

## Stage 17 — 2026-05-06

**Planned (from DEV_PLAN.md Stage 17):** AdaptiveEngine for NAPLAN — testlet routing per `framework_config.adaptive_rules`, server-authoritative per-stage timer, stage-bound back-nav, writing-stage text capture (no auto-marking). Exit criterion: 3-stage NAPLAN session through harness routes correctly per the seed's routing table.

**Actually delivered:**

- `feat(engines): Stage 17 — AdaptiveEngine (NAPLAN testlet routing)` — commit `3db1234`
  - **Seed correction (Q-17.1, ADR-0024):** Rewrote NAPLAN row's `adaptive_rules` JSON in `supabase/seeds/03_assessment_config.sql` from IRT/CAT placeholder (`theta_init`, `step_size`, `max_info`) to the spec-compliant testlet routing table. 7 testlets across 3 stages (t1; t2_easy/medium/hard; t3_easy/medium/hard), 5 items per testlet, 6-row routing_table keyed by `(stage_id, score_min, score_max) → next_testlet_id`. Per-stage timers: 15min for s1/s2, 10min for s3.
  - `packages/engines/src/contracts.ts` — added `AdaptiveRulesSchema` (with `RoutingTableEntrySchema`, `TestletDefinitionSchema`); added `AdaptiveEngineStateSchema` with `AdaptiveStageState`, `RoutingHistoryEntry`. Widened `EngineStateSchema` to a 4-arm `z.discriminatedUnion`. Added optional `EngineItem.testlet_id?`, `stage_id?`, `is_writing_item?`. Made `EngineResponse.is_correct` nullable for writing items (Q-17.5). Added `FrameworkConfig.adaptive_rules?: AdaptiveRules`. Added `assertAdaptiveState` discriminator-narrowing helper.
  - `packages/engines/src/adaptive.ts` — `AdaptiveEngine: AssessmentEngine` pure-function namespace per ADR-0022. `getNextItem` is a pure peek (no state mutation): in-testlet returns next item; past-end peeks the routing destination's first item via `lookupRoute`. `recordResponse` does the load-bearing work: in-testlet append+advance OR routing-transition (close current stage, append new stage, push routing_history). Helpers: `computeStageScore` (writing items excluded per Q-17.5), `lookupRoute` (Q-17.9 throws on ambiguous match). Per-stage timer in `getTimeRemaining` (anchors to first response). `scoreAdaptiveWithConfig` + `terminateAdaptiveWithConfig` engine-prefixed to avoid barrel collision with linear's `scoreWithConfig`/`terminateWithConfig`.
  - `packages/engines/src/index.ts` — barrel re-export `adaptive.js`.
  - `packages/engines/src/__tests__/_fixtures.ts` — added `buildAdaptiveRules` (canonical 3-stage NAPLAN), `buildAdaptiveItemPool` (35-item pool spanning all 7 testlets), `buildAdaptiveSession`, `buildAdaptiveConfig`, `buildTestletItems`, `buildWritingItem`. `buildResponse` accepts `isCorrect: boolean | null` with optional `responseData` override.
  - `packages/engines/src/__tests__/adaptive.test.ts` — 33 tests across 10 describe blocks: initialise (6), getNextItem (3), recordResponse (4), routing table (6 incl. ambiguous-throws), stage boundaries (3), per-stage timer (3), writing stage (2), termination (2), golden 3-stage NAPLAN (1, the DEV_PLAN exit criterion), replay determinism (1), edges (2).
  - `docs/dev/decisions/0024-adaptive-testlet-routing-model.md` — ADR-0024 documenting the testlet-routing data-model decision (Q-17.1.A) and the testlet-membership-via-config-map approach (Q-17.2). IRT/CAT model deferred to v1.1+.

**Time spent:** ~5h (single session, including the §2A pre-implementation review that surfaced Q-17.1 as a blocking spec/seed mismatch + execution + lint/test cleanup).

**Surprises / departures:**

- **Q-17.1 spec/seed mismatch was real and load-bearing.** The seed's `adaptive_rules` JSON was IRT/CAT-shaped (`theta_init`, `step_size`, `max_info`); spec §3.2.1 explicitly describes testlet routing. Resolved per Q-17.1.A — rewrote the seed row. ADR-0024 documents the call. No new migration needed; testlet membership lives in the config JSON's `testlets` map.
- **Symbol collision in barrel re-export.** `linear.ts` and `adaptive.ts` both wanted to export `scoreWithConfig` / `terminateWithConfig`; renamed adaptive's helpers to `scoreAdaptiveWithConfig` / `terminateAdaptiveWithConfig` to avoid the collision while keeping Stage 15/16 test surface unchanged. Stage 18+ engines should adopt engine-prefixed names from the start.
- **`AdaptiveRulesSchema` forward declaration.** Initially used `z.lazy(() => AdaptiveRulesSchema)` so `FrameworkConfigSchema` could declare `adaptive_rules` first. TS struggled with the TDZ via closure pattern; refactored to declare the AdaptiveRules schemas BEFORE `FrameworkConfigSchema`. Cleaner.
- **Routing-error tests originally hit Path A (recordResponse with in-testlet item)** which doesn't trigger the route lookup. Adjusted the tests to exhaust the testlet first, then call `getNextItem` (peek path) to surface the ambiguous/missing-route throws. Both paths now covered.
- **`is_correct: boolean | null` widening is backward-compatible** — Stage 15/16 tests pass `boolean` literals, which trivially satisfy `boolean | null`. `LinearEngine`/`SkillEngine`/`DiagnosticEngine` treat `null` as falsy for scoring purposes (the v1 acceptable approximation since writing items don't appear in those modes).

**Decisions made (not in stage):**

- ADR-0024: AdaptiveEngine testlet routing model + seed correction (Q-17.1.A). Approved as the §2A default; applied verbatim. See `docs/dev/decisions/0024-adaptive-testlet-routing-model.md`.
- Q-17.1 through Q-17.12 binding decisions all applied as approved (only Q-17.10 mattered — single commit).

**Deviations logged:**

- none. Q-17.1 was a SEED correction, not a plan deviation; the engine ships exactly what DEV_PLAN.md Stage 17 deliverables specify.

**Issues opened / closed / questions raised:**

- none.

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (290/290 unit total: 97 @mm/types + 24 @mm/sdk + 59 @mm/ui + 110 @mm/engines) · Build ✅ (7/7 packages) · RLS n/a (no migrations).

**Tomorrow — first thing:**

Stage 18 — Content Service. `supabase/functions/content-svc/`: `/pathways` (entitlement-filtered), `/pathways/{slug}`, `/assessment-profiles`, `/content/items/{id}`, `/content/select` (blueprint-driven deterministic ordering), `/content/search`, `/skill-graphs/active`. Plus the in-module skill-graph cache in `packages/core` (1h TTL, watermark check). First Edge-Function-bearing stage of Phase 1. Risk: medium per DEV_PLAN — contract tests + cache hit-rate gate.

## Stage 16 — 2026-05-05

**Planned (from DEV_PLAN.md Stage 16):** SkillEngine (Spec §3.2.3) + DiagnosticEngine (Spec §3.2.4); unit tests including the named exit criteria — cognitive load >0.8 reduces difficulty, mastery threshold terminates.

**Actually delivered:**

- `feat(engines): Stage 16 — SkillEngine + DiagnosticEngine` — commit `496a659`
  - `packages/engines/src/skill.ts` — `SkillEngine: AssessmentEngine` pure-function namespace (per ADR-0022). Exports `cognitiveLoad(responses, expected_time)` (§9.5 formula), `prioritiseSkills(state)` (§7.5.2 formula), `masteryDelta(state, clock?)` helper. In-session difficulty rule (§7.5.1) implements all four branches: high-accuracy +0.1, low-accuracy −0.15, cognitive-load >0.8 −0.1, otherwise unchanged. Mastery-threshold termination signals `mastery_reached` once any item has been answered AND all target skills cross the threshold.
  - `packages/engines/src/diagnostic.ts` — `DiagnosticEngine: AssessmentEngine` pure-function namespace. Binary-search-over-difficulty: correct response raises `low_difficulty` to current item difficulty, incorrect lowers `high_difficulty`. v1 confidence model = structural narrowing (`1 − (high − low)`); Stage 20 will plug the full Spec §8.4 model. `proficiencyMap(state, clock?)` projects state to `MasteryBand`-keyed entries; `estimateConfidence(probe)` is the helper. Termination via `confidence_threshold_met` (all skills ≥ threshold) or `max_items_reached`.
  - `packages/engines/src/contracts.ts` — extended: `EngineItem` (extends `ItemDTO` with `skill_ids`, `difficulty`, optional `discrimination`); `EngineState` widened to `z.discriminatedUnion('engine_type', [Linear, Skill, Diagnostic])` per ADR-0023; `EngineResponse.telemetry?: { time_to_answer_ms, answer_changes }` for §9.5 cognitive-load inputs; `TerminationReason` adds `mastery_reached | max_items_reached | confidence_threshold_met`; new schemas `SkillEngineState`, `DiagnosticEngineState`, `MasteryDeltaResult`, `ProficiencyResult`; `FrameworkConfig` adds Stage 16 thresholds with v1 defaults (mastery_threshold=0.85, confidence_threshold=0.7, max_items=20, diagnostic_start_difficulty=0.5, difficulty_step_up=0.1, difficulty_step_down=0.15, cognitive_load_threshold=0.8, cognitive_load_step_down=0.1, expected_time_per_item_ms=30000); `assertLinearState`, `assertSkillState`, `assertDiagnosticState` discriminator-narrowing helpers.
  - `packages/engines/src/linear.ts` — refactored to use `assertLinearState` narrowing (no behavioural change); two pre-existing `as LinearEngineState` casts removed. Stage 15 documented gap closed: `score().skills_touched` now aggregates real `skill_ids` from items the student has answered (was `[]`).
  - `packages/engines/src/__tests__/_fixtures.ts` — shared deterministic builders: `buildEngineItem`, `buildEngineItems`, `buildEngineItemPool({ skills, difficulties })`, `buildResponse({ item, isCorrect, offsetMs, telemetry? })`, `clockAt(offsetMs)`, `buildLinear/Skill/DiagnosticSession`, `buildLinear/Skill/DiagnosticConfig`. UUIDs derived from indices for replay-stable test data.
  - `packages/engines/src/__tests__/skill.test.ts` — 27 tests; both DEV_PLAN exit criteria explicitly named tests.
  - `packages/engines/src/__tests__/diagnostic.test.ts` — 22 tests; binary-search 12-item convergence test asserts range ≤ 0.1 around true mastery 0.7.
  - `packages/engines/src/__tests__/linear.test.ts` — refactored to consume shared fixtures (no behavioural change; 28/28 still pass).
  - `docs/dev/decisions/0023-engine-state-union-and-engine-item.md` — ADR-0023 documenting both the discriminated-union widening and the server-side `EngineItem` introduction. Marks Stage 17 (AdaptiveEngineState) and v1.1 (RepairEngineState) as the next branches to add.

**Time spent:** ~4h 30m (single session, including the Stage 16 §2A pre-implementation review earlier in the session, plus Stage 15 retroactive evening ritual closure, plus Stage 16 implementation + lint + test cleanup).

**Surprises / departures:**

- The §7.5.1 difficulty rule fires per-response, so 4 consecutive incorrect responses drop difficulty twice (0.5 → 0.35 after the 3rd → 0.20 after the 4th). Initial test expected a single application; adjusted to 3-incorrect cases that match the spec semantics.
- Cognitive-load formula maxes at 0.60 without an `error_burst` (3+ incorrect run): time_inflation contributes ≤ 0.35 and answer_change_rate contributes ≤ 0.25. To trigger the `>0.8` cognitive-load branch in a test that ALSO avoids the low-accuracy branch, used `[T,T,F,F,F]` pattern over 5 responses (40% accuracy, error_burst=0.6, high telemetry → load=0.84 → −0.1 branch fires cleanly, d → 0.4).
- ESLint's `@typescript-eslint/no-unused-vars` flagged underscore-prefixed parameters (`_state`) in `canNavigateBack`. Switched to `state` and use `assert{Skill,Diagnostic}State(state)` to enforce the runtime contract — bonus value of consistent narrowing across all engines.

**Decisions made (not in stage):**

- ADR-0023: `EngineState` as discriminated union by `engine_type` + `EngineItem` server-side type extending `ItemDTO`. Approved as Q-16.1 + Q-16.5 in the §2A review and applied verbatim. See `docs/dev/decisions/0023-engine-state-union-and-engine-item.md`.
- Q-16.1 through Q-16.13 binding decisions all applied as approved; none deviated.

**Deviations logged:**

- none.

**Issues opened / closed / questions raised:**

- none.

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (257/257 unit total: 97 @mm/types + 24 @mm/sdk + 59 @mm/ui + 77 @mm/engines) · Build ✅ (7/7 packages) · RLS n/a (no migrations).

**Tomorrow — first thing:**

Stage 17 — AdaptiveEngine (NAPLAN). Day 20–21 (2-day budget). Adds `AdaptiveEngineState` as the fourth branch of the `EngineState` union (writing-stage text capture, stage timer, testlet routing per `framework_config.adaptive_rules`). Risk: medium per DEV_PLAN — routing-table JSON shape must match the seed exactly.

## Stage 15 — 2026-05-04

**Planned (from DEV_PLAN.md Stage 15):** `AssessmentEngine` interface (Spec §3.1) + ICAS `LinearEngine` implementation; create `packages/engines-client` browser-safe re-export package.

**Actually delivered:**

- `feat(engines): Stage 15 — AssessmentEngine contract + LinearEngine` — commit `14cd96b`
  - `packages/engines/src/contracts.ts` — AssessmentEngine interface (Spec §3.1, with `clock` parameter added to `getTimeRemaining` + `terminate`); supporting types `EngineState`/`LinearEngineState`, `TerminationSignal` + `isTerminationSignal` guard, `TerminationReason` (4 values), `ScoreResult`, `FinalResult`, `EngineResponse`, `SessionContext`, `FrameworkConfig`, `ScoringRules`, `EngineType`. Every state-bearing type paired with a Zod schema for `engine_state_snapshot` round-trip validation.
  - `packages/engines/src/linear.ts` — `LinearEngine: AssessmentEngine` as a pure-function namespace (per ADR-0022). `scoreWithConfig` + `terminateWithConfig` convenience helpers for config-aware scoring; bare `score()` defaults to identity so it stays config-free per Spec §3.1.
  - `packages/engines/src/__tests__/linear.test.ts` — 28 tests across 7 describe blocks: initialise (5), getNextItem & navigation (5), recordResponse (4), score & scoreWithConfig (6), getTimeRemaining (3), terminate (3), golden 30-item ICAS session (1), replay determinism (1).
  - `packages/engines-client/` — new package. peer dep `@mm/engines: workspace:*`; Bundler module resolution; `src/index.ts` re-exports verbatim from `@mm/engines`.
  - `packages/engines/package.json` — added runtime deps `@mm/types: workspace:*` + `zod: ^3.25.76`.
  - `packages/engines/src/index.ts` — barrel re-exports `contracts.js` + `linear.js`.
  - `apps/web/src/lib/engines.ts` — type-only smoke surface verifying end-to-end resolution chain (apps/web → @mm/engines-client → @mm/engines → @mm/types).
  - `apps/web/package.json` — added `@mm/engines-client: workspace:*` to devDependencies.
  - `apps/web/next.config.mjs` — added `@mm/engines-client` + `@mm/engines` to `transpilePackages`.
  - `docs/dev/decisions/0022-engines-pure-function-namespace.md` — ADR-0022 documenting the pure-function namespace pattern (Q-15.2 decision).

**Time spent:** ~3h 30m (single session, including the §2A pre-implementation review + execution + commit).

**Surprises / departures:**

- Spec §3.1 declares `AssessmentEngine` as an `interface` (suggesting an OO implementation), but pure-function namespaces JSON-serialise cleanly into `engine_state_snapshot` jsonb without `toJSON`/hydration plumbing. Filed ADR-0022 to record the choice.
- `packages/engines-client` already had `tsconfig.json` set to `moduleResolution: Bundler` from prior work in this session (see `@mm/ui` brand commit chain) — kept that for engines-client too. `@mm/engines` retained `NodeNext` from Stage 1 scaffold and worked fine since no subpath imports from CJS-without-exports packages were needed.
- Spec §3.1 signatures lack a `clock` parameter; we added one to `getTimeRemaining` + `terminate` per Q-15.7 to keep the engine clock-injection-only and replay-deterministic. `EngineState` never stores time-derived values.
- `score()` returns `ScoreResult` config-free (raw + items_correct + items_answered, scaled defaults to raw / band null) so consumers without a `FrameworkConfig` still get truthful raw counts; `scoreWithConfig`/`terminateWithConfig` apply `scoring_rules` when callers have them.
- `skills_touched: []` returned from `score()` until Stage 18 (content-svc) introduces skill→item mapping on `ItemDTO`. Documented inline.

**Decisions made (not in stage):**

- ADR-0022: engines as pure-function namespaces (vs. classes) — accepted. See `docs/dev/decisions/0022-engines-pure-function-namespace.md`.
- Q-15.1 through Q-15.10 binding decisions captured in the stage's pre-implementation review and applied verbatim. None deviated.

**Deviations logged:**

- DEV-20260430-1 (engines-client deferred from Stage 1 to Stage 15) — **resolved** by this stage's `packages/engines-client` package. Status moved from "ongoing" to "Resolved by Stage 15 (commit 14cd96b)".

**Issues opened / closed / questions raised:**

- None. No new issues, no new bugs, no new questions.

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (208/208 unit total: 97 @mm/types + 24 @mm/sdk + 59 @mm/ui + 28 @mm/engines) · Build ✅ (7/7 packages) · RLS n/a (no migrations this stage)

**Tomorrow — first thing:**

Stage 16 §2A pre-implementation review (SkillEngine + DiagnosticEngine per Spec §3.2.3 + §3.2.4). Hygiene: this evening ritual is being run retroactively — Stage 16 has not started yet.

## Stage 14 — 2026-05-04

**Planned (from DEV_PLAN.md Stage 14):** apps/web scaffold (auth pages, middleware, route groups), Edge Functions (auth-svc + users-svc), seeds (01-06), scripts (validate-content, set-tenant-tier), CI update.

**Actually delivered:**

- Cluster A — apps/web scaffold: Next.js 14 App Router with `(public)/(student)/(parent)/(teacher)/(admin)` route groups, `@supabase/ssr` cookie handling, middleware role guard, AuthProvider/EntitlementsProvider/Providers, LoginForm + SignupForm (RHF + Zod), AuthPageShell two-panel layout, all role-gated dashboard placeholder pages with "Available in a future release" copy. Commit 5e3e1f0.
- Cluster B — Edge Functions + migration: auth-svc (6 endpoints: signup/login/refresh/logout/forgot-password/reset-password) + users-svc (4 endpoints: GET/PATCH /users/me, GET/POST /users/me/children), `_shared/` utilities (trace-id, error-envelope, rate-limit, auth, logger), migration 0011 (fn_check_rate_limit RPC + fn_cleanup_outbox + outbox.cleanup cron — resolves ISSUE-0004). Commit c3df874.
- Cluster C — Seeds + Scripts + CI: 6 seed files (skill graph, 50 items, assessment config, users, feature flags, subscriptions), scripts/validate-content.ts (G5 assertion), scripts/set-tenant-tier.ts (G2 authorised writer), supabase/config.toml glob seed path, root package.json deps (tsx/dotenv/@supabase/supabase-js), CI seed-file-count check. Commit 969ec57.

**Time spent:** ~5h (two sessions due to context compaction mid-stage)

**Surprises / departures:**

- `noPropertyAccessFromIndexSignature: true` in tsconfig.base.json caused 22 typecheck errors in Cluster A. Fixed with bracket notation throughout (`process.env['KEY']`, `app_metadata?.['role']`); `CookieOptions` type imported from `@supabase/ssr` to type the setAll callback parameter.
- favicon.svg was absent at session resume (pre-existing deletion); switched to favicon.png metadata reference in layout.tsx.
- `if (x) y++ else z++` without braces rejected by tsc when run against scripts/tsconfig.json — may be `isolatedModules` interaction. Fixed with explicit braces.
- feature_flag table uses partial unique index (`WHERE tenant_id IS NOT NULL`); PostgREST upsert cannot target partial indexes — switched set-tenant-tier.ts to delete+insert pattern.
- subscription table also uses partial unique index (`WHERE is_active = true`) — used SELECT-then-UPDATE-or-INSERT pattern.
- BUILD_CONTRACT §11.2 prohibits AI "Co-Authored-By" trailers in commit messages; first commit attempt was rejected by commit-msg hook.

**Decisions made (not in stage):**

- ADR-0021: Use `@supabase/ssr` for Next.js SSR Supabase client (vs. manual cookie handling). See `docs/dev/decisions/0021-supabase-ssr-package.md`.

**Deviations logged:**

- none

**Issues opened / closed / questions raised:**

- ISSUE-0004 closed: outbox_event 7-day cleanup resolved in migration 0011 via fn_cleanup_outbox + outbox.cleanup cron (04:15 UTC daily).

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (171/171 unit, pgTAP not re-run — migration-only delta) · Build ✅ · RLS ✅ (from Stage 13; no new tables in Stage 14 Clusters B/C)

**Tomorrow — first thing:**

Stage 15 — engines-client package (AdaptiveEngine interface, LinearEngine interface, session scaffolding). Check DEV_PLAN Stage 15 preconditions.

## Stage 13 — 2026-05-03

**Planned (from DEV_PLAN.md Stage 13):** packages/ui Primitives + Design Tokens + axe-core Gate.
Radix UI headless layer, CSS custom properties token system, 26 component primitives, Storybook,
jest-axe CI gate.

**Actually delivered:**

- `feat(ui): stage 13 — design tokens + 26 primitives + axe-core gate + ADR-0020` — commit d2be303
  - `packages/ui/src/tokens.css` — full CSS custom property system per UI_CONTRACT §2: brand palette
    (brand-500→700, primary/primary-l/primary-d/primary-ink), semantic surface/text/border/field/error/
    success aliases, semantic shadows (card/elevated/focus), motion tokens (fast/base/slow), admin-dark
    surface variant, prefers-reduced-motion collapse to 0.01ms (all vars).
  - `packages/ui/src/tailwind.preset.ts` — Tailwind theme extension mirroring token values:
    fontFamily (sans/serif), brand/primary/surface/text/border color keys, boxShadow (card/elevated/
    focus), borderRadius (btn/field/card/pill).
  - 26 primitives (each with .tsx + .stories.tsx + .test.tsx):
    Layout: AppShell, Sidebar, TopBar, PageHeader, EmptyState, ErrorBoundary, LoadingState;
    Nav: NavLink, Tabs, Breadcrumbs;
    Data: Card, StatTile, ProgressBar, SkillBar, Table (loading/empty states);
    Forms: Button (forwardRef, X6 h-11=44px), IconButton (X6 h-11 w-11), Input (floating label via
    Tailwind peer), Select (Radix combobox), Checkbox (Radix), RadioGroup (Radix), TextArea, FormField;
    Overlay: Dialog (Radix, DialogContent forwardRef), Toast (Radix, Provider + useToast hook),
    Tooltip (Radix, TooltipProvider forwardRef).
  - `packages/ui/src/__tests__/setup.ts` — afterEach(cleanup) + jest-axe extend + X2 custom
    toHaveNoSeriousViolations matcher (fail serious/critical, warn moderate/minor as console.info).
  - `packages/ui/src/__tests__/jest-axe.d.ts` — ambient module declaration for jest-axe@9 (no types).
  - `packages/ui/src/__tests__/types.d.ts` — vitest Assertion augmentation for custom matchers +
    toHaveAttribute (from @testing-library/jest-dom, which lacks NodeNext propagation in .d.ts).
  - `packages/ui/src/index.ts` — full barrel with NodeNext .js extensions.
  - `packages/ui/vitest.config.ts` — jsdom environment + setupFiles.
  - `packages/ui/.storybook/` — @storybook/react-vite + @storybook/addon-a11y (dev-time visual review).
  - `packages/ui/README.md` — two-layer a11y doc (CI gate = Vitest+jest-axe; dev = Storybook+addon-a11y).
  - `docs/dev/decisions/0020-radix-not-shadcn.md` — ADR-0020 accepted (Radix directly, no shadcn CLI).
  - `CLAUDE.md` — tech stack updated: Tailwind + Radix UI primitives (ADR-0020).
  - `docs/dev/QUESTIONS.md` — Q-0001 marked resolved (Option B approved 2026-05-03).

**Time spent:** ~4h (multi-session: Phase A foundation + Phase B 26 primitives + Phase C wiring + TS
debug: jest-axe NodeNext resolution, @testing-library/jest-dom augmentation, AxeResultsWithViolations
mismatch, DOM cleanup between tests, Checkbox/RadioGroup/Select button-name axe violations)

**Surprises / departures:**

- jest-axe@9 ships NO TypeScript declarations (pure JS). NodeNext resolution requires an ambient
  module declaration in a script-mode .d.ts file. Used `import()` type expressions inside
  `declare module 'jest-axe'` — required eslint-disable for `consistent-type-imports`.
- @testing-library/jest-dom/vitest type augmentation doesn't propagate globally from a .ts import
  in setup.ts; had to declare `toHaveAttribute` directly in types.d.ts vitest augmentation.
- @testing-library/react@16 auto-cleanup requires explicit `afterEach(cleanup)` in Vitest setup;
  without it, DOM from prior tests accumulates and causes `getByRole` multiple-element errors.
- Radix Checkbox/RadioGroup/Select `<label for>` sibling association not computed by axe-core in
  jsdom (works in real browser). Fixed by adding `aria-label` to Radix root/item/trigger elements.
  This is a jsdom limitation, not a spec violation.
- UI-DIVERGENCE (X4): BUILD_CONTRACT §10 references `storybook:test` as axe CI gate. Stage 13
  moves this to `pnpm test` (Vitest + jest-axe). Logged in README.md; BUILD_CONTRACT correction
  deferred to Stage 14 audit.

**Decisions made (not in stage):**

- ADR-0020: Radix UI directly (not shadcn/ui CLI). Q-0001 resolved.

**Deviations logged:**

- UI-DIVERGENCE (X4 directive): axe CI gate = pnpm test (Vitest), not storybook:test. BUILD_CONTRACT
  §10 needs update at Stage 14 audit.

**Issues opened / closed / questions raised:**

- Q-0001 RESOLVED: shadcn vs Radix approach → Option B (Radix directly) approved.

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (50/50 axe+functional, 26 files) · Build ✅ (cached) · RLS ✅ (451/451, unchanged)

**Tomorrow — first thing:**

Stage 14 — apps/web scaffold + Next.js 14 App Router setup. Run morning ritual before any work.

---

## Stage 10 (Audit Day 2) — 2026-05-03

**Planned (from DEV_PLAN.md Stage 10):** Outbox Dispatcher + Audit Day 2 (ISSUE-0002,
ISSUE-0003, DEV_PLAN cron correction). Audit tasks committed first; deliverable follows.

### Audit triage (commits 1–4 of stage):

**Actually delivered (audit tasks):**

- `fix(db): migration 0009 — SECURITY DEFINER triple-REVOKE retrofit (ISSUE-0002)` — commit 75ac299
  - Migration 0009: REVOKE FROM authenticated + REVOKE FROM anon + GRANT TO authenticated for
    auth_tenant_id, auth_user_id, auth_role, fn_user_in_my_tenant, fn_class_in_my_tenant (0001)
    + fn_graph_version_is_published (0002). All 6 helpers now A1-compliant.
  - 009_security_definer_retrofit.sql: plan(12) — 6 anon denial + 6 authenticated access tests.
    440/440 pgTAP cumulative.
- `fix(ci): upgrade GHA actions from @v4 to @v5 for Node 24 runtime (ISSUE-0003)` — commit 9eb2f4b
  - actions/checkout, pnpm/action-setup, actions/setup-node → @v5. All 4 CI jobs updated.
  - Closes ahead of 2026-06-02 forced-upgrade deadline.
- `docs(dev-plan): stage 9 — correct cron registration mechanism per ADR-0017` — commit 1711e29
  - DEV_PLAN.md Stage 9 Deliverables: "ON CONFLICT DO NOTHING" → unschedule-first +
    cron.schedule() API. content.recalibration stub noted.

**Audit triage findings:**
- DEVIATIONS: DEV-20260430-1 (engines-client) — ongoing/Stage 15. DEV-20260503-2
  (content.recalibration stub) — ongoing/v1.1. Both expected.
- OPEN_ISSUES: ISSUE-0002 closed (migration 0009). ISSUE-0003 closed (ci.yml @v5 bump).
  Zero open issues after audit.
- QUESTIONS: none open.
- Quality gate replay: pnpm turbo (18/18 cached), pnpm test:rls (440/440), pnpm test:migration ✅.
- Phase buffer: 0/3 consumed. 10 stages completed through audit tasks.

### Outbox Dispatcher (Stage 10 deliverable, commit 5 of stage):

**Actually delivered (deliverable):**

- `feat(db): migration 0010 — outbox dispatcher (fn_drain_outbox_batch + outbox.dispatch cron)` — TBD
  - `supabase/migrations/0010_outbox_dispatcher.sql` — fn_drain_outbox_batch(batch_size int DEFAULT 100)
    RETURNS int LANGUAGE plpgsql VOLATILE; FOR UPDATE SKIP LOCKED batch drain; session.submitted →
    pipeline.run_sync (high), assignment.published → notification.create (medium); RAISE EXCEPTION on
    unknown event_type (P0001, fail loud, transaction rollback); idempotency_key = 'outbox:' || id::text;
    ON CONFLICT DO NOTHING; X1 privilege hardening — triple REVOKE (PUBLIC/authenticated/anon) + GRANT
    to service_role; outbox.dispatch cron every minute (ADR-0018).
  - `supabase/migrations/down/0010_outbox_dispatcher.down.sql` — unschedule + DROP FUNCTION.
  - `supabase/functions/outbox-dispatcher/index.ts` — Deno Edge Function thin wrapper; calls
    fn_drain_outbox_batch via supabase-js service_role; returns `{ drained: int, took_ms: int }` with
    explicit Content-Type: application/json (X3).
  - `supabase/tests/rls/010_outbox_dispatcher.sql` — plan(11): G_shape(3) + G_behavioral(8).
    451/451 cumulative pgTAP.
  - `docs/dev/decisions/0018-outbox-cron-every-minute.md` — ADR-0018 accepted.
  - `docs/dev/OPEN_ISSUES.md` — ISSUE-0004 filed (outbox_event 7-day cleanup, low, Stage 14 deadline).

**X1 privilege verification result (durable lesson):**
`proacl = "postgres=X/postgres, service_role=X/postgres"` — no PUBLIC/authenticated/anon entry.
Supabase did NOT auto-grant EXECUTE to PUBLIC on this LANGUAGE plpgsql (non-SECURITY DEFINER) function.
Triple REVOKE was idempotent. GRANT to service_role is required for Edge Function RPC invocation.
Pattern: cron functions (LANGUAGE sql, called only by pg_cron) need no GRANT; dispatcher functions
(LANGUAGE plpgsql, called also via Edge Function RPC) need explicit GRANT TO service_role.

**Time spent:** ~2h (§2A pre-cues x2 rounds + audit triage + deliverable + verification)

**Surprises / departures:**

- outbox_event has no tenant_id column (confirmed at impl time). job_queue.tenant_id is nullable;
  omitted from INSERT. Pipeline worker derives tenant_id from session_id/assignment_id in payload.
- X1: Supabase did not auto-grant on non-SECURITY DEFINER LANGUAGE plpgsql. REVOKE idempotent.
  GRANT TO service_role mandatory for Edge Function RPC path.
- pre-existing advisory: intelligence_audit_log_default + learning_event_default (pg_partman default
  partitions from Stage 5/6) reported RLS-disabled by supabase db query. Not introduced in Stage 10;
  partitioned table routing means direct partition access is not the application code path. Not filed
  as new issue — logged here for awareness.

**Decisions made (not in stage):**

- ADR-0018: outbox dispatcher scheduled every minute via pg_cron; v1.1 upgrade path is Database
  Webhook rewrite (not schedule tuning).

**Deviations logged:**

- none (outbox dispatcher followed approved §2A plan; every-minute deviation documented in ADR-0018,
  not filed as DEV- since it was approved pre-implementation in §2A).

**Issues opened / closed / questions raised:**

- ISSUE-0004 opened: outbox_event 7-day cleanup (arch §5.6), low, deadline Stage 14 close.

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (0/0 pass-with-no-tests, turbo cached) · Build ✅ (cached) · RLS ✅ (451/451)
- pnpm test:migration ✅ (roundtrip up→down→up, all 10 migrations)

**Tomorrow — first thing:**

Stage 11 — packages/types + Zod Schemas. Run morning ritual before any work.

---

## Stage 11 — 2026-05-03

**Planned (from DEV_PLAN.md Stage 11):** packages/types + Zod Schemas — source-of-truth DTOs for
client + server, branded ID types, ErrorCode + envelope, SCHEMA_VERSION, test asserting every DTO
in Arch §6 has a schema. Add ProficiencyMapDTO (missing from Arch §6, needed Stage 24).

**Actually delivered:**

- `feat(types): stage 11 -- packages/types Zod schemas + branded IDs + DTO contracts` — commit 6536bdc
  - `packages/types/src/shared.ts` — SCHEMA_VERSION '1.0.0' (X4), 10 branded ID types via unique
    symbol pattern (X2: TenantId, UserId, SessionId, ItemId, SkillId, PathwayId, AssignmentId,
    PlanId, GraphVersionId, FrameworkConfigId), 16 DB enum schemas with 0001_enums_tenancy_auth.sql
    line citations, ErrorCode (15 codes per arch §1.5), APIErrorEnvelope.
  - `packages/types/src/identity.ts` — UserMeDTOSchema, TenantDTOSchema (§6.1)
  - `packages/types/src/content.ts` — PathwayDTOSchema, AssessmentProfileDTOSchema, ItemDTOSchema (§6.2)
  - `packages/types/src/session.ts` — 8 schemas: CreateSessionRequest/Response, RecordResponseRequest/
    Response, SubmitSessionResponse, SessionStateDTO, SessionSummaryDTO, CheckpointRequest (§6.3)
  - `packages/types/src/intelligence.ts` — BehaviourProfileDTO, SkillProgressDTO, RepairSessionDTO,
    CausalMapDTO, ExplanationDTO, LearningDNADTO (§6.4; imports PathwayReadinessDTOSchema from orchestration)
  - `packages/types/src/orchestration.ts` — LearningPlanItemDTO, LearningPlanDTO, PathwayReadinessDTO,
    PlanOverrideRequest (§6.5)
  - `packages/types/src/assignments.ts` — AssignmentDTO, CreateAssignmentRequest,
    StudentAssignmentDTO (extends AssignmentDTO via .extend()), AssignmentTrackingDTO (§6.6)
  - `packages/types/src/analytics.ts` — InterventionAlertDTO, CohortOverviewDTO, AutoGroupDTO (§6.7;
    imports ExplanationDTOSchema from intelligence)
  - `packages/types/src/billing.ts` — PlanCatalogDTO, SubscriptionDTO, CheckoutRequest/Response,
    InvoiceDTO (§6.8)
  - `packages/types/src/engagement.ts` — EngagementSummaryDTO, AchievementDTO, NotificationDTO (§6.9)
  - `packages/types/src/admin.ts` — JobStatusDTO, PipelineEventDTO (§6.10)
  - `packages/types/src/proficiency.ts` — MasteryBandSchema (4 bands: novice/developing/proficient/
    mastered), ProficiencyMapDTO (arch §6 gap; Stage 24 Results screen)
  - `packages/types/src/index.ts` — re-exports all 12 domain files with .js extensions (NodeNext)
  - `packages/types/src/__tests__/schemas.test.ts` — 97 tests: X1 DB enum parity (16 enums,
    hardcoded values citing migration line numbers), X3 exhaustive schema registry (≥30 ZodType
    exports), parse/safeParse smoke tests per domain.
  - `packages/types/package.json` — zod@3.25.76 added as production dependency.

**Time spent:** ~3h (morning ritual + pre-cues analysis + 13 source files + test file + quality gates)

**Surprises / departures:**

- Zod was not installed in any package.json — needed `pnpm add zod@^3.23 --filter @mm/types` before
  any code could be written. Resolved to zod@3.25.76.
- ProficiencyMapDTO 4-band vocabulary (novice/developing/proficient/mastered) confirmed distinct from
  SkillProgressDTO.status 5-band vocabulary (not_started/developing/proficient/advanced/mastered)
  per arch §6.4. Different fields, different purposes; no conflict.
- No cross-domain circular deps: orchestration ← intelligence ← analytics; content ← session.
  Import graph is a DAG.

**Decisions made (not in stage):**

- none (all X1–X4 patterns followed approved §2A plan; ADR-0019 not needed)

**Deviations logged:**

- none

**Issues opened / closed / questions raised:**

- none

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (97/97) · Build ✅ (cached) · RLS ✅ (451/451, unchanged)

**Tomorrow — first thing:**

Stage 12 — SDK + API Client (packages/sdk). Run morning ritual before any work.

---

## Stage 12 — 2026-05-03

**Planned (from DEV_PLAN.md Stage 12):** Typed fetch client + React Query hooks for Phase 1
endpoints. MmClient with JWT, X-Trace-Id, X-Client-Version, Idempotency-Key, APIError decoding.
hooks/ one file per endpoint group. mmKeys query-key factory. Unit tests.

**Actually delivered:**

- `feat(sdk): stage 12 -- typed fetch client + React Query hooks + ADR-0019` — commit 0c3b311
  - `packages/sdk/src/client.ts` — MmClient class; raw fetch wrapper (Q1 approved); getToken
    callback (Q2 approved); SDKResponse<T> = { data: T; traceId: string } (X2); APIError extends
    Error (X1 exact shape: code: ErrorCode, status, traceId, message); X-Trace-Id generated via
    crypto.randomUUID() if absent, echoed from response header preferred (X2); X-Client-Version:
    SCHEMA_VERSION auto-attached (G3); Idempotency-Key threaded per method; network errors
    propagate as-is (no wrapping); get/post/patch/delete typed methods.
  - `packages/sdk/src/context.ts` — MmClientProvider + useMmClient() via React.createElement
    (no JSX needed, no tsconfig jsx change).
  - `packages/sdk/src/keys.ts` — mmKeys factory with .all()/.byId(id)/.state(id)/.summary(id)
    hierarchy per X4 for all 7 domains.
  - `packages/sdk/src/hooks/identity.ts` — useMe(), useTenant(tenantId)
  - `packages/sdk/src/hooks/content.ts` — usePathways(), useAssessmentProfile(id)
  - `packages/sdk/src/hooks/session.ts` — useCreateSession, useSessionState, useSessionSummary,
    useRecordResponse, useSubmitSession, useCheckpoint; all mutations carry idempotencyKey (X3);
    auto-generated key stabilised per-mount via useRef; JSDoc warns not retry-safe without stable key.
  - `packages/sdk/src/hooks/intelligence.ts` — useLearningDNA, useSkillProgress, useCausalMap
  - `packages/sdk/src/hooks/orchestration.ts` — useLearningPlan, usePathwayReadiness, usePlanOverride
  - `packages/sdk/src/hooks/index.ts` — re-exports 5 groups
  - `packages/sdk/src/index.ts` — re-exports MmClient, APIError, SDKResponse<T>, MmClientProvider,
    useMmClient, mmKeys, all hooks
  - `packages/sdk/src/__tests__/client.test.ts` — 13 tests: X1 (APIError + instanceof + code),
    X2 (traceId from response header, success + error), X5 (X-Client-Version === SCHEMA_VERSION),
    header assertions (Auth Bearer, Idempotency-Key, X-Trace-Id UUID, omission cases)
  - `packages/sdk/src/__tests__/keys.test.ts` — 9 tests: X4 hierarchy, domain isolation
  - `packages/sdk/src/__tests__/hooks.test.ts` — 2 tests (jsdom, Q4): renderHook useMe() success
    + error paths via mock fetch + QueryClientProvider + MmClientProvider wrapper
  - `packages/sdk/tsconfig.json` — added `"lib": ["ES2022", "DOM"]` for crypto.randomUUID() +
    fetch types
  - `packages/sdk/package.json` — peerDependencies (react@^18, @tanstack/react-query@^5);
    deps: @mm/types@workspace:*, @tanstack/react-query@^5; devDeps: react, @types/react,
    @testing-library/react@^16, jsdom@^25
  - `docs/dev/decisions/0019-sdk-response-wrapper.md` — ADR-0019 accepted

**Time spent:** ~2h (morning ritual + Q1–Q4 + X1–X5 analysis + implementation + quality gates)

**Surprises / departures:**

- Q3 REVISED: analytics/assignments/billing/engagement hook stubs excluded per user direction
  ("build smallest complete production-shaped slice first"). Hooks will be added in the stage
  that first consumes them.
- `no-useless-catch` lint: try/catch that just rethrew was flagged. Removed entirely — network
  errors propagate naturally without a wrapper.
- `@typescript-eslint/no-unused-vars`: `_data` prefix not honoured for unused params in inline
  schema objects. Fixed by removing the parameter from the lambda (`(): void => undefined`).
- `children: ReactNode` (required) in MmClientProviderProps caused a TypeScript error with
  `createElement(Provider, { client }, children)`. Fixed by making `children?: ReactNode`
  (optional — createElement variadic arg merges into props.children at runtime).

**Decisions made (not in stage):**

- ADR-0019: SDKResponse<T> = { data: T; traceId: string } wrapper on all SDK methods.
  Sets precedent for future SDK methods (Stage 14+). Hooks unwrap via .then(r => r.data).

**Deviations logged:**

- none

**Issues opened / closed / questions raised:**

- none

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (121 total: 97 types + 24 sdk) · Build ✅ (cached) · RLS ✅ (451/451)

**Tomorrow — first thing:**

Stage 13 — packages/ui Primitives + Design Tokens + axe-core Gate. Run morning ritual before any work.

---

## Stage 9 — 2026-05-03

**Planned (from DEV_PLAN.md Stage 9):** Migration 0008 — pg_cron Setup; 8 cron functions +
8 cron job registrations; plan(22); 428/428 cumulative pgTAP.

**Actually delivered:**

- `feat(db): migration 0008 — pg_cron Setup` — commit d2d2090
  - `supabase/migrations/0008_cron.sql` — CREATE EXTENSION IF NOT EXISTS pg_cron; 8 LANGUAGE sql
    VOLATILE functions (fn_reap_stuck_jobs, fn_archive_jobs, fn_cleanup_pipeline,
    fn_cleanup_idem_keys, fn_cleanup_abandoned_sessions, fn_expire_plans, fn_cleanup_rate_limit,
    fn_recalibrate_content); 8 cron registrations via unschedule-first + cron.schedule() pattern
  - `supabase/migrations/down/0008_cron.down.sql` — unschedule×8 + DROP FUNCTION×8 (extension
    not dropped; Supabase pre-loads pg_cron)
  - `supabase/tests/rls/008_cron.sql` — plan(22), 428/428 cumulative
- `chore(dev-context): stage 9 close — pg_cron Setup` (this commit)
  - ADR-0017: cron.schedule() not direct INSERT into cron.job
  - DEVIATION DEV-20260503-2: content.recalibration wired as PHASE-2 no-op stub

**Time spent:** ~1.5h (§2A pre-cues + restatement + impl + verification)

**Surprises / departures:**

- fn_recalibrate_content no-op body: `SELECT 1` is invalid for LANGUAGE sql RETURNS void
  (SELECT returning int is not castable to void at CREATE time). Used
  `UPDATE job_queue SET status = status WHERE FALSE` — valid DML no-op. Comment explains stub.
- cron.schedule() API confirmed correct (iv REVERSED from DEV_PLAN.md "ON CONFLICT DO NOTHING");
  correction to DEV_PLAN.md deferred to Stage 10 audit.
- Down migration: extension NOT dropped — pg_cron is pre-loaded in Supabase Postgres; IF NOT
  EXISTS in up migration handles idempotent re-run after down.

**Decisions made (not in stage):**

- ADR-0017: cron.schedule() / cron.unschedule() API preferred over direct INSERT into cron.job.

**Deviations logged:**

- DEV-20260503-2: content.recalibration as PHASE-2 no-op stub (arch Part XI override).

**Issues opened / closed / questions raised:**

- none

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (0/0 pass-with-no-tests) · Build ✅ (cached) · RLS ✅ (428/428)

**Tomorrow — first thing:**

Stage 10 — audit day (ISSUE-0002 retrofit, ISSUE-0003 GHA action upgrade, DEV_PLAN.md cron
registration text correction). Run morning ritual before any work.

---

## Stage 8 — 2026-05-03

**Planned (from DEV_PLAN.md Stage 8):** Migration 0007 — New Domains (Assignments + Billing +
Engagement + Notifications); 11 tables, fn_my_assignment_ids() helper, 406/406 pgTAP.

**Actually delivered:**

- `feat(db): migration 0007 — New Domains ...` — commit ae47bb6
  - `supabase/migrations/0007_new_domains.sql` — 11 tables (assignment, assignment_target,
    assignment_session, subscription, billing_customer, invoice, billing_event,
    engagement_streak, achievement_definition, student_achievement, notification);
    fn_my_assignment_ids() SECURITY DEFINER helper; ALTER TABLE session_record ADD CONSTRAINT
    fk_session_assignment; 11 indexes; 5 updated_at triggers; full RLS
  - `supabase/migrations/down/0007_new_domains.down.sql` — DROP in reverse FK order
  - `supabase/tests/rls/007_new_domains.sql` — plan(72), 406/406 cumulative
  - `BUILD_CONTRACT.md` §6 + `PGTAP_PATTERNS.md` P3: A1 correction — triple REVOKE updated
    from "PUBLIC×2 + anon" to canonical "PUBLIC + authenticated + anon"
- `chore(dev-context): stage 8 close — New Domains` (this commit)
  - ADR-0015: Pattern G for tables with no v1 writer
  - ADR-0016: service-owned state machine (no DB state-transition triggers)

**Time spent:** ~3h (§2A review + amendments A1–A3 + V1/V2 verification + impl + verification)

**Surprises / departures:**

- A1 correction: BUILD_CONTRACT §6 "PUBLIC×2 + anon" was wrong — second REVOKE FROM PUBLIC
  is a no-op. Corrected to PUBLIC + authenticated + anon. §6 and PGTAP_PATTERNS P3 updated.
- Migration Section 1 ordering: fn_my_assignment_ids() (LANGUAGE sql) validates table refs at
  CREATE time. Must follow assignment_target creation. Moved to Section 2 after the tables.
- realtime.subscription conflict: pg_class WHERE relname = 'subscription' returned two rows
  (public.subscription + realtime.subscription). Fixed G4.1 with relnamespace filter; G_meta.2
  with schemaname = 'public' filter. Added note to PROJECT_STATE for future stages.
- DML CTE top-level restriction: WITH x AS (UPDATE ... RETURNING 1) must be at statement top
  level, not inside SELECT is(...). G11.5 refactored to top-level WITH + inline SELECT is().

**Decisions made (not in stage):**

- ADR-0015: Pattern G for tables with no v1 writer (billing, engagement, assignment_target).
- ADR-0016: service-owned state machine; no DB CHECK/trigger for state transitions.

**Deviations logged:**

- none

**Issues opened / closed / questions raised:**

- none

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (0/0 pass-with-no-tests) · Build ✅ (cached) · RLS ✅ (406/406)

**Tomorrow — first thing:**

Stage 9 — read DEV_PLAN.md Stage 9 and run morning ritual.

---

## Stage 7 — 2026-05-03

**Planned (from DEV_PLAN.md Stage 7):** Migration 0006 — Jobs + Outbox + Rate Limit;
4 infra tables, Pattern G, no new SECURITY DEFINER functions.

**Actually delivered:**

- `feat(db): migration 0006 — Jobs + Outbox + Rate Limit` (Stage commit)
  - `supabase/migrations/0006_jobs_outbox_rate_limit.sql` — 3 tables (outbox_event
    already in 0004), 7 indexes, RLS enabled + 0 policies
  - `supabase/migrations/down/0006_jobs_outbox_rate_limit.down.sql` — DROP 3 tables
  - `supabase/tests/rls/006_jobs_outbox_rate_limit.sql` — plan(26), 334/334 cumulative
- `chore(dev-context): stage 7 close — Jobs + Outbox + Rate Limit` (dev-context commit)
  - ADR-0014: pgTAP structural index assertions, not EXPLAIN
  - DAILY_LOG Stage 7 entry, PROJECT_STATE refresh, Stage 7 prompt archive

**Time spent:** ~2h (§2A + impl + verification)

**Surprises / departures:**

- DEV_PLAN.md Stage 7 listed outbox_event as deliverable but Migration 0004 already
  created it (Stage 5). Skipped duplicate creation; G3 tests dropped (4 assertions).
  plan(26), cumulative 334. DEV_PLAN.md not edited; the listing is informational, not a
  binding deliverable. Stage 10 audit will reconcile.
- Stage 8 pre-cues forward-flagged from Stage 7 morning prompt as themes only, not
  verbatim. Substance had to be re-pasted at Stage 8 start. Lesson: forward-flagged
  pre-cues must be captured verbatim in PROJECT_STATE.md 'Notes for next session' to
  preserve specific decisions and framing, not just topics.
- ADR-0014 slug error: initially filed as `catalog-not-explain.md`; correct slug is
  `structural-not-explain.md`. Stub cleaned up via `git clean -f` before Stage 8 start.

**Decisions made (not in stage):**

- ADR-0014: pgTAP index assertions via structural catalog check + dedup; not EXPLAIN.

**Deviations logged:**

- none

**Issues opened / closed / questions raised:**

- none

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (0/0 pass-with-no-tests) · Build ✅ (cached) · RLS ✅ (334/334)

**Tomorrow — first thing:**

Stage 8 — Migration 0007 — New Domains (Assignments + Billing + Engagement + Notifications).
§2A pre-implementation review required. User to provide Stage 8 §2A pre-cues (i)–(v).

---

## Stage 6 — 2026-05-03

**Planned (from DEV_PLAN.md Stage 6):** Migration 0005 — Intelligence Foundation (L1 Foundation Layer);
12 tables from arch §2.8–§2.10; RLS/policies per §2A pre-implementation review; pgTAP plan(70).

**Actually delivered:**

- `feat(db): migration 0005 — Intelligence Foundation (Stage 6)` — commit 2343cce
  - `supabase/migrations/0005_intelligence_orchestration.sql` — 12 tables, 7 updated_at triggers,
    C7 partial unique indexes on repair_record, intelligence_audit_log partitioned (default partition
    only), full RLS/policies implementing D1-D4 decisions from §2A review
  - `supabase/migrations/down/0005_intelligence_orchestration.down.sql` — DROP 12 tables in reverse
    FK dependency order
  - `supabase/tests/rls/005_intelligence_orchestration.sql` — plan(70): 60 Pattern A tests (6 per
    table × 10 tables), 2 plan_revision Pattern G, 3 cohort_metric_cache selective grant, 1 G4
    guard reactivation, 2 C7 concurrency, 2 partition routing; 308/308 cumulative
  - `supabase/tests/rls/002_content.sql` — plan(40)→plan(38): G11 in-transaction stub removed
    (skill_mastery now real table; per ADR-0007 G_G4 in Stage 6 is the real test)
- `chore(dev-context): stage 6 close — ...` — this commit

**Time spent:** ~3h (§2A review spanned prior session; implementation + verification + ritual)

**Surprises / departures:**

1. **idx_plan_override_active**: `WHERE expires_at > now()` in index predicate rejected —
   PostgreSQL requires index predicates to be IMMUTABLE; `now()` is STABLE. Fixed: plain index
   on `(student_id, type, expires_at)` — query planner can range-scan for `WHERE expires_at > now()`.

2. **Anon SELECT tests removed from Pattern A groups (plan 81→70)**:
   Pattern A tables have policies calling `fn_teacher_student_ids()` / `fn_my_child_ids()`
   (REVOKE FROM PUBLIC/anon per triple-REVOKE pattern, Stage 4). When `anon` role evaluates
   these policies, permission denied is raised before returning 0 rows. Same issue for
   `cohort_metric_cache` (policies call `auth_role()`). Established precedent: Stage 4 tests
   anon access via `has_function_privilege` in G16, not via SET ROLE anon + SELECT. Anon tests
   removed; plan reduced from 81 to 70. `plan_revision` G12.2 kept (no policies = no function
   calls = safe for anon).

3. **Nested data-modifying CTE invalid** (PostgreSQL):
   INSERT deny tests used `SELECT is((WITH x AS (INSERT...RETURNING 1) SELECT count(*) FROM x), 0, ...)`.
   PostgreSQL rejects data-modifying CTEs nested inside subqueries — must be top-level. Correct
   pattern for INSERT RLS deny: `throws_like($$INSERT...$$, '%row-level security%', description)`.
   All 10 G?.7 tests converted. This pattern is now documented in PROJECT_STATE.md.

4. **cohort_metric_cache deviation from arch** (DAILY_LOG deviation, no ADR):
   Arch §2.10 DDL has no `tenant_id` column. Arch §3.2 designates it Pattern G. Stage 6 §2A (D3)
   overrode both: tenant_id added + selective grant to teacher/org_admin/platform_admin. tenant_id
   also added to PRIMARY KEY to prevent PK conflicts for aggregate cohort_key values across tenants
   (e.g., 'year:5:naplan' would clash for tenant A vs tenant B without tenant_id in PK).

**Decisions made (not in stage):**

- ADR-0013: row-level RLS + app-layer column projection for audit/explainability tables

**Deviations logged:**

- none (cohort_metric_cache deviation logged in DAILY_LOG per policy — no ADR warranted)

**Issues opened / closed / questions raised:**

- none

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (18/18 packages) · Build ✅ (cached) · RLS ✅ (308/308)
- Migration roundtrip ✅ (up→down→up clean)

**Tomorrow — first thing:**
Stage 7 — Migration 0006 — Assignments + Notifications (arch §2.11–§2.12); §2A pre-implementation
review required before coding.

## Stage 5 + Audit Day 1 — 2026-05-02

**Planned (from DEV_PLAN.md Stage 5):** Migration 0004 — Sessions + Canonical Events; 7 tables;
Pattern A (student-data) + Pattern G (service-only); create_session_response_atomic atomic write;
UTA per-role RLS extension (ADR-0004 obligation); pgTAP plan(95). Audit Day 1: ISSUE-0001 Node 22
LTS bump, DEVIATIONS triage, OPEN_ISSUES triage.

**Actually delivered:**

- `chore(ci): bump Node 20 → 22 LTS (closes ISSUE-0001)` — commit 5bb1156
  - `.github/workflows/ci.yml`: node-version 20 → 22 in all 3 runner jobs
  - `package.json`: engines.node >=20 → >=22
  - `.nvmrc`: created with value 22
  - `.husky/commit-msg`: added Haiku to AI trailer rejection regex (missed in f146e85)
  - `docs/dev/OPEN_ISSUES.md`: ISSUE-0001 → Resolved (2026-05-02)
  - `docs/dev/decisions/0010-node-22-lts-ci-upgrade.md`: ADR-0010 filed
- `feat(db): migration 0004 — Sessions + Canonical Events` — commit b1bd4a0
  - `supabase/migrations/0004_sessions_events.sql` — 7 tables, 3 SECURITY DEFINER helpers,
    create_session_response_atomic (4-table atomic write, optimistic lock, VERSION_CONFLICT),
    RLS on 7 tables (Pattern A + Pattern G), UTA per-role extension (user_profile,
    parent_student_link, class_group, class_student DROP broad + ADD per-role)
  - `supabase/migrations/down/0004_sessions_events.down.sql` — DROP tables → restore UTA
    broad policies → DROP functions (BUG-B-correct order)
  - `supabase/tests/rls/004_sessions_events.sql` — plan(95); 25 groups; 240/240 cumulative
- `chore(dev-context): audit stage 5 — ...` — commit d79e7f7
  - `docs/dev/OPEN_ISSUES.md`: ISSUE-0002 filed (low; Stage 2/3 helpers missing anon REVOKE)
  - `docs/dev/decisions/0012-partitioned-table-pk-includes-partition-key.md`: ADR-0012 filed
  - `BUILD_CONTRACT.md`: §6 + §10 updated with triple-REVOKE rule and partition-PK checklist
- `chore(dev-context): stage 5 close — ...` — commit (this commit)
  - ADR-0011, DAILY_LOG, PROJECT_STATE, prompts archive

**Time spent:** ~4h (§2A pre-implementation review + implementation + verification + audit triage)

**Surprises / departures:**

1. **BUG-C (headline) — Supabase platform auto-grants EXECUTE to `anon` on every new function.**
   This is a Supabase default-privileges delta from vanilla PostgreSQL. `REVOKE EXECUTE FROM PUBLIC`
   (the ADR-0008 "double REVOKE" pattern) strips the PUBLIC pseudo-role but leaves a direct `anon`
   grant that Supabase applies independently. Discovery path: G16.1–G16.4 assertions (`anon cannot
   execute helper`) all returned `have: true, want: false`. Root cause confirmed via
   `information_schema.routine_privileges` — `anon` appeared as an explicit grantee alongside
   `authenticated` and `service_role`.
   **Why this is the headline lesson**: Stage 6–14 will create multiple new SECURITY DEFINER
   functions for intelligence-layer helpers. Each will silently acquire `anon` EXECUTE under the
   old double-REVOKE pattern. BUILD_CONTRACT §6 and §10 now carry the canonical triple-REVOKE
   pattern as the safety net; any reviewer who misses it on a PR will be caught by the updated
   migration checklist (point 5). Stage 2/3 helpers have the gap — ISSUE-0002 filed for remediation
   before Stage 10 audit.

2. **BUG-A — PostgreSQL partitioned-table PK must include all partition key columns.**
   `learning_event` declared `id uuid PRIMARY KEY` but is partitioned `BY RANGE (created_at)`.
   PostgreSQL raised SQLSTATE 0A000 at DDL time: "unique constraint on partitioned table must
   include all partitioning columns." Fixed: `PRIMARY KEY (id, created_at)`. Same rule applied to
   `idx_le_dedup` (also a UNIQUE constraint). ADR-0012 filed; BUILD_CONTRACT §10 checklist updated.
   The `intelligence_audit_log` table in Stage 6 is also partitioned monthly — apply the composite
   PK rule there preemptively.

3. **BUG-B — Down migration dropped helper functions while surviving-table policies still referenced them.**
   Policies on `user_profile` and `class_student` (`up_teacher_select`, `cs_teacher_select`) reference
   `fn_teacher_student_ids()`. These tables are NOT dropped by the down migration (they are from
   earlier migrations), so their policies survive the DROP TABLE block. Attempting to DROP FUNCTION
   while a policy references it raised "cannot drop function … because other objects depend on it."
   Fix: reorder the down migration — clear UTA per-role policies (restoring Stage 2 broad policies)
   **before** dropping helper functions. This is a strict dependency: policies → functions.

4. **BUG-D — `throws_ok(sql, errcode, text)` 3-arg form treats `text` as the message to match.**
   G18.1 was written as `throws_ok($$...$$, 'P0001', 'G18.1: stale expected_version=1…')`.
   pgTAP's 3-arg `throws_ok` uses the third argument as the error message to assert against
   (displaying it as `wanted: P0001: G18.1: …` vs `caught: P0001: VERSION_CONFLICT`). The test
   name comes from auto-generation. Fix: 4-arg form `throws_ok(sql, 'P0001', 'VERSION_CONFLICT',
   'G18.1: …')`. Alternatively, `throws_like(sql, '%VERSION_CONFLICT%', description)` for
   message-pattern checks without an errcode assertion. Stage 4's PROJECT_STATE pgTAP pattern
   table entry for "Function raises (code check)" was incorrect; updated in this session's
   PROJECT_STATE.

**Decisions made (not in stage):**

- ADR-0010: Node 22 LTS CI upgrade (audit day work)
- ADR-0011: Pattern A SECURITY DEFINER helpers — three binding principles
- ADR-0012: Partitioned-table PK must include all partition key columns
- BUILD_CONTRACT §6 + §10 updated (triple REVOKE canonical pattern; partition-PK checklist item)

**Deviations logged:**

- none (four bugs fixed in-stage before commit; no scope deviation from DEV_PLAN.md Stage 5)

**Issues opened / closed / questions raised:**

- ISSUE-0001 closed: Node 22 LTS bump complete (commit 5bb1156; ADR-0010 filed)
- ISSUE-0002 opened: Stage 2/3 helpers missing `REVOKE EXECUTE FROM anon` (low severity;
  remediation before Stage 10 audit; ISSUE-0002 in OPEN_ISSUES.md)

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (18/18, all cached) · Build ✅ (cached from Stage 1) · RLS ✅ (240/240, 28 tables) · Migration roundtrip ✅ (pnpm test:migration green)

**Tomorrow — first thing:**
Stage 6 — Migration 0005 — Intelligence Foundation (L1 Foundation Layer). Schema/policy stage →
run §2A pre-implementation review before C-C-D-V.

---

## Stage 4 — 2026-05-02

**Planned (from DEV_PLAN.md Stage 4):** Migration 0003 — Assessment Configuration; 5 tables; RLS Pattern F admin-write public-read; pgTAP plan(40).

**Actually delivered:**

- `supabase/migrations/0003_assessment_config.sql` — 5 tables (framework_config, blueprint, pathway, assessment_profile, diagnostic_rule), UNIQUE index on framework_config(exam_family, version), btree index on pathway(required_feature_key), Pattern F RLS per ADR-0009 (platform_admin write only; is_active=true SELECT filter for pathway + assessment_profile).
- `supabase/migrations/down/0003_assessment_config.down.sql` — 5 DROP TABLE in reverse FK order; roundtrip verified clean via manual docker exec psql. Migration 0002 tables (skill_node etc.) confirmed intact after down.
- `supabase/tests/rls/003_assessment_config.sql` — pgTAP plan(40), 40/40 pass. 8 groups: RLS enabled (5), key columns (15), indexes (2), non-admin INSERT rejected (5), platform_admin INSERT succeeds (5), SELECT active rows visible (5), inactive rows hidden (2), CHECK constraint (1).
- ADR-0009 filed: platform-catalog tables use platform_admin-only write policies (not org_admin). Table-classification heuristic added to ADR-0009 Follow-ups for Stages 5–10.
- OWNERS.md addendum: pathway.required_feature_key service contract documented.
- PROJECT_STATE.md updated; pgTAP pattern library extended with JWT claims role simulation skeleton.

**Time spent:** ~2h (including 2-cycle §2A review + pre-execution verifications)

**Surprises / departures:**

1. **org_admin vs platform_admin write scope** (§2A Substantive 1): arch §3.2 Pattern F template lists both org_admin and platform_admin as write roles. Corrected before coding: assessment configuration is platform-level catalog (not tenant-scoped); org_admin is tenant-scoped per OWNERS.md and arch §3.1. Allowing org_admin write would corrupt content for all tenants sharing the same pathway. ADR-0009 captures the precedent for future platform-catalog tables.

2. **JWT claims path for auth_role()** (§2A Substantive 2 + VERIFICATION 1): auth_role() reads `request.jwt.claims -> 'app_metadata' ->> 'role'` (nested under app_metadata, not top-level). §2A skeleton must match verbatim. New pgTAP pattern documented: `set_config('request.jwt.claims', '{"sub":"...","app_metadata":{"role":"platform_admin",...}}', true)` before `SET ROLE authenticated`.

3. **framework_config.blueprint jsonb + blueprint table** (§2A Correction 2): naming collision in arch §2.4 — both a `blueprint jsonb` column on framework_config (embedded default template) and a separate `blueprint` table (specific profile instances) exist verbatim. Implemented both per arch; comment added in migration to clarify purpose distinction.

4. **pathway.required_feature_key convention deferred to Stage 14** (VERIFICATION 2): NOT NULL column with no CHECK constraint on value; convention for free-tier vs paid pathways (e.g., 'pathway.feature.public' vs 'pathway.feature.naplan.numeracy_y5') deferred. Forward-flag recorded in PROJECT_STATE Notes for next session.

**Decisions made (not in stage):**

- ADR-0009: Platform-catalog tables use platform_admin-only write policies + table-classification heuristic for Stages 5–10

**Deviations logged:**

- none

**Issues opened / closed / questions raised:**

- none new

**Quality gates at close:**

- Lint ✅ (cached, 18/18) · Typecheck ✅ (cached, 18/18) · Tests ✅ (18/18 workspaces) · Build ✅ (cached) · RLS ✅ (pgTAP 145/145, 21 tables) · Migration roundtrip ✅ (manual docker exec, down→verify→up)

**Tomorrow — first thing:**
Stage 5 — Migration 0004 — Sessions + Canonical Events. Run §2A pre-implementation review before C-C-D-V. High-risk stage (create_session_response_atomic optimistic lock). Also: ISSUE-0001 CI Node upgrade (deadline 2026-06-02) due Stage 5 audit day.

---

## Stage 3 — 2026-05-02

**Planned (from DEV_PLAN.md Stage 3):** Migration 0002 — Content & Skill Graph; 10 tables; v_item_current view; publish_skill_graph (SECURITY DEFINER); fn_graph_version_is_published helper; Pattern F RLS with draft isolation; pgTAP plan(40).

**Actually delivered:**

- `supabase/migrations/0002_content_skill_graph.sql` — 9 tables (skill_graph_version, skill_node, skill_edge, skill_migration_map, misconception, repair_sequence, stimulus, item, item_version), v_item_current WITH (security_invoker=true), fn_graph_version_is_published SECURITY DEFINER helper, 5 set_updated_at triggers, publish_skill_graph SECURITY DEFINER function with to_regclass+EXECUTE G4 guard + slug-path cycle RAISE, Pattern F RLS on all 9 tables. Commit: [this session].
- `supabase/migrations/down/0002_content_skill_graph.down.sql` — full reverse in FK dependency order; roundtrip verified clean via manual docker exec psql.
- `supabase/tests/rls/002_content.sql` — pgTAP plan(40), 40/40 pass. 12 groups covering RLS enabled, function shapes, triggers, v_item_current, cycle detection, forked DAG, draft isolation pre/post, clean publish, G4 guard stub, permission check.
- ADR-0007 correction appended: EXECUTE required for G4 guard (plain SELECT short-circuit insufficient in PL/pgSQL).
- ADR-0008 filed (2026-05-02): Pattern F content-table RLS decisions.
- PROJECT_STATE.md updated; pgTAP pattern library extended.

**Time spent:** ~3h (including §2A carried from previous context + 3-round debugging session)

**Surprises / departures:**

1. **PL/pgSQL parses full SQL at execution time regardless of short-circuit.** The ADR-0007 spec SQL `SELECT (to_regclass(...) IS NOT NULL AND EXISTS (SELECT 1 FROM skill_mastery ...))` fails with "relation does not exist" when Stage 6 tables are absent, even with the to_regclass guard. PL/pgSQL resolves ALL table references in a SQL statement during parse/plan, before boolean evaluation. Fix: `IF to_regclass() IS NOT NULL THEN EXECUTE '...' END IF`. ADR-0007 implementation correction appended. Lesson: to_regclass guard only works inside an IF block with dynamic EXECUTE, not inline in a static SQL statement.

2. **throws_ok 3-arg is (sql, errcode, errmsg) — not (sql, errcode, description).** This pgTAP version treats the 3rd argument as the expected message, not the test description. A test named 'G6.1: ...' as arg3 failed because the actual CYCLE_DETECTED message didn't match. Fix: use throws_like(sql, '%pattern%', description) for message checks; use 4-arg throws_ok(sql, errcode, errmsg, description) when both code and description are needed. Note: 4-arg form with NULL errmsg crashes this pgTAP version (server connection loss). Use has_function_privilege() for permission-denied assertions instead.

3. **Supabase local dev grants EXECUTE to authenticated by default.** REVOKE FROM PUBLIC alone does not prevent authenticated from calling publish_skill_graph — a default environment-level grant exists. Fix: add `REVOKE EXECUTE FROM authenticated` explicitly. Double REVOKE documented in migration with comment.

4. **Container restart timeouts on Windows/Docker Desktop.** `supabase db reset --local` intermittently fails at the "Restarting containers" step with 502/timeout errors. The migration itself applies successfully; the failure is in a post-reset health check. Workaround: run migrations and tests via docker exec psql + supabase test db directly. No migration content impact.

**Decisions made (not in stage):**

- ADR-0007: to_regclass forward-compatibility for G4 guard (accepted 2026-05-02; implementation correction appended same day)
- ADR-0008: Content-table RLS Pattern F with draft graph isolation (accepted 2026-05-02)

**Deviations logged:**

- none (all items resolved within the stage; corrections documented in ADRs)

**Issues opened / closed / questions raised:**

- none new

**Quality gates at close:**

- Lint ✅ (cached, 6/6) · Typecheck ✅ (cached, 6/6) · Tests ✅ (6/6 workspaces) · Build ✅ (cached) · RLS ✅ (pgTAP 105/105, 16 tables) · Migration roundtrip ✅ (manual docker exec verification, both migrations)

**Tomorrow — first thing:**
Stage 4 — Migration 0003 — Assessment Configuration. Run §2A pre-implementation review (schema/policy stage) before C-C-D-V.

---

## Correction — 2026-05-02 (pre-Stage 3 morning reconciliation — ISSUE-0001 renumber)

ISSUE-0001 recycled per pre-Stage 2 direction (discrepancy surfaced in Stage 3 morning prompt):

- **Closed**: ISSUE-0001 (original, 2026-05-01) "UTA-table SELECT policies: tenant-scoped only,
  per-role absent until Stage 5" — closed wont-fix. Rationale: duplicate of ADR-0004 deferral.
  ADR-0004 + PROJECT_STATE.md Notes for next session already capture the Stage 5 obligation fully.
  No hard deadline; planned Stage 5 deliverable. A separate issue added noise without information.

- **Filed**: ISSUE-0001 (new, 2026-05-02) "CI node-version: GitHub Actions Node 20 deprecation;
  upgrade to Node 22 LTS required" — medium severity, hard deadline before 2026-06-02, due Stage 5
  audit day. This was the pre-Stage 2 intended content of ISSUE-0001.

- **Updated**: PROJECT_STATE.md Notes for next session — removed stale ISSUE-0001/RLS reference;
  added ISSUE-0001 = Node CI upgrade with deadline. Open items count unchanged (0/0/1/0).

---

## Stage 2 — 2026-05-01

**Planned (from DEV_PLAN.md Stage 2):** All custom enums + tenancy/identity tables + RLS helpers + handle_new_user + set_updated_at().

**Actually delivered:**

- `supabase/migrations/0001_enums_tenancy_auth.sql` — 37 enum types, 7 tables, 5 SECURITY DEFINER helpers, handle_new_user() G1 parent-only branch, set_updated_at() + triggers on 4 mutable tables, RLS on all 7 tables. Commit e58a925.
- `supabase/migrations/down/0001_enums_tenancy_auth.down.sql` — full reverse in FK dependency order; roundtrip verified clean.
- `supabase/tests/rls/001_tenancy.sql` — pgTAP plan(65), 65/65 pass. Covers G1–G9.
- `scripts/migration-roundtrip.sh` — up→down→verify clean→up roundtrip helper.
- `package.json` — `test:rls` and `test:migration` scripts added.
- ADR-0003, ADR-0004, ADR-0005, ADR-0006 filed (evening ritual).
- ISSUE-0001 opened (UTA-table per-role RLS deferred to Stage 5, medium severity).
- CLAUDE_PROMPTS.md §2A item (e) amended to require pgTAP skeleton forms for new patterns (ADR-0006).

**Time spent:** ~2h

**Surprises / departures:**

1. **plan count 66→65 — planning arithmetic error.** The draft plan counted 66 assertions (7+20+1+4+1+12+4+12+4 is actually 65). Corrected in test file before push. Lesson: verify plan() count by summing group totals before writing the test file; do not carry the number from prose.

2. **DML-CTE nested inside SELECT is a Postgres parse error.** The pattern `SELECT is((WITH x AS (INSERT...) SELECT COUNT(*) FROM x), ...)` fails with "WITH clause containing a data-modifying statement must be at the top level." All G7–G9 DML assertions restructured to top-level `WITH x AS (...) SELECT is((SELECT COUNT(*) FROM x), 0, 'msg')`. Lesson: any §2A pgTAP plan item that involves DML inside `is()`/`ok()` must include a skeleton form; this error is a syntax error, not a logic error, and would have been caught at §2A review time.

3. **admin_action_log INSERT raises SQLSTATE 42501, not silent zero-rows.** When no INSERT policy exists on an RLS-enabled table, Postgres raises `new row violates row-level security policy` (not a silent zero-rows return). UPDATE and DELETE with no SELECT policy silently return 0 rows (rows invisible via no-SELECT-policy filter). G7.2 switched from the DML-CTE zero-rows pattern to `throws_ok(sql, '42501', NULL, description)`. Lesson: INSERT RLS with no policy = exception (42501); UPDATE/DELETE RLS with no policy = filter (0 rows). The distinction is architectural — INSERT has no "row already exists" check to fail silently.

4. **now() is constant within a transaction.** pgTAP trigger tests comparing `updated_at_after > updated_at_before` always fail because `set_updated_at()` calls `now()`, which returns the transaction start time throughout the entire transaction — both reads return the same timestamp. Fixed by inserting with a sentinel `updated_at = '2000-01-01'` and asserting the trigger changed it to `> '2000-01-01'`. Lesson: never compare within-transaction before/after timestamps for trigger tests; use a sentinel past timestamp instead.

**Decisions made (not in stage):**

- ADR-0003: actor_role='parent' for self_service_signup log entries
- ADR-0004: UTA-table RLS minimal tenant-isolation; per-role SELECT deferred to Stage 5
- ADR-0005: SECURITY DEFINER helpers for junction-table RLS (BUILD_CONTRACT §6)
- ADR-0006: §2A pgTAP pattern verification requirement — skeleton forms for new patterns

**Deviations logged:**

- none (plan count discrepancy is a planning-phase arithmetic error, not a scope deviation from DEV_PLAN.md)

**Issues opened / closed / questions raised:**

- ISSUE-0001 opened: UTA-table SELECT policies are tenant-scoped only; per-role granularity absent until Stage 5 (ADR-0004). Severity: medium.

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (6/6 workspaces) · Build ✅ (cached from Stage 1, no TS changes) · RLS ✅ (pgTAP 65/65, 7/7 tables)

**Tomorrow — first thing:**
Stage 3 — Migration 0002 — Content & Skill Graph. Run §2A pre-implementation review (schema stage, mandatory) before C-C-D-V.

---

## Stage 1 — 2026-04-30

**Planned (from DEV_PLAN.md Stage 1):** Turborepo + pnpm workspaces + TypeScript strict + ESLint + Prettier + Husky + GitHub Actions matrix + Supabase au-syd project configured.

**Actually delivered:**

- Root scaffold: `turbo.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `package.json` (Node >=20, pnpm >=9, packageManager pnpm@10.30.3), `.npmrc` (shamefully-hoist), `.eslintrc.json`, `.prettierrc`, `.prettierignore`, `.gitmessage`
- `apps/web`: Next.js 14.2.35 App Router + Tailwind 3 + TypeScript strict
- 5 packages scaffolded: `@mm/types`, `@mm/sdk`, `@mm/ui`, `@mm/core`, `@mm/engines` — each with tsconfig (NodeNext) + empty `src/index.ts`
- `.husky/pre-commit` (mode 100755) — runs typecheck + lint
- `.github/workflows/ci.yml` — 4 jobs: lint / typecheck / unit / migration-dryrun (stub)
- ADR-0001 filed: engines-client deferred to Stage 15
- DEV-20260430-1 filed: same decision with today's date (supersedes legacy ID DEV-20260426-1 in DEV_PLAN.md)

**Time spent:** ~1h

**Surprises / departures:**

- pnpm 10 (not 9) installed locally; satisfies `>=9` engines constraint — no impact.
- pnpm 10 blocks all postinstall scripts by default (new in pnpm 9+); esbuild native binary install was silently skipped until `pnpm approve-builds` surfaced the block. Resolved by adding `pnpm.onlyBuiltDependencies: [esbuild, unrs-resolver]` to root `package.json`. Without this, vitest would silently fail at runtime.
- `apps/web/.eslintrc.json` added in addition to root `.eslintrc.json`. `next/core-web-vitals` bundles its own `eslint-config-next` plugin chain and needs its own config file to avoid conflict with the root TypeScript-only config. These two configs coexist: root applies to all `packages/*`; `apps/web` config applies to the Next.js app only.
- Vite CJS deprecation warning in vitest output; cosmetic, exits 0. Will address with ESM vitest config in Stage 11.

**Decisions made (not in stage):**

- ADR-0002: `.npmrc` pnpm hoisting policy. Used `public-hoist-pattern[]=*eslint*/*prettier*/typescript/*vitest*` (targeted, not `shamefully-hoist=true`) to make dev toolchain binaries available in workspace scripts without per-workspace devDep declarations. See `docs/dev/decisions/0002-npmrc-hoist-policy.md`.
- Added `pnpm.onlyBuiltDependencies: [esbuild, unrs-resolver]` to unlock postinstall scripts blocked by pnpm 10 default policy.

**Deviations logged:**

- DEV-20260430-1 (packages/engines-client deferred to Stage 15)

**Issues opened / closed / questions raised:**

- none

**Quality gates at close:**

- Lint ✅ · Typecheck ✅ · Tests ✅ (0 tests, pass-with-no-tests) · Build ✅ (Next.js 14.2.35 + 5 packages) · RLS n/a (no migrations)

**Tomorrow — first thing:**

Stage 2 — Migration 0001 (enums + tenancy + auth). Run §2A pre-implementation review before C-C-D-V — it is a schema/policy stage.
