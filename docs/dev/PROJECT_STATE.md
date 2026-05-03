# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 8 — Migration 0007 — New Domains (2026-05-03)
- Next stage: Stage 9 — (read DEV_PLAN.md)
- Days remaining (target 75): 68
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3

## Test suite

| Suite        | Status   | Count     | Last run   |
| ------------ | -------- | --------- | ---------- |
| Unit         | ✅ green  | 0 (pass-with-no-tests) | 2026-05-03 |
| Integration  | n/a      | n/a       | n/a        |
| pgTAP        | ✅ green  | 406/406   | 2026-05-03 |
| Contract     | n/a      | n/a       | n/a        |
| RLS          | ✅ green  | 406/406 (53 tables) | 2026-05-03 |
| E2E          | n/a      | n/a       | n/a        |

## Quality gates

| Gate            | Last status | Last run   |
| --------------- | ----------- | ---------- |
| pnpm lint       | ✅ green (18/18, cached) | 2026-05-03 |
| pnpm typecheck  | ✅ green (18/18, cached) | 2026-05-03 |
| pnpm test       | ✅ green (18/18, cached) | 2026-05-03 |
| pnpm build      | ✅ green (cached from Stage 1) | 2026-04-30 |
| RLS coverage    | ✅ 53/53 tables enabled + tested | 2026-05-03 |
| pnpm audit      | unknown — TODO measure | n/a |
| pnpm test:migration | ✅ green (roundtrip up→down→up) | 2026-05-03 |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95 |
| --------------------------------- | ---------- | ------------ |
| POST /sessions/{id}/respond       | 300 ms     | n/a          |
| POST /sessions/{id}/submit + sync | 5000 ms    | n/a          |
| Pipeline async                    | 30000 ms   | n/a          |
| Dashboard load                    | 2000 ms    | n/a          |

## Open items

- ADRs accepted: 16 (ADR-0001 through ADR-0016)
- ADRs proposed: 0
- Issues critical / high / medium / low: 0/0/1/1
- Open questions: 0
- Open bugs: 0
- Deviations logged: 1 (DEV-20260430-1, ongoing — resolves Stage 15)

## Notes for next session

**Stage 9 is the next stage.** Run morning ritual: read DEV_PLAN.md Stage 9 and confirm
§2A pre-implementation review before C-C-D-V.

**A1 correction (Stage 8):** Triple REVOKE canonical pattern updated to PUBLIC + authenticated
+ anon. BUILD_CONTRACT §6 and PGTAP_PATTERNS P3 corrected. All new SECURITY DEFINER helpers
from Stage 8+ must use: REVOKE FROM PUBLIC; REVOKE FROM authenticated; REVOKE FROM anon;
GRANT TO authenticated. The Stage 2/3 helpers (auth_tenant_id, auth_user_id, auth_role,
fn_user_in_my_tenant, fn_class_in_my_tenant) and Stage 2 helpers (fn_graph_version_is_published)
are still using the old pattern (single REVOKE FROM PUBLIC only) — ISSUE-0002 (low) tracks this.
Stage 8 fn_my_assignment_ids() uses the correct A1 pattern.

**LANGUAGE sql function ordering:** PostgreSQL validates LANGUAGE sql function bodies against the
current schema at CREATE time. Any function referencing tables created in the same migration must
be defined AFTER those tables. (Lesson: fn_my_assignment_ids() initially placed before
assignment_target — moved after. Apply this ordering rule to all future migrations.)

**realtime.subscription conflict (Stage 8):** Supabase Realtime uses a `subscription` table in
the `realtime` schema. pg_class queries on relname = 'subscription' return two rows. Always add
`AND relnamespace = 'public'::regnamespace` when querying pg_class for public schema tables.
Similarly, pg_policies queries: add `AND schemaname = 'public'`. Future migrations should apply
this pattern for any table name that might conflict with Supabase system schemas (realtime,
storage, auth).

**DML CTE top-level restriction:** PostgreSQL requires CTEs with DML (INSERT/UPDATE/DELETE) to
be at the statement top level — not inside a subquery expression. Correct pattern for silent-deny
tests: `WITH _x AS (UPDATE ... RETURNING 1) SELECT is((SELECT count(*)::int FROM _x), 0, ...)`.
Do NOT wrap inside SELECT is((WITH x AS (...) SELECT ...), 0, ...).

**outbox_event scope note:** arch §2.15 and DEV_PLAN Stage 7 both list outbox_event as a Stage 7
deliverable, but it was silently included in migration 0004. Do NOT include it again.
Its RLS, index, and column tests are in 004_sessions_events.sql.

**ADR-0014 cleanup:** `docs/dev/decisions/0014-pgtap-index-assertions-catalog-not-explain.md`
is an incorrectly-named stub left untracked. Delete before Stage 10 audit. Correct committed
file: `docs/dev/decisions/0014-pgtap-index-assertions-structural-not-explain.md`.

**pgTAP index assertion rule (ADR-0014, Stage 7):** use `pg_indexes` catalog check for
all indexes (existence proof); use P5 dedup (throws_like '%duplicate key%') for unique /
partial-unique indexes (predicate correctness proof). EXPLAIN-based assertions deferred
to Stage 26 load tests.

**ISSUE-0002 (low, open):** Stage 2/3 helpers (auth_tenant_id, auth_user_id, auth_role,
fn_user_in_my_tenant, fn_class_in_my_tenant, fn_graph_version_is_published) are missing
REVOKE EXECUTE FROM authenticated and/or REVOKE EXECUTE FROM anon. Remediation is a small
follow-up migration. Due before Stage 10 audit. All new SECURITY DEFINER functions created
in Stage 8+ use the correct A1 triple-REVOKE pattern.

**ISSUE-0003 (medium, open):** GitHub Actions action runners (actions/checkout@v4 etc.) pin to
Node.js 20 runtime. Hard external deadline 2026-06-02. Address at Stage 10 audit.

**Anon SELECT pattern (established Stage 6):** Do NOT test anon access on tables that have
RLS policies calling SECURITY DEFINER helpers (fn_teacher_student_ids, fn_my_child_ids,
auth_role, auth_tenant_id — all REVOKE'd from anon). Anon evaluation of such policies raises
"permission denied for function". Correct test: `has_function_privilege('anon', 'fn()', 'execute')
= false` (Stage 4 G16 pattern). Exception: tables with NO policies (Pattern G) are safe to
test with anon via SELECT — no function calls in zero-policy RLS.

**INSERT RLS deny pattern (established Stage 6):** For INSERT denied by RLS, use
`throws_like($$INSERT...$$, '%row-level security%', description)`. Do NOT use nested CTE.

**Index predicate IMMUTABLE requirement (established Stage 6):** PostgreSQL requires index
predicate functions to be IMMUTABLE. `now()` is STABLE — cannot be used in `WHERE` clause of
partial index. Fix: include the time column in the index.

**ADR-0013 (Stage 6) — audit table column redaction:** Row-level RLS controls row visibility;
column-level access is application-layer responsibility. intelligence-svc (Stage 18+) must
SELECT only decision_type, decision_summary, created_at for non-platform-admin callers from
intelligence_audit_log. Do not return input_snapshot, algorithm_version, trace_id.

**D1 forward-flag (from Stage 6 §2A):** Stage 18+ intelligence-svc must enforce column
projection for intelligence_audit_log: only `decision_type`, `decision_summary`, `created_at`
to authenticated clients. Enforce via Zod response schema in Edge Function.

**D4 forward-flag (from Stage 6 §2A):** intervention_alert has no student SELECT in v1.
Any Stage 18+ view exposing intervention_alert to students MUST use
`WITH (security_invoker = true)` per Stage 3 v_item_current precedent.

**Partition strategy forward-flag:** intelligence_audit_log default partition only in v1.
Monthly carve-up deferred to v1.1 (or earlier if query latency degrades on default partition).
Apply ADR-0012 rule: PRIMARY KEY (id, created_at) on any monthly partitions.

**A2 forward-flag (from §2A Stage 5):** student_select policy intentionally omitted from
`parent_student_link` and `class_student`. Server-side joins handle indirect reads. Stage 17 must
verify this gap does not become a security issue as the application layer evolves.

**learning_event PK is composite (id, created_at):** application queries by `id` alone work fine
(PostgreSQL will scan partitions). Any hypothetical FK to `learning_event(id)` from a future table
would need to include `created_at`. No such FK exists in v1.

**pgTAP patterns established through Stage 8:**
- SELECT isolation: `SET ROLE authenticated; SELECT set_config(...); SELECT is(COUNT(*)::int, ...)`
- DML deny (silent UPDATE/DELETE): `WITH _x AS (UPDATE/DELETE ... RETURNING 1) SELECT is((SELECT count(*)::int FROM _x), 0, ...)` — WITH must be top-level, not inside subquery expression
- DML deny (INSERT raises): `SELECT throws_like($$INSERT...$$, '%row-level security%', description)`
- Trigger sentinel: insert with `updated_at = '2000-01-01'`; assert `> '2000-01-01'` after UPDATE
- Function raises (errcode + message): `SELECT throws_ok(sql, 'PCODE', 'MESSAGE_KEY', description)`
- Function raises (message pattern only): `SELECT throws_like(sql, '%MESSAGE_KEY%', description)`
- Function success: `SELECT lives_ok($$SELECT fn()$$, description)`
- Permission check (no-execute): `SELECT is(has_function_privilege('role', 'public.fn(type)', 'execute'), false, description)`
- Helper output check: `SELECT is(fn() @> ARRAY['uuid'::uuid], true, description)`
- Optimistic-lock: call atomic fn with stale version → `throws_ok(sql, 'P0001', 'VERSION_CONFLICT', description)`
- Dedup unique index: `throws_like($$INSERT...$$, '%duplicate key%', description)`
- Partial unique index (one-active): `throws_like($$INSERT...$$, '%duplicate key%', description)`
- Partial index predicate proof (ADR-0014, Stage 7): 3-subtest: lives_ok first insert / throws_like '%duplicate key%' duplicate / lives_ok excluded-status insert (proves WHERE clause honored)
- Anon permission check (no SELECT on helper-policy table): `has_function_privilege('anon', 'fn()', 'execute') = false`
- Structural index existence (ADR-0014): `SELECT ok(EXISTS(SELECT 1 FROM pg_indexes WHERE tablename='T' AND indexname='I'), ...)`
- Policy count = 0 check (Pattern G structural): `SELECT is((SELECT count(*)::int FROM pg_policies WHERE tablename='T' AND schemaname='public'), 0, ...)` — note: always add schemaname='public' to avoid Supabase system schema collisions
- pg_class RLS check: `(SELECT relrowsecurity FROM pg_class WHERE relname='T' AND relnamespace='public'::regnamespace)` — always add relnamespace filter; 'subscription' conflicts with realtime schema
- FOR ALL + WITH CHECK enforcement: `throws_like($$INSERT ... WHERE user_id = other_user_id$$, '%row-level security%', ...)` (A3 pattern, Stage 8)

**Supabase remote project:** https://tohmshcpdhcdfsubvnok.supabase.co (ap-southeast-2)

**DEV-20260430-1 audit status (Audit Day 1 — 2026-05-02):** reviewed and ongoing; resolves Stage 15
per ADR-0001. No action needed until Stage 15.

**ADR-0009 table-classification heuristic (Stages 5–10):** A table is platform-catalog if it has
no `tenant_id` column. A table is tenant-scoped if it has `tenant_id`. See ADR-0009 follow-ups.

**Stage 14 forward-flag (pathway.required_feature_key convention):** Stage 14 seeders must
populate `pathway.required_feature_key` for every pathway. Recommended convention:
`pathway.feature.<exam_family>.<program>` (paid); `pathway.feature.public` (free-tier).
Stage 19 assessment-svc treats 'public' as always-granted. No CHECK constraint in Migration 0003.

**pgTAP pattern correction (BUG-D):** the Stage 4 PROJECT_STATE pattern entry for
"Function raises (code check)" listed `throws_ok(sql, 'PCODE', description)` as a 3-arg errcode
check. This is wrong — the 3-arg form checks the message, not just the errcode. Correct pattern:
`throws_ok(sql, 'PCODE', 'ERROR_KEY', description)` (4-arg). Or use `throws_like(sql,
'%ERROR_KEY%', description)` for message-pattern matching without errcode assertion.

**Stage 26 forward-flag (ADR-0014):** load-test framework must include EXPLAIN-based assertions
for critical indexes: idx_job_poll (job_queue polling), idx_job_dedup (idempotency uniqueness),
idx_outbox_unprocessed (outbox drain), idx_pe_pending (pipeline step tracking). Document in
Stage 26 prompt.
