# ADR-0004 — UTA-table RLS: minimal tenant-isolation; per-role SELECT deferred to Stage 5

- Status: accepted
- Date: 2026-05-01
- Stage: 2
- Tags: backend, security

## Context

Stage 2 creates 6 client-readable UTA tables (tenant, user_profile,
parent_student_link, class_group, class_student, feature_flag) and must add RLS
policies. Arch §2.2 ultimately requires per-role SELECT granularity (e.g.,
students see only their own profile; parents see only linked children; teachers
see only class members). However:

1. Per-role subqueries reference `user_profile` and `parent_student_link`, which
   may themselves be locked by the very policies being defined — creating
   potential recursion and ordering complexity.
2. Pattern A (student-data tables: `skill_mastery`, `session_record`, etc.) does
   not exist until Stage 5. The per-role policies make most sense once those
   tables are live and the full SECURITY DEFINER helper suite is in place.
3. Adding per-role policies now requires defensive fallbacks for partial states
   that don't exist yet, making them harder to test correctly at Stage 2.

## Options considered

1. **Minimal tenant-isolation only (Stage 2), per-role extended in Stage 5** —
   Simple, fully testable with Stage 2 data. Known limitation tracked in
   ISSUE-0001.
2. **Full per-role policies now** — Complex SECURITY DEFINER helpers with
   partial-state guards. Higher risk of policy logic errors before the schema
   is stable.

## Decision

Use minimal tenant-isolation policies (`tenant_id = auth_tenant_id()`) for all
6 UTA tables at Stage 2. Stage 5 must extend these with per-role SELECT
granularity when Pattern A tables are created.

## Rationale

Tenant isolation (the hard security boundary) is enforced from day one. Per-role
SELECT granularity within a tenant is a UX/compliance concern — not a
data-breach risk — because family tenants have 1–3 members and school tenants
are managed by org admins. The risk of incorrect early policies outweighs the
benefit. ISSUE-0001 tracks the gap explicitly.

## Consequences

- Positive: Simple, testable RLS at Stage 2. Tenant boundary fully enforced.
- Negative: Within-tenant cross-role row reads are possible until Stage 5.
  Tracked in ISSUE-0001.
- Follow-ups: Stage 5 §2A review must plan per-role SELECT policies for all
  6 UTA tables before claiming Pattern A complete.

## Implementation notes

Files: `supabase/migrations/0001_enums_tenancy_auth.sql` §9 · Commit: e58a925
Related: ISSUE-0001 (closed wont-fix 2026-05-02 — see correction below), ADR-0005

## Correction (2026-05-02)

The `Related: ISSUE-0001` reference above is now a stale pointer. ISSUE-0001 (original,
filed 2026-05-01) was closed as wont-fix on 2026-05-02 (Stage 3 morning reconciliation)
with rationale: duplicate of this ADR's deferral. The Stage 5 obligation is fully captured
in this ADR's "Follow-ups" section. ISSUE-0001 was subsequently refiled as the Node CI
runtime upgrade (GitHub Actions Node 20 deprecation — unrelated to RLS). No change to
Context, Decision, Rationale, or Consequences. The Stage 5 forward-flag stands.
