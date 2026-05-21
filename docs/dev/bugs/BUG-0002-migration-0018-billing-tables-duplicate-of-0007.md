# BUG-0002 — migration 0018: billing tables duplicate of migration 0007

- Status: fixed
- Severity: high
- Reported: 2026-05-21 (v1.1-S7.1 Gate III unblock)
- Area: infra
- Tags: migration · billing · db-reset

## Summary

`supabase db reset` permanently fails at migration 0018 with
`ERROR: relation "subscription" already exists`. Migration 0007
(`new_domains`, Stage 8) already created the full billing schema —
`subscription`, `billing_customer`, `invoice`, `billing_event` plus
their triggers, indexes, and RLS. Migration 0018 (`billing`, Stage 42)
is a complete duplicate: every CREATE TABLE, CREATE INDEX, CREATE TRIGGER,
and ENABLE ROW LEVEL SECURITY statement is semantically identical to 0007.

No DB was ever fully reset after migration 0018 was introduced, so the
conflict was not caught until Gate III triggered the first `db reset`.

## Root cause

Migration 0007 was authored at Stage 8 to include ALL four "new domain"
groups: Assignments (§2.11), Billing (§2.12), Engagement (§2.13), and
Notifications (§2.14). Migration 0018 was authored at Stage 42 planning
under the assumption that the billing tables did not yet exist in the
schema — exact copy of arch §2.12 DDL. Neither author cross-checked 0007.

**0007 is the authoritative source.** All billing tables have been live
in the running DB since Stage 8.

## Diff result (0007 vs 0018)

All objects confirmed semantically identical (whitespace differences only):

| Object | Identical? |
|--------|-----------|
| `subscription` table (12 columns) | ✓ |
| `idx_sub_active_per_tenant` | ✓ |
| `trg_subscription_updated_at` | ✓ |
| `billing_customer` table (5 columns) | ✓ |
| `trg_billing_customer_updated_at` | ✓ |
| `invoice` table (10 columns) | ✓ |
| `idx_invoice_tenant` | ✓ |
| `billing_event` table (8 columns) | ✓ |
| `idx_be_unprocessed` | ✓ |
| RLS enables (4 tables) | ✓ (idempotent) |

## Fix

Guard all CREATE statements in migration 0018 with `IF NOT EXISTS` /
`CREATE OR REPLACE` so the migration is idempotent whether or not 0007
has already run. RLS `ENABLE` statements are already idempotent; no
change needed there.

- `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS` (×4)
- `CREATE UNIQUE INDEX` / `CREATE INDEX` → `CREATE … IF NOT EXISTS` (×3)
- `CREATE TRIGGER` → `CREATE OR REPLACE TRIGGER` (×2)

- Commit: (pending — `fix(db): make migration 0018 idempotent (BUG-0002)`)
- Regression-tested: `supabase db reset` clean run, all 24 migrations applied
