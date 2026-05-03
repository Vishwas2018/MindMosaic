-- =============================================================================
-- Migration 0006 — Jobs + Outbox + Rate Limit
-- Stage 7 · 2026-05-03
-- Implements: DEV_PLAN.md Stage 7; Arch §2.15, §5.1–§5.5
-- ADRs: ADR-0014 (structural index assertions in pgTAP — not EXPLAIN)
-- Pattern G: three tables deny all authenticated; service_role bypasses RLS.
-- Enum types (job_priority, job_status, pipeline_step_status) defined in 0001.
-- No new SECURITY DEFINER functions; no new enum types.
-- Note: outbox_event was already created in Migration 0004 (0004_sessions_events.sql)
--       and is tested in 004_sessions_events.sql. Not repeated here.
-- Note: session_record.assignment_id FK (referenced in 0004 header) is added in
--       Stage 8 (Migration 0007) when the assignment table is created, not here.
-- =============================================================================

-- =============================================================================
-- SECTION 1 — Tables
-- FK dependency order (within this migration):
--   job_queue          (no FK deps; tenant_id nullable, no FK constraint)
--   pipeline_event     (→ session_record, user_profile — prior migrations)
--   rate_limit_bucket  (no FK deps; composite PK, no tenant_id)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. job_queue
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE job_queue (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,                                 -- nullable; no FK; platform-catalog
  job_type        text         NOT NULL,
  payload         jsonb        NOT NULL DEFAULT '{}',
  priority        job_priority NOT NULL DEFAULT 'medium',
  status          job_status   NOT NULL DEFAULT 'pending',
  idempotency_key text         NOT NULL,
  attempts        int          NOT NULL DEFAULT 0,
  max_attempts    int          NOT NULL DEFAULT 3,
  last_error      text,
  scheduled_at    timestamptz  NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz,
  worker_id       text,
  created_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_poll ON job_queue(priority DESC, scheduled_at ASC)
  WHERE status = 'pending';
CREATE UNIQUE INDEX idx_job_dedup ON job_queue(idempotency_key)
  WHERE status IN ('pending', 'processing');
CREATE INDEX idx_job_dead ON job_queue(status)
  WHERE status = 'dead_letter';
CREATE INDEX idx_job_stuck ON job_queue(started_at)
  WHERE status = 'processing';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. pipeline_event
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE pipeline_event (
  id           uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid                 NOT NULL REFERENCES session_record(id),
  student_id   uuid                 NOT NULL REFERENCES user_profile(id),
  step         int                  NOT NULL CHECK (step BETWEEN 1 AND 9),
  step_name    text                 NOT NULL,
  status       pipeline_step_status NOT NULL DEFAULT 'pending',
  attempts     int                  NOT NULL DEFAULT 0,
  started_at   timestamptz,
  completed_at timestamptz,
  error        text,
  created_at   timestamptz          NOT NULL DEFAULT now()
);

CREATE INDEX idx_pe_session ON pipeline_event(session_id, step);
CREATE INDEX idx_pe_pending ON pipeline_event(status)
  WHERE status = 'pending';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rate_limit_bucket
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE rate_limit_bucket (
  bucket_key   text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        int         NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX idx_rlb_cleanup ON rate_limit_bucket(window_start);

-- =============================================================================
-- SECTION 2 — RLS (Pattern G — three tables)
-- Enable RLS; no policies = deny all authenticated.
-- service_role bypasses RLS by Supabase default.
-- =============================================================================

ALTER TABLE job_queue          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_event     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_bucket  ENABLE ROW LEVEL SECURITY;
