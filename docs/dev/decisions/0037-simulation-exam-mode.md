# ADR-0037 — Simulation Exam Mode Model (v1.1-S3)

- Status: accepted
- Date: 2026-05-15 (proposed) · 2026-05-15 (accepted at v1.1-S3 impl close)
- Stage: v1.1-S3
- Tags: backend | dx

## Context

v1.1 Stage 3 delivers "Simulation Exam Mode" — a backend facility that administers a
practice-exam session under realistic test-taking constraints: hard timer, no back
navigation, no mid-exam feedback, deterministically scored. Stage 2 (ADR-0036) built the
assembly layer (`composer_params` to compose an exam from the bank by difficulty mix);
S3 builds the administration layer (`simulation_params` to lock the exam down once it
starts). The two are orthogonal and co-applicable: a composed simulation exam is a
session that has both markers set.

**§N trap (CRITICAL — caught at morning ritual 2026-05-15, parallel to S2's):** The
phase plan `docs/dev/v1.1-phase-plan.md §S3` calls this "Simulation Exam Mode" and
informally claims "new session mode". But spec §18 Session Modes table (lines
2619–2628) defines `mode='exam'` with Use Case verbatim **"Full practice exam
simulation"** — the spec already uses the word "simulation" as the description of
`mode='exam'`. Spec row `mode='challenge'` has Use Case "Timed competition,
gamification" (leaderboard-driven), a different product feature. Therefore: the
spec-correct home for simulation-exam administration is `mode='exam'`, NOT
`'challenge'` and NOT a new enum value. Resolved Q-1.1-3.1 (operator-confirmed
2026-05-15).

The existing schema (migrations 0001–0021) requires no new tables or enum values for
Stage 3. Projected migrations: **0**.

## Options considered

### Decision 1 — Session mode (§N TRAP)

1. **`mode='exam'`** per spec §18 'Exam' row Use Case verbatim. Existing enum value
   (already used by v1.1-S2 composer); zero migration; spec-correct. Differentiator from
   S2 composer = optional `simulation_params` on request (administration layer) vs
   composer_params (assembly layer); they are orthogonal and co-applicable.
2. **`mode='challenge'`** per phase plan §S3 informal claim. Spec §18 'Challenge' row
   Use Case = "Timed competition, gamification" (leaderboard) — different product
   feature. Spec-incorrect.
3. **New enum value `'simulation'`.** Migration 0022 + new feature_key. Breaks
   Q-1.1-2.1/2.2 zero-migration commitment for arguably no spec benefit.

### Decision 2 — Minimum flag set on `simulation_params`

A. `{ no_back_nav, hide_feedback_until_submit }` — two flags, both default-true when
   `simulation_params` is present. Minimum viable enforcement layer.
B. Add `strict_timing: boolean`. Redundant: spec §18 'Exam' row Timed column already
   reads "Yes (server-authoritative)"; mode='exam' is already timed strictly.
C. Add `proctored: boolean`, `section_boundaries: number[]`, `max_pause_count`, etc.
   Speculative — no UI consumer (S5) yet exists.

### Decision 3 — Per-section structure on LinearEngineState

A. **No sections in v1.1-S3.** SANCTIONED DEFERRAL. Session-wide strict timer only.
   AdaptiveStageState (`contracts.ts` lines 295-306) is prior art for per-stage
   `time_limit_ms`; would follow Q-1.1-2.5 round-trip-safety pattern (extend
   LinearEngineStateSchema with optional `sections` field).
B. Sections introduced in S3 — net-new `SectionStateSchema` + per-section timer logic
   in `LinearEngine.getTimeRemaining`. Significant code + tests; no UI consumer yet.
C. Sections-by-convention — `simulation_params.section_boundaries: number[]` without
   state-level sections. Middle path; UI/frontend renders the split.

### Decision 4 — Engine config consultation for strict-mode

I. **State-flag consultation inside `LinearEngine.canNavigateBack`.** Engine reads its
   own `state.simulation_params?.no_back_nav === true`. One method, one branch
   addition. No `AssessmentEngine` interface change.
II. Framework-level config (`FrameworkConfig.simulation_strict: boolean`). Pathway-
    pinned; less per-session flexibility.
III. New method parameter on the `AssessmentEngine` interface (`canNavigateBack(state,
     runtimeFlags?)`). Interface-change ripples to Adaptive/Skill/Diagnostic engines.

### Decision 5 — Scoring determinism beyond ADR-0022

α. **Verify item-version pinning at impl T1 pre-read.** Currently `EngineItem.version`
   is captured at session-create; verify the score path consults that captured version
   rather than re-fetching live from `v_item_current`. If verified, ADR-0037 documents
   the verified pin (Option γ holds — no new code). If NOT verified, STOP, file
   Q-1.1-3.6 (T3 schema — explicit version-pin requirement), surface for architect
   round-trip.
β. New idempotent re-scoring endpoint (`POST /sessions/{id}/recompute`).
γ. Phase-plan flourish — no new determinism guarantee beyond ADR-0022; "scoring against
   rubric" describes the existing `FrameworkConfig.scoring_rules` identity/percentage +
   bands path.

### Decision 6 — composer_params + simulation_params relationship

x. **Orthogonal and co-applicable.** `composer_params` (ADR-0036) drives assembly;
   `simulation_params` (ADR-0037) drives administration. A session can have neither
   (free practice against the default bank), one (composed practice or simulation of
   the default bank), or both (composed simulation — student builds the shape, then
   takes it under exam conditions). Both stored on `LinearEngineState` as optional
   analytics markers via the Q-1.1-2.5 round-trip-safety pattern.
y. Mutually exclusive. Forced "either compose or simulate, not both" — speculative
   restriction with no spec backing.

### Decision 7 — Auth model

a. **Student self-serve via existing pathway feature-flag gate.** S2 parity. The
   `mode.exam` feature key (spec §22.7 line 2807) is available to all tiers (Free
   through Institutional).
b. Teacher/proctor-assigned only — routes through `assignment` table; new auth check
   ties S3 to S4 (teacher authoring UI) tighter than phase plan suggests.
c. Both via `simulation_params.proctored: boolean`. Speculative dual-path.

## Decision

1. **`mode='exam'`** per spec §18 verbatim — §N trap escape. No new enum, no migration.
2. **Minimum flag set: `{ no_back_nav, hide_feedback_until_submit }`.** Both
   default-true when `simulation_params` is present. `strict_timing` DROPPED (redundant
   against mode='exam' server-authoritative timing per spec §18 'Exam' row).
3. **No sections in v1.1-S3 (SANCTIONED DEFERRAL).** Future extension would add an
   optional `sections` field to `LinearEngineStateSchema` following the Q-1.1-2.5
   round-trip-safety pattern (Zod default `.object()` strip means the field must be
   declared, not relied on as arbitrary jsonb). AdaptiveStageState is the prior art for
   per-stage `time_limit_ms`. The deferral is gated on a UI consumer existing (≥ S5);
   it is **not forgotten**, it is parked behind a real-world demand signal.
4. **State-flag consultation pattern** for strict-mode enforcement: `LinearEngine.
   canNavigateBack` reads `state.simulation_params?.no_back_nav === true` and returns
   false; else preserves existing `current_index > 0` behaviour. NO `AssessmentEngine`
   interface change. NO changes to other engine implementations.
5. **Scoring determinism: Option γ DEFAULT + Option α verification at impl T1
   pre-read.** Verify `EngineItem.version` captured at session-create is consulted by
   the score path (not re-fetched live from `v_item_current`). If verified, this ADR's
   §Implementation Notes records the verified pin and Option γ holds — no new
   determinism code in S3. If NOT verified, STOP at impl T1, file Q-1.1-3.6 (T3 schema
   — explicit version-pin requirement), surface for architect round-trip. The Option α
   verification gate is built into the impl prompt; this ADR cannot finalise §Decision
   5 until that verification completes.
6. **`composer_params` + `simulation_params` orthogonal and co-applicable.** A session
   with both is a composed simulation exam.
7. **Student self-serve auth** via existing pathway feature-flag gate. S2 parity. No
   new auth layer. Teacher-administered simulation sessions remain possible later via
   assignment-table routing (S4 teacher authoring UI); v1.1-S3 backend default is
   self-serve.

### `hide_feedback_until_submit` semantics — verification gate at impl

The flag is intended to suppress per-item feedback during a strict simulation exam.
At impl T1 pre-read, verify whether any current backend path exposes per-item feedback
to the client during a session (e.g., `respondToSession` response body, `next_item`
hints, explanations). If YES, the flag gates that path server-side: simulation sessions
suppress the feedback fields. If NO (the current `mode='exam'` already hides per-item
feedback — see `respondToSession` line 500 verbatim: `explanation: null, // exam mode
hides explanations; practice/repair will populate (v1.1)`), the flag is
documentary/UI-only for v1.1-S3 and this ADR's §Implementation Notes records that
finding. ADR-0037 §Decision 2 stands either way; only the enforcement site changes.

## Rationale

**§N trap (Decision 1).** Spec §18 Session Modes table is unambiguous. The 'Exam' row
Use Case literally reads "Full practice exam simulation." The phase plan's "new session
mode" wording is informal; the spec's enum coverage is canonical. Using `mode='exam'`
keeps S3 inside the same enum slot S2 already uses; differentiation lives in optional
session-level parameters (`simulation_params`), not in a new mode. This mirrors S2's
escape from the equivalent "practice" trap.

**Flag minimisation (Decision 2).** `strict_timing` was dropped because spec §18 'Exam'
row Timed column = "Yes (server-authoritative)" — strictness is built into mode='exam'
already. Adding a flag that asserts the default is redundant. `proctored`,
`section_boundaries`, `max_pause_count` etc. are speculative without a UI consumer; the
two retained flags are the smallest set that captures real S3 behaviour.

**Section deferral (Decision 3).** Phase plan §S3 names "section timing" as one of
three S3 capabilities. But UI consumption is S5+; building per-section state in S3
without a consumer is premature scope per CLAUDE.md "no hypothetical future
requirements." AdaptiveStageState is the prior art that proves the extension path is
cheap when demand materialises. The deferral is sanctioned (operator-confirmed
Q-1.1-3.2 Option A), documented here, and parked behind a real demand signal.

**State-flag consultation (Decision 4).** LinearEngine is a pure-function namespace
(ADR-0022). State carries everything the engine needs to decide. Adding a runtime-flags
parameter to the `AssessmentEngine` interface (Option III) would force ripple changes
to Adaptive/Skill/Diagnostic for no gain. Reading `state.simulation_params` keeps the
decision local to LinearEngine where it belongs.

**Determinism verification gate (Decision 5).** ADR-0022 already guarantees replay
determinism by construction. The one remaining risk is item content drift: if score
recomputation re-fetches an item from `v_item_current` rather than using the version
pinned at session-create, an item edit between session-create and score-time could
change the score. EngineItem already carries `version` (contracts.ts line 86); the
question is whether the score path uses it. The verification gate at impl T1 catches
this risk before it ships.

**Orthogonality (Decision 6).** Composition (S2) and administration (S3) are two
different concerns. Forcing mutual exclusion would prevent the natural "composed
simulation" use case where a student assembles their own exam shape and then takes it
under strict conditions. No spec text mandates exclusion.

**Student self-serve (Decision 7).** Feature key `mode.exam` is available to all tiers
per spec §22.7. S2 used student self-serve; S3 matches. Teacher-administered simulation
is a later product feature (S4), not a v1.1-S3 dependency.

## Bounds

S3 introduces no numeric bounds beyond what S2 already enforced (item_count,
time_limit_ms — when composer_params is co-applied). `simulation_params` is a flag
record without numeric fields in this ADR.

## Consequences

- Positive: zero migrations in Stage 3 (same as S2).
- Positive: `mode='exam'` reuse means no new feature_key, no new session_record
  branching, no new dispatcher routes. The existing endpoint surface absorbs S3.
- Positive: composer_params + simulation_params co-applicable — natural "composed
  simulation" use case emerges for free.
- Positive: only one LinearEngine method body changes (`canNavigateBack`); zero
  changes to AssessmentEngine interface; zero changes to other engines.
- Negative: section timing deferred. If a deployed simulation exam needs to enforce
  per-section timing before S5 ships, that becomes a future stage's scope expansion.
- Negative: `simulation_params` stored on `engine_state_snapshot` is not indexed for
  analytics queries that filter on it at scale (same negative as ADR-0036 composer_params).
- Follow-up (Decision 3): when a UI consumer exists, file a follow-up ADR for the
  section-extension and add `sections?: SectionStateSchema[]` to LinearEngineStateSchema
  via the Q-1.1-2.5 round-trip-safety pattern.
- Follow-up (Decision 5): the impl T1 pre-read records the verification result here;
  if Option α surfaces a gap, Q-1.1-3.6 is filed and ADR-0037 §Decision 5 is updated
  before push.

## Implementation notes

Files (anticipated; impl T1 pre-read finalises):

- `packages/types/src/session.ts` — add `SimulationParamsSchema` (two boolean flags,
  defaults true) + extend `CreateSessionRequestSchema` additively with
  `simulation_params?`.
- `packages/engines/src/contracts.ts` — extend `LinearEngineStateSchema` with optional
  `simulation_params: SimulationParamsSchema.optional()` (Q-1.1-2.5 round-trip safety).
- `packages/engines/src/linear.ts` — `canNavigateBack` consults
  `state.simulation_params?.no_back_nav`. No other engine method changes.
- `supabase/functions/assessment-svc/handlers.ts` — `createSession` forwards
  `body.simulation_params` and folds it into `initialState` (composer-fold pattern
  prior art at lines 351-354).
- `packages/sdk/src/hooks/session.ts` — no change (CreateSessionRequest passthrough,
  S2 precedent).
- ADR-0037 — status proposed → accepted at impl close.

**Determinism verification result (impl T1, 2026-05-15) — Gate 1 PASS.** The
synchronous score path operates entirely on stored state; no database re-fetch of item
content at any point. Item-version pinning is achieved via a full content snapshot in
`state.planned_items` (`response_config`, `difficulty`, `skill_ids`, `version` all
frozen at session-create from the content-svc selectItems response). Citations:

- `supabase/functions/assessment-svc/handlers.ts:620` —
  `const stateParse = EngineStateSchema.safeParse(row.engine_state_snapshot)` — score-
  time state parsed from session_record, never re-fetched.
- `supabase/functions/assessment-svc/handlers.ts:626` —
  `terminateForConfig(state, 'user_submitted', fc.config, eff.ms)` — pure-function call.
- `supabase/functions/assessment-svc/handlers.ts:468-473` — at respondToSession time,
  `const item = planned.find(...); engineResp.is_correct = computeCorrectness(item, …)`
  — EngineItem retrieved from `state.planned_items`, not re-fetched.
- `supabase/functions/assessment-svc/handlers.ts:1042-1051` (`computeCorrectness`) —
  reads `item.response_config['correct_option_id']` from snapshotted EngineItem.
- `packages/engines/src/linear.ts:153-167` (`score`) — `state.responses.filter(r => r.
  is_correct).length` — counts from stored responses.
- `grep "v_item_current\|item_version" supabase/functions/assessment-svc/handlers.ts`
  → 0 hits.
- `grep "v_item_current" packages/engines/` → 0 hits.
- `intelligence-svc/handlers.ts:1009` DOES query `item_version`, but that's the ASYNC
  pipeline (intelligence layer), not the synchronous score path that produces
  `raw_score`/`scaled_score`/`score_band` on the session_record.

Option γ holds — no new determinism code in S3. Q-1.1-3.6 NOT filed (gate passed).

**`hide_feedback_until_submit` enforcement result (impl T1, 2026-05-15) — Gate 2
EXPOSURE EXISTS, gated server-side in S3.** Per-item feedback IS exposed via
`is_correct` in the `respondToSession` response (`supabase/functions/assessment-svc/
handlers.ts:535` pre-S3: `is_correct: engineResp.is_correct`). For `mode='exam'`
sessions with `simulation_params.hide_feedback_until_submit === true`, S3 gates this
exposure server-side at the same location: when the linear-state's simulation flag is
set, the response returns `is_correct: null` to the client. The real boolean is still
stored in `session_response` via the atomic RPC (line 484) and consulted at
submitSession score time — only the client-facing return is muted. The pre-existing
issue that `next_item.response_config` may carry `correct_option_id` (see
computeCorrectness at line 1042-1051) is a known v1 design constraint and out of S3
scope; addressing it would require a server-side projection step on every item delivery.

`explanation: null` (line 536) is already muted for `mode='exam'` per the existing
comment — no S3 change needed there.

Commit: this impl commit (see git log on v1.1/exam-content) · Related: Q-1.1-3.1..5,
ADR-0022 (replay-determinism), ADR-0023 (EngineState discriminated union), ADR-0036
(S2 composer; Q-1.1-2.5 round-trip-safety pattern), spec §18 lines 2619-2628, spec
§22.7 line 2807
