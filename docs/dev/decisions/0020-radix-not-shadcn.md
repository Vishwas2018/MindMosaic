# ADR-0020 — packages/ui uses Radix UI primitives directly, not shadcn/ui CLI

- Status: accepted
- Date: 2026-05-03
- Stage: 13
- Tags: frontend | dx

## Context

`CLAUDE.md` tech stack lists "Tailwind + shadcn/ui". `BUILD_CONTRACT §9` and `arch §8.1`
reference "Tailwind + CSS tokens" and "TailwindCSS + CSS variables" without mentioning
shadcn. `UI_CONTRACT.md §2` defines a fully custom token system (brand palette, custom radii,
shadows using CSS-var indirection) that diverges significantly from shadcn's default styles.

shadcn/ui is a CLI code generator — it copies Radix-UI-powered components into your project
(typically `components/ui/`). It is not a runtime npm package. The generated components are
Radix UI + Tailwind utilities; shadcn's own styles would need wholesale replacement given our
custom token system.

## Options considered

1. **Run `shadcn init` + `shadcn add …`** — vendor components into `packages/ui/src`, restyle
   entirely to our tokens. Pros: some components ready-to-go. Cons: `components.json` registry
   overhead; heavy restyling erases shadcn value; CLI registry calls in build pipeline; harder
   to keep in sync.

2. **Radix UI directly** — add `@radix-ui/*` packages as deps; write all components from scratch
   on our custom tokens. For simple primitives (Button, Card, Input) use HTML + Tailwind. For
   accessibility-complex overlays (Dialog, Tooltip, Select, Tabs, Checkbox, RadioGroup, Toast)
   use the Radix headless primitives. Pros: same a11y foundation shadcn uses; no CLI overhead;
   full control over design; our token system maps cleanly. Cons: more initial code per component
   than copy-paste from shadcn.

3. **Pure Tailwind + React, no Radix** — Pros: fewer deps. Cons: high a11y risk on Dialog (focus
   trap), Tooltip (ARIA), Select (keyboard), Tabs (roving tabindex). Rejected.

## Decision

Use **Option 2: Radix UI directly, no shadcn/ui CLI**.

The CLAUDE.md wording "shadcn/ui" is treated as shorthand for "Radix-based accessible
primitives". Stage 13 implements the underlying Radix layer without the shadcn vendoring step.
CLAUDE.md tech stack line updated to "Tailwind + Radix UI primitives" for accuracy.

## Rationale

Radix UI is the headless a11y layer shadcn uses internally. By depending on Radix directly,
we get identical keyboard navigation, focus management, ARIA attributes, and WAI-ARIA pattern
compliance without the shadcn overhead. Our heavily customised token system benefits nothing
from shadcn's default styling.

## Consequences

- Positive: full token system control; no CLI dependencies; simpler dep graph; identical a11y.
- Negative: more component code to write initially vs shadcn copy-paste.
- Follow-ups: `CLAUDE.md` tech stack updated. Any future primitive additions follow the same
  "Radix for complex overlays, HTML for simple elements" pattern.

## Implementation notes

Radix packages: `@radix-ui/react-dialog`, `@radix-ui/react-tooltip`, `@radix-ui/react-select`,
`@radix-ui/react-tabs`, `@radix-ui/react-checkbox`, `@radix-ui/react-radio-group`,
`@radix-ui/react-toast`.
Files: `packages/ui/src/**` · Stage: 13
Related: CLAUDE.md tech stack, UI_CONTRACT.md §3, BUILD_CONTRACT §9
