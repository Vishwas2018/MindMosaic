# ADR-0007 — G4 publish-guard: to_regclass forward-compatibility for downstream-data tables

- Status: accepted
- Date: 2026-05-02
- Stage: 3
- Tags: backend, data, dx

## Context

Spec Part III.5 §V1.4 and Arch Part XI §11.4 both specify the G4 code guard inside
`publish_skill_graph()`. The verbatim spec SQL is:

```sql
SELECT EXISTS (SELECT 1 FROM skill_mastery LIMIT 1)
    OR EXISTS (SELECT 1 FROM student_misconception LIMIT 1)
    OR EXISTS (SELECT 1 FROM learning_plan WHERE status = 'active' LIMIT 1)
  INTO v_has_downstream_data;
```

`skill_mastery`, `student_misconception`, and `learning_plan` are all Stage 6 tables
(Migration 0005). At Stage 3, only migrations 0001 and 0002 exist. PL/pgSQL resolves
table references at execution time, so function creation succeeds — but calling
`publish_skill_graph()` with the verbatim spec SQL raises `relation "skill_mastery"
does not exist` before Stage 6. The Stage 3 exit criterion ("publish blocked when
skill_mastery populated") cannot be tested with the verbatim SQL.

## Options considered

1. **to_regclass() guards (adopted)** — Wrap each EXISTS in `to_regclass('public.X') IS NOT NULL`
   check. Function works correctly at Stage 3 (tables absent → short-circuits → false)
   and continues correct behavior after Stage 6 (tables present → EXISTS fires normally).
2. **pgTAP stub tables** — Use verbatim spec SQL; pgTAP test creates minimal stub tables
   in-transaction to simulate table presence. Fragile: stub schema may diverge from Stage 6
   actual schema; maintenance burden.
3. **Defer G4 data-guard test to Stage 6** — Use verbatim spec SQL; skip the guard test
   until tables exist. Leaves the guard untested for 3 stages; misses the exit criterion.

## Decision

Implement the G4 guard with `to_regclass()` guards:

```sql
SELECT
  (to_regclass('public.skill_mastery') IS NOT NULL
    AND EXISTS (SELECT 1 FROM skill_mastery LIMIT 1))
  OR (to_regclass('public.student_misconception') IS NOT NULL
    AND EXISTS (SELECT 1 FROM student_misconception LIMIT 1))
  OR (to_regclass('public.learning_plan') IS NOT NULL
    AND EXISTS (SELECT 1 FROM learning_plan WHERE status = 'active' LIMIT 1))
INTO v_has_downstream_data;
```

Order within `publish_skill_graph()`: cycle detection runs **first**, G4 guard **second**.
Rationale for ordering: a cyclic graph is always invalid regardless of downstream data;
rejecting it first gives the clearer, more actionable error. The G4 guard is a safety
net for migration-worker absence, not a graph-validity check.

## Rationale

The spec's verbatim SQL was written assuming all tables exist at publish time. The v1
build sequence creates them three stages later. The `to_regclass()` approach preserves
the spec's semantic intent ("block when downstream data present") while being correct at
every migration stage. It introduces no test scaffolding burden and requires no Stage 6
changes — the guard auto-activates as each table comes online.

## Consequences

- Positive: Function callable and testable from Stage 3. Guard activates automatically
  as Stage 6 tables appear. No schema-divergence risk from stub tables.
- Negative: Minor deviation from verbatim spec SQL. Documented here.
- Follow-ups: At Stage 6, add a regression test confirming the guard fires against real
  `skill_mastery` rows (not stub). No code change needed — the to_regclass check just
  finds the real table.

## Concurrency caveat

The in-transaction `CREATE TABLE skill_mastery` stub pattern used in the Stage 3
pgTAP G4 guard test is only safe under **serial test execution**. If parallel pgTAP
runners are introduced (e.g., multiple workers sharing the same database), concurrent
stub-table creation could produce conflicting DDL or misleading results. Today, pgTAP
runs serially against the Supabase local dev database — no immediate risk. If parallel
runners are introduced at any future stage, the G4 guard test must be moved to a
separate database schema or refactored to use a dedicated test fixture table defined
at migration time and truncated between test runs.

## Implementation notes

Files: `supabase/migrations/0002_content_skill_graph.sql` (publish_skill_graph function)
· COMMENT on FUNCTION references this ADR · Stage 3 pgTAP tests use in-transaction
CREATE TABLE stub for G4 guard assertion (see §2A item e, Stage 3).
Related: ADR-0008 (content-table RLS), Stage 3 §2A (spec ambiguity resolution)

## Implementation correction (2026-05-02 — Stage 3 execution)

The SQL shown in the Decision section above (plain `SELECT (to_regclass(...) IS NOT NULL AND EXISTS (...))`)
does **not work** in PL/pgSQL. PL/pgSQL parses the entire SQL statement at execution time before boolean
short-circuit can prevent `EXISTS` from running. Table names in the `EXISTS` clause are resolved by the
parser even when `to_regclass()` returns NULL, producing `relation "skill_mastery" does not exist`.

The correct implementation uses `EXECUTE` (dynamic SQL) inside `IF` blocks:

```sql
v_has_downstream := false;

IF to_regclass('public.skill_mastery') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM skill_mastery LIMIT 1)'
  INTO v_has_downstream;
END IF;

IF NOT v_has_downstream AND to_regclass('public.student_misconception') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM student_misconception LIMIT 1)'
  INTO v_has_downstream;
END IF;

IF NOT v_has_downstream AND to_regclass('public.learning_plan') IS NOT NULL THEN
  EXECUTE $dyn$SELECT EXISTS (SELECT 1 FROM learning_plan WHERE status = 'active' LIMIT 1)$dyn$
  INTO v_has_downstream;
END IF;
```

`EXECUTE` defers parsing of the SQL string until after `to_regclass()` confirms the table exists.
Decision and rationale are unchanged — `to_regclass()` + conditional `EXECUTE` is the correct form.
