-- =============================================================================
-- Migration 0003 — Assessment Configuration
-- Stage 4 · 2026-05-02
-- Implements: DEV_PLAN.md Stage 4; Arch §2.4
-- Spec refs: Spec §2–§4, §6; Arch §2.4
-- ADRs: ADR-0009 (platform-catalog tables: platform_admin write-only;
--               table-classification heuristic for Stages 5–10)
-- Note: framework_config.blueprint (jsonb) is an embedded distribution
--       template; the separate blueprint table holds specific profile
--       instances. Names collide by arch design — both columns and table
--       exist verbatim per Arch §2.4.
-- Note: pathway.required_feature_key — convention for free-tier pathways
--       deferred to Stage 14. See Stage 14 forward-flag in DAILY_LOG.md.
-- =============================================================================

-- =============================================================================
-- SECTION 1 — Tables
-- FK dependency order within this migration:
--   framework_config        (no FK deps within migration)
--   blueprint               (no FK deps within migration)
--   pathway                 (→ framework_config)
--   assessment_profile      (→ framework_config, → blueprint)
--   diagnostic_rule         (→ skill_node from Migration 0002)
-- =============================================================================

CREATE TABLE framework_config (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_family       exam_family NOT NULL,
  version           text    NOT NULL,
  structure         jsonb   NOT NULL,
  adaptive_rules    jsonb,
  scoring_rules     jsonb   NOT NULL,
  constraints       jsonb   NOT NULL DEFAULT '{}',
  difficulty_bands  jsonb   NOT NULL,
  -- embedded default content-distribution template for this exam family
  blueprint         jsonb   NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_fc_family_version ON framework_config(exam_family, version);

-- ---------------------------------------------------------------------------

CREATE TABLE blueprint (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  sections   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------

CREATE TABLE pathway (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 text        NOT NULL UNIQUE,
  display_name         text        NOT NULL,
  exam_family          exam_family NOT NULL,
  program              text        NOT NULL,
  country              text        NOT NULL DEFAULT 'AU',
  curriculum           text        NOT NULL DEFAULT 'australian_curriculum_v9',
  framework_config_id  uuid        NOT NULL REFERENCES framework_config(id) ON DELETE RESTRICT,
  engine_type          engine_type NOT NULL,
  year_levels          int[]       NOT NULL,
  required_feature_key text        NOT NULL,
  is_active            boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- DEV_PLAN Stage 4 exit criterion: required_feature_key present + indexed
CREATE INDEX idx_pathway_feature_key ON pathway(required_feature_key);

-- ---------------------------------------------------------------------------

CREATE TABLE assessment_profile (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_family          exam_family NOT NULL,
  program              text        NOT NULL,
  year_level           int         NOT NULL,
  version              text        NOT NULL,
  framework_config_id  uuid        NOT NULL REFERENCES framework_config(id) ON DELETE RESTRICT,
  blueprint_id         uuid        NOT NULL REFERENCES blueprint(id) ON DELETE RESTRICT,
  duration_minutes     int         NOT NULL,
  is_active            boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------

CREATE TABLE diagnostic_rule (
  id                    uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id              uuid  NOT NULL REFERENCES skill_node(id) ON DELETE CASCADE,
  condition             jsonb NOT NULL,
  action                text  NOT NULL CHECK (action IN (
                          'classify_proficient',
                          'classify_developing',
                          'probe_deeper',
                          'probe_prerequisite'
                        )),
  next_skill_id         uuid  REFERENCES skill_node(id) ON DELETE SET NULL,
  next_difficulty_delta real  DEFAULT 0.0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- SECTION 2 — RLS (Pattern F + ADR-0009: platform_admin write-only)
--
-- All 5 tables: ENABLE ROW LEVEL SECURITY (no FORCE — service_role bypasses).
-- No SECURITY DEFINER helpers required (no cross-table predicates).
-- No authenticated write policies for org_admin per ADR-0009: assessment
-- configuration is platform-level catalog; org_admin is tenant-scoped.
--
-- SELECT filter:
--   pathway, assessment_profile → USING (is_active = true)
--   framework_config, blueprint, diagnostic_rule → USING (true)
-- =============================================================================

-- ---- framework_config ----

ALTER TABLE framework_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fc_read"         ON framework_config FOR SELECT
  USING (true);
CREATE POLICY "fc_insert_admin" ON framework_config FOR INSERT
  WITH CHECK (auth_role() = 'platform_admin');
CREATE POLICY "fc_update_admin" ON framework_config FOR UPDATE
  USING (auth_role() = 'platform_admin');
CREATE POLICY "fc_delete_admin" ON framework_config FOR DELETE
  USING (auth_role() = 'platform_admin');

-- ---- blueprint ----

ALTER TABLE blueprint ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bp_read"         ON blueprint FOR SELECT
  USING (true);
CREATE POLICY "bp_insert_admin" ON blueprint FOR INSERT
  WITH CHECK (auth_role() = 'platform_admin');
CREATE POLICY "bp_update_admin" ON blueprint FOR UPDATE
  USING (auth_role() = 'platform_admin');
CREATE POLICY "bp_delete_admin" ON blueprint FOR DELETE
  USING (auth_role() = 'platform_admin');

-- ---- pathway (is_active filter) ----

ALTER TABLE pathway ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pw_read"         ON pathway FOR SELECT
  USING (is_active = true);
CREATE POLICY "pw_insert_admin" ON pathway FOR INSERT
  WITH CHECK (auth_role() = 'platform_admin');
CREATE POLICY "pw_update_admin" ON pathway FOR UPDATE
  USING (auth_role() = 'platform_admin');
CREATE POLICY "pw_delete_admin" ON pathway FOR DELETE
  USING (auth_role() = 'platform_admin');

-- ---- assessment_profile (is_active filter) ----

ALTER TABLE assessment_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ap_read"         ON assessment_profile FOR SELECT
  USING (is_active = true);
CREATE POLICY "ap_insert_admin" ON assessment_profile FOR INSERT
  WITH CHECK (auth_role() = 'platform_admin');
CREATE POLICY "ap_update_admin" ON assessment_profile FOR UPDATE
  USING (auth_role() = 'platform_admin');
CREATE POLICY "ap_delete_admin" ON assessment_profile FOR DELETE
  USING (auth_role() = 'platform_admin');

-- ---- diagnostic_rule ----

ALTER TABLE diagnostic_rule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dr_read"         ON diagnostic_rule FOR SELECT
  USING (true);
CREATE POLICY "dr_insert_admin" ON diagnostic_rule FOR INSERT
  WITH CHECK (auth_role() = 'platform_admin');
CREATE POLICY "dr_update_admin" ON diagnostic_rule FOR UPDATE
  USING (auth_role() = 'platform_admin');
CREATE POLICY "dr_delete_admin" ON diagnostic_rule FOR DELETE
  USING (auth_role() = 'platform_admin');
