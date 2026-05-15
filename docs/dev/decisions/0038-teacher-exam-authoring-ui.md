# ADR-0038 — Teacher Exam Authoring UI model

- Status: proposed
- Date: 2026-05-15
- Stage: v1.1-S4
- Tags: frontend, backend, data

## Context

v1.1-S4 delivers the Teacher Exam Authoring UI: teachers compose existing bank items into
exam-mode assignments. The stage consumes S1 (content bank, read-only) and S2 (practice exam
composer params, `PracticeExamComposerParamsSchema`). Five decisions were ambiguous at morning
ritual and required T3 round-trip resolution before implementation.

ADR-0035 §Decision 2 explicitly deferred teacher item authoring ("Platform-only Stage 1 — only
`platform_admin` and `service-role` can create/update items. When teacher authoring ships, add
`author_id uuid REFERENCES user_profile(id)`... update RLS to Pattern F."). Phase plan §S4 body
uses verbs "pick from bank, preview, compose, publish to class" — consistent with exam authoring
of existing items, not item creation.

`CreateAssignmentRequest` (existing) uses `difficulty_range: {min, max}` (float range model).
S2's `PracticeExamComposerParamsSchema` uses `difficulty_distribution: {easy, mid, hard}` (integer
count-per-band model). These are non-equivalent. Both must be expressible on assignment records
that can compose an exam.

No `useListItems` SDK hook exists; `useItemAdmin(id)` is platform_admin only. `usePathways()`
is the only teacher-accessible content read hook.

SCREEN_SPECS.md contains no entry for `/teacher/content/*`. This ADR + Checkpoint A sketch
constitute the de-facto spec for these screens.

## Options considered

### Decision 1 — Scope: exam authoring vs item authoring

1. **Option a — Exam authoring only** — teachers compose existing bank items into exam-mode
   assignments using S2 `composer_params`. ADR-0035 §Decision 2 holds. Zero migrations, zero
   RLS changes. Pros: consistent with ADR-0035 deferral; S4 budget ~2 days matches. Cons: title
   "Teacher Exam Authoring UI" is ambiguous.
2. **Option b — Item authoring** — teachers write new questions into the bank. Requires `author_id`
   column, RLS Pattern F update, admin UI bypass. Explicitly deferred by ADR-0035. Pros: none vs
   ADR-0035. Cons: contradicts accepted ADR; requires new migration + RLS.

### Decision 2 — Routes: two-route vs single-route

1. **Option A — Two routes** — `/teacher/content` (bank browser) + `/teacher/content/new`
   (composer form). Pattern parity with `/teacher/assignments[/new]`. Pros: familiar navigation
   pattern; consistent breadcrumb model. Cons: minor page transition overhead.
2. **Option B — Single combined route** — bank browser + form on one page. Pros: fewer files.
   Cons: breaks pattern parity.

### Decision 3 — Form pattern: single-page with dividers vs multi-step wizard

1. **Option A — Multi-step wizard** — 5-step wizard matching `assignments/new/page.tsx` pattern.
   Pros: existing component pattern to copy. Cons: S4 form is narrower (fewer fields); wizard
   adds complexity without clear UX gain.
2. **Option B — Single-page form with section dividers** — Bank Pick / Configure / Assign
   sections on one scroll surface. Pros: appropriate for form complexity; simpler state model.
   Cons: diverges from assignments wizard.

### Decision 4 — Schema: extend `CreateAssignmentRequest` vs session-only reconstruction

1. **Option A — Extend `CreateAssignmentRequest` additively** — add `composer_params?:
   PracticeExamComposerParamsSchema` + `simulation_params?: SimulationParamsSchema`. assignments-svc
   persists these fields and forwards into `CreateSessionRequest` when student starts. Pros: server
   is authoritative; client sends once; cross-service contract is clean. Cons: assignments-svc
   handler extension required in S4.
2. **Option B — Client-side reconstruction at session-create** — store params only in UI state;
   reconstruct `CreateSessionRequest` at student start client-side. Pros: no backend change. Cons:
   params not persisted on assignment record; de-normalised; server not authoritative.

### Decision 5 — Bank browser depth: item list endpoint vs pathway-level stats only

1. **Option A — New `/content-svc/items?pathway_id=` list endpoint** — new SDK hook `useListItems`.
   Pros: item-level preview possible. Cons: API scope addition not in S4 budget; not mentioned in
   phase plan.
2. **Option B — Pathway-level only via `usePathways()`** — no new endpoint. Pros: zero new API
   surface; consistent with ADR-0029 prefix convention. Cons: no item-level preview.

## Decision

1. **Option a** — Exam authoring only. ADR-0035 §Decision 2 reaffirmed.
2. **Option A** — Two routes: `/teacher/content` + `/teacher/content/new`.
3. **Option B** — Single-page form with section dividers (Bank Pick / Configure / Assign).
4. **Option A scope-expanded** — Extend `CreateAssignmentRequest` additively with `composer_params?`
   and `simulation_params?`; assignments-svc persists + forwards into session-create on student start.
   `difficulty_range` vs `difficulty_distribution` duplication acceptable — alternates; handler
   honours whichever is present; refactor deferred.
5. **Option B** — Bank browser via `usePathways()` only; no new stats endpoint.

## Rationale

**Decision 1:** ADR-0035 §Decision 2 is an accepted ADR. Overriding it silently would be an
anti-pattern per CLAUDE.md. Phase plan body verbs ("pick from bank, preview, compose, publish")
are all read-verbs against existing bank content. Zero migrations and zero RLS changes are the
correct S4 footprint.

**Decision 2:** Pattern parity with `/teacher/assignments[/new]` reduces cognitive overhead for
future contributors and matches the breadcrumb convention already established in the teacher shell.

**Decision 3:** The S4 form surface is: pathway picker (dropdown) + distribution band picker +
time limit + simulate toggle + class selector + due-date. All fields are one-page-legible. A
wizard adds state complexity with no UX benefit at this field count.

**Decision 4:** Server-authoritative assignment records are a core correctness requirement. If
`composer_params` were only in client state, a student starting a session weeks later could not
be served the intended exam composition. Additive extension is safe: existing assignments that
lack `composer_params` continue to work unchanged. The `difficulty_range` / `difficulty_distribution`
model duplication is an acknowledged technical debt — the handler honours whichever field is
present; a clean unification is deferred to post-launch.

**Decision 5:** A new item-list endpoint requires its own contract tests, RLS policy, and SDK
hook — non-trivial for a ~2-day stage. Phase plan says "pick from bank" meaning pick a *pathway*
as the pool. Pathway-level browse is sufficient for the S4 use case.

## Consequences

- Positive: zero new migrations; zero RLS changes; clean S4 scope boundary; ADR-0035 honoured.
- Negative: `difficulty_range` and `difficulty_distribution` both live on `CreateAssignmentRequest`
  as acknowledged alternates — duplication to be unified post-launch.
- Negative: no item-level preview in bank browser — teacher sees pathway name + item count only.
- Follow-ups: when teacher item authoring ships, add `author_id uuid REFERENCES user_profile(id)`
  + RLS Pattern F per ADR-0035 §Decision 2 Follow-ups. Unify `difficulty_range` /
  `difficulty_distribution` on `CreateAssignmentRequest`.

## Implementation notes

States matrix mandatory on every data-bound component (UI_CONTRACT lines 547–557; merge-blocker):
Loading / Empty / Error / 402-upgrade / Content.

No new UI primitives by default. Distribution band picker decision deferred to Checkpoint A sketch.

axe-core zero serious/critical on both new routes (DoD per UI_CONTRACT lines 748–759).

SCREEN_SPECS gap acknowledged: this ADR + Checkpoint A sketch = de-facto spec for
`/teacher/content` and `/teacher/content/new`.

Files (projected): `packages/types/src/assignment.ts` · `supabase/functions/assignments-svc/handlers.ts`
· `packages/sdk/src/hooks/assignments.ts` · `apps/web/src/app/(teacher)/teacher/content/page.tsx`
· `apps/web/src/app/(teacher)/teacher/content/new/page.tsx`

Commit: pending impl · Related: ADR-0035, ADR-0036, ADR-0037, Q-1.1-4.1, Q-1.1-4.2,
Q-1.1-4.3, Q-1.1-4.4, Q-1.1-4.5
