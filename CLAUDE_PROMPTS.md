# CLAUDE_PROMPTS.md — Claude Code Prompt Reference (v1.0)

> One template, used 49 times. Drives every stage in `DEV_PLAN.md`.
>
> The detailed per-stage spec lives in `DEV_PLAN.md §2` (Stage Catalogue). Do not duplicate it here. This file holds the _prompt shapes_ Claude Code uses to act on those stages, plus the supporting prompts for audit days, scope cuts, hotfixes, and recovery.

---

## How this file works

Each working session runs **one** of the prompts below. The morning prompt and stage-runner prompt cover ~95% of days. The rest are exception flows.

1. **Morning ritual** — read context, plan today's stage, request confirmation.
2. **Stage runner** — execute the planned stage in C-C-D-V format.
3. **Evening ritual** — close the day, update dev journal.
4. **Audit day extension** — every 5 stages, sweep deviations + open issues.
5. **Scope cut** — when a phase consumes >50% of its buffer.
6. **Hotfix** — when `main` breaks.
7. **Stage retrospective** — when something went badly enough to learn from.

All prompts assume Claude Code has access to the repo and is reading `CLAUDE.md` automatically.

---

## 1. Morning ritual

> Paste at the start of every working day. Do not begin coding until you've confirmed the plan.

```
We are continuing the MindMosaic v1 build per DEV_PLAN.md.

Step 1 — Read in this order and produce a state summary:
  (a) docs/dev/PROJECT_STATE.md   (full)
  (b) docs/dev/DAILY_LOG.md       (last 3 entries only)
  (c) docs/dev/DEVIATIONS.md      (all entries)
  (d) docs/dev/OPEN_ISSUES.md     (severity ≥ medium)
  (e) docs/dev/QUESTIONS.md       (open only)
  (f) docs/dev/decisions/         (ADRs marked accepted in last 14 days
                                   that touch today's stage area)

Step 2 — Report in this exact format:
  - Last completed: Stage N (date)
  - Next stage: Stage N+1 — <title> (DEV_PLAN.md §2)
  - Open blockers: <list or "none">
  - Deviations relevant to today: <list or "none">
  - Known issues that may affect today: <list or "none">
  - Open ADRs to be aware of: <list or "none">
  - Phase buffer status: <X of Y consumed in current phase>

Step 3 — Load Stage N+1 from DEV_PLAN.md §2. Re-read its full
definition (Objective, Deliverables, Spec refs, Exit criteria, Risk).

Step 4 — Walk me through, in plain English:
  (a) Preconditions you suspect might fail given current state
  (b) The planned work, restated in your own words
  (c) The C-C-D-V prompt you would execute (use the template in
      CLAUDE_PROMPTS.md §2 — Context / Constraints / Deliverables /
      Verification)
  (d) Any open question that should block start

Do NOT begin coding until I confirm with "proceed".
```

---

## 2. Stage runner (the C-C-D-V template)

> Used after morning confirmation. The body is filled in by Claude Code from `DEV_PLAN.md §2` for the current stage. This is the _shape_ — Claude generates the per-stage content.

```
### 2A — Pre-implementation review (mandatory for schema/policy stages)

Before generating the C-C-D-V prompt, for ANY stage that:
  - Creates or alters database tables
  - Adds RLS policies
  - Adds or modifies SECURITY DEFINER functions
  - Adds Edge Functions that write to tenant-scoped tables

…Claude Code must walk through, in plain English:

(a) The full schema delta — what's added, altered, dropped
(b) The drop dependency graph for any new tables — which policies,
    FKs, and helpers reference what
(c) The RLS policy plan — for every policy that touches another
    tenant-scoped table, name the SECURITY DEFINER helper used
(d) The down migration drop order, with reasoning
(e) The pgTAP test plan — what assertions, what edge cases
(f) Any spec ambiguity that needs resolution before coding starts
    (file as Q-NNNN before proceeding, do not assume)

Stop after (a)–(f). Wait for explicit "C-C-D-V approved" before
generating or executing the C-C-D-V prompt.

For non-schema stages (UI, plain code, docs), skip 2A and proceed
direct to 2B.

### 2B — C-C-D-V execution (existing template, unchanged)

Stage <N> — <Title>
Reference: DEV_PLAN.md §2 Stage <N>; spec/arch sections cited there;
SPEC v1 decisions in mindmosaic-spec-v4_4.md Part III.5;
ARCH v1 decisions in mindmosaic-backend-arch-v2_0.md Part XI.

# CONTEXT
- Current phase: <Phase from §1 of DEV_PLAN.md>
- Day in plan: <day number>
- What exists already that this stage builds on:
  <bullets — packages, migrations, services, screens that are present>
- What this stage is NOT doing (to keep scope clean):
  <bullets — anything explicitly deferred or out of scope>

# CONSTRAINTS
- BUILD_CONTRACT.md applies in full. Specifically for this stage:
  <bullets — the rules from §3, §6, §8, §9, §10 most relevant here>
- OWNERS.md ownership boundaries — services that may write the
  affected tables: <bullets>
- UI_CONTRACT.md / SCREEN_SPECS.md (if a UI stage):
  <bullets — tokens, components, shells in play>
- Performance budgets touching this stage (BUILD_CONTRACT §10):
  <bullets — only the relevant ones>
- v1 implementation decisions in scope:
  <bullets — e.g. "G2 forbids Stripe code; flags via seed/admin script">

# DELIVERABLES
Per DEV_PLAN.md Stage <N>, produce:
  <bulleted list — copied from DEV_PLAN.md "Deliverables">

Each deliverable produced as an atomic change. No half-built files
left behind. No TODO/FIXME without a linked OPEN_ISSUES entry.

# VERIFICATION
This stage is done ONLY when ALL exit criteria from DEV_PLAN.md
Stage <N> are demonstrably green. Specifically:
  <bulleted list — copied from DEV_PLAN.md "Exit criteria">

Run, in this order, and report each result before claiming completion:
  1. pnpm install
  2. pnpm turbo typecheck lint test
  3. supabase db reset && pnpm test:rls       (if migration touched)
  4. pnpm test:migration                       (if migration touched)
  5. pnpm -C apps/web build                    (if UI touched)
  6. axe-core on touched stories               (if UI touched, Stage 13+)
  7. Stage-specific test from "Exit criteria"  (always)

If ANY step fails:
  - Stop and surface the failure with full output.
  - Do NOT auto-fix and retry silently.
  - Wait for my decision: continue, rollback, or use a buffer day.

If ALL steps pass:
  - Produce a single atomic commit with the .gitmessage template
    pre-filled per BUILD_CONTRACT §11.2.
  - Do NOT push yet — show me the commit message and the diff for
    review first.
```

---

## 3. Evening ritual

> Paste at the end of every working day, after the stage commit but before pushing.

```
Stage <N> is complete. Update the developer context.

1. Append today's entry to docs/dev/DAILY_LOG.md using the template
   in CLAUDE.md §Templates. Fill every field; if N/A write "n/a".
   Newest at TOP.

2. Overwrite docs/dev/PROJECT_STATE.md with a fresh snapshot. Pull
   real numbers from CI/build output. Do not invent — write
   "unknown — TODO measure" where you don't know.

3. For any decision made today not specified by Stage <N>, file an
   ADR at docs/dev/decisions/NNNN-short-slug.md (next sequential
   number, status = accepted unless still in flux).

4. For any deviation from planned scope, append to
   docs/dev/DEVIATIONS.md (newest at top).

5. For any new known issue → docs/dev/OPEN_ISSUES.md.
6. For any new question → docs/dev/QUESTIONS.md.
7. For any new bug → docs/dev/bugs/BUG-NNNN-short-slug.md.

8. Save the executed Stage <N> C-C-D-V prompt to
   docs/prompts/YYYY-MM-DD_stage-<N>.md alongside a short
   "outcome notes" section.

9. Stage all docs/dev + docs/prompts changes and produce a separate
   commit:
       chore(dev-context): stage <N> close — <one-line summary>

Show me the two pending commits (stage commit + dev-context commit)
and the full diff before I push.
```

---

## 4. Audit day extension (every 5 stages)

> Append to the morning prompt on Stages 5, 10, 15, 20, 25, 30, 35, 40, 45.

```
This is an audit day (Stage <N>).

Before loading the Stage <N+1> prompt:

1. Re-read every entry in docs/dev/DEVIATIONS.md filed since the
   last audit (Stage <N-5>). For each, decide:
     - Resolved → mark resolution date in the entry's "Resolved by:" field.
     - Still ongoing → append a short "Audit Stage <N>: still ongoing — <reason>" note.

2. Re-read docs/dev/OPEN_ISSUES.md "Open" section. For each:
     - Fixed in last 5 stages → move to "## Resolved" with date + commit.
     - Severity changed → update.
     - Stale (>10 stages old, low severity) → either fix today or downgrade with reason.

3. Re-read docs/dev/QUESTIONS.md "Open". Same triage.

4. Run the full quality gate:
     pnpm turbo typecheck lint test
     supabase db reset && pnpm test:rls
     pnpm -C apps/web build
   Report any regression vs last green run.

5. Verify phase buffer:
     - Slippage buffer consumed in current phase: <X of Y>
     - At >50% consumption, recommend invoking DEV_PLAN.md §3.3 cuts.

6. Produce the standard morning summary (Stage <N+1>) and proceed
   normally.

The audit work commits separately as:
   chore(dev-context): audit stage <N> — <triage summary>
```

---

## 5. Scope cut (when phase buffer is at risk)

> Use when phase slippage exceeds 50% of buffer, or when an audit recommends cuts.

```
We are at risk on the current phase. Apply the DEV_PLAN.md §3.3
scope-cut menu.

1. Show me the current phase status:
     - Phase: <X>
     - Stages remaining: <N stages>
     - Buffer consumed: <X of Y> (<percentage>%)
     - Days remaining in phase window: <N>

2. From DEV_PLAN.md §3.3, list the cuts available IN ORDER of
   recommended priority. For each, show:
     - Cut number + title
     - Affected stage(s)
     - Days saved
     - Cost (what the user loses)

3. Recommend a specific cut combination that brings the phase back
   to within-buffer, in the order given by §3.3 (do not skip
   numbers without justification).

4. For my approval. Wait for explicit "apply cut <N>" before any
   change.

When approved:
  (a) Move the affected stage's deliverables to DEV_PLAN.md §5
      (post-launch backlog), preserving estimates and origin refs.
  (b) Update DEV_PLAN.md §2 stage entry with status:
      "DEFERRED to v1.1 — see §5 P<X>. Deviation: DEV-YYYYMMDD-N."
  (c) File DEV-YYYYMMDD-N in docs/dev/DEVIATIONS.md with type
      "scope-reduction".
  (d) Update PROJECT_STATE.md.
  (e) Commit:
       docs(dev-plan): apply scope cut <N> — defer <stage> to v1.1
```

---

## 6. Hotfix (when main breaks)

> Use when CI is red on `main` or a pushed change broke production behaviour.

```
Stop current stage work. Hotfix mode.

1. Reproduce the failure locally:
     - Pull latest main
     - Run the exact CI command that is failing
     - Confirm the failure mode

2. Identify the offending commit:
     - git log --oneline | head -10
     - The commit that introduced the failure: <SHA>

3. Decide:
     (a) Forward fix — small, obvious correction → produce a
         fix(<scope>): <description> commit
     (b) Revert — non-trivial, unclear root cause → git revert <SHA>
         + commit
     (c) Rollback migration — if the failure is a bad migration
         applied in CI's fresh DB → see BUILD_CONTRACT §11.5

4. Run the full pre-push gate locally before pushing the fix:
     pnpm turbo typecheck lint test
     supabase db reset && pnpm test:rls

5. Push immediately after green.

6. Log in DAILY_LOG.md as a BLOCKER ROW (not a new stage):

   ## Blocker — YYYY-MM-DD
   **Triggered by:** <commit SHA>
   **Symptom:** <one line>
   **Resolution:** <fix commit SHA>
   **Time lost:** Xh
   **Stage in flight when blocker hit:** <N>
   **Resumed:** Stage <N> at <time>

7. Resume the stage that was interrupted. Do NOT roll the hotfix
   into the in-progress stage commit.
```

---

## 7. Stage retrospective (after a hard stage)

> Optional. Use when a stage took 2x its expected time, hit a buffer day, or required a deviation. The point is to capture the lesson before context fades.

```
Stage <N> retrospective.

1. What was the stage supposed to deliver? (One sentence — paraphrase
   DEV_PLAN.md §2.)

2. What actually shipped? (One sentence per material deviation from
   the deliverables list.)

3. Where did the time go? Account for hours roughly:
     - Reading specs/arch:   Xh
     - Writing code:         Xh
     - Debugging:            Xh
     - Testing & verification: Xh
     - Doc updates / review: Xh

4. What was the surprise? (The thing the stage definition didn't
   prepare you for.)

5. What would have shortened this by 2+ hours if you'd known
   yesterday?

6. Does this surprise apply to any future stage? If yes, list which
   stages in DEV_PLAN.md §2 it touches and propose either:
     - A stage-definition addendum (file as ADR), OR
     - An open issue to be addressed in that future stage.

7. File the retrospective at docs/dev/decisions/NNNN-retro-stage-<N>.md
   with status accepted, tag retrospective. Commit:
       docs(adr): stage <N> retrospective
```

---

## 8. Cold-start (returning after >7 days away)

> Use when you've been away from the project for over a week and need to fully re-orient. Heavier than the normal morning ritual.

```
Cold start. I have not worked on MindMosaic for >7 days.

Step 1 — Read in this order, then summarise:
  (a) README.md
  (b) CLAUDE.md (full)
  (c) docs/dev/PROJECT_STATE.md
  (d) docs/dev/DAILY_LOG.md (last 10 entries)
  (e) docs/dev/DEVIATIONS.md (all entries)
  (f) docs/dev/OPEN_ISSUES.md (all)
  (g) docs/dev/decisions/ — every ADR accepted in last 30 days
  (h) DEV_PLAN.md §1 Phase Summary + §2 entry for the next stage
      and the previous stage

Step 2 — Run a health check and report:
  pnpm install
  pnpm turbo typecheck lint test
  supabase db reset && pnpm test:rls
  git log --oneline | head -10

Step 3 — Produce a written summary covering:
  - Project state in 5 sentences
  - Where we left off and why
  - What's known to be broken or in flight
  - Recommended re-entry: continue Stage <N>, or audit first?

Do NOT load any stage prompt yet. Wait for my "proceed with stage <N>"
or "audit first".
```

---

## 9. What this file is NOT

- **Not a stage catalogue.** That's `DEV_PLAN.md §2`. If you find yourself wanting to add per-stage detail here, add it there.
- **Not a runbook.** Operational procedures live in `docs/runbooks/`.
- **Not a style guide.** Code style rules live in `BUILD_CONTRACT.md` + `UI_CONTRACT.md`.
- **Not a Claude Code SDK reference.** It assumes Claude Code is already running and reading `CLAUDE.md`.

---

## 10. Maintenance

This file should change rarely. Edit only when:

- A new prompt category emerges that's used 3+ times (e.g. a "spec drift" prompt). File an ADR proposing the addition.
- A prompt is consistently producing the wrong shape of work — narrow the constraints in that prompt.
- A `CLAUDE.md` change makes a step here redundant.

Do NOT edit this file to capture per-stage knowledge. That belongs in `DEV_PLAN.md §2` or in an ADR.

---

_End of CLAUDE_PROMPTS.md v1.0._
