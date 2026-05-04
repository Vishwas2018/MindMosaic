# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 17 — AdaptiveEngine (NAPLAN testlet routing) (2026-05-06)
- Next stage: Stage 18 — Content Service (Day 22)
- Days remaining (target 75): 60
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3
- Phase 1 stages closed: 15, 16, 17 (of 13). Phase 1 buffer: 9 days available.
- **All 4 v1 engines complete:** Linear (§3.2.2), Skill (§3.2.3), Diagnostic (§3.2.4), Adaptive (§3.2.1).

## Test suite

| Suite        | Status   | Count               | Last run   |
| ------------ | -------- | ------------------- | ---------- |
| Unit         | ✅ green  | 290/290             | 2026-05-06 |
| Integration  | n/a      | n/a                 | n/a        |
| pgTAP        | ✅ green  | 451/451             | 2026-05-03 |
| Contract     | n/a      | n/a                 | n/a        |
| RLS          | ✅ green  | 451/451 (53 tables) | 2026-05-03 |
| E2E          | n/a      | n/a                 | n/a        |

Unit breakdown: 97 (@mm/types) + 24 (@mm/sdk) + 59 (@mm/ui: 27 axe + 32 functional) + **110 (@mm/engines: 28 linear + 27 skill + 22 diagnostic + 33 adaptive)**.

pgTAP/RLS not re-run for Stages 15/16/17 — pure TypeScript stages, no migration delta. The Stage 17 seed update (`03_assessment_config.sql`) is content-shaped only (replaces `adaptive_rules` JSON value); no schema change.

## Quality gates

| Gate                | Last status                        | Last run   |
| ------------------- | ---------------------------------- | ---------- |
| pnpm lint           | ✅ green (7 packages)              | 2026-05-06 |
| pnpm typecheck      | ✅ green (7 packages)              | 2026-05-06 |
| pnpm test           | ✅ green (290/290 unit)             | 2026-05-06 |
| pnpm build          | ✅ green (7 packages)              | 2026-05-06 |
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

- ADRs accepted: 24 (ADR-0001 through ADR-0024; ADR-0024 added Stage 17)
- ADRs proposed: 0
- Issues critical / high / medium / low: 0/0/0/0
- Open questions: 0
- Open bugs: 0
- Deviations logged: 2 (DEV-20260430-1 resolved Stage 15; DEV-20260503-2 ongoing v1.1)

## Notes for next session

**Stage 17 complete (2026-05-06, commit `3db1234`):**

- AdaptiveEngine ships per Spec §3.2.1 + §4.1 — testlet routing with per-stage timer, stage-bound back-nav (Q-17.6 hard-block), writing-stage text capture (`is_correct: null` accepted, excluded from routing score per Q-17.5).
- `EngineState` now a 4-arm `z.discriminatedUnion` (linear | skill | diagnostic | adaptive). v1.1 adds the fifth (`repair`).
- `EngineItem` grew optional `testlet_id`, `stage_id`, `is_writing_item` (Q-17.8). Other engines ignore these.
- `EngineResponse.is_correct` widened to `boolean | null` (Q-17.5). Backward-compatible: existing tests pass `boolean`, which satisfies `boolean | null`.
- `TerminationReason` unchanged (Q-17.4 reused `timer_expired`).
- Q-17.1 resolution: NAPLAN seed `adaptive_rules` rewritten from IRT/CAT placeholder to spec-compliant testlet routing table (ADR-0024). No new migration; testlet membership lives in `framework_config.adaptive_rules.testlets[]` map.
- Naming convention update: AdaptiveEngine's helpers are engine-prefixed (`scoreAdaptiveWithConfig`, `terminateAdaptiveWithConfig`) to avoid barrel collision with linear's generic `scoreWithConfig`/`terminateWithConfig`. Stage 18+ engines should adopt engine-prefixed names.

**Disciplines now binding (cumulative through Stage 17):**

- Pure-function namespaces only (ADR-0022). No classes for engines.
- Clock injected per-call to `getTimeRemaining` + `terminate`; never stored in `EngineState`.
- `EngineState` is JSON-serialisable; persists into `session_record.engine_state_snapshot jsonb`.
- No `Math.random`, no `Date.now()` inside engine bodies.
- Each engine method body starts with `assert{X}State(state)` for discriminator narrowing.
- Engines consume `EngineItem` (with skill_ids + difficulty + optional adaptive metadata); assessment-svc projects to wire `ItemDTO`.
- Routing-table lookups must throw on ambiguous matches (Q-17.9).

**Stage 18 pre-cues:**

- First Edge Function stage of Phase 1: `supabase/functions/content-svc/`.
- Endpoints (per arch §4.2 + DEV_PLAN.md L206): `/pathways` (entitlement-filtered), `/pathways/{slug}`, `/assessment-profiles`, `/content/items/{id}`, `/content/select` (blueprint-driven deterministic ordering), `/content/search`, `/skill-graphs/active`.
- In-module-scope skill graph cache in `packages/core/src/skill-graph-cache.ts` (Map<skill_id, record> + adjacency map, 1h TTL, watermark check) per arch §5.3.
- Contract tests required.
- Exit criteria: `/content/select` returns blueprint-compliant items; cache hit rate 100% after first load; cache invalidates on graph publish.
- Reuses Stage 14's `_shared/` Edge Function utilities (trace-id, error-envelope, rate-limit, auth, logger).
- Engines (Stage 15–17) consume what Stage 18 selects — completes the "content → engine → response" loop in preparation for Stage 19's assessment-svc.

**Supabase remote project:** https://tohmshcpdhcdfsubvnok.supabase.co (ap-southeast-2)
