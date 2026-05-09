-- =============================================================================
-- Down Migration 0016 — Notification Dispatcher Update (reverse)
-- Restores fn_drain_outbox_batch to its Migration 0010 state.
-- Reverts: 'assignment_assigned' → 'assignment.published', removes 'plan_updated'
-- and 'intervention_alert' branches, removes notification_type enrichment.
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
    ELSIF event.event_type = 'assignment.published' THEN
      j_type := 'notification.create';
      j_pri  := 'medium';
      j_pay  := jsonb_build_object('assignment_id', event.aggregate_id);
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

REVOKE EXECUTE ON FUNCTION public.fn_drain_outbox_batch(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_drain_outbox_batch(int) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_drain_outbox_batch(int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_drain_outbox_batch(int) TO   service_role;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'outbox.dispatch';
SELECT cron.schedule('outbox.dispatch', '* * * * *', 'SELECT fn_drain_outbox_batch()');
