# @mm/ui — MindMosaic UI Primitive Library

Design system baseline for MindMosaic v1. All 26 Stage 13 primitives live here.

## Token import

Import `tokens.css` once in `apps/web/src/app/layout.tsx`:

```ts
import '@mm/ui/tokens.css';
```

Never import tokens.css in individual components or duplicate CSS vars.

## Tailwind preset

In `apps/web/tailwind.config.ts`:

```ts
import preset from '@mm/ui/tailwind.preset';
export default { presets: [preset], content: ['...'] };
```

## A11y gate — two-layer approach (X5)

| Layer | Tool | Purpose |
|---|---|---|
| CI gate | Vitest + jest-axe (`toHaveNoSeriousViolations`) | Fails build on serious/critical violations |
| Dev review | Storybook + `@storybook/addon-a11y` | Visual a11y panel for development |

**CI gate:** `pnpm test` runs all `*.test.tsx` files via Vitest + jsdom + jest-axe.
Zero serious/critical violations required to pass. Moderate/minor violations are logged as
informational only (per ADR-0020, X2 directive).

**Storybook:** `pnpm storybook` starts the dev server. The a11y addon shows the full axe
panel for all stories — useful during development. This does NOT run in CI.

Note: BUILD_CONTRACT §10 references `pnpm -C packages/ui storybook:test` for the axe gate.
The actual CI gate is `pnpm test` (Vitest). Logged as UI-DIVERGENCE in DAILY_LOG Stage 13.

## Component location

```
packages/ui/src/
  <ComponentName>/
    <ComponentName>.tsx       — implementation
    <ComponentName>.stories.tsx — Storybook story
    <ComponentName>.test.tsx  — Vitest + axe test
```

## Radix UI usage (ADR-0020)

Complex overlays (Dialog, Tooltip, Select, Tabs, Checkbox, RadioGroup, Toast) use Radix UI
headless primitives for accessible keyboard/focus behavior. Simple elements (Button, Card, Input,
etc.) use plain HTML + Tailwind + CSS tokens. No shadcn/ui CLI used.
