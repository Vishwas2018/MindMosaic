# OPEN_ISSUES.md — living list

> Pruned on audit days (every 5 stages). Resolved → ## Resolved with date.
> Use the severity rubric in CLAUDE.md.

## Open

### ISSUE-0012 — `.git/hooks/pre-commit` absent; BUILD_CONTRACT §11.2 trailer prohibition unenforced

- Status: open
- Severity: low
- Reported: 2026-05-14 (Stage 24 close)
- Area: tooling / dx
- Tags: git-hooks · build-contract · trailer-discipline

**Summary.** No `.git/hooks/pre-commit` file exists in the repository. BUILD_CONTRACT §11.2
prohibits "Co-Authored-By:" and similar AI-attribution trailers in commit messages. The gap was
surfaced when a `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer was drafted
in the Stage 24 prep commit staged diff; it was caught manually and removed before the commit
was created (commit `ad73aad` is clean). Relying on author + reviewer discipline in the interim.

**Fix.** Add `apps/web/../.git/hooks/pre-commit` (or repo root `.git/hooks/pre-commit`) that
rejects any commit message containing a `Co-Authored-By:` line (or similar AI-attribution
patterns). Example check:

```sh
#!/bin/sh
if git diff --cached --name-only | xargs grep -qP 'Co-Authored-By:' 2>/dev/null; then
  echo "ERROR: Co-Authored-By trailer detected — remove per BUILD_CONTRACT §11.2" >&2
  exit 1
fi
```

Alternatively: a `commit-msg` hook that scans the message file directly is more reliable
than scanning staged content. Address at the next tooling pass or Stage 25 audit day.

### ISSUE-0011 — Results screen content blocks deferred pending DTO + service shipments

- Status: open
- Severity: medium
- Reported: 2026-05-14 (Stage 24 §2A)
- Area: frontend (apps/web) + types (@mm/types) + backend (assessment-svc, intelligence-svc, analytics-svc)
- Tags: results-screen · dto-discipline · v1.1

**Summary.** SCREEN_SPECS §11 specifies five content blocks for the Results screen
(`/results/[id]`) that cannot be built in Stage 24 because their data sources are
not yet available in v1 DTOs or service layers:

(a) **Topic breakdown** — requires per-topic correct/incorrect counts in
`SessionSummaryDTO`; current shape carries only `raw_score` and `skills_touched_count`
with no topic-level breakdown.

(b) **Performance insights** — requires an `ExplanationDTO` SDK hook and the
`packages/core/src/explain-format.ts` helper (file does not exist; `packages/core/src/index.ts`
is empty). intelligence-svc has `ExplanationDTOSchema` at `packages/types/src/intelligence.ts:80`
but no v1 endpoint returns one via the SDK.

(c) **Question review block** — requires `useContentItem` hook + per-response answer state
(which choice was selected, whether correct) accessible from the Results page.
Assessment-svc returns per-response data within the session, but no DTO surface currently
exposes the full response list at results time.

(d) **Practice mastery delta card** — requires intelligence-svc Stages 28+ endpoints
(`/intelligence/mastery-delta/{session_id}` or equivalent) and a corresponding SDK hook.
Not available in v1.

(e) **Diagnostic proficiency map** — requires analytics-svc proficiency data
(`ProficiencyMapDTOSchema` exists in `packages/types/src/proficiency.ts:9` but no
analytics-svc endpoint or SDK hook is built in v1).

**Effect.** Stage 24 ships stubs for all five blocks: a `{/* TODO: ISSUE-0011x */}` placeholder
comment in each slot, hidden via `{false && ...}` guard so the page renders cleanly without
the block. The hero ring (scored mode), a "Skill progress" placeholder card (practice mode),
and proficiency band labels (diagnostic mode) ship per the Q-24.6 resolution using
`SessionSummaryDTO.raw_score`.

**Recommended fix (post-Stage 28 / v1.1).**
(a) Extend `SessionSummaryDTO` with `topic_breakdown: { topic_id: string; correct: number; total: number }[]`.
(b) Add `useSessionExplanations(sessionId)` SDK hook; build `packages/core/src/explain-format.ts` helper.
(c) Add `useSessionResponses(sessionId)` SDK hook returning per-response state.
(d) Add `useMasteryDelta(sessionId)` SDK hook once intelligence-svc v2 ships (Stage 28+).
(e) Add `useProficiencyMap(studentId, pathwayId)` SDK hook once analytics-svc ships.

### ISSUE-0010 — adaptive section-boundary banner pending server-authoritative `current_testlet_id` in `SessionStateDTO` + `RecordResponseResponse`

- Status: open
- Severity: medium
- Reported: 2026-05-13 (Stage 23 §2A)
- Area: types (`@mm/types`) + backend (assessment-svc) + frontend (apps/web Exam Engine)
- Tags: adaptive · dto-discipline · v1.1

**Summary.** UI_CONTRACT §5.1 + SCREEN_SPECS §9 call for two
adaptive-engine-aware behaviours on the Exam Engine page:
1. A "section boundary banner" that appears as the student crosses
   from one adaptive testlet to the next.
2. A `QuestionMap` jump rule that **blocks cross-testlet navigation**
   for adaptive sessions while permitting free jumping for linear.

Neither `SessionStateDTO` nor `RecordResponseResponse` currently
carries an explicit testlet identifier. ADR-0024 (adaptive testlet
routing) defines the routing model server-side, but the boundary
signal is not exposed in the public DTO surface.

**Effect.** Stage 23 ships a **forward-only** jump rule based on
`sequence_number > current_question_index` (per Q-23.4 resolution).
This is conservative — strictly correct for both linear and adaptive
(linear users can simply re-jump after answering forward) but loses
the linear-mode affordance of free back-jumping until the boundary
field exists. The "section boundary banner" is **deferred entirely**
in v1.

**Why not in Stage 23.** The fix needs a DTO change (new optional
field), an assessment-svc handler change to populate it from the
adaptive engine state, and a contract test. That's a backend +
types + handler sweep that doesn't fit the Stage 23 budget and risks
the a11y gate (the merge-blocker). Q-23.4 = defer.

**Recommended fix (v1.1 or earlier if a backend stage gets there
first).** Two parts:
1. **DTO**: add `current_testlet_id: string | null` to
   `SessionStateDTOSchema` and `RecordResponseResponseSchema` in
   `packages/types/src/session.ts` (nullable so linear sessions
   continue to round-trip cleanly).
2. **assessment-svc**: populate the field from the engine state
   row (linear → null; adaptive → current testlet id).
3. **Frontend**: replace the forward-only sequence-number check
   with `currentItem.testlet_id === target.testlet_id` for
   adaptive; render the "Section N" banner on transition.

Add a contract test: assert the field is present in 200 responses
from `/sessions/{id}/state` and `/sessions/{id}/respond` for both
modes.

**Reproduction.**
```bash
grep -nE "testlet|section" packages/types/src/session.ts
# Returns: zero hits.
grep -nE "current_testlet_id" supabase/functions/assessment-svc/handlers.ts
# Returns: zero hits.
```

### ISSUE-0009 — upgrade offline persistence to IndexedDB queue + service-worker shell cache in v1.1

- Status: open
- Severity: medium
- Reported: 2026-05-13 (Stage 23 §2A)
- Area: frontend (apps/web Exam Engine)
- Tags: offline · pwa · v1.1

**Summary.** ADR-0030 (Stage 23) ships an **in-memory**
`useResponseQueue` for offline `/respond` queuing — the minimum
shape that satisfies UI_CONTRACT §5.1's "do not block the user
from answering while offline" rule and the DEV_PLAN exit criterion
("answer 3 offline items, replay on reconnect"). Two pieces of
the original UI_CONTRACT §5.1 contract are **deferred to v1.1**:

1. **IndexedDB persistence**: queue survives page reload during
   offline. v1 stores in-memory only; reload during offline = lost
   queue. Mitigated by 30s autosave cadence; documented in
   `OfflineBanner` microcopy ("Don't reload this page until
   reconnected").
2. **Service worker shell cache**: pre-cache the Exam Engine route
   shell so a cold-start during offline still shows the shell
   chrome. v1 has none; first load offline is unsupported (and not
   a real exam-taker scenario in v1).

**Effect.** v1 students who go offline mid-session and reload the
page will see the resume flow (cold cache, refetch state on
reconnect) instead of an instant restore. The session is not
corrupted — assessment-svc state machine + autosave cadence carry
the worst-case loss to < 30s of in-flight respond writes. ISSUE-0009
is therefore a **degraded UX, not a correctness issue**.

**Why not in v1.** ADR-0030 documents the rationale: spending
half the Stage 23 budget on offline plumbing inverts the priority
DEV_PLAN sets (a11y > offline-resilience > offline-persistence).
Stage 23 buys the resilience; persistence waits.

**Recommended fix (v1.1).** Replace `useResponseQueue`'s in-memory
storage with an IndexedDB-backed `idb-keyval` (or similar) layer
behind the same hook API (`enqueue` / `flush` / `pendingCount`).
Add a service worker registration via `next-pwa` (or a hand-rolled
`sw.ts`) with a runtime caching strategy for the Exam Engine route
shell. Add Playwright e2e: queue persists across page reload during
offline; cold-start during offline shows the shell.

Affects: `apps/web/src/components/exam/useResponseQueue.ts`,
`apps/web/src/components/exam/OfflineBanner.tsx`,
`apps/web/next.config.js` (or `next-pwa.config.js`),
`apps/web/public/sw.js` (new),
`apps/web/playwright/e2e/exam-flow-offline.spec.ts` (new).

**Reproduction.**
```bash
grep -rn "IndexedDB\|idb-keyval\|next-pwa\|sw\.js\|serviceWorker" apps/web/
# Returns: zero hits in source (only references in node_modules).
```

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
