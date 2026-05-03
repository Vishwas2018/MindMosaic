# ADR-0016 — Service-owned state machine; no DB state-transition triggers

- Status: accepted
- Date: 2026-05-03
- Stage: 8
- Tags: backend | data | infra

## Context

Stage 8 introduces assignment (status: draft → published → archived) and
assignment_session (status: pending → in_progress → completed → overdue). Both are
controlled-mutable tables (BUILD_CONTRACT §8) with well-defined lifecycle transitions.

The question is whether to enforce state-transition rules at the database level (via
CHECK constraints or BEFORE UPDATE triggers) or at the application service layer.

Precedent: session_record (Stage 5) uses controlled-mutable pattern with service-layer
enforcement and optimistic locking. No DB state-machine triggers were added.

## Options considered

1. **DB trigger enforcement** — A BEFORE UPDATE trigger raises an error if the new
   status is not a valid transition from the current status.
   Pros: database-level guarantee, impossible to bypass via service bugs.
   Cons: migration-time DDL change every time a new transition is needed; testing
   requires trigger-level tests (harder to unit-test in isolation); tight coupling between
   DB schema and business logic; makes replay/repair jobs harder.

2. **Service-layer enforcement** — The owning service validates state transitions before
   issuing UPDATE. DB enforces structural integrity only (column type, NOT NULL, RLS).
   Pros: business logic lives where it's testable (service unit tests, integration tests);
   easy to evolve without migrations; consistent with session_record precedent (Stage 5).
   Cons: service bugs could bypass state machine (mitigated by integration tests and
   the fact that RLS denies client-JWT writes anyway).

## Decision

Use **service-layer enforcement** (Option 2). The DB enforces structural integrity
(column types, NOT NULL, check constraints on non-state columns). State transitions are
validated by the owning service before UPDATE. No BEFORE UPDATE triggers for state
machines.

## Rationale

BUILD_CONTRACT §8 classifies assignment as "controlled mutable". The owning service
(assignment-svc, Stage 13) must enforce transitions. This is consistent with
session_record (Stage 5). DB-level state machines add migration overhead without
meaningful security benefit, since RLS already prevents client-JWT writes.

## Consequences

- Positive: simpler migrations, testable business logic, consistent with session_record.
- Negative: service must be disciplined about transitions; no DB backstop.
- Follow-ups: assignment-svc (Stage 13) must implement state-machine validation in
  service layer, covered by integration tests.

## Implementation notes

Files: `supabase/migrations/0007_new_domains.sql` · Commit: ae47bb6
Related: ADR-0015, Stage 5 session_record pattern
