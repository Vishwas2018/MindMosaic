# PGTAP_PATTERNS.md — pgTAP Test Pattern Catalogue

> Referenced by BUILD_CONTRACT §10 item 5. Append-only: add new
> patterns as discovered; correct existing entries with a dated note.
> Per ADR-0006: every novel pgTAP pattern introduced in a stage must
> be skelton-documented before the stage commit lands.

---

## Pattern 1 — Cross-tenant SELECT zero-rows isolation

**Discovered:** Stage 2 (001_tenancy.sql, 002_content.sql)
**Applies to:** Every tenant-scoped table, every new migration.

```sql
-- Seed both tenants in setup (as postgres / service_role):
--   tenant_A rows, tenant_B rows

SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"<tenant_B_user_id>","app_metadata":{"role":"student","tenant_id":"<tenant_B_id>"}}',
  true);

SELECT is(
  (SELECT count(*)::int FROM <table> WHERE tenant_id = '<tenant_A_id>'),
  0,
  '<table>: tenant B user reads zero rows from tenant A');

RESET ROLE;
```

**Rationale:** Core isolation invariant per BUILD_CONTRACT §10. Must
appear for every tenant-scoped table in every stage. Failure means RLS
policy has a missing or incorrect `tenant_id = auth_tenant_id()` guard.

---

## Pattern 2 — DML deny (UPDATE/DELETE) via DML-CTE + throws_ok SQLSTATE

**Discovered:** Stage 2. BUG-D correction applied Stage 4.
**Applies to:** UPDATE/DELETE that RLS silently denies (returns 0 rows).

```sql
-- Silent UPDATE/DELETE deny — RLS filters rows, no error raised:
WITH x AS (
  UPDATE <table> SET <col> = <value>
  WHERE <predicate-that-rls-will-deny>
  RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM x),
  0,
  'authenticated UPDATE on <table> denied by RLS (0 rows affected)');
```

**throws_ok 4-arg for SQLSTATE-only assertion (BUG-D correction):**

```sql
-- WRONG (3-arg checks the message text, not the SQLSTATE):
SELECT throws_ok($$SELECT fn()$$, 'P0001', 'description');

-- CORRECT (4-arg, NULL message = match any message; only SQLSTATE checked):
SELECT throws_ok($$SELECT fn()$$, 'P0001', NULL, 'description');

-- CORRECT (4-arg, check both SQLSTATE and exact message substring):
SELECT throws_ok($$SELECT fn()$$, 'P0001', 'VERSION_CONFLICT', 'description');
```

**Rationale:** `throws_ok(sql, errcode, description)` (3-arg) silently
checks the MESSAGE not the SQLSTATE — a pgTAP API footgun. Use 4-arg
always. Pass `NULL` as the third argument to assert SQLSTATE only.
BUG-D: originally misstated as 3-arg in PROJECT_STATE Stage 4; corrected.

---

## Pattern 3 — SECURITY DEFINER helper shape (5 assertions)

**Discovered:** Stage 2. BUG-C (anon check) added Stage 5.
**Applies to:** Every new SECURITY DEFINER function (ADR-0005, ADR-0008, BUG-C).

```sql
-- 1. Function exists
SELECT has_function('public', '<fn_name>', ARRAY['<param_type>'], 'fn exists');

-- 2. SECURITY DEFINER flag set
SELECT is(
  (SELECT prosecdef FROM pg_proc
   WHERE proname = '<fn_name>' AND pronamespace = 'public'::regnamespace),
  true,
  '<fn_name> is SECURITY DEFINER');

-- 3. Volatility = STABLE ('s')
SELECT is(
  (SELECT provolatile FROM pg_proc
   WHERE proname = '<fn_name>' AND pronamespace = 'public'::regnamespace),
  's',
  '<fn_name> volatility is STABLE');

-- 4. PUBLIC cannot execute (double REVOKE strips PUBLIC pseudo-role)
SELECT is(
  has_function_privilege('public', 'public.<fn_name>(<param_type>)', 'execute'),
  false,
  '<fn_name> REVOKE FROM PUBLIC — public cannot execute');

-- 5. anon cannot execute (explicit REVOKE; BUG-C Stage 5 — Supabase
--    default-privilege auto-grants EXECUTE to anon on new functions;
--    triple-REVOKE pattern in BUILD_CONTRACT §6 guards this)
SELECT is(
  has_function_privilege('anon', 'public.<fn_name>(<param_type>)', 'execute'),
  false,
  '<fn_name> REVOKE FROM anon — anon cannot execute');
```

**Rationale:** SECURITY DEFINER helpers must not be callable by unauthenticated
roles. Supabase local dev applies `ALTER DEFAULT PRIVILEGES GRANT EXECUTE TO anon`
on all new functions — REVOKE FROM PUBLIC alone is insufficient (ISSUE-0002).
BUILD_CONTRACT §6 mandates triple REVOKE: `REVOKE FROM PUBLIC; REVOKE FROM authenticated;
REVOKE FROM anon;` after each new SECURITY DEFINER function (A1 correction Stage 8:
the prior "PUBLIC × 2 + anon" was wrong — second PUBLIC revoke was a no-op).

---

## Pattern 4 — Anon role access denial (helper-policy tables)

**Discovered:** Stage 6, Lesson 2.
**Applies to:** Tables whose RLS policies call SECURITY DEFINER helpers
(e.g., `fn_teacher_student_ids`, `fn_my_child_ids`, `auth_role`, `auth_tenant_id`).

**DO NOT use:**
```sql
-- WRONG — causes "permission denied for function <fn>" error,
-- not a clean 0-row result. RLS policy evaluation calls the helper;
-- anon lacks EXECUTE on it; query fails before returning rows.
RESET ROLE;
SET ROLE anon;
SELECT is((SELECT count(*)::int FROM <table>), 0, 'anon denied');
RESET ROLE;
```

**USE instead:**
```sql
-- CORRECT — catalog check, no actual query execution:
SELECT is(
  has_function_privilege('anon', 'public.<fn_name>(<param_type>)', 'execute'),
  false,
  '<fn_name> REVOKE FROM anon — anon cannot execute (Stage 4 G16 pattern)');
```

**Exception:** Tables with NO policies (Pattern G deny-all) are safe for
`SET ROLE anon; SELECT count(*)` — zero policies means zero function calls;
anon sees 0 rows without touching any helper. Example: `plan_revision` (Stage 6).

**Rationale:** Stage 4 G16 established the `has_function_privilege` pattern.
Stage 6 discovered that `SET ROLE anon; SELECT count(*) FROM <table>` fails with
"permission denied for function" when any RLS policy in the table's USING clause
calls a REVOKE'd SECURITY DEFINER helper. PostgreSQL evaluates ALL policies in OR
combination; if auth_role() returns NULL (no JWT), `NULL IN ('teacher', 'tutor')`
= NULL, short-circuit does NOT occur, and fn_teacher_student_ids() is called.

---

## Pattern 5 — INSERT RLS deny via throws_like

**Discovered:** Stage 6, Lesson 3.
**Applies to:** Tables with no INSERT policy for the calling role.

**DO NOT use:**
```sql
-- WRONG on two counts:
-- (a) PostgreSQL rejects data-modifying CTEs nested inside subqueries
--     ("WITH clause containing a data-modifying statement must be at
--     the top level") — SQLSTATE 42P17-like parse error.
-- (b) Even if valid, RLS raises an error for INSERT deny — it does NOT
--     silently return 0 rows (unlike UPDATE/DELETE which are filtered).
SELECT is(
  (WITH x AS (INSERT INTO <table> (...) VALUES (...) RETURNING 1)
   SELECT count(*)::int FROM x),
  0,
  'INSERT denied by RLS');
```

**USE instead:**
```sql
-- CORRECT — INSERT RLS deny raises error; throws_like catches it:
SELECT throws_like(
  $$INSERT INTO <table> (<cols>) VALUES (<vals>)$$,
  '%row-level security%',
  'authenticated INSERT on <table> denied by RLS');
```

**UPDATE/DELETE deny is DIFFERENT** — use Pattern 2 (DML-CTE + `is(count=0)`):
```sql
-- UPDATE/DELETE: RLS silently filters rows, no error:
WITH x AS (
  UPDATE <table> SET <col> = <val> WHERE <id> = '<seeded_id>'
  RETURNING 1
)
SELECT is((SELECT count(*)::int FROM x), 0, 'UPDATE denied by RLS (0 rows)');
```

**Rationale:** PostgreSQL RLS behaviour differs by DML type. UPDATE/DELETE
with no matching policy return 0 affected rows (silent deny). INSERT with
no matching INSERT/ALL policy raises `ERROR: new row violates row-level
security policy for table "<table>"` (SQLSTATE 42501, message contains
"row-level security"). Data-modifying CTEs are additionally restricted from
nesting inside subqueries. Use `throws_like` + `'%row-level security%'`
for INSERT, DML-CTE for UPDATE/DELETE.

---

## Pattern 6 — Schema-qualified pg_class and pg_policies queries (Stage 8)

**Discovered:** Stage 8 — Supabase Realtime schema conflict.
**Applies to:** Any pg_class or pg_policies query on a table name that may exist in
Supabase system schemas (realtime, auth, storage).

**Problem:** Supabase Realtime uses a `subscription` table in the `realtime` schema.
`SELECT relrowsecurity FROM pg_class WHERE relname = 'subscription'` returns two rows
(public.subscription AND realtime.subscription), causing "more than one row returned
by a subquery used as an expression".

**Always use schema filters:**
```sql
-- pg_class RLS check — always add relnamespace filter:
SELECT is(
  (SELECT relrowsecurity FROM pg_class
   WHERE relname = 'subscription'
     AND relnamespace = 'public'::regnamespace)::bool,
  true,
  'subscription RLS enabled');

-- pg_policies count check — always add schemaname filter:
SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE tablename = 'subscription' AND schemaname = 'public'),
  0,
  'subscription has 0 RLS policies');
```

**Known Supabase system-schema conflicts:**
- `subscription` — conflicts with `realtime.subscription`
- When in doubt, always add the namespace/schema filter.

**Rationale:** Supabase local dev runs multiple schemas. pg_class and pg_policies
catalog views span all schemas. Safe to omit the filter only when the table name is
guaranteed unique across all Supabase schemas (job_queue, pipeline_event, etc.).
