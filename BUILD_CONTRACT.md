# MindMosaic — Build Contract v1.0

**Status:** Active. Governs all v1 work through the 75-day ship.
**Authority:** This document + `DEV_PLAN.md` + `mindmosaic-spec-v4_4.md` Part III.5 define what ships in v1. Anything in `mindmosaic-spec-v4_4.md` or `mindmosaic-backend-arch-v2_0.md` not listed here is **deferred per `DEV_PLAN.md` §5**.

This is the persistent authority on engineering rules. All work must comply. Deviations require explicit justification in the commit body and a linked entry in `docs/dev/DEVIATIONS.md`.

---

## 1. Core Principles

- **Configuration over code.** New pathways/exams are added via `framework_config`, `assessment_profile`, `blueprint` rows. No engine refactor per pathway.
- **Engine–Framework separation.** Engines implement `AssessmentEngine`; routing/scoring rules are injected via config.
- **Skill-graph-first.** All analytics, mastery, and recommendations anchor to the unified skill taxonomy.
- **Evidence-based intelligence.** Every insight traces to `learning_event` + `intelligence_audit_log`. Zero hallucination.
- **Privacy by design.** RLS on every tenant-scoped table from day 1. PII never appears in logs or metrics.
- **Vertical slices.** Build end-to-end features (Auth → Session → Score → Dashboard → Billing) before hardening infra.
- **Server authority.** Client timers are decorative; the server is authoritative for state transitions, scoring, and idempotency.

---

## 2. v1 Scope Boundary (75-day ship)

### In scope for v1

| Area           | Scope                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Auth & Tenancy | Parent self-signup (auto-creates family tenant); student creation via parent; school tenants seeded only                            |
| Pathways       | NAPLAN Y5 Numeracy + ICAS Math Paper C only                                                                                         |
| Engines        | AdaptiveEngine (NAPLAN), LinearEngine (ICAS), SkillEngine (practice), DiagnosticEngine                                              |
| Intelligence   | L1 Foundation, L2 Behaviour, L3a Causal-scoped (sync); L3b-full, L5 Predictive, L7 Teacher, L9 Orchestration (async, from Stage 28) |
| Content        | 50 items, 10 misconceptions, 2 stimuli, synthetic-but-schema-valid where content author unavailable                                 |
| Dashboards     | Student (minimal → full), Parent, Teacher                                                                                           |
| Assignments    | Create / publish / start / track                                                                                                    |
| Notifications  | In-app only (`assignment_assigned`, `plan_updated`, `intervention_alert`)                                                           |
| Billing        | Stripe checkout + webhook + feature flag propagation (Free/Standard/Premium) — **Stages 42–47 only**                                |
| Observability  | Structured logs, trace ID propagation, basic metrics                                                                                |
| Testing        | Tenant isolation CI gate, contract tests, replay determinism                                                                        |

### Explicitly deferred to v1.1+

See `DEV_PLAN.md` §5 for full list. High-impact deferrals:

- RepairEngine + repair sequence authoring (P1.2)
- L4 Concept Repair async pipeline (P1.2)
- L6 Stretch, L8 Content Intelligence Loop, §17 Cross-pathway (P2)
- Skill graph migration worker (P1.1)
- Long-term plans, pathway switching, exam countdown (P2.4)
- Selective Entry, Singapore Math, Olympiad pathways (P3)
- Institutional tier, SSO, bulk invite, custom branding (P3)
- Stripe dunning, refund flow (P1.4)
- Full data subject rights with grace (P1.3)
- Engagement (streaks, achievements, nudges) (P2.5)
- 10k load test, full WCAG audit, mobile polish, security audit (P3)
- OpenTelemetry + Sentry — replaced by Supabase logs + Vercel errors in v1 (P1.5)
- Intelligence audit log cold storage (P2.6)

Phase-2 features in code must be either entirely absent or stubbed with `// PHASE-2:` comments and "Available in a future release" UI copy. Grep-detectable.

---

## 3. Naming & Type Contracts

- **Database:** `snake_case` for tables, columns, enums, policies. `timestamptz` with `DEFAULT now()`. UUIDs via `gen_random_uuid()`.
- **TypeScript:** Strict mode enabled. **Zero `any` allowed.** `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature` all on.
- **DTOs:** Defined in `packages/types` with paired Zod schemas. `SCHEMA_VERSION` constant bumps on breaking changes. Client sends `X-Client-Version`; server logs mismatches (no rejection — see spec Part III.5 §V1.3).
- **Branded IDs:** Use `TenantId`, `UserId`, `SessionId`, etc. from `@mm/types`. Raw `string` for IDs in function signatures is a merge blocker.

---

## 4. API & Error Conventions

- **Versioning:** Path-based (`/api/v1/...`). Breaking change → new path.
- **Error envelope:** All errors return `{ error: { code, message, status, details?, trace_id } }` per Arch §1.5.
- **Idempotency:** `POST`/`PATCH`/`DELETE` accept `Idempotency-Key: <uuid>`. Flow enforced via `api_idempotency_key` table. Duplicate in-flight → `409 IDEMPOTENCY_IN_FLIGHT`; same key different body → `422 IDEMPOTENCY_MISMATCH`.
- **Rate limiting:** Table-backed (`rate_limit_bucket`) with atomic `INSERT ... ON CONFLICT DO UPDATE`. **In-memory counters are forbidden.**

---

## 5. Spec Gap Resolutions (binding)

Six decisions resolve open questions in the spec and mockups. All v1 work must comply. **Full detail and rationale are in `mindmosaic-spec-v4_4.md` Part III.5.** This section is the index.

| ID     | Gap                                                                 | Resolution (one-line)                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G1** | How does a new user acquire a tenant?                               | Parent signup auto-creates a `family` tenant. Student direct signup rejected. School tenants by `platform_admin` script only in v1.                                                           |
| **G2** | How are subscription/feature flags managed before Stripe ships?     | Stages 1–41: zero Stripe code. Flags via seed + `scripts/set-tenant-tier.ts`. Stripe becomes authoritative writer from Stage 42.                                                              |
| **G3** | What does the server do on `X-Client-Version` mismatch?             | **Log only, no rejection.** A stale client mid-session is safer than a forced disconnect.                                                                                                     |
| **G4** | What stops a skill graph republish from orphaning student data?     | SQL-level guard inside `publish_skill_graph()` blocks republish when downstream data exists, unless `app.allow_unsafe_publish=true` (seed only). Removed when migration worker ships in v1.1. |
| **G5** | How much seed content does v1 actually need?                        | 50 items (25 NAPLAN + 25 ICAS), 10 misconceptions, 2 stimuli, 3 difficulty tiers. Validated by `scripts/validate-content.ts` in CI.                                                           |
| **G6** | Three different orange accents in the mockups — which is canonical? | `--accent-500 #ef6843` in-app · `--accent-400 #ef8c56` on purple surfaces · `--accent-300 #f9a825` marketing landing only.                                                                    |

---

## 6. Security & Data Integrity

- **RLS** mandatory on all tenant-scoped tables. Use `auth_tenant_id()`, `auth_user_id()`, `auth_role()`. CI runs tenant-isolation tests on every commit — **zero cross-tenant reads** across two seeded tenants.
- **RLS cross-table subquery rule (ADR-0005, binding).** Any RLS policy that must reference another tenant-scoped table with RLS enabled must call a `SECURITY DEFINER` helper function (prefix `fn_`), never an inline subquery. Inline cross-table subqueries cause infinite recursion because PostgreSQL cannot fold `STABLE` functions to constants at plan time. Each helper: `SET search_path = public, pg_temp`; **triple REVOKE** (`REVOKE EXECUTE FROM PUBLIC`; `REVOKE EXECUTE FROM authenticated`; `REVOKE EXECUTE FROM anon`); `GRANT EXECUTE TO authenticated`; `STABLE`; returns ids only. `REVOKE FROM PUBLIC` strips the pseudo-role; `REVOKE FROM authenticated` and `REVOKE FROM anon` strip the direct grants that Supabase default privileges auto-apply to those roles on every new function (A1 correction Stage 8: the prior "PUBLIC × 2 + anon" pattern was wrong — the second PUBLIC revoke was a no-op; supersedes BUG-C Stage 5 wording). Reviewers must reject any new SECURITY DEFINER helper missing the triple REVOKE.
- **Stripe webhooks** signature-verified within 300ms before any state change. Invalid → `400` + `billing_event` row with `processing_error='invalid_signature'`. (Stages 42+ only.)
- **PII redaction.** Logging middleware strips `response_data`, `stem`, `payload.answers`, raw webhook bodies. Only `student_id`/`tenant_id` logged for correlation.
- **Admin audit.** Every `org_admin`/`platform_admin` write to mutable config, subscription, or feature-flag tables writes a row to `admin_action_log`.
- **Parameterised queries only.** Raw SQL string concatenation in application code is a merge blocker.
- **No secrets in repo.** Pre-commit hook enforces; CI fails on any `STRIPE_*`, `SUPABASE_SERVICE_ROLE_KEY`, or `*_SECRET_KEY` found outside `.env.example` or documentation.

---

## 7. Observability & Tracing

- **Trace ID:** Read `X-Trace-Id` at edge; generate UUID if absent. Propagate to DB via `set_config('app.trace_id', ...)`, to jobs via `job_queue.payload.trace_id`, to external API calls.
- **Structured logs:** JSON with mandatory fields — `timestamp`, `level`, `service`, `trace_id`, `tenant_id`, `user_id`, `endpoint`, `status_code`, `duration_ms`, `error_code`, `client_version`, `client_version_mismatch`.
- **v1 stack:** Supabase logs + Vercel error dashboard. **No OpenTelemetry, no Sentry in v1** — added in v1.1 (P1.5).

---

## 8. Database & Pipeline Rules

### Mutability classes (Arch §1.3)

- **Immutable:** `learning_event`, `session_response`, `response_telemetry`, `item_version`, `billing_event`. Never `UPDATE` or `DELETE`.
- **Append-only:** `intelligence_audit_log`, `plan_revision`, `admin_action_log`, `outbox_event`. Only `INSERT`. Cleanup via retention jobs.
- **Controlled mutable:** `session_record`, `learning_plan`, `assignment`. Specific columns only, via owning service, with optimistic locking where noted.
- **Mutable:** `skill_mastery`, `learning_velocity`, `behaviour_profile`, `student_misconception`, `feature_flag`, `subscription`, `user_profile`, `engagement_streak`, `notification`. Standard `UPDATE` by owner service.

### Pipeline SLAs

- **Sync (L1–L3a):** < 3s. Runs inline from `/sessions/submit`.
- **Async (L3b, L5, L7, L9):** < 30s. Via `job_queue` + `pipeline_event` rows.
- **L4/L6/L8:** deferred to v1.1+.

### Outbox pattern

- Domain writes + `outbox_event` insert in one transaction.
- Edge-function dispatcher polls `outbox_event WHERE processed_at IS NULL` every 2s with `FOR UPDATE SKIP LOCKED`, dispatches to `job_queue`.
- **Direct `INSERT INTO job_queue` from application code is forbidden** except by the dispatcher itself.

### Partitioning

- `learning_event` partitioned monthly from Stage 5 (pg_partman, default partition provided).
- `intelligence_audit_log` partitioned monthly from Stage 6.
- Other tables: standard + indexes. Re-partition at >5M rows.

### Skill graph

- Draft → Publish flow with code guard (see spec Part III.5 §V1.4).
- Published graphs are immutable. Migration worker is v1.1 only; **no production republish in v1**.

---

## 9. Frontend & UX Rules

**Authoritative UI specification:** `UI_CONTRACT.md` — tokens, components, shells, a11y gate, microcopy, divergences.
**Authoritative per-screen functional spec:** `SCREEN_SPECS.md` — fields, validations, actions, API calls, states, out-of-scope per screen.

The rules below are the mandatory subset enforced at CI/merge level. Anything in `UI_CONTRACT.md` or `SCREEN_SPECS.md` still applies; this section is the non-negotiable floor.

- **Stack:** Next.js 14 App Router, React Query, TypeScript strict, Tailwind + CSS tokens in `packages/ui/tokens.css`.
- **Role routing:** Layouts `(student)`, `(parent)`, `(teacher)`, `(admin)`, `(public)`. Middleware enforces role separation; layouts re-check as defence in depth.
- **Widget states:** Every data-bound component renders `Loading` (skeleton matching final shape), `Empty` (descriptive), `Error` (message + retry, 402 → upgrade prompt). **No spinners inside cards.**
- **Accessibility (v1 minimum):**
  - Keyboard navigation on exam/practice/results screens (Stage 23 exam screen is the critical path)
  - `aria-live` for timers and feedback on exam screen
  - Focus management on question transitions
  - `axe-core` in CI from Stage 13 onward; zero serious/critical on exam, results, and signup screens
  - Full WCAG audit → v1.1
- **Session rules:**
  - Client timer decorative; server authoritative
  - Autosave fire-and-forget every 30s + on blur; never blocks UI
  - Offline queue with idempotent replay on reconnect
  - Lock token in `X-Session-Lock` on every `/respond`
  - Version conflict → re-fetch `/sessions/{id}/state` and reconcile

---

## 10. Testing & CI Gates

### Required to pass before `git push origin main`

- Migrations `up`/`down` apply cleanly
- Tenant isolation test: 2 tenants, **0 cross-reads** across every tenant-scoped table
- Zero TS errors, zero ESLint errors
- Contract tests match Zod schemas
- `docs/dev/DAILY_LOG.md` and `docs/dev/PROJECT_STATE.md` updated
- axe-core passes on any touched UI stories
- New endpoints: rate limit, idempotency, feature flag considered; `OWNERS.md` updated

### Performance budgets (any regression >10% fails review)

| Metric                     | Budget   |
| -------------------------- | -------- |
| Item delivery p95          | ≤ 200 ms |
| Session create p95         | ≤ 1 s    |
| Session respond p95        | ≤ 300 ms |
| Session submit p95         | ≤ 5 s    |
| Pipeline sync portion p95  | ≤ 3 s    |
| Pipeline async portion p95 | ≤ 30 s   |
| Dashboard load p95         | ≤ 2 s    |

### Rollback

- Every migration has a reversible `down`. Down files live in `supabase/migrations/down/` (not `supabase/migrations/`) — `supabase db reset` traverses the parent directory alphabetically and would apply them out of order (see ADR-0004). Roundtrip verified via `pnpm test:migration` (`scripts/migration-roundtrip.sh`), which handles the Supabase CLI single-migration limitation (see ADR-0006). **Every new migration must pass `pnpm test:migration` before commit — binding.**
- Features behind `feature_flag` (default `off` in prod) until 24h local soak passes.

### Migration discipline (binding from Stage 3 onward)

Every migration that creates tables, policies, or functions MUST:

1. Ship paired up + down SQL files. Down lives in
   supabase/migrations/down/ (per ADR-0004). The down file is
   not optional and not a follow-up commit.

2. Pass `pnpm test:migration` (the roundtrip script per ADR-0006)
   locally before commit. The roundtrip output is pasted into the
   PR/commit body or DAILY_LOG entry. A migration that has not
   been roundtrip-verified locally cannot be committed.

3. For any policy that subqueries another tenant-scoped table,
   use a SECURITY DEFINER helper per ADR-0005. Inline cross-table
   subqueries in policy bodies are a merge blocker.

4. Document the drop order at the top of the down migration as
   a comment block, citing the dependency reasoning. This survives
   future edits.

5. Include a pgTAP test that asserts:
   - Every new table has at least one RLS policy
   - Tenant isolation: a JWT for tenant A reads zero rows from
     tenant B's seeded data, for every new tenant-scoped table
   - Any new SECURITY DEFINER helper has triple REVOKE (PUBLIC +
     authenticated + anon) + GRANT authenticated, search_path set,
     STABLE volatility (per ADR-0005; A1 correction Stage 8)
   - Any new partitioned table: every UNIQUE constraint and PRIMARY
     KEY includes all partition key columns (SQLSTATE 0A000 at DDL
     time if missing; per ADR-0012)
   - pgTAP test patterns: see docs/dev/PGTAP_PATTERNS.md (catalogue
     maintained across stages per ADR-0006)

6. Partial index predicates must use only IMMUTABLE expressions.
   Functions like `now()` and `current_date` are STABLE/VOLATILE —
   PostgreSQL rejects them at index creation time with SQLSTATE 42P17
   ("functions in index predicate must be marked IMMUTABLE"). Use a
   stored column comparison instead. Examples:
   - Allowed: `WHERE is_active = true`, `WHERE status IN ('queued','in_progress')`
   - Rejected: `WHERE expires_at > now()`, `WHERE created_at > current_date`
   Fix: include the time column in the index and let the query planner
   do the range scan:
     `CREATE INDEX ... ON t(col1, col2, expires_at)` — not
     `CREATE INDEX ... ON t(col1, col2) WHERE expires_at > now()`
   Discovered Stage 6, Lesson 1. SQLSTATE 42P17.

---

## 11. Git Workflow

### 11.1 Single-branch linear

- **`main` is the only branch.** No feature branches, no long-lived dev branch.
- **Atomic commits per stage.** One stage from `DEV_PLAN.md` = one commit to `main`.
- **Local WIP is fine.** Commit freely during the day; squash/rebase before `git push`.
- **Hotfix exception:** if `main` is broken and you're already working on the next stage — `git stash`, fix on `main`, commit, then `git stash pop`. No branches.

### 11.2 Commit convention

**Commits MUST NOT include Co-Authored-By trailers attributing AI tools** (Claude, ChatGPT,
Copilot, GPT-4, Sonnet, Opus, Haiku, etc.). Commits are authored by the human pushing. AI tool
attribution lives in `DAILY_LOG.md` and `docs/prompts/`, not git history. The commit-msg
husky hook rejects any matching trailer (see `.husky/commit-msg`).

Format: `type(scope): subject`

| type       | Use for                                       |
| ---------- | --------------------------------------------- |
| `feat`     | New functionality tied to a stage deliverable |
| `fix`      | Bug or CI break on `main`                     |
| `chore`    | Tooling, CI, config, deps, scaffold           |
| `test`     | RLS, contract, unit, e2e, migration tests     |
| `docs`     | Spec, plan, runbook, README, prompt archive   |
| `refactor` | No behaviour change; internal restructure     |

**Scope:** package/service/domain — `monorepo`, `auth`, `sessions`, `content`, `ui`, `types`, `sdk`, etc.

Subject: imperative mood, ≤72 chars, no trailing period.

Body (optional, for stages touching more than one domain):

```
Implements DEV_PLAN.md Stage 5 (Migration 0004).
- session_record with optimistic lock + one-active partial unique
- session_response immutable + dedup (session_id, item_id, sequence_number)
- learning_event monthly partitioning via pg_partman
- create_session_response_atomic() — atomic 4-table write
Stage exit criteria: all pgTAP tests green, tenant isolation zero reads.
CI: https://github.com/<repo>/actions/runs/<id>
```

Set the template once: `.gitmessage` at repo root, `git config commit.template .gitmessage`.

### 11.3 Pre-push checklist

```bash
pnpm install
pnpm turbo typecheck lint test
supabase db reset && pnpm test:rls
```

If any step fails → fix locally → **do not push**. A red CI on `main` blocks every subsequent stage.

UI stages also run:

```bash
pnpm -C apps/web build
pnpm -C packages/ui storybook:test    # axe-core runs here from Stage 13
```

Migration stages also run:

```bash
pnpm test:migration                    # up → down → up
```

### 11.4 Push cadence

- **Goal:** one push per stage (end of day, after exit criteria met).
- **Minimum:** one push per day even mid-stage to keep `main` and remote in sync. Use `chore(wip): <stage>` if mid-stage; prefer rebasing/amending into the final stage commit before push so history stays linear.
- **Never force-push to `main`** after a stage is complete and logged. Force-push during a mid-stage amend is fine (no collaborators).

### 11.5 Rollback

- **Code:** `git revert <sha>` then push. Never `git reset --hard` on pushed commits.
- **Migration:** apply the corresponding `down` via `pnpm test:migration` (or pipe the `.down.sql` directly — see ADR-0006), then commit a revert of the migration file.
  ```bash
  pnpm test:migration   # verifies down + re-up; or run the down SQL directly
  git revert <migration-sha>
  git push
  ```
- **Multi-stage:** revert in reverse order. Each revert is its own commit: `fix: revert stage <N> — <reason>`.

### 11.6 Tagging

- End of each phase: `v1-phase-0`, `v1-phase-1`, `v1-phase-2-partial`, `v1-phase-4-slice`, `v1-release-candidate`, `v1.0.0`.
- Tag creation ties to the phase exit review stage in `DEV_PLAN.md`:
  ```bash
  git tag -a v1-phase-1 -m "Phase 1 complete. Stage 27."
  git push origin v1-phase-1
  ```

### 11.7 Hotfix exception

If `main` is broken (or CI is red blocking daily progress):

1. Stop current stage work.
2. Reproduce locally.
3. Fix with a single commit: `fix(<scope>): <description>`.
4. Push immediately after local verification.
5. Log in `DAILY_LOG.md` as a **blocker row**, not a new stage.
6. Resume the interrupted stage.

Do not roll a fix into an in-progress stage commit. Keep fixes atomic and revertable.

### 11.8 Recovery from bad commits

- **Lint/typecheck slip:** push a `fix(lint): ...` commit. Don't revert.
- **Broken migration:** revert the migration commit, push, then prepare a corrected migration with a fresh number.
- **Secrets leaked:** purge with `git filter-repo`, rotate the secret, force-push (only acceptable reason for force-push on `main`), add a `SECURITY.md` incident entry. Log to `admin_action_log` if the secret reached staging/prod.

---

## 12. Solo Execution Rules

1. **One stage = one commit to `main`.** Never combine stages.
2. **C-C-D-V prompts** for Claude Code (Context / Constraints / Deliverables / Verification). Save every executed prompt to `docs/prompts/YYYY-MM-DD_stage-N.md`.
3. **No `TODO` / `FIXME` without a linked entry** in `docs/dev/OPEN_ISSUES.md`.
4. **Daily tracking:** `docs/dev/DAILY_LOG.md` entry per stage with commit SHA, CI status, time, blockers. Do not advance until prior stage is ✅.
5. **If 2+ stages behind schedule:** stop and pull from the pre-approved scope-cut menu in `DEV_PLAN.md §3` before adding more work.
6. **Audit days every 5 stages.** Re-read every deviation and open issue since the last audit; resolve or formally accept as ongoing.

---

## 13. Definition of Done (every commit)

A stage is merge-ready to `main` ONLY when:

1. All tests pass locally and in CI.
2. `supabase db reset && pnpm test:rls` green.
3. `pnpm turbo build && pnpm turbo typecheck lint test` clean.
4. Rate limit, feature flag, and idempotency considered for new endpoints.
5. `OWNERS.md` and `docs/dev/PROJECT_STATE.md` updated.
6. `docs/dev/DAILY_LOG.md` entry created with CI link.
7. Executed C-C-D-V prompt archived to `docs/prompts/YYYY-MM-DD_stage-N.md`.
8. No new secrets in repo; pre-commit hook green.

---

_End of Build Contract v1.0._
