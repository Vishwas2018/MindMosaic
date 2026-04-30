# MindMosaic

Adaptive learning platform for NAPLAN + ICAS pathways. Solo-built v1 MVP, 75-day target.

---

## Document set (v1.0)

The repo's `*.md` documents are organised by purpose. **All eight are part of the canonical v1.0 set.** Anything else is either generated, transient, or out of date.

| Doc | Purpose | When you read it |
|---|---|---|
| `README.md` | Entry point, prerequisites, doc map | Now |
| `CLAUDE.md` | Operating manual + dev journal templates | Every Claude Code session |
| `CLAUDE_PROMPTS.md` | Claude Code prompt catalogue (morning, stage runner, evening, audit, scope cut, hotfix, retro, cold start) | Every Claude Code session |
| `BUILD_CONTRACT.md` | Engineering rules, scope, conventions, git workflow | Before every commit |
| `DEV_PLAN.md` | 75-day stage roadmap + post-launch backlog | Daily — stage of the day |
| `OWNERS.md` | Service ownership matrix (writers, endpoints) | When adding a table or endpoint |
| `UI_CONTRACT.md` | Design tokens, components, shell rules, a11y gate | Frontend stages |
| `SCREEN_SPECS.md` | Per-screen functional specs (fields, validation, states) | Frontend stages |

External, locked sources of truth (under `docs/spec/`, edited only via spec change-log entries):
- `mindmosaic-spec-v4_4.md` — product spec. v1 implementation decisions (G1–G6) are in **Part III.5**.
- `mindmosaic-backend-arch-v2_0.md` — backend architecture. v1 decisions in **Part XI**.

---

## Tech stack (locked — change requires an ADR)

Turborepo + pnpm 9 · Next.js 14 App Router · TypeScript strict · Tailwind + shadcn/ui · Supabase (Postgres 15, RLS, Edge Functions in Deno) · Vitest + Playwright + pgTAP · Recharts · KaTeX · @dnd-kit/core · Stripe (Day 62+, Phase 4 slice).

---

## Prerequisites

- Node 20+ (`.nvmrc` set)
- pnpm 9+
- Supabase CLI 1.180+
- Docker (for local Supabase)

---

## Local dev

```bash
pnpm install
supabase start
pnpm db:reset       # applies migrations + seeds
pnpm -C apps/web dev
```

Pre-push gate:

```bash
pnpm install
pnpm turbo typecheck lint test
supabase db reset && pnpm test:rls
```

---

## Daily workflow (solo)

1. **Start of day** — paste the morning prompt in `CLAUDE.md §Morning ritual`. Claude Code reads `docs/dev/PROJECT_STATE.md`, last 3 `DAILY_LOG.md` entries, open issues/questions/ADRs, then loads today's stage from `DEV_PLAN.md`.
2. **During the day** — execute the stage. One stage = one logical commit to `main`. No feature branches.
3. **End of day** — paste the evening prompt in `CLAUDE.md §Evening ritual`. Claude updates `DAILY_LOG.md`, `PROJECT_STATE.md`, files any ADRs/deviations/bugs, commits dev-context separately.

If 2+ stages behind schedule → stop and pull from the pre-approved scope-cut menu in `DEV_PLAN.md §3`. Do not silently de-scope.

---

## Repo layout (target)

```
apps/
├── web/                 Next.js app (Stage 14+)
└── edge/                Supabase Edge Functions (Stage 18+)
packages/
├── types/               DTOs + Zod schemas
├── sdk/                 Typed fetch client + React Query hooks
├── core/                Pure utilities (skill graph cache, explain-format)
├── engines/             Pure assessment engines (Stage 15+)
├── intelligence/        Pure L1/L2/L3 intelligence (Stage 28+)
├── orchestration/       Rules-based recommender (Stage 31+)
└── ui/                  Design system primitives (Stage 13+)
supabase/
├── migrations/          NNNN_*.sql + NNNN_*.down.sql
├── functions/           Edge Functions, one folder per service
├── tests/               pgTAP + RLS tests
└── seeds/               Skill graph + content seeds (Stage 14)
e2e/                     Playwright (Stage 23+)
docs/
├── mockups/             HTML reference mockups (read-only)
├── dev/                 Running project memory (see CLAUDE.md)
├── prompts/             Archived Claude Code prompts (one per stage)
└── runbooks/            Operational procedures
```

See `DEV_PLAN.md` for the day-by-day plan.
