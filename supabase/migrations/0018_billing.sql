-- Migration 0018 — Billing domain tables
-- Stage 42 (Phase 4 slice start). Arch §2.12 DDL.
-- Tables: subscription, billing_customer, invoice, billing_event.
-- RLS: Pattern G (service-role only; no authenticated/anon access).
-- WARNING: billing_event is IMMUTABLE after insert (arch §1.3). Never DELETE
-- or UPDATE billing_event rows in production — they are a financial audit log
-- retained 7 years (arch §8.3).
-- Deploy order: run this migration BEFORE deploying billing-svc code. See
-- docs/dev/deployment.md §Migration 0018.
-- Deferred-validation: not run against real Postgres in sandbox (no Docker).
-- Validate with supabase db reset + supabase test db before production deploy.
-- Rollback: DROP TABLE order must respect FKs:
--   billing_event → invoice → billing_customer → subscription
--   WARNING: DROP CASCADE is irreversible for financial records.
--   Export billing_event to cold storage before any production DROP.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. subscription
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription (
  id                     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid         NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  tier                   subscription_tier NOT NULL DEFAULT 'free',
  stripe_subscription_id text         UNIQUE,
  started_at             timestamptz  NOT NULL DEFAULT now(),
  current_period_end     timestamptz,
  cancel_at              timestamptz,
  canceled_at            timestamptz,
  is_active              boolean      NOT NULL DEFAULT true,
  config                 jsonb        NOT NULL DEFAULT '{}',
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now()
);

-- One active subscription per tenant (Stripe model: one active subscription).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_active_per_tenant ON subscription(tenant_id)
  WHERE is_active = true;

CREATE OR REPLACE TRIGGER trg_subscription_updated_at
  BEFORE UPDATE ON subscription
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. billing_customer
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_customer (
  tenant_id              uuid         PRIMARY KEY REFERENCES tenant(id) ON DELETE RESTRICT,
  stripe_customer_id     text         UNIQUE NOT NULL,
  default_payment_method text,
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_billing_customer_updated_at
  BEFORE UPDATE ON billing_customer
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. invoice
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid         NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  stripe_invoice_id  text         UNIQUE NOT NULL,
  amount_cents       int          NOT NULL,
  currency           text         NOT NULL DEFAULT 'AUD',
  status             invoice_status NOT NULL,
  hosted_invoice_url text,
  invoice_pdf_url    text,
  invoiced_at        timestamptz  NOT NULL,
  paid_at            timestamptz,
  created_at         timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_tenant ON invoice(tenant_id, invoiced_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. billing_event — IMMUTABLE audit log (arch §1.3; never UPDATE or DELETE)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_event (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid         REFERENCES tenant(id) ON DELETE SET NULL,
  stripe_event_id  text         UNIQUE NOT NULL,
  event_type       text         NOT NULL,
  payload          jsonb        NOT NULL,
  processed_at     timestamptz,
  processing_error text,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

-- Partial index for unprocessed events (jobs-worker polling pattern).
CREATE INDEX IF NOT EXISTS idx_be_unprocessed ON billing_event(created_at)
  WHERE processed_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — Pattern G: service-role only, no authenticated/anon direct access.
-- service_role bypasses RLS by Supabase default. No CREATE POLICY needed.
-- See: supabase/migrations/0006_jobs_outbox_rate_limit.sql (Pattern G precedent).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE subscription     ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice          ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_event    ENABLE ROW LEVEL SECURITY;
