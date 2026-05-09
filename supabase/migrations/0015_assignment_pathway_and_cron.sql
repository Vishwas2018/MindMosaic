-- 0015_assignment_pathway_and_cron.sql
--
-- Q-33.8 (Option A): Add pathway_id to assignment table.
-- assessment-svc/handlers.ts line 226-228 hard-rejects pathway_id === null in POST /sessions/create.
-- The assignment table (0007_new_domains.sql) had no pathway_id column.
-- NOT NULL is safe: assignment table is empty in v1 (no backfill required).
--
-- Also registers pg_cron lifecycle functions for assignment session management (Stage 33):
--   fn_mark_overdue_assignments  — Q-33.2 Option A: daily 01:00 UTC
--   fn_sync_assignment_completion — Q-33.3 Option B: every 5 minutes

-- =============================================================================
-- SECTION 1 — Q-33.8: pathway_id column
-- =============================================================================

ALTER TABLE assignment
  ADD COLUMN pathway_id uuid NOT NULL
  REFERENCES pathway(id) ON DELETE RESTRICT;

-- =============================================================================
-- SECTION 2 — pg_cron: fn_mark_overdue_assignments (Q-33.2 Option A)
-- Transitions pending/in_progress assignment_sessions to overdue when
-- due_at + 24 hours < now() and status is not yet completed.
-- Pattern mirrors 0008_cron.sql (LANGUAGE sql VOLATILE, no SECURITY DEFINER).
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_mark_overdue_assignments()
RETURNS void LANGUAGE sql VOLATILE AS $$
  UPDATE assignment_session
  SET    status     = 'overdue',
         updated_at = now()
  WHERE  status IN ('pending', 'in_progress')
    AND  EXISTS (
           SELECT 1
           FROM   assignment a
           WHERE  a.id       = assignment_session.assignment_id
             AND  a.due_at IS NOT NULL
             AND  a.due_at + interval '24 hours' < now()
         );
$$;

SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'assignment.mark_overdue';

SELECT cron.schedule(
  'assignment.mark_overdue',
  '0 1 * * *',
  'SELECT fn_mark_overdue_assignments()'
);

-- =============================================================================
-- SECTION 3 — pg_cron: fn_sync_assignment_completion (Q-33.3 Option B)
-- Polls session_record every 5 minutes; transitions in_progress assignment_session
-- rows to completed when their linked session_record.status = 'processed'.
-- v1 polling approach; v1.1 upgrade to outbox-driven pipeline event: ISSUE-0024.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_sync_assignment_completion()
RETURNS void LANGUAGE sql VOLATILE AS $$
  UPDATE assignment_session
  SET    status       = 'completed',
         completed_at = sr.updated_at,
         updated_at   = now()
  FROM   session_record sr
  WHERE  assignment_session.session_id = sr.id
    AND  sr.status                     = 'processed'
    AND  assignment_session.status     = 'in_progress';
$$;

SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'assignment.sync_completion';

SELECT cron.schedule(
  'assignment.sync_completion',
  '*/5 * * * *',
  'SELECT fn_sync_assignment_completion()'
);

-- =============================================================================
-- Down migration (reference — not executed automatically):
--
--   SELECT cron.unschedule(jobid)
--     FROM cron.job
--    WHERE jobname IN ('assignment.mark_overdue', 'assignment.sync_completion');
--   DROP FUNCTION IF EXISTS fn_mark_overdue_assignments();
--   DROP FUNCTION IF EXISTS fn_sync_assignment_completion();
--   ALTER TABLE assignment DROP COLUMN pathway_id;
-- =============================================================================
