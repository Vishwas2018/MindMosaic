# DAILY_LOG.md — append-only, never pruned

> Newest entry at TOP. Use the template from CLAUDE.md §Templates.

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
