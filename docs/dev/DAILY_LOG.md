# DAILY_LOG.md — append-only, never pruned

> Newest entry at TOP. Use the template from CLAUDE.md §Templates.

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
