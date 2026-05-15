# ADR-0036 — Practice Exam Composition Model (v1.1-S2)

- Status: accepted
- Date: 2026-05-14 (proposed) · 2026-05-15 (accepted at v1.1-S2 impl close)
- Stage: v1.1-S2
- Tags: backend | data | dx

## Context

v1.1 Stage 2 delivers a "Practice Exam Composer" — a backend facility that assembles a
free-form, scored, timed, fixed-sequence exam session from the question bank by pathway +
difficulty mix + time limit. Stage 1 built the write-side CRUD for the item bank (ADR-0035).
Stage 2 extends the existing session engine to consume it.

**§N trap (critical — caught at T1 pre-read 2026-05-14):** The informal name "practice exam"
is dangerous. Spec §18 Session Modes table (lines 2619–2624) defines `session_mode='practice'`
as SkillEngine: targeted skill improvement, mastery delta, no score, immediate feedback. A
composed mock exam (scored, timed, fixed-sequence, section-locked) is categorically different.
Using `session_mode='practice'` would be spec-incorrect and would route the session to the
wrong engine. The canonical implementation uses `mode='exam'` + `engine_type='linear'`.

Eight decisions govern the composition model; all resolved in Q-1.1-2.1..4 with architect
sign-off.

The existing schema (migrations 0001–0021) requires no new tables or enum values for Stage 2.
Projected migrations: **0**.

## Options considered

### Decision 1 — Session mode and engine type

1. **`mode='exam'` + `engine_type='linear'`** — both values exist in migration 0001 enums;
   no migration; spec-correct.
2. **New `session_mode` value** (e.g. `'composed_exam'`) — new enum value, requires migration.
3. **`mode='practice'`** — contradicts spec §18 (SkillEngine, unscored). Rejected outright.

### Decision 2 — Composer params scope: ephemeral vs persisted config table

1. **Ephemeral on `CreateSessionRequest`** — optional fields validated at the API boundary;
   used to drive `selectItems` and `engine.initialise`; preserved in the session record for
   analytics. No new table.
2. **Persisted `exam_config` table** — reusable config record; FK on session; requires migration.

### Decision 3 — Analytics contract: how to identify composed sessions

1. **`mode='exam'` AND `composer_params` present in session record** — no extra column needed;
   analytics queries filter on mode + presence of composer metadata in `engine_state_snapshot`.
2. **New `is_composed` boolean column** — explicit; queryable; requires migration.

### Decision 4 — Seed source for deterministic item selection

1. **`session_id` UUID** — available at composer call time (session row already inserted);
   stable across retries; deterministic replay matches spec §18 determinism requirement.
2. **`Idempotency-Key` header value** — also stable, but requires threading the header value
   through to the selection layer.

### Decision 5 — Item selection algorithm within difficulty band

A. **Random uniform, deterministic seeded Fisher-Yates** — varied selection across sessions;
   seed ensures same session_id → same item list (replay safe); NO `Math.random`.
B. **Pure deterministic by difficulty + item_id sort** — same selection every time for same
   inputs; no variety; simpler.

### Decision 6 — `difficulty_distribution` validation model

1. **Integers summing to `item_count`** — explicit per-band item counts
   (e.g. `{ easy: 10, medium: 15, hard: 5 }` where `10+15+5 = 30 = item_count`).
   Validated: `sum(values) === item_count`.
2. **Ratios (floats summing to 1.0)** — proportional; requires rounding; more ambiguous.

### Decision 7 — Insufficient items in a difficulty band

1. **422 `INSUFFICIENT_ITEMS`** — explicit error; caller knows the bank is thin for this
   band; prevents silent under-specification.
2. **Best-effort** — fill from adjacent bands; may silently distort the exam composition.

### Decision 8 — Auth: student self-serve vs admin-initiated

A. **Student self-serve** — existing pathway feature-flag gate controls access; no new layer.
B. **Platform_admin initiates on student behalf** — requires new delegation flow.

## Decision

1. **`mode='exam'` + `engine_type='linear'`** — `session_mode='practice'` MUST NOT be used
   for composed exams (spec §18 §N trap — see Context above).
2. **Ephemeral `composer_params`** on `CreateSessionRequest`. No new table.
3. **Analytics contract**: a session is a student-composed practice exam when
   `mode='exam'` AND `engine_state_snapshot->'composer_params' IS NOT NULL`. The
   `composer_params` field is added as an **optional top-level field on
   `LinearEngineStateSchema`** (`packages/engines/src/contracts.ts`). This makes the
   round-trip safe: assessment-svc `respondToSession` parses `engine_state_snapshot`
   via `EngineStateSchema.safeParse` and writes the resulting state back via the
   atomic RPC; Zod's default `.object()` strips unknown keys, so without the schema
   extension the marker would be silently dropped on first response submission.
   Resolved Q-1.1-2.5 (impl T1 pre-read 2026-05-15). Zero migrations: extends the
   Zod schema only; the jsonb column already accepts the field.
4. **Seed source: `session_id`** (UUID). Available at selection call time; stable; replay-safe.
5. **Random uniform, deterministic seeded Fisher-Yates** (Decision A). No `Math.random`.
   Same `session_id` → same item list always.
6. **Integers summing to `item_count`** (Decision 1). `sum(difficulty_distribution.values()) === item_count`.
7. **422 `INSUFFICIENT_ITEMS`** (Decision 1). No best-effort partial fills.
8. **Student self-serve** (Decision A). Existing pathway feature-flag gate.

## Rationale

**§N trap (Decision 1):** spec §18 Session Modes table is unambiguous. `session_mode='practice'`
= SkillEngine (targeted, unscored, immediate-feedback). A composed mock exam is scored, timed,
and section-locked — the LinearEngine `mode='exam'` contract. Using the wrong mode would
silently route to the wrong engine; caught by T1 pre-read before any code was written.

**Ephemeral params (Decision 2):** Composer params are session-init inputs, not reusable
templates. The only benefit of a config table is reuse; v1.1 has no "reuse a saved exam config"
requirement. Zero-migration is the right call (consistent with ADR-0035 §Zero new migrations).

**Analytics contract (Decision 3):** `engine_state_snapshot` is the existing per-session engine
context store; persisting composer_params there avoids a new column and keeps engine context
co-located. The `is_composed` column (Option 2) is speculative schema for a feature not yet
deployed to users — rejected per CLAUDE.md "no hypothetical future requirements." The
schema-extension path (extending LinearEngineStateSchema rather than relying on jsonb's
key-permissiveness) was resolved at impl T1 pre-read after R4 confirmed Zod's strip behaviour
would otherwise drop the marker on the first respondToSession round-trip — see Q-1.1-2.5.

**seed = session_id (Decision 4):** The session row is inserted before `selectItems` is called
(assessment-svc createSession lines 267–280 → 291–293). `session_id` is the natural, stable
identifier already available at that point. Threading the Idempotency-Key header through to the
content layer adds coupling with no benefit.

**Seeded Fisher-Yates (Decision 5):** Replay determinism (ADR-0022) requires no `Math.random`
in engine/selection bodies. A seeded PRNG satisfies both replay safety and variety. Pure
deterministic sort (Option B) would serve the same item set every time for the same
pathway+band inputs — undesirable for a practice exam product.

**Integer distribution (Decision 6):** Ratios require rounding rules (floor? round? tie-break?).
Integers are unambiguous: the caller specifies exactly how many items per band. The Zod schema
validation `sum === item_count` catches any inconsistency at the API boundary.

**422 on thin band (Decision 7):** Best-effort silently distorts the exam composition the caller
specified. A thin bank is a content-operation concern (S7), not something to paper over in the
engine. 422 + `INSUFFICIENT_ITEMS` error code gives the caller (and S7 monitoring) a clear signal.

**Student self-serve (Decision 8):** Practice exam composition is a student-facing feature.
The existing pathway feature-flag gate already controls pathway availability per student/tenant.
A new auth delegation layer would be premature scope.

## Bounds

| Field                     | Min              | Max                     | Rationale                                  |
| ------------------------- | ---------------- | ----------------------- | ------------------------------------------ |
| `item_count`              | 5                | 80                      | 5 = minimum viable exam; 80 = ~3h at 2m/q |
| `time_limit_ms`           | 300 000 (5 min)  | 10 800 000 (3 hours)    | Aligns with real-exam maximums             |
| `difficulty_distribution` | 1 band, ≥1 item  | all bands; sum = item_count | See Decision 6                          |

Validation: all bounds enforced by Zod refinements on `ComposerParamsSchema`.

## Consequences

- Positive: Zero migrations in Stage 2.
- Positive: `mode='exam'` + `engine_type='linear'` reuse existing engine path — no new engine
  contract; S2 = a ContentSelectRequest extension + engine.initialise param pass-through.
- Positive: Analytics contract derivable from existing session columns — no schema change.
- Negative: `composer_params` stored in `engine_state_snapshot` is not indexed; analytics
  queries that filter on it will require a GIN index or materialized view at scale.
- Negative: Integer distribution model requires callers to enumerate bands explicitly; a
  "just give me 30 mixed items" convenience shorthand is not provided in Stage 2.
- Follow-ups: When teacher authoring ships, consider a saved `exam_template` record so teachers
  can publish reusable exam configs. That is not Stage 2 scope.

## Implementation notes

Files:
- `packages/types/src/session.ts` — add `PracticeExamComposerParamsSchema` + extend `CreateSessionRequestSchema`
- `packages/engines/src/contracts.ts` — extend `LinearEngineStateSchema` with optional `composer_params` field (Q-1.1-2.5 resolution)
- `supabase/functions/assessment-svc/handlers.ts` — extend `createSession` (composer_params → fetchContentSelect; marker carried into initialState)
- `supabase/functions/content-svc/handlers.ts` — extend `ContentSelectRequest` + `selectItems` (item_count, difficulty_distribution, seeded Fisher-Yates branch)
- `supabase/functions/_shared/seeded-shuffle.ts` — new deterministic seeded shuffle helper (no `Math.random`)
- `packages/sdk/src/hooks/session.ts` — no change (additive CreateSessionRequest passthrough)

Commit: TBD (impl) · Related: Q-1.1-2.1..5, DEV-20260514-1, spec §18 lines 2619–2624,
migration 0001 lines 62–67, ADR-0022 (replay-determinism), ADR-0035
