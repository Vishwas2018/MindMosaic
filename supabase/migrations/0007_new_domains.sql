-- =============================================================================
-- Migration 0007 — New Domains: Assignments + Billing + Engagement + Notifications
-- Stage 8 · 2026-05-03
-- Implements: Arch §2.11, §2.12, §2.13, §2.14
-- ADRs: ADR-0015 (Pattern G for no-v1-writer tables)
--        ADR-0016 (service-owned state machine; no DB state-transition triggers)
-- Enums used: assignment_status, assignment_session_status, subscription_tier,
--   invoice_status, achievement_tier, notification_type (all in 0001)
-- plan_type enum in 0001 is for learning_plan; not used here.
--
-- session_record.assignment_id FK:
--   Column added without FK in 0004 (see 0004 header). FK added here when
--   assignment table is created. Constraint name: fk_session_assignment.
--
-- Triple REVOKE pattern (A1 correction, Stage 8):
--   REVOKE FROM PUBLIC; REVOKE FROM authenticated; REVOKE FROM anon
--   (prior "PUBLIC×2 + anon" pattern in 0004 was wrong — second PUBLIC was a no-op)
--
-- RLS patterns:
--   assignment        — Pattern A (3 SELECT policies; no INSERT from client JWT)
--   assignment_target — Pattern G (service_role only; SECURITY DEFINER bypasses for helper)
--   assignment_session — Pattern A (3 SELECT policies)
--   subscription, billing_customer, invoice, billing_event — Pattern G (ADR-0015)
--   engagement_streak, achievement_definition, student_achievement — Pattern G (ADR-0015)
--   notification — Pattern E (FOR ALL: self-read + self-update via USING + WITH CHECK)
-- =============================================================================

-- =============================================================================
-- SECTION 1 — Tables (FK dependency order)
-- fn_my_assignment_ids() is in Section 2 (after assignment_target is created —
-- LANGUAGE sql validates body against current schema at CREATE time).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- §2.11 — Assignments
-- ---------------------------------------------------------------------------

CREATE TABLE assignment (
  id               uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid               NOT NULL REFERENCES tenant(id)       ON DELETE CASCADE,
  created_by       uuid               NOT NULL REFERENCES user_profile(id) ON DELETE RESTRICT,
  title            text               NOT NULL,
  description      text,
  mode             session_mode       NOT NULL,
  target_skill_ids uuid[]             NOT NULL CHECK (array_length(target_skill_ids, 1) >= 1),
  difficulty_range jsonb,
  item_count       int                NOT NULL CHECK (item_count > 0),
  time_limit_ms    int,
  due_at           timestamptz,
  status           assignment_status  NOT NULL DEFAULT 'draft',
  auto_generated   boolean            NOT NULL DEFAULT false,
  rationale        text,
  created_at       timestamptz        NOT NULL DEFAULT now(),
  updated_at       timestamptz        NOT NULL DEFAULT now(),
  published_at     timestamptz,
  archived_at      timestamptz
);

CREATE INDEX idx_asg_tenant  ON assignment(tenant_id);
CREATE INDEX idx_asg_creator ON assignment(created_by, status);

-- ---------------------------------------------------------------------------

CREATE TABLE assignment_target (
  assignment_id uuid        NOT NULL REFERENCES assignment(id)   ON DELETE CASCADE,
  student_id    uuid                 REFERENCES user_profile(id) ON DELETE CASCADE,
  class_id      uuid                 REFERENCES class_group(id)  ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((student_id IS NOT NULL) <> (class_id IS NOT NULL)),
  UNIQUE (assignment_id, student_id, class_id)
);

CREATE INDEX idx_asg_target_student ON assignment_target(student_id);
CREATE INDEX idx_asg_target_class   ON assignment_target(class_id);

-- ---------------------------------------------------------------------------

CREATE TABLE assignment_session (
  assignment_id uuid                      NOT NULL REFERENCES assignment(id)   ON DELETE CASCADE,
  student_id    uuid                      NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id     uuid                      NOT NULL REFERENCES tenant(id)       ON DELETE CASCADE,
  session_id    uuid                               REFERENCES session_record(id) ON DELETE SET NULL,
  status        assignment_session_status NOT NULL DEFAULT 'pending',
  completed_at  timestamptz,
  created_at    timestamptz               NOT NULL DEFAULT now(),
  updated_at    timestamptz               NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, student_id)
);

CREATE INDEX idx_asg_session_student ON assignment_session(student_id, status);

-- Forward-reference FK from session_record.assignment_id (column added in 0004 without FK)
ALTER TABLE session_record
  ADD CONSTRAINT fk_session_assignment
  FOREIGN KEY (assignment_id) REFERENCES assignment(id) ON DELETE SET NULL;

-- =============================================================================
-- SECTION 2 — SECURITY DEFINER helper: fn_my_assignment_ids()
-- Created after assignment_target (LANGUAGE sql validates body at CREATE time).
-- Returns all assignment IDs visible to the calling student:
--   Branch 1: assignment directly targeted at student (student_id match)
--   Branch 2: assignment targeted at a class the student belongs to
-- Used by: assignment Pattern A student_select policy.
-- A1 triple REVOKE: PUBLIC + authenticated + anon (Stage 8 correction).
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_my_assignment_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY(
    SELECT DISTINCT at.assignment_id
    FROM   assignment_target at
    WHERE  at.student_id = auth_user_id()
    UNION
    SELECT DISTINCT at2.assignment_id
    FROM   assignment_target at2
    JOIN   class_student cs ON cs.class_id = at2.class_id
    WHERE  cs.student_id = auth_user_id()
  );
$$;

REVOKE EXECUTE ON FUNCTION fn_my_assignment_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_my_assignment_ids() FROM authenticated;
REVOKE EXECUTE ON FUNCTION fn_my_assignment_ids() FROM anon;
GRANT  EXECUTE ON FUNCTION fn_my_assignment_ids() TO   authenticated;

-- ---------------------------------------------------------------------------
-- §2.12 — Billing (Pattern G — ADR-0015; Stripe activation deferred to Stage 42)
-- ---------------------------------------------------------------------------

CREATE TABLE subscription (
  id                     uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid               NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  tier                   subscription_tier  NOT NULL DEFAULT 'free',
  stripe_subscription_id text               UNIQUE,
  started_at             timestamptz        NOT NULL DEFAULT now(),
  current_period_end     timestamptz,
  cancel_at              timestamptz,
  canceled_at            timestamptz,
  is_active              boolean            NOT NULL DEFAULT true,
  config                 jsonb              NOT NULL DEFAULT '{}',
  created_at             timestamptz        NOT NULL DEFAULT now(),
  updated_at             timestamptz        NOT NULL DEFAULT now()
);

-- Partial unique: only one active subscription per tenant
CREATE UNIQUE INDEX idx_sub_active_per_tenant ON subscription(tenant_id) WHERE is_active = true;

-- ---------------------------------------------------------------------------

CREATE TABLE billing_customer (
  tenant_id              uuid        PRIMARY KEY REFERENCES tenant(id) ON DELETE RESTRICT,
  stripe_customer_id     text        UNIQUE NOT NULL,
  default_payment_method text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------

CREATE TABLE invoice (
  id                 uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid            NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  stripe_invoice_id  text            UNIQUE NOT NULL,
  amount_cents       int             NOT NULL,
  currency           text            NOT NULL DEFAULT 'AUD',
  status             invoice_status  NOT NULL,
  hosted_invoice_url text,
  invoice_pdf_url    text,
  invoiced_at        timestamptz     NOT NULL,
  paid_at            timestamptz,
  created_at         timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_tenant ON invoice(tenant_id, invoiced_at DESC);

-- ---------------------------------------------------------------------------

CREATE TABLE billing_event (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        REFERENCES tenant(id) ON DELETE SET NULL,
  stripe_event_id  text        UNIQUE NOT NULL,
  event_type       text        NOT NULL,
  payload          jsonb       NOT NULL,
  processed_at     timestamptz,
  processing_error text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Partial index: unprocessed events for dispatcher polling
CREATE INDEX idx_be_unprocessed ON billing_event(created_at) WHERE processed_at IS NULL;

-- ---------------------------------------------------------------------------
-- §2.13 — Engagement (Pattern G — ADR-0015; engagement worker owns writes)
-- ---------------------------------------------------------------------------

CREATE TABLE engagement_streak (
  student_id       uuid        PRIMARY KEY REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id        uuid        NOT NULL REFERENCES tenant(id)          ON DELETE CASCADE,
  current_days     int         NOT NULL DEFAULT 0,
  best_days        int         NOT NULL DEFAULT 0,
  last_active_date date,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------

CREATE TABLE achievement_definition (
  id          uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text             UNIQUE NOT NULL,
  name        text             NOT NULL,
  description text,
  criteria    jsonb            NOT NULL,
  tier        achievement_tier NOT NULL,
  icon        text,
  created_at  timestamptz      NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------

CREATE TABLE student_achievement (
  student_id     uuid        NOT NULL REFERENCES user_profile(id)          ON DELETE CASCADE,
  achievement_id uuid        NOT NULL REFERENCES achievement_definition(id) ON DELETE RESTRICT,
  tenant_id      uuid        NOT NULL REFERENCES tenant(id)                ON DELETE CASCADE,
  earned_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, achievement_id)
);

CREATE INDEX idx_sa_student_time ON student_achievement(student_id, earned_at DESC);

-- ---------------------------------------------------------------------------
-- §2.14 — Notifications (Pattern E — FOR ALL self-owned; no updated_at per arch)
-- ---------------------------------------------------------------------------

CREATE TABLE notification (
  id         uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid              NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id  uuid              NOT NULL REFERENCES tenant(id)       ON DELETE CASCADE,
  type       notification_type NOT NULL,
  title      text              NOT NULL,
  body       text              NOT NULL,
  link       text,
  read_at    timestamptz,
  metadata   jsonb             NOT NULL DEFAULT '{}',
  created_at timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_user_unread ON notification(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_notif_user_all    ON notification(user_id, created_at DESC);

-- =============================================================================
-- SECTION 3 — updated_at triggers (mutable tables only)
-- Pattern G tables still get triggers for service-layer correctness (ADR-0016).
-- invoice, billing_event, assignment_target, achievement_definition,
-- student_achievement, notification have no updated_at column — no trigger.
-- =============================================================================

CREATE TRIGGER trg_assignment_updated_at
  BEFORE UPDATE ON assignment
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_assignment_session_updated_at
  BEFORE UPDATE ON assignment_session
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_subscription_updated_at
  BEFORE UPDATE ON subscription
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_billing_customer_updated_at
  BEFORE UPDATE ON billing_customer
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_engagement_streak_updated_at
  BEFORE UPDATE ON engagement_streak
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- SECTION 4 — Row-Level Security
-- =============================================================================

-- assignment: Pattern A
ALTER TABLE assignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY asg_student_select ON assignment
  FOR SELECT TO authenticated
  USING (auth_role() = 'student' AND id = ANY(fn_my_assignment_ids()));

CREATE POLICY asg_staff_select ON assignment
  FOR SELECT TO authenticated
  USING (auth_role() IN ('teacher', 'tutor', 'org_admin') AND tenant_id = auth_tenant_id());

CREATE POLICY asg_padmin_select ON assignment
  FOR SELECT TO authenticated
  USING (auth_role() = 'platform_admin');

-- assignment_target: Pattern G (fn_my_assignment_ids is SECURITY DEFINER — bypasses RLS)
ALTER TABLE assignment_target ENABLE ROW LEVEL SECURITY;

-- assignment_session: Pattern A
ALTER TABLE assignment_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY asg_session_student_select ON assignment_session
  FOR SELECT TO authenticated
  USING (auth_role() = 'student' AND student_id = auth_user_id() AND tenant_id = auth_tenant_id());

CREATE POLICY asg_session_staff_select ON assignment_session
  FOR SELECT TO authenticated
  USING (auth_role() IN ('teacher', 'tutor', 'org_admin') AND tenant_id = auth_tenant_id());

CREATE POLICY asg_session_padmin_select ON assignment_session
  FOR SELECT TO authenticated
  USING (auth_role() = 'platform_admin');

-- Billing — Pattern G
ALTER TABLE subscription      ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_customer  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice            ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_event      ENABLE ROW LEVEL SECURITY;

-- Engagement — Pattern G
ALTER TABLE engagement_streak     ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievement_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_achievement    ENABLE ROW LEVEL SECURITY;

-- notification: Pattern E — FOR ALL (SELECT + UPDATE via USING; INSERT via WITH CHECK)
-- PATCH /notifications/{id}/read uses user Bearer JWT → goes through RLS → needs UPDATE policy.
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_own ON notification
  FOR ALL TO authenticated
  USING  (user_id = auth_user_id())
  WITH CHECK (user_id = auth_user_id());
