# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: none (pre-Stage 1)
- Next stage: Stage 1 — Monorepo & Tooling
- Days remaining (target 75): 75
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3

## Test suite

| Suite        | Status | Count | Last run |
| ------------ | ------ | ----- | -------- |
| Unit         | n/a    | n/a   | n/a |
| Integration  | n/a    | n/a   | n/a |
| pgTAP        | n/a    | n/a   | n/a |
| Contract     | n/a    | n/a   | n/a |
| RLS          | n/a    | n/a   | n/a |
| E2E          | n/a    | n/a   | n/a |

## Quality gates

| Gate            | Last status | Last run |
| --------------- | ----------- | -------- |
| pnpm lint       | n/a         | n/a |
| pnpm typecheck  | n/a         | n/a |
| pnpm test       | n/a         | n/a |
| pnpm build      | n/a         | n/a |
| RLS coverage    | n/a         | n/a |
| pnpm audit      | n/a         | n/a |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95 |
| --------------------------------- | ---------- | ------------ |
| POST /sessions/{id}/respond       | 300 ms     | n/a |
| POST /sessions/{id}/submit + sync | 5000 ms    | n/a |
| Pipeline async                    | 30000 ms   | n/a |
| Dashboard load                    | 2000 ms    | n/a |

## Open items

- ADRs accepted: 0
- ADRs proposed: 0
- Issues critical / high / medium / low: 0/0/0/0
- Open questions: 0
- Open bugs: 0
- Deviations logged: 0

## Notes for next session

- Stage 1 is Monorepo & Tooling per DEV_PLAN.md §2. Run morning ritual (CLAUDE_PROMPTS.md §1) before any code.
- Pre-flight (verify before pasting morning prompt):
  - Node 20+ installed (`node -v`)
  - pnpm 9+ installed (`pnpm -v`)
  - Supabase CLI 1.180+ installed (`supabase -v`)
  - Docker installed and running (for local Supabase)
  - GitHub repo `mindmosaic` exists and is cloned locally
  - Supabase project `mindmosaic-dev` created in `ap-southeast-2`
  - Codespaces user secrets configured (or local `.env.local` with Supabase keys, never committed)
- Stage 1 exit criteria: `pnpm install && pnpm turbo build` green on empty repo, CI matrix green on first commit, `git config commit.template .gitmessage` set.
- After Stage 1 close: install Supabase CLI if not done in Stage 1, then proceed to Stage 2 (Migration 0001 — enums + tenancy + auth).
