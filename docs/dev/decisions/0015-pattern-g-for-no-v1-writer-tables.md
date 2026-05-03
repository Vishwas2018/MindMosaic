# ADR-0015 — Pattern G for tables with no v1 writer

- Status: accepted
- Date: 2026-05-03
- Stage: 8
- Tags: backend | data | security

## Context

Stage 8 introduces billing (subscription, billing_customer, invoice, billing_event),
engagement (engagement_streak, achievement_definition, student_achievement), and
assignment_target tables. None of these tables are written to by client JWTs in v1:
billing tables are owned by Stripe webhooks + billing-svc (Stage 42+); engagement tables
are owned by an engagement worker (Stage 28+); assignment_target is owned by
assignment-svc (Stage 13+).

The question is whether to apply Pattern A (aspirational policies for future roles) or
Pattern G (RLS enabled, zero policies, deny all authenticated; service_role bypasses).

Build_CONTRACT §6 and ADR-0005 establish the principle that policies must be accurate and
tested. Aspirational policies for writers that don't yet exist create untested surface area
and false security assurance.

## Options considered

1. **Pattern A (aspirational)** — Add SELECT/INSERT/UPDATE policies for all roles that
   will eventually write these tables, even though the writers don't exist in v1.
   Pros: schema matches intended final state earlier. Cons: policies untestable (no writers),
   false security assurance, may diverge from actual Stage 42+ design.

2. **Pattern G** — RLS enabled, zero policies. Service_role bypasses for all writes.
   When the owning service is built in its target stage, it files a follow-up migration
   with policies in the same commit as the writer implementation.
   Pros: honest schema, testable (deny-all is provable), no aspirational drift.
   Cons: future migration needed when writer arrives.

## Decision

Use **Pattern G** for all tables whose v1 writer does not exist at the stage the table
is first created. The v1.1 stage (or the stage that activates the writer) files policies
in the same migration as the writer implementation.

## Rationale

Untested policies for non-existent writers are worse than no policies. Pattern G is
honest: the table exists for schema completeness, RLS is enabled, and service_role is
the only writer until the owning service ships. The BUILD_CONTRACT audit (Stage 10) will
verify that no Pattern G table has acquired policies without a corresponding implementation.

## Consequences

- Positive: honest schema, all RLS states are testable, no aspirational drift.
- Negative: follow-up migration required when each writer ships (billing: Stage 42;
  engagement: Stage 28; assignment-svc: Stage 13).
- Follow-ups: Stage 13 (assignment-svc) must include assignment_target policies;
  Stage 28 (engagement worker) must include engagement table policies;
  Stage 42 (Stripe billing) must include billing table policies.

## Implementation notes

Files: `supabase/migrations/0007_new_domains.sql` · Commit: ae47bb6
Related: ADR-0016, ISSUE-0002
