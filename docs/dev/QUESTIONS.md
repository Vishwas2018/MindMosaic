# QUESTIONS.md — open questions for spec/product owner

> Resolved → ## Resolved with answer + date.
> Use the template from CLAUDE.md §Templates.

## Open

<!-- none -->

## Resolved

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
