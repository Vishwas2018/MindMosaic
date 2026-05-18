# ADR-0039 — Student Practice + Simulation UI model

- Status: accepted
- Date: 2026-05-18
- Stage: v1.1-S5
- Tags: frontend, backend, data

## Context

v1.1-S5 delivers the Student Practice + Simulation Flows: student-facing entry screens for
composing and launching practice exams and simulation exams. The stage consumes S1 (content
bank, `usePathways()`), S2 (`PracticeExamComposerParamsSchema`), S3 (`SimulationParamsSchema`,
`canNavigateBack`), and S4 (assignment system, `useStartAssignment()`).

Phase plan §S5 body: "apps/web/src/app/(student)/practice/* + .../exam-sim/*. Student-facing
flows for practice and simulation. Consumes S3 + S4. T5 applies. Phase exit review at S5 close."

T5 discipline applies (three-gate flow: sketch → skeleton → fill). SCREEN_SPECS.md contains
no entries for `/practice/*` or `/exam-sim/*`. This ADR + Checkpoint A sketch constitute the
de-facto spec for these screens (precedent: ADR-0038 §S4).

Six structural decisions were ambiguous at morning ritual and required T3 round-trip resolution
before implementation.

**§N Trap 1 — `/exam-sim` route label:** Phase plan names `/exam-sim/*` without spec citation.
ADR-0037 §Decision (simulation exam mode) established `mode='exam'` + `simulation_params` as the
API contract; there is no separate session type named "exam-sim". The route `/exam-sim` is an
S5-introduced entry/setup screen; it is NOT a new session-running surface. Simulation sessions
run on the existing `/session/[id]/exam` page with server-side enforcement (ADR-0037). This was
confirmed at T3 round-trip (Q-1.1-5.1 binding resolution).

**§N Trap 2 — "Practice exam" copy vs `mode='practice'` API:** UI copy uses the phrase "Practice
Exam" as a student-facing label for the composed exam flow. The API field `mode='practice'`
invokes SkillEngine (unscored, immediate feedback per spec §18) — the wrong engine for this
flow. The composer must use `mode='exam'` (LinearEngine). This copy/API collision is explicitly
documented here to prevent future maintenance from "correcting" the API mode value to match
the UI copy. (Q-1.1-5.3 evidence: `session-selection/page.tsx` sends `mode='practice'` for
SkillEngine sessions, `mode='exam'` for LinearEngine sessions — confirmed at T1 pre-read.)

`SessionStateDTOSchema` (packages/types/src/session.ts lines 152–164) does not expose
`simulation_params`. This creates a client-side gap: after navigating to `/session/[id]/exam`,
the page cannot know whether to show the `<SimulationBanner />` or enforce forward-only mode
from the session state alone. The engine enforces the rules server-side, but the UI indicator
requires an explicit signal. Q-1.1-5.4 resolves this with an additive boolean field.

## Options considered

### Decision 1 — `/exam-sim` route: entry screen vs new session-running surface

1. **Option A — Entry screen only** — `/exam-sim` is a setup page that calls `useCreateSession`
   and redirects to existing `/session/[id]/exam`. No new session-running surface. Pros: zero
   duplication of complex exam page logic; simulation enforcement already in ADR-0037; consistent
   with ADR-0037 architecture. Cons: route name may mislead contributors.
2. **Option B — New session-running surface** — `/exam-sim/[id]` replaces `/session/[id]/exam`
   for simulation sessions. Pros: cleaner conceptual separation. Cons: duplicates `exam/page.tsx`
   (700+ lines); two surfaces for the same engine logic; contradicts ADR-0037.

### Decision 2 — Route count: two separate pages vs shared form

1. **Option A — Two thin route wrappers + shared `<StudentComposerForm>`** — `/practice/page.tsx`
   and `/exam-sim/page.tsx` are thin shells; `simulationLocked` prop controls simulation-specific
   field visibility. Pros: single form component; pattern parity with S4 teacher routes; minimal
   code surface. Cons: minor prop drilling.
2. **Option B — Two fully separate pages** — `/practice/page.tsx` and `/exam-sim/page.tsx` each
   own their own form JSX. Pros: no coupling. Cons: duplication; drift risk.

### Decision 3 — Student self-serve composer scope

1. **Option A — Full student composer** — student enters pathway, item count, difficulty
   distribution, time limit, and simulation toggle (pre-locked to on for `/exam-sim`). Submit
   calls `useCreateSession` with `composer_params` + optionally `simulation_params`. Mirrors S4
   teacher composer on the student side. Pros: delivers the S5 capability statement; reuses S2 + S3
   types already implemented. Cons: more form fields than a minimal stub.
2. **Option B — Pathway-only** — student picks pathway; all other params use server defaults.
   Pros: simpler form. Cons: doesn't expose the composition capability that S2 + S3 built.

### Decision 4 — `is_simulation` exposure: additive field vs header vs cookie

1. **Option a — Additive `is_simulation: z.boolean()` on `SessionStateDTOSchema`** —
   assessment-svc `getSessionState` reads `engine_state_snapshot.simulation_params` and sets
   `is_simulation = !!state.simulation_params`. Additive; server-authoritative; persists on
   resume (every `useSessionState` refetch returns correct value). Pros: clean typed DTO;
   zero client-side state; banner persists correctly on reload. Cons: minor backend change
   (S5 backend scope).
2. **Option b — Client-side URL flag** — encode `?sim=1` in redirect URL from `/exam-sim`.
   Pros: zero backend change. Cons: not authoritative; stripped on resume; tamper-trivial.
3. **Option c — Response header** — assessment-svc sets `X-Simulation: true` on state
   responses. Pros: no DTO change. Cons: requires SDK hook to surface header; non-standard;
   banner drops on SWR cache hit.

### Decision 5 — SimulationBanner placement: exam page extension vs wrapper

1. **Option A — Extend `/session/[id]/exam/page.tsx`** — add `<SimulationBanner />` as a
   conditional inline component on `state.is_simulation === true`. Minimal: one new component,
   one conditional branch. Pros: no new routes or wrappers; exam page already handles all
   simulation enforcement (ADR-0037). Cons: exam page grows slightly.
2. **Option B — Layout wrapper** — `session/[id]/layout.tsx` conditionally renders banner.
   Pros: banner shared across modes. Cons: layout doesn't have access to `is_simulation`
   without a session state fetch; over-engineering for a one-mode banner.

### Decision 6 — Results page: reuse vs simulation-specific variant

1. **Option A — Reuse `/results/[id]`** — simulation sessions surface results on the existing
   results page. `is_correct` values are available post-submit (server clears the
   `hide_feedback_until_submit` gate on session close). No new page. Pros: zero duplication;
   consistent with existing results contract. Cons: results page may not highlight simulation
   context.
2. **Option B — Simulation results variant** — new `/results/[id]/simulation` page. Pros:
   differentiated UX. Cons: scope expansion; existing results page is sufficient for S5.

## Decision

1. **Option A** — `/exam-sim` is an entry/setup screen only; redirects to `/session/[id]/exam`.
   ADR-0037 simulation enforcement is the authoritative layer.
2. **Option A** — Two thin route wrappers (`/practice/page.tsx` + `/exam-sim/page.tsx`) sharing
   `<StudentComposerForm simulationLocked={bool} />`.
3. **Option A** — Full student self-serve composer; mirrors S4 teacher composer on the student
   side. `mode='exam'` in API; "Practice Exam" in UI copy (§N Trap 2 documented above).
4. **Option a** — `is_simulation: z.boolean()` additive field on `SessionStateDTOSchema`;
   assessment-svc `getSessionState` sets value from `engine_state_snapshot.simulation_params`.
5. **Option A** — `<SimulationBanner />` as a conditional inline component on
   `/session/[id]/exam/page.tsx` when `state.is_simulation === true`.
6. **Option A** — Reuse `/results/[id]`; no simulation-specific results variant in S5.

## Rationale

**Decision 1:** ADR-0037 established `mode='exam'` + `simulation_params` as the full simulation
contract. A new session-running surface would duplicate 700+ lines of exam page logic for no
architectural gain. The route `/exam-sim` is a student-facing label for the entry flow; it does
not imply a new engine or session type. §N Trap 1 documented explicitly.

**Decision 2:** Pattern parity with S4 teacher routes (`/teacher/content` + `/teacher/content/new`
sharing form logic) reduces code surface and drift risk. `simulationLocked` prop is a clean
discriminator — the shared form disables the simulation toggle when `simulationLocked={true}`
(exam-sim always runs in simulation mode; toggle not user-controlled).

**Decision 3:** S2 (`PracticeExamComposerParamsSchema`) and S3 (`SimulationParamsSchema`) were
built explicitly to be composed. Delivering a pathway-only picker in S5 would leave the
composition capability unexercised from the student side and inconsistent with the teacher
side. Full composer is the correct S5 scope.

**Decision 4:** Option b (URL flag) is not server-authoritative and breaks on direct navigation
or reload. Option c (header) requires non-standard SDK plumbing and breaks on SWR cache hits.
Option a is the cleanest contract: typed, server-authoritative, consistent across resume.
The assessment-svc change is minimal (one field derivation in `getSessionState`) and scoped to S5.

**Decision 5:** The exam page already owns all simulation-specific rendering (forward-only nav,
deferred feedback). Adding a banner as a conditional branch is the minimal extension. A layout
wrapper would require a separate state fetch and adds complexity for a single-mode indicator.

**Decision 6:** `is_correct` values are available server-side after `submit` (ADR-0037: server
gates `is_correct: null` only during the session, not on results). The existing results page
is sufficient. A new page would be scope expansion beyond S5 budget.

## Consequences

- Positive: zero new session-running surfaces; simulation enforcement remains in ADR-0037 layer;
  minimal code surface (2 thin wrappers + 1 shared form + 1 new banner component + 1 backend field).
- Positive: is_simulation is server-authoritative; SimulationBanner persists correctly on reload
  and resume.
- Negative: `/exam-sim` route name may confuse contributors into thinking it is a new session
  type — §N Trap 1 documentation in this ADR is the primary mitigation.
- Negative: "Practice Exam" copy vs `mode='exam'` API — §N Trap 2 documentation here is the
  mitigation; no runtime impact.
- Follow-ups: simulation-specific results enhancements (score breakdown, exam conditions summary)
  deferred to post-launch. Individual `no_back_nav` / `hide_feedback_until_submit` toggle control
  deferred (ADR-0038 implementation note).

## States matrix (S5 new pages — merge-blocker per UI_CONTRACT lines 547–557)

| Page                        | Loading       | Empty                          | Error          | 402-upgrade    | Content              |
| --------------------------- | ------------- | ------------------------------ | -------------- | -------------- | -------------------- |
| `/practice` (composer form) | `LoadingState`| `EmptyState_` (no pathways)    | `ErrorState`   | `UpgradeState` | `StudentComposerForm` |
| `/exam-sim` (composer form) | `LoadingState`| `EmptyState_` (no pathways)    | `ErrorState`   | `UpgradeState` | `StudentComposerForm` |

`<SimulationBanner />` on `/session/[id]/exam`: inline conditional — no new state surface;
inherits exam page states matrix from Stage 23.

## axe-core gate

Zero serious/critical violations on `/practice` and `/exam-sim` routes required per UI_CONTRACT
lines 748–759. Test file: `apps/web/playwright/e2e/student-composer-a11y.spec.ts` (new, S5).

## SCREEN_SPECS gap

SCREEN_SPECS.md has no entries for `/practice/*` or `/exam-sim/*`. This ADR + Checkpoint A
sketch = de-facto spec for these screens. Precedent: ADR-0038 §S4 (same gap for
`/teacher/content` + `/teacher/content/new`).

## §Phase Exit Note

_Placeholder — fold in at S5 chore close._

v1.1 phase exit review at S5 close. Confirm: all 7 v1.1 stages closed (S1–S5 + S6–S7 TBD or
S5 is final); branch `v1.1/exam-content` green on all quality gates; phase exit report drafted
at `docs/dev/v1.1-exit-report.md` per DEV_PLAN §phase-exit template.

## Implementation notes

Anticipated files:
- `packages/types/src/session.ts` — `is_simulation: z.boolean()` additive on `SessionStateDTOSchema`
- `supabase/functions/assessment-svc/handlers.ts` — `getSessionState` sets `is_simulation`
- `packages/sdk/src/hooks/session.ts` — auto-propagation (type update only; no hook logic change)
- `apps/web/src/app/(student)/practice/page.tsx` (new)
- `apps/web/src/app/(student)/practice/layout.tsx` (new)
- `apps/web/src/app/(student)/exam-sim/page.tsx` (new)
- `apps/web/src/app/(student)/exam-sim/layout.tsx` (new)
- `apps/web/src/components/student/StudentComposerForm.tsx` (new shared component)
- `apps/web/src/components/student/SimulationBanner.tsx` (new inline component)
- `apps/web/src/app/(student)/session/[id]/exam/page.tsx` — add SimulationBanner conditional
- `apps/web/src/app/(student)/copy/studentComposer.ts` (new copy file)
- `apps/web/playwright/e2e/student-composer-a11y.spec.ts` (new axe-core test)

### Composer param option sets (schema-derived)

Time-limit `<Select>` options are derived from `PracticeExamComposerParamsSchema.time_limit_ms`
bounds (`packages/types/src/session.ts:37`, min 300_000 / max 10_800_000). Full option set:

| Label  | ms value   |
| ------ | ---------- |
| 5 min  | 300,000    |
| 10 min | 600,000    |
| 15 min | 900,000    |
| 30 min | 1,800,000  |
| 45 min | 2,700,000  |
| 60 min | 3,600,000  |
| 90 min | 5,400,000  |
| 120 min| 7,200,000  |
| 180 min| 10,800,000 |

Checkpoint A sketch listed 15/30/45/60/90/120/180 min — corrected here per C3 schema
cross-check. Skeleton and fill must use the full schema-derived list starting at 5 min.

Item-count range (5–80) derives from `session.ts:35` (`z.number().int().min(5).max(80)`).

Difficulty distribution refinements derive from `session.ts:40 + 47`:
sum of `easy + mid + hard` must equal `item_count` AND be `> 0`.
The cross-field Zod `.refine()` belongs on the shared form schema (N1 carry from Checkpoint A).

Form-state internal field (C2 resolution): `simulationParams: SimulationParams | null`.
- `null` = simulation off (practice mode).
- `{ no_back_nav: true, hide_feedback_until_submit: true }` = simulation on.
- Submit maps `null → undefined` for the optional `simulation_params` wire field.
- When `simulationLocked={true}` (`/exam-sim`): initialised to the object; never changed.
- When `simulationLocked={false}` (`/practice`): checkbox "Simulation mode" toggles between
  null and the object. UI label "Simulation mode" is unchanged (copy; not the field name).

### is_simulation derivation scope

`is_simulation` on `SessionStateDTO` is engine-type-scoped:

```typescript
is_simulation: state.engine_type === 'linear' ? state.simulation_params != null : false
```

Non-linear engines return `false`. Simulation mode is a LinearEngine-only feature, explicitly
scoped by ADR-0037:

- ADR-0037 §Decision 4 line 124: "NO `AssessmentEngine` interface change. NO changes to
  other engine implementations." Simulation enforcement is excluded from Skill/Diagnostic/
  Adaptive engines by decision, not by omission.
- ADR-0037 §Rationale (Decision 4) lines 177–178: "Reading `state.simulation_params` keeps
  the decision local to LinearEngine where it belongs."
- ADR-0037 §Decision 6 rationale lines 133–134: "Both stored on `LinearEngineState` as
  optional analytics markers" — `simulation_params` is declared on `LinearEngineStateSchema`
  only (`packages/engines/src/contracts.ts:237`); absent from Skill/Diagnostic/Adaptive schemas.

The `state.engine_type === 'linear'` guard in `resumeSession` is required to satisfy the
TypeScript discriminated union (`EngineState` = `LinearEngineState | SkillEngineState |
DiagnosticEngineState | AdaptiveEngineState`). Without the guard, `state.simulation_params`
would be a type error because the field does not exist on non-linear branches.

Future engines opting into simulation require: (1) `simulation_params` added to that engine's
state schema, (2) a new branch in the `resumeSession` derivation expression, (3) an ADR
amendment here. The narrowing pattern makes the extension point explicit.

Commit: v1.1-S5 impl (pending) · Related: ADR-0036, ADR-0037, ADR-0038, Q-1.1-5.1, Q-1.1-5.2,
Q-1.1-5.3, Q-1.1-5.4, Q-1.1-5.5, Q-1.1-5.6
