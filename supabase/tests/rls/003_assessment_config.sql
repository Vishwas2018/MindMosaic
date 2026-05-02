-- =============================================================================
-- pgTAP Test: 003_assessment_config.sql
-- Stage 4 · 2026-05-02
-- plan(40)
-- Tests: RLS enabled (G1×5), key columns (G2×15), indexes (G3×2),
--        non-admin INSERT rejected (G4×5), platform_admin INSERT succeeds
--        (G5×5), SELECT active rows visible (G6×5), inactive rows hidden
--        (G7×2), CHECK constraint (G8×1)
--
-- New pgTAP pattern (per ADR-0006 — skeleton required for first use):
--   JWT claims role simulation via set_config + SET ROLE authenticated:
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"...","app_metadata":{"role":"platform_admin","tenant_id":"..."}}',
--       true);
--     SET ROLE authenticated;
--   auth_role() reads request.jwt.claims -> 'app_metadata' ->> 'role'
--   (Verified in Migration 0001 source — VERIFICATION 1 confirmed 2026-05-02)
--
-- Role strategy:
--   Setup, G1–G3, G8: run as postgres (service_role — RLS bypassed)
--   G4: SET ROLE authenticated + parent JWT → non-admin, INSERT rejected
--   G5: SET ROLE authenticated + platform_admin JWT → admin, INSERT allowed
--   G6–G7: SET ROLE authenticated + student JWT → reads active rows only
--
-- Test data UUIDs (explicit for reproducibility):
--   fc_id:             00000000-0000-0000-0003-000000000001  (framework_config seed)
--   bp_id:             00000000-0000-0000-0003-000000000002  (blueprint seed)
--   pw_active_id:      00000000-0000-0000-0003-000000000003  (pathway, is_active=true)
--   pw_inactive_id:    00000000-0000-0000-0003-000000000004  (pathway, is_active=false)
--   ap_active_id:      00000000-0000-0000-0003-000000000005  (assessment_profile, active)
--   ap_inactive_id:    00000000-0000-0000-0003-000000000006  (assessment_profile, inactive)
--   sgv_id:            00000000-0000-0000-0003-000000000007  (skill_graph_version for DR FK)
--   sn_id:             00000000-0000-0000-0003-000000000008  (skill_node for DR FK)
--   dr_active_id:      00000000-0000-0000-0003-000000000009  (diagnostic_rule seed)
-- =============================================================================

BEGIN;
SELECT plan(40);

-- =============================================================================
-- TEST SETUP — insert seed data as postgres (RLS bypassed)
-- =============================================================================

INSERT INTO framework_config (id, exam_family, version, structure, scoring_rules, constraints, difficulty_bands, blueprint)
VALUES (
  '00000000-0000-0000-0003-000000000001',
  'naplan', 'v_setup_003',
  '{"name":"NAPLAN Numeracy Y5"}'::jsonb,
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
);

INSERT INTO blueprint (id, sections)
VALUES ('00000000-0000-0000-0003-000000000002', '{"strands":[]}'::jsonb);

INSERT INTO pathway (id, slug, display_name, exam_family, program, framework_config_id, engine_type, year_levels, required_feature_key, is_active)
VALUES (
  '00000000-0000-0000-0003-000000000003',
  'naplan-numeracy-y5', 'NAPLAN Numeracy Y5',
  'naplan', 'numeracy',
  '00000000-0000-0000-0003-000000000001',
  'adaptive', ARRAY[5],
  'pathway.feature.naplan.numeracy_y5', true
);

INSERT INTO pathway (id, slug, display_name, exam_family, program, framework_config_id, engine_type, year_levels, required_feature_key, is_active)
VALUES (
  '00000000-0000-0000-0003-000000000004',
  'naplan-numeracy-y3', 'NAPLAN Numeracy Y3',
  'naplan', 'numeracy',
  '00000000-0000-0000-0003-000000000001',
  'adaptive', ARRAY[3],
  'pathway.feature.naplan.numeracy_y3', false
);

INSERT INTO assessment_profile (id, exam_family, program, year_level, version, framework_config_id, blueprint_id, duration_minutes, is_active)
VALUES (
  '00000000-0000-0000-0003-000000000005',
  'naplan', 'numeracy', 5, 'v_setup_003',
  '00000000-0000-0000-0003-000000000001',
  '00000000-0000-0000-0003-000000000002',
  45, true
);

INSERT INTO assessment_profile (id, exam_family, program, year_level, version, framework_config_id, blueprint_id, duration_minutes, is_active)
VALUES (
  '00000000-0000-0000-0003-000000000006',
  'naplan', 'numeracy', 3, 'v_setup_003_old',
  '00000000-0000-0000-0003-000000000001',
  '00000000-0000-0000-0003-000000000002',
  40, false
);

-- skill_graph_version + skill_node for diagnostic_rule FK tests
INSERT INTO skill_graph_version (id, version, status)
VALUES ('00000000-0000-0000-0003-000000000007', 999, 'draft');

INSERT INTO skill_node (id, graph_version_id, level, name, slug)
VALUES (
  '00000000-0000-0000-0003-000000000008',
  '00000000-0000-0000-0003-000000000007',
  'strand', 'Number', 'number-stage4-test'
);

INSERT INTO diagnostic_rule (id, skill_id, condition, action)
VALUES (
  '00000000-0000-0000-0003-000000000009',
  '00000000-0000-0000-0003-000000000008',
  '{"threshold":0.6}'::jsonb,
  'probe_deeper'
);

-- =============================================================================
-- G1 — RLS enabled on all 5 Stage 4 tables (5 assertions)
-- =============================================================================

SELECT is(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'framework_config'),
  true, 'G1.1: RLS enabled on framework_config'
);
SELECT is(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'blueprint'),
  true, 'G1.2: RLS enabled on blueprint'
);
SELECT is(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pathway'),
  true, 'G1.3: RLS enabled on pathway'
);
SELECT is(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'assessment_profile'),
  true, 'G1.4: RLS enabled on assessment_profile'
);
SELECT is(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'diagnostic_rule'),
  true, 'G1.5: RLS enabled on diagnostic_rule'
);

-- =============================================================================
-- G2 — Key columns present (15 assertions)
-- framework_config (4): exam_family, scoring_rules, difficulty_bands, blueprint(jsonb)
-- pathway (4): required_feature_key, framework_config_id, is_active, year_levels
-- blueprint (1): sections
-- assessment_profile (3): framework_config_id, blueprint_id, is_active
-- diagnostic_rule (3): skill_id, action, next_skill_id
-- =============================================================================

SELECT has_column('public', 'framework_config', 'exam_family',      'G2.1: framework_config.exam_family');
SELECT has_column('public', 'framework_config', 'scoring_rules',    'G2.2: framework_config.scoring_rules');
SELECT has_column('public', 'framework_config', 'difficulty_bands', 'G2.3: framework_config.difficulty_bands');
SELECT has_column('public', 'framework_config', 'blueprint',        'G2.4: framework_config.blueprint (jsonb template)');

SELECT has_column('public', 'pathway', 'required_feature_key', 'G2.5: pathway.required_feature_key');
SELECT has_column('public', 'pathway', 'framework_config_id',  'G2.6: pathway.framework_config_id');
SELECT has_column('public', 'pathway', 'is_active',            'G2.7: pathway.is_active');
SELECT has_column('public', 'pathway', 'year_levels',          'G2.8: pathway.year_levels');

SELECT has_column('public', 'blueprint', 'sections', 'G2.9: blueprint.sections');

SELECT has_column('public', 'assessment_profile', 'framework_config_id', 'G2.10: assessment_profile.framework_config_id');
SELECT has_column('public', 'assessment_profile', 'blueprint_id',        'G2.11: assessment_profile.blueprint_id');
SELECT has_column('public', 'assessment_profile', 'is_active',           'G2.12: assessment_profile.is_active');

SELECT has_column('public', 'diagnostic_rule', 'skill_id',      'G2.13: diagnostic_rule.skill_id');
SELECT has_column('public', 'diagnostic_rule', 'action',        'G2.14: diagnostic_rule.action');
SELECT has_column('public', 'diagnostic_rule', 'next_skill_id', 'G2.15: diagnostic_rule.next_skill_id');

-- =============================================================================
-- G3 — Required indexes (2 assertions)
-- =============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'framework_config'
      AND indexname = 'idx_fc_family_version'
  ),
  'G3.1: idx_fc_family_version exists on framework_config'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'pathway'
      AND indexname = 'idx_pathway_feature_key'
  ),
  'G3.2: idx_pathway_feature_key exists on pathway'
);

-- =============================================================================
-- G4 — Non-admin INSERT rejected (5 assertions)
-- Role: authenticated + parent JWT → auth_role() = 'parent'
-- INSERT WITH CHECK (auth_role() = 'platform_admin') → false → 42501
-- New pattern: JWT claims with app_metadata.role (auth_role() reads
--   request.jwt.claims -> 'app_metadata' ->> 'role')
-- =============================================================================

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000099","app_metadata":{"role":"parent","tenant_id":"00000000-0000-0000-0000-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT throws_like(
  $$INSERT INTO framework_config (exam_family, version, structure, scoring_rules, constraints, difficulty_bands, blueprint) VALUES ('naplan','v_g4','{}','{}','{}','{}','{}')$$,
  '%violates row-level security%',
  'G4.1: parent cannot INSERT into framework_config'
);

SELECT throws_like(
  $$INSERT INTO blueprint (sections) VALUES ('{}')$$,
  '%violates row-level security%',
  'G4.2: parent cannot INSERT into blueprint'
);

SELECT throws_like(
  $$INSERT INTO pathway (slug, display_name, exam_family, program, framework_config_id, engine_type, year_levels, required_feature_key) VALUES ('g4-test','G4 Test','naplan','numeracy','00000000-0000-0000-0003-000000000001','adaptive','{5}','pathway.feature.test')$$,
  '%violates row-level security%',
  'G4.3: parent cannot INSERT into pathway'
);

SELECT throws_like(
  $$INSERT INTO assessment_profile (exam_family, program, year_level, version, framework_config_id, blueprint_id, duration_minutes) VALUES ('naplan','numeracy',5,'v_g4','00000000-0000-0000-0003-000000000001','00000000-0000-0000-0003-000000000002',45)$$,
  '%violates row-level security%',
  'G4.4: parent cannot INSERT into assessment_profile'
);

SELECT throws_like(
  $$INSERT INTO diagnostic_rule (skill_id, condition, action) VALUES ('00000000-0000-0000-0003-000000000008','{}','probe_deeper')$$,
  '%violates row-level security%',
  'G4.5: parent cannot INSERT into diagnostic_rule'
);

RESET ROLE;

-- =============================================================================
-- G5 — platform_admin INSERT succeeds (5 assertions)
-- Role: authenticated + platform_admin JWT → auth_role() = 'platform_admin'
-- INSERT WITH CHECK (auth_role() = 'platform_admin') → true → lives_ok
-- =============================================================================

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000098","app_metadata":{"role":"platform_admin","tenant_id":"00000000-0000-0000-0000-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT lives_ok(
  $$INSERT INTO framework_config (id, exam_family, version, structure, scoring_rules, constraints, difficulty_bands, blueprint) VALUES ('00000000-0000-0000-0003-000000000011','naplan','v_g5_fc','{}','{}','{}','{}','{}')$$,
  'G5.1: platform_admin can INSERT into framework_config'
);

SELECT lives_ok(
  $$INSERT INTO blueprint (id, sections) VALUES ('00000000-0000-0000-0003-000000000012','{"strands":[]}')$$,
  'G5.2: platform_admin can INSERT into blueprint'
);

SELECT lives_ok(
  $$INSERT INTO pathway (id, slug, display_name, exam_family, program, framework_config_id, engine_type, year_levels, required_feature_key) VALUES ('00000000-0000-0000-0003-000000000013','naplan-g5-test','G5 Test Pathway','naplan','numeracy','00000000-0000-0000-0003-000000000001','adaptive','{5}','pathway.feature.g5.test')$$,
  'G5.3: platform_admin can INSERT into pathway'
);

SELECT lives_ok(
  $$INSERT INTO assessment_profile (id, exam_family, program, year_level, version, framework_config_id, blueprint_id, duration_minutes) VALUES ('00000000-0000-0000-0003-000000000014','naplan','numeracy',5,'v_g5_ap','00000000-0000-0000-0003-000000000001','00000000-0000-0000-0003-000000000002',45)$$,
  'G5.4: platform_admin can INSERT into assessment_profile'
);

SELECT lives_ok(
  $$INSERT INTO diagnostic_rule (id, skill_id, condition, action) VALUES ('00000000-0000-0000-0003-000000000015','00000000-0000-0000-0003-000000000008','{"threshold":0.8}','classify_proficient')$$,
  'G5.5: platform_admin can INSERT into diagnostic_rule'
);

RESET ROLE;

-- =============================================================================
-- G6 — SELECT returns active rows to authenticated (5 assertions)
-- Uses seeded rows from setup (pinned UUIDs — G5 inserts don't affect count)
-- Role: authenticated + student JWT
-- =============================================================================

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000097","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0000-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM framework_config WHERE id = '00000000-0000-0000-0003-000000000001'),
  1,
  'G6.1: seeded framework_config visible to authenticated'
);

SELECT is(
  (SELECT COUNT(*)::int FROM blueprint WHERE id = '00000000-0000-0000-0003-000000000002'),
  1,
  'G6.2: seeded blueprint visible to authenticated'
);

SELECT is(
  (SELECT COUNT(*)::int FROM pathway WHERE id = '00000000-0000-0000-0003-000000000003'),
  1,
  'G6.3: active pathway visible to authenticated'
);

SELECT is(
  (SELECT COUNT(*)::int FROM assessment_profile WHERE id = '00000000-0000-0000-0003-000000000005'),
  1,
  'G6.4: active assessment_profile visible to authenticated'
);

SELECT is(
  (SELECT COUNT(*)::int FROM diagnostic_rule WHERE id = '00000000-0000-0000-0003-000000000009'),
  1,
  'G6.5: seeded diagnostic_rule visible to authenticated'
);

-- =============================================================================
-- G7 — is_active=false rows hidden from authenticated (2 assertions)
-- Verifies USING (is_active = true) SELECT filter on pathway + assessment_profile
-- =============================================================================

SELECT is(
  (SELECT COUNT(*)::int FROM pathway WHERE id = '00000000-0000-0000-0003-000000000004'),
  0,
  'G7.1: inactive pathway hidden from authenticated'
);

SELECT is(
  (SELECT COUNT(*)::int FROM assessment_profile WHERE id = '00000000-0000-0000-0003-000000000006'),
  0,
  'G7.2: inactive assessment_profile hidden from authenticated'
);

RESET ROLE;

-- =============================================================================
-- G8 — diagnostic_rule.action CHECK rejects invalid value (1 assertion)
-- Run as postgres (service_role) to isolate constraint check from RLS
-- =============================================================================

SELECT throws_like(
  $$INSERT INTO diagnostic_rule (skill_id, condition, action) VALUES ('00000000-0000-0000-0003-000000000008','{}','invalid_action')$$,
  '%violates check constraint%',
  'G8.1: diagnostic_rule.action CHECK rejects invalid value'
);

-- =============================================================================

SELECT * FROM finish();
ROLLBACK;
