-- =============================================================================
-- Migration 0019 — user_role 'system' enum value + sentinel rows
-- Stage: 44
-- Linked: Q-44.1, Q-44.5, Q-42.7
-- =============================================================================
--
-- One-way DDL (same class as migration 0017).
-- ALTER TYPE ... ADD VALUE is non-transactional; cannot be rolled back inside
-- a transaction. Deploy BEFORE billing-svc update that calls handleFlagPropagate.
-- Verify: SELECT enum_range(NULL::user_role) must include 'system'.
--
-- Deploy order requirement (docs/dev/deployment.md migration 0019 section):
--   1. Run this migration.
--   2. Verify enum and sentinel rows exist.
--   3. THEN deploy billing-svc with handleFlagPropagate.
-- =============================================================================

-- ── Step 1: Add 'system' to user_role enum (Q-44.1) ──────────────────────────
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'system';
-- COMMIT required: PostgreSQL prohibits using a newly-added enum value in the
-- same transaction. COMMIT makes 'system' visible to subsequent statements.
COMMIT;

-- ── Step 2: Sentinel tenant row (Q-44.5) ─────────────────────────────────────
-- Required because user_profile.tenant_id is NOT NULL REFERENCES tenant(id).
-- type='family' is arbitrary; slug='__system__' is the sentinel identifier.
-- ON CONFLICT DO NOTHING: idempotent for fresh-DB replay and supabase db reset.
INSERT INTO tenant (id, name, slug, type)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'System',
  '__system__',
  'family'  -- type='family' arbitrary; slug '__system__' is the sentinel identifier
)
ON CONFLICT (id) DO NOTHING;

-- ── Step 3: Sentinel system user_profile row (Q-42.7, Q-44.1) ────────────────
-- Satisfies admin_action_log.actor_id NOT NULL REFERENCES user_profile(id)
-- for system pipeline writes (handleFlagPropagate audit entries).
-- id matches SENTINEL_SYSTEM_USER_ID in billing-svc/handlers.ts.
-- ON CONFLICT DO NOTHING: idempotent for fresh-DB replay.
INSERT INTO user_profile (id, tenant_id, role, display_name)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'system',
  'System'
)
ON CONFLICT (id) DO NOTHING;
