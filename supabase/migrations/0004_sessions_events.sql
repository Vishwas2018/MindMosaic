-- =============================================================================
-- Migration 0004 — Sessions + Canonical Events
-- Stage 5 · 2026-05-02
-- Implements: DEV_PLAN.md Stage 5; Arch §2.5, §2.6, §2.7
-- Spec refs: Spec §3.4–§3.7; Arch §3.2 Pattern A (ADR-0011); ADR-0004 UTA extension
-- ADRs: ADR-0004 (UTA per-role SELECT extension — obligation fulfilled)
--       ADR-0005 (SECURITY DEFINER helpers — pattern extended to Pattern A)
--       ADR-0011 (Pattern A SECURITY DEFINER helpers; atomic write SECURITY DEFINER;
--                 no student INSERT on function-only tables)
-- Note: session_record.assignment_id column included without FK constraint.
--       FK added in the migration that creates assignment (Stage 7):
--         ALTER TABLE session_record ADD CONSTRAINT sr_assignment_fkey
--           FOREIGN KEY (assignment_id) REFERENCES assignment(id) ON DELETE SET NULL;
-- Note: Arch §3.2 Pattern A template shows inline subqueries against RLS-enabled tables.
--       Per ADR-0011 + BUILD_CONTRACT §6, replaced with SECURITY DEFINER helpers
--       (fn_my_child_ids, fn_teacher_student_ids, fn_my_session_ids).
-- Note: learning_event uses PARTITION BY RANGE; monthly partitions are provisioned
--       by pg_partman (configured separately). learning_event_default catches all
--       rows until pg_partman creates the first monthly partition.
-- =============================================================================

-- =============================================================================
-- SECTION 1 — Tables
-- FK dependency order:
--   session_record (→ user_profile, tenant, pathway, assessment_profile, repair_sequence)
--   session_response (→ session_record, item, user_profile, tenant)
--   response_telemetry (→ session_response)
--   session_checkpoint (→ session_record)
--   learning_event (→ user_profile, tenant, session_record, item, skill_node)
--   api_idempotency_key (no FK deps; composite PK includes tenant_id)
--   outbox_event (no FK deps)
-- =============================================================================

CREATE TABLE session_record (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            uuid          NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id             uuid          NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  pathway_id            uuid          REFERENCES pathway(id) ON DELETE SET NULL,
  assessment_profile_id uuid          REFERENCES assessment_profile(id) ON DELETE SET NULL,
  repair_sequence_id    uuid          REFERENCES repair_sequence(id) ON DELETE SET NULL,
  assignment_id         uuid,         -- FK added in Stage 7 when assignment table is created
  engine_type           engine_type   NOT NULL,
  mode                  session_mode  NOT NULL,
  status                session_status NOT NULL DEFAULT 'created',
  -- Optimistic lock: incremented by create_session_response_atomic on every response write.
  -- Checkpoint writes (session_checkpoint) NEVER touch this column (Arch C3).
  version               int           NOT NULL DEFAULT 1,
  lock_token            uuid,
  started_at            timestamptz,
  submitted_at          timestamptz,
  processed_at          timestamptz,
  duration_ms           int,
  active_duration_ms    int,
  item_count            int           NOT NULL DEFAULT 0,
  items_answered        int           NOT NULL DEFAULT 0,
  items_correct         int           NOT NULL DEFAULT 0,
  raw_score             real,
  scaled_score          real,
  score_band            text,
  engine_state_snapshot jsonb         NOT NULL DEFAULT '{}',
  skills_touched        uuid[]        NOT NULL DEFAULT '{}',
  pipeline_status       pipeline_status NOT NULL DEFAULT 'pending',
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_student  ON session_record(student_id);
CREATE INDEX idx_session_tenant   ON session_record(tenant_id);
CREATE INDEX idx_session_active   ON session_record(student_id, status)
  WHERE status IN ('created', 'active', 'interrupted');
CREATE INDEX idx_session_pipeline ON session_record(pipeline_status)
  WHERE pipeline_status NOT IN ('async_complete', 'pending');
CREATE INDEX idx_session_skills   ON session_record USING GIN(skills_touched);
CREATE INDEX idx_session_recent   ON session_record(student_id, submitted_at DESC)
  WHERE status = 'processed';
CREATE UNIQUE INDEX idx_session_one_active ON session_record(student_id)
  WHERE status IN ('created', 'active', 'interrupted');

-- ---------------------------------------------------------------------------

CREATE TABLE session_response (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid          NOT NULL REFERENCES session_record(id) ON DELETE CASCADE,
  item_id               uuid          NOT NULL REFERENCES item(id) ON DELETE RESTRICT,
  student_id            uuid          NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id             uuid          NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  sequence_number       int           NOT NULL CHECK (sequence_number >= 1),
  response_data         jsonb         NOT NULL,
  is_correct            boolean,
  score                 real          NOT NULL DEFAULT 0.0,
  difficulty_at_response real         NOT NULL CHECK (difficulty_at_response BETWEEN 0 AND 1),
  answered_at           timestamptz   NOT NULL DEFAULT now(),
  created_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_response_session ON session_response(session_id, sequence_number);
CREATE INDEX idx_response_item    ON session_response(item_id);
CREATE UNIQUE INDEX idx_response_dedup
  ON session_response(session_id, item_id, sequence_number);

-- ---------------------------------------------------------------------------

CREATE TABLE response_telemetry (
  response_id                 uuid  PRIMARY KEY REFERENCES session_response(id) ON DELETE CASCADE,
  time_to_answer_ms           int   NOT NULL,
  time_to_first_action_ms     int   NOT NULL,
  answer_changes              int   NOT NULL DEFAULT 0,
  items_since_session_start   int   NOT NULL,
  time_since_session_start_ms int   NOT NULL,
  skipped_then_returned       boolean NOT NULL DEFAULT false,
  scroll_to_bottom            boolean,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------

CREATE TABLE session_checkpoint (
  session_id             uuid  PRIMARY KEY REFERENCES session_record(id) ON DELETE CASCADE,
  checkpoint_number      int   NOT NULL DEFAULT 0,
  current_question_index int   NOT NULL DEFAULT 0,
  answers                jsonb NOT NULL DEFAULT '[]',
  telemetry_buffer       jsonb NOT NULL DEFAULT '[]',
  client_timestamp       timestamptz,
  server_timestamp       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------

CREATE TABLE learning_event (
  id                  uuid                NOT NULL DEFAULT gen_random_uuid(),
  student_id          uuid                NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id           uuid                NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  session_id          uuid                NOT NULL REFERENCES session_record(id) ON DELETE CASCADE,
  item_id             uuid                REFERENCES item(id) ON DELETE SET NULL,
  skill_id            uuid                REFERENCES skill_node(id) ON DELETE SET NULL,
  event_type          learning_event_type NOT NULL,
  correctness         boolean,
  score               real,
  duration_ms         int                 NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  difficulty_at_event real                CHECK (difficulty_at_event IS NULL
                                                 OR difficulty_at_event BETWEEN 0 AND 1),
  metadata            jsonb               NOT NULL DEFAULT '{}',
  sequence_number     int                 NOT NULL CHECK (sequence_number >= 1),
  created_at          timestamptz         NOT NULL DEFAULT now(),
  -- Partition key (created_at) must be included in all unique constraints (PG partitioning rule).
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE learning_event_default PARTITION OF learning_event DEFAULT;

CREATE INDEX idx_le_session      ON learning_event(session_id, sequence_number);
CREATE INDEX idx_le_student_time ON learning_event(student_id, created_at DESC);
CREATE INDEX idx_le_skill_answer ON learning_event(skill_id, student_id)
  WHERE event_type = 'answer';
CREATE INDEX idx_le_session_type ON learning_event(session_id, event_type);
-- created_at required in unique index on partitioned table (PG partitioning rule).
CREATE UNIQUE INDEX idx_le_dedup
  ON learning_event(session_id,
                    COALESCE(item_id, '00000000-0000-0000-0000-000000000000'::uuid),
                    event_type, sequence_number, created_at);

-- ---------------------------------------------------------------------------

CREATE TABLE api_idempotency_key (
  idempotency_key text        NOT NULL,
  tenant_id       uuid        NOT NULL,
  endpoint        text        NOT NULL,
  request_hash    text        NOT NULL,
  status          text        NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing', 'completed', 'failed')),
  response_status int,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  PRIMARY KEY (idempotency_key, tenant_id)
);

CREATE INDEX idx_idem_cleanup ON api_idempotency_key(created_at)
  WHERE status IN ('completed', 'failed');

-- ---------------------------------------------------------------------------

CREATE TABLE outbox_event (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text        NOT NULL,
  aggregate_id   uuid        NOT NULL,
  event_type     text        NOT NULL,
  payload        jsonb       NOT NULL,
  processed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbox_unprocessed ON outbox_event(created_at)
  WHERE processed_at IS NULL;

-- =============================================================================
-- SECTION 2 — updated_at trigger (session_record is the only mutable table here)
-- =============================================================================

CREATE TRIGGER trg_session_record_updated_at
  BEFORE UPDATE ON session_record
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- SECTION 3 — SECURITY DEFINER helpers for Pattern A RLS
-- Per ADR-0011: arch §3.2 Pattern A inline subqueries replaced with SECURITY DEFINER
-- helpers per BUILD_CONTRACT §6. Double REVOKE + GRANT per ADR-0008 corrections.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_my_child_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY(
    SELECT student_id FROM parent_student_link WHERE parent_id = auth_user_id()
  );
$$;
-- Returns empty array for callers without matching role (e.g., non-parents see empty);
-- no explicit role check needed inside policy expressions.
REVOKE EXECUTE ON FUNCTION fn_my_child_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_my_child_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_my_child_ids() FROM anon;
GRANT  EXECUTE ON FUNCTION fn_my_child_ids() TO   authenticated;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_teacher_student_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY(
    SELECT cs.student_id
      FROM class_student cs
      JOIN class_group   cg ON cg.id = cs.class_id
     WHERE cg.teacher_id = auth_user_id()
  );
$$;
-- Returns empty array for callers without matching role (e.g., non-teachers see empty);
-- no explicit role check needed inside policy expressions.
REVOKE EXECUTE ON FUNCTION fn_teacher_student_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_teacher_student_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_teacher_student_ids() FROM anon;
GRANT  EXECUTE ON FUNCTION fn_teacher_student_ids() TO   authenticated;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_my_session_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY(
    SELECT id FROM session_record
     WHERE student_id = auth_user_id()
        OR student_id = ANY(fn_my_child_ids())
        OR student_id = ANY(fn_teacher_student_ids())
        OR (auth_role() = 'org_admin' AND tenant_id = auth_tenant_id())
        OR auth_role() = 'platform_admin'
  );
$$;
-- Returns session ids accessible to the calling user across all 5 access paths
-- (student-self, parent-of-student, teacher-of-student, org_admin, platform_admin).
-- Use for tables with session_id but no student_id column.
-- SECURITY DEFINER: accesses RLS-enabled session_record bypassing caller's RLS.
-- Migration runner (postgres) must have unrestricted access to session_record.
REVOKE EXECUTE ON FUNCTION fn_my_session_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_my_session_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_my_session_ids() FROM anon;
GRANT  EXECUTE ON FUNCTION fn_my_session_ids() TO   authenticated;

-- =============================================================================
-- SECTION 4 — Atomic response write function
-- Per Arch §2.7 + ADR-0011: SECURITY DEFINER required because the function
-- performs UPDATE on session_record (students have no UPDATE policy) and
-- INSERT into response_telemetry (Pattern G — no authenticated INSERT).
-- Per ADR-0008: double REVOKE + GRANT.
-- =============================================================================

CREATE OR REPLACE FUNCTION create_session_response_atomic(
  p_session_id        uuid,
  p_expected_version  int,
  p_item_id           uuid,
  p_response_data     jsonb,
  p_is_correct        boolean,
  p_score             real,
  p_difficulty        real,
  p_telemetry         jsonb,
  p_guess_probability real,
  p_answer_changes    int
)
RETURNS TABLE(response_id uuid, event_id uuid, new_sequence int, new_version int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student_id uuid;
  v_tenant_id  uuid;
  v_skill_id   uuid;
  v_next_seq   int;
  v_new_version int;
  v_resp_id    uuid;
  v_event_id   uuid;
BEGIN
  -- 1. Atomically bump items_answered counter + version; row lock enforces serialisation
  UPDATE session_record
     SET items_answered = items_answered + 1,
         version        = version + 1,
         updated_at     = now()
   WHERE id      = p_session_id
     AND status  = 'active'
     AND version = p_expected_version
  RETURNING items_answered, version, student_id, tenant_id
    INTO v_next_seq, v_new_version, v_student_id, v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Derive primary skill from item (skill_ids[1] may be NULL if item has no skills)
  SELECT skill_ids[1] INTO v_skill_id FROM item WHERE id = p_item_id;

  -- 3. Write session_response (immutable — no UPDATE policy; only written here)
  INSERT INTO session_response (
    session_id, item_id, student_id, tenant_id,
    sequence_number, response_data, is_correct,
    score, difficulty_at_response
  ) VALUES (
    p_session_id, p_item_id, v_student_id, v_tenant_id,
    v_next_seq, p_response_data, p_is_correct,
    p_score, p_difficulty
  ) RETURNING id INTO v_resp_id;

  -- 4. Write response_telemetry (Pattern G — only written via this function)
  INSERT INTO response_telemetry (
    response_id, time_to_answer_ms, time_to_first_action_ms,
    answer_changes, items_since_session_start, time_since_session_start_ms,
    skipped_then_returned, scroll_to_bottom
  ) VALUES (
    v_resp_id,
    (p_telemetry->>'time_to_answer_ms')::int,
    (p_telemetry->>'time_to_first_action_ms')::int,
    p_answer_changes,
    (p_telemetry->>'items_since_session_start')::int,
    (p_telemetry->>'time_since_session_start_ms')::int,
    COALESCE((p_telemetry->>'skipped_then_returned')::boolean, false),
    (p_telemetry->>'scroll_to_bottom')::boolean
  );

  -- 5. Write learning_event (only written via this function for answer events)
  INSERT INTO learning_event (
    student_id, tenant_id, session_id, item_id, skill_id,
    event_type, correctness, score, duration_ms,
    difficulty_at_event, metadata, sequence_number
  ) VALUES (
    v_student_id, v_tenant_id, p_session_id, p_item_id, v_skill_id,
    'answer', p_is_correct, p_score,
    (p_telemetry->>'time_to_answer_ms')::int,
    p_difficulty,
    jsonb_build_object(
      'response_data',     p_response_data,
      'answer_changes',    p_answer_changes,
      'guess_probability', p_guess_probability
    ),
    v_next_seq
  ) RETURNING id INTO v_event_id;

  RETURN QUERY SELECT v_resp_id, v_event_id, v_next_seq, v_new_version;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_session_response_atomic(uuid, int, uuid, jsonb, boolean, real, real, jsonb, real, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_session_response_atomic(uuid, int, uuid, jsonb, boolean, real, real, jsonb, real, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_session_response_atomic(uuid, int, uuid, jsonb, boolean, real, real, jsonb, real, int) FROM anon;
GRANT  EXECUTE ON FUNCTION create_session_response_atomic(uuid, int, uuid, jsonb, boolean, real, real, jsonb, real, int) TO   authenticated;

-- =============================================================================
-- SECTION 5 — RLS on 7 new tables
-- Per ADR-0011: Pattern A applied to tables with student_id + tenant_id.
-- No student INSERT on session_response, response_telemetry, learning_event —
-- all writes go through create_session_response_atomic (function-only path).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- session_record: Pattern A — student INSERT + SELECT; no student UPDATE/DELETE
-- ---------------------------------------------------------------------------
ALTER TABLE session_record ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sr_student_insert" ON session_record FOR INSERT
  WITH CHECK (auth_role() = 'student'
              AND student_id = auth_user_id()
              AND tenant_id  = auth_tenant_id());

CREATE POLICY "sr_student_select" ON session_record FOR SELECT
  USING (auth_role() = 'student' AND student_id = auth_user_id());

CREATE POLICY "sr_parent_select" ON session_record FOR SELECT
  USING (auth_role() = 'parent' AND student_id = ANY(fn_my_child_ids()));

CREATE POLICY "sr_teacher_select" ON session_record FOR SELECT
  USING (auth_role() IN ('teacher', 'tutor')
         AND student_id = ANY(fn_teacher_student_ids()));

CREATE POLICY "sr_org_admin" ON session_record FOR ALL
  USING (auth_role() = 'org_admin' AND tenant_id = auth_tenant_id());

CREATE POLICY "sr_platform_admin" ON session_record FOR ALL
  USING (auth_role() = 'platform_admin');

-- ---------------------------------------------------------------------------
-- session_response: Pattern A — student SELECT only; no student INSERT (ADR-0011)
-- ---------------------------------------------------------------------------
ALTER TABLE session_response ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sresp_student_select" ON session_response FOR SELECT
  USING (auth_role() = 'student' AND student_id = auth_user_id());

CREATE POLICY "sresp_parent_select" ON session_response FOR SELECT
  USING (auth_role() = 'parent' AND student_id = ANY(fn_my_child_ids()));

CREATE POLICY "sresp_teacher_select" ON session_response FOR SELECT
  USING (auth_role() IN ('teacher', 'tutor')
         AND student_id = ANY(fn_teacher_student_ids()));

CREATE POLICY "sresp_org_admin" ON session_response FOR ALL
  USING (auth_role() = 'org_admin' AND tenant_id = auth_tenant_id());

CREATE POLICY "sresp_platform_admin" ON session_response FOR ALL
  USING (auth_role() = 'platform_admin');

-- ---------------------------------------------------------------------------
-- response_telemetry: Pattern G — deny all authenticated; service role bypasses
-- ---------------------------------------------------------------------------
ALTER TABLE response_telemetry ENABLE ROW LEVEL SECURITY;
-- No policies. All writes via create_session_response_atomic (SECURITY DEFINER).

-- ---------------------------------------------------------------------------
-- session_checkpoint: Pattern A via fn_my_session_ids (FOR ALL covers autosave UPSERT)
-- ---------------------------------------------------------------------------
ALTER TABLE session_checkpoint ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sc_access" ON session_checkpoint FOR ALL
  USING (session_id = ANY(fn_my_session_ids()));

-- ---------------------------------------------------------------------------
-- learning_event: Pattern A — student SELECT only; no student INSERT (ADR-0011)
-- Partition: policy on parent applies to all partitions.
-- ---------------------------------------------------------------------------
ALTER TABLE learning_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY "le_student_select" ON learning_event FOR SELECT
  USING (auth_role() = 'student' AND student_id = auth_user_id());

CREATE POLICY "le_parent_select" ON learning_event FOR SELECT
  USING (auth_role() = 'parent' AND student_id = ANY(fn_my_child_ids()));

CREATE POLICY "le_teacher_select" ON learning_event FOR SELECT
  USING (auth_role() IN ('teacher', 'tutor')
         AND student_id = ANY(fn_teacher_student_ids()));

CREATE POLICY "le_org_admin" ON learning_event FOR ALL
  USING (auth_role() = 'org_admin' AND tenant_id = auth_tenant_id());

CREATE POLICY "le_platform_admin" ON learning_event FOR ALL
  USING (auth_role() = 'platform_admin');

-- ---------------------------------------------------------------------------
-- api_idempotency_key: Pattern G — deny all authenticated; service role bypasses
-- ---------------------------------------------------------------------------
ALTER TABLE api_idempotency_key ENABLE ROW LEVEL SECURITY;
-- No policies.

-- ---------------------------------------------------------------------------
-- outbox_event: Pattern G — deny all authenticated; service role bypasses
-- ---------------------------------------------------------------------------
ALTER TABLE outbox_event ENABLE ROW LEVEL SECURITY;
-- No policies.

-- =============================================================================
-- SECTION 6 — UTA per-role SELECT extension (ADR-0004 obligation)
-- Replaces Stage 2 minimal tenant-isolation policies with per-role granularity.
-- Runs inside this migration's transaction — no inconsistency window.
-- Down migration restores original broad policies verbatim.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- user_profile: DROP broad up_tenant_select; add per-role policies
-- Stage 2 had: FOR SELECT USING (tenant_id = auth_tenant_id())
-- ---------------------------------------------------------------------------
DROP POLICY "up_tenant_select" ON user_profile;

CREATE POLICY "up_student_self" ON user_profile FOR SELECT
  USING (auth_role() = 'student' AND id = auth_user_id());

CREATE POLICY "up_parent_select" ON user_profile FOR SELECT
  USING (auth_role() = 'parent'
         AND (id = auth_user_id() OR id = ANY(fn_my_child_ids())));

CREATE POLICY "up_teacher_select" ON user_profile FOR SELECT
  USING (auth_role() IN ('teacher', 'tutor')
         AND (id = auth_user_id() OR id = ANY(fn_teacher_student_ids())));

CREATE POLICY "up_org_admin" ON user_profile FOR ALL
  USING (auth_role() = 'org_admin' AND tenant_id = auth_tenant_id());

CREATE POLICY "up_platform_admin" ON user_profile FOR ALL
  USING (auth_role() = 'platform_admin');

-- ---------------------------------------------------------------------------
-- parent_student_link: DROP broad psl_tenant_select; add per-role policies
-- Stage 2 had: FOR SELECT USING (fn_user_in_my_tenant(parent_id))
-- ---------------------------------------------------------------------------
DROP POLICY "psl_tenant_select" ON parent_student_link;

CREATE POLICY "psl_parent_select" ON parent_student_link FOR SELECT
  USING (auth_role() = 'parent' AND parent_id = auth_user_id());

CREATE POLICY "psl_org_admin" ON parent_student_link FOR ALL
  USING (auth_role() = 'org_admin' AND fn_user_in_my_tenant(parent_id));

CREATE POLICY "psl_platform_admin" ON parent_student_link FOR ALL
  USING (auth_role() = 'platform_admin');

-- ---------------------------------------------------------------------------
-- class_group: DROP broad cg_tenant_select; add per-role policies
-- Stage 2 had: FOR SELECT USING (tenant_id = auth_tenant_id())
-- ---------------------------------------------------------------------------
DROP POLICY "cg_tenant_select" ON class_group;

CREATE POLICY "cg_teacher_select" ON class_group FOR SELECT
  USING (auth_role() IN ('teacher', 'tutor') AND teacher_id = auth_user_id());

CREATE POLICY "cg_org_admin" ON class_group FOR ALL
  USING (auth_role() = 'org_admin' AND tenant_id = auth_tenant_id());

CREATE POLICY "cg_platform_admin" ON class_group FOR ALL
  USING (auth_role() = 'platform_admin');

-- ---------------------------------------------------------------------------
-- class_student: DROP broad cs_tenant_select; add per-role policies
-- Stage 2 had: FOR SELECT USING (fn_class_in_my_tenant(class_id))
-- ---------------------------------------------------------------------------
DROP POLICY "cs_tenant_select" ON class_student;

CREATE POLICY "cs_teacher_select" ON class_student FOR SELECT
  USING (auth_role() IN ('teacher', 'tutor')
         AND student_id = ANY(fn_teacher_student_ids()));

CREATE POLICY "cs_org_admin" ON class_student FOR ALL
  USING (auth_role() = 'org_admin' AND fn_class_in_my_tenant(class_id));

CREATE POLICY "cs_platform_admin" ON class_student FOR ALL
  USING (auth_role() = 'platform_admin');
