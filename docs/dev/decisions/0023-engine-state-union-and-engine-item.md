# ADR-0023 — EngineState as discriminated union, EngineItem as server-side item shape

- Status: accepted
- Date: 2026-05-04
- Stage: 16
- Tags: backend | dx

## Context

Stage 15 shipped a single engine (LinearEngine) and aliased
`EngineState = LinearEngineState`. A comment in `contracts.ts` flagged that
"Stage 17 widens this to a discriminated union (`linear` | `adaptive` | …)".
Stage 16 introduces two more engines (SkillEngine + DiagnosticEngine) and the
union widening is needed sooner — putting all three engines' fields onto a
single object would either bloat every persisted snapshot with fields no
engine reads (`current_index` for diagnostic, `per_skill_probe` for linear,
etc.) or push us toward `null`-everywhere, which loses the type-narrowing the
`engine_type` field already enables.

Two coupled changes land in this ADR:

1. **`EngineState` becomes a discriminated union** keyed by `engine_type`
   (`'linear' | 'skill' | 'diagnostic'`, with `'adaptive'` to follow in
   Stage 17 and `'repair'` in v1.1).

2. **`EngineItem` is introduced** as a server-side item shape extending
   `ItemDTO` with `skill_ids: SkillId[]`, `difficulty: number`, and an
   optional `discrimination` value. The wire `ItemDTO` from `@mm/types`
   stays lean — engines need skill mapping + difficulty for selection, but
   the client gets the projected `ItemDTO` (no leaks of correct answers or
   internal calibration metadata).

Both decisions were proposed and approved as Q-16.1 + Q-16.5 in the §2A
pre-implementation review for Stage 16.

## Options considered

### EngineState shape

1. **Mega-state (Stage 15 alias)** — `EngineState = LinearEngineState` for now,
   widen later. Pros: smallest delta. Cons: as soon as a second engine ships,
   it either reuses LinearEngineState fields (semantic muddle) or grows
   optional fields (no narrowing, more `?.` plumbing).
2. **Discriminated union** — `z.discriminatedUnion('engine_type', […])`.
   Pros: each engine's branch is precise; consumers narrow via the literal
   discriminator; persisted JSON snapshot is exactly the engine's state, no
   filler. Cons: each engine method must narrow on entry.
3. **Single base + branch sub-objects** — base fields on the parent, engine-
   specific fields under `state.linear`/`state.skill`/etc. Pros: stable
   common surface. Cons: wraps the type in a needless level of indirection,
   and the discriminator pattern still has to live somewhere.

### EngineItem placement

A. **Add `skill_ids` + `difficulty` to `ItemDTO` directly** in `@mm/types`.
   Pros: one shape end-to-end. Cons: bandwidth (every client item carries
   metadata it doesn't render); leaks calibration data; couples wire format
   to engine internals.
B. **Server-side `EngineItem` extending `ItemDTO`** in `@mm/engines`.
   Pros: lean wire format; engines see what they need; the assessment-svc
   projects to `ItemDTO` before serialising. `ItemDTO` consumers continue
   to compile-against `EngineItem` instances by virtue of structural typing
   (every `EngineItem` IS-A `ItemDTO`). Cons: two near-identical shapes —
   mitigated by `ItemDTOSchema.extend(...)` so duplication is mechanical.

## Decision

Use **Option 2 (discriminated union)** for `EngineState` and
**Option B (`EngineItem`)** for the richer item shape.

```ts
// contracts.ts
export const EngineItemSchema = ItemDTOSchema.extend({
  skill_ids: z.array(SkillIdSchema).min(1),
  difficulty: z.number().min(0).max(1),
  discrimination: z.number().min(0).nullable().optional(),
});

export const EngineStateSchema = z.discriminatedUnion('engine_type', [
  LinearEngineStateSchema,
  SkillEngineStateSchema,
  DiagnosticEngineStateSchema,
]);
```

Each engine method body starts with an assertion that narrows the union to
its branch (`assertLinearState` / `assertSkillState` / `assertDiagnosticState`),
keeping the rest of the implementation cast-free.

`LinearEngineState.planned_items` migrates from `ItemDTO[]` to `EngineItem[]`.
This is a typing tightening, not a behavioural change — the pre-existing
LinearEngine logic was already correct under the wider type.

## Rationale

- **State precision.** Each engine's persisted `engine_state_snapshot` is
  exactly the state shape that engine produced — no Linear-specific
  `current_index` lying around in a Diagnostic snapshot.
- **Type narrowing comes for free.** Once an engine method asserts its
  branch via the discriminator, every subsequent property access is fully
  typed. No `as LinearEngineState` casts needed (Stage 15 had two; Stage 16
  removes them).
- **Wire format stays lean.** Tens of items per session × dozens of fields
  per `ItemDTO` × thousands of sessions = real bandwidth. Restricting the
  network DTO to render-required fields keeps the client small and prevents
  accidental leakage of difficulty / discrimination calibration to the
  client.
- **Forward compatibility.** Stage 17 adds `AdaptiveEngineState` as a
  fourth branch — no other code changes needed except the union literal.
  v1.1's `RepairEngineState` adds the fifth.
- **Replay determinism.** Both choices respect the ADR-0022 contract:
  `EngineState` (any branch) is JSON-serialisable; `EngineItem` is plain
  data with no functions or special types.

## Consequences

- **Positive:**
  - Cleaner per-engine implementations; no shared casts.
  - `engine_state_snapshot` is the right shape for the engine that wrote
    it — no schema migrations needed when new engines join.
  - Network `ItemDTO` can evolve independently of engine internals.
- **Negative:**
  - Each engine method needs a one-line `assertXState(state)` at the top.
    Five lines of assertion code per engine. Acceptable.
  - `EngineItem` is structurally compatible with `ItemDTO` for downstream
    consumers, but assignment in the other direction (`ItemDTO` → `EngineItem`)
    is a type error. Test fixtures construct `EngineItem`s directly.
  - LinearEngine fixtures from Stage 15 had to grow `skill_ids` + `difficulty`
    fields. Lifted into `_fixtures.ts` for sharing, contained in the test
    surface.

## Implementation notes

- Files touched:
  `packages/engines/src/contracts.ts` (union widening + `EngineItem` +
  `assert*State` helpers + new termination reasons + telemetry on
  `EngineResponse` + Stage 16 thresholds in `FrameworkConfig`),
  `packages/engines/src/linear.ts` (assertion-narrowed; behaviour unchanged),
  `packages/engines/src/skill.ts` (new), `packages/engines/src/diagnostic.ts`
  (new), `packages/engines/src/__tests__/_fixtures.ts` (new shared
  fixtures), `packages/engines/src/__tests__/linear.test.ts` (refactored
  to consume shared fixtures), `packages/engines/src/__tests__/skill.test.ts`
  (new), `packages/engines/src/__tests__/diagnostic.test.ts` (new).
- `EngineStateSchema` is a `z.discriminatedUnion` — Zod 3 narrows on parse
  using the literal `engine_type` field.
- `LinearEngine.score()` now exposes a real `skills_touched` (aggregating
  `skill_ids` from items the student has answered) — fixing the Stage 15
  documented gap that returned `[]`.

Related: ADR-0001 (engines-client deferral, resolved Stage 15),
ADR-0022 (pure-function namespaces), Spec §3.1, §3.2.2, §3.2.3, §3.2.4,
§3.6.5 (`ItemDTO`), §7.5.1, §7.5.2, §8.4, §9.5.

Commit: Stage 16 commit (single commit per BUILD_CONTRACT §11.1).
