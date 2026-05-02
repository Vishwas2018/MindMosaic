# ADR-0012 — Partitioned-table unique constraints must include all partition key columns

- Status: accepted
- Date: 2026-05-02
- Stage: 5 (audit day)
- Tags: data, backend

## Context

`learning_event` is partitioned `BY RANGE (created_at)`. The initial DDL declared
`id uuid PRIMARY KEY DEFAULT gen_random_uuid()` without including `created_at`.
PostgreSQL rejected this at `supabase db reset` time with SQLSTATE 0A000:
> unique constraint on partitioned table must include all partitioning columns

PostgreSQL declarative partitioning requires every `UNIQUE` constraint (including
`PRIMARY KEY`, which is implicitly unique) to include all columns that appear in
the `PARTITION BY` clause. This ensures each partition's local unique index can
enforce the constraint independently without cross-partition coordination.

The same rule applies to any `CREATE UNIQUE INDEX` on a partitioned table.
`idx_le_dedup` on `learning_event` was also missing `created_at` and required the
same fix.

## Options considered

1. **Include `created_at` in `PRIMARY KEY (id, created_at)` and all UNIQUE indexes** —
   correct per PostgreSQL semantics. FKs referencing `learning_event(id)` would need
   to include `created_at` too, but no such FKs exist in v1 (`learning_event` is a
   write-terminal table).
2. **Remove the partition and use a standard table** — defeats the purpose of monthly
   partitioning for retention/performance. Not viable.

## Decision

Use **Option 1**: include all partition key columns in every `PRIMARY KEY` and
`CREATE UNIQUE INDEX` on partitioned tables.

For `learning_event`:
- `PRIMARY KEY (id, created_at)` instead of `id uuid PRIMARY KEY`
- `idx_le_dedup` includes `created_at` as the final column

## Rationale

This is a PostgreSQL hard constraint, not a design choice. Option 1 is the only
viable path. The write-terminal nature of `learning_event` (no FK references to its
PK from other tables in v1) means the composite PK causes no cascade complexity.

## Consequences

- Positive: Migration applies cleanly; future monthly partitions created by
  pg_partman inherit the composite PK without issue.
- Negative: Application code that queries `learning_event` by `id` alone is
  unaffected (PK lookups still work); but any hypothetical FK from another table
  to `learning_event(id)` would need to include `created_at`. In v1 no such FK
  exists.
- Follow-ups: Apply this rule mechanically to `intelligence_audit_log` (Stage 6,
  also partitioned monthly — see BUILD_CONTRACT §8 Partitioning). Add a checklist
  item to the migration checklist in `BUILD_CONTRACT §10`.

## Implementation notes

Files: `supabase/migrations/0004_sessions_events.sql` (learning_event DDL + idx_le_dedup)  
Commit: (Stage 5 commit)  
Related: BUG-A (Stage 5 DAILY_LOG)
