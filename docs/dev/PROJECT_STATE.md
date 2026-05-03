# PROJECT_STATE.md

> Overwritten end-of-day. If a value is unknown, write
> "unknown — TODO measure". Never invent numbers.

## Position

- Last completed stage: Stage 13 — packages/ui Primitives + Design Tokens + axe-core Gate (2026-05-03)
- Next stage: Stage 14 — apps/web scaffold + Next.js 14 App Router setup
- Days remaining (target 75): 64
- Buffer days consumed in Phase 0 (Stages 1–14): 0 of 3

## Test suite

| Suite        | Status   | Count     | Last run   |
| ------------ | -------- | --------- | ---------- |
| Unit         | ✅ green  | 171/171   | 2026-05-03 |
| Integration  | n/a      | n/a       | n/a        |
| pgTAP        | ✅ green  | 451/451   | 2026-05-03 |
| Contract     | n/a      | n/a       | n/a        |
| RLS          | ✅ green  | 451/451 (53 tables) | 2026-05-03 |
| E2E          | n/a      | n/a       | n/a        |

Unit breakdown: 97 (@mm/types) + 24 (@mm/sdk) + 50 (@mm/ui: 26 axe + 24 functional)

## Quality gates

| Gate            | Last status | Last run   |
| --------------- | ----------- | ---------- |
| pnpm lint       | ✅ green (7/7 packages) | 2026-05-03 |
| pnpm typecheck  | ✅ green (7/7 packages) | 2026-05-03 |
| pnpm test       | ✅ green (171/171 unit) | 2026-05-03 |
| pnpm build      | ✅ green (cached from Stage 1) | 2026-04-30 |
| RLS coverage    | ✅ 53/53 tables enabled + tested | 2026-05-03 |
| pnpm audit      | unknown — TODO measure | n/a |
| pnpm test:migration | ✅ green (roundtrip up→down→up, 10 migrations) | 2026-05-03 |

## Performance vs BUILD_CONTRACT §10 budgets

| Endpoint                          | Budget p95 | Measured p95 |
| --------------------------------- | ---------- | ------------ |
| POST /sessions/{id}/respond       | 300 ms     | n/a          |
| POST /sessions/{id}/submit + sync | 5000 ms    | n/a          |
| Pipeline async                    | 30000 ms   | n/a          |
| Dashboard load                    | 2000 ms    | n/a          |

## Open items

- ADRs accepted: 20 (ADR-0001 through ADR-0020)
- ADRs proposed: 0
- Issues critical / high / medium / low: 0/0/0/1
- Open questions: 0
- Open bugs: 0
- Deviations logged: 2 (DEV-20260430-1 ongoing Stage 15; DEV-20260503-2 ongoing v1.1)

## Notes for next session

**Stage 13 complete (2026-05-03):**
- packages/ui: tokens.css + tailwind.preset.ts + 26 primitives (Layout/Nav/Data/Forms/Overlay)
- Each primitive: TSX (forwardRef/CSS vars/44px touch targets) + Storybook story + axe test
- axe-core CI gate: Vitest + jest-axe + toHaveNoSeriousViolations (X2 — fail serious/critical only)
- Two-layer a11y: CI = Vitest+jest-axe; dev-time = Storybook+@storybook/addon-a11y
- ADR-0020: Radix UI directly (not shadcn CLI); Q-0001 resolved
- UI-DIVERGENCE: axe CI gate moved from storybook:test (BUILD_CONTRACT §10) → pnpm test (Vitest).
  BUILD_CONTRACT §10 correction deferred to Stage 14 audit.
- Key TS infra note: jest-axe@9 has no types → ambient module declaration in script-mode .d.ts.
  @testing-library/jest-dom toHaveAttribute declared directly in vitest augmentation (NodeNext
  propagation limitation from .ts setup file).
- afterEach(cleanup) must be explicit in Vitest setup; auto-cleanup not reliable.
- aria-label required on Radix Checkbox.Root, RadioGroup.Item, Select.Trigger for axe in jsdom
  (sibling <label for> not computed by axe-core's jsdom accessible name algorithm).
- Commit: d2be303

**ISSUE-0004 (open, low):** outbox_event 7-day cleanup. Stage 14 close. Add pg_cron job
`outbox.cleanup` DELETE WHERE processed_at < now() - interval '7 days'.

**Pre-existing partition RLS advisory:**
intelligence_audit_log_default + learning_event_default reported RLS-disabled by supabase db query.
These are pg_partman default partitions (Stage 5/6). Application code routes through parent tables
(RLS-enabled). Not a blocking issue.

**DEV-20260430-1:** ongoing, resolves Stage 15.
**DEV-20260503-2:** ongoing, resolves v1.1 (content.recalibration stub).

**cron.schedule() pattern (ADR-0017):** Stage 9 onwards uses cron.schedule() / cron.unschedule()
public API. Avoid direct INSERT into cron.job.

**Supabase remote project:** https://tohmshcpdhcdfsubvnok.supabase.co (ap-southeast-2)

**Stage 14 pre-cues:**
- ISSUE-0004 outbox cleanup pg_cron job to add
- BUILD_CONTRACT §10 axe gate reference to update (storybook:test → pnpm test)
- apps/web Next.js 14 App Router scaffold (RootLayout, providers, route structure)
