-- =============================================================================
-- Migration 0016 — Notification Dispatcher Update
-- Stage 34 · 2026-05-24
-- Functions amended: 1 (fn_drain_outbox_batch — OR REPLACE, no signature change)
-- No new tables. No new SECURITY DEFINER functions.
--
-- Q-34.1 (Option A): 'assignment.published' branch replaced with 'assignment_assigned'.
--   Stage 33 writes event_type='assignment_assigned' (handlers.ts:570); the prior
--   'assignment.published' branch in migration 0010 was speculative dead code (never written).
--   j_pay enriched with notification_type key so pipeline/create handler knows what to create.
--
-- Q-34.4 (Option A): 'plan_updated' + 'intervention_alert' branches added.
--   orchestration-svc writes plan_updated at replan completion (handlers.ts:708).
--   analytics-svc writes intervention_alert after bulk alert INSERT (handlers.ts:368).
--
-- Q-34.5 (self-resolve): j_pay := event.payload || jsonb_build_object('notification_type',
--   event.event_type) for all three notification branches. Passes through all outbox payload
--   fields (student_id, tenant_id, etc.) plus adds notification_type for pipeline/create routing.
--
-- ADR-0031 fourth amendment: notification.create → notifications-svc added to route map.
-- Privilege hardening: triple REVOKE + GRANT service_role (idempotent, per 0010 pattern).
-- Cron re-schedule: unschedule-first (ADR-0017) — schedule unchanged from 0010 (every minute).
-- =============================================================================

-- =============================================================================
-- SECTION 1 — FUNCTION (OR REPLACE preserves signature: fn_drain_outbox_batch(int) RETURNS int)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_drain_outbox_batch(
  batch_size int DEFAULT 100
)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  event   outbox_event%ROWTYPE;
  drained int := 0;
  j_type  text;
  j_pri   text;
  j_pay   jsonb;
BEGIN
  FOR event IN
    SELECT * FROM outbox_event
    WHERE processed_at IS NULL
    ORDER BY created_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    IF event.event_type = 'session.submitted' THEN
      j_type := 'pipeline.run_sync';
      j_pri  := 'high';
      j_pay  := jsonb_build_object('session_id', event.aggregate_id);
    ELSIF event.event_type = 'assignment_assigned' THEN
      -- Q-34.1: replaces dead 'assignment.published' branch (0010). Stage 33 writes
      -- assignment_assigned with { assignment_id, student_id, tenant_id, published_at }.
      -- notification_type key added so notifications-svc/pipeline/create knows the type.
      j_type := 'notification.create';
      j_pri  := 'medium';
      j_pay  := event.payload || jsonb_build_object('notification_type', event.event_type);
    ELSIF event.event_type = 'plan_updated' THEN
      -- Q-34.4: orchestration-svc writes plan_updated on replan completion.
      -- payload: { student_id, tenant_id, plan_id, session_count }.
      j_type := 'notification.create';
      j_pri  := 'medium';
      j_pay  := event.payload || jsonb_build_object('notification_type', event.event_type);
    ELSIF event.event_type = 'intervention_alert' THEN
      -- Q-34.4: analytics-svc writes intervention_alert per-alert after bulk INSERT.
      -- payload: { student_id, teacher_id, tenant_id, alert_type }.
      j_type := 'notification.create';
      j_pri  := 'medium';
      j_pay  := event.payload || jsonb_build_object('notification_type', event.event_type);
    ELSE
      RAISE EXCEPTION 'unknown outbox event_type: %', event.event_type;
    END IF;

    INSERT INTO job_queue (job_type, idempotency_key, payload, priority)
    VALUES (
      j_type,
      'outbox:' || event.id::text,
      j_pay,
      j_pri::job_priority
    )
    ON CONFLICT DO NOTHING;

    UPDATE outbox_event SET processed_at = now() WHERE id = event.id;
    drained := drained + 1;
  END LOOP;

  RETURN drained;
END;
$$;

-- =============================================================================
-- SECTION 2 — EXECUTE PRIVILEGE HARDENING (X1, idempotent per 0010 pattern)
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_drain_outbox_batch(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_drain_outbox_batch(int) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_drain_outbox_batch(int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_drain_outbox_batch(int) TO   service_role;

-- =============================================================================
-- SECTION 3 — CRON RE-REGISTRATION (unschedule-first, ADR-0017 + ADR-0018)
-- Schedule unchanged from 0010 (every minute). OR REPLACE function above makes
-- cron re-registration idempotent.
-- =============================================================================

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'outbox.dispatch';
SELECT cron.schedule('outbox.dispatch', '* * * * *', 'SELECT fn_drain_outbox_batch()');
