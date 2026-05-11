# QUESTIONS.md — open questions for spec/product owner

> Resolved → ## Resolved with answer + date.
> Use the template from CLAUDE.md §Templates.

## Open

<!-- none -->

## Resolved

### Q-40.UI-6 — Completed assignment card: plain Review button vs SCREEN_SPECS §13 "View history dropdown"

- Date raised: 2026-05-30 (Stage 40 prep — T2-tightened)
- Asked of: self (T2 self-resolve)
- Source: SCREEN_SPECS §13 "View history dropdown"; `StudentAssignmentDTO.my_session_id: string | null`; `/results/[id]/page.tsx` (existing route)
- Question: Completed cards have one `my_session_id` per student. SCREEN_SPECS §13 specifies a dropdown implying multiple history entries. Use dropdown or plain navigate?
- Why ambiguous: Dropdown implies multiple sessions per assignment (repeat-attempt flow). v1 has no repeat-attempt flow — one session ID per assignment per student.
- Blocking? no
- Assumed answer: Plain "Review" button → `/results/{my_session_id}`.
- Code affected: `apps/web/src/app/(student)/assignments/page.tsx`
- Status: resolved
- Resolution: Plain "Review" button navigating to `/results/{my_session_id}`. No dropdown. Rationale: single session_id per student per assignment in v1; dropdown would have only one item and mislead. DEV-20260530-2 filed. v1.1 repeat-attempt flow can replace with dropdown. 2026-05-30.

---

### Q-40.UI-5 — Assignment mode icon mapping: which icon per mode value

- Date raised: 2026-05-30 (Stage 40 prep — T2-tightened)
- Asked of: self (T2 self-resolve)
- Source: `StudentAssignmentDTO.mode`; `docs/mockups/10-student-assignments.html` card mode icon column
- Question: Which icon should each mode value map to on assignment cards? No `MODE_ICON_MAP` exists in the codebase.
- Why ambiguous: Mockup shows mode-specific icons without labelling which SVG path maps to which mode string.
- Blocking? no
- Assumed answer: `MODE_ICON_MAP` const in `apps/web/src/copy/student.ts`; `practice` → pencil, `diagnostic` → checklist, `exam` → clock. Generic fallback for unmapped modes.
- Code affected: `apps/web/src/copy/student.ts`, `apps/web/src/app/(student)/assignments/page.tsx`
- Status: resolved
- Resolution: `MODE_ICON_MAP` exported from `apps/web/src/copy/student.ts`: `{ practice: PencilIcon, diagnostic: ClipboardListIcon, exam: ClockIcon }`. Generic `QuestionMarkCircleIcon` fallback. Single-consumer const — extract to shared location only when a second consumer appears. 2026-05-30.

---

### Q-40.UI-2 — Weekly Progress KPI tile: reuse StatTile or custom inline block

- Date raised: 2026-05-30 (Stage 40 prep — T5 layout sketch)
- Asked of: self (T5 operator decision)
- Source: `docs/mockups/02-dashboard.html` KPI grid (Sessions / Mastery / Weekly Progress with progress bar / Last Score); `packages/ui/src/StatTile/StatTile.tsx`
- Question: The Weekly Progress tile in the mockup contains a progress bar inside the tile body — structurally different from StatTile (number + label only). Reuse StatTile with a children prop or build an inline block?
- Why ambiguous: StatTile has no children slot; extending it risks breaking parent dashboard and teacher page consumers.
- Blocking? no
- Assumed answer: Custom inline block — single consumer, no shared-primitive risk.
- Code affected: `apps/web/src/app/(student)/dashboard/page.tsx`
- Status: resolved
- Resolution: Inline custom block — `div` with Tailwind styling matching the KPI tile grid (rounded-2xl bg-white shadow-sm p-5). Contains label, fraction text, and `<progress>` element. Not a StatTile extension. Single-consumer rule: extract to shared primitive only when a second consumer appears. 2026-05-30.

---

### Q-40.UI-1 — Student TopBar nav items: which routes to include

- Date raised: 2026-05-30 (Stage 40 prep — T5 layout sketch)
- Asked of: self (T5 operator decision)
- Source: `docs/mockups/02-dashboard.html` top nav; existing student routes (dashboard, results/[id], session-selection, session/[id]/*)
- Question: The mockup shows a multi-item top nav. Which items are honest routes in Stage 40? `/learn` and `/practice` would be dead links if included.
- Why ambiguous: Mockup nav includes items for routes that do not exist as named pages in v1.
- Blocking? no
- Assumed answer: 3-item nav: Dashboard / Assignments / Results. Omit `/learn` and `/practice`.
- Code affected: `apps/web/src/app/(student)/dashboard/page.tsx`, `apps/web/src/app/(student)/assignments/page.tsx`
- Status: resolved
- Resolution: TopBar nav = 3 items: Dashboard (`/dashboard`) / Assignments (`/assignments`) / Results (passive — links to individual sessions). `/learn` and `/practice` omitted — no distinct named pages exist; session-selection handles start-session flow via mode param. 2026-05-30.

---

### Q-40.4 — Quick Insights data source: buildExplanationCards or raw misconceptions list

- Date raised: 2026-05-30 (Stage 40 prep — T2-tightened)
- Asked of: self (T2 self-resolve)
- Source: `packages/core/src/explain-format.ts` (`buildExplanationCards()`); `packages/sdk/src/hooks/intelligence.ts` (`useCausalMap(studentId)`); SCREEN_SPECS §7 Quick Insights block; `docs/mockups/02-dashboard.html` insights rows (3 icon+text items)
- Question: Should Quick Insights rows be raw `active_misconceptions` strings from useCausalMap, or formatted via buildExplanationCards from @mm/core?
- Why ambiguous: buildExplanationCards existence was not confirmed in morning ritual R7 (T1 read defect). Raw strings are simpler; buildExplanationCards adds consistent formatting and is already tested.
- Blocking? no
- Assumed answer: Reuse buildExplanationCards — consistent formatting, already tested (8 tests, Stage 36 commit 56b4a9a).
- Code affected: `apps/web/src/app/(student)/dashboard/page.tsx`
- Status: resolved
- Resolution: `buildExplanationCards(useCausalMap(studentId).data?.active_misconceptions ?? [])` — returns `ExplanationCard[]` with `title`, `body`, `icon`. Render first 3. `EXPLANATION_FORMATTER_VERSION = 'v1'` already set in explain-format.ts. T1 read defect resolved: file confirmed present at `packages/core/src/explain-format.ts` via ls verification at Stage 40 session start. 2026-05-30.

---

### Q-40.3 — Learning plan item "Start" button navigation target

- Date raised: 2026-05-30 (Stage 40 prep — T2-tightened)
- Asked of: self (T2 self-resolve)
- Source: `packages/types/src/orchestration.ts` `LearningPlanItemDTOSchema` (no `id` field); `apps/web/src/app/(student)/session-selection/page.tsx`; SCREEN_SPECS §7 Weekly Learning Plan card
- Question: LearningPlanItemDTO has no `id` field. Where does "Start" navigate for each plan item?
- Why ambiguous: Starting a specific session for a plan item requires a plan_item_id or skill_id. LearningPlanItemDTO has neither. Options range from mode-scoped session-selection to a full skill-param extension.
- Blocking? no
- Assumed answer: Option A — navigate to `/session-selection?mode={item.mode}`. Mode is the only safely-available discriminator.
- Code affected: `apps/web/src/app/(student)/dashboard/page.tsx`
- Status: resolved
- Resolution: Option A — `Start` button navigates to `/session-selection?mode={item.mode}`. Rationale: no `id` field on LearningPlanItemDTO; skill param extension out of scope (no skill routing in session-selection in v1). Limitation noted: pressing Start on any plan item of the same mode leads to the same session-selection screen — plan-specific routing deferred v1.1 when plan_item_id is exposed by orchestration-svc. 2026-05-30.

---

### Q-40.2 — Student assignments tab labels: 3-tab mockup vs SCREEN_SPECS §13 "To do/Completed/Overdue"

- Date raised: 2026-05-30 (Stage 40 prep — T5 layout sketch)
- Asked of: self (T5 operator decision)
- Source: `docs/mockups/10-student-assignments.html` (3 tabs: Assigned / In Progress / Completed); SCREEN_SPECS §13 (tabs: To do / Completed / Overdue); `StudentAssignmentDTO.my_status`
- Question: Should the assignments page use the mockup's 3-tab structure or SCREEN_SPECS §13's 3-tab structure (different labels + separate Overdue tab)?
- Why ambiguous: UI_CONTRACT §1.1 makes mockup the visual authority; SCREEN_SPECS §13 is the content authority. Tab labels fall between the two.
- Blocking? no — T5 operator decision
- Assumed answer: 3 tabs: Assigned / In Progress / Completed. Overdue items in Assigned tab with red border + "Overdue" pill. Overdue banner above tabs when count > 0.
- Code affected: `apps/web/src/app/(student)/assignments/page.tsx`
- Status: resolved
- Resolution: 3 tabs: Assigned / In Progress / Completed. Overdue items appear in Assigned tab as visually-distinct cards (red `border-l-4 border-l-red-500` + "Overdue" pill + "Was due..." line). Banner above tab strip shows overdue count when > 0. Separate Overdue tab rejected: it duplicates the same items already in Assigned — one item would appear in two tabs simultaneously. DEV-20260530-1 filed. 2026-05-30.

---

### Q-40.1 — Stage 40 DEV_PLAN student dashboard path typo: page.tsx vs dashboard/page.tsx

- Date raised: 2026-05-30 (Stage 40 prep — T2-tightened)
- Asked of: self (T2 self-resolve)
- Source: DEV_PLAN.md Stage 40 deliverables (`apps/web/src/app/(student)/page.tsx`); DEV-20260515-1 (Stage 25 same-class typo); middleware + role-home routing layer
- Question: DEV_PLAN Stage 40 lists `(student)/page.tsx` as the student dashboard file. Stage 25 established `dashboard/page.tsx` as the correct path. Same typo class?
- Why ambiguous: DEV_PLAN is the authoritative plan document; creating a root-level page.tsx could be interpreted as the correct action.
- Blocking? no
- Assumed answer: Same typo class as DEV-20260515-1 — upgrade `dashboard/page.tsx`. Root-level page.tsx is unreachable via middleware.
- Code affected: `apps/web/src/app/(student)/dashboard/page.tsx`
- Status: resolved
- Resolution: Upgrade `apps/web/src/app/(student)/dashboard/page.tsx`. Root-level `(student)/page.tsx` is unreachable — middleware routes all student traffic to `/dashboard` via role-home.ts. DEV-20260511-2 filed. 2026-05-30.

---

### Q-39.9 — Draft assignment card: [Edit] action scope and navigation target

- Date raised: 2026-05-29 (Stage 39 impl — T5 mid-impl checkpoint)
- Classification: T3 Option 3 (implementation detail; tight-detail self-resolve)
- Asked of: self (T3 self-resolve)
- Source: D3 `useUpdateAssignment` hook (PATCH /assignments/{id}); SCREEN_SPECS §22 (no explicit edit flow); `assignments-svc/handlers.ts:276` (PATCH handler, draft-only gate)
- Evidence: useUpdateAssignment in plan (D3); operator checkpoint confirmed draft → [Track] [Edit]; PATCH returns 422 if status ≠ draft
- Question: Does the [Edit] button navigate to a dedicated edit route, open an inline panel, or reuse the creation wizard with a mode flag?
- Options considered:
  1. `/teacher/assignments/new?edit=<id>` — wizard in edit mode via useSearchParams; submits via useUpdateAssignment
  2. `/teacher/assignments/<id>/edit` — dedicated edit route; mirrors wizard
  3. Inline drawer on list page — no new route
- Why ambiguous: SCREEN_SPECS §22 specifies creation flow only; edit flow not described.
- Blocking? no
- Assumed answer: Option 1.
- Code affected: `apps/web/src/app/(teacher)/teacher/assignments/page.tsx` (card Edit button), `new/page.tsx` (useSearchParams ?edit= detection)
- Status: resolved
- Resolution: Option 1 — draft cards show [Edit] button navigating to `/teacher/assignments/new?edit=<assignmentId>`. Wizard detects `?edit=` via useSearchParams, loads draft via useAssignment(id), pre-populates all wizard state fields, submits via useUpdateAssignment. Same 5-step structure. On success → navigate to /teacher/assignments. Keeps route surface minimal; reuses wizard without a second route. 2026-05-29.

---

### Q-39.8 — Wizard type key 'skill' conflicts with CreateAssignmentRequestSchema enum 'skill_drill'

- Date raised: 2026-05-29 (Stage 39 impl — T1 pre-coding read, R3+R4)
- Classification: T2-tightened (TypeScript compile error; downstream assessment-svc mode routing depends on exact string value)
- Asked of: self (T2 self-resolve; tightens Q-39.6)
- Source: `15-assignment-engine.html:317` (`key:"skill"`); `packages/types/src/assignments.ts:37` (`z.enum(['practice','exam','diagnostic','skill_drill'])`); assessment-svc session routing (mode string gates handler paths)
- Evidence: @mm/types CreateAssignmentRequestSchema.mode is z.enum excluding 'skill'. TypeScript rejects 'skill' as a valid CreateAssignmentRequest.mode at compile time. Assessment-svc derives session type from mode value; 'skill' ≠ 'skill_drill' would miss the skill_drill session path.
- Question: Q-39.6 resolved to "use mockup keys directly"; but @mm/types enum rejects 'skill' and assessment-svc expects 'skill_drill'. How to resolve?
- Options considered:
  1. Wizard internal key 'skill_drill' throughout — breaks mockup vocabulary, confusing UX label management
  2. Map 'skill' → 'skill_drill' in toServerMode before SDK calls — preserves wizard vocabulary, type-safe at boundary
  3. Change CreateAssignmentRequestSchema.mode to include 'skill' — invasive @mm/types edit, inconsistent with server DB values
- Why ambiguous: Q-39.6 resolved to "server accepts any string" (true for assignments-svc parseCreateBody) but missed @mm/types client enum and assessment-svc routing dependency.
- Blocking? yes — TypeScript compile error without resolution
- Assumed answer: Option 2.
- Code affected: `apps/web/src/app/(teacher)/teacher/assignments/new/page.tsx` (toServerMode map, build-body function)
- Status: resolved
- Resolution: Option 2 — `const toServerMode = {practice:'practice', diagnostic:'diagnostic', exam:'exam', skill:'skill_drill'} as const` in wizard file. Applied before generateAssignment call and createAssignment/updateAssignment call. Wizard internal type remains `'practice'|'diagnostic'|'exam'|'skill'`; SDK boundary receives the enum-valid value. Q-39.6 tightened: Q-39.6 "server accepts any string" is correct for assignments-svc but does not cover @mm/types enum or assessment-svc routing. 2026-05-29.

---

### Q-39.7 — Title field: absent from all 5 wizard steps in mockup, required by createAssignment

- Date raised: 2026-05-29 (Stage 39 impl — T1 pre-coding read, R3)
- Classification: T2-tightened (createAssignment returns 400 without title; server rejects at parseCreateBody:261)
- Asked of: self (T2 self-resolve)
- Source: `assignments-svc/handlers.ts:261` (`typeof b['title'] !== 'string' → throw Error('title required')`); `analytics-svc/handlers.ts:735` (`DraftAssignmentDTO.title: string`); SCREEN_SPECS §22 field validation "title 3–100 chars"
- Evidence: parseCreateBody line 261 throws immediately if title is not a string — server returns 400. DraftAssignmentDTO provides a generated title. SCREEN_SPECS §22 validates 3–100 chars (implies user-editable). Mockup HTML has no `<input>` for title in any of the 5 step renderers.
- Question: Where does the wizard collect the assignment title? Mockup omits it entirely; server requires it.
- Options considered:
  1. Read-only from DraftAssignmentDTO.title — no user input; silently uses generated title
  2. Editable field in step 3 Configure, pre-populated from draft, validated 3–100 chars
  3. Editable field in step 5 Review only
- Why ambiguous: Mockup (T5 visual authority) has no title field; SCREEN_SPECS §22 (field authority) validates one. The conflict is between visual authority and field authority.
- Blocking? yes — without a title the createAssignment call returns 400
- Assumed answer: Option 2.
- Code affected: `apps/web/src/app/(teacher)/teacher/assignments/new/page.tsx` (wizard state.title, Configure step, Review step)
- Status: resolved
- Resolution: Option 2 — "Assignment Title" text input added to step 3 Configure (above the configuration grid). Pre-populated from DraftAssignmentDTO.title on successful generate; defaults to "[Mode] Assignment" (e.g., "Practice Assignment") on graceful degradation. Validate 3–100 chars before allowing step 4 navigation (shows inline error if empty or too short/long). Title shown as first row in step 5 Review table. Rationale: mockup T5 authority governs layout/structure; SCREEN_SPECS §22 governs field validation — editable title field satisfies the field authority without violating layout authority (step 3 Configure is the logical home for metadata fields). 2026-05-29.

---

### Q-39.UI-6 — Sidebar nav: 4-item (Overview/Students/Assignments/Analytics) vs 5-item (add Insights)

- Date raised: 2026-05-29 (Stage 39 prep — T5 layout sketch)
- Asked of: self (T3 Option 3 hybrid)
- Source: `15-assignment-engine.html` sidebar nav (5 items including Insights); Stage 37/38 teacher pages (4 items)
- Question: Should Stage 39 add an "Insights" nav item to match the mockup, or preserve the 4-item nav for consistency with existing teacher pages?
- Why ambiguous: Mockup has 5 nav items; no existing spec section defines an Insights screen for teachers.
- Blocking? no
- Assumed answer: 4-item nav; Insights not added.
- Code affected: `apps/web/src/app/(teacher)/teacher/assignments/page.tsx`, `new/page.tsx`, `[id]/page.tsx`
- Status: resolved
- Resolution: 4-item nav (Overview / Students / Assignments / Analytics). Insights omitted — the mockup 5th item is designer speculation with no spec backing; no SCREEN_SPECS §N defines a teacher Insights screen in v1. Nav consistency across all teacher pages preserved. 2026-05-29.

---

### Q-39.UI-5 — Send Reminder checkbox: silent no-op vs disabled with v1.1 tooltip

- Date raised: 2026-05-29 (Stage 39 prep — T2-tightened)
- Asked of: self (T2 self-resolve, revised)
- Source: `15-assignment-engine.html` Schedule step; SCREEN_SPECS §22 tracking actions "Send reminder — Deferred v1.1"
- Question: Render reminders checkbox as silent no-op on submit, or as disabled with "Available in a future release" tooltip?
- Why ambiguous: Mockup renders it as an active checkbox. SCREEN_SPECS explicitly marks it v1.1.
- Blocking? no
- Assumed answer: Disabled with v1.1 tooltip (UX-honest).
- Code affected: `apps/web/src/app/(teacher)/teacher/assignments/new/page.tsx` (Schedule step)
- Status: resolved
- Resolution: Checkbox renders in disabled state with tooltip "Available in a future release" — same PHASE-2 pattern as Stage 38 ICAS/Selective tab precedent. Not a silent no-op. UX is honest about v1 scope. 2026-05-29.

---

### Q-39.UI-4 — Attempts Allowed + Start Date: silent-drop vs disabled with tooltip

- Date raised: 2026-05-29 (Stage 39 prep — T2-tightened)
- Asked of: self (T2 self-resolve, revised)
- Source: `15-assignment-engine.html` Configure step (Attempts Allowed select) + Schedule step (Start Date input); `assignments-svc/handlers.ts:CreateBody` (no attempts or start_at field)
- Question: Render attempts and start date fields as silent no-ops (values dropped before API call), or as disabled with v1.1 tooltip?
- Why ambiguous: Mockup renders both as active. Neither field has a DB column. Silent-drop is invisible to the user; disabled is honest.
- Blocking? no
- Assumed answer: Disabled with v1.1 tooltip.
- Code affected: `apps/web/src/app/(teacher)/teacher/assignments/new/page.tsx` (Configure + Schedule steps)
- Status: resolved
- Resolution: Both fields render in disabled state with tooltip "Available in a future release". Not silently dropped. Only `due_at` and `time_limit_ms` (both in CreateBody) are persisted from the schedule/configure steps. UX-honest; mirrors PHASE-2 disabled pattern. 2026-05-29.

---

### Q-39.UI-3 — Topic chips: UUID resolution required or display-only hints

- Date raised: 2026-05-29 (Stage 39 prep — T2-tightened)
- Asked of: self (T2 self-resolve, revised)
- Source: `15-assignment-engine.html` Target step topic chips (display names only); `analytics-svc/handlers.ts:GenerateAssignmentBody` (target_skill_ids optional); `assignments-svc/handlers.ts:CreateBody` (target_skill_ids: string[])
- Question: Do topic chips need to resolve to skill_node UUIDs for the generateAssignment call, or can they be display-only hints?
- Why ambiguous: Passing chip names to generateAssignment as filter hints requires UUID mapping (no skill list hook exists). Passing no UUIDs still works (server picks weakest skills from class analytics).
- Blocking? no
- Assumed answer: Display-only with explicit caption; no UUID resolution in v1.
- Code affected: `apps/web/src/app/(teacher)/teacher/assignments/new/page.tsx` (Target step)
- Status: resolved
- Resolution: Topic chips render as visual hints only. Caption placed directly below chip strip: "Suggestions only — auto-generated based on class analytics." generateAssignment called with {class_id, mode} only (no explicit target_skill_ids filter). Draft response provides target_skill_ids for the subsequent createAssignment call. Manual skill UUID resolution deferred v1.1 (no skill list hook; building one exceeds Stage 39 budget). 2026-05-29.

---

### Q-39.UI-2 — Route path: DEV_PLAN (teacher)/assignments/ vs Stage 38 precedent (teacher)/teacher/assignments/

- Date raised: 2026-05-29 (Stage 39 prep — T2-tightened)
- Asked of: self (T2 self-resolve)
- Source: DEV_PLAN.md Stage 39 deliverables (`apps/web/src/app/(teacher)/assignments/page.tsx`); Stage 38 teacher pages (`apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`); SCREEN_SPECS §22 sub-route URLs (`/teacher/assignments`)
- Question: DEV_PLAN path omits `teacher/` segment. Should the route be `(teacher)/assignments/` or `(teacher)/teacher/assignments/`?
- Why ambiguous: Same typo class as Q-38.4 (DEV_PLAN Stage 38 also omitted the teacher/ segment). SCREEN_SPECS URL pattern is authoritative.
- Blocking? no
- Assumed answer: `(teacher)/teacher/assignments/` per Stage 38 precedent and SCREEN_SPECS §22 URL `/teacher/assignments`.
- Code affected: Three new route files: `(teacher)/teacher/assignments/page.tsx`, `new/page.tsx`, `[id]/page.tsx`
- Status: resolved
- Resolution: Use `(teacher)/teacher/assignments/` prefix. DEV_PLAN path typo logged as deviation at stage close (same class as Q-38.4 path typo). No ADR needed (mechanical path correction). 2026-05-29.

---

### Q-39.UI-1 — Wizard step count: 5-step mockup vs 4-step SCREEN_SPECS §22

- Date raised: 2026-05-29 (Stage 39 prep — T5 layout sketch, T3 round-trip)
- Asked of: operator (T3 round-trip — visual authority conflict)
- Source: `15-assignment-engine.html` (`var STEPS=["Type","Target","Configure","Schedule","Review"]` line 274); SCREEN_SPECS §22 lines 1188–1194 (4-step: Target → Content → Schedule → Review & Publish)
- Question: Follow mockup 5-step structure (Type → Target → Configure → Schedule → Review) or SCREEN_SPECS 4-step structure (Target → Content → Schedule → Review & Publish)?
- Why ambiguous: UI_CONTRACT §1.1 names mockup as visual authority; SCREEN_SPECS is the content/field authority. Step grouping falls between the two.
- Blocking? yes — T3 round-trip; operator must approve before wizard coding begins
- Assumed answer: 5-step mockup structure. SCREEN_SPECS field validation rules apply unchanged within regrouped steps.
- Code affected: `apps/web/src/app/(teacher)/teacher/assignments/new/page.tsx`
- Status: resolved
- Resolution: 5-step mockup structure (Type → Target → Configure → Schedule → Review). SCREEN_SPECS §22 field validation rules (title, targets, due_at, item_count, skills) apply unchanged within regrouped steps; only UI grouping differs. DEV-20260529-1 filed for v1.1 spec reconciliation. T3 round-trip discharged in Stage 39 morning ritual. 2026-05-29.

---

### Q-39.6 — Mode/type mapping from wizard type selection to CreateBody.mode

- Date raised: 2026-05-29 (Stage 39 prep — T2-tightened)
- Asked of: self (T2 self-resolve)
- Source: `15-assignment-engine.html` type keys (`practice`, `diagnostic`, `exam`, `skill`); `assignments-svc/handlers.ts:CreateBody.mode` (string, no enum constraint); SCREEN_SPECS §22 `content_type: skill_based | blueprint_based`
- Question: Do mockup type keys map 1:1 to CreateBody.mode, or must they be translated to SCREEN_SPECS content_type enum values?
- Why ambiguous: Mockup and SCREEN_SPECS use different vocabularies for assignment type.
- Blocking? no
- Assumed answer: Use mockup type keys directly as mode values. Server accepts any string.
- Code affected: `apps/web/src/app/(teacher)/teacher/assignments/new/page.tsx` (Type step), `packages/sdk/src/hooks/assignments.ts` (useCreateAssignment)
- Status: resolved
- Resolution: Mockup type keys (practice, diagnostic, exam, skill) used directly as CreateBody.mode. assignments-svc parseCreateBody accepts any string; no enum validation. blueprint_based content type (SCREEN_SPECS) deferred v1.1 — no blueprint list endpoint exists; "Blueprint-based" type card not rendered (removed from wizard scope, not disabled, since it has no DB-backed path at all in v1). 2026-05-29.

---

### Q-39.5 — pathway_id source for createAssignment (DraftAssignmentDTO missing the field)

- Date raised: 2026-05-29 (Stage 39 prep — T2-tightened, mid-read)
- Asked of: self (T2 self-resolve)
- Source: `assignments-svc/handlers.ts:CreateBody` (`pathway_id: string` required UUID FK → `pathway(id)`); `analytics-svc/handlers.ts:734` `DraftAssignmentDTO` (no pathway_id field); `packages/types/src/content.ts:4` `PathwayDTOSchema` (no id field); `supabase/functions/content-svc/handlers.ts:121` (`SELECT 'id, slug, ...'` — server already emits id)
- Question: How does the wizard obtain a pathway UUID for createAssignment? DraftAssignmentDTO doesn't include it, and PathwayDTOSchema doesn't expose the UUID.
- Why ambiguous: pathway.id is in the DB and returned by content-svc but stripped by the Zod schema client-side. DraftAssignmentDTO returned by generateAssignment also omits it.
- Blocking? yes — without pathway_id, createAssignment call fails with 400
- Assumed answer: Add id: z.string().uuid() to PathwayDTOSchema (additive; no server change). Wizard uses usePathways().data[0].id.
- Code affected: `packages/types/src/content.ts` (PathwayDTOSchema), `apps/web/src/app/(teacher)/teacher/assignments/new/page.tsx`
- Status: resolved
- Resolution: Add `id: z.string().uuid()` to PathwayDTOSchema in packages/types/src/content.ts. Content-svc listPathways already selects id (handlers.ts:121); Zod just strips it today. Additive change — no existing consumers break. Wizard calls usePathways(), selects first active pathway (NAPLAN in v1), and passes pathway.id to createAssignment. Committed in the same Stage 39 implementation commit as SDK hooks (D1 before D3 per T2-tightened sequence). 2026-05-29.

---

### Q-39.4 — Publish/archive endpoints: return shape and status code

- Date raised: 2026-05-29 (Stage 39 prep — T2-tightened)
- Asked of: self (T2 self-resolve)
- Source: `assignments-svc/handlers.ts:513` (publishAssignment), `assignments-svc/handlers.ts:607` (archiveAssignment), `assignments-svc/index.ts:209` (dispatcher)
- Question: Do publish and archive return updated AssignmentDTO or 204? Status 200 or 201?
- Why ambiguous: Publish is creation-adjacent (materialises assignment_sessions) so 201 might be expected; but the endpoint mutates an existing resource.
- Blocking? no
- Assumed answer: Both return updated AssignmentDTO, status 200.
- Code affected: `packages/sdk/src/hooks/assignments.ts` (usePublishAssignment, useArchiveAssignment)
- Status: resolved
- Resolution: publishAssignment → status 200, returns updated AssignmentDTO (handlers.ts:600, jsonOk(result.data, traceId, 200)). archiveAssignment → status 200, returns updated AssignmentDTO (handlers.ts:636). SDK hooks type both responses as AssignmentDTO. 2026-05-29.

---

### Q-39.3 — assignment_target shape for single-student, class-wide, and at-risk modes

- Date raised: 2026-05-29 (Stage 39 prep — T2-tightened)
- Asked of: self (T2 self-resolve)
- Source: `assignments-svc/handlers.ts:253` `CreateBody.targets: Array<{type:'student'|'class', id:string}>`; SCREEN_SPECS §22 Target step (single student / multiple students / class)
- Question: How do the three wizard "Assign To" modes map to CreateBody.targets? Does at-risk mode have a data source?
- Why ambiguous: At-risk students require a student UUID list; no dedicated at-risk endpoint is consumed in Stage 39.
- Blocking? no
- Assumed answer: Class → [{type:'class', id:classId}]; single student → [{type:'student', id:studentId}]; at-risk → multiple {type:'student'} entries from existing data, fallback to class.
- Code affected: `apps/web/src/app/(teacher)/teacher/assignments/new/page.tsx` (Target step submit logic)
- Status: resolved
- Resolution: "Entire Class" → targets=[{type:'class', id:classId}]. "Custom Selection / ?target_student=" → targets=[{type:'student', id:targetStudentId}]. "At-Risk Students" → up to 3 student UUIDs from useTeacherRefresh intervention_alerts data (student_id field); if useTeacherRefresh data unavailable or empty at-risk list, falls back to class target with a UI note "Defaulting to entire class — no at-risk data available." CreateBody.targets supports all three; handler expands class targets to student_ids at publish time. 2026-05-29.

---

### Q-39.2 — Role gate for createAssignment in Stage 39 teacher UI context

- Date raised: 2026-05-29 (Stage 39 prep — T2-tightened)
- Asked of: self (T2 self-resolve)
- Source: `assignments-svc/handlers.ts:162` `isTeacherOrAdmin = teacher | tutor | org_admin | platform_admin`; Stage 39 UI is teacher-only route
- Question: Does Stage 39 change the role gate for assignment creation, or use the Stage 33 pattern unchanged?
- Why ambiguous: Stage 39 adds teacher UI — could the gate need to be teacher-only (not tutor/admin)?
- Blocking? no
- Assumed answer: Stage 33 gate unchanged.
- Code affected: No backend change; UI route guard is `authenticated teacher` per SCREEN_SPECS §22
- Status: resolved
- Resolution: Stage 33 isTeacherOrAdmin gate unchanged. Teacher UI route guard (Next.js middleware) prevents non-teacher access at the page level. Backend handler accepts teacher | tutor | org_admin | platform_admin — this is correct for v1 (tutors and admins can also create assignments). No backend change. 2026-05-29.

---

### Q-39.1 — Idempotency-Key reintroduction scope: client-side send vs full server enforcement

- Date raised: 2026-05-29 (Stage 39 prep — T2-tightened per ISSUE-0023 and DEV-20260523-1)
- Asked of: self (T2 self-resolve)
- Source: ISSUE-0023; DEV-20260523-1; `assignments-svc/handlers.ts:301` (parse+log only); SCREEN_SPECS §22 "POST /assignments (draft; idempotency-keyed)"
- Question: Does Stage 39 reintroduce server-side Idempotency-Key enforcement, or only the client-send side?
- Why ambiguous: ISSUE-0023 deferred full enforcement to v1.1. Stage 39 is the first UI stage that creates assignments — natural reintroduction point.
- Blocking? no
- Assumed answer: Client sends header; server stays log-only. Full enforcement v1.1.
- Code affected: `packages/sdk/src/hooks/assignments.ts` (useCreateAssignment, usePublishAssignment mutations)
- Status: resolved
- Resolution: SDK useCreateAssignment and usePublishAssignment mutations send `Idempotency-Key: crypto.randomUUID()` with each request. Server already accepts and logs the header (DEV-20260523-1 inline comment at handlers.ts:301). No backend change. Full server-side dedup (Option B — idempotency_key column + UNIQUE constraint) stays ISSUE-0023 v1.1. This closes the "client sends required header" compliance gap per arch §4.8 without expanding Stage 39 budget. 2026-05-29.

---

### Q-38.UI-5 — SkillBar primitive layout: vertical (current) vs horizontal (mockup)

- Date raised: 2026-05-28 (Stage 38 prep — T5 layout sketch)
- Asked of: self (T5 operator decision)
- Source: docs/mockups/13-teacher-student-detail.html `.skill-row` (label 180px | bar flex-1 | pct 36px inline); `packages/ui/src/SkillBar/SkillBar.tsx` (vertical stacked layout)
- Question: Stage 38 mockup uses horizontal inline layout for skill rows. SkillBar primitive uses vertical (label+pct above, bar below). Use existing primitive or add horizontal variant?
- Why ambiguous: Changing SkillBar layout globally could break Stage 36 parent dashboard and Stage 37 teacher page uses.
- Blocking? no — T5 approval point, non-blocking to other work
- Assumed answer: Option B — add `layout?: 'vertical' | 'horizontal'` prop to SkillBar (default `'vertical'`). Additive, no regressions.
- Code affected: `packages/ui/src/SkillBar/SkillBar.tsx`, `packages/ui/src/SkillBar/SkillBar.test.tsx`, `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`
- Status: resolved
- Resolution: Option B — horizontal variant prop added to SkillBar; default remains `'vertical'` so no existing call sites break. Stage 38 student detail uses `layout="horizontal"`. 1 new Storybook story + jest-axe scan. 2026-05-28.

---

### Q-38.UI-4 — "Message Parent" button: omit or disabled with tooltip

- Date raised: 2026-05-28 (Stage 38 prep — T5 layout sketch)
- Asked of: self (T5 operator decision)
- Source: docs/mockups/13-teacher-student-detail.html action cluster; SCREEN_SPECS §20 "Out of scope for v1: Chat with parent from this page"
- Question: Mockup renders a "Message Parent" secondary button. SCREEN_SPECS §20 explicitly lists "Chat with parent from this page" as out of scope for v1. Omit entirely or render disabled with tooltip?
- Why ambiguous: Disabled state preserves mockup fidelity but communicates v1.1 intent; omission is cleaner.
- Blocking? no
- Assumed answer: Omit entirely. SCREEN_SPECS is authoritative over mockup; rendering a disabled button for a feature the user cannot discover is dead UI.
- Code affected: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`
- Status: resolved
- Resolution: Omit entirely. Not rendered. Zero `Message Parent` grep hits in student detail page required at close. 2026-05-28.

---

### Q-38.UI-3 — Hero inline stats: sessions count + streak scope

- Date raised: 2026-05-28 (Stage 38 prep — T5 layout sketch)
- Asked of: self (T5 operator decision)
- Source: docs/mockups/13-teacher-student-detail.html hero section ("42 sessions completed · 7 day streak · Last active Today, 8:52 am"); SCREEN_SPECS §20 header block ("student name + avatar + meta: class, year level, last active")
- Question: Mockup shows sessions count and streak in the hero. Neither field is in any existing DTO. SCREEN_SPECS header definition does not list them. Show only what the spec defines or add fields to the Q-38.2 endpoint?
- Why ambiguous: Mockup vs SCREEN_SPECS diverge on the hero fields.
- Blocking? no
- Assumed answer: Omit sessions count and streak. SCREEN_SPECS §20 is authoritative: header = name + avatar + class + year_level + last_active. The Q-38.2 endpoint (`GET /users/students/{id}`) returns `{display_name, year_level, class_name, last_session_at, avg_score}` — no sessions count or streak fields added.
- Code affected: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`; `supabase/functions/users-svc/handlers.ts`
- Status: resolved
- Resolution: Omit sessions count and streak. Hero shows display_name + year_level + class_name + formatted last_active only. 2026-05-28.

---

### Q-38.UI-2 — Pathway tabs behavior: NAPLAN/ICAS/Selective data filtering

- Date raised: 2026-05-28 (Stage 38 prep — T5 layout sketch)
- Asked of: self (T5 operator decision)
- Source: SCREEN_SPECS §20 block 2 ("Pathway tabs — NAPLAN / ICAS / Selective; entitled ones only; Selective deferred → stub tab"); `LearningDNADTOSchema` `domain_profiles: Record<strandName, {...}>` (no per-pathway breakdown)
- Question: `domain_profiles` keys are strand names (e.g., "Numeracy"), not pathway slugs. NAPLAN and ICAS tabs would show identical data — there is no per-pathway strand filter in v1. Show both tabs with same data (honest but redundant) or hide ICAS/Selective?
- Why ambiguous: SCREEN_SPECS says "pathway tabs" implying filtering; but no pathway→strand mapping DTO exists yet.
- Blocking? yes — affects tab component and ISSUE filing
- Assumed answer: Option C (revised from morning ritual proposed defaults). NAPLAN tab visible + active (shows all domain_profiles strand bars). ICAS and Selective tabs hidden (not rendered) in v1. v1.1 unhides when a pathway→strand mapping DTO or endpoint exists. File ISSUE-0030.
- Code affected: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`
- Status: resolved
- Resolution: Option C — NAPLAN tab only rendered; ICAS + Selective hidden. `// ISSUE-0030` comment at tab site. 2026-05-28.

---

### Q-38.UI-1 — Stat tiles: substitute unavailable metrics

- Date raised: 2026-05-28 (Stage 38 prep — T5 layout sketch)
- Asked of: self (T5 operator decision)
- Source: docs/mockups/13-teacher-student-detail.html stat tiles (Overall Score | Assignments | Time Spent | Questions Done); available DTOs from T1 pre-read
- Question: "Time Spent" and "Questions Done" have no DTO source in any existing endpoint. Substitute or omit tiles?
- Why ambiguous: Mockup shows 4 tiles; spec doesn't enumerate stat tile fields explicitly.
- Blocking? no
- Assumed answer: Substitute tile 3 with "Strand Mastery" (count of domain_profiles entries with mastery ≥ 0.6 / total, from LearningDNADTO); tile 4 with "Misconceptions" (active_misconceptions.length from LearningDNADTO). Overall Score from useStudentProfile avg_score. Assignments from counts over StudentAssignmentDTO[].
- Code affected: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`
- Status: resolved
- Resolution: Substitution confirmed. Tiles: Overall Score | Assignments (completed/total) | Strand Mastery | Misconceptions. 2026-05-28.

---

### Q-38.5 — Flag for Review: POST /analytics/intervention-alerts endpoint absent

- Date raised: 2026-05-28 (Stage 38 prep — T3 round-trip, scope)
- Asked of: self (T3 self-resolve)
- Source: SCREEN_SPECS §20 Actions table — "Flag for Review → Confirmation → `POST /analytics/intervention-alerts` with manual reason"; analytics-svc index.ts (GET + PATCH routes only; no POST)
- Question: POST /analytics/intervention-alerts (manual teacher-triggered alert creation) does not exist. Add backend or stub button?
- Why ambiguous: DEV_PLAN deliverables say "action buttons (assign, view plan)" — does not explicitly list Flag for Review. But SCREEN_SPECS §20 specifies it as a v1 action with a concrete endpoint.
- Blocking? yes for Flag for Review button functionality
- Assumed answer: Option A — add `POST /analytics/intervention-alerts` handler in analytics-svc with body `{student_id, class_id, reason}`; teacher ownership via class_group join (class_id in body); writes intervention_alert row with `alert_type='manual'`, `status='active'`. Stub-dialog (Option B) is misleading UX — shows a dialog that does nothing.
- Code affected: `supabase/functions/analytics-svc/handlers.ts`, `supabase/functions/analytics-svc/index.ts`, `supabase/functions/analytics-svc/__tests__/contract.test.ts`
- Status: resolved
- Resolution: Option A — new POST handler added. 2 contract tests (happy + teacher-class-ownership 403). 2026-05-28.

---

### Q-38.4 — DEV_PLAN Stage 38 path typo: missing /teacher/ segment

- Date raised: 2026-05-28 (Stage 38 prep — T1 pre-read discovery)
- Asked of: self (T3 self-resolve)
- Source: DEV_PLAN.md line 355 — `apps/web/src/app/(teacher)/students/[id]/page.tsx`; Stage 37 precedent `apps/web/src/app/(teacher)/teacher/students/page.tsx`
- Question: DEV_PLAN Stage 38 deliverables path is missing the `/teacher/` segment inside the `(teacher)` routing group. Is the plan typo'd or is Stage 38 intentionally at a different path?
- Why ambiguous: One-off typo vs intentional flattening of the route hierarchy.
- Blocking? no — self-resolve
- Assumed answer: DEV_PLAN typo. Correct path per routing group and Stage 37 precedent is `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`. Screen 20 URL `/teacher/students/[id]` requires Next.js route `(teacher)/teacher/students/[id]/page.tsx`.
- Code affected: `DEV_PLAN.md` (path corrected in this commit)
- Status: resolved
- Resolution: Path corrected in DEV_PLAN.md Stage 38 entry. Stage 38 implementation target: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`. 2026-05-28.

---

### Q-38.2 — No GET /users/{student_id} endpoint for student profile header

- Date raised: 2026-05-28 (Stage 38 prep — T3 round-trip, schema/scope)
- Asked of: self (T3 self-resolve)
- Source: SCREEN_SPECS §20 API calls — `GET /users/{student_id}` (basic profile); users-svc handlers.ts (only `handleGetMyClasses` + `handleGetClassStudents` exist)
- Question: users-svc has no endpoint for fetching an individual student's profile. How does the student detail page header get display_name, year_level, class_name, last_active?
- Why ambiguous: Could pass data from list page via URL search params (brittle; fails on direct link), or add a new endpoint.
- Blocking? yes for hero header data
- Assumed answer: Option A lite — add `GET /users-svc/users/students/{student_id}` returning `{display_name, year_level, class_name, last_session_at, avg_score}`. Teacher auth: verify student is in one of teacher's classes via class_student + class_group join (Stage 37 handler pattern). New SDK hook `useStudentProfile(studentId)`. New mmKey `users.student(id)`.
- Code affected: `supabase/functions/users-svc/handlers.ts`, `supabase/functions/users-svc/index.ts`, `supabase/functions/users-svc/__tests__/contract.test.ts`, `packages/sdk/src/hooks/identity.ts`, `packages/sdk/src/keys.ts`
- Status: resolved
- Resolution: Option A lite — `handleGetStudentProfile` added to users-svc. Returns `{display_name, year_level, class_name, last_session_at, avg_score}`. 2 contract tests (happy + ownership 403). 2026-05-28.

---

### Q-38.6 — alert_type enum missing 'manual' value

- Date raised: 2026-05-11 (Stage 38 implementation — T2-tightened blocker before analytics-svc handler code)
- Asked of: self (T2-tightened — filed before writing handler)
- Source: migration 0001_enums_tenancy_auth.sql:101-104 — `alert_type` enum values: `{declining_performance, persistent_misconception, high_fatigue, low_persistence, repair_failure, exceptional_progress}`. Q-38.5 requires inserting `alert_type='manual'`.
- Question: `alert_type` enum does not include `'manual'`. POST /analytics/intervention-alerts (Q-38.5 Option A) needs to insert `alert_type='manual'`. Add migration or use different field?
- Why ambiguous: Enum add is non-transactional in PG 12+; requires standalone migration.
- Blocking? yes — INSERT would throw Postgres enum violation without migration.
- Assumed answer: Option A — create migration 0017 with `ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'manual'`.
- Code affected: `supabase/migrations/0017_alert_type_manual.sql` (new), `supabase/functions/analytics-svc/handlers.ts`
- Status: resolved
- Resolution: Option A — migration 0017 created before any analytics-svc handler code written. 2026-05-11.

---

### Q-38.1 — No teacher-addressable GET /sessions/recent endpoint

- Date raised: 2026-05-28 (Stage 38 prep — T3 round-trip, scope)
- Asked of: self (T3 self-resolve)
- Source: SCREEN_SPECS §20 API calls — `GET /sessions/recent?student_id={id}&limit=10`; assessment-svc index.ts:346 — `listRecentSessions(handlerClient, userId, limit)` (userId hardcoded from JWT; no student_id query param)
- Question: assessment-svc GET /sessions/recent uses the authenticated user's ID from JWT. A teacher calling this gets their own sessions. SCREEN_SPECS §20 requires recent sessions for an arbitrary student. Add student_id query param or defer Recent Activity block?
- Why ambiguous: Scope/budget tradeoff.
- Blocking? yes for Recent Activity block (SCREEN_SPECS §20 block 6)
- Assumed answer: Option A — extend assessment-svc `GET /sessions/recent` to accept `?student_id=` query param. If present and caller is teacher/admin, use `student_id` instead of `userId`. Mirror parent's `useChildRecentSessions` pattern from Stage 36. New SDK hook `useTeacherRecentSessions(studentId)`. New mmKey `sessions.teacherRecent(studentId)`.
- Code affected: `supabase/functions/assessment-svc/handlers.ts`, `supabase/functions/assessment-svc/index.ts`, `packages/sdk/src/hooks/session.ts`, `packages/sdk/src/keys.ts`
- Status: resolved
- Resolution: Option A — `listRecentSessions` extended with optional `targetStudentId` param; teacher/admin role check gates cross-student access. New SDK hook `useTeacherRecentSessions(studentId)`. 2 contract tests (happy + teacher-role gate). 2026-05-28.

---

### Q-37.7 — PATCH intervention-alerts ownership: join via class_group vs direct teacher_id column

- Date raised: 2026-05-27 (Stage 37 implementation — T2-tightened: filed during handler coding)
- Asked of: self (T3 self-resolve)
- Source: C-C-D-V Constraint §PATCH endpoint role ownership: "alert.class_id must belong to caller (verify against class_group.teacher_id = caller.userId)"; migration 0005 (`intervention_alert` schema)
- Question: The C-C-D-V specified ownership via a join: `alert.class_id → class_group.teacher_id = caller.userId`. But T1 pre-read of migration 0005 reveals `intervention_alert.teacher_id NOT NULL` is a direct column on the row, and `class_id` is NULLABLE (ON DELETE SET NULL). Which ownership check is correct?
- Why ambiguous: The C-C-D-V join path (`class_id → class_group`) would fail for any alert where `class_id` is NULL (deleted class). The direct `teacher_id` column is non-nullable and is the authoritative ownership field.
- Blocking? no — T3 self-resolve permitted
- Assumed answer: Option A — use `alert.teacher_id === caller.userId` directly. Simpler, more authoritative, handles NULL class_id. The C-C-D-V join was written without knowledge of the NULLABLE class_id; the direct teacher_id is the correct authority per migration 0005.
- Code affected: `supabase/functions/analytics-svc/handlers.ts` — `patchInterventionAlert`
- Status: resolved
- Resolution: Option A — direct `alert.teacher_id === caller.userId` ownership check. 2026-05-27.

---

### Q-37.6 — Block 5 Topic Mastery Bars (Screen 18): class-strand-mastery data source absent

- Date raised: 2026-05-27 (Stage 37 prep — T2-tightened: filed before any handler/component code)
- Asked of: self (T3 round-trip discharged)
- Source: SCREEN_SPECS Screen 18 Block 5; analytics-svc handlers.ts (getAutoGroups returns clustering, not mastery)
- Question: Can Stage 37 deliver Block 5 "Topic mastery bars — class-wide per strand" given no class-strand-mastery aggregation endpoint exists?
- Why ambiguous: `GET /analytics/auto-groups` returns k-means clustering groups keyed on `class:{class_id}:{skill_id}` — not per-strand mastery averages. Block 5 requires a distinct aggregation query. Building a new endpoint was borderline given 2-day budget + four other missing endpoints.
- Blocking? yes (Block 5 cannot render without data)
- Assumed answer: Defer Block 5 to v1.1. Ship placeholder card ("Topic mastery breakdown — available in a future release") in the Block 5 slot. File ISSUE-0027. ISSUE-0021 carry-forward annotated: next auto-groups consumer = v1.1 Block 5.
- Code affected: `apps/web/src/app/(teacher)/teacher/page.tsx` (placeholder), `supabase/functions/analytics-svc/` (new endpoint in v1.1)
- Status: resolved
- Resolution: Block 5 deferred to v1.1 (ISSUE-0027). Placeholder card ships in Stage 37. 2026-05-27.

---

### Q-37.5 — Class KPI endpoint: Block 2 data source for Screen 18

- Date raised: 2026-05-27 (Stage 37 morning ritual — T3 round-trip)
- Asked of: self (T3 round-trip discharged)
- Source: SCREEN_SPECS Screen 18 Block 2; analytics-svc handlers.ts getCohort (reads auto-groups, not KPIs)
- Question: What provides the four Block 2 stat tiles — Active students / Avg class score / Sessions this week / Assignments active — for Screen 18?
- Why ambiguous: SCREEN_SPECS Screen 18 API call `GET /analytics/cohort/{class_id}` implies a class-level KPI endpoint. Existing `getCohort` takes a composite group_id (`class:{class_id}:{skill_id}`) and returns auto-groups clustering data, not class KPIs. No existing endpoint aggregates the four required stats.
- Blocking? yes (Block 2 is the first visible content strip on the teacher dashboard)
- Assumed answer: Option A — add new `GET /analytics/class-kpi/{class_id}` endpoint to analytics-svc. Server-side aggregation: `active_students` = COUNT(class_student WHERE class_id=$1); `avg_class_score` = AVG of last 5 session raw_scores per student, averaged across class (skip students with 0 sessions); `sessions_this_week` = COUNT(session) joined via class_student WHERE created_at > now() - interval '7 days'; `assignments_active` = COUNT(assignment) joined via assignment_target WHERE class_id=$1 AND status='published' AND archived_at IS NULL. Returns `{ active_students, avg_class_score, sessions_this_week, assignments_active, computed_at, stale_since }`. SDK hook: `useClassKpi(classId)`. mmKeys.analytics.classKpi namespace added.
- Code affected: `supabase/functions/analytics-svc/handlers.ts`, `supabase/functions/analytics-svc/index.ts`, `packages/sdk/src/hooks/analytics.ts`, `packages/sdk/src/keys.ts`
- Status: resolved
- Resolution: Option A — new GET /analytics/class-kpi/{class_id} endpoint in analytics-svc. 2026-05-27.

---

### Q-37.4 — Assignment completion progress visual in assignments widget

- Date raised: 2026-05-27 (Stage 37 morning ritual — T3 self-resolve)
- Asked of: self
- Source: SCREEN_SPECS Screen 18 Block 6 ("assignments widget — active assignments list with completion %")
- Question: Which visual to use for completion % in the assignments widget — ProgressBar, pie, or number-only?
- Why ambiguous: Multiple options available in @mm/ui; screen spec says "completion %" without specifying visual type.
- Blocking? no
- Assumed answer: `ProgressBar` primitive from `@mm/ui` (exists, tested). Alongside numeric label (e.g., "7 / 10 students"). Consistent with completion patterns in other screens.
- Code affected: `apps/web/src/app/(teacher)/teacher/page.tsx` (Block 6 AssignmentsWidget component)
- Status: resolved
- Resolution: ProgressBar + numeric label. 2026-05-27.

---

### Q-37.3 — Trend sparkline in Screen 18 student performance table

- Date raised: 2026-05-27 (Stage 37 morning ritual — T3 self-resolve)
- Asked of: self
- Source: SCREEN_SPECS Screen 18 Block 4 ("trend sparkline")
- Question: How to implement the trend sparkline column in the student performance table given no sparkline primitive exists in @mm/ui?
- Why ambiguous: Adding charting dependency for one column exceeds budget; screen spec calls for sparkline but no @mm/ui primitive exists.
- Blocking? no
- Assumed answer: Omit sparkline for v1. Show static last-score value in the trend column slot. File ISSUE-0028. Add `{/* TODO: ISSUE-0028: trend sparkline — v1.1 */}` comment in column header slot.
- Code affected: `apps/web/src/app/(teacher)/teacher/page.tsx` (Block 4 table)
- Status: resolved
- Resolution: Static last-score value in trend column; ISSUE-0028 filed for v1.1 sparkline primitive. 2026-05-27.

---

### Q-37.2 — UI-discipline canonisation: create docs/dev/ui-discipline.md in Stage 37 or defer?

- Date raised: 2026-05-27 (Stage 37 morning ritual — T3 self-resolve)
- Asked of: self
- Source: CLAUDE.md decision-recording rule; absence of ui-discipline.md confirmed by glob
- Question: Should Stage 37 canonise the dashboard-page architecture pattern (block components, 'use client' pages, server layout guards, Vitest + jest-axe testing) into docs/dev/ui-discipline.md?
- Why ambiguous: Two stages of evidence (Stage 36 + Stages 22b–25) — pattern is stable but Stage 37 has significant backend scope (4 missing endpoints).
- Blocking? no
- Assumed answer: Defer to Stage 41 (Phase 2 Exit Review audit day). Spending Stage 37 budget on meta-documentation when 4 backend endpoints + 2 pages are outstanding inverts priorities. Stage 41 is the natural audit moment with full Phase 2 UI evidence.
- Code affected: `docs/dev/ui-discipline.md` (to be created at Stage 41)
- Status: resolved
- Resolution: Deferred to Stage 41. 2026-05-27.

---

### Q-37.1 — GET /analytics/auto-groups route shape: three-way conflict resolution

- Date raised: 2026-05-27 (Stage 37 morning ritual — T3 self-resolve REVISED)
- Asked of: self
- Source: ISSUE-0021; DEV-20260522-1; SCREEN_SPECS Screen 18 API calls; analytics-svc/index.ts:61–93
- Question: Which shape should GET /analytics/auto-groups use for Stage 37 teacher dashboard? Three irreconcilable specs: (a) current impl = query params `?class_id=&skill_id=`; (b) arch §4.7 = path params `/{class_id}/{skill_id}`; (c) SCREEN_SPECS Screen 18 = path param `/{class_id}` only.
- Why ambiguous: Q-37.6 changed the frame — Block 5 (Topic Mastery) is the only Screen 18 block that was going to consume auto-groups data. With Block 5 deferred to v1.1, Stage 37 has NO auto-groups consumer. The shape conflict is real but irrelevant to Stage 37 delivery.
- Blocking? no (consumer deferred)
- Assumed answer: Self-resolve. Stage 37 does NOT consume GET /analytics/auto-groups. ISSUE-0021 + DEV-20260522-1 carry forward unchanged. Next consumer = v1.1 Block 5; shape decision belongs to that stage's T3 Q&A. No analytics-svc auto-groups route changes in Stage 37.
- Code affected: none (no auto-groups changes in Stage 37)
- Status: resolved
- Resolution: Stage 37 confirmed non-consumer of auto-groups (Block 5 deferred per Q-37.6). ISSUE-0021 carries forward to v1.1. 2026-05-27.

---

### Q-36.8 — apps/web jest-axe test infrastructure absent

- Date raised: 2026-05-26 (Stage 36 implementation T1 reads — T2-tightened: filed before component code)
- Asked of: self (T3 self-resolve)
- Source: C-C-D-V Deliverable 9 — `apps/web/src/app/(parent)/parent/page.test.tsx` jest-axe route scan; packages/ui/vitest.config.ts (environment: 'jsdom', setupFiles, jest-axe devDeps) vs apps/web/vitest.config.ts (no jsdom, no setupFiles)
- Question: `apps/web` has no `@testing-library/react`, `jest-axe`, or `jsdom` configured. A DOM-render axe test in `apps/web/src/app/(parent)/parent/page.test.tsx` would fail at import resolution. Do we (A) add jsdom + testing-library + jest-axe to apps/web devDeps, or (B) rely on packages/ui tests for new primitives + packages/core tests for explain-format, matching actual Stage 22b–25 precedent?
- Why ambiguous: C-C-D-V specified an apps/web page test; actual prior stages (22b–25) never created one — axe always ran in packages/ui for primitives, not the full rendered page.
- Blocking? no — tight implementation detail; T3 self-resolve permitted
- Assumed answer (if proceeding): Option B — axe tests in packages/ui + packages/core only
- Code affected: `packages/ui/src/ReadinessRing/ReadinessRing.test.tsx`, `packages/core/src/explain-format.test.ts`
- Status: resolved
- Resolution (2026-05-26, T3 self-resolve): **Option B.** Axe tests in `packages/ui` (ReadinessRing.test.tsx — 4 tests: axe + 3 prop contract) and `packages/core` (explain-format.test.ts — ≥3 tests: one per severity tier). Matches actual Stage 22b–25 pattern — no apps/web DOM test existed in any prior UI stage. Total new test count: ≥7, giving 516 + 7 = 523+ (above 520 floor).

### Q-36.7 — No copy.ts convention in apps/web

- Date raised: 2026-05-26 (Stage 36 implementation T1 reads — T2-tightened: filed before component code)
- Asked of: self (T3 self-resolve)
- Source: C-C-D-V Constraint 12 "All microcopy via copy.ts"; apps/web/src/ directory (no copy.ts found); student dashboard page.tsx (inline strings throughout)
- Question: C-C-D-V said "all copy via copy.ts" but no copy.ts file exists in apps/web/src. Student dashboard uses inline strings directly. Create copy.ts for parent dashboard, or follow established inline string pattern?
- Why ambiguous: C-C-D-V constraint was aspirational; actual codebase pattern is inline strings. Adding copy.ts would introduce a new convention not present in any prior stage.
- Blocking? no — tight implementation detail; T3 self-resolve permitted
- Assumed answer (if proceeding): Inline strings following student dashboard pattern
- Code affected: `apps/web/src/app/(parent)/parent/page.tsx`
- Status: resolved
- Resolution (2026-05-26, T3 self-resolve): **Inline strings.** No copy.ts created. Student dashboard page.tsx is the authoritative style guide — inline strings throughout, no abstraction layer. Adding copy.ts would be a new convention the codebase doesn't support yet and is out of Stage 36 budget.

### Q-36.6 — buildExplanationCards input field: misconception_id vs id

- Date raised: 2026-05-26 (Stage 36 implementation T1 reads — T2-tightened: filed before component code)
- Asked of: self (T3 self-resolve)
- Source: C-C-D-V "buildExplanationCards() takes CausalMapDTO.active_misconceptions[] ... input: { id, name, confidence, severity }"; CausalMapDTOSchema at packages/types/src/intelligence.ts:66 — field is `misconception_id` not `id`
- Question: C-C-D-V specified input shape `{ id, name, confidence, severity }`. Actual `CausalMapDTOSchema.active_misconceptions` has `{ misconception_id, name, category, confidence, severity, affected_skill_count }`. Should the input type use `misconception_id` (matching actual schema), and should `ExplanationCard.id` map from `misconception_id`?
- Why ambiguous: C-C-D-V used `id` based on LearningDNADTO.active_misconceptions shape; CausalMapDTO uses `misconception_id`. Both DTOs have an active_misconceptions array but with different field names.
- Blocking? no — tight implementation detail; T3 self-resolve permitted
- Assumed answer (if proceeding): Use CausalMapDTOSchema shape exactly — `misconception_id`, map to ExplanationCard.id
- Code affected: `packages/core/src/explain-format.ts`
- Status: resolved
- Resolution (2026-05-26, T3 self-resolve): **Use `misconception_id`.** `buildExplanationCards` input type uses `CausalMapDTOSchema.active_misconceptions` exact shape: `{ misconception_id: string; name: string; category: string; confidence: number; severity: string; affected_skill_count: number }`. `ExplanationCard.id = misconception_id`. Extra fields (`category`, `affected_skill_count`) accepted but not used in copy templates.

### Q-36.5 — ChildSwitcher placement in TopBar

- Date raised: 2026-05-26 (Stage 36 prep — T2-tightened: filed before component code)
- Asked of: self (T3 self-resolve)
- Source: SCREEN_SPECS §15.1 — "dropdown in top nav (if >1 child linked)"
- Question: Does `AppShell student-parent` variant `TopBar` have a dedicated slot for a child switcher, or must it be composed as a sibling child alongside `Brand`?
- Why ambiguous: Prior stub uses `<TopBar><Brand .../></TopBar>` pattern; TopBar API not verified to have a named prop for switcher placement vs generic children composition.
- Blocking? no — tight implementation detail; T3 self-resolve permitted
- Assumed answer (if proceeding): Compose as TopBar sibling to Brand. Radix Select. Hide when `children.length ≤ 1`. `localStorage('lastViewedChildId')`.
- Code affected: `apps/web/src/app/(parent)/parent/page.tsx`, new `ChildSwitcher` component
- Status: resolved
- Resolution (2026-05-26, T3 self-resolve): **Compose as TopBar sibling to Brand.** Pattern consistent with Stage 24/25 TopBar usage where multiple children are passed. No TopBar API changes needed. `localStorage('lastViewedChildId')` key pinned.

### Q-36.4 — ReadinessRing: existing @mm/ui primitive or new creation?

- Date raised: 2026-05-26 (Stage 36 prep — T2-tightened: filed before component code)
- Asked of: self (T3 self-resolve)
- Source: SCREEN_SPECS §15.2 — "readiness ring (composite of mastery across strands) + score band"
- Question: Does an existing `@mm/ui` circular/donut progress primitive cover SCREEN_SPECS §15.2, or must a new one be created?
- Why ambiguous: `@mm/ui` exports include `ProgressBar`, `SkillBar`, `StatTile` but no circular SVG ring component was confirmed in the pre-read of `packages/ui/src/index.ts`.
- Blocking? no — tight implementation detail; T3 self-resolve permitted
- Assumed answer (if proceeding): New `ReadinessRing` SVG component. Props: `value: number` (0–1), `label: string`, `size?: 'sm' | 'md' | 'lg'`. Zero new deps. Storybook story + jest-axe scan included.
- Code affected: `packages/ui/src/ReadinessRing/ReadinessRing.tsx`, `ReadinessRing.stories.tsx`, `packages/ui/src/index.ts`
- Status: resolved
- Resolution (2026-05-26, T3 self-resolve): **Create `ReadinessRing` in packages/ui.** SVG `stroke-dasharray` approach. Props pinned: `value: number` (0–1), `label: string`, `size?: 'sm' | 'md' | 'lg'`. `role="img"` + `aria-label` for a11y. Storybook story + jest-axe scan required per UI_CONTRACT §13.1. No new package dependencies.

### Q-36.3 — ExplanationDTO vs ExplanationCard: type location + copy-builder API

- Date raised: 2026-05-26 (Stage 36 prep — T2-tightened: filed before component code)
- Asked of: product owner / architect (T3 round-trip)
- Source: DEV_PLAN Stage 36 line 341 — "composed from ExplanationDTO via `packages/core/src/explain-format.ts` versioned copy-builder"; SCREEN_SPECS §15.6 — "Observation → Interpretation → Suggestion structure"; arch §6.4 `ExplanationDTOSchema` (Stage 32, intelligence-svc API contract)
- Question: (1) Is `ExplanationDTO` from arch §6.4 (structured factors/evidence, API contract) the same entity as the UI card shape in SCREEN_SPECS §15.6, or are they distinct? (2) Where should the UI card type live: `@mm/types` or `packages/core`? (3) What is the copy-builder input: `LearningDNADTO.active_misconceptions[]` or `CausalMapDTO` from `/intelligence/causal-map/{id}`?
- Why ambiguous: DEV_PLAN uses "ExplanationDTO" loosely; arch §6.4 has a specific `ExplanationDTOSchema` (API contract). DEV_PLAN Stage 36 is the first use of `explain-format.ts` — no prior instance exists to reference.
- Blocking? yes — type location + function signature must be pinned before implementation; T3 round-trip required
- Assumed answer (if proceeding): Modified Option A — ExplanationCard in @mm/core (UI render concern, distinct from arch §6.4 ExplanationDTO)
- Code affected: `packages/core/src/explain-format.ts`, `packages/core/src/index.ts`
- Status: resolved
- Resolution (2026-05-26, T3 round-trip discharged): **Modified Option A.** `ExplanationDTO` in DEV_PLAN is loose terminology; arch §6.4 `ExplanationDTO` (structured factors/evidence) is the Stage 32 API contract, distinct from the SCREEN_SPECS §15.6 UI card shape. Stage 36 introduces `ExplanationCard { id: string; observation: string; interpretation: string; suggestion: string }` in `packages/core/src/explain-format.ts` (UI render concern, NOT `@mm/types`). `buildExplanationCards()` takes `CausalMapDTO.active_misconceptions[]` from Stage 32 (arch §6.4) as input. Versioned via `const EXPLANATION_FORMATTER_VERSION = 'v1'`. Copy templates tiered by severity (`high` / `medium` / `low`), pinned as const map. Test asserts each severity tier produces a non-empty card.

### Q-36.2 — LearningPlanDTO consumption in Stage 36

- Date raised: 2026-05-26 (Stage 36 prep — T2-tightened: filed before component code)
- Asked of: product owner / architect (T3 round-trip)
- Source: PROJECT_STATE.md "Notes for next session" pre-read recommendation; SCREEN_SPECS §15 API call list (5 calls listed, none to `/orchestration/plan/{id}/current`)
- Question: Is `LearningPlanDTO` (orchestration-svc `GET /orchestration/plan/{student_id}/current`) consumed in the Stage 36 parent dashboard? SCREEN_SPECS §15 lists 5 API calls with no orchestration plan endpoint. Does any of the 7 content blocks derive from the current learning plan rather than LearningDNADTO?
- Why ambiguous: PROJECT_STATE.md pre-read list cited orchestration-svc `/plan/current` as a required Stage 36 pre-read, but SCREEN_SPECS §15 API call list does not include it.
- Blocking? yes — determines whether a new SDK hook call + DTO consumption is required; T3 round-trip required
- Assumed answer (if proceeding): No LearningPlanDTO consumption
- Code affected: `apps/web/src/app/(parent)/parent/page.tsx`
- Status: resolved
- Resolution (2026-05-26, T3 round-trip discharged): **No LearningPlanDTO consumption in Stage 36.** SCREEN_SPECS §15 API call list is authoritative: 5 calls, none to `/orchestration/plan/current`. "What would help" cards derive from `LearningDNADTO.domain_profiles[strand].weakest_skills`. ISSUE-0026 (`useLearningPlan` path malformation) is a carry-forward bug, not a Stage 36 scope item.

### Q-36.1 — UI testing strategy for Stage 36 (first Phase 2 UI stage)

- Date raised: 2026-05-26 (Stage 36 prep — T2-tightened: filed before component code)
- Asked of: product owner / architect (T3 round-trip)
- Source: UI_CONTRACT §7.1 (axe-core zero serious/critical = merge blocker); UI_CONTRACT §13 (10-point DoD); DAILY_LOG Stage 13 (jest-axe CI gate established); DAILY_LOG Stages 22b–25 (Playwright test.skip() pattern established)
- Question: Does Stage 36 adopt the same testing strategy as Stages 22b–25 exactly, or is there additional per-route axe-core wiring / CI integration / Storybook test gating not previously established?
  - **(A)** Mirrors Stages 22b–25: (1) jest-axe at `@mm/ui` for new primitives + `apps/web` page test for parent dashboard route; (2) Playwright `test.skip()`-guarded on `E2E_WEB_URL` + `E2E_BASE_URL` + `E2E_SUPABASE_ANON`; (3) no new Storybook CI wiring.
  - **(B)** Additional `@axe-core/playwright` per-route wiring (deferred at Stage 23 per DAILY_LOG — was Stage 26 target).
- Why ambiguous: Stage 36 is the first Phase 2 UI stage — testing discipline pattern needs explicit pinning. Playwright CI integration was deferred at Stage 23 to Stage 26; Stage 26 entry may or may not have completed it.
- Blocking? yes — determines test surface and verification gate for Stage 36 ship; T3 round-trip required
- Assumed answer (if proceeding): Option A — mirrors Stages 22b–25
- Code affected: `apps/web/playwright/e2e/parent-dashboard.spec.ts`, `apps/web/src/app/(parent)/parent/page.test.tsx`, `packages/ui/src/ReadinessRing/ReadinessRing.test.tsx`
- Status: resolved
- Resolution (2026-05-26, T3 round-trip discharged): **Option A confirmed.** Testing strategy mirrors Stages 22b–25: jest-axe at `packages/ui` (new primitives) + `apps/web` page test (parent dashboard route); Playwright `test.skip()`-guarded on `E2E_WEB_URL` + `E2E_BASE_URL` + `E2E_SUPABASE_ANON`. No `@axe-core/playwright` route-level wiring, no new Storybook CI wiring. Canonisation of UI-stage discipline deferred to Stage 36 evening retro — pending Stage 36 ship as evidence base.

### Q-35.4 — override_plan_item HTTP status: 400 or 501?

- Date raised: 2026-05-25 (Stage 35 prep — T2-tightened: filed before handler code)
- Asked of: self (T3 self-resolve)
- Source: DEV_PLAN Stage 35 Deliverables — "`pin_skill` + `dismiss_recommendation` types only; `override_plan_item` deferred"
- Question: When a caller sends `type: 'override_plan_item'` to POST /orchestration/overrides, what HTTP status should the handler return?
  - **(A)** `400 BAD_REQUEST` with code `'UNSUPPORTED_TYPE'` and message `'override_plan_item deferred in v1; not yet supported.'` — correct because the *client* sent an unsupported value for this deployment.
  - **(B)** `501 NOT_IMPLEMENTED` — implies the server may implement it later.
- Why ambiguous: Both statuses are defensible for a deferred enum value. 400 treats it as an invalid input; 501 treats it as a known future capability.
- Blocking? no — tight implementation detail; T3 self-resolve permitted
- Assumed answer (if proceeding): **Option A** — 400 UNSUPPORTED_TYPE
- Code affected: `supabase/functions/orchestration-svc/handlers.ts` (createOverride type guard)
- Status: resolved
- Resolution (2026-05-25, T3 self-resolve — Option 3 hybrid): **Option A**. 400 with `{ error: 'UNSUPPORTED_TYPE', message: 'override_plan_item deferred in v1; not yet supported.' }`. Rationale: consistent with how other v1-deferred enum paths return 400 in the codebase; 501 implies future server intent, which is out of scope for a contract surface. Inline comment at guard site: `// DEV_PLAN Stage 35: override_plan_item deferred (Q-35.4)`.

### Q-35.3 — self-supersession: application-layer UPDATE or dual-INSERT?

- Date raised: 2026-05-25 (Stage 35 prep — T2-tightened: filed before handler code)
- Asked of: self (T3 self-resolve)
- Source: Spec §16.6.1 line 2510 — "Overrides of the same `type` + `target` replace each other — creating a new `pin_skill` for the same `skill_id` extends the expiry and updates priority rather than stacking."
- Question: No unique constraint exists on `plan_override` for `(student_id, type, target key)`. How to implement self-supersession without a DB-level guard?
  - **(A)** SELECT existing active override of same `(student_id, type, target deterministic key)` → if found, UPDATE `expires_at` + `priority` (pin_skill only) in place, reuse existing row ID for the audit entry; if not found, INSERT new row.
    - Deterministic key: `target->>'skill_id'` for `pin_skill`; `target->>'recommendation_key'` for `dismiss_recommendation`.
  - **(B)** Always INSERT new row; SET existing active row's `expires_at = now()` (mark old as immediately expired). Two DML operations; preserves history of both rows.
  - **(C)** Simple INSERT always; rely on consumption filter `.gte('expires_at', now())` — multiple valid rows can coexist; application reads only the most-recently-created. Stale rows accumulate.
- Why ambiguous: Spec says "replace" and "extends the expiry" — language is mutational (Option A) but could be read as supersede (Option B). No DB constraint enforces either.
- Blocking? no — tight implementation detail; T3 self-resolve permitted
- Assumed answer (if proceeding): **Option A**
- Code affected: `supabase/functions/orchestration-svc/handlers.ts` (createOverride self-supersession logic)
- Status: resolved
- Resolution (2026-05-25, T3 self-resolve — Option 3 hybrid): **Option A**. SELECT + UPDATE/INSERT. Rationale: spec phrase "extends the expiry and updates priority" maps exactly to an UPDATE; cleanest audit trail (one active row per type+target per student; no accumulating expired rows). Inline comment at supersession site: `// Q-35.3 + Spec §16.6.1: self-supersession — UPDATE expires_at + priority if active override of same type+target exists.`

### Q-35.2 — role gate: 'tutor' alongside 'teacher'?

- Date raised: 2026-05-25 (Stage 35 prep — T2-tightened: filed before handler code)
- Asked of: product owner / architect (T3 round-trip)
- Source: Spec §16.6.1 line 2506 — "teachers only for students in their classes"; `supabase/migrations/0005_intelligence_orchestration.sql:437` — `CREATE POLICY po_teacher_select ON plan_override FOR SELECT USING (auth_role() IN ('teacher', 'tutor') AND ...)`
- Question: Spec §16.6.1 says "teachers" without explicitly mentioning 'tutor'. The RLS po_teacher_select policy groups teacher + tutor together. Should the createOverride handler role gate include 'tutor' alongside 'teacher'?
  - **(A)** Include 'tutor': role gate = `['parent', 'teacher', 'tutor', 'org_admin', 'platform_admin']`. Consistent with `po_teacher_select` RLS policy. Excluding tutor from create while allowing tutor SELECT creates an inconsistency — a tutor can READ overrides they cannot CREATE.
  - **(B)** 'teacher' only: literal spec reading. Tutor cannot create overrides in v1.
- Why ambiguous: Spec says "teacher" singularly; RLS policy groups teacher+tutor symmetrically. Auth model question — T3 round-trip required per Option 3 hybrid rules.
- Blocking? yes — T3 round-trip; auth model is one of the four hard cases
- Assumed answer (if proceeding): **Option A**
- Code affected: `supabase/functions/orchestration-svc/handlers.ts` (createOverride + deleteOverride role gate)
- Status: resolved
- Resolution (2026-05-25, T3 round-trip discharged): **Option A**. Role gate includes 'tutor'. Rationale: `po_teacher_select` RLS policy groups teacher+tutor throughout the plan_override table; excluding tutor from CREATE while permitting SELECT is an incoherence. Spec uses "teacher" as a role-class label that encompasses tutors in the system's role model. Inline comment at role gate: `// Q-35.2: tutor included with teacher per po_teacher_select RLS parity.`

### Q-35.1 — POST /orchestration/overrides response DTO shape

- Date raised: 2026-05-25 (Stage 35 prep — T2-tightened: filed before handler code)
- Asked of: product owner / architect (T3 round-trip)
- Source: Spec §16.6.1 (plan_override entity: 8 fields); `packages/types/src/orchestration.ts` — `PlanOverrideRequestSchema` exists; no `PlanOverrideDTOSchema` exists
- Question: What fields does POST /orchestration/overrides return? Options:
  - **(A — Modified)** Near-full entity with joined actor: `{ id, student_id, type, target, actor: { id, display_name }, expires_at, created_at }`. Drop `tenant_id` (auth-redundant). Actor as joined object mirrors `AssignmentDTO.created_by` (Stage 33 precedent).
  - **(B)** Minimal — `{ id, type, target, expires_at, created_at }` (omit auth-redundant FKs: student_id, tenant_id, actor_id).
  - **(C)** Simple ack — `{ id: uuid, expires_at: timestamptz }`.
- Why ambiguous: Spec §16.6.1 shows the entity shape but does not specify the API response envelope. DTO shape is one of the four hard cases — T3 round-trip required.
- Blocking? yes — DTO schema must be added to @mm/types before handler return type can be written
- Assumed answer (if proceeding): **Modified Option A**
- Code affected: `packages/types/src/orchestration.ts` (new PlanOverrideDTOSchema); `supabase/functions/orchestration-svc/handlers.ts` (createOverride return type + JOIN query)
- Status: resolved
- Resolution (2026-05-25, T3 round-trip discharged): **Modified Option A**.
  ```typescript
  PlanOverrideDTO = {
    id: string;
    student_id: string;
    type: 'pin_skill' | 'dismiss_recommendation';
    target: Record<string, unknown>;   // type-specific per Spec §16.6.1
    actor: { id: string; display_name: string };
    expires_at: string;   // ISO datetime
    created_at: string;   // ISO datetime
  }
  ```
  `tenant_id` dropped (auth-redundant). `actor` as joined object mirrors `AssignmentDTO.created_by` (Stage 33 precedent). Handler joins `user_profile` for `actor.display_name` in the single SELECT it already needs for actor_id authorization validation. `actor_id` FK not exposed directly; subsumed into `actor.id`. Type field constrained to v1-supported types only (`pin_skill | dismiss_recommendation`; `override_plan_item` remains in `PlanOverrideTypeSchema` for DB enum parity but is rejected at the API layer per Q-35.4).

### Q-34.6 — intervention_alert outbox aggregate_id: alert UUID or student UUID?

- Date raised: 2026-05-24 (Stage 34 implementation — mid-impl)
- Asked of: self (T3 self-resolve)
- Source: `supabase/migrations/0001_enums_tenancy_auth.sql` (`outbox_event.aggregate_id uuid NOT NULL`); analytics-svc/handlers.ts `processTeacherRefresh` (bulk INSERT without `.select('id')`)
- Question: `outbox_event.aggregate_id` is `uuid NOT NULL`. For `intervention_alert` events, the natural aggregate is the alert row itself. However, `processTeacherRefresh` uses `db.from('intervention_alert').insert(alertsToInsert)` without `.select('id')`, so individual alert IDs are not returned by the bulk INSERT. Options:
  - **(A)** Use `student_id` UUID as `aggregate_id`. Dedup semantics: `(teacher_id, intervention_alert, student_id)` within 1h — prevents duplicate teacher alerts for the same student within the window. Correct for the use case.
  - **(B)** Add `.select('id')` to the analytics-svc bulk INSERT, return alert IDs, use them as `aggregate_id`. Requires refactoring the analytics-svc INSERT call.
  - **(C)** Use a deterministic composite UUID derived from `student_id + alert_type + tenant_id`. Avoids refactoring but adds complexity.
- Why ambiguous: `outbox_event.aggregate_id` is typed as `uuid NOT NULL` — cannot use composite strings. Alert IDs are not available without a schema change to the INSERT.
- Blocking? no — tight implementation detail; T3 self-resolve permitted
- Assumed answer (if proceeding): **Option A** — student_id UUID as aggregate_id
- Code affected: `supabase/functions/analytics-svc/handlers.ts` (outbox INSERT after intervention_alert INSERT)
- Status: resolved
- Resolution (2026-05-24, T3 self-resolve): **Option A**. `aggregate_id = a.student_id` (UUID). ISSUE-0025 dedup guard in notifications-svc uses `(user_id=teacher_id, type=intervention_alert, metadata->>'aggregate_id'=student_id)` within 1h — semantically correct: no duplicate teacher alert per student per hour. Analytics-svc INSERT unchanged (no `.select()` refactor). Q-34.6 self-resolved per T3 hybrid clause in C-C-D-V: "tight implementation details = self-resolve permitted with documented defaults."

### Q-34.5 — pipeline/create payload: how does notifications-svc know which notification_type to create?

- Date raised: 2026-05-24 (Stage 34 implementation — mid-impl, during migration 0016 authoring)
- Asked of: self (T3 self-resolve)
- Source: `supabase/migrations/0010_outbox_dispatcher.sql:52` (`j_pay := jsonb_build_object('assignment_id', event.aggregate_id)` — no event_type key); `supabase/functions/jobs-worker/index.ts:87` (passes job.payload directly to target service, no enrichment); Q-34.1 resolution (event.payload = assignments-svc JSONB with assignment_id, student_id, tenant_id, published_at)
- Question: `POST /notifications/pipeline/create` receives a job payload (JSONB). The handler must know which `notification_type` to create (assignment_assigned, plan_updated, or intervention_alert). The assignments-svc payload (from Q-34.1) does not include an explicit type key. fn_drain_outbox_batch knows `event.event_type` but was not forwarding it to j_pay in migration 0010. Options:
  - **(A)** Enrich `j_pay` in fn_drain_outbox_batch: `j_pay := event.payload || jsonb_build_object('notification_type', event.event_type)`. Handler reads `notification_type` from payload. Clean; jobs-worker stays a transparent dispatcher.
  - **(B)** Handler infers type from other payload keys (e.g., presence of `assignment_id` → `assignment_assigned`). Fragile; fails if keys overlap across types.
  - **(C)** Add `event_type` column to `job_queue` table and pass through jobs-worker. Requires a new migration; cross-service schema change.
- Why ambiguous: Migration 0010 j_pay used single-key construction without event_type threading. jobs-worker dispatch is a transparent forwarder.
- Blocking? no — tight implementation detail; T3 self-resolve permitted
- Assumed answer (if proceeding): **Option A** — enrich j_pay in fn_drain_outbox_batch
- Code affected: `supabase/migrations/0016_notification_dispatcher.sql` (j_pay construction for all three notification branches)
- Status: resolved
- Resolution (2026-05-24, T3 self-resolve): **Option A**. `j_pay := event.payload || jsonb_build_object('notification_type', event.event_type)` for all three notification.create branches. Handler reads `payload.notification_type` and passes to `getNotificationCopy()`. T3 self-resolve per C-C-D-V hybrid clause: "tight implementation details (title/body copy per type, dedup window value, filter inclusivity) = self-resolve permitted with documented defaults." Surfaced mid-implementation, retroactively filed here.

### Q-34.4 — plan_updated + intervention_alert outbox writes: in Stage 34 or defer?

- Date raised: 2026-05-24 (Stage 34 morning ritual)
- Asked of: product owner / architect
- Source: DEV_PLAN Stage 34 Deliverables — "domain events via outbox produce `notification` rows (`assignment_assigned`, `plan_updated`, `intervention_alert`)"
- Question: DEV_PLAN lists all three event types in Stage 34 scope. However, neither orchestration-svc nor analytics-svc currently writes `outbox_event` rows for `plan_updated` or `intervention_alert`. Adding them requires amending two already-shipped services (Stage 31 + Stage 30). Options:
  - **(A)** Full scope per DEV_PLAN: Stage 34 adds outbox_event INSERTs to orchestration-svc on replan completion (event_type=`plan_updated`) and analytics-svc after each intervention_alert INSERT (event_type=`intervention_alert`). Migration 0016 adds both dispatcher branches.
  - **(B)** Scope reduction: Stage 34 delivers `assignment_assigned` notifications only. `plan_updated` / `intervention_alert` deferred to Stage 35+. File a deviation.
- Why ambiguous: Cross-service amendments to shipped code add ~1–2h scope within a 1-day budget. With +2 buffer days banked the risk is manageable; however, scope reduction avoids cross-service churn and keeps Stage 34 focused on the new service scaffold.
- Blocking? yes — T3 round-trip (scope determination, cross-service amendments to shipped services)
- Assumed answer (if proceeding): **Option A** — full scope per DEV_PLAN
- Code affected: `supabase/functions/orchestration-svc/handlers.ts`, `supabase/functions/analytics-svc/handlers.ts`, `supabase/migrations/0016_notification_dispatcher.sql`, `supabase/functions/notifications-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-24): **Option A**. Full scope per DEV_PLAN. Stage 34 adds outbox_event INSERTs at: orchestration-svc `processOrchestratorReplan` completion (event_type=`plan_updated`, payload=`{student_id, tenant_id, plan_id, session_count}`); analytics-svc `processTeacherRefresh` after each intervention_alert INSERT (event_type=`intervention_alert`, payload=`{student_id, teacher_id, tenant_id, alert_id, alert_type}`). Migration 0016 adds two more branches to fn_drain_outbox_batch. Budget risk accepted — +2 buffer days banked; cross-service writes are 2-line INSERTs at natural code-path sites.

### Q-34.3 — channel scope: in-app only, or email/push in Stage 34?

- Date raised: 2026-05-24 (Stage 34 morning ritual)
- Asked of: self (T3 self-resolve)
- Source: Spec §27.3 + §27.5; DEV_PLAN Stage 34 Objective "In-app notifications via outbox"
- Question: Does Stage 34 implement email delivery per notification type, or in-app only?
- Why ambiguous: Spec §27.3 says "Students and parents can configure per-type email delivery in preferences; in-app notifications are always on." Spec §27.5 says email is "owned by a separate transactional email service (e.g., Postmark, Resend)." Push is "deferred to Phase 5."
- Blocking? no — self-resolvable from spec text
- Assumed answer (if proceeding): In-app only
- Code affected: `supabase/functions/notifications-svc/` (no email dispatch code written)
- Status: resolved
- Resolution (2026-05-24): **In-app only (T3 self-resolve).** Spec §27.5 explicitly defers email to a separate external service and push to Phase 5. DEV_PLAN Stage 34 objective says "in-app notifications via outbox." Arch §4.11 has no email endpoint. Stage 34 INSERTs notification rows only; no email dispatch, no push payload, no preference API.

### Q-34.2 — notification storage table: exists in migration or requires new DDL in 0016?

- Date raised: 2026-05-24 (Stage 34 morning ritual)
- Asked of: self (T3 self-resolve)
- Source: Pre-read of supabase/migrations/ directory
- Question: Does the `notification` table already exist, or must migration 0016 CREATE TABLE?
- Why ambiguous: DEV_PLAN says Stage 34 scaffolds notifications-svc (15th workspace); the outbox dispatcher in migration 0010 already references `notification.create` job_type, implying the table was anticipated. Exact migration file not confirmed at pre-read start.
- Blocking? no — self-resolvable by reading migrations
- Assumed answer (if proceeding): Table exists
- Code affected: `supabase/migrations/0016_notification_dispatcher.sql` (no DDL needed)
- Status: resolved
- Resolution (2026-05-24): **Table exists (T3 self-resolve).** `notification` table DDL at `supabase/migrations/0007_new_domains.sql:239`. RLS Pattern E (`notification_own FOR ALL TO authenticated USING (user_id = auth_user_id()) WITH CHECK (user_id = auth_user_id())`) at line 334. `notification_type` enum at `supabase/migrations/0001_enums_tenancy_auth.sql:147`. Migration 0016 amends `fn_drain_outbox_batch` only — no `CREATE TABLE`.

### Q-34.1 — event_type mismatch: Stage 33 writes `assignment_assigned`; migration 0010 handles `assignment.published`

- Date raised: 2026-05-24 (Stage 34 morning ritual)
- Asked of: product owner / architect
- Source: `supabase/functions/assignments-svc/handlers.ts:570` (`event_type: 'assignment_assigned'`); `supabase/migrations/0010_outbox_dispatcher.sql:49` (`ELSIF event.event_type = 'assignment.published'`); `supabase/migrations/0010_outbox_dispatcher.sql:54` (`RAISE EXCEPTION 'unknown outbox event_type'`)
- Question: Stage 33's `publishAssignment` writes outbox_event rows with `event_type = 'assignment_assigned'` (one per student, payload contains `student_id`). Migration 0010's fn_drain_outbox_batch handles `event_type = 'assignment.published'` only — any `assignment_assigned` event raises an exception that crashes the entire drain batch. The `assignment.published` branch appears to be speculative dead code (Stage 33 never writes it). Options:
  - **(A)** Migration 0016 replaces `assignment.published` with `assignment_assigned` in fn_drain_outbox_batch. Pass `event.payload` (JSONB — already contains `student_id`, `tenant_id`) directly into the `notification.create` job payload. notifications-svc receives all data it needs without querying other tables. Stage 33 shipped code unchanged.
  - **(B)** Amend Stage 33 to write `assignment.published` (one row per assignment). Migration 0010 stays. notifications-svc must then look up `assignment_target` to find student recipients — violates ownership (arch §1.2: `assignment_target` owned by assignments-svc).
  - **(C)** Handle both event types in fn_drain_outbox_batch for backwards compatibility. Unnecessary complexity since `assignment.published` has never been written.
- Why ambiguous: Migration 0010 was written at Stage 10 before assignments-svc design (Stage 33). The `assignment.published` naming was speculative. Stage 33 chose per-student outbox rows with `assignment_assigned` naming. These two systems have never been tested together.
- Blocking? yes — T3 round-trip (dispatcher schema / payload contract — architectural). Any `assignment_assigned` events in the queue crash fn_drain_outbox_batch, blocking all other pipeline jobs.
- Assumed answer (if proceeding): **Option A**
- Code affected: `supabase/migrations/0016_notification_dispatcher.sql`, `supabase/functions/jobs-worker/index.ts`, `supabase/functions/notifications-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-24): **Option A**. Migration 0016 replaces the speculative `assignment.published` branch in fn_drain_outbox_batch with `assignment_assigned`. Job payload = `event.payload` (JSONB, already containing `student_id`, `tenant_id`, `assignment_id`, `published_at`). notifications-svc pipeline/create handler receives complete data; no cross-table queries. Stage 33 shipped code unchanged. ADR-0031 fourth amendment filed; `notification.create → notifications-svc` added to jobs-worker route map.

### Q-33.8 — startAssignment pathway_id gap: assignment table has no pathway_id; POST /sessions/create hard-requires it

- Date raised: 2026-05-23 (Stage 33 implementation T1 reads)
- Asked of: product owner / architect
- Source: assessment-svc/handlers.ts lines 226-228 (hard validation); supabase/migrations/0007_new_domains.sql (no pathway_id column on assignment); packages/types/src/assignments.ts (no pathway_id in CreateAssignmentRequestSchema or AssignmentDTOSchema)
- Question: POST /sessions/create hard-rejects pathway_id === null (assessment-svc/handlers.ts line 226-228). Assignment table (0007) and CreateAssignmentRequest have no pathway_id.
  - **(A)** Add pathway_id column to assignment table; add to CreateAssignmentRequest + AssignmentDTO + StudentAssignmentDTO; startAssignment reads it from assignment row.
  - **(B)** Derive pathway_id at startAssignment time from target_skill_ids[0] → skill_node → pathway join. No schema change; ambiguous when skills span pathways.
  - **(C)** Make pathway_id optional in assessment-svc createSession — out of scope.
- Why ambiguous: spec §24 defines assignments without pathway_id; assessment-svc session creation requires it. Gap not surfaced in Q-33.1 resolution.
- Blocking? yes — T3 round-trip (DTO shape + schema).
- Code affected: `supabase/migrations/0015_assignment_pathway_and_cron.sql`, `packages/types/src/assignments.ts`, `supabase/functions/assignments-svc/handlers.ts` (createAssignment + startAssignment)
- Status: resolved
- Resolution (2026-05-23): **Option A** with boundary refinement. `pathway_id uuid NOT NULL REFERENCES pathway(id) ON DELETE RESTRICT` added to assignment table in migration 0015 (renamed `0015_assignment_pathway_and_cron.sql`). `pathway_id: z.string().uuid()` added to `CreateAssignmentRequestSchema`, `AssignmentDTOSchema`, `StudentAssignmentDTOSchema` in packages/types/src/assignments.ts. **DraftAssignmentDTO unchanged** — Stage 32 shipped state preserved; teacher UI picks pathway pre-create, before the CreateAssignmentRequest is built. NOT NULL is safe: assignment table is empty in v1, no backfill required. createAssignment validates target_skill_ids ⊂ pathway (Q-33.8 v1 single-pathway constraint). startAssignment reads pathway_id from assignment row and forwards to POST /sessions/create.

### Q-33.7 — POST /assignments Idempotency-Key: enforce server-side or accept and log only?

- Date raised: 2026-05-23 (Stage 33 prep)
- Asked of: self
- Source: Arch §4.8 — POST /assignments (Teacher, Idempotency-Key) + POST /assignments/{id}/start (Student, Idempotency-Key)
- Question: (A) Enforce via shared `api_idempotency_key` table; (B) add `idempotency_key` column to assignment + assignment_session tables; (C) accept and log header but no server-side dedup in v1.
- Why ambiguous: Option A requires cross-service ownership check (api_idempotency_key owned by assessment-svc per arch §1.2). Option B requires a new migration column. Both add scope to a 2-day stage. v1 has no concurrent teacher creation UX.
- Blocking? yes (T3 round-trip — auth model + scope)
- Assumed answer (if proceeding): **Option C** — header parsed and logged only; no dedup in v1.
- Code affected: `supabase/functions/assignments-svc/handlers.ts` (parse site for createAssignment + startAssignment)
- Status: resolved
- Resolution (2026-05-23): **Option C**. Inline comment `// DEV-20260523-1 + ISSUE-0023: Idempotency-Key parsed but not enforced in v1.` DEV-20260523-1 filed. ISSUE-0023 (medium, v1.1) tracking enforcement choice.

### Q-33.6 — POST /assignments/{id}/archive: allowed from which source statuses?

- Date raised: 2026-05-23 (Stage 33 prep)
- Asked of: self
- Source: Arch §4.8 — POST /assignments/{id}/archive (Teacher, Archive). Spec §24.1 defines status enum: draft | published | archived. No explicit transition rules for archive source states.
- Question: (A) Only from 'published'; (B) from 'draft' or 'published' (soft-delete semantics); (C) from any status.
- Why ambiguous: Spec §24 defines assignment_session transitions explicitly but not assignment status transitions other than draft → published.
- Blocking? no (T3 self-resolve permitted — filter inclusivity)
- Assumed answer (if proceeding): **Option B** — archive from 'draft' or 'published'. Already 'archived' → 422 UNPROCESSABLE.
- Code affected: `supabase/functions/assignments-svc/handlers.ts` (archiveAssignment)
- Status: resolved
- Resolution (2026-05-23): **Option B**. Consistent with soft-delete semantics. Inline guard: `if (assignment.status === 'archived') → 422 UNPROCESSABLE`.

### Q-33.5 — PATCH /assignments/{id} pre-publish guard: which error code?

- Date raised: 2026-05-23 (Stage 33 prep)
- Asked of: self
- Source: Arch §4.8 — PATCH /assignments/{id} "Teacher (creator), Update (pre-publish)". Arch §1.5 error vocabulary.
- Question: (A) 409 SESSION_CONFLICT when assignment.status !== 'draft'; (B) 422 UNPROCESSABLE; (C) 403 FORBIDDEN.
- Why ambiguous: "pre-publish" constraint is semantic (wrong state), not a concurrency conflict or role failure.
- Blocking? no (T3 self-resolve permitted — error code selection)
- Assumed answer (if proceeding): **Option B** — 422 UNPROCESSABLE (`"Semantically invalid"` per arch §1.5).
- Code affected: `supabase/functions/assignments-svc/handlers.ts` (updateAssignment)
- Status: resolved
- Resolution (2026-05-23): **Option B**. 422 UNPROCESSABLE with code `UNPROCESSABLE` and message `"Assignment is not in draft status"`.

### Q-33.4 — GET /assignments/for-student: cross-student access rules?

- Date raised: 2026-05-23 (Stage 33 prep)
- Asked of: self
- Source: Arch §4.8 — GET /assignments/for-student/{student_id}?status= (Role-gated). Spec §24.8 roles table.
- Question: (A) student reads own only; non-teacher with mismatched student_id → 403; (B) parent reads linked child; teacher reads own-class students; admin reads any.
- Why ambiguous: "Role-gated" in arch §4.8 is underspecified; spec §24.8 provides the full permission matrix.
- Blocking? no (T3 self-resolve permitted — role gating detail)
- Assumed answer (if proceeding): **Option B** — full spec §24.8 matrix: student → own only; teacher → any in own classes; parent → linked children; org_admin + platform_admin → any in tenant.
- Code affected: `supabase/functions/assignments-svc/handlers.ts` (getAssignmentsForStudent)
- Status: resolved
- Resolution (2026-05-23): **Option B**. Cross-student read by student or parent (non-linked child) → 403 FORBIDDEN. Consistent with intelligence-svc `checkStudentAccess` pattern.

### Q-33.3 — `in_progress → completed` trigger: how does assignments-svc learn a linked session was processed?

- Date raised: 2026-05-23 (Stage 33 morning ritual pre-read)
- Asked of: self + operator
- Source: Spec §24.3 state transition: "`in_progress → completed`: linked session reaches `processed` state". assignments-svc does not own session_record (arch §1.2 ASN).
- Question: (A) Outbox-driven: intelligence-svc writes `outbox_event(assignment_session_completed)` → jobs-worker dispatches to new assignments-svc pipeline endpoint; (B) Polling pg_cron every 5 min joining assignment_session to session_record WHERE processed; (C) Deferred to v1.1; (D) Read-time join in GET /assignments/{id}/tracking — no background update.
- Why ambiguous: Spec §24.3 specifies the trigger ("session reaches processed state") but not the mechanism. Option A is real-time but requires jobs-worker + ADR-0031 amendment. Option B is simple but has 5-min latency. Neither is specified by arch.
- Blocking? yes (T3 round-trip — deliverable scope + schema)
- Assumed answer (if proceeding): **Option B** — pg_cron polling every 5 minutes, batched in migration 0015 with Q-33.2's fn_mark_overdue_assignments(). ISSUE-0024 (low) filed for v1.1 outbox upgrade.
- Code affected: `supabase/migrations/0015_assignment_cron_functions.sql` (fn_sync_assignment_completion())
- Status: resolved
- Resolution (2026-05-23): **Option B**. cron.schedule('assignments.sync_completion', '*/5 * * * *', 'SELECT fn_sync_assignment_completion()'). ISSUE-0024 filed for outbox-driven upgrade path.

### Q-33.2 — `assignments.mark_overdue` cron: pg_cron in new migration vs Deno.cron vs jobs-worker?

- Date raised: 2026-05-23 (Stage 33 morning ritual pre-read)
- Asked of: self + operator
- Source: DEV_PLAN Stage 33 deliverables — "daily cron assignments.mark_overdue transitions past-due to overdue". Arch §5.5 cron table does NOT list this cron. Migration 0008_cron.sql pattern.
- Question: (A) pg_cron function in new migration 0015; (B) Deno.cron inside assignments-svc; (C) jobs-worker job_type pipeline.assignments.mark_overdue.
- Why ambiguous: Arch §5.5 omits this cron; DEV_PLAN names it but not the mechanism. Three valid implementations.
- Blocking? yes (T3 round-trip — schema: new migration required for Option A)
- Assumed answer (if proceeding): **Option A** — new migration 0015_assignment_cron_functions.sql. Consistent with 0008 pattern (LANGUAGE sql VOLATILE, no SECURITY DEFINER); no jobs-worker changes.
- Code affected: `supabase/migrations/0015_assignment_cron_functions.sql` (new)
- Status: resolved
- Resolution (2026-05-23): **Option A**. fn_mark_overdue_assignments() in migration 0015. cron.schedule('assignments.mark_overdue', '0 1 * * *', 'SELECT fn_mark_overdue_assignments()'). Spec §24.3 condition: due_at + 24h < now() AND status IN ('pending', 'in_progress').

### Q-33.1 — POST /assignments/{id}/start delegation: how does assignments-svc create session_record (owned by assessment-svc)?

- Date raised: 2026-05-23 (Stage 33 morning ritual pre-read)
- Asked of: self + operator
- Source: DEV_PLAN Stage 33 — "POST /assignments/{id}/start creates session with assignment_id populated (delegates to assessment-svc)". Arch §1.2: ASN (assessment-svc) owns session_record. assessment-svc POST /sessions/create requires Bearer JWT (no service-role bypass). CreateSessionRequest.assignment_id exists (packages/types/src/session.ts line 20).
- Question: (A) Forward student Bearer JWT from assignments-svc to assessment-svc POST /sessions/create with assignment_id in body; (B) add service-role bypass to assessment-svc POST /sessions/create; (C) write session_record directly with service_role (violates arch §1.2).
- Why ambiguous: assessment-svc's session creation is JWT-gated; assignments-svc must create a session without bypassing the ownership boundary.
- Blocking? yes (T3 round-trip — auth model)
- Assumed answer (if proceeding): **Option A** — forward student Authorization header + assignment_id in body. No assessment-svc changes. Requires ASSESSMENT_SVC_URL env var in assignments-svc.
- Code affected: `supabase/functions/assignments-svc/handlers.ts` (startAssignment), `supabase/functions/assignments-svc/index.ts` (ASSESSMENT_SVC_URL)
- Status: resolved
- Resolution (2026-05-23): **Option A**. assignments-svc's startAssignment handler receives the student's Authorization header, passes it through to `fetch(ASSESSMENT_SVC_URL + '/sessions/create', { method: 'POST', headers: { Authorization, 'Idempotency-Key': ..., 'x-mm-trace-id': traceId }, body: JSON.stringify({ ... assignment_id }) })`. ASSESSMENT_SVC_URL documented in ISSUE-0018 (extended).

### Q-32.7 — getExplanation: return 403 or 404 when caller lacks access to another student's decision?

- Date raised: 2026-05-22 (Stage 32)
- Asked of: self
- Source: Arch §4.5 (line 1545): `GET /intelligence/explain/{decision_id}`. No explicit note on error code when caller lacks access.
- Question: (A) Return 403 FORBIDDEN when caller's userId ≠ decision.student_id and role < teacher; (B) return 404 for both not-found and unauthorized to prevent existence leak.
- Why ambiguous: Returning 403 confirms the decision_id exists — an attacker can enumerate decision IDs by probing. Returning 404 for unauthorized prevents this but diverges from REST convention.
- Blocking? no
- Assumed answer (if proceeding): **Option B** — 404 for both not-found and unauthorized. Inline comment: `// 404 for both not-found and unauthorized — do not leak existence.`
- Code affected: `supabase/functions/intelligence-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-22): **Option B**. No 403 from getExplanation in any scenario.

### Q-32.6 — getAuditLog/getCausalMap active_misconceptions: which statuses to include?

- Date raised: 2026-05-22 (Stage 32)
- Asked of: self
- Source: Spec §10.5 says "active misconceptions"; student_misconception has status enum `active | suspected | resolved`.
- Question: (A) Status = 'active' only; (B) status IN ('active', 'suspected') — suspected means unconfirmed but present.
- Why ambiguous: "Active" in prose could mean the narrow DB value or the broader "not resolved" set.
- Blocking? no
- Assumed answer (if proceeding): **Option B** — status IN ('active', 'suspected'). Suspected misconceptions are actionable teaching signals.
- Code affected: `supabase/functions/intelligence-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-22): **Option B**. getCausalMap and getLearnerProfile both use `.in('status', ['active', 'suspected'])`.

### Q-32.5 — generateAssignment exclude_recently_seen: implement fully or skip for v1?

- Date raised: 2026-05-22 (Stage 32)
- Asked of: self
- Source: Spec §14.3 line 2135: `exclude_recently_seen: last_14_days`.
- Question: (A) Skip for v1 — return any items without the 14-day filter; (B) implement fully via class_student + session_record + session_response join.
- Why ambiguous: Requires 3 extra DB queries per generateAssignment call.
- Blocking? no
- Assumed answer (if proceeding): **Option B** — full implementation. Teacher-triggered operation; 3 extra queries acceptable.
- Code affected: `supabase/functions/analytics-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-22): **Option B**. Full exclusion implemented.

### Q-32.4 — getPathwayReadiness composite_label thresholds not in arch; what are the boundaries?

- Date raised: 2026-05-22 (Stage 32)
- Asked of: self
- Source: PathwayReadinessDTO.composite_label = 'not_ready' | 'developing' | 'on_track' | 'ready' | 'strong'. No threshold values in arch.
- Question: What numeric boundaries map each label?
- Why ambiguous: No spec citation for exact thresholds.
- Blocking? no
- Assumed answer (if proceeding): `<0.3=not_ready, <0.5=developing, <0.7=on_track, <0.85=ready, ≥0.85=strong`. Consistent with `overall_level` quintile bands implied by spec §12.
- Code affected: `supabase/functions/analytics-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-22): Thresholds as above, implemented in `compositeLabel()` helper.

### Q-32.3 — getPathwayReadiness: L5 cache payload lacks separate readiness dimensions + skill names; how to map to PathwayReadinessDTO?

- Date raised: 2026-05-22 (Stage 32)
- Asked of: self
- Source: Arch §6.5 PathwayReadinessDTO (line 2023): four distinct readiness dimensions (skill_readiness, coverage, condition_readiness, composite_readiness), gap_skills with skill_name+target_mastery, active_misconceptions_affecting, predicted_ready_date.
- Question: (A) Defer until separate predictive_skill_score table adds individual dimensions; (B) map v1 single composite score to all four dimension fields; join skill_node.name for gap skill names; null for predicted_ready_date/exam_date.
- Why ambiguous: L5 cache only stores current_readiness_score (single composite) + gap_skills (skill_id+mastery_level+velocity). No per-dimension breakdown, no skill_name, no misconception count.
- Blocking? no
- Assumed answer (if proceeding): **Option B**. All four readiness fields = composite score (v1 simplification); join skill_node.name at read time; target_mastery = 0.6 (L5_SKILL_THRESHOLD); active_misconceptions_affecting = 0; predicted_ready_date/exam_date/days_remaining = null (DEV-20260519-1).
- Code affected: `supabase/functions/analytics-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-22): **Option B**. Inline note added to each null field citing Q-32.3 or DEV-20260519-1.

### Q-32.2 — GET /analytics/cohort/{group_id}: no named CohortDTO in arch §6; response shape?

- Date raised: 2026-05-22 (Stage 32 morning ritual)
- Asked of: self
- Source: Arch §4.7 (line 1565): `GET /analytics/cohort/{group_id} | Teacher/Admin | Cohort aggregate`. No matching DTO in arch §6.
- Question: (A) Return cohort_metric_cache row directly as named CohortDTO shaped from stored data; (B) define a distinct analytics DTO analogous to the auto-groups response.
- Why ambiguous: Arch §6 defines no `CohortDTO`. cohort_metric_cache stores k-means output with `groups: jsonb`. The most natural read assembles from the stored structure but the DTO needs a name for TypeScript strict-mode compliance.
- Blocking? no
- Assumed answer (if proceeding): **Option A** — define a named `CohortDTO` type in analytics-svc handlers.ts:
  ```typescript
  interface CohortDTO {
    group_id: string;
    class_id: string;
    skill_id: string;
    groups: ClusterGroup[];
    computed_at: string;
    stale_since: string | null;
  }
  ```
  `ClusterGroup` type imported from Stage 30 analytics-svc handler module (already defined there for processTeacherRefresh). Staleness rule: spec §9.6 30-day rule applied to `computed_at`.
- Code affected: `supabase/functions/analytics-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-22): **Option A**. Named CohortDTO per above shape. ClusterGroup imported from existing Stage 30 handler.

### Q-32.1 — POST /analytics/generate-assignment: persist to assignment table or return DraftAssignmentDTO only?

- Date raised: 2026-05-22 (Stage 32 morning ritual)
- Asked of: self
- Source: Arch §4.7 (line 1570): `POST /analytics/generate-assignment | Teacher | Auto-generate assignment`. Arch §6.6 defines `AssignmentDTO` with `id`, `created_at`, `status: 'draft'`. Spec §14.3 (line 2124) pseudocode: `return assignment { items, time_limit, mode, rationale }` — no INSERT in pseudocode.
- Question: (A) INSERT into `assignment` table as draft and return persisted `AssignmentDTO`; (B) compute and return draft without persisting — teacher submits to `POST /assignments` (Stage 33) to create.
- Why ambiguous: Two endpoints exist (`/analytics/generate-assignment` and `POST /assignments`). If (A), analytics-svc writes to `assignment` table owned by assignments-svc (Stage 33) — cross-owner write. Spec §14.3 pseudocode has no INSERT.
- Blocking? yes
- Assumed answer (if proceeding): **Option B** — return `DraftAssignmentDTO` without INSERT. Type defined as `Omit<AssignmentDTO, 'id' | 'created_at' | 'updated_at'>` — all fields of AssignmentDTO except the database-generated ones. analytics-svc does NOT write to `assignment` table. Stage 33 assignments-svc `POST /assignments` persists. Inline comment at handler: `// Stage 33 assignments-svc persists this draft via POST /assignments. Q-32.1 Option B — no INSERT here.`
- Code affected: `supabase/functions/analytics-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-22): **Option B**. DraftAssignmentDTO = `Omit<AssignmentDTO, 'id' | 'created_at' | 'updated_at'>`. No assignment table write from analytics-svc.

### Q-31.7 — SELECT FOR UPDATE unavailable in Supabase JS client; concurrency guard for SUPERSEDE+INSERT

- Date raised: 2026-05-21 (Stage 31 implementation)
- Asked of: self
- Source: C-C-D-V Stage 31: "SUPERSEDE+INSERT must wrap in a transaction with SELECT ... FOR UPDATE on the existing active plan row."
- Question: Supabase JS client `.from()` queries do not expose `FOR UPDATE` locking. Options: (A) Use audit_log dedup (primary idempotency) + optimistic UPDATE WHERE status='active' + `idx_plan_active` unique partial index as DB-level concurrency guard; (B) call an RPC function (Postgres function) that wraps the operation in a real transaction with FOR UPDATE; (C) accept the race condition and rely solely on `idx_plan_active` unique constraint violation to detect duplicates.
- Why ambiguous: C-C-D-V text says "SELECT FOR UPDATE" but the Supabase JS client cannot issue advisory locks via `.from()` chaining.
- Blocking? no
- Assumed answer (if proceeding): **Option A**. Concurrency guard: (1) idempotency check `updated_at > scheduled_at` early return; (2) UPDATE existing active plan → superseded WHERE status='active' (optimistic lock — if zero rows affected, another replan won the race; handler returns); (3) INSERT new plan; `idx_plan_active` unique partial index provides DB-level duplicate prevention. Inline comment at write site: `// FOR UPDATE not available in Supabase JS client; idx_plan_active unique partial index + optimistic UPDATE as concurrency guard (Q-31.7).`
- Code affected: `supabase/functions/orchestration-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-21): **Option A**. Audit_log dedup + optimistic UPDATE + idx_plan_active unique index. No RPC needed in v1.

### Q-31.6 — `recommendation_key` hash format: spec says "deterministic hash" but specifies no hash function

- Date raised: 2026-05-21 (Stage 31 implementation)
- Asked of: self
- Source: Spec §16.6.1 (line ~2504): `dismiss_recommendation` override filtered by matching `recommendation_key`. Spec describes key as "deterministic hash of (skill_id, mode, rationale_class)" without naming the hash function.
- Question: (A) Use colon-separated composite string `${skill_id}:${mode}:${rationale_class}` (deterministic, no crypto, no Deno/Node mismatch); (B) SHA-256 hash of concatenated fields (true hash, but requires crypto API); (C) use `skill_id` alone as the match key.
- Why ambiguous: Spec says "hash" implying a fixed-length digest, but providing no algorithm. True hash adds complexity and cross-environment test friction.
- Blocking? no
- Assumed answer (if proceeding): **Option A** — `${skill_id}:${mode}:${rationale_class}`. Deterministic composite string; matches spec's stated intent (stable, reproducible key); no crypto dependency; v1.1 can migrate to SHA-256 if key collision concerns arise (skill UUIDs already unique).
- Code affected: `supabase/functions/orchestration-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-21): **Option A**. Colon-separated composite string. Inline comment at use site.

### Q-31.5 — 20% enjoyment guardrail: mastery threshold for "good at" skills not spec-pinned

- Date raised: 2026-05-21 (Stage 31 implementation)
- Asked of: self
- Source: Spec §16.6 (line ~2478): "At least 20% of plan time is 'enjoyment' sessions". L6 stretch (primary enjoyment source) is PHASE-2 deferred. "Skills the student is good at" threshold not defined in spec §16.
- Question: (A) Use `mastery_level > 0.7` as "good at" proxy for enjoyment skill selection; fill 20% of `available_minutes_per_week` with these skills after main queue assembly; (B) skip enjoyment guardrail in v1 entirely with PHASE-2 stub; (C) use `mastery_level > 0.8`.
- Why ambiguous: Spec names the guardrail but the L6 stretch layer (primary enjoyment mechanism) is PHASE-2 deferred. No spec text defines the mastery threshold for "enjoyment-eligible" skills. The "20% of plan time" means minutes (not session count).
- Blocking? no
- Assumed answer (if proceeding): **Option A** — `mastery_level > 0.7` threshold; enjoyment skills from `skill_mastery WHERE mastery_level > 0.7` filtered to enrolled pathways; added at LOW priority after step 5 in queue assembly; stop filling at 20% of `available_minutes_per_week`. L6 stretch step returns `[]` (PHASE-2) and does not contribute to this pad.
- Code affected: `supabase/functions/orchestration-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-21): **Option A**. `mastery_level > 0.7` as enjoyment-eligible proxy. Enjoyment pad applied after main queue assembly. "20% of plan time" = 0.2 × available_minutes_per_week minutes (time-based, not session count).



### Q-31.4 — POST /orchestration/generate-plan/{student_id}: synchronous or async?

- Date raised: 2026-05-21 (Stage 31 morning ritual)
- Asked of: self
- Source: Arch §4.6 (line 1552): `POST /orchestration/generate-plan/{student_id} | Role-gated (Idempotency-Key) | Trigger regeneration`
- Question: "Trigger regeneration" is ambiguous — does the endpoint call `generateWeeklyPlan` synchronously and return the new `LearningPlanDTO` (200), or enqueue a `pipeline.orchestration_replan` job and return 202?
- Why ambiguous: Arch §4.6 uses "trigger regeneration" without specifying sync vs async. The batch path is async (job_queue); the manual path could be either.
- Blocking? no
- Assumed answer (if proceeding): **Option A — synchronous** in v1. Calls `processOrchestratorReplan` directly and returns new `LearningPlanDTO`. Idempotency-Key at the HTTP layer is the dedup mechanism (arch §4.6). Upgrade to async (outbox/job_queue enqueue + 202 response) deferred to v1.1 once plan generation p95 timing is measured.
- Code affected: `supabase/functions/orchestration-svc/handlers.ts`, `supabase/functions/orchestration-svc/index.ts`
- Status: resolved
- Resolution (2026-05-21): **Option A**. Synchronous. ISSUE-0020 filed (low, v1.1) tracking async upgrade.

### Q-31.3 — `retention_estimate` computation: column does not exist in `skill_mastery`

- Date raised: 2026-05-21 (Stage 31 morning ritual)
- Asked of: self
- Source: Spec §16.2 (line 2335): `retention_estimate < 0.5 and mastery > 0.6` — "low retention" priority-queue condition. Migration 0005 `skill_mastery` columns: `mastery_level, confidence, total_attempts, correct_attempts, last_attempted_at, streak_current, streak_best, history`. No `retention_estimate` column.
- Question: (A) Compute inline as exponential decay using `retentionHalfLifeDays(year_level)` helper from `@mm/engines` (Stage 29, Q-29.3); (B) use `confidence` column as proxy; (C) skip step 4 "low retention" entirely in v1 with PHASE-2 stub.
- Why ambiguous: Spec references `retention_estimate` as if it is a persisted field; v1 schema has no such column; `retentionHalfLifeDays` already exists in `@mm/engines` from Stage 29 (Q-29.3 resolution) and takes `yearLevel: number` returning a half-life in days.
- Blocking? no
- Assumed answer (if proceeding): **Option A modified**. `retention_estimate = mastery_level * exp(-(days_since_last_attempt / retentionHalfLifeDays(year_level)))`. `year_level` loaded from `user_profile` (already read by the handler). NULL `last_attempted_at` → no decay: `retention_estimate = mastery_level`. Reuses `@mm/engines/src/constants/retention.ts` helper; `HALF_LIFE_DAYS_BY_YEAR_LEVEL = { y5: 60, y7: 90, y9: 120, default: 90 }` (Q-29.3 values). Do NOT hardcode 14d.
- Code affected: `supabase/functions/orchestration-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-21): **Option A modified**. Inline exponential decay via `retentionHalfLifeDays(year_level)` from `@mm/engines`. Inline comment: `// Spec §16.2 retention_estimate: not a persisted column; computed inline. Reuses @mm/engines retentionHalfLifeDays() from Stage 29 (Q-29.3). v1.1 may persist or replace formula.` Deviation: spec references `retention_estimate` as if persisted; v1 computes inline.

### Q-31.2 — `pipeline_event` step 9 for L9: write alongside `intelligence_audit_log`, or skip?

- Date raised: 2026-05-21 (Stage 31 morning ritual)
- Asked of: self
- Source: Arch §5.2 (line 1686): `9 Orchestration replan | pipeline.orchestration_replan | high | replan:{student_id}:{session_id} | 3 | 1/2/4s`. ADR-0032 generalised pattern (skip pipeline_event for non-session-scoped stages). ISSUE-0016 (L5/L7 observability gap).
- Question: L9 idempotency key is `replan:{student_id}:{session_id}` — session_id IS in the payload (constraint met). ADR-0032 skip rule was motivated by `session_id NOT NULL` being unavailable for L5/L7. Options: (A) skip pipeline_event, write intelligence_audit_log only (follow DEV_PLAN "audit log" literal); (B) write pipeline_event step 9 AND intelligence_audit_log — L9 is session-scoped; ADR-0032 skip does not apply; L3b (Stage 28) is the precedent.
- Why ambiguous: DEV_PLAN says "audit log" without mentioning pipeline_event. However, ISSUE-0016 covers L5/L7 where the NOT NULL FK blocks the write — it does NOT license skipping when the write is feasible (L9 has session_id).
- Blocking? no
- Assumed answer (if proceeding): **Option B** — write both pipeline_event step 9 and intelligence_audit_log. L3b (Stage 28) is the correct precedent: when session_id is available in the payload, write pipeline_event. ADR-0032 skip pattern is a workaround for the NOT NULL FK gap, not a policy preference. ISSUE-0016 remains open for L5 + L7 cases where the write is not feasible.
- Code affected: `supabase/functions/orchestration-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-21): **Option B**. Write `pipeline_event` step 9 (session_id available) AND `intelligence_audit_log`. Inline comment at write site: `// Stage 28 L3b precedent; session-scoped per arch §5.2 replan:{student_id}:{session_id} — pipeline_event writable unlike L5/L7.`

### Q-31.1 — `available_minutes_per_week` source for `pipeline.orchestration_replan` batch handler

- Date raised: 2026-05-21 (Stage 31 morning ritual)
- Asked of: self
- Source: Spec §16.2 (line 2311): `generate_weekly_plan(student, available_minutes_per_week):` — no default value shown. Arch §5.2 idempotency key `replan:{student_id}:{session_id}` — `available_minutes_per_week` not in the job payload.
- Question: (A) Derive from `behaviour_profile.session_length_sweet_spot * 5` at runtime (loaded as part of existing behaviour_profile read, no extra DB call); (B) hardcoded constant (e.g. 120 min/week); (C) student preference in `user_profile.preferences` jsonb (no defined key).
- Why ambiguous: Spec defines `available_minutes_per_week` as a required parameter with no default. The job payload carries `{student_id, session_id}` only. The value must be computed or defaulted at handler runtime.
- Blocking? no
- Assumed answer (if proceeding): **Option A** — `available_minutes_per_week = behaviour_profile.session_length_sweet_spot * 5`. `session_length_sweet_spot` default is 20 min (migration 0005 line 67). `behaviour_profile` is already loaded by the handler for the session-length guardrail (`behaviour.session_length_sweet_spot + 5 min`, spec §16.6). Zero extra DB calls.
- Code affected: `supabase/functions/orchestration-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-21): **Option A**. `available_minutes_per_week = session_length_sweet_spot * 5`. Derived from existing `behaviour_profile` read; consistent with spec's own session-length framing.

### Q-30.5 — "≥3 skills" scope for velocity-based §14.2 trigger rules

- Date raised: 2026-05-20 (Stage 30 pre-implementation)
- Asked of: self
- Source: Spec §14.2 trigger table — "Velocity < -0.02 for >14 days on ≥3 skills" and "Velocity > +0.05 across ≥3 skills for 14+ days"
- Question: Does "≥3 skills" mean (A) ≥3 skills with the triggering velocity across all skills the student has velocity data for (unscoped, student-level), or (B) ≥3 skills within the specific `skill_id` referenced in the job payload?
- Why ambiguous: The `pipeline.teacher_refresh` job payload carries a single `skill_id` (for the k-means grouping target). The trigger rules in §14.2 are described at a class/student level without specifying whether they are scoped to the job's target skill.
- Blocking? no — proceeding with Option A (all skills)
- Assumed answer (if proceeding): **Option A** — trigger rules evaluated across all skills the student has learning_velocity data for. The job's `skill_id` is used for k-means feature vector construction (skill-scoped mastery + velocity), not for trigger rule scoping. This matches the spec's intent: §14.2 alerts are student-level indicators, not per-skill.
- Code affected: `supabase/functions/analytics-svc/handlers.ts` (trigger evaluation — loads all `learning_velocity` rows for student, counts matching velocity rows)
- Status: resolved
- Resolution (2026-05-20): **Option A** — all skills (unscoped, student-level). Added to QUESTIONS.md at Stage 30 evening ritual (was mentioned in commit message but not written to file during pre-read).

### Q-30.6 — "for >14 days" velocity trigger condition and window_days semantics

- Date raised: 2026-05-20 (Stage 30 pre-push verification)
- Asked of: self
- Source: Spec §14.2 trigger table — "Velocity < -0.02 for >14 days on ≥3 skills" and "Velocity > +0.05 across ≥3 skills for 14+ days"
- Question: The "for >14 days" clause in §14.2 trigger conditions — does it require (A) filtering `learning_velocity` rows where `computed_at` is more than 14 days old (sustained decline for over 14 days), or (B) reading all velocity rows whose `window_days = 14` (i.e., the 14-day rolling window velocity itself satisfies the "14-day" condition)?
- Why ambiguous: The schema stores one rolling window velocity per (student, skill) — not a time series. "For >14 days" could mean either the measurement window or a staleness requirement.
- Blocking? no — implementation uses Option B; answer must be confirmed before Stage 32 if trigger sensitivity matters
- Assumed answer (if proceeding): **Option B** — `learning_velocity.window_days = 14` (default for all rows) means each velocity record IS the 14-day window measurement. If that measurement is < -0.02 (declining) or > +0.05 (exceptional), the spec's "for >14 days" / "for 14+ days" condition is satisfied. No `computed_at` staleness filter applied. If a different interpretation is intended (e.g., velocity must be negative for TWO consecutive 14-day windows, implying historical data storage), it would require schema changes not present in v1.
- Code affected: `supabase/functions/analytics-svc/handlers.ts` (trigger evaluation for declining_performance and exceptional_progress)
- Status: resolved
- Resolution (2026-05-20): **Option B** — window_days=14 satisfies the "14-day" condition. Default interpretation; no code change needed. Stage 32+ should revisit if product requires sustained-window detection requiring historical velocity snapshots.

### Q-30.4 — High-fatigue intervention alert data source

- Date raised: 2026-05-20 (Stage 30 morning)
- Asked of: self
- Source: Spec §14.2 trigger rules — "Avg fatigue onset < 15 min over last 5 sessions"
- Question: `behaviour_profile.avg_fatigue_onset_minutes` is a rolling average over all sessions, not the last 5. Per-session fatigue data lives in `learning_event` or `behaviour_signal` (event_type added migration 0013), not a direct column read. Should we (A) use `avg_fatigue_onset_minutes` as a proxy for spec §14.2 ("recent") fatigue, or (B) defer high_fatigue alert entirely and implement the other 5 trigger types?
- Why ambiguous: Spec trigger says "last 5 sessions"; available column is a rolling aggregate. Using the proxy violates spec intent and could mislead teacher UI.
- Blocking? no — other 5 trigger types are directly satisfiable from seed data per DEV_PLAN exit criterion
- Code affected: `supabase/functions/analytics-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-20): **Option B**. High-fatigue alert deferred. Stage 30 implements 5 of 6 §14.2 trigger types (declining_performance, persistent_misconception, repair_failure, low_persistence, exceptional_progress). Inline comment `// ISSUE-0017: high_fatigue alert deferred — requires per-session fatigue onset data (last 5 sessions), not available from behaviour_profile rolling average` at the trigger-evaluation site. ISSUE-0017 filed (low, v1.1).

### Q-30.3 — k-means clustering implementation in Deno

- Date raised: 2026-05-20 (Stage 30 morning)
- Asked of: self
- Source: Spec §14.1 "k-means clustering on feature vectors"; no Deno stdlib or safe esm.sh package available
- Question: (A) Hand-roll Lloyd's algorithm in `packages/engines/src/algorithms/kmeans.ts` (pure TypeScript, no deps, replay-stable); (B) use simple nearest-centroid single-pass (not proper k-means).
- Why ambiguous: Spec says "k-means" implying Lloyd's iteration; no stdlib available.
- Blocking? no — code is straightforward once decided
- Code affected: `packages/engines/src/algorithms/kmeans.ts` (new), `packages/engines/src/index.ts`
- Status: resolved
- Resolution (2026-05-20): **Option A**. Lloyd's k-means in `packages/engines/src/algorithms/kmeans.ts`. Determinism contract: sort input by student_id ASC before passing (caller responsibility); first k points after sort = initial centroids; iteration cap 20; tie-break assignment by group index ASC; no `Math.random`. Exported from `@mm/engines` barrel. 4 unit tests in `@mm/engines`.

### Q-30.2 — intelligence_audit_log.student_id NOT NULL blocks class-scoped L7 audit writes

- Date raised: 2026-05-20 (Stage 30 morning)
- Asked of: self
- Source: Arch §2.8 schema (`intelligence_audit_log.student_id uuid NOT NULL REFERENCES user_profile(id)`); ADR-0032 (Stage 29); ISSUE-0016
- Question: L7 operates at class+skill granularity (no single student_id). Options: (A) write one audit_log row per student in the class; (B) skip intelligence_audit_log for L7 — observability via intervention_alert inserts + cohort_metric_cache UPSERT; (C) new analytics_audit_log table (migration, out of budget).
- Why ambiguous: ADR-0032 established audit_log as the fallback for pipeline_event gaps; now audit_log itself is the constraint. ISSUE-0016 body drafted assuming audit_log was usable for L7.
- Blocking? yes — determines mock shape for contract tests and handler observability design
- Code affected: `supabase/functions/analytics-svc/handlers.ts`
- Status: resolved
- Resolution (2026-05-20): **Option B**. Skip `intelligence_audit_log` for L7. Extend ADR-0032 in place with Stage 30 amendment: generalised pattern — any non-session-scoped, non-student-scoped pipeline stage uses its domain artifacts as the observability surface. `// ADR-0032:` comment in handlers.ts at non-call site. ISSUE-0016 body extended to mention the audit_log gap.

### Q-30.1 — Service boundary: pipeline.teacher_refresh handler and /analytics/* endpoints

- Date raised: 2026-05-20 (Stage 30 morning)
- Asked of: product owner
- Source: ADR-0031 routing table (speculative `pipeline.l7.* → orchestration-svc`, Stage 36+); DEV_PLAN Stage 30 deliverables (`/analytics/auto-groups`, `/analytics/intervention-alerts`); arch §4.7 (analytics-svc owns these endpoints); arch §1.2 ownership table (ANL = `intervention_alert`, `cohort_metric_cache`)
- Question: Which service owns `pipeline.teacher_refresh` and the L7 read endpoints? ADR-0031 says orchestration-svc (speculative); DEV_PLAN + arch say analytics-svc.
- Why ambiguous: ADR-0031 routing entry was explicitly speculative (Stage 36+) and named the wrong owning service relative to the arch endpoint table. No analytics-svc exists.
- Blocking? yes — determines directory to build in, workspace to add, route map entry
- Code affected: `supabase/functions/analytics-svc/` (new), `supabase/functions/jobs-worker/index.ts`, `docs/dev/decisions/0031-*.md`
- Status: resolved
- Resolution (2026-05-20): **Option A — analytics-svc**. Arch §4.7 + arch §1.2 + DEV_PLAN Stage 30 are jointly authoritative. ADR-0031 speculative `pipeline.l7.* / pipeline.l9.* → orchestration-svc` entry replaced: `pipeline.teacher_refresh → analytics-svc` added (concrete); `pipeline.l9.* → orchestration-svc` retained (still speculative, Stage 31+). ADR-0033 filed (location decision).

### Q-29.4 — pipeline_event step=5 writability for L5 (no session_id)

- Date raised: 2026-05-19 (Stage 29 pre-implementation)
- Asked of: self
- Source: Stage 29 C-C-D-V, Verification step 7 ("pipeline step=5 written"); migration 0006 `pipeline_event.session_id uuid NOT NULL`.
- Question: L5 predictive-refresh has no session_id (it is student+pathway-scoped). Migration 0006 has `session_id NOT NULL REFERENCES session_record(id)`. Options: (A) Add migration to make session_id nullable; (B) skip pipeline_event for L5; use intelligence_audit_log as sole observability; (C) write pipeline_event with a sentinel/null session by bypassing the FK.
- Why ambiguous: The C-C-D-V Verification step 7 assumes step=5 is written; schema constraint makes this impossible without a migration.
- Blocking? yes — cannot write pipeline_event without session_id.
- Code affected: `supabase/functions/intelligence-svc/handlers.ts`, verification grep commands.
- Status: resolved
- Resolution (2026-05-19): **Option B**. L5 does NOT write pipeline_event. intelligence_audit_log is the sole observability surface for predictive-refresh. Documented in ADR-0032. Verification step 7 ("pipeline step=5") removed from C-C-D-V. ISSUE-0016 filed to evaluate a dedicated async_pipeline_event table for L5/L7/L9 in v1.1.

### Q-29.3 — retention_half_life source for spec §12.2 pessimistic forecast

- Date raised: 2026-05-19 (Stage 29 prep)
- Asked of: self
- Source: Spec §12.2 `forecast_mastery(student, skill, target_date)` — uses `retention_half_life(student, skill)`. No such column or computed field exists in the DB schema. `behaviour_profile` carries engagement signals but not a derived half-life.
- Question: (i) Fixed lookup by year_level in a constants file (replay-stable, no behaviour_profile noise); (ii) derive from `behaviour_profile` fields (`avg_time_on_task_ms`, `avg_guess_rate`); (iii) hardcode a single default (e.g. 60 days for all students).
- Why ambiguous: Spec references a function without a schema counterpart; deriving from behaviour_profile is feasible in v1.1 when more session data exists.
- Blocking? no
- Assumed answer (if proceeding): Option (i).
- Code affected: `packages/engines/src/constants/retention.ts` (new), `supabase/functions/intelligence-svc/handlers.ts`.
- Status: resolved
- Resolution (2026-05-19): **Option (i)**. `HALF_LIFE_DAYS_BY_YEAR_LEVEL` constant in `packages/engines/src/constants/retention.ts`: `{ y5: 60, y7: 90, y9: 120, default: 90 }`. Year level sourced from `user_profile.year_level` (already read by intelligence-svc). Replay-stable; v1.1 may replace with a derived value once more session data accumulates.

### Q-29.2 — exam_date source for §12.1 projection branch

- Date raised: 2026-05-19 (Stage 29 prep)
- Asked of: product owner
- Source: Spec §12.1 `predict_exam_readiness(student, pathway, exam_date)` uses `exam_date` as projection horizon. Spec mentions `user_profile.exam_date: date | null` (spec line 3054). No migration has this column.
- Question: (A) Add `exam_date date` to `user_profile` via new migration; (B) accept `exam_date` as an optional payload field on the predictive-refresh job (null → skip projection branch, return `projected_readiness: null`); (C) hardcode exam window per `framework_config` exam family.
- Why ambiguous: Spec requires the column; no migration has it; adding it is out of scope for the 1-day budget.
- Blocking? yes
- Code affected: `supabase/functions/intelligence-svc/handlers.ts`, `supabase/migrations/` (new migration if A).
- Status: resolved
- Resolution (2026-05-19): **Option B**. `exam_date?: string | null` on the predictive-refresh job payload. When null, `projected_readiness` and `on_track` return as null; `current_readiness_score`, per-skill mastery, gap skills, and mastery timelines still computed. `user_profile.exam_date` deferred to v1.1. Filed as ISSUE-0014 + DEV-20260519-1.

### Q-29.1 — pipeline.predictive_refresh target service

- Date raised: 2026-05-19 (Stage 29 prep)
- Asked of: product owner
- Source: DEV_PLAN Stage 29 deliverables (`/intelligence/predictions/{student_id}/{pathway_slug}`); arch §4.5 (intelligence-svc owns the predictions endpoint); ADR-0031 routing table (speculative: `pipeline.l5.*` → `analytics-svc`, Stage 32+); arch ownership table (`analytics-svc` owns `cohort_metric_cache`).
- Question: Does `pipeline.predictive_refresh` handler live in `intelligence-svc` (where arch §4.5 places the GET endpoint) or `analytics-svc` (ADR-0031 speculative L5 target)? `analytics-svc` does not exist yet; 1-day budget.
- Why ambiguous: ADR-0031's routing table was speculative for Stage 32+; it conflicts with arch §4.5 and the 1-day budget constraint.
- Blocking? yes
- Code affected: `supabase/functions/intelligence-svc/handlers.ts`, `supabase/functions/jobs-worker/index.ts`.
- Status: resolved
- Resolution (2026-05-19): **intelligence-svc**. Arch §4.5 is authoritative: `GET /intelligence/predictions/...` lives on intelligence-svc; the pipeline handler belongs there too. ADR-0031 speculative `pipeline.l5.* → analytics-svc` entry removed and replaced with concrete `pipeline.predictive_refresh → intelligence-svc` entry. ADR-0031 amended (Stage 29 note added).

### Q-28.8 — SkillGraphCache.adjacency lacks strength / dependency_class metadata for spec-required edge filters

- Date raised: 2026-05-18 (Stage 28)
- Asked of: self
- Source: spec §5.1.3 (strength ≥ 0.4 upstream filter) + §5.1.4 (dependency_class == required downstream filter); arch §5.2 (SkillGraphCache adjacency schema)
- Question: SkillGraphCache.adjacency stores only `from_node_id`/`to_node_id` (per skill-graph-cache.ts SkillEdge type). Spec §5.1.3 requires filtering edges with strength ≥ 0.4; §5.1.4 requires filtering by dependency_class == required. Neither field is available in the cache. Options: (A) Extend SkillGraphCache to carry `strength` + `dependency_class` per edge; (B) Use all edges without filtering for v1; (C) Add a separate high-strength-only adjacency map.
- Why ambiguous: SkillEdge type was designed for Stage 18 (graph caching) before L3b spec traversal filters were considered. The cache schema matches the DB `from_node_id`/`to_node_id` select in `createDbLoader.loadGraphData` but does not include edge metadata.
- Blocking? No — v1 NAPLAN/ICAS seed content contains only `required` and `supportive` edges; no `enriching` edges (strength < 0.4) exist in the seed data.
- Assumed answer: **Option B** — use all edges without filtering for v1. Grep markers `// Q-28.8:` annotate the two deferral sites in `traverseUpstreamHelper` and `traverseDownstreamHelper`. Address in v1.1 if content team adds enriching edges.
- Code affected: `supabase/functions/intelligence-svc/handlers.ts` (traverseUpstreamHelper, traverseDownstreamHelper)
- Status: resolved
- Resolution: Option B accepted 2026-05-18. All cached edges used without strength/dependency_class filtering. V1 seed content has no enriching edges — no functional difference from Option A for launch content. `// Q-28.8:` grep markers at both filter bypass sites.

### Q-28.7 — spec §5.1.4 traverse_downstream signature missing student parameter

- Date raised: 2026-05-18 (Stage 28)
- Asked of: self
- Source: spec §5.1.4 (`traverse_downstream(skill, visited)` pseudocode)
- Question: Spec §5.1.4 defines `traverse_downstream(skill, visited)` but the body calls `mastery(student, prereq_id)`. `student` is not in the signature. Without it the unmastered-prereq check in the body is unimplementable. Options: (A) Add explicit `studentId` / `masteryMap` parameter; (B) Close over a module-scope `currentStudent` — not acceptable for replay determinism; (C) Omit the mastery check and unlock all downstream unconditionally.
- Why ambiguous: Spec pseudocode is internally inconsistent — parameter list and body disagree.
- Blocking? No — choice was made to proceed with Option A.
- Assumed answer: **Option A** — add explicit `masteryMap: Map<string, number>` parameter to `traverseDownstreamHelper` (and matching parameter to `traverseUpstreamHelper` for symmetry). This is the only implementation that preserves replay determinism (ADR-0027) and matches spec intent.
- Code affected: `supabase/functions/intelligence-svc/handlers.ts` (traverseUpstreamHelper, traverseDownstreamHelper, processCausalFull)
- Status: resolved
- Resolution: Option A implemented 2026-05-18. Filed as DEV-20260518-1. Spec amendment (adding `student` to §5.1.4 signature) deferred post-launch.

### Q-28.6 — L3b traversal depth and cycle-detection contract

- Date raised: 2026-05-18 (Stage 28 §2A)
- Asked of: self
- Source: spec §5.1.3 (`traverse_upstream`) + §5.1.4 (`traverse_downstream`);
  DEV_PLAN Stage 28 ("full traverse_upstream + traverse_downstream from spec §5.1.3/4");
  no explicit cycle-cap or structured-warn contract in spec.
- Question: (a) Read spec §5.1.3/4 before coding or derive from L3a? (b) Is cycle
  detection mandatory? (c) What safety cap and on-cap behaviour?
- Why ambiguous: Spec §5.1.3/4 semantics may differ from the L3a depth-1 walk; cycle
  detection is required but the cap and on-cap behaviour (throw vs warn + partial) are
  not pinned by spec.
- Blocking? yes — determines L3b traversal shape.
- Code affected: `supabase/functions/intelligence-svc/handlers.ts`,
  `supabase/functions/_shared/intelligence-helpers.ts`.
- Status: resolved
- Resolution (2026-05-18): **Read spec §5.1.3/4 before coding** (not derived from
  L3a). Cycle detection is **non-negotiable** (content graph may contain cycles from
  authoring). Safety cap = **50 nodes per direction**. On cap hit: log structured warn
  `{ event: 'skill_graph_cycle_cap_hit', skill_id, direction, visited_count }` and
  return the **partial set** — do NOT throw. Throwing would drop the entire pipeline
  step on a content-authoring error; returning a partial set degrades gracefully and
  is detectable via the warn log.

### Q-28.5 — jobs-worker test pattern: Vitest-with-mock vs real-Postgres

- Date raised: 2026-05-18 (Stage 28 §2A)
- Asked of: self
- Source: DEV_PLAN Stage 28 exit criteria ("500 jobs enqueued, all processed, zero
  duplicates"); BUILD_CONTRACT §9 (Vitest for unit/contract; no Docker in sandbox);
  Q-28.5 pre-implementation review.
- Question: Named 500-jobs test — Vitest-with-mock (no Docker), opt-in real-Postgres,
  or both?
- Why ambiguous: Exact-once pickup with `FOR UPDATE SKIP LOCKED` is a DB-level
  guarantee; a mock can assert call count but cannot verify the lock behaviour.
- Blocking? yes — determines test architecture.
- Code affected: `supabase/functions/jobs-worker/__tests__/contract.test.ts`.
- Status: resolved
- Resolution (2026-05-18): **Both.** (1) Vitest-with-mock: mock the Supabase client;
  assert 500 `UPDATE` calls and zero duplicates — verifies the worker loop logic.
  Named: `'500 jobs enqueued, all processed, zero duplicates'`. (2) Opt-in
  real-Postgres integration test guarded with
  `test.skip(process.env.DOCKER_AVAILABLE !== '1', ...)` — verifies the actual
  `FOR UPDATE SKIP LOCKED` guarantee when Docker is available. Both tests ship in
  the same `contract.test.ts`; CI skips the integration test in the sandbox.

### Q-28.4 — job_queue schema additions: which columns?

- Date raised: 2026-05-18 (Stage 28 §2A)
- Asked of: self
- Source: Stage 9 migration (outbox-dispatcher + job_queue); DEV_PLAN Stage 28
  ("retry + dead-letter state in jobs-worker"); ADR-0031 (retry ownership).
- Question: Which columns need to be added to `job_queue` if absent from Stage 9
  migration: `status`, `dead_lettered_at`, `failure_reason`, `next_attempt_at`,
  `attempt_count`?
- Why ambiguous: Stage 9 may have shipped `attempt_count` and `max_attempts` without
  the richer dead-letter fields. Reading the migration before deciding is required.
- Blocking? yes — determines whether a new ALTER TABLE migration is needed.
- Code affected: `supabase/migrations/` (new migration if columns absent).
- Status: resolved
- Resolution (2026-05-18): **Default column set approved — add via migration if
  absent.** Required columns: `status` text (`pending` | `processing` | `completed` |
  `failed` | `dead_lettered`), `dead_lettered_at timestamptz`, `failure_reason text`.
  `attempt_count int` and `max_attempts int` presumed present from Stage 9. Read the
  Stage 9 migration first (Q-28.3 discipline); write ALTER TABLE migration for any
  missing column.

### Q-28.3 — job_queue schema: read migration before coding

- Date raised: 2026-05-18 (Stage 28 §2A)
- Asked of: self
- Source: DEV_PLAN Stage 28 deliverables; Stage 9 migration (cron + job_queue schema).
- Question: Can we assume the Stage 9 migration already has the columns jobs-worker
  needs (`attempt_count`, `max_attempts`, `next_attempt_at`, `status`, etc.) or must
  we read it first?
- Why ambiguous: Stage 9 was built before jobs-worker was designed; the exact column
  set is not quoted in any later ADR.
- Blocking? yes — determines migration scope.
- Code affected: `supabase/migrations/`, `supabase/functions/jobs-worker/handlers.ts`.
- Status: resolved
- Resolution (2026-05-18): **Read the Stage 9 migration first** — never assume. If
  required columns are absent, write an ALTER TABLE migration (next sequential number).
  Do not write worker code against columns that may not exist; grep the migration SQL
  for each column name before referencing it.

### Q-28.2 — jobs-worker HTTP architecture: inline logic vs HTTP dispatch

- Date raised: 2026-05-18 (Stage 28 §2A)
- Asked of: product owner
- Source: DEV_PLAN Stage 28 ("generic job worker"); OWNERS.md (intelligence-svc owns
  pipeline steps); ADR-0027 (intelligence-svc replay determinism boundary).
- Question: Does jobs-worker contain L3b logic inline, or dispatch to intelligence-svc
  via HTTP per job_type?
- Why ambiguous: Inline is simpler; HTTP dispatch preserves OWNERS.md ownership model
  and ADR-0027 determinism boundary but adds an internal HTTP hop in the async path.
- Blocking? yes — determines fundamental architecture.
- Code affected: `supabase/functions/jobs-worker/`, `supabase/functions/intelligence-svc/`.
- Status: resolved
- Resolution (2026-05-18): **HTTP dispatch per ADR-0031.** jobs-worker = generic
  runtime only. Each `job_type` maps to an owning service URL. `pipeline.causal.
  evaluate_full` → `POST /intelligence/pipeline/causal-full` (service-role key +
  `x-mm-trace-id` propagated). Retry + backoff state owned by jobs-worker. Domain
  logic + replay determinism boundary stay in intelligence-svc. ADR-0031 accepted.

### Q-28.1 — ISSUE-0006 (L3a bypasses skill-graph-cache): in scope for Stage 28?

- Date raised: 2026-05-18 (Stage 28 §2A)
- Asked of: product owner
- Source: ISSUE-0006 (intelligence-svc L3a bypasses skill-graph-cache — filed Stage 21
  as architectural-consistency gap vs arch §9.3); ADR-0028 (skill-graph-cache as sole
  read path); DEV_PLAN Stage 28 (L3b full traversal also needs skill graph).
- Question: Fix ISSUE-0006 in Stage 28 (replace L3a direct `skill_edge` query with
  `getSkillGraph()`) or defer further?
- Why ambiguous: ISSUE-0006 was deferred from Stage 21; Stage 28 introduces L3b which
  ALSO reads the skill graph, making a unified `getSkillGraph()` call path the natural
  consolidation point.
- Blocking? no (ISSUE-0006 does not block L3b correctness, only architectural consistency).
- Code affected: `supabase/functions/intelligence-svc/handlers.ts` (L3a section).
- Status: resolved
- Resolution (2026-05-18): **YES — fix in Stage 28.** Replace direct `skill_edge`
  query in L3a with `getSkillGraph()` call. L3b also reads via `getSkillGraph()`.
  After this stage, `grep -n 'skill_edge' supabase/functions/intelligence-svc/handlers.ts`
  must return 0 hits. ISSUE-0006 closed at Stage 28 evening.

### Q-26.5 — CI migration dry-run: wire Supabase CLI action or keep placeholder?

- Date raised: 2026-05-16 (Stage 26 §2A)
- Asked of: self
- Source: `.github/workflows/ci.yml` `migration-dryrun` job — `echo "TODO Stage 2
  follow-up"` placeholder since Stage 2 close; PROJECT_STATE.md pre-deploy gate note.
- Question: Wire the `supabase/setup-cli` action + `supabase db push --dry-run` step,
  or leave the TODO placeholder for another session?
- Why ambiguous: Requires `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_ID` GitHub Secrets
  that may not yet be provisioned; wiring without secrets would cause CI to fail rather
  than silently pass.
- Blocking? no.
- Code affected: `.github/workflows/ci.yml`.
- Status: resolved
- Resolution (2026-05-16): **Wire with graceful skip.** Use `supabase/setup-cli` +
  `supabase db push --dry-run` pattern. Add a preflight check: if
  `SUPABASE_ACCESS_TOKEN` secret is absent, print a warning and `exit 0` (job
  skips, not fails). Consistent with the E2E job's graceful-skip pattern (Q-26.4).
  Closes the Stage 2 `echo "TODO"` placeholder.

### Q-26.4 — E2E CI job wiring: in scope for Stage 26?

- Date raised: 2026-05-16 (Stage 26 §2A)
- Asked of: product owner
- Source: Q-19.9 resolution ("CI integration deferred to Stage 26"); PROJECT_STATE.md
  ("5 E2E specs all `test.skip()`-guarded; CI integration is Stage 26 deliverable per
  Q-19.9"); `apps/web/playwright/e2e/` — 5 specs.
- Question: Wire the Playwright E2E CI job in Stage 26, with graceful skip when secrets
  absent? Or carry forward?
- Why ambiguous: Requires new CI job + `E2E_WEB_URL`/`E2E_BASE_URL`/`E2E_SUPABASE_ANON`
  GitHub Secrets; specs remain `test.skip()`-guarded until a real backend is deployed.
  No practical test coverage until secrets are provisioned, but the CI wiring itself is
  a Stage 26 deliverable per Q-19.9.
- Blocking? no.
- Code affected: `.github/workflows/ci.yml`, `apps/web/playwright.config.ts`.
- Status: resolved
- Resolution (2026-05-16): **Include.** Add `e2e` job to `.github/workflows/ci.yml`.
  Job runs `pnpm exec playwright test`; skips gracefully when `E2E_WEB_URL` is absent
  (`if: env.E2E_WEB_URL != ''` guard at job level, or check in a preflight step).
  Specs remain `test.skip()`-guarded in source — un-gating is a separate pass once
  secrets are provisioned and a real backend is deployed.

### Q-26.3 — ISSUE-0008 (error code reconciliation) scope for Stage 26?

- Date raised: 2026-05-16 (Stage 26 §2A)
- Asked of: product owner
- Source: ISSUE-0008; `packages/types/src/shared.ts` `ErrorCodeSchema` (15 codes; no
  `LOCK_CONFLICT`); `grep -nE "'CONFLICT'|'LOCK_CONFLICT'" supabase/functions/*/handlers.ts`
  across all 5 dispatchers.
- Question: Fix all 5 dispatchers in Stage 26, or just `@mm/types` schema + assessment-svc?
- Why ambiguous: Full reconciliation across 5 dispatchers (auth-svc, users-svc, content-svc,
  assessment-svc, intelligence-svc) may push past the 2-day budget; narrowing to the schema
  change + most-used dispatcher leaves a clean ISSUE-0008 residual.
- Blocking? no.
- Code affected: `packages/types/src/shared.ts`, `supabase/functions/*/handlers.ts`.
- Status: resolved
- Resolution (2026-05-16): **Grep-first, then scope.** Run `grep -nE "'CONFLICT'|'LOCK_CONFLICT'"
  across all 5 dispatcher `handlers.ts` files before touching anything. `@mm/types`
  `ErrorCodeSchema` addition + assessment-svc reconciliation are confirmed in scope.
  For other dispatchers: if the grep shows the same two bare strings (quick-fix pattern),
  fix them all in one sweep; if any dispatcher needs deeper investigation, narrow
  ISSUE-0008 to "remaining N dispatchers" and keep open. Implementation decides.

### Q-26.2 — ISSUE-0007 (SDK X-Session-Lock plumbing) in scope for Stage 26?

- Date raised: 2026-05-16 (Stage 26 §2A)
- Asked of: product owner
- Source: ISSUE-0007; ADR-0026 (lock-token rotation per respond);
  `packages/sdk/src/client.ts` + `packages/sdk/src/hooks/session.ts`.
- Question: Include ISSUE-0007 SDK `X-Session-Lock` header plumbing in Stage 26, or
  defer to the pre-launch sweep?
- Why ambiguous: SDK fix touches `MmClient.request` + `useRecordResponse` +
  `useCheckpoint` + `useAbandon` + contract tests; expands scope beyond the DEV_PLAN
  deliverables; correctness gap that E2E will surface the moment CI secrets are provisioned.
- Blocking? no.
- Code affected: `packages/sdk/src/client.ts`, `packages/sdk/src/hooks/session.ts`,
  `packages/sdk/src/__tests__/client.test.ts` (+ new hook tests).
- Status: resolved
- Resolution (2026-05-16): **Include.** Extend `MmClient.request` with optional
  `lockToken?: string` (writes `X-Session-Lock` header when set). Extend
  `useRecordResponse`, `useCheckpoint`, `useAbandon` to track the `lock_token` from the
  prior response in component state and pass it into the next mutation automatically.
  Add SDK contract tests (~5 new tests). If a non-obvious design choice surfaces during
  implementation, file **ADR-0031**; default = component-state storage, explicit rotation
  in mutation return value.

### Q-26.1 — Replay determinism script: pure-function or requires live DB?

- Date raised: 2026-05-16 (Stage 26 §2A)
- Asked of: self
- Source: DEV_PLAN Stage 26 deliverables ("`scripts/test-scoring.ts` — replay 50
  deterministic sessions and assert byte-identical `skill_mastery` rows");
  ADR-0027 (replay-determinism discipline; existing
  `packages/intelligence-svc/__tests__/contract.test.ts` replay test is pure-function).
- Question: Does `scripts/test-scoring.ts` need a live DB to check `skill_mastery`
  rows, or can it replay through `@mm/engines` + intelligence-svc helpers in-process?
- Why ambiguous: DEV_PLAN says "assert byte-identical `skill_mastery` rows" — language
  implying a DB round-trip; ADR-0027's existing test is pure-function with no DB.
- Blocking? yes — determines whether the script can run in the sandbox.
- Code affected: `scripts/test-scoring.ts` (new); `package.json` (`pnpm test:replay`).
- Status: resolved
- Resolution (2026-05-16): **Pure-function shape, mirroring ADR-0027.** Script runs via
  `pnpm tsx scripts/test-scoring.ts` with a fixed seed; no DB or deployed environment
  needed. Replays 50 sessions through `@mm/engines` pure functions + intelligence-svc
  helpers in-process; checks that the computed `skill_mastery` output objects are
  byte-identical across two runs with the same seed. Exit non-zero on any mismatch.
  "Byte-identical `skill_mastery` rows" in DEV_PLAN refers to the in-memory computed
  output structure, not a Postgres SELECT.

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

### Q-25.4 — Locked pathway tiles: show grayed or hide

- Date raised: 2026-05-15 (Stage 25 §2A)
- Asked of: self
- Source: `packages/types/src/content.ts` `PathwayDTOSchema` (`entitled: boolean`,
  `locked_reason: string | null`); SCREEN_SPECS §7 + UI_CONTRACT (no explicit
  locked-tile rule for Dashboard).
- Question: Render locked pathways as grayed tiles (with lock icon + `locked_reason`)
  or omit them entirely from the Dashboard quick-start grid?
- Why ambiguous: SCREEN_SPECS §8 (Session Selection) hides locked pathways behind a
  "Locked" section heading, but Screen 7 (Dashboard) is silent on the treatment.
- Blocking? yes — affects tile layout and empty-state logic.
- Assumed answer if proceeding: Show grayed tile with lock icon.
- Code affected: `apps/web/src/app/(student)/dashboard/page.tsx`.
- Status: resolved
- Resolution (2026-05-15): **Show grayed tile with lock icon + `locked_reason` text
  (or "Upgrade to access" fallback if `locked_reason` is null)**. Consistent with
  NAPLAN entitlement model: students should see what pathways exist and why they are
  locked, not have options silently hidden.

### Q-25.3 — Engagement strip streak source

- Date raised: 2026-05-15 (Stage 25 §2A)
- Asked of: self
- Source: SCREEN_SPECS §7 engagement strip ("streak + sessions-this-week");
  no streak DTO in v1; `SessionSummaryDTO` carries `submitted_at` which can
  be used for sessions-this-week.
- Question: Render engagement strip with real data, stub "—", or omit entirely?
- Why ambiguous: No streak DTO or server endpoint in v1; client-side computation
  for sessions-this-week is feasible but streak is not.
- Blocking? no.
- Assumed answer if proceeding: Option A (render strip with stub streak).
- Code affected: `apps/web/src/app/(student)/dashboard/page.tsx`.
- Status: resolved
- Resolution (2026-05-15): **Option A — render engagement strip**. Streak displayed
  as "—" with "Coming soon" micro-text. Sessions-this-week computed client-side from
  `useListRecentSessions` result (filter `submitted_at` within current ISO calendar
  week). Strip renders in all states including empty-sessions.

### Q-25.2 — Mastery snapshot data source

- Date raised: 2026-05-15 (Stage 25 §2A)
- Asked of: self
- Source: DEV_PLAN.md Stage 25 deliverables ("mastery snapshot from
  `/intelligence/learner-profile`"); `packages/sdk/src/hooks/intelligence.ts`
  (`useLearningDNA`, `useSkillProgress`, `useCausalMap` all gated Stage 28+);
  `SessionSummaryDTO.skills_touched_count` (available in v1).
- Question: Pure stub (zero data) or aggregate `skills_touched_count` from
  `useListRecentSessions` as a "skills touched" count? And should a ProgressBar
  at 0% ship alongside the stat?
- Why ambiguous: Intelligence hooks are Stage 28+; `skills_touched_count` provides
  a truthful count but is not a mastery percentage. A 0% bar is visually misleading.
- Blocking? yes — affects component design.
- Assumed answer if proceeding: Option B (aggregate) + no ProgressBar.
- Code affected: `apps/web/src/app/(student)/dashboard/page.tsx`.
- Status: resolved
- Resolution (2026-05-15): **Option B — `StatTile` showing summed `skills_touched_count`
  across all `SessionSummaryDTO` entries, labelled "Skills touched". No ProgressBar
  (0% bar is visually misleading per §2A resolution). Add "Full mastery data in a
  future release" micro-text beneath the stat. File ISSUE-0011(f) to track the
  upgrade path.** Stat is truthful and non-zero after one session; stub copy sets
  expectations without implying regression.

### Q-25.1 — Stage 25 route target: `(student)/page.tsx` vs `dashboard/page.tsx`

- Date raised: 2026-05-15 (Stage 25 §2A)
- Asked of: self
- Source: DEV_PLAN.md Stage 25 deliverables
  (`apps/web/src/app/(student)/page.tsx`); existing
  `apps/web/src/lib/auth/role-home.ts` (`student → '/dashboard'`);
  `apps/web/src/middleware.ts` redirects to `getRoleHome('student')`.
- Question: Build Stage 25 at `(student)/page.tsx` (as DEV_PLAN states) or
  replace `(student)/dashboard/page.tsx` (which middleware actually routes to)?
- Why ambiguous: DEV_PLAN file path conflicts with the load-bearing routing layer.
- Blocking? yes — wrong file = unreachable page.
- Assumed answer if proceeding: Replace `dashboard/page.tsx`.
- Code affected: `apps/web/src/app/(student)/dashboard/page.tsx`.
- Status: resolved
- Resolution (2026-05-15): **Replace `apps/web/src/app/(student)/dashboard/page.tsx`**.
  Middleware routes students to `/dashboard`; a root-level `(student)/page.tsx`
  would be unreachable. DEV_PLAN route was authored pre-crystallisation of the
  middleware + role-home layer. Deviation logged as **DEV-20260515-1**.

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
