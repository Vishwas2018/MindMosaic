# ADR-0008 — Content-table RLS — Pattern F (public-read-published / service-role-write) with draft graph isolation

- Status: accepted
- Date: 2026-05-02
- Stage: 3
- Tags: backend, security

## Context

Stage 3 creates 10 tables. DEV_PLAN.md Stage 3 deliverables do not mention RLS.
BUILD_CONTRACT §6 requires "RLS in the same migration as CREATE TABLE — never a
follow-up migration." Stage 4 specifies "RLS Pattern F (admin-write, public-read for
active)" for assessment config tables, implying the same pattern applies to Stage 3
content catalog tables.

Two design constraints drive the policy shape:

1. **Draft graph isolation** — `skill_node` and `skill_edge` belong to a
   `skill_graph_version`. Draft graph content must not be visible to authenticated
   users (only published graphs are authoritative). A cross-table predicate is required.
   Per ADR-0005, such predicates must use a SECURITY DEFINER helper to avoid recursive
   RLS evaluation.

2. **FORCE ROW LEVEL SECURITY must NOT be used** — FORCE RLS applies policies even to
   the table owner, blocking service_role writes that Pattern F intentionally allows.
   Standard `ENABLE ROW LEVEL SECURITY` (without FORCE) lets service_role bypass,
   which is correct for catalog tables written only by seed scripts / service functions.

## Options considered

1. **No RLS** — Content is public catalog; all authenticated reads are fine.
   Rejected: violates BUILD_CONTRACT §6 (must decide now; cannot add later). Also
   exposes draft graph content.
2. **Pattern F with FORCE RLS** — Blocks service_role writes. Rejected: incorrect.
3. **Pattern F without FORCE + draft graph isolation via SECURITY DEFINER helper
   (adopted)** — Correct, BUILD_CONTRACT §6 compliant, ADR-0005 compliant.

## Decision

Apply `ENABLE ROW LEVEL SECURITY` (no FORCE) on all 10 Stage 3 tables. Use the
helper `fn_graph_version_is_published(uuid)` (SECURITY DEFINER, ADR-0005 pattern)
for the graph-scoped tables. Policy details per table:

| Table | SELECT policy | Write policy |
|---|---|---|
| skill_graph_version | `status = 'published'` | service_role only (no authenticated policy) |
| skill_node | `fn_graph_version_is_published(graph_version_id)` | service_role only |
| skill_edge | `fn_graph_version_is_published(graph_version_id)` | service_role only |
| skill_migration_map | none for authenticated (service_role only reads/writes) | service_role only |
| misconception | `(true)` | service_role only |
| repair_sequence | `(true)` | service_role only |
| stimulus | `(true)` | service_role only |
| item | `(true)` | service_role only |
| item_version | `(is_current = true)` | service_role only |

`item_version` exposes only `is_current = true` rows to authenticated. Prior versions
are content history; they are irrelevant for assessment (which always reads current
version) and v_item_current already enforces this. Defense-in-depth at the RLS layer
is correct.

`fn_graph_version_is_published` helper:
```sql
CREATE FUNCTION fn_graph_version_is_published(gv_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM skill_graph_version
    WHERE id = gv_id AND status = 'published'
  );
$$;
REVOKE EXECUTE ON FUNCTION fn_graph_version_is_published(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_graph_version_is_published(uuid) TO authenticated;
```

`publish_skill_graph()` is SECURITY DEFINER (see rationale). Grants: service_role only.

## Rationale

**Draft isolation is a correctness requirement** — without it, authenticated users could
read draft skill nodes/edges and see unpublished content or rely on IDs that may change
before publish. The SECURITY DEFINER helper avoids recursive RLS evaluation (ADR-0005).

**publish_skill_graph() must be SECURITY DEFINER** — under Pattern F, authenticated
users have no write policy on skill_graph_version. The function archives the old
published version and publishes the draft. It also reads draft skill_edge rows for
cycle detection — which are not visible to authenticated under the
fn_graph_version_is_published policy. SECURITY DEFINER resolves both access issues in
one declaration.

**service_role bypasses RLS** — Supabase service_role key bypasses all RLS policies
by default. Seeder scripts and Edge Functions called with service_role key can
read/write all content tables without a write policy. This is the intended Pattern F
behavior.

## Consequences

- Positive: Draft graph content never leaks to authenticated users. Content writes
  are constrained to service_role and SECURITY DEFINER functions. BUILD_CONTRACT §6
  compliant from day one.
- Negative: `fn_graph_version_is_published` is called per row for skill_node and
  skill_edge queries under authenticated role. Acceptable — it is a simple EXISTS
  on a small, indexed table.
- Follow-ups: If Stage 18+ adds an authenticated admin endpoint to query draft
  graphs or to call `publish_skill_graph()`, add:
  (a) A SELECT policy on `skill_graph_version`/`skill_node`/`skill_edge` guarded by
      `auth_role() IN ('platform_admin')` (pattern: authenticated + role check)
  (b) `GRANT EXECUTE ON FUNCTION publish_skill_graph(uuid) TO authenticated` with an
      internal role guard inside the function
  These policies are NOT added pre-emptively here — they belong at the stage where the
  endpoint is created. Attempting to query drafts or publish via an authenticated JWT
  in Stage 3–17 will correctly return empty results / permission denied.

## Implementation notes

Files: `supabase/migrations/0002_content_skill_graph.sql` (RLS block + helper)
Related: ADR-0005 (SECURITY DEFINER pattern), ADR-0007 (G4 guard), Stage 3 §2A
