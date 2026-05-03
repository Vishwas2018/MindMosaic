-- =============================================================================
-- pgTAP Test: 007_new_domains.sql
-- Stage 8 · 2026-05-03
-- plan(72)
--
-- Groups:
--   G_fn  fn_my_assignment_ids  P3 shape (5) + behavioral output (1)       =  6
--   G1    assignment            Pattern A (student/staff/padmin/INSERT/iso)  =  6
--   G2    assignment_target     Pattern G (RLS+auth0row+anon0row)            =  3
--   G3    assignment_session    Pattern A (student/staff/iso/INSERT)         =  5
--   G4    subscription          Pattern G                                    =  3
--   G5    billing_customer      Pattern G                                    =  3
--   G6    invoice               Pattern G                                    =  3
--   G7    billing_event         Pattern G                                    =  3
--   G8    engagement_streak     Pattern G                                    =  3
--   G9    achievement_definition Pattern G                                   =  3
--   G10   student_achievement   Pattern G                                    =  3
--   G11   notification          FOR ALL USING+WITH CHECK (A3: cross-user)   =  7
--   G_struct FK catalog + sub unique×2 + XOR×2                              =  5
--   G_idx    11 index existence checks (ADR-0014, pg_indexes catalog)        = 11
--   G_meta   pg_policies=0 for 8 Pattern G tables                           =  8
--                                                                    TOTAL  = 72
-- Cumulative: 334 (prior) + 72 = 406
--
-- Triple REVOKE A1 correction: G_fn tests PUBLIC + authenticated + anon
--   (not PUBLIC×2 as in 0004). BUILD_CONTRACT §6 updated Stage 8.
--
-- Pattern G anon tests: safe to use SET ROLE anon + SELECT COUNT(*) because
--   these tables have zero policies — no SECURITY DEFINER helpers evaluated.
--
-- Test data UUIDs (00000000-0000-0000-0008-XXXXXXXXXXXX):
--   tenant A:       00000000-0000-0000-0008-000000000099
--   tenant B:       00000000-0000-0000-0008-000000000098
--   student A:      00000000-0000-0000-0008-000000000001  (tenant A)
--   teacher A:      00000000-0000-0000-0008-000000000002  (tenant A)
--   teacher B:      00000000-0000-0000-0008-000000000003  (tenant B)
--   assignment A:   00000000-0000-0000-0008-000000000010  (tenant A)
--   class A:        00000000-0000-0000-0008-000000000020  (tenant A)
--   notification A: 00000000-0000-0000-0008-000000000030  (user = student A)
--   notification B: 00000000-0000-0000-0008-000000000031  (user = teacher A)
-- =============================================================================

BEGIN;

SELECT plan(72);

-- =============================================================================
-- TEST DATA SETUP (run as postgres — RLS bypassed)
-- =============================================================================

INSERT INTO tenant (id, name, slug, type, region) VALUES
  ('00000000-0000-0000-0008-000000000099', 'Stage8 Tenant A', 'stage8-a', 'family', 'au-syd'),
  ('00000000-0000-0000-0008-000000000098', 'Stage8 Tenant B', 'stage8-b', 'family', 'au-syd');

INSERT INTO user_profile (id, tenant_id, role, display_name) VALUES
  ('00000000-0000-0000-0008-000000000001', '00000000-0000-0000-0008-000000000099', 'student', 'S8 Student'),
  ('00000000-0000-0000-0008-000000000002', '00000000-0000-0000-0008-000000000099', 'teacher', 'S8 Teacher'),
  ('00000000-0000-0000-0008-000000000003', '00000000-0000-0000-0008-000000000098', 'teacher', 'S8 Teacher B');

INSERT INTO class_group (id, tenant_id, teacher_id, name) VALUES
  ('00000000-0000-0000-0008-000000000020', '00000000-0000-0000-0008-000000000099',
   '00000000-0000-0000-0008-000000000002', 'Stage8 Class');

INSERT INTO assignment (id, tenant_id, created_by, title, mode, target_skill_ids, item_count, status)
VALUES (
  '00000000-0000-0000-0008-000000000010',
  '00000000-0000-0000-0008-000000000099',
  '00000000-0000-0000-0008-000000000002',
  'Stage8 Assignment', 'practice',
  ARRAY[gen_random_uuid()], 5, 'published'
);

INSERT INTO assignment_target (assignment_id, student_id)
VALUES ('00000000-0000-0000-0008-000000000010', '00000000-0000-0000-0008-000000000001');

INSERT INTO assignment_session (assignment_id, student_id, tenant_id, status)
VALUES (
  '00000000-0000-0000-0008-000000000010',
  '00000000-0000-0000-0008-000000000001',
  '00000000-0000-0000-0008-000000000099',
  'pending'
);

INSERT INTO subscription (tenant_id, tier, is_active, stripe_subscription_id)
VALUES ('00000000-0000-0000-0008-000000000099', 'free', true, 'sub_stage8_test001');

INSERT INTO notification (id, user_id, tenant_id, type, title, body) VALUES
  ('00000000-0000-0000-0008-000000000030',
   '00000000-0000-0000-0008-000000000001',
   '00000000-0000-0000-0008-000000000099',
   'system', 'Test Notif A', 'body A'),
  ('00000000-0000-0000-0008-000000000031',
   '00000000-0000-0000-0008-000000000002',
   '00000000-0000-0000-0008-000000000099',
   'system', 'Test Notif B', 'body B');

-- =============================================================================
-- G_fn — fn_my_assignment_ids (P3 shape × 5 + output × 1 = 6 tests)
-- =============================================================================

-- G_fn.1: function exists
SELECT has_function(
  'public', 'fn_my_assignment_ids', ARRAY[]::text[],
  'G_fn.1: fn_my_assignment_ids exists');

-- G_fn.2: SECURITY DEFINER
SELECT is(
  (SELECT prosecdef FROM pg_proc
   WHERE proname = 'fn_my_assignment_ids'
     AND pronamespace = 'public'::regnamespace),
  true,
  'G_fn.2: fn_my_assignment_ids is SECURITY DEFINER');

-- G_fn.3: STABLE volatility
SELECT is(
  (SELECT provolatile FROM pg_proc
   WHERE proname = 'fn_my_assignment_ids'
     AND pronamespace = 'public'::regnamespace),
  's',
  'G_fn.3: fn_my_assignment_ids volatility is STABLE');

-- G_fn.4: PUBLIC cannot execute
SELECT is(
  has_function_privilege('public', 'public.fn_my_assignment_ids()', 'execute'),
  false,
  'G_fn.4: fn_my_assignment_ids REVOKE FROM PUBLIC — public cannot execute');

-- G_fn.5: anon cannot execute (A1 correction — explicit REVOKE FROM anon)
SELECT is(
  has_function_privilege('anon', 'public.fn_my_assignment_ids()', 'execute'),
  false,
  'G_fn.5: fn_my_assignment_ids REVOKE FROM anon — anon cannot execute');

-- G_fn.6: behavioral output — student sees their targeted assignment
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is(
  fn_my_assignment_ids() @> ARRAY['00000000-0000-0000-0008-000000000010'::uuid],
  true,
  'G_fn.6: fn_my_assignment_ids returns assignment targeted at student');
RESET ROLE;

-- =============================================================================
-- G1 — assignment (Pattern A, 6 tests)
-- =============================================================================

-- G1.1: RLS enabled
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'assignment')::bool,
  true,
  'G1.1: assignment RLS enabled');

-- G1.2: student sees own assignment (via fn_my_assignment_ids)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is(
  (SELECT count(*)::int FROM assignment),
  1,
  'G1.2: student sees assignment targeted at them');
RESET ROLE;

-- G1.3: teacher sees all assignments in their tenant
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000002","app_metadata":{"role":"teacher","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is(
  (SELECT count(*)::int FROM assignment),
  1,
  'G1.3: teacher sees assignments in their tenant');
RESET ROLE;

-- G1.4: cross-tenant isolation — teacher B (tenant B) sees 0 rows
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000003","app_metadata":{"role":"teacher","tenant_id":"00000000-0000-0000-0008-000000000098"}}',
  true);
SELECT is(
  (SELECT count(*)::int FROM assignment),
  0,
  'G1.4: cross-tenant teacher sees 0 assignments (tenant isolation)');
RESET ROLE;

-- G1.5: INSERT denied by RLS (no INSERT policy on assignment)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000002","app_metadata":{"role":"teacher","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT throws_like(
  $$INSERT INTO assignment (tenant_id, created_by, title, mode, target_skill_ids, item_count)
    VALUES (
      '00000000-0000-0000-0008-000000000099',
      '00000000-0000-0000-0008-000000000002',
      'RLS Test', 'practice',
      ARRAY[gen_random_uuid()], 5
    )$$,
  '%row-level security%',
  'G1.5: authenticated INSERT on assignment denied by RLS');
RESET ROLE;

-- G1.6: platform_admin sees all assignments
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000002","app_metadata":{"role":"platform_admin","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is(
  (SELECT count(*)::int FROM assignment),
  1,
  'G1.6: platform_admin sees all assignments');
RESET ROLE;

-- =============================================================================
-- G2 — assignment_target (Pattern G, 3 tests)
-- =============================================================================

-- G2.1: RLS enabled
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'assignment_target')::bool,
  true,
  'G2.1: assignment_target RLS enabled');

-- G2.2: authenticated sees 0 rows (Pattern G — no policies)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is(
  (SELECT count(*)::int FROM assignment_target),
  0,
  'G2.2: authenticated sees 0 rows on assignment_target (Pattern G)');
RESET ROLE;

-- G2.3: anon sees 0 rows (safe — no helper-calling policies)
SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM assignment_target),
  0,
  'G2.3: anon sees 0 rows on assignment_target (Pattern G)');
RESET ROLE;

-- =============================================================================
-- G3 — assignment_session (Pattern A, 5 tests)
-- =============================================================================

-- G3.1: RLS enabled
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'assignment_session')::bool,
  true,
  'G3.1: assignment_session RLS enabled');

-- G3.2: student sees own session
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is(
  (SELECT count(*)::int FROM assignment_session),
  1,
  'G3.2: student sees own assignment_session row');
RESET ROLE;

-- G3.3: teacher sees tenant sessions
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000002","app_metadata":{"role":"teacher","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is(
  (SELECT count(*)::int FROM assignment_session),
  1,
  'G3.3: teacher sees assignment_session rows in their tenant');
RESET ROLE;

-- G3.4: cross-tenant isolation
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000003","app_metadata":{"role":"teacher","tenant_id":"00000000-0000-0000-0008-000000000098"}}',
  true);
SELECT is(
  (SELECT count(*)::int FROM assignment_session),
  0,
  'G3.4: cross-tenant teacher sees 0 assignment_session rows');
RESET ROLE;

-- G3.5: INSERT denied by RLS
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT throws_like(
  $$INSERT INTO assignment_session (assignment_id, student_id, tenant_id, status)
    VALUES (
      '00000000-0000-0000-0008-000000000010',
      '00000000-0000-0000-0008-000000000001',
      '00000000-0000-0000-0008-000000000099',
      'pending'
    )$$,
  '%row-level security%',
  'G3.5: authenticated INSERT on assignment_session denied by RLS');
RESET ROLE;

-- =============================================================================
-- G4 — subscription (Pattern G, 3 tests)
-- =============================================================================

SELECT is(
  (SELECT relrowsecurity FROM pg_class
   WHERE relname = 'subscription'
     AND relnamespace = 'public'::regnamespace)::bool,
  true, 'G4.1: subscription RLS enabled');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is((SELECT count(*)::int FROM subscription), 0,
  'G4.2: authenticated sees 0 rows on subscription (Pattern G)');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::int FROM subscription), 0,
  'G4.3: anon sees 0 rows on subscription (Pattern G)');
RESET ROLE;

-- =============================================================================
-- G5 — billing_customer (Pattern G, 3 tests)
-- =============================================================================

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'billing_customer')::bool,
  true, 'G5.1: billing_customer RLS enabled');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is((SELECT count(*)::int FROM billing_customer), 0,
  'G5.2: authenticated sees 0 rows on billing_customer (Pattern G)');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::int FROM billing_customer), 0,
  'G5.3: anon sees 0 rows on billing_customer (Pattern G)');
RESET ROLE;

-- =============================================================================
-- G6 — invoice (Pattern G, 3 tests)
-- =============================================================================

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'invoice')::bool,
  true, 'G6.1: invoice RLS enabled');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is((SELECT count(*)::int FROM invoice), 0,
  'G6.2: authenticated sees 0 rows on invoice (Pattern G)');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::int FROM invoice), 0,
  'G6.3: anon sees 0 rows on invoice (Pattern G)');
RESET ROLE;

-- =============================================================================
-- G7 — billing_event (Pattern G, 3 tests)
-- =============================================================================

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'billing_event')::bool,
  true, 'G7.1: billing_event RLS enabled');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is((SELECT count(*)::int FROM billing_event), 0,
  'G7.2: authenticated sees 0 rows on billing_event (Pattern G)');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::int FROM billing_event), 0,
  'G7.3: anon sees 0 rows on billing_event (Pattern G)');
RESET ROLE;

-- =============================================================================
-- G8 — engagement_streak (Pattern G, 3 tests)
-- =============================================================================

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'engagement_streak')::bool,
  true, 'G8.1: engagement_streak RLS enabled');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is((SELECT count(*)::int FROM engagement_streak), 0,
  'G8.2: authenticated sees 0 rows on engagement_streak (Pattern G)');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::int FROM engagement_streak), 0,
  'G8.3: anon sees 0 rows on engagement_streak (Pattern G)');
RESET ROLE;

-- =============================================================================
-- G9 — achievement_definition (Pattern G, 3 tests)
-- =============================================================================

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'achievement_definition')::bool,
  true, 'G9.1: achievement_definition RLS enabled');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is((SELECT count(*)::int FROM achievement_definition), 0,
  'G9.2: authenticated sees 0 rows on achievement_definition (Pattern G)');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::int FROM achievement_definition), 0,
  'G9.3: anon sees 0 rows on achievement_definition (Pattern G)');
RESET ROLE;

-- =============================================================================
-- G10 — student_achievement (Pattern G, 3 tests)
-- =============================================================================

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'student_achievement')::bool,
  true, 'G10.1: student_achievement RLS enabled');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is((SELECT count(*)::int FROM student_achievement), 0,
  'G10.2: authenticated sees 0 rows on student_achievement (Pattern G)');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::int FROM student_achievement), 0,
  'G10.3: anon sees 0 rows on student_achievement (Pattern G)');
RESET ROLE;

-- =============================================================================
-- G11 — notification (Pattern E — FOR ALL + WITH CHECK, 7 tests)
-- =============================================================================

-- G11.1: RLS enabled
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'notification')::bool,
  true,
  'G11.1: notification RLS enabled');

-- G11.2: user A sees own notification (count = 1)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT is(
  (SELECT count(*)::int FROM notification),
  1,
  'G11.2: user A sees own notification only');

-- G11.3: user A sees 0 of user B's notification (isolation while still in user A role)
SELECT is(
  (SELECT count(*)::int FROM notification
   WHERE id = '00000000-0000-0000-0008-000000000031'),
  0,
  'G11.3: user A cannot see user B notification (cross-user isolation)');

-- G11.4: user A can UPDATE own notification (mark as read)
SELECT lives_ok(
  $$UPDATE notification
    SET read_at = now()
    WHERE id = '00000000-0000-0000-0008-000000000030'$$,
  'G11.4: user A can UPDATE own notification (mark as read)');

-- G11.5: user A UPDATE on user B notification — silently denied (0 rows)
-- DML CTE must be top-level (PostgreSQL restriction); is() called in the SELECT clause.
WITH _upd AS (
  UPDATE notification SET read_at = now()
  WHERE id = '00000000-0000-0000-0008-000000000031'
  RETURNING 1
)
SELECT is((SELECT count(*)::int FROM _upd), 0,
  'G11.5: user A UPDATE on user B notification silently denied by RLS');
RESET ROLE;

-- G11.6: user A INSERT own notification — WITH CHECK (user_id = auth_user_id) passes
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0008-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0008-000000000099"}}',
  true);
SELECT lives_ok(
  $$INSERT INTO notification (user_id, tenant_id, type, title, body)
    VALUES (
      '00000000-0000-0000-0008-000000000001',
      '00000000-0000-0000-0008-000000000099',
      'system', 'Own Insert Test', 'body'
    )$$,
  'G11.6: user A can INSERT own notification (WITH CHECK passes for own user_id)');

-- G11.7 (A3): WITH CHECK enforcement — INSERT with user_id = user B rejected
SELECT throws_like(
  $$INSERT INTO notification (user_id, tenant_id, type, title, body)
    VALUES (
      '00000000-0000-0000-0008-000000000002',
      '00000000-0000-0000-0008-000000000099',
      'system', 'Cross-user Insert', 'body'
    )$$,
  '%row-level security%',
  'G11.7 (A3): INSERT with user_id=user_B under user_A JWT rejected by WITH CHECK');
RESET ROLE;

-- =============================================================================
-- G_struct — Structural integrity (5 tests)
-- =============================================================================

-- G_struct.1: fk_session_assignment exists in pg_constraint
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_assignment'),
  'G_struct.1: fk_session_assignment constraint exists on session_record');

-- G_struct.2: idx_sub_active_per_tenant partial unique (P5 dedup)
-- Setup: one active subscription already inserted for tenant A.
-- Duplicate active subscription for same tenant → throws duplicate key.
SELECT throws_like(
  $$INSERT INTO subscription (tenant_id, tier, is_active)
    VALUES ('00000000-0000-0000-0008-000000000099', 'standard', true)$$,
  '%duplicate key%',
  'G_struct.2: second active subscription for same tenant rejected by idx_sub_active_per_tenant');

-- G_struct.3: stripe_subscription_id UNIQUE (P5 dedup)
SELECT throws_like(
  $$INSERT INTO subscription (tenant_id, tier, stripe_subscription_id)
    VALUES ('00000000-0000-0000-0008-000000000098', 'free', 'sub_stage8_test001')$$,
  '%duplicate key%',
  'G_struct.3: duplicate stripe_subscription_id rejected by UNIQUE constraint');

-- G_struct.4: XOR CHECK — both student_id AND class_id set → violates CHECK
SELECT throws_like(
  $$INSERT INTO assignment_target (assignment_id, student_id, class_id)
    VALUES (
      '00000000-0000-0000-0008-000000000010',
      '00000000-0000-0000-0008-000000000001',
      '00000000-0000-0000-0008-000000000020'
    )$$,
  '%violates check constraint%',
  'G_struct.4: assignment_target XOR — both student_id and class_id rejected');

-- G_struct.5: XOR CHECK — both NULL → violates CHECK
SELECT throws_like(
  $$INSERT INTO assignment_target (assignment_id)
    VALUES ('00000000-0000-0000-0008-000000000010')$$,
  '%violates check constraint%',
  'G_struct.5: assignment_target XOR — both null rejected');

-- =============================================================================
-- G_idx — Index existence structural checks (ADR-0014, 11 tests)
-- pg_indexes catalog confirms DDL was applied.
-- EXPLAIN deferred to Stage 26 load tests.
-- =============================================================================

-- assignment (2)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'assignment' AND indexname = 'idx_asg_tenant'),
  'G_idx.1: idx_asg_tenant exists on assignment');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'assignment' AND indexname = 'idx_asg_creator'),
  'G_idx.2: idx_asg_creator exists on assignment');

-- assignment_target (2)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'assignment_target' AND indexname = 'idx_asg_target_student'),
  'G_idx.3: idx_asg_target_student exists on assignment_target');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'assignment_target' AND indexname = 'idx_asg_target_class'),
  'G_idx.4: idx_asg_target_class exists on assignment_target');

-- assignment_session (1)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'assignment_session' AND indexname = 'idx_asg_session_student'),
  'G_idx.5: idx_asg_session_student exists on assignment_session');

-- subscription (1)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'subscription' AND indexname = 'idx_sub_active_per_tenant'),
  'G_idx.6: idx_sub_active_per_tenant exists on subscription');

-- invoice (1)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'invoice' AND indexname = 'idx_invoice_tenant'),
  'G_idx.7: idx_invoice_tenant exists on invoice');

-- billing_event (1)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'billing_event' AND indexname = 'idx_be_unprocessed'),
  'G_idx.8: idx_be_unprocessed exists on billing_event');

-- student_achievement (1)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'student_achievement' AND indexname = 'idx_sa_student_time'),
  'G_idx.9: idx_sa_student_time exists on student_achievement');

-- notification (2)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'notification' AND indexname = 'idx_notif_user_unread'),
  'G_idx.10: idx_notif_user_unread exists on notification');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'notification' AND indexname = 'idx_notif_user_all'),
  'G_idx.11: idx_notif_user_all exists on notification');

-- =============================================================================
-- G_meta — Policy count = 0 for Pattern G tables (8 tests)
-- Proves no policies accidentally attached to any Pattern G table.
-- =============================================================================

SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE tablename = 'assignment_target'),
  0, 'G_meta.1: assignment_target has 0 RLS policies (Pattern G)');
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE tablename = 'subscription' AND schemaname = 'public'),
  0, 'G_meta.2: subscription has 0 RLS policies (Pattern G)');
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE tablename = 'billing_customer'),
  0, 'G_meta.3: billing_customer has 0 RLS policies (Pattern G)');
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE tablename = 'invoice'),
  0, 'G_meta.4: invoice has 0 RLS policies (Pattern G)');
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE tablename = 'billing_event'),
  0, 'G_meta.5: billing_event has 0 RLS policies (Pattern G)');
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE tablename = 'engagement_streak'),
  0, 'G_meta.6: engagement_streak has 0 RLS policies (Pattern G)');
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE tablename = 'achievement_definition'),
  0, 'G_meta.7: achievement_definition has 0 RLS policies (Pattern G)');
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE tablename = 'student_achievement'),
  0, 'G_meta.8: student_achievement has 0 RLS policies (Pattern G)');

SELECT * FROM finish();
ROLLBACK;
