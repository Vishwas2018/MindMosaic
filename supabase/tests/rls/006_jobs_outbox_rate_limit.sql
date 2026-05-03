-- =============================================================================
-- pgTAP Test: 006_jobs_outbox_rate_limit.sql
-- Stage 7 · 2026-05-03
-- plan(26)
-- Tests: job_queue Pattern G (G1 × 6), pipeline_event Pattern G (G2 × 4),
--        rate_limit_bucket Pattern G (G4 × 6, incl PK dedup G4.5–G4.6),
--        index existence structural check (G_idx × 7, ADR-0014),
--        policy count = 0 structural check (G_meta × 3)
-- outbox_event: already created + tested in 0004/004_sessions_events.sql. Not here.
--
-- Pattern G = RLS enabled, zero policies, deny all authenticated + anon.
-- Anon tests use P1 with anon role context; safe because no policies exist
-- on these tables — no SECURITY DEFINER helpers are evaluated (contrast
-- Pattern A tables where anon evaluation raises permission denied).
--
-- G1 sub-tests G1.4–G1.6: idx_job_dedup partial unique index verification.
--   G1.4: first pending insert succeeds (lives_ok)
--   G1.5: duplicate pending key rejected (throws_like '%duplicate key%', P5)
--   G1.6: same key with status='completed' allowed — proves WHERE clause of
--          partial index (status IN ('pending','processing')) is honored.
--
-- G_idx: pg_indexes catalog check for all 7 indexes in this migration (ADR-0014).
--   Structural proof that DDL was applied. EXPLAIN deferred to Stage 26 load tests.
--   idx_outbox_unprocessed already checked in 004_sessions_events.sql G3.5.
--
-- Role strategy:
--   G1.4–G1.6 (dedup): run as postgres (RLS bypassed; testing index, not RLS)
--   G1.1–G1.3, G2–G4 RLS tests: SET LOCAL ROLE authenticated / anon
--   G_idx, G_meta: run as postgres
--
-- Test data UUIDs (00000000-0000-0000-0007-XXXXXXXXXXXX):
--   test_student_id: 00000000-0000-0000-0007-000000000001
--   test_tenant_id:  00000000-0000-0000-0007-000000000099
--   test_session_id: 00000000-0000-0000-0007-000000000010  (dummy FK; RLS fires first)
-- =============================================================================

BEGIN;

SELECT plan(26);

-- =============================================================================
-- G1 — job_queue (Pattern G, 6 tests)
-- =============================================================================

-- G1.1: RLS enabled
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'job_queue')::bool,
  true,
  'G1.1: job_queue RLS enabled');

-- G1.2: authenticated sees 0 rows (Pattern G — no policies)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0007-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0007-000000000099"}}',
  true);
SELECT is(
  (SELECT count(*)::int FROM job_queue),
  0,
  'G1.2: authenticated sees 0 rows on job_queue (Pattern G)');
RESET ROLE;

-- G1.3: anon sees 0 rows (P1 with anon role; safe — no helper-calling policies)
SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM job_queue),
  0,
  'G1.3: anon sees 0 rows on job_queue (Pattern G, no helper policies)');
RESET ROLE;

-- G1.4–G1.6: idx_job_dedup partial unique index verification (ADR-0014, P5)
-- Run as postgres; testing index constraint, not RLS.

SELECT lives_ok(
  $$INSERT INTO job_queue (job_type, payload, idempotency_key)
    VALUES ('test.job', '{}', 'idem-key-stage7-001')$$,
  'G1.4: first insert (status=pending default) succeeds');

SELECT throws_like(
  $$INSERT INTO job_queue (job_type, payload, idempotency_key)
    VALUES ('test.job', '{}', 'idem-key-stage7-001')$$,
  '%duplicate key%',
  'G1.5: duplicate pending idempotency_key rejected by idx_job_dedup');

SELECT lives_ok(
  $$INSERT INTO job_queue (job_type, payload, idempotency_key, status)
    VALUES ('test.job', '{}', 'idem-key-stage7-001', 'completed')$$,
  'G1.6: same key with status=completed allowed (partial predicate excludes completed)');

-- =============================================================================
-- G2 — pipeline_event (Pattern G, 4 tests)
-- =============================================================================

-- G2.1: RLS enabled
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'pipeline_event')::bool,
  true,
  'G2.1: pipeline_event RLS enabled');

-- G2.2: authenticated sees 0 rows
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0007-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0007-000000000099"}}',
  true);
SELECT is(
  (SELECT count(*)::int FROM pipeline_event),
  0,
  'G2.2: authenticated sees 0 rows on pipeline_event (Pattern G)');
RESET ROLE;

-- G2.3: anon sees 0 rows
SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM pipeline_event),
  0,
  'G2.3: anon sees 0 rows on pipeline_event (Pattern G)');
RESET ROLE;

-- G2.4: authenticated INSERT denied by RLS (RLS fires before FK constraint)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0007-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0007-000000000099"}}',
  true);
SELECT throws_like(
  $$INSERT INTO pipeline_event (session_id, student_id, step, step_name)
    VALUES (
      '00000000-0000-0000-0007-000000000010',
      '00000000-0000-0000-0007-000000000001',
      1, 'foundation.update')$$,
  '%row-level security%',
  'G2.4: authenticated INSERT on pipeline_event denied by RLS');
RESET ROLE;

-- =============================================================================
-- G4 — rate_limit_bucket (Pattern G, 6 tests)
-- =============================================================================

-- G4.1: RLS enabled
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'rate_limit_bucket')::bool,
  true,
  'G4.1: rate_limit_bucket RLS enabled');

-- G4.2: authenticated sees 0 rows
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0007-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0007-000000000099"}}',
  true);
SELECT is(
  (SELECT count(*)::int FROM rate_limit_bucket),
  0,
  'G4.2: authenticated sees 0 rows on rate_limit_bucket (Pattern G)');
RESET ROLE;

-- G4.3: anon sees 0 rows
SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM rate_limit_bucket),
  0,
  'G4.3: anon sees 0 rows on rate_limit_bucket (Pattern G)');
RESET ROLE;

-- G4.4: authenticated INSERT denied by RLS
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0007-000000000001","app_metadata":{"role":"student","tenant_id":"00000000-0000-0000-0007-000000000099"}}',
  true);
SELECT throws_like(
  $$INSERT INTO rate_limit_bucket (bucket_key, window_start)
    VALUES ('api:test:00000000-0000-0000-0007-000000000001', now())$$,
  '%row-level security%',
  'G4.4: authenticated INSERT on rate_limit_bucket denied by RLS');
RESET ROLE;

-- G4.5–G4.6: PRIMARY KEY uniqueness verification (ADR-0014; run as postgres)
SELECT lives_ok(
  $$INSERT INTO rate_limit_bucket (bucket_key, window_start)
    VALUES ('stage7-rlb-test', '2026-01-01 00:00:00+00')$$,
  'G4.5: first insert into rate_limit_bucket succeeds');
SELECT throws_like(
  $$INSERT INTO rate_limit_bucket (bucket_key, window_start)
    VALUES ('stage7-rlb-test', '2026-01-01 00:00:00+00')$$,
  '%duplicate key%',
  'G4.6: duplicate (bucket_key, window_start) rejected by PRIMARY KEY');

-- =============================================================================
-- G_idx — Index existence structural checks (ADR-0014, 7 tests)
-- pg_indexes catalog confirms DDL was applied.
-- EXPLAIN deferred to Stage 26 load tests (empty-table planner unreliable).
-- =============================================================================

-- job_queue (4)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes
          WHERE tablename = 'job_queue' AND indexname = 'idx_job_poll'),
  'G_idx.1: idx_job_poll exists on job_queue');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes
          WHERE tablename = 'job_queue' AND indexname = 'idx_job_dedup'),
  'G_idx.2: idx_job_dedup exists on job_queue');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes
          WHERE tablename = 'job_queue' AND indexname = 'idx_job_dead'),
  'G_idx.3: idx_job_dead exists on job_queue');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes
          WHERE tablename = 'job_queue' AND indexname = 'idx_job_stuck'),
  'G_idx.4: idx_job_stuck exists on job_queue');

-- pipeline_event (2)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes
          WHERE tablename = 'pipeline_event' AND indexname = 'idx_pe_session'),
  'G_idx.5: idx_pe_session exists on pipeline_event');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes
          WHERE tablename = 'pipeline_event' AND indexname = 'idx_pe_pending'),
  'G_idx.6: idx_pe_pending exists on pipeline_event');

-- rate_limit_bucket (1)
-- idx_outbox_unprocessed already checked in 004_sessions_events.sql G3.5
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes
          WHERE tablename = 'rate_limit_bucket' AND indexname = 'idx_rlb_cleanup'),
  'G_idx.7: idx_rlb_cleanup exists on rate_limit_bucket');

-- =============================================================================
-- G_meta — Policy count = 0 (Pattern G structural confirmation, 3 tests)
-- Proves no policies were accidentally attached to any of the three tables.
-- outbox_event already covered in 004_sessions_events.sql.
-- =============================================================================

SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE tablename = 'job_queue'),
  0,
  'G_meta.1: job_queue has 0 RLS policies (Pattern G)');
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE tablename = 'pipeline_event'),
  0,
  'G_meta.2: pipeline_event has 0 RLS policies (Pattern G)');
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE tablename = 'rate_limit_bucket'),
  0,
  'G_meta.3: rate_limit_bucket has 0 RLS policies (Pattern G)');

SELECT * FROM finish();
ROLLBACK;
