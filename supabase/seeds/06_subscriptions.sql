-- Seed 06 — Subscriptions
-- G2: Pre-Stripe. stripe_subscription_id = NULL. Free tier only.
-- current_period_end set far in future so seed data never expires during dev.
-- Idempotent: ON CONFLICT (id) DO NOTHING.
-- =============================================================================

INSERT INTO subscription (id, tenant_id, tier, stripe_subscription_id, started_at, current_period_end, is_active)
VALUES (
  'a000000c-0000-0000-0000-000000000001',
  'a0000009-0000-0000-0000-000000000001',
  'free',
  NULL,
  now(),
  '2099-12-31 00:00:00+00',
  true
)
ON CONFLICT (id) DO NOTHING;
