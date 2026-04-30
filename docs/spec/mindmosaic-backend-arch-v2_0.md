# MindMosaic — Backend Architecture v2.0

**Derived From:** Master Product Specification v4.3, Backend Architecture v1.2, Execution Review
**Target Stack:** Supabase (PostgreSQL 15+) · Deno Edge Functions · Vercel · Turborepo · Stripe
**Last Updated:** April 2026
**Supersedes:** v1.2
**Status:** Implementation-Ready — all identified gaps closed

### v2.0 Change Log

| # | Change | Source Issue |
|---|---|---|
| 1 | Added Assignments domain (schema + service + RLS) | Gap C1 |
| 2 | Added Billing domain (Stripe integration, invoice, webhook ingestion) | Gap H10 |
| 3 | Added Engagement domain (streaks, achievements) | Gap H9 |
| 4 | Added Notifications domain | Gap M9 |
| 5 | Added `admin_action_log` audit table | Gap 3.6 |
| 6 | Added Plan Overrides (`plan_override`) for pin/dismiss | Gap M8 |
| 7 | Corrected `session_record` optimistic locking — checkpoint no longer bumps version | Gap C3 |
| 8 | Mandated cached skill graph in Edge Function module scope + split L3 Causal into sync-scoped and async-full | Gap C2 |
| 9 | Required draft-graph-version + publish flow; removed in-place edge edits | Gap C4 |
| 10 | Added `v_item_current` view for current-version item reads | Gap C5 |
| 11 | Added repair concurrency constraints (partial unique index + advisory lock) | Gap C7 |
| 12 | Atomic session write via SQL function `create_session_response_atomic()` | Gap H1 |
| 13 | Corrected checkpoint dedup key to `(session_id, item_id, sequence_number)` | Gap H2 |
| 14 | Planned-item list persisted in `engine_state_snapshot.planned_items` | Gap H3 |
| 15 | Replaced magic-UUID feature flag index with two partial unique indexes | Gap H4 |
| 16 | Defined cold storage archive for `intelligence_audit_log` | Gap H5 |
| 17 | Added admin dead-letter management endpoints | Gap H6 |
| 18 | Added OpenTelemetry tracing contract | Gap H7 |
| 19 | Added `SessionSummaryDTO` and `/sessions/recent` | Gap H8 |
| 20 | Added pathway catalog endpoint `/pathways` with entitlement filter | Gap H11 |
| 21 | Transactional outbox pattern for async job dispatch | Gap M5 |
| 22 | Moved rate limiting to `rate_limit_bucket` table | Gap M6 |
| 23 | Mandated tenant isolation CI gate | Gap M7 |
| 24 | Defined additional indexes: `parent_student_link(parent_id)`, `class_student_by_teacher` | Gap C6 |
| 25 | Universal `set_updated_at()` trigger | Gap M2 |
| 26 | Defined `duration_ms` / `active_duration_ms` computation | Gap M3 |
| 27 | Defined misconception + repair cleanup on skill-version migration | Gap M4 |
| 28 | Added per-step idempotency for orchestration job | Arch hardening |
| 29 | Added frontend architecture (Part IV) | New |
| 30 | Added DTO shared-types manifest | Consolidation |

---

## Part I — Conventions & Global Rules

### 1.1 Naming & Identifiers

- All tables, columns, enums, and policies use `snake_case`.
- All UUIDs via `gen_random_uuid()`; no natural keys for transactional tables.
- Timestamps are `timestamptz` with `DEFAULT now()`.
- Booleans default explicitly.
- Every mutable table has `created_at` and `updated_at`; `updated_at` is maintained by a trigger (§1.6).

### 1.2 Ownership Rules (Writer Matrix — Authoritative)

Each table has one owning service. No other service writes to it directly — all writes must go through the owner's API or an explicit SQL function exposed by the owner. Reads are open per RLS.

| Domain | Owning Service | Tables It Writes |
|---|---|---|
| UTA | `auth-svc`, `users-svc` | `tenant`, `user_profile`, `parent_student_link`, `class_group`, `class_student`, `feature_flag`, `admin_action_log` |
| CSG | `content-svc` | `skill_graph_version`, `skill_node`, `skill_edge`, `misconception`, `repair_sequence`, `stimulus`, `item`, `item_version`, `pathway`, `framework_config`, `assessment_profile`, `blueprint`, `diagnostic_rule` |
| ASN | `assessment-svc` | `session_record`, `session_response`, `response_telemetry`, `session_checkpoint`, `learning_event`, `api_idempotency_key`, `outbox_event` |
| INT | `intelligence-svc` | `skill_mastery`, `learning_velocity`, `behaviour_profile`, `student_misconception`, `repair_record`, `intelligence_audit_log`, `pipeline_event` |
| ORC | `orchestration-svc` | `learning_plan`, `plan_revision`, `recommendation`, `plan_override` |
| ANL | `analytics-svc` | `intervention_alert`, `cohort_metric_cache` |
| ASG | `assignments-svc` | `assignment`, `assignment_target`, `assignment_session` |
| BIL | `billing-svc` | `subscription`, `billing_customer`, `invoice`, `billing_event` |
| ENG | `engagement-svc` | `engagement_streak`, `achievement_definition`, `student_achievement` |
| NTF | `notifications-svc` | `notification` |
| Platform | `jobs-worker` | `job_queue` (state transitions), `rate_limit_bucket` |

Violating this rule is a merge blocker.

### 1.3 Mutability Rules

| Class | Tables | Rule |
|---|---|---|
| Immutable | `learning_event`, `session_response`, `response_telemetry`, `item_version`, `framework_config`, `skill_node`, `skill_edge` (within a graph version), `billing_event` | Never `UPDATE` or `DELETE` after insert |
| Append-only | `intelligence_audit_log`, `plan_revision`, `admin_action_log`, `outbox_event` | Only `INSERT`; cleanup via retention job |
| Controlled mutable | `session_record`, `learning_plan`, `assignment` | Only specific columns may change; all transitions via owning service; optimistic locking where noted |
| Mutable | `skill_mastery`, `learning_velocity`, `behaviour_profile`, `student_misconception`, `repair_record`, `subscription`, `feature_flag`, `user_profile`, `engagement_streak`, `notification` | Standard `UPDATE` allowed by owner service |

### 1.4 Versioning Strategy

- **API:** Path-based, `/api/v1/...`. Breaking change → new path.
- **DTOs:** Zod schemas in `packages/types` with `SCHEMA_VERSION` constant. Client sends `X-Client-Version`; server logs mismatches.
- **Content:** `item_version` table (append-only).
- **Skill Graph:** `skill_graph_version` with draft→published flow.
- **Learning Plan:** `plan_revision` with diff snapshot.
- **Intelligence algorithms:** Version string stamped in `intelligence_audit_log.input_snapshot.algorithm_version`.

### 1.5 Error Envelope (All Endpoints)

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "status": 0,
    "details": null,
    "trace_id": "string"
  }
}
```

Error code vocabulary (exhaustive):

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod schema failure; `details.fields` populated |
| `UNAUTHENTICATED` | 401 | Missing/invalid JWT |
| `FEATURE_GATED` | 402 | Subscription tier too low; `details.feature_key`, `details.required_tier` |
| `FORBIDDEN` | 403 | Valid JWT, insufficient role |
| `NOT_FOUND` | 404 | Not found or RLS-hidden |
| `SESSION_CONFLICT` | 409 | Session not in expected state; `details.current_state` |
| `VERSION_CONFLICT` | 409 | Optimistic lock failure; `details.expected_version`, `details.actual_version` |
| `ACTIVE_SESSION_EXISTS` | 409 | Student already has active session; `details.active_session_id` |
| `IDEMPOTENCY_IN_FLIGHT` | 409 | Duplicate in-flight request |
| `GONE` | 410 | Resource expired/abandoned |
| `IDEMPOTENCY_MISMATCH` | 422 | Same key, different body |
| `UNPROCESSABLE` | 422 | Semantically invalid |
| `RATE_LIMITED` | 429 | Too many requests; `details.retry_after_ms` |
| `INTERNAL_ERROR` | 500 | Unhandled; logged with `trace_id` |
| `SERVICE_UNAVAILABLE` | 503 | Degraded mode; client should retry |

### 1.6 Universal Trigger: Updated-At

```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applied to every mutable table with an updated_at column:
-- CREATE TRIGGER trg_<table>_updated_at BEFORE UPDATE ON <table>
--   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 1.7 Trace & Observability Contract

Every endpoint:

1. Reads `X-Trace-Id` header; if absent, generates a UUID.
2. Propagates `X-Trace-Id` to all downstream calls (DB, jobs, external APIs).
3. Logs JSON with mandatory fields: `timestamp`, `level`, `service`, `trace_id`, `tenant_id`, `user_id`, `endpoint`, `status_code`, `duration_ms`, `error_code`.
4. **[v1.1 deferred]** Emits OpenTelemetry spans via `@opentelemetry/api` with attributes matching log fields. **In v1**, observability is structured JSON logs only (Supabase + Vercel error dashboard). OTel SDK introduction is tracked under v1.1 backlog item P1.5.
5. Never logs: `response_data`, free-text response content, passwords, Stripe tokens, raw webhook payloads.

### 1.8 Idempotency Contract (Write Endpoints)

All `POST`/`PATCH`/`DELETE` endpoints supporting retry accept `Idempotency-Key: <uuid>`.

Required on: `/sessions/create`, `/sessions/{id}/respond`, `/sessions/{id}/submit`, `/sessions/{id}/checkpoint`, `/assignments`, `/billing/checkout`, `/orchestration/generate-plan`.

Flow defined in §7.3.

---

## Part II — Database Schema

### 2.1 Custom Types

```sql
-- Roles & Auth
CREATE TYPE user_role AS ENUM ('student', 'parent', 'teacher', 'tutor', 'org_admin', 'platform_admin');
CREATE TYPE subscription_tier AS ENUM ('free', 'standard', 'premium', 'institutional');

-- Content
CREATE TYPE skill_level AS ENUM ('domain', 'strand', 'skill', 'subskill');
CREATE TYPE edge_type AS ENUM ('prerequisite', 'related', 'cross_domain');
CREATE TYPE dependency_class AS ENUM ('required', 'supportive', 'enriching');
CREATE TYPE exam_family AS ENUM ('naplan', 'icas', 'selective', 'singapore_math', 'olympiad');
CREATE TYPE response_type AS ENUM ('mcq', 'multi_select', 'short_answer', 'extended_response',
                                    'drag_drop', 'cloze', 'numeric_entry');
CREATE TYPE bloom_level AS ENUM ('remember', 'understand', 'apply', 'analyse', 'evaluate', 'create');
CREATE TYPE stimulus_type AS ENUM ('passage', 'image_set', 'data_table', 'audio_clip', 'video_clip');
CREATE TYPE item_lifecycle AS ENUM ('draft', 'review', 'active', 'monitored', 'retired');
CREATE TYPE misconception_category AS ENUM ('conceptual', 'procedural', 'transfer', 'careless', 'guessing');
CREATE TYPE misconception_severity AS ENUM ('minor', 'moderate', 'critical');
CREATE TYPE graph_version_status AS ENUM ('draft', 'published', 'archived');

-- Session & Engine
CREATE TYPE engine_type AS ENUM ('adaptive', 'linear', 'skill', 'diagnostic', 'repair');
CREATE TYPE session_mode AS ENUM ('exam', 'practice', 'diagnostic', 'skill_drill', 'repair', 'challenge');
CREATE TYPE session_status AS ENUM ('created', 'active', 'interrupted', 'submitted', 'processed', 'abandoned');
CREATE TYPE pipeline_status AS ENUM ('pending', 'sync_complete', 'async_complete', 'async_partial', 'async_failed');
CREATE TYPE learning_event_type AS ENUM ('answer', 'hint_requested', 'skip', 'pause', 'resume',
                                          'submit', 'timeout', 'repair_stage_complete');

-- Intelligence
CREATE TYPE misconception_status AS ENUM ('active', 'suspected', 'repairing', 'resolved', 'recurred');
CREATE TYPE repair_status AS ENUM ('queued', 'in_progress', 'completed', 'failed', 'deferred');
CREATE TYPE follow_up_result AS ENUM ('passed', 'regressed', 'pending');
CREATE TYPE plan_type AS ENUM ('weekly', 'exam_countdown', 'long_term', 'transition');
CREATE TYPE plan_status AS ENUM ('active', 'superseded', 'expired');
CREATE TYPE plan_session_status AS ENUM ('pending', 'completed', 'skipped');
CREATE TYPE plan_override_type AS ENUM ('pin_skill', 'dismiss_recommendation', 'override_plan_item');
CREATE TYPE alert_type AS ENUM ('declining_performance', 'persistent_misconception', 'high_fatigue',
                                 'low_persistence', 'repair_failure', 'exceptional_progress');
CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'urgent');
CREATE TYPE alert_status AS ENUM ('active', 'acknowledged', 'dismissed', 'resolved');

-- Jobs
CREATE TYPE job_priority AS ENUM ('high', 'medium', 'low');
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'dead_letter');
CREATE TYPE pipeline_step_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'skipped');

-- Feature flags
CREATE TYPE flag_source AS ENUM ('subscription', 'admin_override', 'experiment');

-- Assignments
CREATE TYPE assignment_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE assignment_session_status AS ENUM ('pending', 'in_progress', 'completed', 'overdue');

-- Billing
CREATE TYPE invoice_status AS ENUM ('draft', 'open', 'paid', 'uncollectible', 'void');

-- Engagement
CREATE TYPE achievement_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum');

-- Notifications
CREATE TYPE notification_type AS ENUM ('assignment_assigned', 'assignment_due_soon', 'assignment_overdue',
                                        'repair_ready', 'plan_updated', 'achievement_earned',
                                        'intervention_alert', 'system');
```

### 2.2 Tenancy & Identity

```sql
CREATE TABLE tenant (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  type        text NOT NULL DEFAULT 'family' CHECK (type IN ('family', 'school', 'tutor_centre')),
  region      text NOT NULL DEFAULT 'au-syd',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_profile (
  id            uuid PRIMARY KEY,  -- matches auth.users.id
  tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  role          user_role NOT NULL,
  email         text,
  display_name  text NOT NULL,
  year_level    int CHECK (year_level BETWEEN 1 AND 12),
  preferences   jsonb NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_tenant       ON user_profile(tenant_id);
CREATE INDEX idx_user_tenant_role  ON user_profile(tenant_id, role);

CREATE TABLE parent_student_link (
  parent_id  uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, student_id)
);
CREATE INDEX idx_psl_parent  ON parent_student_link(parent_id);
CREATE INDEX idx_psl_student ON parent_student_link(student_id);

CREATE TABLE class_group (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  teacher_id  uuid NOT NULL REFERENCES user_profile(id) ON DELETE RESTRICT,
  name        text NOT NULL,
  year_level  int,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_class_teacher ON class_group(teacher_id);
CREATE INDEX idx_class_tenant  ON class_group(tenant_id);

CREATE TABLE class_student (
  class_id   uuid NOT NULL REFERENCES class_group(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, student_id)
);
CREATE INDEX idx_cs_student ON class_student(student_id);
-- Helper materialised index for teacher access patterns
CREATE INDEX idx_cs_class_student ON class_student(class_id, student_id);

CREATE TABLE feature_flag (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES tenant(id) ON DELETE CASCADE,  -- NULL = platform default
  feature_key text NOT NULL,
  enabled     boolean NOT NULL DEFAULT false,
  config      jsonb,
  source      flag_source NOT NULL DEFAULT 'subscription',
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- Two partial unique indexes (replaces the magic-UUID pattern from v1.2)
CREATE UNIQUE INDEX idx_ff_platform ON feature_flag(feature_key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX idx_ff_tenant   ON feature_flag(tenant_id, feature_key) WHERE tenant_id IS NOT NULL;

CREATE TABLE admin_action_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL REFERENCES user_profile(id) ON DELETE RESTRICT,
  actor_role  user_role NOT NULL,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  payload     jsonb,
  ip_address  inet,
  trace_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_log_actor  ON admin_action_log(actor_id, created_at DESC);
CREATE INDEX idx_admin_log_entity ON admin_action_log(entity_type, entity_id);
```

### 2.3 Content & Skill Graph

```sql
CREATE TABLE skill_graph_version (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version      int  NOT NULL,
  description  text,
  status       graph_version_status NOT NULL DEFAULT 'draft',
  node_count   int  NOT NULL DEFAULT 0,
  edge_count   int  NOT NULL DEFAULT 0,
  published_at timestamptz,
  archived_at  timestamptz,
  created_by   uuid REFERENCES user_profile(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- Only one published version at a time
CREATE UNIQUE INDEX idx_sgv_published ON skill_graph_version(status) WHERE status = 'published';

CREATE TABLE skill_node (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_version_id  uuid NOT NULL REFERENCES skill_graph_version(id) ON DELETE CASCADE,
  parent_id         uuid REFERENCES skill_node(id) ON DELETE SET NULL,
  level             skill_level NOT NULL,
  name              text NOT NULL,
  slug              text NOT NULL,
  description       text,
  domain_id         uuid REFERENCES skill_node(id) ON DELETE SET NULL,
  difficulty_min    real NOT NULL DEFAULT 0.0 CHECK (difficulty_min BETWEEN 0 AND 1),
  difficulty_max    real NOT NULL DEFAULT 1.0 CHECK (difficulty_max BETWEEN 0 AND 1),
  bloom_levels      bloom_level[] NOT NULL DEFAULT '{}',
  curriculum_codes  text[] NOT NULL DEFAULT '{}',
  pathway_tags      exam_family[] NOT NULL DEFAULT '{}',
  year_levels       int[] NOT NULL DEFAULT '{}',
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT difficulty_range_valid CHECK (difficulty_min <= difficulty_max)
);
CREATE UNIQUE INDEX idx_skill_node_slug ON skill_node(graph_version_id, slug);
CREATE INDEX idx_skill_node_parent  ON skill_node(parent_id);
CREATE INDEX idx_skill_node_level   ON skill_node(graph_version_id, level);
CREATE INDEX idx_skill_node_domain  ON skill_node(domain_id);
CREATE INDEX idx_skill_node_pathway ON skill_node USING GIN(pathway_tags);
CREATE INDEX idx_skill_node_year    ON skill_node USING GIN(year_levels);

CREATE TABLE skill_edge (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_version_id  uuid NOT NULL REFERENCES skill_graph_version(id) ON DELETE CASCADE,
  source_id         uuid NOT NULL REFERENCES skill_node(id) ON DELETE CASCADE,
  target_id         uuid NOT NULL REFERENCES skill_node(id) ON DELETE CASCADE,
  edge_type         edge_type NOT NULL,
  strength          real NOT NULL CHECK (strength BETWEEN 0 AND 1),
  dependency_class  dependency_class,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_edge CHECK (source_id <> target_id),
  CONSTRAINT dep_class_consistency CHECK (
    (edge_type = 'prerequisite' AND dependency_class IS NOT NULL) OR
    (edge_type <> 'prerequisite' AND dependency_class IS NULL)
  ),
  CONSTRAINT dep_class_strength_consistency CHECK (
    dependency_class IS NULL
    OR (dependency_class = 'required'    AND strength >= 0.8)
    OR (dependency_class = 'supportive'  AND strength >= 0.4 AND strength < 0.8)
    OR (dependency_class = 'enriching'   AND strength < 0.4)
  )
);
CREATE UNIQUE INDEX idx_skill_edge_unique ON skill_edge(graph_version_id, source_id, target_id, edge_type);
CREATE INDEX idx_skill_edge_source ON skill_edge(graph_version_id, source_id);
CREATE INDEX idx_skill_edge_target ON skill_edge(graph_version_id, target_id);
CREATE INDEX idx_skill_edge_type   ON skill_edge(graph_version_id, edge_type);
```

**DAG enforcement — published graphs only:**

All edits are made against a `draft` graph version. The draft is validated (full topological sort) on `POST /skill-graphs/{id}/publish`. Only one published version at a time. In-place edits on a published graph are **forbidden** — a new draft must be created (copy-on-write).

```sql
-- Application-layer publish function (pseudocode in SQL):
CREATE OR REPLACE FUNCTION publish_skill_graph(graph_id uuid)
RETURNS void AS $$
DECLARE
  cycle_path text[];
BEGIN
  -- 1. Validate no cycles in prerequisite edges
  WITH RECURSIVE cycle_check AS (
    SELECT source_id, target_id, ARRAY[source_id, target_id] AS path, false AS is_cycle
    FROM skill_edge
    WHERE graph_version_id = graph_id AND edge_type = 'prerequisite'
    UNION ALL
    SELECT c.source_id, e.target_id, c.path || e.target_id,
           e.target_id = ANY(c.path)
    FROM cycle_check c
    JOIN skill_edge e ON e.source_id = c.target_id
    WHERE e.graph_version_id = graph_id
      AND e.edge_type = 'prerequisite'
      AND NOT c.is_cycle
      AND array_length(c.path, 1) < 20
  )
  SELECT path INTO cycle_path FROM cycle_check WHERE is_cycle LIMIT 1;

  IF cycle_path IS NOT NULL THEN
    RAISE EXCEPTION 'Prerequisite cycle detected: %', cycle_path;
  END IF;

  -- 2. Archive current published version
  UPDATE skill_graph_version
     SET status = 'archived', archived_at = now()
   WHERE status = 'published';

  -- 3. Publish new version
  UPDATE skill_graph_version
     SET status = 'published', published_at = now()
   WHERE id = graph_id AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Graph % not in draft state', graph_id;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

**Skill graph migration** (on publish, for any entity referencing old skill IDs — `skill_mastery`, `student_misconception`, `repair_record`, `learning_plan.sessions[].target_skill_ids`):

A required `skill_migration_map` table (published alongside the new graph version) maps `old_skill_id → new_skill_id`. A single `batch.skill_graph_migration` job walks each referencing table and rewrites IDs. The job must complete before the new version is used for any new session.

```sql
CREATE TABLE skill_migration_map (
  from_graph_version uuid NOT NULL REFERENCES skill_graph_version(id),
  to_graph_version   uuid NOT NULL REFERENCES skill_graph_version(id),
  old_skill_id       uuid NOT NULL,
  new_skill_id       uuid,  -- NULL means "retired without replacement"
  PRIMARY KEY (from_graph_version, to_graph_version, old_skill_id)
);
```

```sql
CREATE TABLE misconception (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  description     text NOT NULL,
  category        misconception_category NOT NULL,
  severity        misconception_severity NOT NULL DEFAULT 'moderate',
  skill_ids       uuid[] NOT NULL DEFAULT '{}',
  detection_rules jsonb NOT NULL DEFAULT '{}',
  year_levels     int[] NOT NULL DEFAULT '{}',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_misc_skills ON misconception USING GIN(skill_ids);

CREATE TABLE repair_sequence (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type        text NOT NULL CHECK (target_type IN ('misconception', 'root_cause_skill')),
  target_id          uuid NOT NULL,  -- misconception.id OR skill_node.id
  display_name       text NOT NULL,
  year_levels        int[] NOT NULL DEFAULT '{}',
  estimated_duration_minutes int NOT NULL DEFAULT 15,
  stages             jsonb NOT NULL,
  mastery_check_item_ids uuid[] NOT NULL DEFAULT '{}',
  success_threshold  real NOT NULL DEFAULT 0.8 CHECK (success_threshold BETWEEN 0 AND 1),
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_repair_seq_target ON repair_sequence(target_type, target_id);

CREATE TABLE stimulus (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type               stimulus_type NOT NULL,
  content            jsonb NOT NULL,
  source_attribution text,
  year_levels        int[] NOT NULL DEFAULT '{}',
  exam_families      exam_family[] NOT NULL DEFAULT '{}',
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE item (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id        text,
  stimulus_id           uuid REFERENCES stimulus(id),
  response_type         response_type NOT NULL,
  skill_ids             uuid[] NOT NULL CHECK (array_length(skill_ids, 1) >= 1),
  difficulty            real NOT NULL CHECK (difficulty BETWEEN 0 AND 1),
  discrimination        real,
  expected_time_secs    int,
  year_levels           int[] NOT NULL CHECK (array_length(year_levels, 1) >= 1),
  exam_families         exam_family[] NOT NULL CHECK (array_length(exam_families, 1) >= 1),
  programs              text[] NOT NULL DEFAULT '{}',
  countries             text[] NOT NULL DEFAULT '{}',
  curricula             text[] NOT NULL DEFAULT '{}',
  bloom_level           bloom_level,
  lifecycle             item_lifecycle NOT NULL DEFAULT 'draft',
  is_active             boolean NOT NULL DEFAULT true,
  current_version       int NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_item_skills     ON item USING GIN(skill_ids);
CREATE INDEX idx_item_exam       ON item USING GIN(exam_families);
CREATE INDEX idx_item_year       ON item USING GIN(year_levels);
CREATE INDEX idx_item_difficulty ON item(difficulty) WHERE is_active = true;
CREATE INDEX idx_item_lifecycle  ON item(lifecycle)  WHERE is_active = true;

CREATE TABLE item_version (
  item_id              uuid NOT NULL REFERENCES item(id),
  version              int  NOT NULL,
  stem                 jsonb NOT NULL,
  response_config      jsonb NOT NULL,
  distractor_rationale jsonb,
  explanation          jsonb,
  metadata             jsonb NOT NULL DEFAULT '{}',
  difficulty           real NOT NULL,
  discrimination       real,
  is_current           boolean NOT NULL DEFAULT true,
  supersedes           int,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, version)
);
CREATE UNIQUE INDEX idx_item_version_current_one
  ON item_version(item_id) WHERE is_current = true;

-- Canonical read view: always gives current stem + response config per item.
CREATE VIEW v_item_current AS
SELECT
  i.id, i.source_item_id, i.stimulus_id, i.response_type, i.skill_ids,
  i.difficulty, i.discrimination, i.expected_time_secs,
  i.year_levels, i.exam_families, i.programs, i.countries, i.curricula,
  i.bloom_level, i.lifecycle, i.is_active, i.current_version,
  iv.stem, iv.response_config, iv.distractor_rationale, iv.explanation, iv.metadata
FROM item i
JOIN item_version iv ON iv.item_id = i.id AND iv.is_current = true;
```

### 2.4 Assessment Configuration

```sql
CREATE TABLE framework_config (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_family       exam_family NOT NULL,
  version           text NOT NULL,
  structure         jsonb NOT NULL,
  adaptive_rules    jsonb,
  scoring_rules     jsonb NOT NULL,
  constraints       jsonb NOT NULL DEFAULT '{}',
  difficulty_bands  jsonb NOT NULL,
  blueprint         jsonb NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_fc_family_version ON framework_config(exam_family, version);

CREATE TABLE pathway (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 text NOT NULL UNIQUE,
  display_name         text NOT NULL,
  exam_family          exam_family NOT NULL,
  program              text NOT NULL,
  country              text NOT NULL DEFAULT 'AU',
  curriculum           text NOT NULL DEFAULT 'australian_curriculum_v9',
  framework_config_id  uuid NOT NULL REFERENCES framework_config(id) ON DELETE RESTRICT,
  engine_type          engine_type NOT NULL,
  year_levels          int[] NOT NULL,
  required_feature_key text NOT NULL,  -- e.g., 'pathway.naplan'
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blueprint (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sections              jsonb NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assessment_profile (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_family          exam_family NOT NULL,
  program              text NOT NULL,
  year_level           int NOT NULL,
  version              text NOT NULL,
  framework_config_id  uuid NOT NULL REFERENCES framework_config(id) ON DELETE RESTRICT,
  blueprint_id         uuid NOT NULL REFERENCES blueprint(id) ON DELETE RESTRICT,
  duration_minutes     int NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE diagnostic_rule (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id        uuid NOT NULL REFERENCES skill_node(id) ON DELETE CASCADE,
  condition       jsonb NOT NULL,
  action          text NOT NULL CHECK (action IN
                   ('classify_proficient', 'classify_developing', 'probe_deeper', 'probe_prerequisite')),
  next_skill_id   uuid REFERENCES skill_node(id) ON DELETE SET NULL,
  next_difficulty_delta real DEFAULT 0.0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

### 2.5 Sessions

```sql
CREATE TABLE session_record (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id             uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id              uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  pathway_id             uuid REFERENCES pathway(id) ON DELETE SET NULL,
  assessment_profile_id  uuid REFERENCES assessment_profile(id) ON DELETE SET NULL,
  repair_sequence_id     uuid REFERENCES repair_sequence(id) ON DELETE SET NULL,
  assignment_id          uuid REFERENCES assignment(id) ON DELETE SET NULL,  -- forward-declared
  engine_type            engine_type NOT NULL,
  mode                   session_mode NOT NULL,
  status                 session_status NOT NULL DEFAULT 'created',
  -- Optimistic lock for STATE TRANSITIONS ONLY (not checkpoints):
  version                int NOT NULL DEFAULT 1,
  lock_token             uuid,
  started_at             timestamptz,
  submitted_at           timestamptz,
  processed_at           timestamptz,
  duration_ms            int,              -- wall clock first-item → submit
  active_duration_ms     int,              -- excluding interrupted (pause/resume) intervals
  item_count             int NOT NULL DEFAULT 0,
  items_answered         int NOT NULL DEFAULT 0,  -- atomic sequence counter (§2.7)
  items_correct          int NOT NULL DEFAULT 0,
  raw_score              real,
  scaled_score           real,
  score_band             text,
  engine_state_snapshot  jsonb NOT NULL DEFAULT '{}',  -- includes planned_items[] (fix H3)
  skills_touched         uuid[] NOT NULL DEFAULT '{}',
  pipeline_status        pipeline_status NOT NULL DEFAULT 'pending',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_session_student      ON session_record(student_id);
CREATE INDEX idx_session_tenant       ON session_record(tenant_id);
CREATE INDEX idx_session_active       ON session_record(student_id, status)
  WHERE status IN ('created', 'active', 'interrupted');
CREATE INDEX idx_session_pipeline     ON session_record(pipeline_status)
  WHERE pipeline_status NOT IN ('async_complete', 'pending');
CREATE INDEX idx_session_skills       ON session_record USING GIN(skills_touched);
CREATE INDEX idx_session_recent       ON session_record(student_id, submitted_at DESC)
  WHERE status = 'processed';
-- Enforce one active session per student
CREATE UNIQUE INDEX idx_session_one_active ON session_record(student_id)
  WHERE status IN ('created', 'active', 'interrupted');

CREATE TABLE session_response (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id             uuid NOT NULL REFERENCES session_record(id) ON DELETE CASCADE,
  item_id                uuid NOT NULL REFERENCES item(id) ON DELETE RESTRICT,
  student_id             uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id              uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  sequence_number        int NOT NULL CHECK (sequence_number >= 1),
  response_data          jsonb NOT NULL,
  is_correct             boolean,
  score                  real NOT NULL DEFAULT 0.0,
  difficulty_at_response real NOT NULL CHECK (difficulty_at_response BETWEEN 0 AND 1),
  answered_at            timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_response_session ON session_response(session_id, sequence_number);
CREATE INDEX idx_response_item    ON session_response(item_id);
-- Dedup key fixed to (session_id, item_id, sequence_number) — handles repair re-attempts (H2)
CREATE UNIQUE INDEX idx_response_dedup
  ON session_response(session_id, item_id, sequence_number);

CREATE TABLE response_telemetry (
  response_id                 uuid PRIMARY KEY REFERENCES session_response(id) ON DELETE CASCADE,
  time_to_answer_ms           int NOT NULL,
  time_to_first_action_ms     int NOT NULL,
  answer_changes              int NOT NULL DEFAULT 0,
  items_since_session_start   int NOT NULL,
  time_since_session_start_ms int NOT NULL,
  skipped_then_returned       boolean NOT NULL DEFAULT false,
  scroll_to_bottom            boolean,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session_checkpoint (
  session_id              uuid PRIMARY KEY REFERENCES session_record(id) ON DELETE CASCADE,
  checkpoint_number       int NOT NULL DEFAULT 0,
  current_question_index  int NOT NULL DEFAULT 0,
  answers                 jsonb NOT NULL DEFAULT '[]',
  telemetry_buffer        jsonb NOT NULL DEFAULT '[]',
  client_timestamp        timestamptz,
  server_timestamp        timestamptz NOT NULL DEFAULT now()
);
-- Checkpoint writes NEVER touch session_record.version (fix C3).
-- Autosave is a fire-and-forget upsert on this table.
```

### 2.6 Learning Events (Canonical)

```sql
CREATE TABLE learning_event (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  session_id          uuid NOT NULL REFERENCES session_record(id) ON DELETE CASCADE,
  item_id             uuid REFERENCES item(id) ON DELETE SET NULL,
  skill_id            uuid REFERENCES skill_node(id) ON DELETE SET NULL,
  event_type          learning_event_type NOT NULL,
  correctness         boolean,
  score               real,
  duration_ms         int NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  difficulty_at_event real CHECK (difficulty_at_event IS NULL OR difficulty_at_event BETWEEN 0 AND 1),
  metadata            jsonb NOT NULL DEFAULT '{}',
  sequence_number     int NOT NULL CHECK (sequence_number >= 1),
  created_at          timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Monthly partitions (bootstrap; created by pg_partman)
CREATE TABLE learning_event_default PARTITION OF learning_event DEFAULT;

CREATE INDEX idx_le_session        ON learning_event(session_id, sequence_number);
CREATE INDEX idx_le_student_time   ON learning_event(student_id, created_at DESC);
CREATE INDEX idx_le_skill_answer   ON learning_event(skill_id, student_id)
  WHERE event_type = 'answer';
CREATE INDEX idx_le_session_type   ON learning_event(session_id, event_type);
CREATE UNIQUE INDEX idx_le_dedup
  ON learning_event(session_id, COALESCE(item_id, '00000000-0000-0000-0000-000000000000'::uuid),
                     event_type, sequence_number);
```

### 2.7 Atomic Session Write Function (H1)

Every response write is atomic: `session_record` counter bump + `session_response` + `response_telemetry` + `learning_event` in one transaction.

```sql
CREATE OR REPLACE FUNCTION create_session_response_atomic(
  p_session_id      uuid,
  p_expected_version int,
  p_item_id         uuid,
  p_response_data   jsonb,
  p_is_correct      boolean,
  p_score           real,
  p_difficulty      real,
  p_telemetry       jsonb,   -- {time_to_answer_ms, time_to_first_action_ms, ...}
  p_guess_probability real,
  p_answer_changes  int
) RETURNS TABLE(response_id uuid, event_id uuid, new_sequence int, new_version int) AS $$
DECLARE
  v_student_id uuid;
  v_tenant_id uuid;
  v_skill_id uuid;
  v_next_seq int;
  v_new_version int;
  v_resp_id uuid;
  v_event_id uuid;
BEGIN
  -- 1. Atomically bump counter + version; row lock enforces serialisation
  UPDATE session_record
     SET items_answered = items_answered + 1,
         version = version + 1,
         updated_at = now()
   WHERE id = p_session_id
     AND status = 'active'
     AND version = p_expected_version
  RETURNING items_answered, version, student_id, tenant_id INTO v_next_seq, v_new_version, v_student_id, v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Derive primary skill from item
  SELECT skill_ids[1] INTO v_skill_id FROM item WHERE id = p_item_id;

  -- 3. Write session_response
  INSERT INTO session_response (session_id, item_id, student_id, tenant_id,
                                 sequence_number, response_data, is_correct,
                                 score, difficulty_at_response)
  VALUES (p_session_id, p_item_id, v_student_id, v_tenant_id,
          v_next_seq, p_response_data, p_is_correct, p_score, p_difficulty)
  RETURNING id INTO v_resp_id;

  -- 4. Write telemetry
  INSERT INTO response_telemetry (response_id, time_to_answer_ms, time_to_first_action_ms,
                                   answer_changes, items_since_session_start,
                                   time_since_session_start_ms, skipped_then_returned,
                                   scroll_to_bottom)
  VALUES (v_resp_id,
          (p_telemetry->>'time_to_answer_ms')::int,
          (p_telemetry->>'time_to_first_action_ms')::int,
          p_answer_changes,
          (p_telemetry->>'items_since_session_start')::int,
          (p_telemetry->>'time_since_session_start_ms')::int,
          COALESCE((p_telemetry->>'skipped_then_returned')::boolean, false),
          (p_telemetry->>'scroll_to_bottom')::boolean);

  -- 5. Write learning_event (answer type)
  INSERT INTO learning_event (student_id, tenant_id, session_id, item_id, skill_id,
                              event_type, correctness, score, duration_ms,
                              difficulty_at_event, metadata, sequence_number)
  VALUES (v_student_id, v_tenant_id, p_session_id, p_item_id, v_skill_id,
          'answer', p_is_correct, p_score,
          (p_telemetry->>'time_to_answer_ms')::int,
          p_difficulty,
          jsonb_build_object(
            'response_data', p_response_data,
            'answer_changes', p_answer_changes,
            'guess_probability', p_guess_probability
          ),
          v_next_seq)
  RETURNING id INTO v_event_id;

  RETURN QUERY SELECT v_resp_id, v_event_id, v_next_seq, v_new_version;
END;
$$ LANGUAGE plpgsql;
```

### 2.8 Intelligence Tables

```sql
CREATE TABLE skill_mastery (
  student_id       uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  skill_id         uuid NOT NULL REFERENCES skill_node(id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  mastery_level    real NOT NULL DEFAULT 0.0 CHECK (mastery_level BETWEEN 0 AND 1),
  confidence       real NOT NULL DEFAULT 0.0 CHECK (confidence BETWEEN 0 AND 1),
  total_attempts   int NOT NULL DEFAULT 0,
  correct_attempts int NOT NULL DEFAULT 0,
  last_attempted_at timestamptz,
  streak_current   int NOT NULL DEFAULT 0,
  streak_best      int NOT NULL DEFAULT 0,
  history          jsonb NOT NULL DEFAULT '[]',
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, skill_id)
);
CREATE INDEX idx_mastery_tenant ON skill_mastery(tenant_id);
CREATE INDEX idx_mastery_level  ON skill_mastery(student_id, mastery_level);

CREATE TABLE learning_velocity (
  student_id   uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  skill_id     uuid NOT NULL REFERENCES skill_node(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL,
  velocity     real NOT NULL DEFAULT 0.0,
  window_days  int NOT NULL DEFAULT 14,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, skill_id)
);

CREATE TABLE behaviour_profile (
  student_id                 uuid PRIMARY KEY REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id                  uuid NOT NULL,
  avg_guess_rate             real NOT NULL DEFAULT 0.1,
  avg_fatigue_onset_minutes  int  NOT NULL DEFAULT 20,
  persistence_score          real NOT NULL DEFAULT 0.5,
  avg_cognitive_load_comfort real NOT NULL DEFAULT 0.4,
  time_pressure_sensitivity  real NOT NULL DEFAULT 0.3,
  session_length_sweet_spot  int  NOT NULL DEFAULT 20,
  data_points                int  NOT NULL DEFAULT 0,
  computed_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE student_misconception (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  misconception_id uuid NOT NULL REFERENCES misconception(id) ON DELETE RESTRICT,
  detected_at      timestamptz NOT NULL DEFAULT now(),
  evidence         jsonb NOT NULL DEFAULT '{}',
  confidence       real NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  status           misconception_status NOT NULL DEFAULT 'suspected',
  repair_attempts  int NOT NULL DEFAULT 0,
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sm_student_status ON student_misconception(student_id, status);
CREATE INDEX idx_sm_active ON student_misconception(student_id)
  WHERE status IN ('active', 'suspected');

CREATE TABLE repair_record (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id              uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id               uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  repair_sequence_id      uuid NOT NULL REFERENCES repair_sequence(id) ON DELETE RESTRICT,
  misconception_id        uuid REFERENCES misconception(id) ON DELETE SET NULL,
  root_cause_skill_id     uuid REFERENCES skill_node(id) ON DELETE SET NULL,
  status                  repair_status NOT NULL DEFAULT 'queued',
  started_at              timestamptz,
  completed_at            timestamptz,
  stages_completed        int NOT NULL DEFAULT 0,
  total_stages            int NOT NULL DEFAULT 0,
  mastery_check_score     real,
  follow_up_assessment_at timestamptz,
  follow_up_result        follow_up_result,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_repair_student_status ON repair_record(student_id, status);
-- Concurrency fix (C7): prevent double-queuing of same misconception
CREATE UNIQUE INDEX idx_repair_one_open_per_misc ON repair_record(student_id, misconception_id)
  WHERE status IN ('queued', 'in_progress') AND misconception_id IS NOT NULL;
CREATE UNIQUE INDEX idx_repair_one_open_per_skill ON repair_record(student_id, root_cause_skill_id)
  WHERE status IN ('queued', 'in_progress') AND root_cause_skill_id IS NOT NULL;

CREATE TABLE intelligence_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  event_type     text NOT NULL,
  input_snapshot jsonb NOT NULL,
  output         jsonb NOT NULL,
  explanation    jsonb,
  layer          text NOT NULL,
  algorithm_version text NOT NULL,
  trace_id       uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);
CREATE TABLE intelligence_audit_log_default PARTITION OF intelligence_audit_log DEFAULT;
CREATE INDEX idx_audit_student ON intelligence_audit_log(student_id, created_at DESC);
CREATE INDEX idx_audit_type    ON intelligence_audit_log(event_type, created_at DESC);
```

### 2.9 Orchestration

```sql
CREATE TABLE learning_plan (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  plan_type           plan_type NOT NULL,
  status              plan_status NOT NULL DEFAULT 'active',
  valid_until         timestamptz NOT NULL,
  sessions            jsonb NOT NULL DEFAULT '[]',
  constraints_applied jsonb NOT NULL DEFAULT '{}',
  milestones          jsonb,
  generated_algorithm_version text NOT NULL,
  stale_since         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_plan_active ON learning_plan(student_id, plan_type) WHERE status = 'active';
CREATE INDEX idx_plan_expiry ON learning_plan(valid_until) WHERE status = 'active';

CREATE TABLE plan_revision (
  plan_id      uuid NOT NULL REFERENCES learning_plan(id) ON DELETE CASCADE,
  revision     int NOT NULL,
  reason       text NOT NULL,
  diff_summary jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, revision)
);

CREATE TABLE recommendation (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  plan_id          uuid REFERENCES learning_plan(id) ON DELETE SET NULL,
  mode             session_mode NOT NULL,
  target_skills    uuid[] NOT NULL,
  difficulty_range jsonb,
  rationale        text NOT NULL,
  priority         text NOT NULL DEFAULT 'medium',
  status           plan_session_status NOT NULL DEFAULT 'pending',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rec_student ON recommendation(student_id, status);

-- New: parent/teacher overrides (Gap M8)
CREATE TABLE plan_override (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  actor_id    uuid NOT NULL REFERENCES user_profile(id) ON DELETE RESTRICT,
  type        plan_override_type NOT NULL,
  target      jsonb NOT NULL,      -- skill_id | recommendation_id | plan_session_order
  expires_at  timestamptz NOT NULL,  -- 14 days default per spec §16.6
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plan_override_active ON plan_override(student_id, type) WHERE expires_at > now();
```

### 2.10 Analytics / Teacher Intel

```sql
CREATE TABLE intervention_alert (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  class_id          uuid REFERENCES class_group(id) ON DELETE SET NULL,
  teacher_id        uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  alert_type        alert_type NOT NULL,
  severity          alert_severity NOT NULL DEFAULT 'info',
  status            alert_status NOT NULL DEFAULT 'active',
  detail            jsonb NOT NULL DEFAULT '{}',
  suggested_action  text,
  explanation       jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  acknowledged_at   timestamptz,
  resolved_at       timestamptz
);
CREATE INDEX idx_alert_teacher_status ON intervention_alert(teacher_id, status);

-- Cohort read-model cache
CREATE TABLE cohort_metric_cache (
  cohort_key   text NOT NULL,   -- e.g., 'class:uuid' or 'year:5:naplan'
  metric_key   text NOT NULL,   -- e.g., 'avg_mastery_numeracy'
  time_bucket  text NOT NULL,   -- 'YYYY-MM-DD' or 'YYYY-WW'
  value        jsonb NOT NULL,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cohort_key, metric_key, time_bucket)
);
CREATE INDEX idx_cmc_cohort ON cohort_metric_cache(cohort_key, computed_at DESC);
```

### 2.11 Assignments (new, C1)

```sql
CREATE TABLE assignment (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  created_by       uuid NOT NULL REFERENCES user_profile(id) ON DELETE RESTRICT,
  title            text NOT NULL,
  description      text,
  mode             session_mode NOT NULL,
  target_skill_ids uuid[] NOT NULL CHECK (array_length(target_skill_ids, 1) >= 1),
  difficulty_range jsonb,          -- { min: 0.4, max: 0.7 }
  item_count       int NOT NULL CHECK (item_count > 0),
  time_limit_ms    int,
  due_at           timestamptz,
  status           assignment_status NOT NULL DEFAULT 'draft',
  auto_generated   boolean NOT NULL DEFAULT false,
  rationale        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  published_at     timestamptz,
  archived_at      timestamptz
);
CREATE INDEX idx_asg_tenant  ON assignment(tenant_id);
CREATE INDEX idx_asg_creator ON assignment(created_by, status);

CREATE TABLE assignment_target (
  assignment_id uuid NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
  student_id    uuid REFERENCES user_profile(id) ON DELETE CASCADE,
  class_id      uuid REFERENCES class_group(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((student_id IS NOT NULL) <> (class_id IS NOT NULL)),
  UNIQUE (assignment_id, student_id, class_id)
);
CREATE INDEX idx_asg_target_student ON assignment_target(student_id);
CREATE INDEX idx_asg_target_class   ON assignment_target(class_id);

CREATE TABLE assignment_session (
  assignment_id uuid NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES session_record(id) ON DELETE SET NULL,
  status        assignment_session_status NOT NULL DEFAULT 'pending',
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, student_id)
);
CREATE INDEX idx_asg_session_student ON assignment_session(student_id, status);

-- Forward reference fix: add FK from session_record.assignment_id
ALTER TABLE session_record
  ADD CONSTRAINT fk_session_assignment
  FOREIGN KEY (assignment_id) REFERENCES assignment(id) ON DELETE SET NULL;
```

### 2.12 Billing (new, H10)

```sql
CREATE TABLE subscription (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  tier        subscription_tier NOT NULL DEFAULT 'free',
  stripe_subscription_id text UNIQUE,
  started_at  timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  cancel_at   timestamptz,
  canceled_at timestamptz,
  is_active   boolean NOT NULL DEFAULT true,
  config      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_sub_active_per_tenant ON subscription(tenant_id) WHERE is_active = true;

CREATE TABLE billing_customer (
  tenant_id              uuid PRIMARY KEY REFERENCES tenant(id) ON DELETE RESTRICT,
  stripe_customer_id     text UNIQUE NOT NULL,
  default_payment_method text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoice (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  stripe_invoice_id text UNIQUE NOT NULL,
  amount_cents      int NOT NULL,
  currency          text NOT NULL DEFAULT 'AUD',
  status            invoice_status NOT NULL,
  hosted_invoice_url text,
  invoice_pdf_url    text,
  invoiced_at       timestamptz NOT NULL,
  paid_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoice_tenant ON invoice(tenant_id, invoiced_at DESC);

CREATE TABLE billing_event (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid REFERENCES tenant(id) ON DELETE SET NULL,
  stripe_event_id  text UNIQUE NOT NULL,
  event_type       text NOT NULL,
  payload          jsonb NOT NULL,
  processed_at     timestamptz,
  processing_error text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_be_unprocessed ON billing_event(created_at) WHERE processed_at IS NULL;
```

### 2.13 Engagement (new, H9)

```sql
CREATE TABLE engagement_streak (
  student_id       uuid PRIMARY KEY REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  current_days     int NOT NULL DEFAULT 0,
  best_days        int NOT NULL DEFAULT 0,
  last_active_date date,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE achievement_definition (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  criteria    jsonb NOT NULL,   -- rule spec, evaluated by engagement worker
  tier        achievement_tier NOT NULL,
  icon        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE student_achievement (
  student_id     uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievement_definition(id) ON DELETE RESTRICT,
  tenant_id      uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  earned_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, achievement_id)
);
CREATE INDEX idx_sa_student_time ON student_achievement(student_id, earned_at DESC);
```

### 2.14 Notifications (new, M9)

```sql
CREATE TABLE notification (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  type       notification_type NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  link       text,
  read_at    timestamptz,
  metadata   jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user_unread ON notification(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_notif_user_all    ON notification(user_id, created_at DESC);
```

### 2.15 Jobs & Outbox

```sql
CREATE TABLE job_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  job_type        text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}',
  priority        job_priority NOT NULL DEFAULT 'medium',
  status          job_status NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL,
  attempts        int NOT NULL DEFAULT 0,
  max_attempts    int NOT NULL DEFAULT 3,
  last_error      text,
  scheduled_at    timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz,
  worker_id       text,           -- identifier of worker holding the job
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_poll ON job_queue(priority DESC, scheduled_at ASC) WHERE status = 'pending';
CREATE UNIQUE INDEX idx_job_dedup ON job_queue(idempotency_key)
  WHERE status IN ('pending', 'processing');
CREATE INDEX idx_job_dead  ON job_queue(status) WHERE status = 'dead_letter';
CREATE INDEX idx_job_stuck ON job_queue(started_at) WHERE status = 'processing';

CREATE TABLE pipeline_event (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES session_record(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  step         int NOT NULL CHECK (step BETWEEN 1 AND 9),
  step_name    text NOT NULL,
  status       pipeline_step_status NOT NULL DEFAULT 'pending',
  attempts     int NOT NULL DEFAULT 0,
  started_at   timestamptz,
  completed_at timestamptz,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pe_session ON pipeline_event(session_id, step);
CREATE INDEX idx_pe_pending ON pipeline_event(status) WHERE status = 'pending';

-- Transactional outbox (fix M5) — written in same tx as owning service's domain write.
-- A cron-polled dispatcher drains this into job_queue OR emits to external systems.
CREATE TABLE outbox_event (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,      -- e.g., 'session_record', 'assignment'
  aggregate_id   uuid NOT NULL,
  event_type     text NOT NULL,      -- e.g., 'session.submitted', 'assignment.published'
  payload        jsonb NOT NULL,
  processed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_unprocessed ON outbox_event(created_at) WHERE processed_at IS NULL;

-- Idempotency & rate limiting (fix M6)
CREATE TABLE api_idempotency_key (
  idempotency_key text NOT NULL,
  tenant_id       uuid NOT NULL,
  endpoint        text NOT NULL,
  request_hash    text NOT NULL,
  status          text NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing', 'completed', 'failed')),
  response_status int,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  PRIMARY KEY (idempotency_key, tenant_id)
);
CREATE INDEX idx_idem_cleanup ON api_idempotency_key(created_at) WHERE status IN ('completed', 'failed');

CREATE TABLE rate_limit_bucket (
  bucket_key   text NOT NULL,     -- e.g., 'ip:1.2.3.4:auth', 'user:uuid:respond'
  window_start timestamptz NOT NULL,
  count        int NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_key, window_start)
);
CREATE INDEX idx_rlb_cleanup ON rate_limit_bucket(window_start);
```

---

## Part III — Auth, RLS & Security

### 3.1 JWT Claims Contract

Every access token carries `app_metadata.tenant_id` and `app_metadata.role`. These are set at signup via a trigger on `auth.users` and written to both the database row and the JWT claims.

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profile (id, tenant_id, role, email, display_name)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'tenant_id')::uuid,
    (NEW.raw_user_meta_data->>'role')::user_role,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION auth_tenant_id() RETURNS uuid AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth_user_id() RETURNS uuid AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth_role() RETURNS user_role AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role')::user_role;
$$ LANGUAGE sql STABLE;
```

### 3.2 RLS Policies (complete)

**Pattern A — Student-data tables** (`session_record`, `session_response`, `response_telemetry`, `session_checkpoint`, `learning_event`, `skill_mastery`, `learning_velocity`, `behaviour_profile`, `student_misconception`, `repair_record`, `learning_plan`, `recommendation`, `intelligence_audit_log`, `plan_override`, `engagement_streak`, `student_achievement`):

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<t>_tenant" ON <table>
  USING (tenant_id = auth_tenant_id());

CREATE POLICY "<t>_student_select" ON <table> FOR SELECT
  USING (auth_role() = 'student' AND student_id = auth_user_id());

CREATE POLICY "<t>_student_insert" ON <table> FOR INSERT
  WITH CHECK (auth_role() = 'student'
              AND student_id = auth_user_id()
              AND tenant_id = auth_tenant_id());

CREATE POLICY "<t>_parent_select" ON <table> FOR SELECT
  USING (auth_role() = 'parent' AND student_id IN (
    SELECT student_id FROM parent_student_link WHERE parent_id = auth_user_id()
  ));

CREATE POLICY "<t>_teacher_select" ON <table> FOR SELECT
  USING (auth_role() IN ('teacher', 'tutor') AND student_id IN (
    SELECT cs.student_id FROM class_student cs
    JOIN class_group cg ON cg.id = cs.class_id
    WHERE cg.teacher_id = auth_user_id()
  ));

CREATE POLICY "<t>_org_admin" ON <table> FOR ALL
  USING (auth_role() = 'org_admin' AND tenant_id = auth_tenant_id());

CREATE POLICY "<t>_platform_admin" ON <table> FOR ALL
  USING (auth_role() = 'platform_admin');
```

**Tables without direct `student_id` column** use a join view in the policy:

```sql
-- plan_revision (access via learning_plan)
ALTER TABLE plan_revision ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr_tenant" ON plan_revision
  USING (plan_id IN (SELECT id FROM learning_plan WHERE tenant_id = auth_tenant_id()));
CREATE POLICY "pr_student" ON plan_revision FOR SELECT
  USING (plan_id IN (SELECT id FROM learning_plan WHERE student_id = auth_user_id()));
CREATE POLICY "pr_parent" ON plan_revision FOR SELECT
  USING (plan_id IN (SELECT lp.id FROM learning_plan lp
                     WHERE lp.student_id IN (
                       SELECT student_id FROM parent_student_link WHERE parent_id = auth_user_id()
                     )));
-- teacher/admin analogous

-- response_telemetry (access via session_response)
ALTER TABLE response_telemetry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rt_tenant" ON response_telemetry
  USING (response_id IN (SELECT id FROM session_response WHERE tenant_id = auth_tenant_id()));
CREATE POLICY "rt_student" ON response_telemetry FOR SELECT
  USING (response_id IN (SELECT id FROM session_response WHERE student_id = auth_user_id()));
-- parent/teacher/admin analogous
```

**Pattern B — Teacher-data tables** (`intervention_alert`):

```sql
ALTER TABLE intervention_alert ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ia_tenant" ON intervention_alert USING (tenant_id = auth_tenant_id());
CREATE POLICY "ia_teacher" ON intervention_alert FOR ALL
  USING (auth_role() IN ('teacher', 'tutor') AND teacher_id = auth_user_id());
CREATE POLICY "ia_admin" ON intervention_alert FOR ALL
  USING (auth_role() IN ('org_admin', 'platform_admin') AND tenant_id = auth_tenant_id());
```

**Pattern C — Assignments**: Teachers see assignments they created; students see assignments targeting them (directly or via class).

```sql
ALTER TABLE assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "a_tenant" ON assignment USING (tenant_id = auth_tenant_id());
CREATE POLICY "a_creator" ON assignment FOR ALL
  USING (created_by = auth_user_id());
CREATE POLICY "a_student_select" ON assignment FOR SELECT
  USING (auth_role() = 'student' AND id IN (
    SELECT at.assignment_id FROM assignment_target at
    WHERE at.student_id = auth_user_id()
       OR at.class_id IN (
         SELECT cs.class_id FROM class_student cs WHERE cs.student_id = auth_user_id()
       )
  ));
CREATE POLICY "a_admin" ON assignment FOR ALL
  USING (auth_role() IN ('org_admin', 'platform_admin') AND tenant_id = auth_tenant_id());

-- assignment_target, assignment_session similarly scoped
```

**Pattern D — Billing** (tenant-level only):

```sql
ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub_tenant_read" ON subscription FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY "sub_admin_write" ON subscription FOR ALL
  USING (auth_role() IN ('org_admin', 'platform_admin'));
-- invoice, billing_customer same pattern
-- billing_event: service-role only, no client access
```

**Pattern E — Notifications**: users see only their own.

```sql
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
CREATE POLICY "n_own" ON notification FOR ALL USING (user_id = auth_user_id());
```

**Pattern F — Global content/config tables** (`skill_node`, `skill_edge`, `skill_graph_version`, `item`, `item_version`, `stimulus`, `pathway`, `framework_config`, `assessment_profile`, `blueprint`, `misconception`, `repair_sequence`, `diagnostic_rule`, `achievement_definition`):

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "<t>_read" ON <table> FOR SELECT USING (true);
CREATE POLICY "<t>_write_admin" ON <table> FOR INSERT
  WITH CHECK (auth_role() IN ('org_admin', 'platform_admin'));
CREATE POLICY "<t>_update_admin" ON <table> FOR UPDATE
  USING (auth_role() IN ('org_admin', 'platform_admin'));
CREATE POLICY "<t>_delete_platform" ON <table> FOR DELETE
  USING (auth_role() = 'platform_admin');
```

**Pattern G — Internal tables** (`job_queue`, `pipeline_event`, `api_idempotency_key`, `outbox_event`, `rate_limit_bucket`, `billing_event`, `skill_migration_map`, `cohort_metric_cache`, `admin_action_log`):

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
-- No policies = deny all. Service role bypasses RLS.
```

### 3.3 Tenant Isolation Test (CI-gated)

```sql
-- tests/rls_tenant_isolation.sql
-- Seeded with two tenants T1, T2, each with one student and one session.
-- Using T1 student's JWT, every select against any tenant-scoped table must return 0 rows
-- from T2 data and only T1 data.
-- Any new tenant-scoped table must include itself in this test or CI fails.
```

### 3.4 Additional Security Requirements

1. **Stripe webhook signature verification** required on every webhook call; reject within 300 ms if signature invalid.
2. **Admin action logging**: every org_admin or platform_admin `UPDATE`/`DELETE`/`INSERT` against a mutable config table writes to `admin_action_log` via the service layer.
3. **PII redaction**: logging middleware strips `response_data`, `stem`, `payload.answers`, `raw_user_meta_data` before emission.
4. **Data subject rights** (APP): endpoints `/privacy/export-data`, `/privacy/delete-account` — see §7 operational playbooks.

---

## Part IV — API Surface (Complete)

All endpoints at `/api/v1/*`. All mutations accept `Idempotency-Key` header where noted.

### 4.1 Auth (`auth-svc`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/signup` | Public | Register user (Supabase Auth); creates profile via trigger |
| POST | `/auth/login` | Public | Password login; returns JWT |
| POST | `/auth/refresh` | Bearer | Rotate access token |
| POST | `/auth/logout` | Bearer | Revoke session |
| POST | `/auth/forgot-password` | Public | Send reset email |
| POST | `/auth/reset-password` | Public (token) | Complete reset |

### 4.2 Users (`users-svc`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/me` | Bearer | Current user + tenant + entitlements |
| PATCH | `/users/me` | Bearer | Update display name, preferences |
| GET | `/users/me/children` | Parent | List linked students |
| GET | `/users/me/classes` | Teacher | List owned classes |
| GET | `/users/{id}` | Role-gated | Other profile (subject to RLS) |
| POST | `/users/invite` | org_admin/teacher | Invite student to class or tenant |

### 4.3 Content (`content-svc`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/pathways` | Bearer | List pathways entitled to caller's subscription |
| GET | `/pathways/{slug}` | Bearer | Single pathway detail |
| GET | `/assessment-profiles?exam_family=&year_level=` | Bearer | Administrable assessments |
| GET | `/content/items/{id}` | Bearer | Item from `v_item_current` |
| POST | `/content/select` | service | Select items by blueprint (used by ASN) |
| GET | `/content/search` | admin | Faceted search |
| POST | `/content/import` | platform_admin | Bulk import with dry-run |
| GET | `/content/coverage` | admin | Coverage report |
| GET | `/content/quality-report` | admin | Drift/discrimination flags |
| PATCH | `/content/items/{id}/lifecycle` | admin | Transition item lifecycle |
| GET | `/skill-graphs` | admin | List graph versions |
| POST | `/skill-graphs` | platform_admin | Create draft version |
| PATCH | `/skill-graphs/{id}` | platform_admin | Edit draft (nodes, edges) |
| POST | `/skill-graphs/{id}/validate` | platform_admin | Full topological validation |
| POST | `/skill-graphs/{id}/publish` | platform_admin | Publish draft; enqueues migration job |
| GET | `/skill-graphs/active` | Bearer | Active graph metadata |
| GET | `/misconceptions` | admin | List catalog |
| POST | `/misconceptions` | platform_admin | Create |
| GET | `/repair-sequences` | admin | List |
| POST | `/repair-sequences` | platform_admin | Create |

### 4.4 Assessment (`assessment-svc`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/sessions/create` | Student (Idempotency-Key) | Create session, return first item + lock_token |
| POST | `/sessions/{id}/respond` | Student (Idempotency-Key, X-Session-Lock) | Record response atomically |
| POST | `/sessions/{id}/submit` | Student (Idempotency-Key) | Finalise, trigger pipeline |
| POST | `/sessions/{id}/checkpoint` | Student | Fire-and-forget autosave |
| GET | `/sessions/{id}/state` | Student | Resume state |
| GET | `/sessions/{id}` | Role-gated | Session summary post-processing |
| GET | `/sessions/recent?limit=&student_id=` | Role-gated | Recent session list (SessionSummaryDTO) |
| POST | `/sessions/{id}/abandon` | Student | Explicit abandon |

### 4.5 Intelligence (`intelligence-svc`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/intelligence/process-session/{id}` | service | Sync pipeline L1–L3 |
| GET | `/intelligence/learner-profile/{student_id}` | Role-gated | Learning DNA |
| GET | `/intelligence/causal-map/{student_id}` | Role-gated | Root causes + misconceptions + repair queue |
| GET | `/intelligence/behaviour-profile/{student_id}` | Role-gated | Behaviour signals |
| GET | `/intelligence/predictions/{student_id}/{pathway_slug}` | Role-gated | Readiness forecast |
| GET | `/intelligence/stretch/{student_id}` | Role-gated | Stretch readiness |
| GET | `/intelligence/explain/{decision_id}` | Role-gated | Structured explanation |
| GET | `/intelligence/audit-log/{student_id}?layer=&from=&to=` | Role-gated | Audit trail |

### 4.6 Orchestration (`orchestration-svc`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/orchestration/plan/{student_id}/current?plan_type=` | Role-gated | Active plan |
| POST | `/orchestration/generate-plan/{student_id}` | Role-gated (Idempotency-Key) | Trigger regeneration |
| POST | `/orchestration/exam-countdown/{student_id}/{pathway_slug}` | Role-gated | Create countdown plan |
| POST | `/orchestration/pathway-switch/{student_id}` | Role-gated | Handle add/change/remove |
| POST | `/orchestration/long-term-plan/{student_id}` | Role-gated | Multi-week plan |
| GET | `/orchestration/milestones/{student_id}` | Role-gated | Milestone progress |
| POST | `/orchestration/plan/{id}/feedback` | Parent/Teacher | Pin/dismiss/complete |
| POST | `/orchestration/overrides` | Parent/Teacher | Create plan_override |
| DELETE | `/orchestration/overrides/{id}` | Parent/Teacher | Remove override |

### 4.7 Analytics (`analytics-svc`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/analytics/cohort/{group_id}` | Teacher/Admin | Cohort aggregate |
| GET | `/analytics/pathway-readiness/{student_id}/{pathway_slug}` | Role-gated | PathwayReadinessDTO |
| GET | `/analytics/auto-groups/{class_id}/{skill_id}` | Teacher | Auto-generated groupings |
| GET | `/analytics/intervention-alerts` | Teacher | Pending alerts for caller |
| PATCH | `/analytics/intervention-alerts/{id}` | Teacher | Acknowledge/dismiss/resolve |
| POST | `/analytics/generate-assignment` | Teacher | Auto-generate assignment |
| GET | `/analytics/misconception-prevalence/{cohort}` | Admin | Anonymised freq data |
| POST | `/analytics/reports/export` | Teacher/Admin | Start export job |
| GET | `/analytics/reports/{job_id}` | Teacher/Admin | Poll export status |

### 4.8 Assignments (`assignments-svc`, new)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/assignments` | Teacher (Idempotency-Key) | Create |
| GET | `/assignments/{id}` | Role-gated | Detail |
| PATCH | `/assignments/{id}` | Teacher (creator) | Update (pre-publish) |
| POST | `/assignments/{id}/publish` | Teacher | Transition draft → published; notify targets |
| POST | `/assignments/{id}/archive` | Teacher | Archive |
| GET | `/assignments/for-student/{student_id}?status=` | Role-gated | Student-facing list |
| GET | `/assignments/for-class/{class_id}` | Teacher | Class list |
| GET | `/assignments/{id}/tracking` | Teacher | Per-student completion |
| POST | `/assignments/{id}/start` | Student (Idempotency-Key) | Create session from assignment |

### 4.9 Billing (`billing-svc`, new)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/billing/plans` | Public | Catalog (feature comparison) |
| POST | `/billing/checkout` | org_admin/parent (Idempotency-Key) | Create Stripe Checkout session |
| POST | `/billing/portal` | org_admin/parent | Stripe Billing Portal URL |
| GET | `/billing/subscription` | Bearer | Active subscription + tier |
| POST | `/billing/subscription/cancel` | org_admin/parent | Schedule cancel-at-period-end |
| GET | `/billing/invoices` | Bearer | Invoice history |
| POST | `/billing/webhook/stripe` | Public + signature | Ingest webhook |

### 4.10 Engagement (`engagement-svc`, new)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/engagement/summary/{student_id}` | Role-gated | Streak + weekly goals + totals |
| GET | `/engagement/achievements/{student_id}` | Role-gated | Earned + locked |
| GET | `/engagement/nudges/{student_id}` | Student | Active nudges (rule-derived) |

### 4.11 Notifications (`notifications-svc`, new)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/notifications/me?unread=` | Bearer | Own notifications |
| PATCH | `/notifications/{id}/read` | Bearer | Mark read |
| POST | `/notifications/read-all` | Bearer | Mark all read |

### 4.12 Admin (`admin-svc`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/admin/jobs?status=&job_type=` | platform_admin | Inspect job queue |
| POST | `/admin/jobs/{id}/retry` | platform_admin | Reset dead-letter to pending |
| GET | `/admin/jobs/dead-letter` | platform_admin | Dead-letter list |
| GET | `/admin/pipeline-events?session_id=` | platform_admin | Pipeline step trace |
| GET | `/admin/tenants/{id}/usage` | platform_admin | Usage stats per tenant |
| GET | `/admin/feature-flags` | platform_admin | List |
| PATCH | `/admin/feature-flags/{id}` | platform_admin | Override |
| POST | `/admin/content-intelligence/recalibrate` | platform_admin | Enqueue batch job |

### 4.13 Rate Limits

| Endpoint Group | Limit | Window | Scope |
|---|---|---|---|
| Auth (login/signup) | 10 | 1 min | Per IP |
| Auth (reset) | 3 | 1 hour | Per IP |
| `/sessions/respond` | 120 | 1 min | Per student |
| `/sessions/create` | 5 | 1 min | Per student |
| `/sessions/checkpoint` | 240 | 1 min | Per student (fire-and-forget) |
| Intelligence GETs | 60 | 1 min | Per user |
| Analytics GETs | 30 | 1 min | Per user |
| `/content/import` | 2 | 1 min | Per tenant |
| Webhook ingress | 1000 | 1 min | Per source IP (Stripe allowlist) |
| Default | 100 | 1 min | Per user |

Implementation: `rate_limit_bucket` table, atomic `INSERT ... ON CONFLICT (bucket_key, window_start) DO UPDATE SET count = count + 1`; bucket window is sliding 1-minute truncated to `date_trunc('minute', now())`.

---

## Part V — Pipeline & Jobs

### 5.1 Pipeline Trigger Flow (corrected, M5)

```
Assessment Service: POST /sessions/{id}/submit
  BEGIN TRANSACTION
    UPDATE session_record SET status='submitted', ... WHERE id=$id AND version=$v
    INSERT INTO outbox_event (aggregate_type='session_record', event_type='session.submitted', ...)
  COMMIT

Outbox Dispatcher (cron every 2s):
  SELECT ... FROM outbox_event WHERE processed_at IS NULL ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED
  FOR each event:
    INSERT INTO pipeline_event (session_id, step=1, step_name='foundation.update', ...)
    INSERT INTO job_queue (job_type='pipeline.run_sync', priority='high', payload={session_id}, ...)
    UPDATE outbox_event SET processed_at=now() WHERE id=$id

Worker:
  Picks 'pipeline.run_sync' → calls POST /intelligence/process-session/{id}
  On success: enqueues async jobs for steps 4..9
  On failure: pipeline_event.status=failed; retry per rules
```

### 5.2 Pipeline Steps & Retry

| Step | Job Type | Priority | Idempotency Key | Max Retries | Backoff |
|---|---|---|---|---|---|
| 1 Foundation (sync) | `pipeline.foundation.update` | high | `foundation:{session_id}` | 3 | 1/2/4s |
| 2 Behaviour (sync) | `pipeline.behaviour.analyse` | high | `behaviour:{session_id}` | 3 | 1/2/4s |
| 3 Causal-scoped (sync) | `pipeline.causal.evaluate_scoped` | high | `causal_scoped:{session_id}` | 3 | 1/2/4s |
| 3b Causal-full (async) | `pipeline.causal.evaluate_full` | medium | `causal_full:{session_id}` | 3 | 1/2/4s |
| 4 Repair queue | `pipeline.repair_queue` | high | `repair:{student_id}:{session_id}` | 3 | 1/2/4s |
| 5 Predictive | `pipeline.predictive_refresh` | medium | `predictive:{student_id}` | 3 | 1/2/4s |
| 6 Stretch | `pipeline.stretch_evaluate` | low | `stretch:{student_id}` | 2 | 1/2s |
| 7 Teacher refresh | `pipeline.teacher_refresh` | low | `teacher:{class_id}` | 2 | 1/2s |
| 8 Content recalibrate | `pipeline.content_recalibrate` | low | `content:{session_id}` | 1 | — |
| 9 Orchestration replan | `pipeline.orchestration_replan` | high | `replan:{student_id}:{session_id}` | 3 | 1/2/4s |

**Pipeline sync SLA (<3s) is honoured by:**

1. In-memory skill-graph cache per Edge Function instance (1h TTL, invalidated on graph version publish).
2. Causal layer sync portion ("scoped") traverses only skills touched by the session + immediate prerequisites; full deep traversal runs in 3b async.
3. All L1/L2 writes are batched UPSERTs.
4. All reads hit indexes; no table scans.

### 5.3 Dead-Letter Flow

```
On attempts >= max_attempts:
  UPDATE job_queue SET status='dead_letter', completed_at=now()
  Alert fires (pipeline.dead_letter.count > 0)

Admin inspection:
  GET /admin/jobs/dead-letter
  POST /admin/jobs/{id}/retry → UPDATE status='pending', attempts=0

Poison detection:
  If same (job_type, last_error hash) appears 3+ times in dead_letter within 1 hour
  → mark poison=true in payload → exclude from bulk retry
```

### 5.4 Stuck Worker Reaper (cron, 1 min)

```sql
UPDATE job_queue
   SET status = 'pending', last_error = 'reclaimed_from_stuck_worker'
 WHERE status = 'processing'
   AND started_at < now() - interval '120 seconds'
   AND attempts < max_attempts;
```

### 5.5 Cron Jobs (pg_cron)

| Cron | Schedule | Purpose |
|---|---|---|
| `outbox.dispatch` | `*/2 * * * * *` (every 2s via poller) | Drain outbox to job_queue |
| `jobs.reaper` | `* * * * *` | Reclaim stuck |
| `jobs.archive` | `0 3 * * *` | Archive completed jobs > 30 days |
| `audit.archive` | `0 4 * * *` | Archive audit_log > 90 days to Parquet in Storage |
| `pipeline.cleanup` | `0 5 * * 0` | Delete pipeline_event > 90 days |
| `idem.cleanup` | `5 * * * *` | Delete completed api_idempotency_key > 24h |
| `abandoned.cleanup` | `0 2 * * *` | Mark stale interrupted sessions abandoned |
| `content.recalibration` | `0 * * * *` | Batch L8 |
| `plan.expiry` | `30 0 * * *` | Mark expired learning_plans |
| `rate_limit.cleanup` | `0 * * * *` | Drop rate_limit_bucket windows > 5 min old |
| `engagement.streaks` | `5 0 * * *` | Decrement streaks for inactive students |
| `follow_up.probe` | `0 6 * * *` | Schedule repair follow-up assessments |

---

## Part VI — DTO Contracts (Complete)

All DTOs live in `packages/types` with a Zod schema per type. `SCHEMA_VERSION` constant bumps on breaking change.

### 6.1 Identity

```typescript
interface UserMeDTO {
  id: string;
  email: string | null;
  display_name: string;
  role: 'student' | 'parent' | 'teacher' | 'tutor' | 'org_admin' | 'platform_admin';
  tenant_id: string;
  year_level: number | null;
  subscription_tier: 'free' | 'standard' | 'premium' | 'institutional';
  entitlements: Record<string, boolean>;  // resolved feature flags
  preferences: Record<string, unknown>;
}

interface TenantDTO {
  id: string;
  name: string;
  type: 'family' | 'school' | 'tutor_centre';
  region: string;
}
```

### 6.2 Pathway & Content

```typescript
interface PathwayDTO {
  slug: string;
  display_name: string;
  exam_family: string;
  program: string;
  year_levels: number[];
  entitled: boolean;                // based on caller's subscription
  locked_reason: string | null;
}

interface AssessmentProfileDTO {
  id: string;
  exam_family: string;
  program: string;
  year_level: number;
  duration_minutes: number;
}

interface ItemDTO {
  item_id: string;
  version: number;
  stem: Record<string, unknown>;
  stimulus: { id: string; type: string; content: Record<string, unknown> } | null;
  response_type: string;
  response_config: Record<string, unknown>;
  tools_available: string[];
  sequence_number: number;
}
```

### 6.3 Session

```typescript
interface CreateSessionRequest {
  assessment_profile_id: string | null;
  repair_sequence_id: string | null;
  assignment_id: string | null;
  mode: 'exam' | 'practice' | 'diagnostic' | 'skill_drill' | 'repair' | 'challenge';
  target_skills: string[] | null;
  pathway_id: string | null;
}

interface CreateSessionResponse {
  session_id: string;
  mode: string;
  engine_type: string;
  total_items: number | null;
  time_limit_ms: number | null;
  first_item: ItemDTO;
  navigation: { can_go_back: boolean; can_skip: boolean; can_flag: boolean };
  lock_token: string;
  version: number;
}

interface RecordResponseRequest {
  item_id: string;
  response_data: Record<string, unknown>;
  telemetry: {
    time_to_answer_ms: number;
    time_to_first_action_ms: number;
    answer_changes: number;
    items_since_session_start: number;
    time_since_session_start_ms: number;
    skipped_then_returned: boolean;
    scroll_to_bottom: boolean | null;
  };
  expected_version: number;
}

interface RecordResponseResponse {
  is_correct: boolean | null;
  explanation: Record<string, unknown> | null;
  next_item: ItemDTO | null;
  termination: { reason: string; auto_submitted: boolean } | null;
  progress: { answered: number; total: number | null; time_remaining_ms: number | null };
  version: number;
}

interface SubmitSessionResponse {
  session_id: string;
  status: 'submitted';
  score: { raw: number | null; scaled: number | null; band: string | null };
  summary: {
    items_answered: number;
    items_correct: number;
    duration_ms: number;
    active_duration_ms: number;
    skills_touched: string[];
  };
  pipeline_status: 'pending' | 'sync_complete';
}

interface SessionStateDTO {
  session_id: string;
  status: 'active';
  engine_type: string;
  mode: string;
  current_item: ItemDTO;
  progress: { answered: number; total: number | null; time_remaining_ms: number | null };
  navigation: { can_go_back: boolean; can_skip: boolean; can_flag: boolean };
  answered_item_ids: string[];
  lock_token: string;
  version: number;
}

interface SessionSummaryDTO {
  session_id: string;
  mode: string;
  pathway_name: string | null;
  started_at: string;
  submitted_at: string | null;
  duration_ms: number | null;
  active_duration_ms: number | null;
  score_band: string | null;
  raw_score: number | null;
  skills_touched_count: number;
}

interface CheckpointRequest {
  checkpoint_number: number;
  current_question_index: number;
  answers: Array<{ item_id: string; sequence_number: number; response_data: Record<string, unknown> }>;
  client_timestamp: string;
}
```

### 6.4 Intelligence

```typescript
interface LearningDNADTO {
  student_id: string;
  overall_level: string;
  domain_profiles: Record<string, {
    mastery: number;
    velocity: number;
    weakest_skills: string[];
    strongest_skills: string[];
  }>;
  behaviour_profile: BehaviourProfileDTO;
  active_misconceptions: Array<{ id: string; name: string; confidence: number; severity: string }>;
  active_repair_ids: string[];
  pathway_readiness: Record<string, PathwayReadinessDTO>;
  stretch_readiness: Record<string, unknown>;
  computed_at: string;
  stale_since: string | null;
}

interface SkillProgressDTO {
  skill_id: string;
  skill_name: string;
  mastery_level: number;
  confidence: number;
  velocity: number;
  retention_estimate: number;
  status: 'not_started' | 'developing' | 'proficient' | 'advanced' | 'mastered';
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  active_misconceptions: Array<{ misconception_id: string; name: string; confidence: number; severity: string }>;
  last_practiced_at: string | null;
  data_points: number;
}

interface BehaviourProfileDTO {
  avg_guess_rate: number;
  avg_fatigue_onset_minutes: number;
  persistence_score: number;
  avg_cognitive_load_comfort: number;
  time_pressure_sensitivity: number;
  session_length_sweet_spot: number;
  data_points: number;
  computed_at: string;
  stale_since: string | null;
}

interface CausalMapDTO {
  root_cause_skills: Array<{
    skill_id: string;
    skill_name: string;
    mastery: number;
    affected_skill_count: number;
    priority: 'critical' | 'high' | 'medium';
  }>;
  active_misconceptions: Array<{
    misconception_id: string;
    name: string;
    category: string;
    confidence: number;
    severity: string;
    affected_skill_count: number;
  }>;
  repair_queue: RepairSessionDTO[];
}

interface RepairSessionDTO {
  repair_record_id: string;
  misconception_id: string | null;
  misconception_name: string | null;
  root_cause_skill_id: string | null;
  root_cause_skill_name: string | null;
  repair_sequence_name: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'deferred';
  stages_completed: number;
  total_stages: number;
  estimated_duration_min: number;
  priority: 'critical' | 'high' | 'medium';
  rationale: string;
}

interface ExplanationDTO {
  summary: string;
  factors: Array<{
    factor_type: string;
    value: string | number;
    weight: number;
    direction: 'positive' | 'negative' | 'neutral';
  }>;
  source_layer: string;
  evidence_ids: string[];
  generated_at: string;
}
```

### 6.5 Orchestration

```typescript
interface LearningPlanDTO {
  plan_id: string;
  plan_type: 'weekly' | 'exam_countdown' | 'long_term' | 'transition';
  status: 'active' | 'superseded' | 'expired';
  created_at: string;
  valid_until: string;
  sessions: LearningPlanItemDTO[];
  milestones: Array<{
    week: number;
    target_skills: string[];
    expected_mastery: number;
    actual_mastery: number | null;
  }> | null;
  stale_since: string | null;
}

interface LearningPlanItemDTO {
  order: number;
  week: number | null;
  mode: string;
  target_skill_names: string[];
  target_skill_ids: string[];
  difficulty_label: string;
  estimated_duration_min: number;
  rationale: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'completed' | 'skipped';
}

interface PathwayReadinessDTO {
  pathway_slug: string;
  pathway_name: string;
  skill_readiness: number;
  coverage: number;
  condition_readiness: number;
  composite_readiness: number;
  composite_label: 'not_ready' | 'developing' | 'on_track' | 'ready' | 'strong';
  gap_skills: Array<{
    skill_id: string; skill_name: string;
    current_mastery: number; target_mastery: number;
  }>;
  active_misconceptions_affecting: number;
  predicted_ready_date: string | null;
  exam_date: string | null;
  days_remaining: number | null;
  stale_since: string | null;
}

interface PlanOverrideRequest {
  type: 'pin_skill' | 'dismiss_recommendation' | 'override_plan_item';
  target: Record<string, unknown>;
  expires_in_days?: number;  // default 14
}
```

### 6.6 Assignments

```typescript
interface AssignmentDTO {
  id: string;
  title: string;
  description: string | null;
  mode: string;
  target_skill_ids: string[];
  target_skill_names: string[];
  difficulty_range: { min: number; max: number } | null;
  item_count: number;
  time_limit_ms: number | null;
  due_at: string | null;
  status: 'draft' | 'published' | 'archived';
  auto_generated: boolean;
  rationale: string | null;
  created_by: { id: string; display_name: string };
  created_at: string;
  published_at: string | null;
}

interface CreateAssignmentRequest {
  title: string;
  description?: string;
  mode: 'practice' | 'exam' | 'diagnostic' | 'skill_drill';
  target_skill_ids: string[];
  difficulty_range?: { min: number; max: number };
  item_count: number;
  time_limit_ms?: number;
  due_at?: string;
  targets: Array<{ type: 'student' | 'class'; id: string }>;
  auto_generated?: boolean;
  rationale?: string;
}

interface StudentAssignmentDTO extends AssignmentDTO {
  my_status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  my_session_id: string | null;
  completed_at: string | null;
}

interface AssignmentTrackingDTO {
  assignment_id: string;
  targets: Array<{
    student_id: string;
    display_name: string;
    status: 'pending' | 'in_progress' | 'completed' | 'overdue';
    session_id: string | null;
    score: number | null;
    completed_at: string | null;
  }>;
  completion_rate: number;
}
```

### 6.7 Analytics

```typescript
interface InterventionAlertDTO {
  id: string;
  student_id: string;
  student_name: string;
  class_id: string | null;
  alert_type: string;
  severity: 'info' | 'warning' | 'urgent';
  status: 'active' | 'acknowledged' | 'dismissed' | 'resolved';
  detail: Record<string, unknown>;
  suggested_action: string;
  explanation: ExplanationDTO;
  created_at: string;
}

interface CohortOverviewDTO {
  cohort_key: string;
  student_count: number;
  avg_mastery: number;
  avg_velocity: number;
  top_gap_skills: Array<{ skill_id: string; skill_name: string; avg_mastery: number }>;
  top_misconceptions: Array<{ misconception_id: string; name: string; affected_count: number }>;
  alerts_active: number;
  generated_at: string;
}

interface AutoGroupDTO {
  class_id: string;
  skill_id: string;
  groups: Array<{
    label: string;
    students: Array<{ id: string; display_name: string }>;
    suggested_activity: string;
    suggested_items: string[];
  }>;
}
```

### 6.8 Billing

```typescript
interface PlanCatalogDTO {
  plans: Array<{
    tier: 'free' | 'standard' | 'premium' | 'institutional';
    display_name: string;
    price_monthly_cents: number;
    price_yearly_cents: number;
    currency: string;
    features: string[];
    popular: boolean;
    stripe_price_monthly: string;
    stripe_price_yearly: string;
  }>;
}

interface SubscriptionDTO {
  tier: 'free' | 'standard' | 'premium' | 'institutional';
  is_active: boolean;
  started_at: string;
  current_period_end: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
  stripe_subscription_id: string | null;
}

interface CheckoutRequest {
  tier: 'standard' | 'premium' | 'institutional';
  billing_interval: 'monthly' | 'yearly';
  success_url: string;
  cancel_url: string;
}

interface CheckoutResponse {
  checkout_url: string;
  session_id: string;
}

interface InvoiceDTO {
  id: string;
  stripe_invoice_id: string;
  amount_cents: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  invoiced_at: string;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
}
```

### 6.9 Engagement & Notifications

```typescript
interface EngagementSummaryDTO {
  student_id: string;
  streak: { current_days: number; best_days: number; last_active_date: string | null };
  weekly_goal: { target_sessions: number; completed_sessions: number; target_minutes: number; completed_minutes: number };
  totals: { lifetime_sessions: number; lifetime_minutes: number; skills_mastered: number };
}

interface AchievementDTO {
  id: string;
  key: string;
  name: string;
  description: string | null;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  icon: string | null;
  earned: boolean;
  earned_at: string | null;
}

interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}
```

### 6.10 Admin / Internal

```typescript
interface JobStatusDTO {
  id: string;
  job_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
  priority: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface PipelineEventDTO {
  id: string;
  session_id: string;
  step: number;
  step_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  attempts: number;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}
```

---

## Part VII — Operational Plays

### 7.1 Observability

**v1 stack (Stages 1–47):** Structured JSON logs in Supabase + Vercel error dashboard. No OpenTelemetry, no Sentry, no Honeycomb. This is sufficient for the launch-scale traffic (≤1k MAU). All paragraphs below describe the **v1.1 target**; in v1 only the Logging paragraph applies in full.

**Tracing [v1.1]:** W3C TraceContext propagated via `X-Trace-Id` and OpenTelemetry SDK. Exported to a managed OTel backend (vendor TBD; Honeycomb/Grafana Tempo are acceptable options). In v1, `X-Trace-Id` propagation is preserved (it is cheap and forward-compatible) but no OTel SDK is bundled.

**Logging:** JSON lines via Supabase log forwarder → Logtail/Datadog. Every log carries mandatory fields from §1.7. No response bodies, no stem content, no payloads.

**Metrics** (Prometheus-exported):

| Metric | Alert Threshold |
|---|---|
| `session.respond.latency_p95` | > 300 ms for 5 min |
| `session.create.latency_p95` | > 1500 ms for 5 min |
| `session.submit.latency_p95` | > 5 s for 5 min |
| `pipeline.sync.latency_p95` | > 3 s for 5 min |
| `pipeline.async.step.failure_rate` | > 5% in 1 h |
| `pipeline.dead_letter.count` | > 0 |
| `job.queue.depth` | > 100 pending for 5 min |
| `job.processing.stuck.count` | > 0 |
| `rls.violation.count` | > 0 (critical) |
| `stripe.webhook.processing.failure_rate` | > 1% |
| `api.error_rate.5xx` | > 1% in 5 min |
| `api.error_rate.429` | > 10% in 5 min |

**Health endpoints:** `GET /health` per service returning `{service, status, checks: {database, queue}}`.

**Sentry** on frontend (every error + unhandled promise rejection) and Edge Functions (every 5xx).

### 7.2 Circuit Breaker

Shared package `@mindmosaic/circuit-breaker`. States: closed/open/half-open. Threshold: 5 consecutive failures. Recovery timeout: 30 s. Wrapped around Supabase Auth calls, Stripe API, external CDN calls.

### 7.3 Idempotency Flow

```
Client: sends Idempotency-Key: <uuid>
Server:
  1. Hash request body → request_hash
  2. SELECT from api_idempotency_key WHERE (key, tenant_id)
  3a. Not found:
      INSERT (key, tenant, endpoint, request_hash, status='processing')
      Process request
      UPDATE status='completed', response_status, response_body
      Return response
  3b. Found, status='completed':
      IF request_hash matches → return cached response
      ELSE → 422 IDEMPOTENCY_MISMATCH
  3c. Found, status='processing':
      409 IDEMPOTENCY_IN_FLIGHT
  3d. Found, status='failed':
      DELETE row and reprocess
```

### 7.4 Retention Rules

| Table | Retention | Action |
|---|---|---|
| `learning_event` | Indefinite | Monthly partitions; cold-archive > 24 months |
| `session_response` | Indefinite | Monthly partitions |
| `response_telemetry` | Indefinite | Cascaded with session_response |
| `intelligence_audit_log` | 90 days hot | Parquet archive to Supabase Storage; DuckDB-queryable |
| `job_queue` | 30 days | Archive to `job_queue_archive` |
| `pipeline_event` | 90 days | Delete |
| `api_idempotency_key` | 24 hours | Delete |
| `session_checkpoint` | Session terminal | Cascade delete |
| `rate_limit_bucket` | 5 minutes | Delete |
| `outbox_event` | 7 days after processed | Delete |
| `admin_action_log` | 7 years | Compliance requirement |
| `billing_event` | 7 years | Compliance |
| `notification` | 90 days after read | Delete |

### 7.5 Graceful Degradation

| Component Failure | Degraded Behaviour | User Message |
|---|---|---|
| Database timeout | Retry 3×; return 503 | "Something went wrong, please try again" |
| Intelligence sync fails | Session stays `submitted`; retry in 60s | Score shown; dashboard "Updating…" |
| Intelligence async fails | `stale_since` set; cached Learning DNA returned | Dashboard widget shows stale badge |
| Content service empty | Widen difficulty ±0.1; else widen to parent strand | Session starts; content-gap logged |
| Orchestration fails | Return previous plan with `stale_since` | "Plan updating…" badge |
| Supabase Auth down | Cache session until token expires; reject new logins | "Please sign in again" |
| Stripe webhook delay | Subscription-tier changes delayed; feature-flag propagation best-effort | No visible impact if within SLA |

### 7.6 Data Subject Rights (APP Compliance)

**Export** (`POST /privacy/export-data`): enqueues `batch.privacy_export` job. Produces a ZIP of JSON files covering every table with caller's `user_id` or `tenant_id`. 24-hour signed download link.

**Delete** (`POST /privacy/delete-account`): enqueues `batch.privacy_delete` job after a 7-day grace period.
- Hard delete: `user_profile` cascade → session_record, response, telemetry, learning_event, skill_mastery, student_misconception, repair_record, learning_plan, engagement_streak, student_achievement, notification.
- Soft-preserve de-identified aggregates: `item.difficulty`/`discrimination` recalibrations, `cohort_metric_cache`. No individual attribution remains.
- `admin_action_log` entry written.

### 7.7 Disaster Recovery

- Daily Supabase automated snapshots; 30-day retention.
- Weekly manual point-in-time restore drill in staging.
- Stripe is the source of truth for billing state; `billing_event` is the replay log.

---

## Part VIII — Frontend Architecture

### 8.1 Stack

- **Framework:** Next.js 14 (App Router).
- **Language:** TypeScript strict mode.
- **Styling:** TailwindCSS + CSS variables (matches mockup design tokens).
- **Data fetching:** React Query (`@tanstack/react-query`) with the typed SDK.
- **Forms:** React Hook Form + Zod (schemas shared with backend).
- **Auth client:** `@supabase/supabase-js`.
- **Runtime:** Vercel Edge for read-only routes, Node for mutations.
- **Testing:** Vitest (unit), Playwright (e2e), Storybook (components).

### 8.2 Monorepo Layout

```
/apps
  /web                    Next.js app (all role-based UIs)
/packages
  /types                  DTOs + Zod schemas + SCHEMA_VERSION
  /sdk                    Typed API client + React Query hooks
  /ui                     Shared primitives (Card, Button, etc.)
  /core                   Business utilities (circuit-breaker, feature-gate, explain-format)
  /engines-client         Client-side engine helpers (timer, navigation) NOT assessment engines
/supabase
  /migrations             Sequentially numbered SQL
  /functions              Edge Function source per service
  /tests                  RLS tests, pipeline integration tests
/e2e                      Playwright specs
```

### 8.3 Routing & Role Gating

Routes live under role-scoped layouts. `app/(student)`, `app/(parent)`, `app/(teacher)`, `app/(admin)`. A middleware reads the JWT role and redirects to the correct layout. Route guards in each layout check role again as defence-in-depth.

| Route | Layout | Screen Source |
|---|---|---|
| `/login`, `/signup`, `/reset-password` | public | authentication.html |
| `/` | student | dashboard.html / learning-hub.html |
| `/learning-hub` | student | learning-hub.html |
| `/session-selection` | student | session-selection.html |
| `/session/[id]/exam` | student (full-screen) | exam_engine.html |
| `/session/[id]/practice` | student (full-screen) | practice.html |
| `/session/[id]/repair` | student (full-screen) | repair variant |
| `/results/[id]` | student | results.html |
| `/assignments` | student | student-assignments.html |
| `/engagement` | student | engagement.html |
| `/parent` | parent | parent-dashboard.html |
| `/parent/billing` | parent | billing.html |
| `/teacher` | teacher | teacher-dashboard.html |
| `/teacher/students/[id]` | teacher | teacher-student-detail.html |
| `/teacher/assignments` | teacher | assignment-engine.html |
| `/teacher/analytics` | teacher | analytics.html |
| `/admin/content-intelligence` | platform_admin | admin-intelligence.html |
| `/admin/jobs` | platform_admin | new |
| `/admin/feature-flags` | platform_admin | new |

### 8.4 Component Primitive Catalog (`packages/ui`)

Derived from the mockup CSS. One source of styling truth; no duplication.

- **Layout:** `AppShell`, `Sidebar`, `TopBar`, `PageHeader`, `EmptyState`, `ErrorBoundary`, `LoadingState`.
- **Navigation:** `NavLink`, `Tabs`, `StateSwitcher`, `Breadcrumbs`.
- **Data display:** `Card`, `StatTile`, `StatRing`, `ProgressBar`, `SkillBar`, `Heatmap`, `Table` (sortable, virtualised for long lists), `KPIGrid`.
- **Forms:** `Input`, `Select`, `Checkbox`, `RadioGroup`, `TextArea`, `DatePicker`, `NumberInput`, `Button` (primary/secondary/ghost/submit/continue/review), `IconButton`, `FormField`.
- **Overlay:** `Dialog`, `Sheet`, `Toast`, `Tooltip`, `Popover`, `Dropdown`.
- **Assessment-specific:** `QuestionStem`, `OptionList`, `CountdownTimer`, `QuestionMapSidebar`, `FlagButton`, `ExplanationPanel`, `StageProgress` (for repair).
- **Intelligence widgets:** `MasterySnapshot`, `ReadinessGauge`, `ExplainedRecommendation`, `MisconceptionBadge`, `TrendIndicator`, `StaleDataBadge`.
- **Engagement:** `StreakRing`, `AchievementCard`, `NudgeCard`, `WeeklyGoalRow`.
- **Admin:** `ItemDetailPanel`, `DriftIndicator`, `JobTable`.

### 8.5 State Model

- **Server state** (everything from APIs): React Query with per-query cache keys.
- **Local UI state:** `useState` / `useReducer`. No global store.
- **Auth/session state:** Supabase client + a single React Context (`AuthProvider`).
- **Feature flags:** `EntitlementsProvider` reads from `/users/me.entitlements`, cached 60s, invalidated on `subscription.updated` webhook via server-sent event or poll.

### 8.6 Error & Loading States

Every data-driven component renders three states minimum:

- **Loading:** Skeleton matching final shape (no spinners inside cards).
- **Empty:** Descriptive; actionable if possible.
- **Error:** Message + retry action. For 402 FEATURE_GATED → upgrade prompt. For 503 → "temporarily unavailable" with auto-retry.

All fetch errors bubble to a single error boundary per layout that logs to Sentry.

### 8.7 Accessibility

- WCAG 2.1 AA target.
- All interactive elements keyboard-reachable.
- `aria-live` regions for timer and feedback.
- Colour contrast verified (existing mockup palette passes; we lock those tokens).
- Focus visible on every control.
- `axe-core` in CI via Playwright.

### 8.8 Session UI Rules (Authoritative)

1. **Client timer is decorative only.** Server is authoritative; countdown syncs on every response.
2. **Autosave every 30 s + on blur + on low battery.** Fire-and-forget POST `/sessions/{id}/checkpoint`; UI never blocks on it.
3. **Offline tolerance:** queue responses locally; `online` event triggers replay using idempotency keys.
4. **Lock token required** in `X-Session-Lock` on every `/respond` call.
5. **Version conflict** (409 VERSION_CONFLICT) → re-fetch `/sessions/{id}/state` and reconcile.

### 8.9 Degraded UX States

| Level | Trigger | UI |
|---|---|---|
| Normal | All healthy | Full UI |
| Partial | `stale_since` non-null on any widget | "Updating…" badge; last-updated timestamp tooltip |
| Degraded | Core auth/DB down (503 persistent) | Read-only mode; session start disabled; banner "Some features temporarily unavailable" |

### 8.10 Design Token Lock

Tokens extracted from the mockups become CSS variables in `packages/ui/tokens.css`. No screen redefines colours, spacing, or radii. Changes go through a single PR.

### 8.11 Analytics & Metrics (Frontend)

- Web Vitals (LCP, INP, CLS) reported to backend `/metrics/web-vitals`.
- Client-side error rate tracked in Sentry.
- Product analytics (session starts, completions, feature clicks) via a thin wrapper around `navigator.sendBeacon` to `/metrics/event`. No third-party pixel.

### 8.12 Internationalisation (Forward-Compatible)

Phase 1–4 ship in `en-AU`. All strings extracted via `i18next` from day one. Locale switcher deferred but the plumbing is in place.

---

## Part IX — Indexing, Partitioning, Caching (Consolidated)

### 9.1 Indexes (beyond those inline)

See Part II. The critical ones are:

- `session_record`: partial unique on active, partial on pipeline_status, partial on recent.
- `session_response`, `learning_event`: dedup uniques.
- `skill_mastery`: PK + tenant index + level index.
- `item`: GIN on skill_ids, exam_families, year_levels; partial on difficulty/lifecycle.
- `job_queue`: polling composite, dedup partial unique.
- `repair_record`: dedup partial uniques for concurrency.

### 9.2 Partitioning (Day 1)

- `learning_event` — monthly range partitioning from launch (pg_partman).
- `intelligence_audit_log` — monthly range partitioning.
- `session_response` — convert to monthly partitioning at 20 M rows; create pre-partitioned table now to make the future switch a `pg_dump`/`pg_restore` job rather than an online migration.

### 9.3 Cache Strategy

| Data | Where | TTL | Invalidation |
|---|---|---|---|
| Active skill graph | Edge Function module scope | 1 h | On graph publish, stamp-check on first request |
| Item content (from v_item_current) | CDN | 24 h | Invalidate on `item_version.is_current` change |
| Feature flags per tenant | Edge Function memory | 5 min | Short TTL; no explicit invalidation |
| Learning DNA | App cache (Redis or in-DB `student_dashboard_cache`) | 60 s | Invalidate on session complete |
| Pathway readiness | App cache | 1 h | Invalidate on session complete |
| Blueprint item pools | App memory | 10 min | Low-churn |

---

## Part X — Acceptance Criteria (Release-Gate Checklist)

A release is merge-ready when all are green:

1. All migrations apply and revert cleanly in CI against a fresh Supabase project.
2. Tenant isolation test passes: zero cross-tenant reads across every tenant-scoped table.
3. DTO contract tests pass: real endpoint responses match Zod schemas.
4. Load test at 1,000 concurrent sessions: p95 `session.respond` < 300 ms, p95 `pipeline.sync` < 3 s.
5. RLS violation counter = 0.
6. `pipeline.dead_letter.count` = 0 after 1 h soak.
7. Zero TypeScript errors, zero lint errors.
8. Accessibility: `axe-core` reports no serious/critical violations.
9. Session replay test: replaying `learning_event` for a known session produces identical `skill_mastery`.
10. Idempotency test: duplicate POST returns cached response.
11. Stripe webhook replay test: 50 duplicate events processed idempotently.
12. Every new table includes an entry in `/supabase/tests/rls/` and mutability classification in `OWNERS.md`.

---

## Part XI — v1 Implementation Decisions

This part is binding on v1 work. Where it modifies an earlier rule, the decision here takes precedence for v1.

### 11.1 Tenant auto-creation (G1)

`handle_new_user()` reads `auth.users.raw_user_meta_data.role` and branches:

- `role = 'parent'` → create `tenant` (`type='family'`, `name="{display_name}'s Family"`, `slug=<uuid8>-family`, `region='au-syd'`), attach `user_profile` with `tenant_id` and `role='parent'`, write `admin_action_log` with `actor_role='self_service_signup'`.
- `role = 'student'` → raise exception (the `/auth/signup` endpoint rejects earlier; this is defence in depth).
- `role IN ('teacher','tutor','org_admin')` → require `invite_token` in metadata; verify signed JWT (7-day TTL); attach to invited tenant.

School and tutor_centre tenants are created only by `platform_admin` via `scripts/create-school-tenant.ts` in v1.

### 11.2 Pre-Stripe flag management (G2)

Stages 1–41: zero Stripe code. Authoritative `feature_flag` writers are the seed script (`supabase/seeds/06_subscriptions.sql`) and `scripts/set-tenant-tier.ts` (admin override). Direct application writes to `feature_flag` outside these are forbidden.

Stage 42+: Stripe webhook becomes authoritative writer of `subscription`; `pipeline.feature_flag_propagate` job propagates to `feature_flag`. Resolution order remains: tenant `admin_override` → tenant `subscription` → platform-wide default.

### 11.3 X-Client-Version mismatch (G3)

Log only, no rejection. Every endpoint emits `client_version` and `client_version_mismatch` log fields and continues normal processing. A stale client mid-session is safer than a forced disconnect; forced refresh requires service-worker plumbing deferred to v1.1.

### 11.4 Skill graph publish guard (G4)

`publish_skill_graph()` includes a SQL-level guard that blocks republish when downstream data exists (`skill_mastery`, `student_misconception`, active `learning_plan`), unless `app.allow_unsafe_publish=true` (transaction-local, set only by seed). The full migration worker (Part IX, §22.9.2) is **deferred to v1.1**; this guard substitutes in v1.

```sql
SELECT EXISTS (SELECT 1 FROM skill_mastery LIMIT 1)
    OR EXISTS (SELECT 1 FROM student_misconception LIMIT 1)
    OR EXISTS (SELECT 1 FROM learning_plan WHERE status = 'active' LIMIT 1)
  INTO v_has_downstream_data;
v_allow_unsafe := COALESCE(current_setting('app.allow_unsafe_publish', true)::boolean, false);
IF v_has_downstream_data AND NOT v_allow_unsafe THEN
  RAISE EXCEPTION USING
    MESSAGE='publish_skill_graph blocked: downstream data present.',
    HINT='Migration worker (v1.1) required. Set app.allow_unsafe_publish=true only for seed.',
    ERRCODE='raise_exception';
END IF;
```

### 11.5 v1 deferrals affecting backend

- §5 OpenTelemetry export — deferred to v1.1; v1 ships structured JSON logs only.
- Skill graph migration worker (§9, §22.9.2) — deferred; G4 guard substitutes.
- L4 Concept Repair pipeline — deferred. `repair_record`, `repair_sequence` tables exist from Stage 6; no writers in v1.
- L6 Stretch, L8 Content Intelligence Loop, L4 Concept Repair pipelines — deferred.
- §5.5 cron jobs `audit.archive`, `content.recalibration`, `engagement.streaks`, `follow_up.probe` — deferred (the `content.recalibration` cron exists from Stage 9 but invokes a no-op function in v1).
- Stripe dunning, refund, institutional tier flows — deferred to v1.1+.
- Engagement writer service — deferred; `engagement_streak`, `achievement_definition`, `student_achievement` tables exist from Stage 8 with no writers in v1.

### 11.6 v1 Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-21 | G1–G4 initial resolutions (formerly SPEC_GAPS.md) | Unblocking v1 execution |
| 2026-04-26 | Folded G1–G4 into arch as Part XI; marked OTel as v1.1 deferred in §1.7 and §7.1 | Single source of truth for v1 backend decisions |

---

*End of v2.0 backend + frontend architecture.*
