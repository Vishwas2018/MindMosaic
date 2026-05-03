-- Seed 05 — Feature Flags
-- G2: Pre-Stripe. Flags set directly (no Stripe webhook). Source = 'subscription'.
-- Both NAPLAN and ICAS features enabled for the seed tenant (free tier).
-- Idempotent: ON CONFLICT (id) DO NOTHING.
-- =============================================================================

INSERT INTO feature_flag (id, tenant_id, feature_key, enabled, config, source)
VALUES
(
  'a000000b-0000-0000-0000-000000000001',
  'a0000009-0000-0000-0000-000000000001',
  'naplan_y5',
  true,
  '{"year_levels":[5],"subjects":["numeracy"]}',
  'subscription'
),
(
  'a000000b-0000-0000-0000-000000000002',
  'a0000009-0000-0000-0000-000000000001',
  'icas_math_y5',
  true,
  '{"year_levels":[5],"subjects":["mathematics"]}',
  'subscription'
),
(
  'a000000b-0000-0000-0000-000000000003',
  'a0000009-0000-0000-0000-000000000001',
  'skill_practice',
  true,
  '{}',
  'subscription'
),
(
  'a000000b-0000-0000-0000-000000000004',
  'a0000009-0000-0000-0000-000000000001',
  'parent_dashboard',
  true,
  '{}',
  'subscription'
)
ON CONFLICT (id) DO NOTHING;
