-- =============================================================================
-- Migration 0006 DOWN — Jobs + Outbox + Rate Limit
-- Stage 7 · 2026-05-03
-- Reverses 0006_jobs_outbox_rate_limit.sql
-- Drop order: reverse FK dependency (most-constrained first).
--   pipeline_event (→ session_record, user_profile) before those tables.
--   job_queue, rate_limit_bucket have no external FK dependencies.
--   outbox_event was created in 0004 — not dropped here.
-- Indexes and RLS policies are dropped automatically with their tables.
-- =============================================================================

DROP TABLE IF EXISTS rate_limit_bucket;
DROP TABLE IF EXISTS pipeline_event;
DROP TABLE IF EXISTS job_queue;
