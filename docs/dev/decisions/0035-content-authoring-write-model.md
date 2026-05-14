# ADR-0035 — Content Authoring Write Model (item / item_version / stimulus)

- Status: proposed
- Date: 2026-05-14
- Stage: v1.1-S1
- Tags: backend | data | security | dx

## Context

v1.1 Stage 1 delivers write-side CRUD for the content authoring layer: create/update items,
manage item versions, attach stimuli, and drive lifecycle transitions. The `item`,
`item_version`, and `stimulus` tables were authored in `supabase/migrations/0002_content_skill_graph.sql`
for read use in v1. All five structural decisions below concern how writes on that existing
schema are authorised and executed in v1.1.

The schema relevant to this ADR (migration 0002, verbatim):

- `item_lifecycle AS ENUM ('draft', 'review', 'active', 'monitored', 'retired')` — migration 0001
- `item.lifecycle item_lifecycle NOT NULL DEFAULT 'draft'`
- `item_version.metadata jsonb NOT NULL DEFAULT '{}'` — author attribution field
- `idx_item_version_current_one UNIQUE ON item_version(item_id) WHERE is_current = true`
  — enforces at most one current version per item (T1 citation: migration 0002 lines 209–210)

Spec §15.3 defines the lifecycle FSM verbatim (T1 read 2026-05-14). Six legal edges only;
`draft → retired` is explicitly absent from the spec diagram.

No schema changes are needed in Stage 1. Write-side endpoints operate on the existing schema.

## Options considered

### Decision 1 — Write authorisation model

1. **Pattern G strict** — writes restricted to `platform_admin` + `service-role` only. RLS
   policies mirror `skill_node` / `skill_edge` pattern established in migration 0002.
   Pros: consistent with v1 pattern; simplest RLS surface; no teacher-role plumbing needed.
   Cons: teachers cannot author in Stage 1 (deferred).
2. **Pattern F (multi-role)** — `platform_admin` + `teacher` + `service-role` write access.
   Pros: unlocks teacher authoring immediately.
   Cons: requires teacher-role JWT claims in content-svc; out of scope for Stage 1 budget.

### Decision 2 — Ownership scope

1. **Platform-only Stage 1** — only `platform_admin` (via Admin UI / direct API) and
   `service-role` (batch ingest) can create/update items.
   Pros: no per-tenant isolation needed; simpler RLS; consistent with v1.
   Cons: teacher authoring not available until a future stage.
2. **Teacher authoring in Stage 1** — per-tenant write access from Stage 1.
   Pros: feature available sooner.
   Cons: requires per-tenant content isolation model (scoping item to tenant), not yet designed.

### Decision 3 — Lifecycle FSM edge set

1. **Spec §15.3 verbatim** — 6 edges: `draft→review`, `review→active`, `active→monitored`,
   `active→retired`, `monitored→active`, `monitored→retired`.
   `draft→retired` excluded (not in spec).
   Pros: spec-authoritative; no invented paths; T1 confirms enum values match exactly.
   Cons: none.
2. **Extended set (add `draft→retired`)** — allow direct retire from draft.
   Pros: convenience for discarding unwanted drafts.
   Cons: speculative; not in §15.3; rejected.

### Decision 4 — Author attribution

1. **`item_version.metadata.author_id`** — store the authoring user's UUID in the existing
   `metadata jsonb` field. No schema change.
   Pros: zero migration cost; metadata is already `NOT NULL DEFAULT '{}'`.
   Cons: not queryable via index (acceptable for Stage 1 admin use).
2. **New `author_id uuid` column on `item_version`** — typed FK to `user_profile`.
   Pros: indexed; type-safe.
   Cons: requires new migration; increases schema surface; premature until teacher authoring
   scope is decided (Decision 2).

### Decision 5 — Idempotency

All `POST /content/items`, `PATCH /content/items/:id`, `POST /content/items/:id/versions`, and
`PATCH /content/items/:id/lifecycle` endpoints carry `Idempotency-Key` header (arch §4.8).
Consistent with all other content-svc and assessment-svc write endpoints.

### Decision 6 — Atomic is_current flip

`item_version` version promotion uses the existing `idx_item_version_current_one` unique partial
index constraint (`UNIQUE ON item_version(item_id) WHERE is_current = true`). Writer contract
(migration 0002 comment, lines 205–206): `UPDATE` prior current row to `is_current = false`
**before** `INSERT` of new row. Violating the order causes unique constraint violation — the
correct failure mode.

## Decision

1. **Pattern G strict** writes — `platform_admin` + `service-role` only.
2. **Platform-only ownership** in Stage 1. Teacher authoring deferred.
3. **Spec §15.3 verbatim** — 6 edges; `draft → retired` excluded.
4. **`item_version.metadata.author_id`** — no new column.
5. **Idempotency-Key** on all `POST` / `PATCH` endpoints.
6. **Atomic is_current flip** via existing `idx_item_version_current_one` constraint.

## Rationale

Pattern G strict (Decision 1 + 2): Migration 0002 already uses Pattern G for `skill_node` and
`skill_edge` writes. Applying the same pattern to `item` / `item_version` / `stimulus` is
consistent with established RLS conventions. Teacher authoring requires per-tenant content
isolation design — a separate ADR and migration when that scope is ready.

Spec §15.3 verbatim (Decision 3): T1 read confirms the `item_lifecycle` enum exactly matches the
spec's 5 states. All 6 allowed transitions are present in the spec; `draft → retired` is absent.
Implementing undocumented transitions would constitute spec drift — rejected per Q-1.1-1.2.

metadata.author_id (Decision 4): The `metadata jsonb` field was explicitly designed as an
extension point. Deferring a typed `author_id` column until teacher authoring scope is resolved
avoids a throwaway migration (Decision 2 is still evolving). Admin use cases are satisfied with
a `metadata->>'author_id'` filter.

## Consequences

- Positive: Zero new migrations in Stage 1. Write endpoints implement on existing schema.
- Positive: RLS surface is minimal and consistent with v1 patterns.
- Negative: Author attribution not indexed; full table scan required for per-author queries at scale.
- Follow-ups: When teacher authoring ships, add `author_id uuid REFERENCES user_profile(id)` to
  `item_version` (new migration), update RLS to Pattern F, update ADR-0035.

## Implementation notes

Files: `supabase/functions/content-svc/` · `supabase/migrations/0002_content_skill_graph.sql` (read-only reference)
Commit: v1.1-S1 impl commit (TBD)
Related: Q-1.1-1.1..1.4, DEV-20260514-1, spec §15.3, migration 0002 lines 161–210
