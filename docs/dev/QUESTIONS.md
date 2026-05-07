# QUESTIONS.md — open questions for spec/product owner

> Resolved → ## Resolved with answer + date.
> Use the template from CLAUDE.md §Templates.

## Open

<!-- none -->

## Resolved

### Q-24.7 — FocusHeader lift: side-task or separate stage?

- Date raised: 2026-05-14 (Stage 24 §2A)
- Asked of: self
- Source: docs/dev/DAILY_LOG.md Stage 23 close — UI-DIVERGENCE entry (e): "FocusHeader not
  lifted to @mm/ui (was a pre-23 side-task candidate; not enough budget after a11y sweep)".
  PROJECT_STATE.md Stage 24 notes: "Side-task candidate: lift FocusHeader to @mm/ui and adopt
  it in the Practice page."
- Question: Include FocusHeader lift as a side-task in Stage 24, or carry forward?
- Why ambiguous: Side-task is opportunistic; Stage 24 has a 1-day budget with a 3-mode Results
  screen and print styles. Budget pressure may not allow it.
- Blocking? no.
- Code affected: `apps/web/src/components/exam/FocusHeader.tsx` →
  `packages/ui/src/FocusHeader/FocusHeader.tsx`;
  `apps/web/src/app/(student)/session/[id]/practice/page.tsx`.
- Status: resolved
- Resolution (2026-05-14): **Include as side-task IF budget allows**. Clears UI-DIVERGENCE (e)
  from Stage 23 close. If anything risks the main Results screen scope (hero ring, 3-mode
  variants, print styles, e2e spec), skip and carry forward to Stage 25 audit day as a
  low-priority chore.

### Q-24.6 — `raw_score` as 0–100 percentage

- Date raised: 2026-05-14 (Stage 24 §2A)
- Asked of: self
- Source: `packages/types/src/session.ts` `SessionSummaryDTOSchema`; UI_CONTRACT §9.1 hero ring
  copy thresholds (≥80% "Well done", 60–79% "Good effort", <60% "Keep practising"); SCREEN_SPECS
  §11 "score %" display.
- Question: Is `SessionSummaryDTO.raw_score` a 0–100 percentage or a raw item count (e.g. 14/20)?
  Hero ring label and copy thresholds require a percentage.
- Why ambiguous: Schema names it `raw_score` (implies count) but SCREEN_SPECS §11 shows `%`
  display without a separate `total_items` denominator field in the DTO.
- Blocking? yes — affects hero ring label + copy + ring `stroke-dashoffset` calculation.
- Code affected: `apps/web/src/app/(student)/results/[id]/page.tsx`.
- Status: resolved
- Resolution (2026-05-14): **Treat `raw_score` as a 0–100 integer percentage**. Hero ring
  renders `{raw_score}%`; `stroke-dashoffset` = `circumference * (1 - raw_score / 100)`.
  Copy thresholds: ≥80 → "Well done", 60–79 → "Good effort", <60 → "Keep practising"
  (UI_CONTRACT §9.1). No separate `total_items` denominator in Stage 24.

### Q-24.5 — Diagnostic proficiency map data source

- Date raised: 2026-05-14 (Stage 24 §2A)
- Asked of: self
- Source: SCREEN_SPECS §11 (diagnostic variant: "proficiency map — horizontal bars with
  confidence-interval shading; no score; status bands Developing/Proficient/Advanced");
  `packages/types/src/proficiency.ts:9` `ProficiencyMapDTOSchema` (exists, no SDK hook,
  no analytics-svc endpoint in v1).
- Question: Render the diagnostic proficiency map in Stage 24 or stub it?
- Why ambiguous: DTO type exists but analytics-svc is not built until Stage 28+.
- Blocking? no.
- Code affected: `apps/web/src/app/(student)/results/[id]/page.tsx`.
- Status: resolved
- Resolution (2026-05-14): **Defer via stub**. ISSUE-0011(e) filed. Stage 24 diagnostic
  variant shows skill-band label rows (Developing / Proficient / Advanced) as static
  placeholder structure — layout ships; real data waits for analytics-svc.

### Q-24.4 — Practice mastery delta data source

- Date raised: 2026-05-14 (Stage 24 §2A)
- Asked of: self
- Source: SCREEN_SPECS §11 (practice variant: "mastery delta card"); PROJECT_STATE.md Stage 24
  notes ("mastery delta card"); intelligence-svc Stage 28+ `/intelligence/mastery-delta/{id}`
  (not yet built).
- Question: Show a real mastery delta in Stage 24 or stub it?
- Why ambiguous: SDK hook + endpoint not available until Stage 28.
- Blocking? no.
- Code affected: `apps/web/src/app/(student)/results/[id]/page.tsx`.
- Status: resolved
- Resolution (2026-05-14): **Defer via stub**. ISSUE-0011(d) filed. Practice variant renders
  a "Skill progress" card with "Available after more sessions" placeholder copy.

### Q-24.3 — Question review block data source

- Date raised: 2026-05-14 (Stage 24 §2A)
- Asked of: self
- Source: SCREEN_SPECS §11 (question summary block in practice variant); no
  `useSessionResponses` SDK hook; assessment-svc per-response state not exposed at
  results time in v1 DTO surface.
- Question: Render question review in Stage 24 or stub it?
- Why ambiguous: Data exists server-side but no DTO or SDK hook surfaces it at results time.
- Blocking? no.
- Code affected: `apps/web/src/app/(student)/results/[id]/page.tsx`.
- Status: resolved
- Resolution (2026-05-14): **Defer via stub**. ISSUE-0011(c) filed. Question review block
  is omitted in Stage 24; a `{/* TODO: ISSUE-0011c */}` comment marks the slot.

### Q-24.2 — Performance insights data source

- Date raised: 2026-05-14 (Stage 24 §2A)
- Asked of: self
- Source: SCREEN_SPECS §11 (scored variant: "performance insights" block);
  `packages/types/src/intelligence.ts:80` `ExplanationDTOSchema` (exists);
  `packages/core/src/index.ts` is empty — `explain-format.ts` does not exist;
  no SDK hook returns `ExplanationDTO` in v1.
- Question: Render performance insights in Stage 24 or stub it?
- Why ambiguous: Type exists but neither the helper file nor the SDK hook is built.
- Blocking? no.
- Code affected: `apps/web/src/app/(student)/results/[id]/page.tsx`.
- Status: resolved
- Resolution (2026-05-14): **Defer via stub**. ISSUE-0011(b) filed. Performance insights
  block is omitted in Stage 24; a `{/* TODO: ISSUE-0011b */}` comment marks the slot.

### Q-24.1 — Topic breakdown data source

- Date raised: 2026-05-14 (Stage 24 §2A)
- Asked of: self
- Source: SCREEN_SPECS §11 (scored variant: "topic breakdown"); UI_CONTRACT §5.2 ("topic
  breakdown" listed under scored mode); `SessionSummaryDTOSchema` in
  `packages/types/src/session.ts` — no per-topic breakdown field.
- Question: Render topic breakdown in Stage 24 or stub it?
- Why ambiguous: SCREEN_SPECS §11 lists it as part of the scored Results screen but the
  DTO carries no topic-level data.
- Blocking? no.
- Code affected: `apps/web/src/app/(student)/results/[id]/page.tsx`.
- Status: resolved
- Resolution (2026-05-14): **Defer via stub**. ISSUE-0011(a) filed. Topic breakdown block
  is omitted in Stage 24; a `{/* TODO: ISSUE-0011a */}` comment marks the slot.

### Q-23.5 — Timer-expiry auto-submit semantics

- Date raised: 2026-05-13 (Stage 23 §2A)
- Asked of: self
- Source: UI_CONTRACT §5.1 ("At 0:00: client calls `/submit`
  automatically; if offline, queues submit").
- Question: When `progress.time_remaining_ms` reaches 0 client-side,
  what is the exact submit + recovery contract — including offline
  behaviour and the case where `/submit` returns 409 because the
  server already terminated the session?
- Why ambiguous: UI_CONTRACT pins the auto-submit but doesn't
  enumerate the offline + 409 follow-on paths.
- Blocking? no (default is reasonable).
- Code affected:
  `apps/web/src/app/(student)/session/[id]/exam/page.tsx`.
- Status: resolved
- Resolution (2026-05-13): **default**. Client triggers `/submit`
  at `time_remaining_ms === 0`. If offline, queue the submit via
  the same `useResponseQueue` (ADR-0030 / Q-23.2) and replay on
  `online` event. If `/submit` returns 409 (session already
  terminated by the server), redirect to `/results/{id}` (which
  ships at Stage 24; the navigation is correct as written, even
  though the page is still being built).

### Q-23.4 — Adaptive section-boundary signal

- Date raised: 2026-05-13 (Stage 23 §2A)
- Asked of: self
- Source: UI_CONTRACT §5.1 + SCREEN_SPECS §9 mention an "adaptive
  section boundary banner" + "adaptive blocks cross-stage" rule on
  the question map. Neither `SessionStateDTO` nor
  `RecordResponseResponse` carries an explicit testlet boundary
  field. ADR-0024 (adaptive testlet routing) defines the routing
  model server-side but doesn't pin the client surface.
- Question: How does the Exam Engine page detect testlet boundaries
  for the banner + the question-map jump rule?
- Why ambiguous: DTO surface is silent; ADR-0024 is server-side.
- Blocking? no.
- Code affected: `packages/types/src/session.ts`,
  `supabase/functions/assessment-svc/handlers.ts`,
  `apps/web/src/app/(student)/session/[id]/exam/page.tsx`.
- Status: resolved
- Resolution (2026-05-13): **defer the adaptive section banner**
  to v1.1. For Stage 23, the question map enforces a **forward-nav
  block** based on `target.sequence_number > current_question_index`
  — strictly correct for both linear and adaptive (linear users can
  re-jump after answering forward; adaptive users cannot re-enter
  past testlets). The banner is omitted in v1. **ISSUE-0010** records
  the deferred work + the DTO additions required (new
  `current_testlet_id: string | null` field on `SessionStateDTO` +
  `RecordResponseResponse`).

### Q-23.3 — Service worker registration in v1?

- Date raised: 2026-05-13 (Stage 23 §2A)
- Asked of: self
- Source: UI_CONTRACT §5.1 ("Service worker caches the session
  shell"). Tied to Q-23.2.
- Question: Register a service worker in v1 (offline shell cache)
  or defer entirely?
- Why ambiguous: UI_CONTRACT calls for it; DEV_PLAN risk-cushion
  permits simplification.
- Blocking? no.
- Code affected: `apps/web/next.config.js`,
  `apps/web/public/sw.js` (would-be), `apps/web/src/app/layout.tsx`.
- Status: resolved
- Resolution (2026-05-13): **no service worker in v1**. Bundled into
  **ISSUE-0009** alongside the IndexedDB upgrade for v1.1. Consistent
  with Q-23.2 = B (in-memory queue, no persistence layer).

### Q-23.2 — Offline persistence shape (ADR-0030)

- Date raised: 2026-05-13 (Stage 23 §2A)
- Asked of: self
- Source: UI_CONTRACT §5.1 (IndexedDB queue + service worker shell
  cache); DEV_PLAN.md Stage 23 risk note ("simplify offline queue if
  slipping, but DO NOT compromise a11y gate").
- Question: Full IndexedDB + SW shape (option A), in-memory queue +
  online/offline events (option B), or no queue at all (option C)?
- Why ambiguous: spec calls for A; risk-cushion permits B; C
  violates "do not block the user from answering while offline".
- Blocking? no (B is the obvious risk-cushion default).
- Code affected: `apps/web/src/components/exam/`.
- Status: resolved
- Resolution (2026-05-13): **B — in-memory queue + `online` /
  `offline` event listeners + replay on reconnect with
  idempotency-key dedup. No IndexedDB. No service worker.**
  Recorded in **ADR-0030**. Page-reload during offline = lost queue
  (acceptable per DEV_PLAN risk note + autosave-every-30s cadence).
  IndexedDB + SW upgrade tracked as **ISSUE-0009** for v1.1.

### Q-23.1 — `useCheckpoint` as the autosave hook?

- Date raised: 2026-05-13 (Stage 23 §2A)
- Asked of: self
- Source: UI_CONTRACT §5.1 ("autosave every 30s + on blur,
  fire-and-forget"); SDK `useCheckpoint(sessionId)` exists from
  Stage 19; `CheckpointRequest { checkpoint_number,
  current_question_index, answers, client_timestamp }` shape.
- Question: Confirm `useCheckpoint` is the autosave path; cumulative
  answers list each tick; idempotency-keyed.
- Why ambiguous: hook hasn't been exercised yet — Stage 22b didn't
  use it. The CheckpointRequest schema's `answers` field shape is
  cumulative, not delta, but UI_CONTRACT doesn't spell that out.
- Blocking? no (default is the obvious read).
- Code affected:
  `apps/web/src/app/(student)/session/[id]/exam/page.tsx`.
- Status: resolved
- Resolution (2026-05-13): **default**. `useCheckpoint` is the
  autosave hook. Client builds a cumulative `answers` list each
  tick (the full working set, including unanswered placeholders if
  any), with `client_timestamp` set to the current `Date.now()` ISO
  string. **Idempotency key per `checkpoint_number`** — Stage 19's
  X3 contract supports passing a stable key, so each checkpoint
  number is its own retry boundary. Failures log to console with
  `trace_id` and do not surface to the user (UI_CONTRACT §5.1
  "fire-and-forget").

### Q-22.4 — Session Selection: include a recent-sessions row?

- Date raised: 2026-05-12 (Stage 22b morning, §2A walkthrough vs SCREEN_SPECS)
- Asked of: self
- Source: SCREEN_SPECS.md §8 v1 content (lines 458-461) lists Heading +
  Subject chips + Pathway cards + Locked pathways — no recent-sessions
  row. The original Stage 22 C-C-D-V (and the Q-22.1 SDK hook
  `useListRecentSessions` shipped in Stage 22a) called for a "Recent
  sessions row from useListRecentSessions() (top 5)" on
  `/session-selection`. SCREEN_SPECS §12 (Learning Hub) is the screen
  that lists "Recent activity — last 5 sessions"; Screen 14 (Student
  Dashboard) is the natural consumer too.
- Question: Drop the recent-sessions row from `/session-selection` per
  SCREEN_SPECS §8 authority, keep it as an in-scope augmentation, or
  redirect into a stub `/learn` page in Stage 22b?
- Why ambiguous: Spec authority vs already-shipped Stage 22a SDK hook
  motivated by Q-22.1 ("Used by Session Selection screen (Stage 22)").
- Blocking? **yes** — Stage 22b screen layout decision.
- Code affected: `apps/web/src/app/(student)/session-selection/page.tsx`,
  `docs/prompts/2026-05-12_stage-22b.md`.
- Status: resolved
- Resolution (2026-05-12): **A — drop the recent-sessions row from
  `/session-selection`** per SCREEN_SPECS §8 authority. `useListRecentSessions`
  stays in the SDK unused this stage; first consumer becomes Screen 12
  (Learning Hub) or Screen 14 (Student Dashboard) when those ship. The
  saved C-C-D-V (`docs/prompts/2026-05-12_stage-22b.md`) Deliverable §1
  edited in-place to strike the row + add a one-line resolution note;
  edit bundled into the Stage 22b implementation commit, not a fresh
  prep commit.

### Q-22.3 — `MmClient` baseUrl strategy across multiple Edge Functions

- Date raised: 2026-05-11 (Stage 22 implementation start)
- Asked of: self
- Source: `packages/sdk/src/client.ts` single `baseUrl` config vs
  Edge Functions deployed at
  `${SUPABASE_URL}/functions/v1/<svc-name>/<path>`
  (`supabase/functions/{assessment-svc,content-svc,intelligence-svc}/index.ts`
  dispatchers strip per-service prefix).
- Question: How does `MmClient` resolve a hook call to the correct
  Edge Function URL when each function lives under its own
  per-service path segment?
- Why ambiguous: Stage 14 (SDK) was written before Edge Functions
  existed. No prior ADR pins the public-edge URL shape. Five
  plausible resolutions surfaced: routing table inside `MmClient`,
  per-service providers, SDK gateway proxy, Next.js `/api` route
  handler, single client + service-prefix-in-hook.
- Blocking? **yes** — Stage 22 cannot wire `useCreateSession()`
  without this decision.
- Code affected: `packages/sdk/src/client.ts`,
  `packages/sdk/src/hooks/*.ts`,
  `apps/web/src/providers/Providers.tsx`.
- Status: resolved
- Resolution (2026-05-11): **Single `MmClient` at
  `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1`; each hook prepends its
  service prefix in the path** (e.g.
  `client.get('/assessment-svc/sessions/recent', ...)`). No mapping
  table. No proxy layer. No per-service providers. Recorded in
  **ADR-0029**. See ADR for option-set and rationale.

### Q-22.2 — SDK hook paths diverge from Edge Function dispatcher routes

- Date raised: 2026-05-11 (Stage 22 implementation start)
- Asked of: self
- Source: SDK Stage 14 was wired against a path contract that
  Stage 18/19/20 dispatchers ultimately did not adopt verbatim.
  Spot-grep showed at least two confirmed divergences before
  full audit (`useCreateSession` calls `POST /sessions` but
  `assessment-svc/index.ts:217` serves `POST /sessions/create`;
  `useSessionSummary` calls `GET /sessions/{id}/summary` but
  `assessment-svc/index.ts:352` serves `GET /sessions/{id}`).
- Question: How are SDK paths reconciled with Edge Function
  dispatcher routes — patch SDK to match dispatchers, patch
  dispatchers to match SDK, or some hybrid?
- Why ambiguous: Stage 14 SDK and Stages 18/19/20 dispatchers were
  developed against the spec at different times; the spec doesn't
  fully constrain the path shape (only the operation surface).
- Blocking? **yes** — Stage 22 hooks must reach real endpoints.
- Code affected: `packages/sdk/src/hooks/*.ts`, possibly
  `packages/sdk/src/__tests__/hooks.test.ts`.
- Status: resolved
- Resolution (2026-05-11): **Dispatcher paths win.** SDK paths are
  patched to match the route each dispatcher actually serves.
  Implemented in Stage 22a (single mechanical sweep): each hook
  prepends its service prefix per Q-22.3 / ADR-0029, and any path
  that doesn't match the dispatcher's route is corrected against
  the dispatcher source. Full audit grep run before edits to
  surface the complete set, not just the two found in the
  blocker report.

### Q-22.1 — `useListRecentSessions` hook: endpoint path

- Date raised: 2026-05-11 (Stage 22 §2A)
- Asked of: self
- Source: SCREEN_SPECS.md §8 ("Recent sessions via `SessionSummaryDTO`");
  assessment-svc Stage 19 ships `listRecentSessions` handler; OWNERS.md
  assessment-svc Endpoints Owned [v1].
- Question: What HTTP path does `useListRecentSessions` call? SCREEN_SPECS
  §8 names the DTO but not the endpoint; assessment-svc handler is named
  `listRecentSessions`.
- Why ambiguous: Stage 19 wired the handler but the route mapping wasn't
  surfaced in the §2A walkthrough.
- Blocking? no — natural default is `GET /sessions/recent`.
- Code affected: `packages/sdk/src/hooks/session.ts`,
  `packages/sdk/src/keys.ts`, `apps/web/src/app/(student)/session-selection/page.tsx`.
- Status: resolved
- Resolution (2026-05-11): `GET /sessions/recent`. Locked in
  **OWNERS.md:99** under "Service: `assessment-svc` (ASS) → Endpoints
  Owned [v1]". `useListRecentSessions` hook calls this path; query key
  `mmKeys.sessions.recent()`. No ADR required — endpoint is already
  authoritatively listed in OWNERS.md.

### Q-21.5 — 1000-request scaling test: literal vs constant

- Date raised: 2026-05-09 (Stage 21 §2A)
- Asked of: self
- Source: DEV_PLAN.md Stage 21 deliverables ("first request cold-loads,
  1000 subsequent requests skip DB")
- Question: Hard-code `1000` in the test loop, or a `const REQUEST_COUNT = 1000`
  binding?
- Why ambiguous: Stylistic. Hard-code is concise; constant is grep-able and
  tunable.
- Blocking? no
- Code affected: `supabase/functions/content-svc/__tests__/contract.test.ts`
- Status: resolved
- Resolution (2026-05-09): Constant-driven — `const REQUEST_COUNT = 1000`.
  Grep-able if Stage 26 load-test reveals the test floor needs raising;
  matches the existing fixture-builder style elsewhere in the contract
  tests.

### Q-21.4 — Stale-while-revalidate on `loadGraphData` failure

- Date raised: 2026-05-09 (Stage 21 §2A)
- Asked of: self
- Source: arch §9.3 (cache strategy) + arch §5.3 (degraded mode); current
  `_shared/skill-graph-cache.ts:getSkillGraph()` throws on partial failure
- Question: When `loadActiveVersion()` succeeds with a new watermark but
  `loadGraphData()` fails, retain the prior cache or fail fast?
- Why ambiguous: arch §9.3 names the cache as the single read path but
  doesn't pin the partial-failure semantics. Fail-fast is current; stale-
  while-revalidate is a small change with real production benefit.
- Blocking? no
- Code affected: `supabase/functions/_shared/skill-graph-cache.ts`,
  `supabase/functions/content-svc/__tests__/contract.test.ts`
- Status: resolved
- Resolution (2026-05-09): YES — stale-while-revalidate. Retain prior
  cache + emit structured `console.warn` (`event:'skill_graph_stale_revalidate_failed'`,
  `error`, `watermark_old`, `watermark_new`, optional `trace_id`). Future
  calls re-attempt; cache catches up on first successful load. If NO prior
  cache exists, behaviour is unchanged (throw). Documented in **ADR-0028**.
  Contract test: prior cache + new watermark + `loadGraphData` failure →
  returns prior data, `console.warn` fires.

### Q-21.3 — Concurrent cold-start de-duplication

- Date raised: 2026-05-09 (Stage 21 §2A)
- Asked of: self
- Source: arch §9.3; production-hardening §2A review
- Question: Two requests hit a fresh worker simultaneously, both observe
  `cache === null`, both call `loadGraphData()`. In-flight Promise sentinel,
  or accept the redundant load as a v1 approximation?
- Why ambiguous: Cost is bounded (one extra round-trip per worker per cold
  start); under autoscale events the multiplier can grow. The fix is small
  but adds module-scope state.
- Blocking? no
- Code affected: `supabase/functions/_shared/skill-graph-cache.ts`,
  `supabase/functions/content-svc/__tests__/contract.test.ts`
- Status: resolved
- Resolution (2026-05-09): YES — in-flight Promise sentinel. When
  `getSkillGraph` enters the load path with `cache === null`, store the
  load promise in a module-scope `loadingPromise` slot; concurrent callers
  observe the sentinel and `await` it; cleared on resolve/reject.
  Documented in **ADR-0028**. Contract test: two concurrent
  `getSkillGraph()` calls on a cold cache → `dataCalls() === 1`.

### Q-21.2 — Synthetic timing test for the <5ms exit criterion

- Date raised: 2026-05-09 (Stage 21 §2A)
- Asked of: self
- Source: DEV_PLAN.md Stage 21 exit criterion ("Watermark check cost < 5ms
  per request"); BUILD_CONTRACT §10 (latency budgets measured at Stage 26
  load test)
- Question: How to gate the <5 ms exit criterion in a contract test that
  runs in CI on a cold Vitest process with a mocked DB?
- Why ambiguous: 5 ms is a real-DB warm-pool number; CI cold-process
  Vitest with a mocked DB can be 10× slower for unrelated reasons (V8
  warm-up, stub-overhead, GC). Using 5 ms in CI would be flaky.
- Blocking? no
- Code affected: `supabase/functions/content-svc/__tests__/contract.test.ts`
- Status: resolved
- Resolution (2026-05-09): Synthetic test with **10× margin** — assert
  mean cost / iteration < 50 ms over 100 warm watermark checks against the
  mocked loader. Named as DEV_PLAN exit criterion test
  (`'watermark check cost < 50ms per iteration synthetic (DEV_PLAN exit
  criterion 10× margin)'`). Real <5 ms gate at Stage 26 load test against
  warm Postgres pool.

### Q-21.1 — intelligence-svc L3a migration to skill-graph cache

- Date raised: 2026-05-09 (Stage 21 §2A)
- Asked of: self
- Source: arch §9.3 (cache as single read path);
  `supabase/functions/intelligence-svc/handlers.ts` (Stage 20) queries
  `skill_edge` directly bypassing the cache
- Question: Does Stage 21 migrate intelligence-svc L3a to use
  `getSkillGraph()` instead of querying `skill_edge` directly?
- Why ambiguous: arch §9.3 implies the cache is THE read path; Stage 20
  (Q-20.10) chose direct query as a depth-1 helper to avoid coupling
  intelligence-svc to the cache module. Migration tightens the
  architecture but expands Stage 21 scope and risks regressing the
  Stage 20 replay-determinism named test.
- Blocking? potentially (would change implementation strategy)
- Code affected: `supabase/functions/intelligence-svc/handlers.ts`,
  `supabase/functions/intelligence-svc/__tests__/contract.test.ts`
- Status: resolved
- Resolution (2026-05-09): **NO** for Stage 21 — scope discipline. Stage
  21 is *cache hardening* (in-flight dedup + stale-while-revalidate per
  ADR-0028), not *cache adoption*. Pulling in a new caller would double-
  scope the stage and risk replay-determinism regression in Stage 20's
  named exit-criterion test. **Filed as ISSUE-0006** (medium severity,
  architectural-consistency vs arch §9.3): address pre-launch in a small
  dedicated stage OR roll into Stage 28 (jobs-worker) when
  orchestration-svc + analytics-svc readers also adopt the cache.

### Q-20.15 — Sync HTTP timeout + error fallback semantics

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: self
- Source: BUILD_CONTRACT §10 (5s p95 budget on `/submit`); arch §5.2 (3-attempt
  retry policy on pipeline.run_sync); spec §7.2 line 1020
  ("session remains in `submitted` state and a retry is scheduled immediately")
- Question: What HTTP timeout for the inline intelligence-svc call from
  `/submit`, and what error categories trigger soft-fallback vs propagate?
- Why ambiguous: §7.2 says "retry scheduled immediately" but §5.2 retry policy
  is owned by the worker (Stage 28+); Stage 20 has no worker yet.
- Blocking? no
- Code affected: `supabase/functions/assessment-svc/handlers.ts` submitSession
- Status: resolved
- Resolution (2026-05-08): 4000 ms HTTP timeout (1s safety margin under the
  5s `/submit` p95 budget). On timeout / 4xx / 5xx / network error → return
  submit success with `pipeline_status='pending'` + log warn; never fail the
  user-facing submit. The Stage 10 outbox-dispatcher cron's queued
  `pipeline.run_sync` job becomes the retry path (worker exists Stage 28+).
  Documented in **ADR-0027**.

### Q-20.14 — `trace_id` propagation header

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: self
- Source: arch §7.4 audit-log requirements; existing
  `supabase/functions/_shared/trace-id.ts` (basic UUID gen)
- Question: Header name + propagation strategy from assessment-svc to
  intelligence-svc?
- Why ambiguous: First inter-service HTTP call requiring trace_id
  propagation (Stage 18 content-svc was service-role-keyed only, no trace
  flow).
- Blocking? no
- Code affected: `supabase/functions/_shared/trace-id.ts`,
  `supabase/functions/assessment-svc/handlers.ts`,
  `supabase/functions/intelligence-svc/index.ts`
- Status: resolved
- Resolution (2026-05-08): `x-mm-trace-id` HTTP header. assessment-svc
  generates if absent; passes via header to intelligence-svc;
  intelligence-svc writes the same `trace_id` to all `intelligence_audit_log`
  rows + `pipeline_event` rows in this run. Standard observability pattern.
  No ADR needed.

### Q-20.13 — `intelligence_audit_log.input_snapshot` scope

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: self
- Source: spec §7.4.2 (audit-log replay safety); ADR-0013 (column projection)
- Question: Full session_response payload or per-skill aggregates?
- Why ambiguous: Replay determinism wants smallest possible deterministic
  input; debuggability wants the full payload.
- Blocking? no
- Code affected: `supabase/functions/intelligence-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-08): Per-skill aggregates only —
  `{ skills: [{ skill_id, attempts, correct, mastery_before, mastery_after,
  ... }] }` sorted by `skill_id ASC`, canonicalised via the
  `_shared/intelligence-helpers.ts:canonicalize()` helper. Hash-friendly,
  bounded, deterministic. Documented in **ADR-0027**.

### Q-20.12 — `guess_probability` storage location

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: product owner
- Source: DEV_PLAN Stage 20 deliverables ("per-response `guess_probability`
  in `learning_event.metadata`"); spec §7.6 schema embedding
  `guess_probability` in answer event metadata; OWNERS.md `assessment-svc`
  WRITE row marking `learning_event` as immutable
- Question: Per-response storage path: (A) new `learning_event_type` enum
  value `'behaviour_signal'` + INSERT new rows, (B) relax `learning_event`
  mutability and UPDATE answer-row metadata, or (C) aggregate-only in v1?
- Why ambiguous: Spec §7.6 schema describes per-response storage *as if* the
  field is set at response time; §9.2 formula needs session-end
  `recent_responses` for `pattern_factor` (so it must be computed
  post-session); OWNERS.md immutability invariant blocks the UPDATE path.
- Blocking? yes
- Code affected: `supabase/migrations/0013_behaviour_signal_event_type.sql`
  (NEW, if A); `supabase/functions/intelligence-svc/handlers.ts`;
  `supabase/migrations/0001_enums_tenancy_auth.sql` (enum extended)
- Status: resolved
- Resolution (2026-05-08): **A**. Migration 0013 ALTERs `learning_event_type`
  enum to add `'behaviour_signal'`; intelligence-svc INSERTs one new
  `learning_event` row per answer response carrying L2 per-response signals
  in `metadata`. Preserves immutability invariant (new rows, no UPDATEs).
  One enum value covers all current and future L2 per-response signals
  without further migrations. Migration 0013 must be tested via
  `pnpm test:migration` locally before deploy (sandbox lacks Docker — same
  caveat as 0012). Documented in **ADR-0027**.

### Q-20.11 — `distractor_rationale` JSON shape

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: self
- Source: `supabase/migrations/0002_content_skill_graph.sql:195`
  (`distractor_rationale jsonb` column on `item_version`); spec §10
  ("misconception from `distractor_rationale`"); seed
  `supabase/seeds/02_content.sql:357–364`
- Question: Codified shape for L3a misconception lookup?
- Why ambiguous: Schema column is `jsonb`; no spec table specifies the shape.
- Blocking? no
- Code affected: `supabase/functions/intelligence-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-08): Adopt the seed-de-facto shape:
  `{ [choice_id: string]: { misconception_id: string } }` with absent entries
  for untagged choices (seeds use `jsonb_strip_nulls`). For each incorrect
  response, look up `distractor_rationale[response.choice_id]?.misconception_id`;
  if present → UPSERT `student_misconception`. Documented in **ADR-0027**.

### Q-20.10 — L3a depth-1 prerequisite walk

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: self
- Source: spec §7.2 ("L3a is bounded: touched_skills × 1 prerequisite
  layer"); spec §10.2 `find_root_causes` recursive helper
- Question: Inline a depth-1 walk in Stage 20, or wait for Stage 28's
  full `traverse_upstream`?
- Why ambiguous: DRY argues for one helper; YAGNI argues for the bounded
  version now.
- Blocking? no
- Code affected: `supabase/functions/_shared/intelligence-helpers.ts`
- Status: resolved
- Resolution (2026-05-08): Inline `walkPrereqsDepth1(skillIds, skillEdges)`
  in `_shared/intelligence-helpers.ts` returning `Set<skill_id>` (sorted
  output). Reads from existing `_shared/skill-graph-cache.ts`. Stage 28's
  full traversal is a separate function. Spec §7.2's depth=1 bound is a
  performance contract — Stage 20 must enforce it; deferring to a generic
  helper risks accidental depth bleed.

### Q-20.9 — Year-level-aware behaviour defaults

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: self
- Source: spec §9.6 defaults table (Y1–3 → 15min, Y4–6 → 20min, Y7–9 →
  30min, Y10–12 → 40min for `avg_fatigue_onset_minutes`); migration 0005
  hardcoded defaults of 20/20
- Question: Read `user_profile.year_level` and apply year-keyed defaults,
  or accept the migration's Y4–6 defaults for all students?
- Why ambiguous: v1 only targets Y5 (NAPLAN) and Y5–6 (ICAS Math C);
  defaults work for the target audience. But student data outside that
  window will silently mis-default.
- Blocking? no
- Code affected: `supabase/functions/intelligence-svc/handlers.ts`,
  `supabase/functions/_shared/intelligence-helpers.ts`
- Status: resolved
- Resolution (2026-05-08): Read `user_profile.year_level` and apply the
  spec §9.6 map. `_shared/intelligence-helpers.ts:yearLevelDefaults(year)`
  returns the right default per band. Cheap to do right once; no
  hard-to-find drift later.

### Q-20.8 — `pipeline_event` rows for sync steps 1/2/3

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: self
- Source: spec §7.2.1 (`pipeline_event` schema described as "step: int —
  4–9"); migration 0006 schema (`step int CHECK (step BETWEEN 1 AND 9)`);
  DEV_PLAN Stage 20 deliverables ("per-step `pipeline_event` rows")
- Question: Write `pipeline_event` rows for sync steps 1/2/3 too, or
  only the documented async 4–9?
- Why ambiguous: Spec prose says async-only; schema CHECK permits 1–9;
  DEV_PLAN says per-step.
- Blocking? no
- Code affected: `supabase/functions/intelligence-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-08): Yes — write `pipeline_event` rows for sync steps
  1, 2, 3 (foundation, behaviour, causal-scoped). Status transitions
  `pending → processing → completed/failed` per row. DEV_PLAN literal +
  schema permits + better observability for the sync path. Spec §7.2.1
  prose is descriptive of the async case; the schema is the contract.

### Q-20.7 — Re-processing idempotency (Stage 28 worker pickup)

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: self
- Source: existing migration 0010 (Stage 10 outbox-dispatcher cron enqueues
  `pipeline.run_sync` job per submit); jobs-worker not built until Stage 28;
  arch §5.2 idempotency keys
- Question: How does intelligence-svc avoid re-processing when Stage 28's
  worker eventually picks up the orphan `pipeline.run_sync` jobs queued
  during Stages 20–27?
- Why ambiguous: Without a guard, the worker would re-execute against
  intelligence-svc; if `algorithm_version` had bumped in between, the
  second run could diverge from the first → replay determinism fails.
- Blocking? yes
- Code affected: `supabase/functions/intelligence-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-08): Audit-log dedup at handler entry on
  `(session_id, algorithm_version)`. intelligence-svc selects
  `intelligence_audit_log` for prior `event_type='session.processed'`
  rows; if any → return 200 `already_processed` without writing.
  Plus all writes UPSERT (skill_mastery, learning_velocity,
  behaviour_profile, student_misconception). Stage 28 worker call =
  no-op. Documented in **ADR-0027**.

### Q-20.6 — §21.0.2 vs §7.2 reconciliation

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: self
- Source: spec §21.0.2 line 2877 ("No synchronous inter-service HTTP
  calls"); spec §7.2 line 997 (sync portion "must complete before submit
  response is returned"); arch §4.5 (intelligence-svc endpoint)
- Question: How does Stage 20 reconcile §21.0.2's prohibition with §7.2's
  mandate for inline-before-submit?
- Why ambiguous: Two locked spec sections appear to contradict.
- Blocking? yes
- Code affected: ADR + future inter-service-HTTP decisions
- Status: resolved
- Resolution (2026-05-08): §7.2 wins as the more-specific section. Treat
  the submit→intelligence-svc call as the *one* officially-blessed sync
  inter-service HTTP exception. §21.0.2's prohibition continues to bind
  every other inter-service call. Future stages adding inline HTTP must
  extend or supersede ADR-0027 — not silently broaden the door.
  Documented in **ADR-0027**.

### Q-20.5 — `processing_time_ms` measurement strategy

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: self
- Source: arch §7.4 audit-log requirements (`processing_time_ms` field);
  spec §7.2 (3s SLA)
- Question: One timer at handler entry/exit, or per-layer timers?
- Why ambiguous: Per-layer would help debug L1/L2/L3a contributions to
  the 3s budget.
- Blocking? no
- Code affected: `supabase/functions/intelligence-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-08): Single `performance.now()` at handler entry,
  single delta at exit, written once to
  `intelligence_audit_log.output.processing_time_ms`. Per-layer breakdown
  is captured in `pipeline_event.started_at`/`completed_at` for steps 1, 2,
  3 (Q-20.8) — observability split is clean without sprinkling timers in
  the handler body.

### Q-20.4 — Replay-determinism floor

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: self
- Source: spec §7.4.2 (algorithm_version stamped for replay safety);
  DEV_PLAN Stage 20 risk row ("No `Math.random`, no floats summed in
  non-deterministic order, no timestamps as inputs")
- Question: What concrete code-level rules?
- Why ambiguous: DEV_PLAN sketches the rules; the floor needs to be
  enforceable.
- Blocking? no
- Code affected: `supabase/functions/intelligence-svc/handlers.ts`,
  `supabase/functions/_shared/intelligence-helpers.ts`
- Status: resolved
- Resolution (2026-05-08): Forbid: `Math.random()`, `Date.now()` as
  algorithm input, `Set`/`Map` iteration order assumptions, default
  `JSON.stringify` on objects with non-deterministic key order. Use
  sorted-key serialisation in `_shared/intelligence-helpers.ts:canonicalize(obj)`
  for any hash input. ORDER BY on every aggregate (`skill_id ASC`,
  `response_id ASC`). Timestamps are write-only metadata, not formula
  inputs.

### Q-20.3 — `algorithm_version` format

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: self
- Source: spec §7.4.2; `intelligence_audit_log.algorithm_version text NOT
  NULL` column at migration 0005:120
- Question: Format string?
- Why ambiguous: Spec column requires text, no format codified.
- Blocking? no
- Code affected: `supabase/functions/_shared/intelligence-helpers.ts`
- Status: resolved
- Resolution (2026-05-08): `intelligence-vN.M.P` semver. Initial
  `intelligence-v1.0.0`. Major bumps on output-shape changes (audit-log
  schema migration), minor on formula changes (e.g., adjusting weights
  in mastery formula §8.1), patch on bugfix (e.g., off-by-one in 14-day
  velocity window). Stored as exported constant `ALGORITHM_VERSION` in
  `_shared/intelligence-helpers.ts`. Documented in **ADR-0027**.

### Q-20.2 — `pipeline_status` enum has `'sync_complete'`

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: self
- Source: `supabase/migrations/0001_enums_tenancy_auth.sql:71–73`
- Question: Does the existing `pipeline_status` enum include
  `'sync_complete'`, or does Stage 20 need a new migration?
- Why ambiguous: Quick verification before writing the handler.
- Blocking? no
- Code affected: n/a
- Status: resolved
- Resolution (2026-05-08): Yes —
  `pipeline_status AS ENUM ('pending', 'sync_complete', 'async_complete',
  'async_partial', 'async_failed')` already exists from Stage 2.
  No migration needed for the enum.

### Q-20.1 — Sync trigger model

- Date raised: 2026-05-08 (Stage 20 §2A)
- Asked of: self
- Source: spec §7.2 line 997; arch §5.1 trigger flow; DEV_PLAN Stage 20
  ("called inline from submit"); Q-19.2 resolution
- Question: assessment-svc `/submit` calls intelligence-svc inline (HTTP),
  or does the trigger flow stay outbox-mediated?
- Why ambiguous: §7.2 says inline; arch §5.1 trigger flow shows outbox-
  mediated; §21.0.2 forbids sync inter-service HTTP categorically.
- Blocking? yes
- Code affected: `supabase/functions/assessment-svc/handlers.ts`
  submitSession; `supabase/functions/intelligence-svc/index.ts`
- Status: resolved
- Resolution (2026-05-08): Inline HTTP from `/submit`. On 200 →
  `pipeline_status='sync_complete'`; on timeout/error → keeps
  `'pending'`. Outbox row + dispatcher's `pipeline.run_sync` job remain
  the retry path. §7.2 line 997 is decisive ("must complete before
  submit response is returned"); §21.0.2 reconciled per Q-20.6.
  Documented in **ADR-0027**.

### Q-19.13 — Mock-Supabase Proxy reuse strategy

- Date raised: 2026-05-08 (Stage 19 §2A)
- Asked of: self
- Source: Stage 18 `content-svc/__tests__/contract.test.ts:54–82`
- Question: Copy-paste the callable-Proxy mock into assessment-svc tests, or hoist
  to a shared `_test-helpers/` module?
- Why ambiguous: First reuse instance — DRY vs co-location is a judgement call.
- Blocking? no
- Code affected: `supabase/functions/_test-helpers/`,
  `supabase/functions/content-svc/__tests__/contract.test.ts`,
  `supabase/functions/assessment-svc/__tests__/contract.test.ts`
- Status: resolved
- Resolution (2026-05-08): Hoist to `supabase/functions/_test-helpers/mock-supabase.ts`.
  content-svc test imports from there (no behaviour change). DRY beats co-location
  with two consumers; test-only utility, no runtime impact.

### Q-19.12 — `@mm/assessment-svc` package script set

- Date raised: 2026-05-08 (Stage 19 §2A)
- Asked of: self
- Source: Stage 18 precedent (`@mm/content-svc`); BUILD_CONTRACT §9
- Question: Should assessment-svc have lint/build scripts in addition to typecheck/test?
- Why ambiguous: Edge Function packages deploy via Supabase CLI, not pnpm build.
- Blocking? no
- Code affected: `supabase/functions/assessment-svc/package.json`
- Status: resolved
- Resolution (2026-05-08): typecheck + test only. Matches content-svc; no value in
  adding lint that wasn't there for content-svc. ESLint not configured for Edge
  Function code in v1.

### Q-19.11 — Rate-limit bucket key shape

- Date raised: 2026-05-08 (Stage 19 §2A)
- Asked of: self
- Source: arch §4.13; `0011_rate_limit_fn_outbox_cleanup.sql:9` `fn_check_rate_limit`
- Question: Bucket key format for `/sessions/respond` etc — composite endpoint:scope
  string vs structured?
- Why ambiguous: arch §4.13 specifies limits but not key shape.
- Blocking? no
- Code affected: `supabase/functions/_shared/rate-limit.ts` callers in
  assessment-svc handlers
- Status: resolved
- Resolution (2026-05-08): `<endpoint>:<student_id>` as `bucket_key` text;
  `window_start = date_trunc('minute', now())`. Matches existing
  `fn_check_rate_limit(p_bucket_key, p_window_start, p_limit)` signature and
  `rate_limit_bucket(bucket_key, window_start)` PK.

### Q-19.10 — Stage 19 commit boundary

- Date raised: 2026-05-08 (Stage 19 §2A)
- Asked of: self
- Source: BUILD_CONTRACT §11.1 (one stage = one atomic commit)
- Question: Single atomic commit or split (migration separately, then svc + e2e)?
- Why ambiguous: Stage 19 is 2 days of work touching migration, _shared/,
  assessment-svc, apps/web Playwright — large diff.
- Blocking? no
- Code affected: git history
- Status: resolved
- Resolution (2026-05-08): Single atomic commit per BUILD_CONTRACT §11.1. Stage
  atomicity over PR-size aesthetics. Pre-implementation artefacts (this commit:
  ADR-0026, QUESTIONS resolutions, C-C-D-V archive) are doc-only and travel in
  a separate `chore(stage-19)` commit ahead of the implementation.

### Q-19.9 — Playwright setup scope for first e2e

- Date raised: 2026-05-08 (Stage 19 §2A)
- Asked of: self
- Source: DEV_PLAN.md Stage 19 deliverables ("Playwright e2e — signup → session
  create → 5 responses → submit → score returned")
- Question: Full Playwright setup (devDep + config + browser install + spec)
  or minimal SDK-CLI substitute?
- Why ambiguous: First e2e adds substantial setup overhead for a single happy-path.
- Blocking? no
- Code affected: `apps/web/package.json`, `apps/web/playwright.config.ts`,
  `apps/web/playwright/e2e/session-flow.spec.ts`
- Status: resolved
- Resolution (2026-05-08): Full Playwright setup. DEV_PLAN explicitly lists the
  e2e as a deliverable; the config + spec is reusable across Stages 22–25 frontend
  stages. CI integration deferred to Stage 26 (load-test stage). Browser install
  via `pnpm exec playwright install chromium`, documented at evening close.

### Q-19.8 — First-item provisioning model on `/sessions/create`

- Date raised: 2026-05-08 (Stage 19 §2A)
- Asked of: self
- Source: DEV_PLAN.md Stage 19 ("atomic write of session_record + first item");
  spec §3.6.1 `CreateSessionResponse`
- Question: Single multi-step DB transaction (across HTTP to content-svc) or
  multi-phase with idempotency-key + partial-unique-index as safety net?
- Why ambiguous: Edge Functions can't easily span a DB transaction across an
  HTTP call to another service.
- Blocking? no
- Code affected: `supabase/functions/assessment-svc/handlers.ts` createSession
- Status: resolved
- Resolution (2026-05-08): Multi-phase, with idempotency-key + the existing
  `idx_session_one_active` partial unique index (`0004_sessions_events.sql:76`)
  as the safety net. INSERT session_record(status=created) → HTTP /content/select
  → UPDATE engine_state + transition to active → return first item. Duplicate
  create via stale tab fails on the partial unique index; replay of the same
  Idempotency-Key returns the cached response.

### Q-19.7 — content-svc call from session-create

- Date raised: 2026-05-08 (Stage 19 §2A)
- Asked of: self
- Source: spec §21.0.2 ("No synchronous inter-service HTTP calls"); Stage 18
  Q-18.8 (content-svc `/content/select` is service-role only)
- Question: HTTP fetch to content-svc `/content/select` (sync) or inline the
  selection logic into assessment-svc?
- Why ambiguous: spec §21.0.2 prohibits sync inter-service HTTP for *core flow*;
  session-create is a one-off boundary call.
- Blocking? no
- Code affected: `supabase/functions/assessment-svc/handlers.ts` createSession
- Status: resolved
- Resolution (2026-05-08): HTTP fetch to content-svc with `x-mm-service-role`
  header (env: `SUPABASE_SERVICE_ROLE_KEY`). Mirrors Stage 18 contract; avoids
  forking the selection handler. session-create is a one-off (5/min rate limit
  per arch §4.13) so the round-trip cost is bounded. If perf concerns surface
  under load (Stage 26), revisit and inline.

### Q-19.6 — EngineState boundary parse on read

- Date raised: 2026-05-08 (Stage 19 §2A)
- Asked of: self
- Source: ADR-0023 (EngineState discriminated union); CLAUDE.md (Zod at every
  API boundary)
- Question: `EngineStateSchema.parse()` on every read of
  `session_record.engine_state_snapshot`, or trust the DB and cast?
- Why ambiguous: Edge Function is the only writer (Pattern G RLS), so a cast
  is *technically* safe; but the discipline elsewhere is parse-on-boundary.
- Blocking? no
- Code affected: `supabase/functions/assessment-svc/handlers.ts` (every handler
  that reads engine state)
- Status: resolved
- Resolution (2026-05-08): `EngineStateSchema.parse()` on every read. ~1ms cost
  per respond; well within BUILD_CONTRACT §10 budget. Boundary discipline is
  uniform across the codebase; carving an exception here invites drift.

### Q-19.5 — Optimistic-lock failure semantics on `/respond`

- Date raised: 2026-05-08 (Stage 19 §2A)
- Asked of: self
- Source: DEV_PLAN.md Stage 19 exit criterion ("Version conflict surfaces 409");
  `create_session_response_atomic` raises `VERSION_CONFLICT` (P0001)
- Question: Surface 409 to client (client refreshes via /state and retries) or
  server-side retry?
- Why ambiguous: Server retry could mask transient races, but also masks genuine
  concurrent-tab bugs.
- Blocking? no
- Code affected: `supabase/functions/assessment-svc/handlers.ts` respondToSession
- Status: resolved
- Resolution (2026-05-08): Surface 409 `CONFLICT`. Client must GET /sessions/{id}/state
  and retry with the refreshed version + lock_token. Per DEV_PLAN exit criterion
  named test. Server-side retry would paper over genuine concurrent-tab bugs.

### Q-19.4 — Lock-token rotation lifecycle

- Date raised: 2026-05-08 (Stage 19 §2A)
- Asked of: self
- Source: arch §4.4 (`X-Session-Lock` required header); spec §3.4 (single-active-
  session invariant); `session_record.lock_token uuid` column already present
- Question: Single token at create vs rotate per respond vs time-windowed rotation?
- Why ambiguous: Spec/arch reference the column but don't pin lifecycle.
- Blocking? no (defaults to single-token if not addressed, but weakens
  /checkpoint and /abandon)
- Code affected: `supabase/functions/assessment-svc/handlers.ts`,
  `packages/types/src/session.ts` (`RecordResponseResponseSchema` widening)
- Status: resolved
- Resolution (2026-05-08): Rotate `lock_token` on every successful create /
  respond / resume. Client echoes via `X-Session-Lock`; mismatch → 409
  `LOCK_CONFLICT`. Codified as a service pattern in **ADR-0026** for inheritance
  by assignments-svc (Stage 27+) and billing-svc (Stage 42+).

### Q-19.3 — Idempotency middleware vs in-handler

- Date raised: 2026-05-08 (Stage 19 §2A)
- Asked of: self
- Source: arch §7.3 (Idempotency Flow); `api_idempotency_key` table at
  `0004_sessions_events.sql:164`
- Question: Build a reusable `_shared/idempotency.ts` middleware or implement
  in-handler per endpoint?
- Why ambiguous: First idempotency-bearing service in v1 — pattern not yet
  established.
- Blocking? no
- Code affected: `supabase/functions/_shared/idempotency.ts` (NEW),
  `supabase/functions/assessment-svc/index.ts`
- Status: resolved
- Resolution (2026-05-08): `_shared/idempotency.ts` middleware
  `withIdempotency(client, req, tenantId, endpoint, handler) → Response` per
  arch §7.3. Reusable for assignments-svc (Stage 27+), billing-svc (Stage 42+),
  orchestration-svc.

### Q-19.2 — Sync pipeline trigger in `/submit` (Stage 19 vs Stage 20 split)

- Date raised: 2026-05-08 (Stage 19 §2A)
- Asked of: self
- Source: DEV_PLAN.md Stage 19 deliverables ("/submit writes outbox_event +
  invokes sync pipeline inline"); spec §21.0.2 ("No synchronous inter-service
  HTTP calls"); arch §4.5 (`/intelligence/process-session/{id}` service-role
  inline from submit); Stage 20 owns intelligence-svc
- Question: Stage 19 invokes intelligence-svc inline (with stub), behind feature
  flag, best-effort, or outbox-only?
- Why ambiguous: intelligence-svc doesn't exist until Stage 20; spec §21.0.2 vs
  arch §4.5 wording reads contradictory at first glance.
- Blocking? yes (changes /submit's response shape and the e2e assertion)
- Code affected: `supabase/functions/assessment-svc/handlers.ts` submitSession,
  e2e spec
- Status: resolved
- Resolution (2026-05-08): Outbox-only for Stage 19; no intelligence-svc stub.
  `/submit` writes `outbox_event` with `aggregate_type='session_record'`,
  `event_type='session.submitted'`, returns `pipeline_status='pending'`. e2e
  asserts the outbox row exists with `processed_at IS NULL`. Stage 20 wires the
  inline sync HTTP call and flips `pipeline_status` to `'sync_complete'`.

### Q-19.1 — Persisting `engine_state_snapshot` on `/respond` atomically

- Date raised: 2026-05-08 (Stage 19 §2A)
- Asked of: self
- Source: `create_session_response_atomic` at `0004_sessions_events.sql:287`
  does not write `engine_state_snapshot`; replay determinism (DEV_PLAN Stage 26)
  requires engine-state ↔ session-response atomicity
- Question: Add a second non-atomic UPDATE, widen the RPC signature, or add a
  separate version-checked update RPC?
- Why ambiguous: RPC predates engines (Stage 4); atomicity vs migration churn
  tradeoff.
- Blocking? yes (replay determinism gate at Stage 26 depends on this)
- Code affected: `supabase/migrations/0012_assessment_svc_rpc_widen.sql` (NEW),
  `supabase/functions/assessment-svc/handlers.ts` respondToSession
- Status: resolved
- Resolution (2026-05-08): Migration 0012 widens the RPC signature to take
  `p_engine_state jsonb` as the 11th parameter; UPDATE clause writes
  `engine_state_snapshot = p_engine_state` in the same transaction as the
  version bump. Down migration restores the Stage 4 10-arg signature. pgTAP
  roundtrip extends to 12/12.

### Q-0001 — shadcn/ui integration approach for packages/ui

- Date raised: 2026-05-03 (Stage 13)
- Asked of: product owner
- Source: CLAUDE.md tech stack "Tailwind + shadcn/ui" vs BUILD_CONTRACT §9 (no shadcn reference)
- Question: Should Stage 13 primitives be built via (A) shadcn CLI vendoring, (B) Radix UI deps
  directly, or (C) pure Tailwind + React?
- Why ambiguous: shadcn is a codegen CLI, not a runtime dep. Our token system diverges heavily from
  shadcn defaults. Arch and BUILD_CONTRACT don't mention shadcn directly.
- Blocking? yes
- Assumed answer if proceeding: Option B (Radix directly)
- Code affected: all of packages/ui/src/
- Status: resolved
- Resolution: Option B approved by product owner 2026-05-03. Radix is the headless a11y layer
  shadcn wraps. Custom token system gains nothing from shadcn defaults. Lower dep graph, no CLI
  registry, identical a11y. ADR-0020 filed. CLAUDE.md tech stack updated to "Tailwind + Radix UI
  primitives". Commit: Stage 13 commit.
