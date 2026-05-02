-- =============================================================================
-- pgTAP Test: 004_sessions_events.sql
-- Stage 5 · 2026-05-02
-- plan(95)
-- Tests: RLS enabled (G1×7), key columns (G2×43), indexes (G3×6),
--        Pattern A non-student INSERT rejected (G4×1),
--        student INSERT succeeds (G5×1), student SELECT isolation (G6×2),
--        Pattern G deny api_idempotency_key (G7×1),
--        Pattern G deny outbox_event (G8×1),
--        Pattern G deny response_telemetry (G9×1),
--        parent SELECT child session (G10×1), teacher SELECT student session (G11×1),
--        org_admin SELECT all tenant sessions (G12×1),
--        session_response student SELECT isolation (G13×2),
--        learning_event student SELECT isolation (G14×2),
--        session_checkpoint student UPSERT (G15×2),
--        SECURITY DEFINER EXECUTE permission checks (G16×4),
--        helper output correctness (G16b×3),
--        atomic write + version increment (G17×2),
--        VERSION_CONFLICT on stale expected_version (G18×1),
--        session_response dedup rejected (G19×1),
--        checkpoint does NOT bump session_record.version (G20×1),
--        idx_session_one_active enforced (G21×1),
--        UTA user_profile per-role (G22×4), UTA parent_student_link (G23×2),
--        UTA class_group (G24×2), UTA class_student (G25×2)
--
-- New pgTAP pattern (ADR-0006 skeleton — optimistic lock VERSION_CONFLICT):
--   In-session sequential simulation:
--     Step 1: call create_session_response_atomic with p_expected_version=1 → lives_ok
--     Step 2: call with same p_expected_version=1 → throws_ok P0001 'VERSION_CONFLICT'
--   True cross-session concurrency belongs in Stage 26 load tests (DEV_PLAN.md).
--
-- Role strategy:
--   Setup, G1–G3, G16, G17–G21: run as postgres (service_role — RLS bypassed)
--   G4: SET ROLE authenticated + parent JWT → INSERT rejected
--   G5: SET ROLE authenticated + student_B JWT → INSERT succeeds
--   G6: SET ROLE authenticated + student_A JWT / student_B JWT → SELECT isolation
--   G7–G9: SET ROLE authenticated + student JWT → Pattern G deny checks
--   G10: SET ROLE authenticated + parent_A JWT → parent SELECT
--   G11: SET ROLE authenticated + teacher_A JWT → teacher SELECT
--   G12: SET ROLE authenticated + org_admin_A JWT → org_admin SELECT
--   G13–G15: SET ROLE authenticated + student_A/B JWT → SELECT/UPSERT checks
--   G16b: SET ROLE authenticated + various JWTs → helper output checks
--   G22–G25: SET ROLE authenticated + various JWTs → UTA checks
--
-- Test data UUIDs:
--   tenant_id:            00000000-0000-0000-0004-000000000001
--   student_A_id:         00000000-0000-0000-0004-000000000002
--   student_B_id:         00000000-0000-0000-0004-000000000003
--   parent_A_id:          00000000-0000-0000-0004-000000000004
--   teacher_A_id:         00000000-0000-0000-0004-000000000005
--   org_admin_A_id:       00000000-0000-0000-0004-000000000006
--   platform_admin_A_id:  00000000-0000-0000-0004-000000000007
--   class_group_id:       00000000-0000-0000-0004-000000000008
--   sgv_id:               00000000-0000-0000-0004-000000000009
--   skill_node_id:        00000000-0000-0000-0004-000000000010
--   item_id:              00000000-0000-0000-0004-000000000011
--   item_id_2:            00000000-0000-0000-0004-000000000012
--   fc_id:                00000000-0000-0000-0004-000000000013
--   blueprint_id:         00000000-0000-0000-0004-000000000014
--   ap_id:                00000000-0000-0000-0004-000000000015
--   repair_seq_id:        00000000-0000-0000-0004-000000000016
--   session_A_id:         00000000-0000-0000-0004-000000000017
--   session_B_id:         00000000-0000-0000-0004-000000000018
--   pathway_id:           00000000-0000-0000-0004-000000000019
--   response_1_id:        00000000-0000-0000-0004-000000000020
--   le_1_id:              00000000-0000-0000-0004-000000000021
-- =============================================================================

BEGIN;
SELECT plan(95);

-- =============================================================================
-- TEST SETUP — insert all prerequisite data as postgres (RLS bypassed)
-- =============================================================================

INSERT INTO tenant (id, name, slug, type)
VALUES ('00000000-0000-0000-0004-000000000001', 'Test Tenant 004', 'test-tenant-004', 'family');

INSERT INTO user_profile (id, tenant_id, role, display_name)
VALUES
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0004-000000000001', 'student',        'Student A'),
  ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0004-000000000001', 'student',        'Student B'),
  ('00000000-0000-0000-0004-000000000004', '00000000-0000-0000-0004-000000000001', 'parent',         'Parent A'),
  ('00000000-0000-0000-0004-000000000005', '00000000-0000-0000-0004-000000000001', 'teacher',        'Teacher A'),
  ('00000000-0000-0000-0004-000000000006', '00000000-0000-0000-0004-000000000001', 'org_admin',      'Org Admin A'),
  ('00000000-0000-0000-0004-000000000007', '00000000-0000-0000-0004-000000000001', 'platform_admin', 'Platform Admin A');

INSERT INTO parent_student_link (parent_id, student_id)
VALUES ('00000000-0000-0000-0004-000000000004', '00000000-0000-0000-0004-000000000002');

INSERT INTO class_group (id, tenant_id, teacher_id, name)
VALUES ('00000000-0000-0000-0004-000000000008', '00000000-0000-0000-0004-000000000001',
        '00000000-0000-0000-0004-000000000005', 'Test Class 004');

INSERT INTO class_student (class_id, student_id)
VALUES ('00000000-0000-0000-0004-000000000008', '00000000-0000-0000-0004-000000000002');

INSERT INTO skill_graph_version (id, version, status)
VALUES ('00000000-0000-0000-0004-000000000009', 4001, 'draft');

INSERT INTO skill_node (id, graph_version_id, level, name, slug)
VALUES ('00000000-0000-0000-0004-000000000010',
        '00000000-0000-0000-0004-000000000009',
        'skill', 'Fractions', 'fractions-s5test');

INSERT INTO item (id, response_type, skill_ids, difficulty, year_levels, exam_families)
VALUES
  ('00000000-0000-0000-0004-000000000011', 'mcq',
   ARRAY['00000000-0000-0000-0004-000000000010'::uuid],
   0.5, ARRAY[5], ARRAY['naplan'::exam_family]),
  ('00000000-0000-0000-0004-000000000012', 'mcq',
   ARRAY['00000000-0000-0000-0004-000000000010'::uuid],
   0.6, ARRAY[5], ARRAY['naplan'::exam_family]);

INSERT INTO framework_config (id, exam_family, version, structure, scoring_rules, constraints, difficulty_bands, blueprint)
VALUES ('00000000-0000-0000-0004-000000000013', 'naplan', 'v_s5_test',
        '{}', '{}', '{}', '{}', '{}');

INSERT INTO blueprint (id, sections)
VALUES ('00000000-0000-0000-0004-000000000014', '{}');

INSERT INTO assessment_profile (id, exam_family, program, year_level, version,
  framework_config_id, blueprint_id, duration_minutes)
VALUES ('00000000-0000-0000-0004-000000000015', 'naplan', 'numeracy', 5, 'v_s5_test',
        '00000000-0000-0000-0004-000000000013',
        '00000000-0000-0000-0004-000000000014', 45);

INSERT INTO repair_sequence (id, target_type, target_id, display_name, stages, year_levels)
VALUES ('00000000-0000-0000-0004-000000000016', 'misconception',
        '00000000-0000-0000-0004-000000000010', 'Test Repair 004', '[]', ARRAY[5]);

INSERT INTO pathway (id, slug, display_name, exam_family, program, framework_config_id,
  engine_type, year_levels, required_feature_key)
VALUES ('00000000-0000-0000-0004-000000000019', 'naplan-numeracy-y5-s5test',
        'NAPLAN Numeracy Y5 S5', 'naplan', 'numeracy',
        '00000000-0000-0000-0004-000000000013',
        'adaptive', ARRAY[5], 'pathway.feature.naplan.numeracy_y5');

-- session_A: student_A, active, version=1 (used by G17/G18/G6/G10/G11/G12/G20)
INSERT INTO session_record (id, student_id, tenant_id, pathway_id, assessment_profile_id,
  repair_sequence_id, engine_type, mode, status, version, item_count, engine_state_snapshot,
  skills_touched, pipeline_status)
VALUES ('00000000-0000-0000-0004-000000000017',
        '00000000-0000-0000-0004-000000000002',
        '00000000-0000-0000-0004-000000000001',
        '00000000-0000-0000-0004-000000000019',
        '00000000-0000-0000-0004-000000000015',
        '00000000-0000-0000-0004-000000000016',
        'adaptive', 'exam', 'active', 1, 10, '{}', '{}', 'pending');

-- session_B: student_B, submitted (no active session — student_B can INSERT in G5)
INSERT INTO session_record (id, student_id, tenant_id, engine_type, mode, status,
  version, item_count, items_answered, engine_state_snapshot, skills_touched, pipeline_status)
VALUES ('00000000-0000-0000-0004-000000000018',
        '00000000-0000-0000-0004-000000000003',
        '00000000-0000-0000-0004-000000000001',
        'adaptive', 'exam', 'submitted', 3, 10, 10, '{}', '{}', 'pending');

-- Pre-insert session_response (item_id_2, seq=1) for G13 isolation tests
-- Uses item_id_2 to avoid conflict with G17 atomic write (which uses item_id, seq=1)
INSERT INTO session_response (id, session_id, item_id, student_id, tenant_id,
  sequence_number, response_data, is_correct, score, difficulty_at_response)
VALUES ('00000000-0000-0000-0004-000000000020',
        '00000000-0000-0000-0004-000000000017',
        '00000000-0000-0000-0004-000000000012',
        '00000000-0000-0000-0004-000000000002',
        '00000000-0000-0000-0004-000000000001',
        1, '{"answer":2}', true, 1.0, 0.6);

-- Pre-insert learning_event for G14 isolation tests (uses item_id_2, seq=1)
INSERT INTO learning_event (id, student_id, tenant_id, session_id, item_id, skill_id,
  event_type, correctness, score, duration_ms, difficulty_at_event, metadata, sequence_number)
VALUES ('00000000-0000-0000-0004-000000000021',
        '00000000-0000-0000-0004-000000000002',
        '00000000-0000-0000-0004-000000000001',
        '00000000-0000-0000-0004-000000000017',
        '00000000-0000-0000-0004-000000000012',
        '00000000-0000-0000-0004-000000000010',
        'answer', true, 1.0, 4500, 0.6, '{}', 1);

-- =============================================================================
-- G1 — RLS enabled on all 7 Stage 5 tables (7 assertions)
-- =============================================================================

SELECT is(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'session_record'),
  true, 'G1.1: RLS enabled on session_record');
SELECT is(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'session_response'),
  true, 'G1.2: RLS enabled on session_response');
SELECT is(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'response_telemetry'),
  true, 'G1.3: RLS enabled on response_telemetry');
SELECT is(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'session_checkpoint'),
  true, 'G1.4: RLS enabled on session_checkpoint');
SELECT is(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'learning_event'),
  true, 'G1.5: RLS enabled on learning_event');
SELECT is(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_idempotency_key'),
  true, 'G1.6: RLS enabled on api_idempotency_key');
SELECT is(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'outbox_event'),
  true, 'G1.7: RLS enabled on outbox_event');

-- =============================================================================
-- G2 — Key columns (43 assertions)
-- =============================================================================

-- session_record (11)
SELECT has_column('public', 'session_record', 'id',                    'G2.sr.1: session_record.id');
SELECT has_column('public', 'session_record', 'student_id',            'G2.sr.2: session_record.student_id');
SELECT has_column('public', 'session_record', 'tenant_id',             'G2.sr.3: session_record.tenant_id');
SELECT has_column('public', 'session_record', 'version',               'G2.sr.4: session_record.version');
SELECT has_column('public', 'session_record', 'status',                'G2.sr.5: session_record.status');
SELECT has_column('public', 'session_record', 'engine_type',           'G2.sr.6: session_record.engine_type');
SELECT has_column('public', 'session_record', 'mode',                  'G2.sr.7: session_record.mode');
SELECT has_column('public', 'session_record', 'items_answered',        'G2.sr.8: session_record.items_answered');
SELECT has_column('public', 'session_record', 'pipeline_status',       'G2.sr.9: session_record.pipeline_status');
SELECT has_column('public', 'session_record', 'engine_state_snapshot', 'G2.sr.10: session_record.engine_state_snapshot');
SELECT has_column('public', 'session_record', 'skills_touched',        'G2.sr.11: session_record.skills_touched');

-- session_response (7)
SELECT has_column('public', 'session_response', 'id',              'G2.sresp.1: session_response.id');
SELECT has_column('public', 'session_response', 'session_id',      'G2.sresp.2: session_response.session_id');
SELECT has_column('public', 'session_response', 'item_id',         'G2.sresp.3: session_response.item_id');
SELECT has_column('public', 'session_response', 'student_id',      'G2.sresp.4: session_response.student_id');
SELECT has_column('public', 'session_response', 'tenant_id',       'G2.sresp.5: session_response.tenant_id');
SELECT has_column('public', 'session_response', 'sequence_number', 'G2.sresp.6: session_response.sequence_number');
SELECT has_column('public', 'session_response', 'response_data',   'G2.sresp.7: session_response.response_data');

-- response_telemetry (4)
SELECT has_column('public', 'response_telemetry', 'response_id',           'G2.rt.1: response_telemetry.response_id');
SELECT has_column('public', 'response_telemetry', 'time_to_answer_ms',     'G2.rt.2: response_telemetry.time_to_answer_ms');
SELECT has_column('public', 'response_telemetry', 'time_to_first_action_ms', 'G2.rt.3: response_telemetry.time_to_first_action_ms');
SELECT has_column('public', 'response_telemetry', 'answer_changes',        'G2.rt.4: response_telemetry.answer_changes');

-- session_checkpoint (4)
SELECT has_column('public', 'session_checkpoint', 'session_id',        'G2.sc.1: session_checkpoint.session_id');
SELECT has_column('public', 'session_checkpoint', 'checkpoint_number', 'G2.sc.2: session_checkpoint.checkpoint_number');
SELECT has_column('public', 'session_checkpoint', 'answers',           'G2.sc.3: session_checkpoint.answers');
SELECT has_column('public', 'session_checkpoint', 'telemetry_buffer',  'G2.sc.4: session_checkpoint.telemetry_buffer');

-- learning_event (7)
SELECT has_column('public', 'learning_event', 'id',              'G2.le.1: learning_event.id');
SELECT has_column('public', 'learning_event', 'student_id',      'G2.le.2: learning_event.student_id');
SELECT has_column('public', 'learning_event', 'tenant_id',       'G2.le.3: learning_event.tenant_id');
SELECT has_column('public', 'learning_event', 'session_id',      'G2.le.4: learning_event.session_id');
SELECT has_column('public', 'learning_event', 'item_id',         'G2.le.5: learning_event.item_id');
SELECT has_column('public', 'learning_event', 'event_type',      'G2.le.6: learning_event.event_type');
SELECT has_column('public', 'learning_event', 'sequence_number', 'G2.le.7: learning_event.sequence_number');

-- api_idempotency_key (5)
SELECT has_column('public', 'api_idempotency_key', 'idempotency_key', 'G2.aik.1: api_idempotency_key.idempotency_key');
SELECT has_column('public', 'api_idempotency_key', 'tenant_id',       'G2.aik.2: api_idempotency_key.tenant_id');
SELECT has_column('public', 'api_idempotency_key', 'endpoint',        'G2.aik.3: api_idempotency_key.endpoint');
SELECT has_column('public', 'api_idempotency_key', 'status',          'G2.aik.4: api_idempotency_key.status');
SELECT has_column('public', 'api_idempotency_key', 'response_body',   'G2.aik.5: api_idempotency_key.response_body');

-- outbox_event (5)
SELECT has_column('public', 'outbox_event', 'id',             'G2.oe.1: outbox_event.id');
SELECT has_column('public', 'outbox_event', 'aggregate_type', 'G2.oe.2: outbox_event.aggregate_type');
SELECT has_column('public', 'outbox_event', 'aggregate_id',   'G2.oe.3: outbox_event.aggregate_id');
SELECT has_column('public', 'outbox_event', 'event_type',     'G2.oe.4: outbox_event.event_type');
SELECT has_column('public', 'outbox_event', 'payload',        'G2.oe.5: outbox_event.payload');

-- =============================================================================
-- G3 — Critical indexes (6 assertions)
-- =============================================================================

SELECT index_is_unique('public', 'session_record',   'idx_session_one_active',
  'G3.1: idx_session_one_active is unique partial index');
SELECT has_index('public', 'session_record',   'idx_session_active',
  'G3.2: idx_session_active exists (partial index for active sessions)');
SELECT index_is_unique('public', 'session_response',  'idx_response_dedup',
  'G3.3: idx_response_dedup is unique');
SELECT index_is_unique('public', 'learning_event',    'idx_le_dedup',
  'G3.4: idx_le_dedup is unique');
SELECT has_index('public', 'outbox_event',           'idx_outbox_unprocessed',
  'G3.5: idx_outbox_unprocessed exists');
SELECT has_index('public', 'api_idempotency_key',    'idx_idem_cleanup',
  'G3.6: idx_idem_cleanup exists');

-- =============================================================================
-- G4 — Pattern A: parent INSERT session_record rejected (1 assertion)
-- =============================================================================

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000004","app_metadata":{"role":"parent","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT throws_like(
  $$INSERT INTO session_record (student_id, tenant_id, engine_type, mode, status,
      engine_state_snapshot, skills_touched, pipeline_status, item_count)
    VALUES ('00000000-0000-0000-0004-000000000002',
            '00000000-0000-0000-0004-000000000001',
            'adaptive', 'exam', 'created', '{}', '{}', 'pending', 0)$$,
  '%row-level security%',
  'G4.1: parent cannot INSERT session_record (no insert policy for parent role)'
);

RESET ROLE;

-- =============================================================================
-- G5 — Student INSERT session_record succeeds (1 assertion)
-- student_B has status=submitted session — can INSERT a new one (no active conflict)
-- =============================================================================

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000003","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT lives_ok(
  $$INSERT INTO session_record (student_id, tenant_id, engine_type, mode, status,
      engine_state_snapshot, skills_touched, pipeline_status, item_count)
    VALUES ('00000000-0000-0000-0004-000000000003',
            '00000000-0000-0000-0004-000000000001',
            'adaptive', 'exam', 'created', '{}', '{}', 'pending', 0)$$,
  'G5.1: student_B can INSERT new session_record for themselves'
);

RESET ROLE;

-- =============================================================================
-- G6 — Student SELECT isolation (2 assertions)
-- =============================================================================

-- student_A sees own session_A
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000002","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM session_record
   WHERE id = '00000000-0000-0000-0004-000000000017'),
  1,
  'G6.1: student_A sees own session_A'
);

RESET ROLE;

-- student_B sees count=0 for student_A's session_A
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000003","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM session_record
   WHERE id = '00000000-0000-0000-0004-000000000017'),
  0,
  'G6.2: student_B cannot see student_A''s session_A'
);

RESET ROLE;

-- =============================================================================
-- G7 — Pattern G: api_idempotency_key INSERT rejected (1 assertion)
-- =============================================================================

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000002","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT throws_like(
  $$INSERT INTO api_idempotency_key (idempotency_key, tenant_id, endpoint, request_hash)
    VALUES ('test-key-g7', '00000000-0000-0000-0004-000000000001', '/sessions', 'abc')$$,
  '%row-level security%',
  'G7.1: authenticated INSERT api_idempotency_key rejected (Pattern G deny-all)'
);

RESET ROLE;

-- =============================================================================
-- G8 — Pattern G: outbox_event INSERT rejected (1 assertion)
-- =============================================================================

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000002","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT throws_like(
  $$INSERT INTO outbox_event (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('session_record', '00000000-0000-0000-0004-000000000017', 'session.submitted', '{}')$$,
  '%row-level security%',
  'G8.1: authenticated INSERT outbox_event rejected (Pattern G deny-all)'
);

RESET ROLE;

-- =============================================================================
-- G9 — Pattern G: response_telemetry INSERT rejected (1 assertion)
-- =============================================================================

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000002","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT throws_like(
  $$INSERT INTO response_telemetry (response_id, time_to_answer_ms, time_to_first_action_ms,
      answer_changes, items_since_session_start, time_since_session_start_ms)
    VALUES ('00000000-0000-0000-0004-000000000020', 5000, 1000, 0, 1, 5000)$$,
  '%row-level security%',
  'G9.1: authenticated INSERT response_telemetry rejected (Pattern G deny-all)'
);

RESET ROLE;

-- =============================================================================
-- G10 — Parent SELECT child session via fn_my_child_ids (1 assertion)
-- =============================================================================

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000004","app_metadata":{"role":"parent","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM session_record
   WHERE id = '00000000-0000-0000-0004-000000000017'),
  1,
  'G10.1: parent_A sees child student_A''s session via fn_my_child_ids'
);

RESET ROLE;

-- =============================================================================
-- G11 — Teacher SELECT student session via fn_teacher_student_ids (1 assertion)
-- =============================================================================

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000005","app_metadata":{"role":"teacher","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM session_record
   WHERE id = '00000000-0000-0000-0004-000000000017'),
  1,
  'G11.1: teacher_A sees student_A''s session via fn_teacher_student_ids'
);

RESET ROLE;

-- =============================================================================
-- G12 — Org_admin sees own tenant session by ID (1 assertion)
-- =============================================================================

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000006","app_metadata":{"role":"org_admin","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM session_record
   WHERE id = '00000000-0000-0000-0004-000000000017'),
  1,
  'G12.1: org_admin sees session_A in their tenant'
);

RESET ROLE;

-- =============================================================================
-- G13 — session_response student SELECT isolation (2 assertions)
-- =============================================================================

-- student_A sees own session_response (response_1 pre-inserted in setup)
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000002","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM session_response
   WHERE id = '00000000-0000-0000-0004-000000000020'),
  1,
  'G13.1: student_A sees own session_response'
);

RESET ROLE;

-- student_B sees count=0 for student_A's session_response
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000003","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM session_response
   WHERE id = '00000000-0000-0000-0004-000000000020'),
  0,
  'G13.2: student_B cannot see student_A''s session_response'
);

RESET ROLE;

-- =============================================================================
-- G14 — learning_event student SELECT isolation (2 assertions)
-- =============================================================================

-- student_A sees own learning_event (le_1 pre-inserted in setup)
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000002","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM learning_event
   WHERE id = '00000000-0000-0000-0004-000000000021'),
  1,
  'G14.1: student_A sees own learning_event'
);

RESET ROLE;

-- student_B sees count=0 for student_A's learning_event
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000003","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM learning_event
   WHERE id = '00000000-0000-0000-0004-000000000021'),
  0,
  'G14.2: student_B cannot see student_A''s learning_event'
);

RESET ROLE;

-- =============================================================================
-- G15 — session_checkpoint student UPSERT + SELECT (2 assertions)
-- =============================================================================

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000002","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT lives_ok(
  $$INSERT INTO session_checkpoint (session_id, checkpoint_number, answers)
    VALUES ('00000000-0000-0000-0004-000000000017', 1, '[{"q":1,"a":3}]')
    ON CONFLICT (session_id) DO UPDATE
      SET checkpoint_number = EXCLUDED.checkpoint_number,
          answers           = EXCLUDED.answers,
          server_timestamp  = now()$$,
  'G15.1: student_A can UPSERT session_checkpoint for own session'
);

SELECT is(
  (SELECT COUNT(*)::int FROM session_checkpoint
   WHERE session_id = '00000000-0000-0000-0004-000000000017'),
  1,
  'G15.2: student_A can SELECT own session_checkpoint via fn_my_session_ids'
);

RESET ROLE;

-- =============================================================================
-- G16 — SECURITY DEFINER: anon cannot EXECUTE helpers or atomic function (4 assertions)
-- =============================================================================

SELECT is(
  has_function_privilege('anon', 'public.fn_my_child_ids()', 'execute'),
  false,
  'G16.1: fn_my_child_ids REVOKE FROM PUBLIC — anon cannot execute'
);

SELECT is(
  has_function_privilege('anon', 'public.fn_teacher_student_ids()', 'execute'),
  false,
  'G16.2: fn_teacher_student_ids REVOKE FROM PUBLIC — anon cannot execute'
);

SELECT is(
  has_function_privilege('anon', 'public.fn_my_session_ids()', 'execute'),
  false,
  'G16.3: fn_my_session_ids REVOKE FROM PUBLIC — anon cannot execute'
);

SELECT is(
  has_function_privilege('anon',
    'public.create_session_response_atomic(uuid, integer, uuid, jsonb, boolean, real, real, jsonb, real, integer)',
    'execute'),
  false,
  'G16.4: create_session_response_atomic REVOKE FROM PUBLIC — anon cannot execute'
);

-- =============================================================================
-- G16b — Helper output correctness (3 assertions)
-- =============================================================================

-- G16b.1: fn_my_child_ids returns parent_A's linked student_A
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000004","app_metadata":{"role":"parent","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  fn_my_child_ids() @> ARRAY['00000000-0000-0000-0004-000000000002'::uuid],
  true,
  'G16b.1: fn_my_child_ids returns student_A as child of parent_A'
);

RESET ROLE;

-- G16b.2: fn_teacher_student_ids returns teacher_A's class member student_A
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000005","app_metadata":{"role":"teacher","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  fn_teacher_student_ids() @> ARRAY['00000000-0000-0000-0004-000000000002'::uuid],
  true,
  'G16b.2: fn_teacher_student_ids returns student_A as class member of teacher_A'
);

RESET ROLE;

-- G16b.3: fn_my_session_ids returns student_A's own session_A
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000002","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  fn_my_session_ids() @> ARRAY['00000000-0000-0000-0004-000000000017'::uuid],
  true,
  'G16b.3: fn_my_session_ids returns session_A for student_A'
);

RESET ROLE;

-- =============================================================================
-- G17 — create_session_response_atomic: atomic 4-write + version increment (2 assertions)
-- Run as postgres (service_role); GRANT TO authenticated tested by G16.
-- session_A: version=1 before; version=2 after.
-- =============================================================================

SELECT lives_ok(
  $$SELECT * FROM create_session_response_atomic(
      '00000000-0000-0000-0004-000000000017'::uuid,
      1,
      '00000000-0000-0000-0004-000000000011'::uuid,
      '{"answer":1}'::jsonb,
      true,
      1.0::real,
      0.5::real,
      '{"time_to_answer_ms":5000,"time_to_first_action_ms":1000,
        "items_since_session_start":1,"time_since_session_start_ms":5000}'::jsonb,
      0.25::real,
      0
    )$$,
  'G17.1: create_session_response_atomic with expected_version=1 succeeds'
);

SELECT is(
  (SELECT version FROM session_record WHERE id = '00000000-0000-0000-0004-000000000017'),
  2,
  'G17.2: session_record.version incremented to 2 after atomic write'
);

-- =============================================================================
-- G18 — VERSION_CONFLICT on stale expected_version (1 assertion)
-- version is now 2; second call with expected_version=1 must raise P0001
-- =============================================================================

SELECT throws_ok(
  $$SELECT * FROM create_session_response_atomic(
      '00000000-0000-0000-0004-000000000017'::uuid,
      1,
      '00000000-0000-0000-0004-000000000011'::uuid,
      '{"answer":2}'::jsonb,
      false,
      0.0::real,
      0.5::real,
      '{"time_to_answer_ms":3000,"time_to_first_action_ms":800,
        "items_since_session_start":2,"time_since_session_start_ms":8000}'::jsonb,
      0.25::real,
      0
    )$$,
  'P0001',
  'VERSION_CONFLICT',
  'G18.1: stale expected_version=1 raises VERSION_CONFLICT (ERRCODE P0001)'
);

-- =============================================================================
-- G19 — session_response dedup rejected (1 assertion)
-- G17 wrote (session_A, item_id, seq=1). Duplicate INSERT must fail idx_response_dedup.
-- =============================================================================

SELECT throws_like(
  $$INSERT INTO session_response (session_id, item_id, student_id, tenant_id,
      sequence_number, response_data, is_correct, score, difficulty_at_response)
    VALUES ('00000000-0000-0000-0004-000000000017',
            '00000000-0000-0000-0004-000000000011',
            '00000000-0000-0000-0004-000000000002',
            '00000000-0000-0000-0004-000000000001',
            1, '{"answer":3}', false, 0.0, 0.5)$$,
  '%duplicate key%',
  'G19.1: duplicate (session_id, item_id, seq_num) rejected by idx_response_dedup'
);

-- =============================================================================
-- G20 — session_checkpoint UPSERT does NOT bump session_record.version (1 assertion)
-- G15 already wrote a checkpoint for session_A; G17 set version=2.
-- Verify version is still 2 (checkpoint must not touch version).
-- =============================================================================

SELECT is(
  (SELECT version FROM session_record WHERE id = '00000000-0000-0000-0004-000000000017'),
  2,
  'G20.1: session_record.version unchanged after session_checkpoint UPSERT (C3 invariant)'
);

-- =============================================================================
-- G21 — idx_session_one_active: second active session for student_A rejected (1 assertion)
-- student_A already has session_A (status=active). Direct INSERT as postgres to test constraint.
-- =============================================================================

SELECT throws_like(
  $$INSERT INTO session_record (student_id, tenant_id, engine_type, mode, status,
      engine_state_snapshot, skills_touched, pipeline_status, item_count)
    VALUES ('00000000-0000-0000-0004-000000000002',
            '00000000-0000-0000-0004-000000000001',
            'adaptive', 'exam', 'active', '{}', '{}', 'pending', 0)$$,
  '%duplicate key%',
  'G21.1: idx_session_one_active rejects second active session for student_A'
);

-- =============================================================================
-- G22 — UTA user_profile per-role (4 assertions)
-- =============================================================================

-- student_A sees own profile (count=1)
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000002","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM user_profile
   WHERE id = '00000000-0000-0000-0004-000000000002'),
  1,
  'G22.1: student_A sees own user_profile (up_student_self)'
);

-- student_A sees count=0 for student_B's profile
SELECT is(
  (SELECT COUNT(*)::int FROM user_profile
   WHERE id = '00000000-0000-0000-0004-000000000003'),
  0,
  'G22.2: student_A cannot see student_B''s user_profile'
);

RESET ROLE;

-- parent_A sees child student_A's profile
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000004","app_metadata":{"role":"parent","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM user_profile
   WHERE id = '00000000-0000-0000-0004-000000000002'),
  1,
  'G22.3: parent_A sees student_A''s profile via fn_my_child_ids (up_parent_select)'
);

RESET ROLE;

-- teacher_A sees class student student_A's profile
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000005","app_metadata":{"role":"teacher","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM user_profile
   WHERE id = '00000000-0000-0000-0004-000000000002'),
  1,
  'G22.4: teacher_A sees student_A''s profile via fn_teacher_student_ids (up_teacher_select)'
);

RESET ROLE;

-- =============================================================================
-- G23 — UTA parent_student_link per-role (2 assertions)
-- =============================================================================

-- parent_A sees own link (count=1)
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000004","app_metadata":{"role":"parent","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM parent_student_link WHERE parent_id = '00000000-0000-0000-0004-000000000004'),
  1,
  'G23.1: parent_A sees own parent_student_link (psl_parent_select)'
);

RESET ROLE;

-- student_A (no parent role) sees count=0 for parent_student_link rows
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000002","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM parent_student_link),
  0,
  'G23.2: student_A sees count=0 for parent_student_link (no student policy)'
);

RESET ROLE;

-- =============================================================================
-- G24 — UTA class_group per-role (2 assertions)
-- =============================================================================

-- teacher_A sees own class_group
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000005","app_metadata":{"role":"teacher","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM class_group
   WHERE id = '00000000-0000-0000-0004-000000000008'),
  1,
  'G24.1: teacher_A sees own class_group (cg_teacher_select)'
);

RESET ROLE;

-- student_A sees count=0 for class_group (no student policy)
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000002","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM class_group),
  0,
  'G24.2: student_A sees count=0 for class_group (no student policy)'
);

RESET ROLE;

-- =============================================================================
-- G25 — UTA class_student per-role (2 assertions)
-- =============================================================================

-- teacher_A sees own class's students
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000005","app_metadata":{"role":"teacher","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM class_student
   WHERE student_id = '00000000-0000-0000-0004-000000000002'),
  1,
  'G25.1: teacher_A sees student_A in class_student via fn_teacher_student_ids (cs_teacher_select)'
);

RESET ROLE;

-- student_A sees count=0 for class_student (no student policy)
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0004-000000000002","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0004-000000000001"}}',
  true);
SET ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::int FROM class_student),
  0,
  'G25.2: student_A sees count=0 for class_student (no student policy)'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
