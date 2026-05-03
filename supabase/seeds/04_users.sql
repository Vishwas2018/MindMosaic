-- Seed 04 — Test Tenant + User Profiles
-- NOTE: These are profile-only records. Matching auth.users rows must be created
--       via the signup flow or Supabase dashboard — not seeded here (G1 constraint).
-- Idempotent: ON CONFLICT (id) DO NOTHING throughout.
-- =============================================================================

-- ─── tenant ──────────────────────────────────────────────────────────────────

INSERT INTO tenant (id, name, slug, type, region)
VALUES (
  'a0000009-0000-0000-0000-000000000001',
  'Joshi Family',
  'joshi-family-seed',
  'family',
  'au-syd'
)
ON CONFLICT (id) DO NOTHING;

-- ─── user_profiles ───────────────────────────────────────────────────────────
-- parent + 2 students under the same tenant.
-- year_level NULL for parent (not applicable).

INSERT INTO user_profile (id, tenant_id, role, email, display_name, year_level, preferences)
VALUES
(
  'a000000a-0000-0000-0000-000000000001',
  'a0000009-0000-0000-0000-000000000001',
  'parent',
  'seed-parent@example.com',
  'Seed Parent',
  NULL,
  '{}'
),
(
  'a000000a-0000-0000-0000-000000000002',
  'a0000009-0000-0000-0000-000000000001',
  'student',
  'seed-student1@example.com',
  'Seed Student A',
  5,
  '{"theme":"light"}'
),
(
  'a000000a-0000-0000-0000-000000000003',
  'a0000009-0000-0000-0000-000000000001',
  'student',
  'seed-student2@example.com',
  'Seed Student B',
  5,
  '{"theme":"light"}'
)
ON CONFLICT (id) DO NOTHING;

-- ─── parent_student_link ─────────────────────────────────────────────────────

INSERT INTO parent_student_link (parent_id, student_id)
VALUES
(
  'a000000a-0000-0000-0000-000000000001',
  'a000000a-0000-0000-0000-000000000002'
),
(
  'a000000a-0000-0000-0000-000000000001',
  'a000000a-0000-0000-0000-000000000003'
)
ON CONFLICT (parent_id, student_id) DO NOTHING;
