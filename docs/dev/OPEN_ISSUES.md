# OPEN_ISSUES.md — living list

> Pruned on audit days (every 5 stages). Resolved → ## Resolved with date.
> Use the severity rubric in CLAUDE.md.

## Open

### ISSUE-0033 — GET /billing/invoices uses LIMIT 50 + truncated flag; cursor pagination deferred

- Status: open
- Severity: low
- Reported: 2026-06-02 (Stage 43 prep, Q-43.2 resolution)
- Area: backend (billing-svc)
- Tags: billing-svc · pagination · v1.1 · invoices

**Summary.** `GET /billing/invoices` returns up to 50 invoice rows ordered by `invoiced_at DESC` with a `truncated: boolean` flag in the response envelope when the result count equals 50. No cursor or offset pagination is implemented in v1. For typical v1 tenant invoice volume (12–24 invoices/year for monthly/yearly billing), 50 rows covers 2–4 years of history — adequate for launch. Q-43.2 Option A resolution per ISSUE-0022 (audit-log) precedent.

**Fix (v1.1).** Cursor-based pagination via `invoiced_at` watermark: `?before=<ISO8601 timestamp>` query param; response includes `next_cursor: string | null`. Removes LIMIT 50 ceiling. Consistent with ISSUE-0022 audit-log cursor proposal.

**Tracking pointer.** Q-43.2 Option A selection. Inline comment at query site in `supabase/functions/billing-svc/handlers.ts`: `// ISSUE-0033: v1 LIMIT 50 + truncated flag; cursor pagination deferred to v1.1.`

---

### ISSUE-0032 — Stripe webhook secret rotation: no dual-secret acceptance window

- Status: open
- Severity: low
- Reported: 2026-06-01 (Stage 42 prep, Q-42.1 / ADR-0034)
- Area: backend (billing-svc)
- Tags: billing-svc · stripe · security · v1.1

**Summary.** billing-svc loads a single `STRIPE_WEBHOOK_SECRET` at startup. Rotating
this secret (e.g., for a security incident or routine rotation) requires redeploying
billing-svc with the new secret. During the redeployment window, in-flight webhook
events signed with the old secret will fail signature verification and return 400,
causing Stripe to retry — which may succeed on the new secret after redeployment
completes. However, the retry delay (typically minutes) means the window between
old-secret billing_events succeeding and new-secret events succeeding creates a
brief gap where webhooks may 400.

Stripe best practice for zero-downtime rotation: accept both old and new secrets
during the rotation window (`stripe.webhooks.constructEvent` called twice with
different secrets; first success wins).

**Fix (v1.1).** Accept array of webhook secrets during rotation:
```ts
// v1.1: try each secret in order; first success wins
for (const secret of [STRIPE_WEBHOOK_SECRET_NEW, STRIPE_WEBHOOK_SECRET_OLD]) {
  try { event = stripe.webhooks.constructEvent(rawBody, sig, secret); break; }
  catch { continue; }
}
```
Inline comment at `STRIPE_WEBHOOK_SECRET` load site in billing-svc/handlers.ts:
`// ISSUE-0032: single-secret; v1.1 needs dual-secret rotation window`

**Risk in v1.** Low. Secret rotation is a manual admin operation. Stripe's retry
schedule (typically 5 attempts over 3 days) means delayed events will be replayed
successfully after redeployment. No data loss; only delayed processing during
rotation window.

**Linked:** ADR-0034 (Stripe integration patterns — Decision 1 consequences).

---

### ISSUE-0031 — Student dashboard: NBA "Next Best Action" hero card omitted v1

- Status: open
- Severity: low
- Reported: 2026-05-11 (Stage 40 T5 checkpoint)
- Area: frontend (apps/web)
- Tags: student-dashboard · v1.1 · screen-7 · nba

**Summary.** SCREEN_SPECS §7 (Student Dashboard v2) includes a "Next Best Action" hero card at the top of the dashboard — a prominently styled card showing the single highest-priority recommendation for the student (e.g., "Continue Fractions Practice", "Complete overdue diagnostic"). No `GET /orchestration/nba/{student_id}` endpoint or equivalent exists in v1 backend. Stage 40 ships the dashboard without the NBA card; the hero slot is vacant (no placeholder rendered).

**Recommended fix (v1.1).**
- Option A: Derive from existing data — compose NBA from `LearningPlanDTO.sessions` (first pending item) or `useLearningPlan` highest-priority item. No new endpoint; purely frontend computation.
- Option B: New endpoint `GET /orchestration/nba/{student_id}` — orchestration-svc returns `{ label, mode, target_skill_names, rationale }` as a dedicated NBA DTO. Cleaner separation; adds backend work.

**Tracking pointer.** Stage 40 T5 operator decision. `apps/web/src/app/(student)/dashboard/page.tsx` — hero slot absent. ISSUE-0031.

---

### ISSUE-0030 — Pathway → strand mapping absent: teacher student detail ships NAPLAN tab only

- Status: open
- Severity: medium
- Reported: 2026-05-28 (Stage 38 prep — Q-38.UI-2)
- Area: frontend (apps/web) + backend (intelligence-svc)
- Tags: teacher-student-detail · intelligence-svc · v1.1 · screen-20 · pathway-tabs

**Summary.** SCREEN_SPECS §20 block 2 specifies pathway tabs (NAPLAN / ICAS / Selective) on the student detail page, with each tab filtering the strand performance bars. `LearningDNADTO.domain_profiles` keys are strand names (e.g., "Numeracy", "Reading") — not pathway slugs. There is no per-pathway strand breakdown in v1: the same strands appear under both NAPLAN and ICAS assessments, and the DTO has no `pathway_id` dimension on domain data. Stage 38 ships the NAPLAN tab only (visible + active); ICAS and Selective tabs are hidden (not rendered). A `// ISSUE-0030` comment marks the tab site.

**Fix (v1.1).** Two options:
1. **Extend `LearningDNADTO`:** add `pathway_domain_profiles: Record<pathwaySlug, Record<strandName, DomainProfile>>` — requires intelligence-svc to split mastery rows by pathway when building the DTO.
2. **New endpoint:** `GET /intelligence/learner-profile/{student_id}/{pathway_slug}` — returns domain_profiles filtered to the specific pathway's strand coverage.

Either option unblocks ICAS and Selective tabs in Screen 20.

**Tracking pointer.** Q-38.UI-2 resolution. Stage 38 implementation marks tab site with `{/* ISSUE-0030: ICAS + Selective tabs deferred — no pathway→strand mapping in LearningDNADTO v1 */}`.

---

### ISSUE-0028 — Screen 18 student performance table: trend sparkline column omitted in v1

- Status: open
- Severity: low
- Reported: 2026-05-27 (Stage 37 prep — Q-37.3)
- Area: frontend (apps/web) + ui (@mm/ui)
- Tags: teacher-dashboard · @mm/ui · v1.1 · sparkline · screen-18

**Summary.** SCREEN_SPECS Screen 18 Block 4 ("student performance table") specifies a "trend sparkline" column showing recent score trajectory per student. No sparkline primitive exists in `@mm/ui` (71 tests green at Stage 37 start). Adding a charting dependency (Recharts) or a hand-rolled inline SVG for a single dashboard column exceeds Stage 37 budget. Stage 37 ships the column with a static last-score value instead of a sparkline.

**Recommended fix (v1.1).** Add a `Sparkline` primitive to `@mm/ui`: accepts `data: number[]` (last N scores, e.g. last 5 session scores), renders a minimal inline SVG polyline (no axes, no labels). Wire into the student performance table as the trend column. Alternatively, leverage Recharts `LineChart` with `width/height` capped to column width.

**Tracking pointer.** Stage 37 prep Q-37.3. Static value placeholder in student performance table trend column in `apps/web/src/app/(teacher)/teacher/page.tsx`.

---

### ISSUE-0027 — Block 5 Topic Mastery Bars (Screen 18) deferred: class-strand-mastery aggregation endpoint absent

- Status: open
- Severity: medium
- Reported: 2026-05-27 (Stage 37 prep — Q-37.6)
- Area: frontend (apps/web) + backend (analytics-svc)
- Tags: teacher-dashboard · analytics-svc · v1.1 · screen-18 · topic-mastery

**Summary.** SCREEN_SPECS Screen 18 Block 5 ("Topic mastery bars — class-wide per strand") requires a class-level aggregation of mastery by skill strand. No existing endpoint provides this: `GET /analytics/auto-groups?class_id=&skill_id=` returns k-means clustering groups keyed on a specific skill, not per-strand mastery averages. A dedicated endpoint is needed, returning `{ strand_slug: string; avg_mastery: number; student_count: number; computed_at: string }[]` aggregated from `skill_mastery` joined via `skill_node.parent_id` grouped by strand. Stage 37 ships a placeholder card ("Topic mastery breakdown — available in a future release") in the Block 5 slot with a `{/* TODO: ISSUE-0027 */}` comment.

**Recommended fix (v1.1).**
- Add `GET /analytics/class-mastery/{class_id}` endpoint to analytics-svc (teacher/admin role-gated, before service-role gate).
- Aggregation query: `class_student JOIN skill_mastery USING(student_id) JOIN skill_node ON skill_mastery.skill_id = skill_node.id` → `GROUP BY skill_node.parent_id` → `AVG(mastery_level), COUNT(DISTINCT student_id)`. Resolve `parent_id` to strand name from `skill_node`.
- Wire Block 5 in teacher dashboard: `useClassMastery(classId)` SDK hook + `SkillBar` row per strand (pattern exists from parent dashboard SubjectAreasSection).
- Remove placeholder card and ISSUE-0027 comment.

**Tracking pointer.** Stage 37 prep Q-37.6. Placeholder in `apps/web/src/app/(teacher)/teacher/page.tsx` Block 5 slot. ISSUE-0021 updated (Block 5 = next auto-groups consumer too; v1.1).

---

### ISSUE-0025 — Notification spam guard: soft dedup window production-tuning deferred

- Status: open
- Severity: low
- Reported: 2026-05-24 (Stage 34 prep, Q-34.4 resolution)
- Area: backend (notifications-svc)
- Tags: notifications-svc · dedup · v1.1 · spam-guard

**Summary.** `createNotification` handler in notifications-svc deduplicates on `(user_id, type, payload->>'aggregate_id')` within a 1-hour window. This prevents duplicate notifications when, e.g., orchestration-svc triggers two rapid replans within the window. The 1h window is a v1 default; production usage may surface cases where the window is too aggressive (legitimate re-notifications suppressed) or too permissive (duplicates slip through due to different aggregate_id). `deduped: true` is emitted as a log field at the dedup check site so the hit-rate can be observed in production. T3 self-resolve: 1h default documented as default; Q-34.4 Option A resolution.

**Fix (v1.1).** Observe dedup hit-rate via `deduped: true` log field over first 30 days of production usage. Revise window and keying strategy (may want `(user_id, type, date_trunc('day', now()))` for daily-cron-triggered types such as `assignment_due_soon`). Consider a dedicated `notification_dedup` table with TTL-indexed rows if the JSONB path query proves slow at scale.

**Tracking pointer.** ISSUE-0025 inline comment at dedup check site in `supabase/functions/notifications-svc/handlers.ts`. DEV_PLAN Stage 34 C-C-D-V.

### ISSUE-0024 — Real-time assignment tracking: v1 uses polling cron (5-min latency)

- Status: open
- Severity: low
- Reported: 2026-05-23 (Stage 33 prep, Q-33.3 resolution)
- Area: backend (assignments-svc)
- Tags: assignments-svc · real-time · v1.1 · assignment-session

**Summary.** `assignment_session.status` transitions from `in_progress` to `completed` via `fn_sync_assignment_completion()` — a pg_cron polling function that runs every 5 minutes (migration 0015). Teacher tracking views (`GET /assignments/{id}/tracking`) may show stale `in_progress` status for up to 5 minutes after a student completes a session. Acceptable for v1 (teacher checking tracking is not latency-sensitive).

**Fix (v1.1).** Upgrade to outbox-driven: when intelligence-svc processes a session (pipeline `processed` state), write `outbox_event` with type `assignment_session_completed`; jobs-worker dispatches new `job_type = pipeline.assignment_session_completed` to `assignments-svc POST /assignments/pipeline/session-completed`; handler does immediate UPDATE on `assignment_session`. Requires ADR-0031 route table amendment + new pipeline endpoint in assignments-svc.

**Tracking pointer.** Q-33.3 Option B resolution. Migration 0015: `fn_sync_assignment_completion()`.

### ISSUE-0023 — Idempotency-Key enforcement on assignments-svc POST endpoints

- Status: open
- Severity: medium
- Reported: 2026-05-23 (Stage 33 prep, Q-33.7 resolution)
- Area: backend (assignments-svc)
- Tags: assignments-svc · idempotency · v1.1 · arch-drift

**Summary.** Arch §4.8 specifies Idempotency-Key on `POST /assignments` (teacher create) and `POST /assignments/{id}/start` (student start). v1 ships without server-side enforcement: the header is parsed and logged (with inline `// DEV-20260523-1 + ISSUE-0023` comment at parse site) but no dedup storage or replay detection is implemented. Duplicate-create risk is theoretical in v1 — no teacher concurrency UX exists; single-user assignment creation has no retry pressure. Q-33.7 Option C resolution.

**Fix (v1.1).** Choose between:

- Option A: Reuse shared `api_idempotency_key` table (owned by assessment-svc per arch §1.2) — requires verifying cross-service write permission and RLS shape.
- Option B: Add `idempotency_key` column to `assignment` and `assignment_session` tables with UNIQUE constraint; enforce dedup at INSERT time in a new migration.

**Recommended:** Option B (self-contained; no cross-service table ownership questions).

**Tracking pointer.** DEV-20260523-1. Parse-and-log site: `supabase/functions/assignments-svc/handlers.ts` (createAssignment + startAssignment).

### ISSUE-0022 — GET /intelligence/audit-log pagination: v1 returns LIMIT 200 + truncated flag

- Status: open
- Severity: low
- Reported: 2026-05-22 (Stage 32 pre-implementation, surfaced at morning ritual)
- Area: backend (intelligence-svc)
- Tags: intelligence-svc · pagination · v1.1 · audit-log

**Summary.** `GET /intelligence/audit-log/{student_id}?layer=&from=&to=` returns a maximum of 200 rows (ORDER BY created_at DESC) with a `truncated: boolean` flag in the response envelope when the result count equals 200. No cursor or offset pagination is implemented in v1. For students with dense audit histories (heavy usage across many algorithm versions), 200 rows covers the most recent ~2–4 weeks of intelligence activity which is sufficient for v1 dashboard use cases.

**Fix (v1.1).** Cursor-based pagination via `created_at` watermark: `?before=<ISO8601 timestamp>` query param; response includes `next_cursor: string | null`. Removes LIMIT 200 ceiling.

**Tracking pointer.** Stage 32 implementation. Inline comment at query site: `// ISSUE-0022: v1 LIMIT 200 + truncated flag; cursor pagination deferred to v1.1.`

### ISSUE-0021 — GET /analytics/auto-groups route shape mismatch with arch §4.7

- Status: open
- Severity: medium
- Reported: 2026-05-22 (Stage 32 morning ritual pre-read; deviation surfaced from Stage 30)
- Area: backend (analytics-svc)
- Tags: analytics-svc · routing · arch-drift · v1.1

**Summary.** Stage 30 shipped `GET /analytics/auto-groups?class_id=&skill_id=` (query params). Arch §4.7 (line 1567) specifies `GET /analytics/auto-groups/{class_id}/{skill_id}` (path params). No consumer existed at Stage 30 time, so the deviation had zero runtime impact. First real consumer is Stage 37 (Teacher Dashboard). Perpetuating the query-param shape to Stage 37 would require coordinating a later breaking change against an established consumer.

**Fix (v1.1 / Stage 37 coordinator).** Migrate analytics-svc route to `/analytics/auto-groups/{class_id}/{skill_id}` path params in the same commit that implements the Stage 37 Teacher Dashboard consumer. Zero-downtime: no external consumers until that stage.

**Tracking pointer.** DEV-20260522-1. All new Stage 32 endpoints implement arch path-param shape — deviation not perpetuated.

**Stage 37 update (2026-05-27).** Stage 37 confirmed: teacher dashboard does NOT consume `GET /analytics/auto-groups`. Block 5 (Topic Mastery Bars, Screen 18) is deferred to v1.1 per Q-37.6 + ISSUE-0027 — the auto-groups endpoint supplies k-means clustering groups, not strand mastery averages; Block 5 requires a separate `GET /analytics/class-mastery/{class_id}` endpoint. With Block 5 deferred there is no Stage 37 auto-groups consumer. ISSUE-0021 carries forward unchanged; next consumer = v1.1 Block 5 implementation (ISSUE-0027).

### ISSUE-0020 — POST /orchestration/generate-plan synchronous in v1; async upgrade deferred

- Status: open
- Severity: low
- Reported: 2026-05-21 (Stage 31 prep, Q-31.4 resolution)
- Area: backend (orchestration-svc)
- Tags: orchestration-svc · async · v1.1 · generate-plan

**Summary.** `POST /orchestration/generate-plan/{student_id}` calls `processOrchestratorReplan` synchronously in v1 and returns a `LearningPlanDTO` (200). Arch §4.6 describes this endpoint as "trigger regeneration" (ambiguous). The async shape — enqueue `pipeline.orchestration_replan` into job_queue via outbox and return 202 — is architecturally cleaner for a heavy computation but deferred until p95 plan-generation timing is measured in a deployed environment.

**Trigger for upgrade.** If `POST /orchestration/generate-plan` p95 > 2 s (dashboard load budget per BUILD_CONTRACT §10), upgrade to async: `outbox_event` INSERT → outbox-dispatcher enqueue → job_queue → worker → orchestration-svc batch handler → 202 with `job_id`. Idempotency-Key at the HTTP layer remains the dedup mechanism (arch §4.6).

**Tracking pointer.** Stage 31 close commit. Q-31.4 resolved to Option A (sync).

### ISSUE-0019 — Tooling guard: amend-over-pushed-commit pattern (no automated guard)

- Status: open
- Severity: low
- Reported: 2026-05-20 (Stage 30 close)
- Area: tooling / process
- Tags: git · pre-push · near-miss · evening-ritual

**Summary.** During Stage 30 implementation, the implementation commit was accidentally created with `git commit --amend`, rewriting the already-pushed prep commit (9f7b22d) rather than creating a new commit on top of it. `git push` would have been rejected (diverged history) or required force-push to main. Caught by checking `git status -b` before push; recovered via `git reset --soft origin/main` (working tree preserved, 13 files re-committed as 8a8ee8a). Recovery was clean but the guard is vigilance-only — there is no hook or automated check that warns when `--amend` would rewrite a commit already present on origin/main.

**Proposed fix.** Add a `pre-push` or `commit-msg` hook that checks whether the current HEAD's parent matches origin/main's HEAD — if an amend rewrites a published commit, abort with: "ERROR: --amend would rewrite a commit already on origin/main. Use a new commit instead." Alternatively, a standing pre-commit check `git merge-base --is-ancestor HEAD origin/main` can detect the diverge before it happens.

**Impact.** No code loss, no force-push occurred. Process gap only.

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

### ISSUE-0017 — High-fatigue intervention alert deferred (per-session data not directly queryable)

- Status: open
- Severity: low
- Reported: 2026-05-20 (Stage 30)
- Area: backend (analytics-svc, intelligence-svc)
- Tags: teacher-intelligence · intervention-alert · v1.1

**Summary.** Spec §14.2 defines a "High fatigue" intervention alert trigger: "Avg fatigue onset < 15 min over last 5 sessions." `behaviour_profile.avg_fatigue_onset_minutes` is a rolling average over all sessions; it does not expose the per-session window needed to evaluate the last-5-session condition. Loading per-session fatigue onset requires joining `learning_event` or `behaviour_signal` events (event_type added migration 0013), neither of which is a direct column read on `behaviour_profile`. Stage 30 implements 5 of 6 §14.2 trigger types; `high_fatigue` is omitted with an inline `// ISSUE-0017:` comment at the trigger-evaluation site in `analytics-svc/handlers.ts`.

**Recommended fix (v1.1).** (1) Extend `behaviour_profile` with a `fatigue_onset_last_5_sessions real[] DEFAULT '{}'` column populated by the L2 behaviour intelligence handler on each session close. (2) Implement the `high_fatigue` alert trigger in `processTeacherRefresh`: `AVG(fatigue_onset_last_5_sessions) < 15` minutes. Linked: Spec §14.2, `behaviour_profile` schema (migration 0005), ADR-0032 Stage 30 amendment, ISSUE-0016.

### ISSUE-0016 — async_pipeline_event and analytics_audit_log tables for full observability parity (post ADR-0032)

- Status: open
- Severity: low
- Reported: 2026-05-19 (Stage 29)
- Updated: 2026-05-20 (Stage 30) — audit_log gap added; scope extended.
- Area: backend (intelligence-svc, analytics-svc, migration)
- Tags: observability · pipeline · v1.1

**Summary.** Two separate `NOT NULL` FK constraints block observability writes from non-session-scoped and non-student-scoped pipeline stages:

1. **`pipeline_event.session_id NOT NULL`** (migration 0006) — blocks L5/L7/L9 pipeline steps, which operate at student+pathway or class+skill scope (no session). ADR-0032 (Stage 29) resolves this by skipping `pipeline_event` for L5 and using `intelligence_audit_log` instead. Steps 5 and 7 are absent from `pipeline_event` coverage.

2. **`intelligence_audit_log.student_id NOT NULL`** (migration 0005) — blocks L7 class-scoped writes. ADR-0032 Stage 30 amendment resolves this by skipping `intelligence_audit_log` for L7 too. Observability for L7 is provided entirely by `intervention_alert` inserts + `cohort_metric_cache` UPSERT (domain artifacts as observability surface). Any future pipeline stage that is neither session-scoped nor student-scoped faces the same gap.

**Recommended fix (v1.1).** Introduce two tables:
- `async_pipeline_event (id uuid PK, scope_type text, scope_id uuid, step int, step_name text, status text, started_at timestamptz, completed_at timestamptz, error text, created_at timestamptz)` — covers L5/L7/L9 and any future non-session step; `scope_type` = `'student_pathway'` | `'class_skill'`; `scope_id` = student_id or class_id as applicable.
- `analytics_audit_log (id uuid PK, scope_type text, scope_id uuid, event_type text, input_snapshot jsonb, output jsonb, algorithm_version text, trace_id uuid, created_at timestamptz)` — class-scoped audit log for analytics pipeline stages without `student_id` constraint.

L5 writes `async_pipeline_event` (scope_type='student_pathway'); L7/L9 write both. L1/L2/L3a/L3b continue writing `pipeline_event`. Linked: ADR-0032, ADR-0033, Q-29.4, Q-30.2, ISSUE-0017.

## Resolved

### ISSUE-0029 — Stage close typecheck gate may return stale turbo-cached green when node_modules drift

- Status: resolved — 2026-05-31 (Stage 41)
- Severity: medium
- Reported: 2026-05-27 (Stage 37 prep — DEV-20260527-1)
- Area: tooling / process
- Resolution: `CLAUDE.md §Evening ritual` step 9 + `§Close-ritual cache-bust` section canonised. `pnpm install && pnpm turbo typecheck --force` mandatory at every stage close. Resolves DEV-20260527-1.

### ISSUE-0026 — useLearningPlan SDK hook path malformed: double-svc segment + missing {student_id}

- Status: resolved — 2026-05-11 (Stage 40 D1)
- Severity: low
- Reported: 2026-05-26 (Stage 36 pre-read R7)
- Area: frontend (packages/sdk)
- Resolution: Path corrected to `/orchestration-svc/orchestration/plan/${encodeURIComponent(studentId)}/current`. Regression-guarded by `useLearningPlan — ISSUE-0026 path fix` test in `packages/sdk/src/__tests__/stage40.test.ts`. Commit: 0af5afb. Moved to Resolved at Stage 41 audit triage (2026-05-31).

### ISSUE-0018 — Env var documentation gap: 5 service URL env vars undocumented

- Status: resolved — 2026-05-31 (Stage 41)
- Severity: low
- Reported: 2026-05-20 (Stage 30 pre-push verification)
- Area: infra / docs
- Resolution: `docs/dev/deployment.md` created with all 5 service URL vars + fallback resolution logic + migration 0017 deploy-order note. Closes ISSUE-0018.

### ISSUE-0013 — Evening ritual test count methodology (tail truncation drift)

- Status: resolved — 2026-05-31 (Stage 41 audit triage)
- Severity: low
- Reported: 2026-05-18 (Stage 28 close)
- Area: tooling / process
- Resolution: Full `pnpm -r run test` output captured at every stage close since Stage 28. Per-package line counts included in DAILY_LOG.md Stage 28+ entries. Methodology drift was Stage 22a–27 only; no functional impact. Fix applied in practice from Stage 28 onward.

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
