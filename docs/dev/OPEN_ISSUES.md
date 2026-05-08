# OPEN_ISSUES.md — living list

> Pruned on audit days (every 5 stages). Resolved → ## Resolved with date.
> Use the severity rubric in CLAUDE.md.

## Open

### ISSUE-0013 — Evening ritual test count methodology (tail truncation drift)

- Status: open
- Severity: low
- Reported: 2026-05-18 (Stage 28 close)
- Area: tooling / process
- Tags: evening-ritual · test-count · methodology

**Summary.** Test counts reported in `DAILY_LOG.md` and `PROJECT_STATE.md` through Phase 1 (Stages 22a–27) were captured via `tail -N` of `pnpm -r run test` output rather than the full run. This caused small drift in the running total: `@mm/types` (98 tests) was under-reported by 1 (as 97) in some evening captures, and `@mm/jobs-worker` was absent until Stage 28. Surfaced at Stage 28 close when full output revealed actual pre-Stage-28 baseline was **400 passed**, not 399 as reported at Stage 26 close.

**No test surface was ever broken.** Counts were merely slightly under-reported in the evening ritual log and PROJECT_STATE.md. The cumulative drift was small (≤1 test per stage) and had no functional impact or audit-trail integrity issue beyond the running total.

**Fix.** Capture full `pnpm -r run test` output at every evening ritual (not `tail`), or use the runner's own per-package summary line (`Tests  N passed`). Apply from Stage 29 onward.

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

(f) **Student Dashboard mastery snapshot** — needs intelligence-svc
`/learner-profile` endpoint (Stage 28+). All three intelligence SDK hooks
(`useLearningDNA`, `useSkillProgress`, `useCausalMap`) are gated Stage 28+.
Stage 25 ships a `StatTile` with aggregated `skills_touched_count` from
`SessionSummaryDTO[]` + "Full mastery data in a future release" micro-copy.

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
(f) Add `useLearnerProfile(studentId)` SDK hook + intelligence-svc `/learner-profile`
endpoint once intelligence-svc v2 ships (Stage 28+); replace Dashboard `StatTile`
stub with real mastery bars.

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

### ISSUE-0014 — exam_date column on user_profile missing; §12.1 projection branch incomplete

- Status: open
- Severity: medium
- Reported: 2026-05-19 (Stage 29)
- Area: backend (intelligence-svc, migration) + frontend (teacher/student UI)
- Tags: predictive · dto-discipline · v1.1

**Summary.** Spec §12.1 `predict_exam_readiness(student, pathway, exam_date)` requires `exam_date` as a projection horizon. No migration adds this column to `user_profile`. Stage 29 implements the projection branch conditionally: when `exam_date` is null (the default for v1 launch), `projected_readiness` and `on_track` are returned as null; all other predictive outputs (`current_readiness_score`, per-skill mastery levels, gap skills, mastery timelines) are computed.

**Recommended fix (v1.1).** (1) Migration 0015: `ALTER TABLE user_profile ADD COLUMN exam_date date;`. (2) Build teacher/student UI to set exam date per pathway. (3) Wire payload from `user_profile.exam_date` in the predictive-refresh job creation path. (4) Restore the `projected_readiness` + `on_track` computation in `processPredictiveRefresh`. Linked: DEV-20260519-1, Q-29.2.

### ISSUE-0015 — cohort_metric_cache reused for per-student predictions (category mismatch)

- Status: open
- Severity: low
- Reported: 2026-05-19 (Stage 29)
- Area: backend (intelligence-svc, analytics-svc)
- Tags: architecture · v1.1

**Summary.** Stage 29 stores per-student readiness predictions in `cohort_metric_cache` per DEV_PLAN directive (`cohort_key = student_id::text`). The table is semantically a cohort analytics aggregate read-model owned by `analytics-svc` per the arch ownership table; its RLS grants teacher/org_admin/platform_admin access only — no student SELECT. Intelligence-svc bypasses RLS via service-role, so the functional v1 path is correct. However, accumulated per-student rows will grow unboundedly and won't be pruned by any analytics sweeper. Cache write site is marked `// ISSUE-0015` for grep-ability.

**Recommended fix (v1.1).** Introduce `student_prediction_cache (student_id, pathway_slug, tenant_id, value jsonb, computed_at timestamptz, PRIMARY KEY (student_id, pathway_slug))` with appropriate RLS (student SELECT own rows; teacher/admin SELECT any). Migrate Stage 29 prediction writes to this table. Add a sweeper cron to prune rows older than 7 days.

### ISSUE-0016 — async_pipeline_event table for L5/L7/L9 observability parity (post ADR-0032)

- Status: open
- Severity: low
- Reported: 2026-05-19 (Stage 29)
- Area: backend (intelligence-svc, migration)
- Tags: observability · pipeline · v1.1

**Summary.** `pipeline_event.session_id` is `NOT NULL` (migration 0006), blocking writes from L5/L7/L9 pipeline steps which operate at student+pathway scope (no session). ADR-0032 resolves this for Stage 29 by skipping `pipeline_event` for L5 and using `intelligence_audit_log` exclusively. Step 5 is absent from `pipeline_event` coverage; monitoring queries tracking pipeline step enumeration will miss L5 progress.

**Recommended fix (v1.1).** Introduce a dedicated `async_pipeline_event` table without a session_id FK: `async_pipeline_event (id uuid PK, student_id, pathway_slug, step, step_name, status, started_at, completed_at, error, created_at)`. L5/L7/L9 write to this table; L1/L2/L3a/L3b continue writing to `pipeline_event`. Linked: ADR-0032, Q-29.4.

## Resolved

### ISSUE-0006 — intelligence-svc L3a bypasses skill-graph cache (architectural inconsistency vs arch §9.3)

- Status: resolved
- Severity: medium
- Reported: 2026-05-09 (Stage 21 §2A)
- Closed: 2026-05-18 (Stage 28)
- Area: backend (intelligence-svc)
- Tags: architectural-consistency · cache · pre-launch

**Resolution (Stage 28).** `runCausalScoped` in `intelligence-svc/handlers.ts`
now reads graph data via `skillGraph?.adjacency ?? new Map()` (injected by
`processSession` from the skill-graph-cache) instead of a direct `skill_edge`
query. `ProcessSessionInput` accepts `skillGraph?: SkillGraphCache | null`
(test path) or `graphLoader?: SkillGraphCacheLoader` (production path). The
`index.ts` dispatcher creates the loader via `createDbLoader(db)` and injects
it. After this fix there are zero direct `skill_edge` queries in
`intelligence-svc/handlers.ts`. Verified by `grep -n "skill_edge"
supabase/functions/intelligence-svc/handlers.ts` → no matches.

### ISSUE-0008 — assessment-svc dispatcher emits `CONFLICT` / `LOCK_CONFLICT` codes not in `@mm/types` `ErrorCodeSchema`

- Status: resolved
- Severity: medium
- Reported: 2026-05-12 (Stage 22b)
- Closed: 2026-05-16 (Stage 26)
- Commit: `75984c6`
- Resolution: Added `LOCK_CONFLICT` as 16th `ErrorCodeSchema` value. Replaced all 11 bare
  `'CONFLICT'` strings in `assessment-svc/handlers.ts` + `intelligence-svc/handlers.ts` with
  canonical codes (`ACTIVE_SESSION_EXISTS`, `VERSION_CONFLICT`, `SESSION_CONFLICT`). Updated
  4 contract test assertions to match. Scope note: `auth-svc`/`users-svc` don't exist in v1;
  `content-svc` was already clean — only 2 files required changes. All tests green.

### ISSUE-0007 — SDK record/checkpoint/abandon hooks do not plumb `X-Session-Lock` header per ADR-0026

- Status: resolved
- Severity: medium
- Reported: 2026-05-12 (Stage 22b)
- Closed: 2026-05-16 (Stage 26)
- Commit: `75984c6`
- Resolution: Added `lockToken` to `MmClient` public + private methods. Updated `useRecordResponse`
  (lockTokenRef + auto-rotation from response), `useCheckpoint` (lockTokenRef, no rotation).
  Added `useAbandon` hook. Exam page seeds lock_token via `useEffect` on `sessionState.data`.
  Added `AbandonSessionResponseSchema` to `@mm/types`. 5 new ADR-0026 header tests in
  `client.test.ts`. ADR-0031 NOT filed (mechanical fulfilment of ADR-0026; idiomatic React).
  All tests green.

### ISSUE-0005 — `apps/web/.env.local.example` populated with real Supabase URL + anon JWT

- Status: resolved
- Severity: medium
- Reported: 2026-05-08 (Stage 19)
- Closed: 2026-05-16 (Stage 26)
- Commit: `75984c6`
- Resolution: Restored `apps/web/.env.local.example` to placeholder values
  (`https://your-project.supabase.co` / `your-anon-key`). D5 of Stage 26.

### ISSUE-0012 — `.git/hooks/pre-commit` absent; BUILD_CONTRACT §11.2 trailer prohibition unenforced

- Status: resolved
- Severity: low
- Reported: 2026-05-14 (Stage 24 close)
- Closed: 2026-05-15 (Stage 25 audit day)
- Resolution: Stage 25 side-task. `.githooks/commit-msg` hook created and tracked in the repo
  at `.githooks/commit-msg`. Hook scans the commit message file for `Co-Authored-By:` lines
  and exits 1 if found (BUILD_CONTRACT §11.2). Activated for this clone via
  `git config core.hooksPath .githooks`. Run once per fresh clone to re-activate.
  Commit: `975e815`.

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
