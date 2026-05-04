# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 16 — SkillEngine + DiagnosticEngine + EngineState union (2026-05-05)
- Next stage: Stage 17 — AdaptiveEngine (NAPLAN), Days 20–21
- Days remaining (target 75): 61
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 stages closed: 15, 16 (of 13). Phase 1 buffer: 9 days available.

## Test suite

| Suite        | Status   | Count               | Last run   |
| ------------ | -------- | ------------------- | ---------- |
| Unit         | ✅ green  | 257/257             | 2026-05-05 |
| Integration  | n/a      | n/a                 | n/a        |
| pgTAP        | ✅ green  | 451/451             | 2026-05-03 |
| Contract     | n/a      | n/a                 | n/a        |
| RLS          | ✅ green  | 451/451 (53 tables) | 2026-05-03 |
| E2E          | n/a      | n/a                 | n/a        |

Unit breakdown: 97 (@mm/types) + 24 (@mm/sdk) + 59 (@mm/ui: 27 axe + 32 functional) + **77 (@mm/engines: 28 linear + 27 skill + 22 diagnostic)**.

pgTAP/RLS not re-run for Stages 15 or 16 — pure TypeScript stages, no migration delta.

## Quality gates

| Gate                | Last status                        | Last run   |
| ------------------- | ---------------------------------- | ---------- |
| pnpm lint           | ✅ green (7 packages)              | 2026-05-05 |
| pnpm typecheck      | ✅ green (7 packages)              | 2026-05-05 |
| pnpm test           | ✅ green (257/257 unit)             | 2026-05-05 |
| pnpm build          | ✅ green (7 packages)              | 2026-05-05 |
| RLS coverage        | ✅ 53/53 tables enabled + tested   | 2026-05-03 |
| pnpm audit          | unknown — TODO measure              | n/a        |
| pnpm test:migration | ✅ green (10 migrations roundtrip) | 2026-05-03 |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95 |
| --------------------------------- | ---------- | ------------ |
| POST /sessions/{id}/respond       | 300 ms     | n/a          |
| POST /sessions/{id}/submit + sync | 5000 ms    | n/a          |
| Pipeline async                    | 30000 ms   | n/a          |
| Dashboard load                    | 2000 ms    | n/a          |

## Open items

- ADRs accepted: 23 (ADR-0001 through ADR-0023; ADR-0023 added Stage 16)
- ADRs proposed: 0
- Issues critical / high / medium / low: 0/0/0/0
- Open questions: 0
- Open bugs: 0
- Deviations logged: 2 (DEV-20260430-1 resolved Stage 15; DEV-20260503-2 ongoing v1.1)

## Notes for next session

**Stage 16 complete (2026-05-05, commit `496a659`):**

- Two new engines shipped — SkillEngine (Spec §3.2.3) + DiagnosticEngine (Spec §3.2.4) — as pure-function namespaces per ADR-0022.
- `EngineState` is now a `z.discriminatedUnion('engine_type', [Linear, Skill, Diagnostic])`. Stage 17 adds the fourth branch (`adaptive`); v1.1 adds the fifth (`repair`).
- `EngineItem` introduced as server-side item shape (extends `ItemDTO` with `skill_ids`, `difficulty`, optional `discrimination`). Wire `ItemDTO` from `@mm/types` stays lean; assessment-svc projects `EngineItem → ItemDTO` before serialising to client.
- `EngineResponse.telemetry?` carries `time_to_answer_ms` + `answer_changes` for the §9.5 cognitive-load formula. SkillEngine reads it; LinearEngine + DiagnosticEngine ignore it.
- `TerminationReason` widened: `'completed' | 'timer_expired' | 'user_submitted' | 'abandoned' | 'mastery_reached' | 'max_items_reached' | 'confidence_threshold_met'`.
- `FrameworkConfig` grew Stage 16 thresholds with v1 defaults: `mastery_threshold=0.85`, `confidence_threshold=0.7`, `max_items=20`, `diagnostic_start_difficulty=0.5`, plus difficulty/cognitive-load step constants and `expected_time_per_item_ms=30000`.
- Test fixtures lifted into shared `_fixtures.ts` (serves Linear, Skill, Diagnostic).
- LinearEngine `score().skills_touched` now emits real skill IDs (Stage 15 documented gap closed via the `EngineItem.skill_ids` plumbing).

**Stage 17 pre-cues:**

- AdaptiveEngine handles NAPLAN: testlet-based adaptive routing per `framework_config.adaptive_rules`, server-authoritative stage timer, stage-bound back-nav (NOT cross-stage), writing-stage text capture (no auto-marking).
- `AdaptiveEngineStateSchema` joins the discriminated union as branch 4 — Stage 16 left a clean place for it to slot in.
- New `TerminationReason` likely needed: `time_expired` for stage timer (or reuse `timer_expired`).
- Routing table shape: must match the seed JSON exactly. Seed lives in `supabase/seeds/02_assessment.sql` (or similar) — confirm before coding.
- Risk: medium per DEV_PLAN. 2-day budget (Days 20–21).
- Apply ADR-0022 (pure-function namespace) + ADR-0023 (state branch) patterns directly.

**Disciplines now binding (cumulative through Stage 16):**

- Pure-function namespaces only (ADR-0022). No classes for engines.
- Clock injected per-call to `getTimeRemaining` + `terminate`; never stored in `EngineState`.
- `EngineState` is JSON-serialisable; persists into `session_record.engine_state_snapshot jsonb`.
- No `Math.random`, no `Date.now()` inside engine bodies.
- Each engine method body starts with `assert{X}State(state)` for discriminator narrowing.
- Engines consume `EngineItem` (with skill_ids + difficulty); assessment-svc projects to wire `ItemDTO`.

**Supabase remote project:** https://tohmshcpdhcdfsubvnok.supabase.co (ap-southeast-2)
