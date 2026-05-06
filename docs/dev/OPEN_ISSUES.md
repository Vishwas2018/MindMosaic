# OPEN_ISSUES.md — living list

> Pruned on audit days (every 5 stages). Resolved → ## Resolved with date.
> Use the severity rubric in CLAUDE.md.

## Open

### ISSUE-0008 — assessment-svc dispatcher emits `CONFLICT` / `LOCK_CONFLICT` codes not in `@mm/types` `ErrorCodeSchema`

- Status: open
- Severity: medium
- Reported: 2026-05-12 (Stage 22b implementation)
- Area: backend (assessment-svc) + types (`@mm/types`)
- Tags: error-surface · pre-launch · types-discipline

**Summary.** `supabase/functions/assessment-svc/handlers.ts`
emits string codes `'CONFLICT'` and `'LOCK_CONFLICT'` for 409
responses (e.g. one-active-session collision, version
mismatch, stale lock token). Neither string is in
`packages/types/src/shared.ts` `ErrorCodeSchema`, which lists
the 15 v1 codes (`VALIDATION_ERROR`, `UNAUTHENTICATED`,
`FEATURE_GATED`, `FORBIDDEN`, `NOT_FOUND`, `SESSION_CONFLICT`,
`VERSION_CONFLICT`, `ACTIVE_SESSION_EXISTS`,
`IDEMPOTENCY_IN_FLIGHT`, `GONE`, `IDEMPOTENCY_MISMATCH`,
`UNPROCESSABLE`, `RATE_LIMITED`, `INTERNAL_ERROR`,
`SERVICE_UNAVAILABLE`).

**Effect.** SDK `MmClient.request` calls
`APIErrorEnvelopeSchema.safeParse(body)` on every error
response; when the envelope `code` field is not in the enum,
`safeParse` fails and the SDK falls through to
`throw new APIError('INTERNAL_ERROR', response.status, …)`.
Pages branching on `err.code` would mishandle 409s; pages
branching on `err.status === 409` work correctly. Stage 22b
session-selection + practice pages use status-only branching
as a defensive workaround.

**Why not in Stage 22b.** Out of scope. Stage 22b is the
visual-screens slice of DEV-20260511-1; pre-existing
SDK↔dispatcher path reconciliation already happened at 22a
per Q-22.2 / ADR-0029 (paths only, not error-code surface).
Adding code-surface reconciliation would expand 22b beyond
the day budget and re-touch every dispatcher.

**Recommended fix (pre-launch sweep).**
Two-part: (a) reconcile the dispatcher names to the
authoritative `@mm/types` enum — `'CONFLICT'` →
`'SESSION_CONFLICT'` for one-active-session,
`'VERSION_CONFLICT'` for version mismatch; `'LOCK_CONFLICT'`
needs a new enum value (`'LOCK_CONFLICT'` or
`'SESSION_LOCKED'`) added to `ErrorCodeSchema` + a contract
test asserting envelope round-trip. Affects:
`packages/types/src/shared.ts` (+ tests), all 5 v1
dispatchers (`auth-svc`, `users-svc`, `content-svc`,
`assessment-svc`, `intelligence-svc`).

**Reproduction.**
```bash
grep -nE "'CONFLICT'|'LOCK_CONFLICT'" supabase/functions/*/handlers.ts
grep -nE "ErrorCodeSchema" packages/types/src/shared.ts
```

### ISSUE-0007 — SDK record/checkpoint/abandon hooks do not plumb `X-Session-Lock` header per ADR-0026

- Status: open
- Severity: medium
- Reported: 2026-05-12 (Stage 22b implementation)
- Area: frontend (`@mm/sdk`)
- Tags: lock-token · sdk-discipline · pre-launch

**Summary.** ADR-0026 (Stage 19) mandates that
assessment-svc rotates `lock_token` on every successful
`/respond` and that the client echoes the new token via the
`X-Session-Lock` header on the next `/respond`,
`/checkpoint`, or `/abandon`. The SDK's `useRecordResponse`,
`useCheckpoint`, and `useAbandon` hooks
(`packages/sdk/src/hooks/session.ts`) accept only the body
fields (`RecordResponseRequest` / `CheckpointRequest`); they
do not expose a way for callers to supply the rotated
`lock_token` and `MmClient.request` does not set
`X-Session-Lock` on any path.

**Effect.** Real assessment-svc dispatcher returns
`409 LOCK_CONFLICT` on the first `/respond` after `/create`
because the SDK never sent the header. Pages can recover by
refetching state and retrying (the Stage 22b Practice page
treats any 409 as a "version-conflict" modal trigger), but
this is a fallback, not a contract. Opt-in Playwright e2e
will surface the gap against a real backend.

**Why not in Stage 22b.** Out of scope. Stage 22b is the
visual-screens slice; SDK plumbing changes belong in a
follow-up touch-up stage or fold into Stage 26 e2e wiring.

**Recommended fix.** Extend `MmClient.request` to accept an
optional `lockToken?: string` and write
`headers['X-Session-Lock'] = lockToken` when set. Extend the
three session mutation hooks to track the latest
`lock_token` (returned in `CreateSessionResponse` and
`RecordResponseResponse`) in component state or a small
ref-based registry, and pass it into the next mutation
automatically. Add SDK contract tests asserting header
presence + rotation across two consecutive `/respond` calls.

**Reproduction.**
```bash
grep -n "X-Session-Lock\|lockToken\|lock_token" packages/sdk/src/client.ts packages/sdk/src/hooks/session.ts
# Returns: zero matches.
```

### ISSUE-0006 — intelligence-svc L3a bypasses skill-graph cache (architectural inconsistency vs arch §9.3)

- Status: open
- Severity: medium
- Reported: 2026-05-09 (Stage 21 §2A)
- Area: backend (intelligence-svc)
- Tags: architectural-consistency · cache · pre-launch

**Summary.** `supabase/functions/intelligence-svc/handlers.ts` (Stage 20)
runs L3a's depth-1 prereq walk by querying `skill_edge` directly:

```ts
const edgesRes = await client
  .from('skill_edge')
  .select('from_node_id, to_node_id')
  .in('to_node_id', touchedSkills);
```

Per arch §9.3 (Cache Strategy table), the Active skill graph cache —
`supabase/functions/_shared/skill-graph-cache.ts` — is **the read path** for
skill-graph data inside Edge Functions (1h TTL, watermark-invalidated on
graph publish). intelligence-svc L3a is the only consumer in v1 that reads
graph data without going through the cache. content-svc already uses the
cache; orchestration-svc and analytics-svc are not yet built.

**Impact.** Not breaking. Functional correctness is unaffected (the direct
query returns the same rows the cache would). Cost: one extra DB round-trip
per `/intelligence/process-session/{id}` call — acceptable inside the 3 s
sync SLA, measurable but small at Stage 26 load test. The real concern is
**architectural consistency**: arch §9.3 names the cache as the single
read path; having one service bypass it is a footgun for future changes
(graph version migrations, tenant-scoped variants, replay-determinism
tightening).

**Why not in Stage 21.** Q-21.1 = NO per scope discipline. Stage 21's
brief is *cache hardening* (in-flight dedup + stale-while-revalidate per
ADR-0028), not *cache adoption*. Pulling in a new caller would
double-scope the stage, expand the test surface beyond the 1-day budget,
and risk replay-determinism regressions in Stage 20's named exit-criterion
test (the cache's iteration order + module-scope state would need to be
proven byte-stable across runs).

**Recommended fix.** Either (a) a small dedicated pre-launch stage that
migrates intelligence-svc L3a to read via `getSkillGraph()` + adds a
follow-up replay-determinism test, or (b) fold into Stage 28 (jobs-worker)
when the orchestration-svc + analytics-svc readers are built so all three
services pick up the cache pattern at once.

**Reproduction.** `grep -n "skill_edge" supabase/functions/intelligence-svc/handlers.ts`
returns one match — the bypass site at the L3a entry.

### ISSUE-0005 — `apps/web/.env.local.example` populated with real Supabase URL + anon JWT

- Status: open
- Severity: medium
- Reported: 2026-05-08 (Stage 19 audit close)
- Area: infra / dx
- Tags: hygiene · footgun · secrets-policy

**Summary.** `apps/web/.env.local.example` is unstaged-modified to contain a real
project URL (`https://tohmshcpdhcdfsubvnok.supabase.co`) and a real anon JWT
(`role=anon`, `iat=2026-04-29`, `exp=2036-04-26`). Anon keys are *intentionally*
browser-exposed by Supabase's RLS-first model — this is **not a security
incident** in the credentials-leak sense. It is a hygiene/footgun issue:

1. `*.example` files are conventionally placeholders (`your-project.supabase.co`
   / `your-anon-key`). The current state nudges every new clone toward a
   single shared dev project.
2. Any future rotation of the anon key (e.g. tenant-isolation issue, RLS
   policy bug requiring revocation) must update this file too — easy to forget.
3. If anyone later confuses "anon key looks safe to commit" with "service role
   key looks safe to commit", the precedent is set in the wrong direction.

**Reproduction.** `git diff apps/web/.env.local.example` on `main` post-Stage 19.

**Recommended fix.** Either (a) restore placeholders and instruct local devs
to copy → `.env.local`; or (b) keep populated but rename to `.env.dev.shared`
+ add comment "anon key, RLS-protected, safe to commit; do NOT mirror this for
service-role".

**Why not in Stage 20.** Stage 20 is the highest-risk Phase 1 stage (replay
determinism). Hygiene cleanups don't belong in the same atomic commit. File
as a separate small chore commit at next audit (Stage 24) or sooner.



## Resolved

### ISSUE-0004 — outbox_event 7-day cleanup not wired (arch §5.6)

- Status: resolved
- Severity: low
- Reported: 2026-05-03 (Stage 10)
- Closed: 2026-05-04 (Stage 14 close)
- Resolution: Migration 0011 adds `fn_cleanup_outbox()` (DELETEs processed outbox_events
  older than 7 days) and schedules `outbox.cleanup` cron via `cron.schedule()` at `'15 4 * * *'`
  (04:15 UTC daily). Commit: c3df874.

### ISSUE-0003 — GitHub Actions internal Node.js 20 runtime — upstream action upgrade required before 2026-06-02

- Status: resolved
- Severity: medium
- Reported: 2026-05-02 (post Stage 5 close)
- Closed: 2026-05-03 (Stage 10 audit day)
- Resolution: Bumped `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` from @v4
  to @v5 in `.github/workflows/ci.yml`. All 4 jobs (lint, typecheck, unit, migration-dryrun)
  updated. No ADR filed — no non-trivial behavior change (version bump only).
  Commit: 9eb2f4b. Well ahead of 2026-06-02 forced-upgrade deadline.

### ISSUE-0002 — SECURITY DEFINER helpers: Stage 2/3 helpers missing `REVOKE EXECUTE FROM anon`

- Status: resolved
- Severity: low
- Reported: 2026-05-02 (Stage 5)
- Closed: 2026-05-03 (Stage 10 audit day)
- Resolution: Migration 0009 adds REVOKE FROM authenticated + REVOKE FROM anon + GRANT TO
  authenticated for all 6 Stage 2/3 SECURITY DEFINER helpers. 009_security_definer_retrofit.sql
  pgTAP tests confirm anon denial + authenticated access (440/440 green). No ADR filed —
  A1 triple-REVOKE pattern already documented in BUILD_CONTRACT §6 and PGTAP_PATTERNS P3.
  Commit: 75ac299.

### ISSUE-0001 — CI node-version: GitHub Actions Node 20 deprecation; upgrade to Node 22 LTS

- Status: resolved
- Severity: medium
- Reported: 2026-05-02 (Stage 3 morning reconciliation)
- Closed: 2026-05-02 (Stage 5 audit day)
- Resolution: Bumped `node-version` to `"22"` in all three CI runner jobs (lint, typecheck, unit);
  updated `package.json` `engines.node` to `>=22`; created `.nvmrc` with `22`.
  ADR-0010 filed. Commit: this audit day commit.

### ISSUE-0001 (original, 2026-05-01) — UTA-table SELECT policies: tenant-scoped only, per-role absent until Stage 5

- Status: wont-fix
- Severity: medium (at close)
- Reported: 2026-05-01 (Stage 2)
- Closed: 2026-05-02
- Rationale: Duplicate of ADR-0004 deferral. ADR-0004 fully documents the scope decision and
  the Stage 5 obligation. The same forward-flag is recorded in PROJECT_STATE.md "Notes for next
  session". A separate issue entry added noise without adding information. Node-runtime CI bump
  refiled as ISSUE-0001 — that issue has a hard external deadline (2026-06-02) that warrants
  an open issue; the RLS deferral does not (it is a planned Stage 5 deliverable, not a deadline risk).
