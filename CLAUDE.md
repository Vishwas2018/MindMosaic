# CLAUDE.md — MindMosaic Operating Instructions

> Claude Code reads this file automatically at the start of every session.
> Keep it short, stable, and authoritative. Volatile state lives in `docs/dev/*`.

---

## Project

**MindMosaic v1 MVP** — adaptive learning platform for NAPLAN Y5 Numeracy + ICAS Math Paper C. Solo build, 75-day target.

Locked sources of truth (do not edit silently):

- `mindmosaic-spec-v4_4.md` — product spec
- `mindmosaic-backend-arch-v2_0.md` — backend architecture
- `DEV_PLAN.md` — 75-day stage plan
- `BUILD_CONTRACT.md` — engineering rules
- `CLAUDE_PROMPTS.md` — full prompt catalogue (morning / stage / evening / audit / scope-cut / hotfix / retro / cold-start). The morning + evening rituals quoted below are the daily-use subset; the full catalogue lives there.
- `mindmosaic-spec-v4_4.md` Part III.5 + arch v2.0 Part XI — G1–G6 ambiguity resolutions
- `UI_CONTRACT.md` + `SCREEN_SPECS.md` — frontend authority
- `OWNERS.md` — service ownership

If reality and the plan disagree: log a deviation, file an ADR if the answer is non-obvious, **never silently change the plan**.

---

## Tech stack (locked — change requires an ADR)

Turborepo + pnpm 9; Next.js 14 App Router; TypeScript strict; Tailwind + shadcn/ui; Supabase (Postgres 15, RLS, Edge Functions in Deno); Vitest + Playwright + pgTAP; Recharts; KaTeX; @dnd-kit/core; Stripe (from Stage 42 only).

---

## v1 scope (firm)

**In v1:** AdaptiveEngine (NAPLAN), LinearEngine (ICAS), SkillEngine (practice), DiagnosticEngine; L1 Foundation, L2 Behaviour, L3a Causal-scoped (sync) + L3b/L5/L7/L9 (async from Stage 28); Student/Parent/Teacher/Admin dashboards; assignments; in-app notifications; Stripe Free/Standard/Premium (Stages 42–47).

**Deferred to v1.1+ (see `DEV_PLAN.md` §5):** RepairEngine, L4/L6/L8, Selective/Singapore/Olympiad pathways, Engagement layer, dunning/refund flows, full WCAG audit, OpenTelemetry, mobile polish, institutional tier, SSO.

Phase-2 features in code must be either entirely absent or stubbed with `// PHASE-2:` comments and "Available in a future release" UI copy. Grep-detectable.

---

## Quality non-negotiables

These hold for every commit. CI enforces what it can; you enforce the rest.

- TypeScript strict; **no `any` in production code**.
- Zod validation at every API boundary.
- RLS in the same migration as `CREATE TABLE` — never a follow-up migration.
- `Idempotency-Key` header on every `POST`/`PATCH`/`DELETE`.
- Structured JSON logs with `trace_id`, `tenant_id`, `student_id` where applicable.
- p95 latencies meet `BUILD_CONTRACT §10` budgets — measure, don't assume.
- Conventional Commits with scope: `feat(web):`, `fix(api):`, `chore(security):`, `test(e2e):`, `docs(adr):`.
- Atomic commits. One stage = one commit to `main`. No `.only` or `.skip` left in tests.

---

## Spec ambiguity discipline

When implementing, if a spec value (an enum value, a column, a field
in a JWT claim, a policy name, a function signature, a default value)
is referenced in spec/arch but does NOT exist in the schema you have
in hand:

1. STOP. Do not invent a workaround.
2. File Q-NNNN in docs/dev/QUESTIONS.md describing:
   - The spec citation (file + section + exact text)
   - What's missing
   - The two-or-three plausible resolutions
   - Which one you'd default to and why
3. Surface this in your reply BEFORE producing code or commits.
4. Wait for human decision OR — if non-blocking — proceed with your
   default and file an ADR documenting the choice.

Examples that should trigger this discipline:

- "actor_role = 'self_service_signup'" (not in user_role enum)
- "feature_flag.source = 'admin_override'" (only if not in
  defined source enum values)
- A column or table referenced by name in spec but not in
  the migration list

The cost of stopping for 5 minutes to ask is always lower than
the cost of working around it and discovering the workaround
was wrong three stages later.

---

## Decision-recording rule

Any decision not specified by the daily prompt **must** be recorded as an ADR in `docs/dev/decisions/`. Examples:

- Choosing a library not pre-listed in the tech stack
- Resolving a spec ambiguity by picking a reading
- Choosing between two implementations the prompt was silent on
- Postponing or simplifying something the prompt asked for

Examples that do **not** need an ADR (use `DAILY_LOG.md` instead):

- Standard implementation choices clearly implied by the prompt
- Bug fixes — those go in `docs/dev/bugs/`
- Test additions

---

## Read-on-start order (every session)

Before any work, read in this order and produce a state summary:

1. `docs/dev/PROJECT_STATE.md` — full
2. `docs/dev/DAILY_LOG.md` — last 3 entries only
3. `docs/dev/DEVIATIONS.md` — all entries
4. `docs/dev/OPEN_ISSUES.md` — severity ≥ medium
5. `docs/dev/QUESTIONS.md` — open only
6. `docs/dev/decisions/` — ADRs marked `accepted` within last 14 days

State summary must include: last completed stage, next stage, open blockers, recent deviations relevant to today, known issues that might affect today, ADRs to be aware of. **Do not begin coding until the human confirms.**

---

## Morning ritual (paste at session start)

```
We are continuing the MindMosaic v1 build per DEV_PLAN.md.

Before any new work:

1. Read docs/dev/PROJECT_STATE.md (full)
2. Read docs/dev/DAILY_LOG.md (last 3 entries only)
3. Read docs/dev/DEVIATIONS.md (all)
4. Read docs/dev/OPEN_ISSUES.md (severity ≥ medium)
5. Read docs/dev/QUESTIONS.md (open only)
6. List ADRs in docs/dev/decisions/ accepted in last 14 days; read those
   relevant to today's stage.

Then report:
  - Last completed: Stage N (date)
  - Next stage: Stage N+1 — <title>
  - Open blockers: <list or "none">
  - Deviations relevant to today: <list or "none">
  - Known issues that may affect today: <list or "none">
  - Open ADRs to be aware of: <list or "none">

Then load Stage N+1 from DEV_PLAN.md and walk me through:
  (a) any preconditions you suspect might fail given current state
  (b) the planned work, restated in your own words
  (c) the C-C-D-V prompt you'll execute (Context / Constraints /
      Deliverables / Verification)

Do NOT begin coding until I confirm.
```

---

## Evening ritual (paste at session end)

```
Stage N is complete. Update the developer context.

1. Append today's entry to docs/dev/DAILY_LOG.md using the template at
   the top of that file. Fill every field; if N/A write "n/a".

2. Overwrite docs/dev/PROJECT_STATE.md with a fresh snapshot. Pull real
   numbers from CI / build output. Do not invent — if unknown, write
   "unknown — TODO measure".

3. For any decision made today not specified by the stage, file an ADR
   at docs/dev/decisions/NNNN-short-slug.md (next sequential number).

4. For any deviation from planned scope, append to docs/dev/DEVIATIONS.md.

5. For any new known issue, append to docs/dev/OPEN_ISSUES.md.

6. For any new question for spec/product owner, append to
   docs/dev/QUESTIONS.md.

7. For any new bug, file at docs/dev/bugs/BUG-NNNN-short-slug.md.

8. Save the executed C-C-D-V prompt to
   docs/prompts/YYYY-MM-DD_stage-N.md.

9. Stage all docs/dev changes and commit separately with:
     chore(dev-context): stage N close — <one-line summary>

Show me the commit message and the diff before pushing.
```

---

## Dev journal — file system

```
docs/dev/
├── PROJECT_STATE.md            overwritten daily
├── DAILY_LOG.md                append-only, never pruned
├── DEVIATIONS.md               append-only, never pruned
├── OPEN_ISSUES.md              living list; resolved → ## Resolved
├── QUESTIONS.md                living list; answered → ## Resolved
├── decisions/
│   ├── 0000-template.md
│   └── NNNN-short-slug.md      one per ADR; immutable once accepted
├── bugs/
│   ├── 0000-template.md
│   └── BUG-NNNN-short-slug.md  one per bug
├── perf/
│   └── measurements.md         append-only latency runs
└── security/
    └── findings.md             append-only scan results
```

**Anti-patterns:**

1. Editing `DEV_PLAN.md` mid-build — file a deviation instead.
2. Deleting log entries — append a dated correction.
3. Vague entries ("fixed bug") — every entry must be useful 6 months later.
4. ADRs for trivial choices — ADRs are for decisions a senior reviewer would reasonably challenge.
5. Inventing numbers in `PROJECT_STATE.md` — write `unknown — TODO measure`.
6. Skipping the evening ritual — too tired to update context = too tired to commit.

---

## Templates

### `docs/dev/DAILY_LOG.md` entry

```markdown
## Stage N — YYYY-MM-DD

**Planned (from DEV_PLAN.md Stage N):** <one-line>

**Actually delivered:**

- <bullets, with commit SHAs>

**Time spent:** Xh Ym

**Surprises / departures:**

- <… or "none">

**Decisions made (not in stage):**

- ADR-NNNN: <slug>
- <or "none">

**Deviations logged:**

- DEV-YYYYMMDD-N
- <or "none">

**Issues opened / closed / questions raised:**

- <… or "none">

**Quality gates at close:**

- Lint ✅/❌ · Typecheck ✅/❌ · Tests ✅/❌ (X/Y) · Build ✅/❌ · RLS ✅/❌

**Tomorrow — first thing:**
<one-line>
```

### `docs/dev/PROJECT_STATE.md`

```markdown
# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: <N (date)>
- Next stage: <N+1 — title>
- Days remaining (target 60 / hard 75): <X / Y>
- Buffer days consumed in current phase: <X of Y>

## Test suite

| Suite       | Status | Count | Last run |
| ----------- | ------ | ----- | -------- |
| Unit        |        |       |          |
| Integration |        |       |          |
| pgTAP       |        |       |          |
| Contract    |        |       |          |
| RLS         |        |       |          |
| E2E         |        |       |          |

## Quality gates

| Gate           | Last status | Last run |
| -------------- | ----------- | -------- |
| pnpm lint      |             |          |
| pnpm typecheck |             |          |
| pnpm test      |             |          |
| pnpm build     |             |          |
| RLS coverage   |             |          |
| pnpm audit     |             |          |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95 |
| --------------------------------- | ---------- | ------------ |
| POST /sessions/{id}/respond       | 300 ms     |              |
| POST /sessions/{id}/submit + sync | 5000 ms    |              |
| Pipeline async                    | 30000 ms   |              |
| Dashboard load                    | 2000 ms    |              |

## Open items

- ADRs accepted: <N>
- ADRs proposed: <N>
- Issues critical / high / medium / low: <0/0/0/0>
- Open questions: <N>
- Open bugs: <N>
- Deviations logged: <N>

## Notes for next session

<empty>
```

### ADR (`docs/dev/decisions/NNNN-*.md`)

```markdown
# ADR-NNNN — short title

- Status: proposed | accepted | superseded by ADR-MMMM | deprecated
- Date: YYYY-MM-DD
- Stage: N
- Tags: backend | frontend | data | infra | security | dx

## Context

<2–3 short paragraphs. Cite spec/arch sections.>

## Options considered

1. **Option A** — one-line. Pros: … Cons: …
2. **Option B** — …

## Decision

Use **Option X**.

## Rationale

<Why this option. Spec/arch constraints, perf/security, accepted tradeoffs.>

## Consequences

- Positive: …
- Negative: …
- Follow-ups: …

## Implementation notes

Files: <paths> · Commit: <sha> · Related: ADR-…, ISSUE-…, DEV-…
```

### Deviation (`docs/dev/DEVIATIONS.md` row)

```markdown
### DEV-YYYYMMDD-N — short slug

- Date: YYYY-MM-DD
- Stage: N
- Type: scope-expansion | scope-reduction | substitution | postponement | phase-2-risk
- What the stage said: <quote or paraphrase>
- What I actually did: <description>
- Why: <reason>
- Impact on later stages: <e.g. "Stage 18 assumes X exists; I built X' equivalent — no impact">
- Linked: ADR-NNNN, ISSUE-NNNN, BUG-NNNN, commit abc1234
- Resolved by: Stage N | "ongoing"
```

### Bug (`docs/dev/bugs/BUG-NNNN-*.md`)

```markdown
# BUG-NNNN — short title

- Status: open | in-progress | fixed | wont-fix
- Severity: critical | high | medium | low
- Reported: YYYY-MM-DD (Stage N)
- Area: backend | frontend | infra | tests | content
- Tags: rls | concurrency | a11y | perf | data

## Summary

<one paragraph>

## Reproduction

1. …
2. …
   Expected: … Actual: …

## Root cause

<once known>

## Fix

- Commit: <sha>
- Tests added: <paths>
- Regression-tested: <Stage N audit / CI run X>
```

### Question (`docs/dev/QUESTIONS.md` row)

```markdown
### Q-NNNN — short slug

- Date raised: YYYY-MM-DD (Stage N)
- Asked of: <product owner | architect | self | TBD>
- Source: spec §X.Y / arch §A.B / DEV_PLAN Stage N
- Question: <precise question>
- Why ambiguous: <what makes it unclear>
- Blocking? yes / no
- Assumed answer (if proceeding): <…>
- Code affected: <file paths>
- Status: open | resolved
- Resolution: <answer + date>
```

---

## Severity rubric (for OPEN_ISSUES + bugs)

- **Critical** — blocks correctness/security. Fix before next commit.
- **High** — blocks a future stage or violates a quality gate. Fix within 2 days.
- **Medium** — measurable regression but not blocking. Fix by next audit.
- **Low** — cosmetic. Address opportunistically.

---

## Pruning policy (audit days — every 5 stages)

- `OPEN_ISSUES.md` — resolved → `## Resolved` with resolution date
- `QUESTIONS.md` — answered → `## Resolved` with answer
- `DAILY_LOG.md` — never pruned
- `DEVIATIONS.md` — never pruned
- `decisions/` — never deleted; supersede with new ADR if reversed
- `bugs/` — never deleted; mark `status: closed`
