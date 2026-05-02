-- =============================================================================
-- Down migration 0004 — Sessions + Canonical Events
-- Reverses 0004_sessions_events.sql in full dependency order.
-- UTA extension: drops per-role policies and restores Stage 2 broad policies verbatim.
-- Order: tables → UTA policy restore → functions
-- (UTA policies on surviving tables reference helpers; must drop policies before fns)
-- =============================================================================

-- Drop new tables (reverse FK order)
DROP TABLE IF EXISTS learning_event;        -- partitioned; drops learning_event_default
DROP TABLE IF EXISTS session_checkpoint;
DROP TABLE IF EXISTS response_telemetry;
DROP TABLE IF EXISTS session_response;
DROP TABLE IF EXISTS outbox_event;
DROP TABLE IF EXISTS api_idempotency_key;
DROP TABLE IF EXISTS session_record;

-- Restore UTA Stage 2 minimal tenant-isolation policies (verbatim from 0001)
-- Must run BEFORE dropping helper functions (policies reference fn_my_child_ids,
-- fn_teacher_student_ids; those policies live on tables not dropped above).
DROP POLICY IF EXISTS "up_student_self"    ON user_profile;
DROP POLICY IF EXISTS "up_parent_select"   ON user_profile;
DROP POLICY IF EXISTS "up_teacher_select"  ON user_profile;
DROP POLICY IF EXISTS "up_org_admin"       ON user_profile;
DROP POLICY IF EXISTS "up_platform_admin"  ON user_profile;
CREATE POLICY "up_tenant_select" ON user_profile
  FOR SELECT USING (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS "psl_parent_select"  ON parent_student_link;
DROP POLICY IF EXISTS "psl_org_admin"      ON parent_student_link;
DROP POLICY IF EXISTS "psl_platform_admin" ON parent_student_link;
CREATE POLICY "psl_tenant_select" ON parent_student_link
  FOR SELECT USING (fn_user_in_my_tenant(parent_id));

DROP POLICY IF EXISTS "cg_teacher_select"  ON class_group;
DROP POLICY IF EXISTS "cg_org_admin"       ON class_group;
DROP POLICY IF EXISTS "cg_platform_admin"  ON class_group;
CREATE POLICY "cg_tenant_select" ON class_group
  FOR SELECT USING (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS "cs_teacher_select"  ON class_student;
DROP POLICY IF EXISTS "cs_org_admin"       ON class_student;
DROP POLICY IF EXISTS "cs_platform_admin"  ON class_student;
CREATE POLICY "cs_tenant_select" ON class_student
  FOR SELECT USING (fn_class_in_my_tenant(class_id));

-- Drop functions (now safe: no surviving policies reference them)
DROP FUNCTION IF EXISTS create_session_response_atomic(uuid, int, uuid, jsonb, boolean, real, real, jsonb, real, int);
DROP FUNCTION IF EXISTS fn_my_session_ids();
DROP FUNCTION IF EXISTS fn_teacher_student_ids();
DROP FUNCTION IF EXISTS fn_my_child_ids();
