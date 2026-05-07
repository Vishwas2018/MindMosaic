-- =============================================================================
-- Migration 0014 — job_queue dead_lettered_at + fn_pickup_jobs
-- Stage 28 · 2026-05-18
-- Implements: DEV_PLAN.md Stage 28; Q-28.4 (dead_lettered_at); ADR-0031
-- Notes:
--   (1) dead_lettered_at: missing column identified in Stage 28 pre-read
--       (Q-28.4). The job_status enum already contains 'dead_letter' from
--       Migration 0001; this column is its timestamp companion.
--   (2) fn_pickup_jobs: SECURITY DEFINER function for FOR UPDATE SKIP LOCKED
--       atomic job pickup by the jobs-worker Edge Function. Must be created in
--       the same migration as the column it references.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — dead_lettered_at column
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE job_queue
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — fn_pickup_jobs
--
-- Atomically claims up to p_limit pending jobs for the given worker using
-- FOR UPDATE SKIP LOCKED (no advisory locks needed). Returns the claimed
-- rows via RETURNING * so the caller can dispatch them immediately.
--
-- Ordering: priority DESC (high before medium before low), then scheduled_at
-- ASC (oldest-first within the same priority band). Matches idx_job_poll.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_pickup_jobs(
  p_worker_id text,
  p_limit     int DEFAULT 10
)
RETURNS SETOF job_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE job_queue
  SET
    status     = 'processing',
    started_at = now(),
    worker_id  = p_worker_id
  WHERE id IN (
    SELECT id
    FROM   job_queue
    WHERE  status       = 'pending'
      AND  scheduled_at <= now()
    ORDER  BY priority DESC, scheduled_at ASC
    LIMIT  p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;
