# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 9 — Migration 0008 — pg_cron Setup (2026-05-03)
- Next stage: Stage 10 — Audit Day (ISSUE-0002 + ISSUE-0003 + DEV_PLAN cron text correction)
- Days remaining (target 75): 67
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3

## Test suite

| Suite        | Status   | Count     | Last run   |
| ------------ | -------- | --------- | ---------- |
| Unit         | ✅ green  | 0 (pass-with-no-tests) | 2026-05-03 |
| Integration  | n/a      | n/a       | n/a        |
| pgTAP        | ✅ green  | 428/428   | 2026-05-03 |
| Contract     | n/a      | n/a       | n/a        |
| RLS          | ✅ green  | 428/428 (53 tables) | 2026-05-03 |
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

- ADRs accepted: 17 (ADR-0001 through ADR-0017)
- ADRs proposed: 0
- Issues critical / high / medium / low: 0/0/1/1
- Open questions: 0
- Open bugs: 0
- Deviations logged: 2 (DEV-20260430-1 ongoing; DEV-20260503-2 ongoing — resolves Stage 28+)

## Notes for next session

**Stage 10 is audit day.** Three concrete items:
1. ISSUE-0002 (low): add `REVOKE EXECUTE FROM authenticated; REVOKE EXECUTE FROM anon` for the 6
   Stage 2/3 SECURITY DEFINER helpers (auth_tenant_id, auth_user_id, auth_role,
   fn_user_in_my_tenant, fn_class_in_my_tenant, fn_graph_version_is_published) via a small
   follow-up migration.
2. ISSUE-0003 (medium): upgrade GHA action pins (actions/checkout, actions/setup-node,
   pnpm/action-setup) to their Node 24 compatible major versions before 2026-06-02 hard deadline.
3. DEV_PLAN.md cron registration text correction: "ON CONFLICT DO NOTHING" should read
   "unschedule-first + cron.schedule() API" (documentation imprecision; do NOT edit DEV_PLAN.md
   directly — file a deviation + ADR if the correction is non-trivial).

**cron.schedule() pattern (ADR-0017):** Stage 9 onwards uses cron.schedule() / cron.unschedule()
public API. Avoid direct INSERT into cron.job — pg_cron schema can change between versions.

**fn_recalibrate_content no-op body:** `SELECT 1` is not valid for LANGUAGE sql RETURNS void
(int not castable to void). Valid alternative: `UPDATE job_queue SET status = status WHERE FALSE`.
Apply to any future PHASE-2 stub functions.

**pg_cron extension in down migrations:** Do NOT `DROP EXTENSION pg_cron` in down migrations.
Supabase Postgres pre-loads pg_cron; dropping it would be destructive. Down migration: unschedule
jobs + drop functions only. `CREATE EXTENSION IF NOT EXISTS pg_cron` in up is idempotent.

**DEV-20260503-2:** content.recalibration function exists as no-op stub from Stage 9.
Body replaced when content recalibration engine ships in v1.1 migration.

**A1 correction (Stage 8):** Triple REVOKE canonical = PUBLIC + authenticated + anon.
Stage 2/3 helpers still on old pattern — ISSUE-0002 (low) tracks remediation for Stage 10.
All Stage 8+ SECURITY DEFINER helpers use correct A1 pattern.

**ISSUE-0002 (low, open):** Stage 2/3 helpers (auth_tenant_id, auth_user_id, auth_role,
fn_user_in_my_tenant, fn_class_in_my_tenant, fn_graph_version_is_published) are missing
REVOKE EXECUTE FROM authenticated and/or REVOKE EXECUTE FROM anon. Due at Stage 10 audit.

**ISSUE-0003 (medium, open):** GitHub Actions action runners pin to Node.js 20 runtime.
Hard external deadline 2026-06-02. Address at Stage 10 audit.

**ADR-0014 cleanup (Stage 10 audit):** `docs/dev/decisions/0014-pgtap-index-assertions-catalog-not-explain.md`
is an incorrectly-named stub left untracked. Delete before Stage 10 audit. Correct committed
file: `docs/dev/decisions/0014-pgtap-index-assertions-structural-not-explain.md`.

**Anon SELECT pattern (established Stage 6):** Do NOT test anon access on tables whose RLS
policies call SECURITY DEFINER helpers. Use has_function_privilege('anon', ..., 'execute') = false.
Exception: tables with NO policies (Pattern G) are safe for anon SELECT — no function calls.

**INSERT RLS deny pattern (established Stage 6):** Use throws_like($$INSERT...$$, '%row-level security%', ...).
UPDATE/DELETE deny: DML-CTE + is(count=0).

**LANGUAGE sql function ordering:** PostgreSQL validates LANGUAGE sql function bodies at CREATE
time. Functions referencing tables in the same migration must be defined AFTER those tables.

**realtime.subscription conflict (Stage 8):** Always add AND relnamespace = 'public'::regnamespace
to pg_class queries; AND schemaname = 'public' to pg_policies queries.

**DML CTE top-level restriction:** CTEs with DML must be at statement top level, not inside a
subquery expression.

**Supabase remote project:** https://tohmshcpdhcdfsubvnok.supabase.co (ap-southeast-2)

**DEV-20260430-1 audit status:** reviewed and ongoing; resolves Stage 15.

**pgTAP patterns established through Stage 9:**
- All Stage 8 patterns remain valid (see Stage 8 notes)
- Cron job registration proof: ok(EXISTS(SELECT 1 FROM cron.job WHERE jobname='N' AND schedule='S' AND command='C'), ...)
- Cron function existence: has_function('public', 'fn_name', ARRAY[]::text[], description)
- Behavioral side-effect proof: call fn directly as postgres (superuser bypasses RLS); assert
  row state with is() or count()
- PHASE-2 no-op body (LANGUAGE sql RETURNS void): UPDATE <table> SET col = col WHERE FALSE
  (not SELECT 1 — int not castable to void at CREATE time)
