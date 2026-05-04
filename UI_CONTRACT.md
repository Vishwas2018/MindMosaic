# MindMosaic — UI/UX Contract (v1.0)

**Status:** Binding on all v1 frontend work.
**Companion to:** `BUILD_CONTRACT.md`, `DEV_PLAN.md`, `OWNERS.md`.
**Source of truth for tokens:** the 17 HTML mockups in `docs/mockups/` (the `00-design-system.html` stub is deprecated — this document replaces it).

This document locks the visual language, component inventory, shell rules, accessibility gate, and motion rules. Deviations require an explicit `UI-DIVERGENCE` entry in `DAILY_LOG.md` with reason.

---

## 1. Scope & Principles

### 1.1 Mockup usage rules

The 17 HTML mockups in `docs/mockups/` are **visual reference only**. They are read-only artefacts — never edited during development. See ADR-0002 for rationale and the verified file-to-screen mapping.

**Extract from mockups:**
- Color hex values (verify against §2 token set; §2 is the canonical record)
- Spacing, border-radius, and shadow values
- Typography scale and font choices
- Layout geometry (column widths, sidebar widths, card dimensions)
- Component shapes and interaction states

**Do not copy from mockups:**
- CSS class names or Tailwind utility strings — derive from `packages/ui/src/tokens.css`
- Inline JavaScript or per-file Tailwind `<script>` blocks
- HTML structure — React component trees come from first principles + §3 Component Inventory
- Hardcoded hex values — always use `tokens.css` CSS custom properties

**Conflict resolution (highest authority first):**
1. `UI_CONTRACT.md` (this document)
2. `SCREEN_SPECS.md`
3. Mockup HTML

When a mockup diverges from this document or `SCREEN_SPECS.md`, the contract wins. Log as a `UI-DIVERGENCE` in `DAILY_LOG.md` with affected screen and reason.

**Verified mockup-to-screen mapping** (file titles confirmed; see ADR-0002):

| Mockup file | `SCREEN_SPECS.md` screens |
|---|---|
| `01-authentication.html` | Screens 2–6 (Signup, Login, Forgot Password, Reset Password, Email Verification) |
| `02-dashboard.html` | Screen 7 (Student Home `/`) |
| `03-parent-dashboard.html` | Screens 15–16 (Parent Dashboard, Parent: Child Management) |
| `04-billing.html` | Screen 17 (Billing) |
| `05-student-home.html` | **Screen 8** (Session Selection) — filename misleading; title is "Start a Session" |
| `06-learning-hub.html` | Screen 12 (Learning Hub) |
| `07-exam-engine.html` | Screen 9 (Exam Engine) |
| `08-practice.html` | Screen 10 (Practice) |
| `09-results.html` | Screen 11 (Results) |
| `10-student-assignments.html` | Screen 13 (Student Assignments) |
| `11-engagement.html` | Screen 14 (Engagement) |
| `12-teacher-dashboard.html` | Screens 18–19 (Teacher Dashboard, Teacher: Students List) |
| `13-teacher-student-detail.html` | Screen 20 (Teacher: Student Detail) |
| `14-analytics.html` | Screen 21 (Teacher: Analytics) |
| `15-assignment-engine.html` | Screen 22 (Teacher: Assignment Engine) |
| `16-admin-intelligence.html` | Screen 23 (Admin: Intelligence) |
| `17-landing.html` | Screen 1 (Landing) |

---

### 1.2 Scope

**In scope for v1 (applies to every shipped screen):**
- Authentication (signup/login/reset)
- Student home, session selection, practice, exam engine, results, assignments, learning hub
- Parent dashboard, parent billing
- Teacher dashboard, teacher student detail, teacher analytics, teacher assignment engine
- Admin intelligence (platform_admin read-only in v1)
- Public landing (marketing — single page, static content only)
- Engagement UI elements within dashboards (streaks, simple animations) — **display-only in v1**, writer service deferred

**Out of scope for v1 (deferred to v1.1+):**
- Full dark mode (admin gets partial dark treatment; student/parent/teacher stay light)
- Mobile polish below 768px (responsive works; aesthetic pass deferred)
- Full WCAG 2.1 AA sweep (v1 enforces a critical-path subset — see §7)
- Engagement write-back (achievements, streak notifications as triggers — display only in v1)
- Custom tenant branding
- Per-user theme preferences
- Internationalisation (English only)
- Repair session UI variant

### 1.3 Principles

1. **Mockups are visual reference, not architecture.** Extract tokens, components, layouts. Do not copy class-name approaches, inline JS, or per-file Tailwind `<script>` blocks into React components.
2. **Tokens before components.** Every color, radius, shadow, motion value comes from `tokens.css`. No magic hex values in components.
3. **States before polish.** Every data-bound component renders Loading → Empty → Error → Content in that order during implementation. Missing any state blocks merge.
4. **Server authority over UI state.** Timers, scores, session state, entitlements are always server-derived. Client only displays and optimistically queues.
5. **Accessibility is a build gate, not a retrofit.** axe-core runs from Stage 13 onward. Keyboard-only completion of the exam engine is a Phase 1 exit criterion (non-negotiable).
6. **Serif for moments, sans for everything else.** DM Serif Display is reserved for hero moments (form titles, results ring, page heroes). Everything structural and functional is DM Sans. Never use serif for body text, labels, buttons, or nav.
7. **One primitive, many compositions.** A `Card` is a `Card`. Variants come through props and composition, not CSS duplication.

---

## 2. Locked Token Set

These are the only colors, typography values, radii, shadows, and motion curves permitted in v1. Tokens live in `packages/ui/src/tokens.css` and are mirrored in `packages/ui/src/tailwind.preset.ts`.

### 2.1 Color Tokens

```css
/* packages/ui/src/tokens.css */
:root {
  /* ── Brand (purple) — canonical palette anchored on #5D3FD3 ── */
  --brand-50:  #F5F3FF;
  --brand-100: #EDE9FE;
  --brand-200: #DDD6FE;
  --brand-300: #C4B5FD;
  --brand-400: #9580E5;
  --brand-500: #5D3FD3;  /* primary — canonical brand purple */
  --brand-600: #4A2BBA;  /* primary-d: hover — canonical hover purple */
  --brand-700: #3A1FA0;  /* primary-ink: active */
  --brand-800: #2A1583;
  --brand-900: #1a1a60;  /* canonical dark brand text */

  /* ── Slate (neutral, cool-cast toward brand) ── */
  --slate-25:  #FDFCFE;
  --slate-50:  #FAF8FF;  /* page background */
  --slate-75:  #F0EDF8;  /* hovered nav, subtle surface */
  --slate-100: #E9E5F5;  /* border default */
  --slate-150: #D6D0E8;  /* border strong */
  --slate-300: #A8A0C0;  /* icon disabled, muted-2 */
  --slate-500: #7C7399;  /* muted text */
  --slate-600: #3B3566;  /* secondary text */
  --slate-800: #1E1B4B;  /* primary text */
  --slate-950: #0e1118;  /* admin dark sidebar only */

  /* ── Semantic ── */
  --correct-50:  #f0fdf4;
  --correct-100: #dcfce7;
  --correct-200: #bbf7d0;
  --correct-500: #22c55e;
  --correct-600: #16a34a;   /* success text on light */
  --correct-700: #15803d;

  --incorrect-50:  #fef2f2;
  --incorrect-100: #fee2e2;
  --incorrect-200: #fecaca;
  --incorrect-500: #ef4444;
  --incorrect-600: #dc2626;  /* error text on light */
  --incorrect-700: #b91c1c;

  --warn-50:  #fffbeb;
  --warn-100: #fef3c7;
  --warn-200: #fde68a;
  --warn-500: #f59e0b;
  --warn-600: #d97706;       /* warning text on light */
  --warn-700: #b45309;

  /* ── Accent (orange — "Mosaic" wordmark + results hero) ── */
  --accent-500: #ef6843;     /* in-app accent: wordmark, results hero glow */
  --accent-400: #ef8c56;     /* accent on purple surface (overlays) */
  --accent-300: #f9a825;     /* marketing-only warm amber (landing page) */

  /* ── Semantic surface aliases ── */
  --bg:            var(--slate-50);
  --surface:       #FFFFFF;
  --surface-alt:   var(--slate-25);
  --field-bg:      var(--slate-25);
  --border:        var(--slate-100);
  --border-strong: var(--slate-150);

  --text:        var(--slate-800);
  --text-2:      var(--slate-600);
  --muted:       var(--slate-500);
  --muted-2:     var(--slate-300);

  --primary:     var(--brand-500);
  --primary-d:   var(--brand-600);
  --primary-ink: var(--brand-700);
  --primary-l:   var(--brand-100);

  --ring:        rgba(93,63,211,.14);  /* focus ring base — brand-500 */
  --ring-strong: rgba(93,63,211,.25);  /* focus-visible on buttons — brand-500 */

  --success:    var(--correct-600);
  --success-bg: var(--correct-50);
  --error:      var(--incorrect-600);
  --error-bg:   var(--incorrect-50);
  --warning:    var(--warn-600);
  --warning-bg: var(--warn-50);
}

/* ── Admin dark sidebar scope only ── */
[data-surface="admin-dark"] {
  --surface:   var(--slate-950);
  --text:      #D5D9E2;
  --muted:     #6B7488;
  --border:    #1A1F2B;
}
```

**Rule:** Application code references `--primary`, `--text`, `--surface`, etc. (semantic aliases). Raw `--brand-500` is permitted only inside `packages/ui` primitives.

**Orange accent — reconciled (G6):**
- `--accent-500 #ef6843` is the authoritative in-app accent (wordmark "Mosaic", results hero glow, celebration micro-moments).
- `--accent-400 #ef8c56` is used only on purple surfaces (auth overlay) where `--accent-500` lacks contrast.
- `--accent-300 #f9a825` is used **only on the public marketing landing page**. It is explicitly scoped and does not propagate to in-app screens.

### 2.2 Typography

```css
/* Fonts loaded via next/font in apps/web/src/app/layout.tsx */

/* Scale — use Tailwind classes, not raw sizes */
--font-sans:  'DM Sans', system-ui, sans-serif;
--font-serif: 'DM Serif Display', Georgia, serif;

/* Sizes (Tailwind defaults + custom):
   text-xs   → 12px / 1.4        — pills, microcopy, field hints
   text-sm   → 14px / 1.5        — nav links, button labels, secondary body
   text-base → 15px / 1.65       — body default (note: base is 15, not 16)
   text-lg   → 17px / 1.5        — card titles, emphasized body
   text-xl   → 20px / 1.4        — section headings
   text-2xl  → 24px / 1.3        — page headings
   text-3xl  → 30px / 1.2        — hero numbers (tabular)
   text-[42px] → 42px / 1.1      — serif hero (results ring, auth title)
*/

/* Serif is reserved for:
   - Auth form titles (text-2xl serif)
   - Results hero ("Well Done, Sarah!" — text-3xl serif)
   - Landing H1 (text-[42px] serif)
   - Page heroes on dashboards where called out in mockup

   Serif is NEVER used for:
   - Body text, labels, button text, nav, data values */
```

**Tabular numerals:** Timer, score, percentages, countdowns MUST use `font-variant-numeric: tabular-nums` (Tailwind `tabular-nums`).

### 2.3 Shape

```css
--r-btn:       8px;    /* buttons */
--r-card:      12px;   /* cards, modal content */
--r-card-lg:   16px;   /* auth form container, hero cards */
--r-field:     10px;   /* inputs */
--r-opt:       10px;   /* question option buttons */
--r-pill:      9999px; /* pills, badges */

--border-width: 1px;        /* default */
--border-width-strong: 1.5px; /* option buttons, secondary buttons */
```

### 2.4 Shadow

```css
--shadow-card:       0 0 0 1px rgba(26,26,96,.03), 0 1px 2px rgba(93,63,211,.04), 0 4px 12px -4px rgba(93,63,211,.06);
--shadow-card-hover: 0 0 0 1px rgba(26,26,96,.03), 0 4px 12px rgba(93,63,211,.08), 0 8px 24px -8px rgba(93,63,211,.12);
--shadow-elevated:   0 8px 24px rgba(93,63,211,.1), 0 2px 6px rgba(93,63,211,.06);
--shadow-modal:      0 24px 56px -12px rgba(26,26,96,.25);
--shadow-form:       0 2px 6px rgba(93,63,211,.05), 0 8px 24px -8px rgba(93,63,211,.08);
--shadow-focus:      0 0 0 3px var(--ring-strong);
--shadow-focus-subtle: 0 0 0 3px var(--ring);
```

### 2.5 Motion

```css
--fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);  /* hover, focus, tap */
--base: 200ms cubic-bezier(0.4, 0, 0.2, 1);  /* card transitions, modal open */
--slow: 400ms cubic-bezier(0.4, 0, 0.2, 1);  /* progress bars, ring fills */

--duration-progress: 800ms;   /* progress bar fill, synchronous */
--duration-ring:     1000ms;  /* results hero ring fill */
```

**Motion rules:**
- **`prefers-reduced-motion: reduce`** → all transitions collapse to `0.01ms`. Implement in `tokens.css` with a `@media` override. No JS required.
- Progress bars animate **once on mount**, then stay static. No looping.
- Ring fill (results) animates once on mount via `stroke-dashoffset`.
- Hover translateY: max `-1px`. Scale: max `1.01`. Never rotate.
- No parallax. No scroll-linked animations. No auto-playing videos.

### 2.6 Spacing

Use Tailwind's default scale (`space-y-*`, `gap-*`, `p-*`). Page section spacing defaults:
- Card interior padding: `p-6` (24px) default; `p-4` for dense cards (tables, sidebars)
- Card gap in grids: `gap-4` (16px) mobile, `gap-6` (24px) desktop
- Section vertical rhythm: `space-y-8` (32px) between major sections
- Auth form: `p-8` (32px) on the form container

### 2.7 Tailwind Preset

Ship as `packages/ui/src/tailwind.preset.ts`:

```typescript
import type { Config } from 'tailwindcss';

const preset: Partial<Config> = {
  theme: {
    extend: {
      fontFamily: {
        sans:  ['var(--font-sans)',  'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
      colors: {
        brand:        { 50:'#F5F3FF',100:'#EDE9FE',200:'#DDD6FE',300:'#C4B5FD',400:'#9580E5',500:'#5D3FD3',600:'#4A2BBA',700:'#3A1FA0',800:'#2A1583',900:'#1a1a60' },
        'brand-orange': { 50:'#FFF4ED',500:'#D35400',700:'#B34700' },
        slate:     { 25:'#FDFCFE',50:'#FAF8FF',75:'#F0EDF8',100:'#E9E5F5',150:'#D6D0E8',200:'#D6D0E8',300:'#A8A0C0',400:'#A8A0C0',500:'#7C7399',600:'#3B3566',700:'#3B3566',800:'#1E1B4B',900:'#1E1B4B',950:'#0e1118' },
        correct:   { 50:'#f0fdf4',100:'#dcfce7',200:'#bbf7d0',500:'#22c55e',600:'#16a34a',700:'#15803d' },
        incorrect: { 50:'#fef2f2',100:'#fee2e2',200:'#fecaca',500:'#ef4444',600:'#dc2626',700:'#b91c1c' },
        warn:      { 50:'#fffbeb',100:'#fef3c7',200:'#fde68a',500:'#f59e0b',600:'#d97706',700:'#b45309' },
        accent:    { 300:'#f9a825',400:'#ef8c56',500:'#ef6843' },
      },
      boxShadow: {
        card:        'var(--shadow-card)',
        'card-hover':'var(--shadow-card-hover)',
        elevated:    'var(--shadow-elevated)',
        modal:       'var(--shadow-modal)',
        form:        'var(--shadow-form)',
      },
      borderRadius: {
        xl:  '12px',
        '2xl': '16px',
      },
      transitionTimingFunction: {
        'out-smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
};

export default preset;
```

---

## 3. Component Inventory

Each primitive lives in `packages/ui/src/<Component>/<Component>.tsx` with an adjacent `<Component>.stories.tsx`. Every story must include all states listed below. axe-core runs on every story.

### 3.1 Layout primitives

| Component | Purpose | States |
|---|---|---|
| `AppShell` | Top-level layout wrapper. Discriminated union on `variant`: `'student-parent' \| 'teacher' \| 'admin' \| 'focus' \| 'public'`. | default |
| `TopNav` | Sticky top header (student/parent). 64px tall, white/80 + backdrop-blur, bottom border `--slate-100`. Logo left, nav center, user menu right. | logged-in, authenticating, notification unread, scrolled |
| `Sidebar` | Left rail (teacher/admin). 260px teacher (light), 220px admin (dark scope). Scrollable below header. | collapsed (md:collapse → icon-only ≥1024 but this is v1.1; v1 shows as drawer below lg), role-active |
| `FocusHeader` | Exam/practice header. Timer + progress + exit. No global nav. | default, timer-warn, timer-danger, saving |
| `PageHeader` | Title + subtitle + action slot. Used inside Content of any AppShell. | with action, without action |
| `Card` | Generic surface. `interactive` prop adds hover/focus. | default, hover, focus-within, loading-skeleton |
| `EmptyState` | Icon + title + description + optional CTA. Used wherever a data list is empty. | icon-only, with-cta |

### 3.2 Data display

| Component | Purpose | States |
|---|---|---|
| `StatTile` | KPI card: label (slate-500 text-sm), value (text-2xl tabular), trend delta. | neutral, positive, negative, loading |
| `ProgressBar` | 6px track (slate-100), fill brand-500 or semantic. Animate width 800ms on mount. | 0–100%, semantic variants (correct/warn/incorrect) |
| `SkillBar` | ProgressBar + label + percentage on right. | default, loading |
| `StatRing` | Circular progress SVG. 120px hero, 48px compact. stroke 5. | 0–100%, semantic color, animate on mount |
| `Pill` | Badge: radius pill, text-xs, weight 500. | brand, slate, correct, incorrect, warn, with-icon |
| `Avatar` | Circle initials or image. | 24 / 32 / 40 / 64 px sizes |
| `Table` | Structured list. Header `slate-500 text-xs uppercase`, rows with `slate-100` dividers. | loading, empty, error |
| `Breadcrumbs` | Used on teacher-student-detail and admin routes. | 1–5 levels |
| `Tabs` | Horizontal underlined tabs. Active: `brand-500` bottom border. | default, with-count-pill, loading-state-per-panel |

### 3.3 Forms

| Component | Purpose | States |
|---|---|---|
| `Input` | Text input with floating label. 44px tall, radius 10px, field-bg, border slate-100. | idle, focus, error, success, disabled, with-icon, with-trailing-action |
| `Select` | Native `<select>` styled like Input. | idle, focus, error, disabled |
| `Textarea` | Like Input but min-height 120px. | idle, focus, error, disabled |
| `Checkbox` | 18px square, brand-500 checked. Label right. | unchecked, checked, indeterminate, disabled |
| `RadioGroup` | Vertical stack of labeled radios. | default, disabled |
| `Button` | `variant`: `primary \| secondary \| ghost \| danger \| submit`. `size`: `sm \| md \| lg`. `intent`: `neutral \| destructive` for confirmation dialogs. | idle, hover, active, focus-visible, disabled, loading |
| `IconButton` | 44×44 tap target. `variant`: `ghost \| filled`. | idle, hover, focus-visible, disabled |
| `FormField` | Label + Input + hint/error in one block. | idle, error, success |
| `PasswordRulesChecklist` | Bulleted validation list used in signup. | mixed ok/fail states |

### 3.4 Overlays & feedback

| Component | Purpose | States |
|---|---|---|
| `Dialog` | Modal: max-width 420px default, surface, radius 16px, shadow-modal, overlay blur. | open, closing, with-form, confirmation |
| `ConfirmDialog` | Destructive-action dialog built on `Dialog`. | default, loading (destructive action in flight) |
| `Toast` | Position top-right desktop, bottom-center mobile. Auto-dismiss 5s, pause on hover. | info, success, warn, error, with-action |
| `Tooltip` | Radix Tooltip, 200ms delay. Small text (12px), slate-800 bg, white text. | default |
| `Banner` | Page-top inline notice. | info, success, warn, error, dismissible |
| `LoadingState` | Skeleton placeholder matching final card/row shape. **No spinners inside cards.** | per-component variants |
| `ErrorBoundary` | Route-level: `UnexpectedError` screen with retry + "report" link. | default |
| `OfflineBanner` | Fixed bottom banner during offline. Used on exam engine. | offline, syncing |

### 3.5 Navigation

| Component | Purpose | States |
|---|---|---|
| `NavLink` | Nav item: text-sm, font-medium. Active: `brand-500` text + `brand-50` bg. Hover: `slate-600` text + `slate-75` bg. | idle, hover, active, focus-visible |
| `SidebarNavLink` | Icon + label variant for sidebar. | idle, active (both light + dark scopes) |
| `UserMenu` | Avatar trigger → dropdown with profile/billing/logout. | closed, open, loading |
| `Bell` | Notification indicator with count. | 0, 1–9, 10+ (shows "9+") |

### 3.6 Role-specific compositions

These are not primitives — they're screen-level compositions built from primitives. Listed so developers know they're reusable:

| Composition | Used in | Primitives |
|---|---|---|
| `ChildSwitcher` | Parent dashboard | UserMenu variant, Avatar, NavLink |
| `SessionSummaryCard` | Student home, results, parent dashboard | Card, Pill, StatTile |
| `MasterySnapshot` | Student home, parent dashboard | Card, SkillBar list |
| `ExplanationCard` | Parent + teacher dashboards | Card, Pill, icon + text |
| `QuestionMap` | Exam engine sidebar | Grid of IconButtons with status |
| `AssignmentListItem` | Teacher + student assignments | Card-interactive + metadata row |

### 3.7 What is NOT a primitive

The following are built inline at the screen level in v1 (extract to primitives only when used in 3+ places):
- Results hero ring + metrics row (used once)
- Plan overrides pin/dismiss UI (used in orchestration only)
- Assignment creation wizard steps (used once)
- Billing plan comparison table (used once)

---

## 4. Shell Rules (per role area)

The routing layer in `apps/web/src/app/` has five layout groups. Each has a fixed shell.

### 4.1 `(public)` — auth + landing

- **No nav chrome.** Auth screens use centered form with background pattern; landing is its own full-bleed page.
- Auth screens: `AppShell variant="public"`, centered `max-w-[420px]`, form uses `radius-card-lg` + `shadow-form`.
- Landing: `AppShell variant="public"`, own marketing header (logo + Login/Sign up buttons).

### 4.2 `(student)` — student role

- **Top nav only.** `AppShell variant="student-parent"` → `TopNav`.
- Height 64px, sticky, `bg-white/80 backdrop-blur-xl border-b border-slate-100`.
- Content below: `max-w-6xl mx-auto px-6 py-8`.
- **Exception:** `/session/[id]/exam` and `/session/[id]/practice` use `AppShell variant="focus"` → `FocusHeader` instead. No global nav. Exit button returns to session-selection.

### 4.3 `(parent)` — parent role

- **Top nav only.** Same `AppShell variant="student-parent"`.
- Additional: `ChildSwitcher` in nav center-left.
- Content: `max-w-6xl mx-auto px-6 py-8`.

### 4.4 `(teacher)` — teacher role

- **Sidebar + top bar.** `AppShell variant="teacher"` → `Sidebar` (260px, light, sticky full-height) + minimal top bar (48px, search + user menu).
- Content: fills remaining width, `px-8 py-6`.
- Below `lg` (1024px): Sidebar becomes a drawer, triggered by hamburger in top bar.

### 4.5 `(admin)` — platform_admin role

- **Dark sidebar + light top bar.** `AppShell variant="admin"` → `Sidebar` (220px, `data-surface="admin-dark"`, `--slate-950` bg, `--brand-400` active) + top bar.
- Content: white surface, light.
- Admin is read-only + jobs management in v1 (no tenant admin self-serve UI).

### 4.6 `(focus)` — exam + practice

- **Custom minimal header.** Logo left, timer center, exit right. No user menu, no nav.
- Left sidebar (240px) shows question map.
- Main area fills remaining width.
- Below `lg`: sidebar becomes a bottom sheet.
- **Critical:** `FocusHeader` + `QuestionMap` use `role="banner"` and `role="navigation"` respectively for screen-reader clarity.

### 4.7 Route-to-shell mapping

| Route prefix | Shell variant | Component group |
|---|---|---|
| `/login`, `/signup`, `/reset-password`, `/forgot-password` | `public` | auth |
| `/` (unauthenticated) | `public` | landing |
| `/` (student auth'd) | `student-parent` | student dashboard |
| `/practice`, `/learn`, `/assignments`, `/engagement`, `/session-selection`, `/results/[id]` | `student-parent` | student |
| `/session/[id]/exam`, `/session/[id]/practice` | `focus` | exam/practice |
| `/parent`, `/parent/*`, `/billing` | `student-parent` | parent |
| `/teacher`, `/teacher/*` | `teacher` | teacher |
| `/admin`, `/admin/*` | `admin` | admin |

---

## 5. Critical Screen Contracts

Four screens get explicit per-screen contracts because they carry the most UX risk.

### 5.1 Exam Engine — `/session/[id]/exam` (Stage 23, Days 25–27)

**This is the single most scrutinised UI surface in v1.** It combines time pressure, accessibility, offline resilience, and server-authoritative state.

- **Layout:** `focus` shell; sidebar with `QuestionMap` (left, 240px); main content with question + options + footer nav.
- **Timer:** Server-sent `remaining_seconds` on every respond. Client decrements locally; resyncs on every server response. Three visual states:
  - Normal: `slate-500` text, `slate-50` bg, `slate-100` border
  - Warn (≤5min): `warn-600` text, `warn-50` bg, `warn-200` border
  - Danger (≤1min): `incorrect-600` text, `incorrect-50` bg, `incorrect-200` border
  - **`aria-live="polite"`** on timer container; re-announce on warn + danger transitions only (not every second).
- **Question transitions:** Focus moves to question heading (`<h1>`) after each navigation. Previous answer state preserved in DOM for screen-reader review.
- **Option selection:** Native `<button>` elements with `role="radio"` inside `role="radiogroup"`. Keyboard: Tab to enter, arrows between options, Space/Enter to select.
- **Autosave:** Every 30s + on blur, fire-and-forget. Subtle `Saved` pill top-right fades in/out. Never blocks UI. Failure logs but does not alert.
- **Submit:** Full-width primary button at session end. Confirmation dialog: "You have X unanswered. Submit anyway?" with primary + ghost actions.
- **Offline:**
  - Service worker caches the session shell.
  - Responses queued to IndexedDB with idempotency keys.
  - `OfflineBanner` appears bottom of screen ("Working offline — answers saved locally").
  - On reconnect: replay queue, then show "Synced" toast.
  - **Do not block the user from answering while offline.**
- **Exit:** Confirmation dialog before leaving. Autosaved state means session can resume.
- **a11y acceptance (non-negotiable):**
  - Full keyboard completion of a 30-item session
  - axe-core zero serious/critical on every question state
  - Visible focus ring on every interactive element (`--shadow-focus`)
  - Timer state changes announced via aria-live (warn, danger, expiry)
  - Question map operable via arrow keys + Enter
  - Screen-reader label on every icon-only button (`aria-label`)

### 5.2 Results — `/results/[id]` (Stage 24, Day 28)

- **Mode-aware.** `session_record.mode` drives variant:
  - `scored` (NAPLAN, ICAS): hero ring + accuracy %, topic breakdown, insights, next action. Hero text: DM Serif Display, `text-3xl`.
  - `practice`: no ring, mastery delta card, question summary.
  - `diagnostic`: proficiency map — horizontal bars per skill with confidence interval shading. No score, no ring. Status bands (Developing / Proficient / Advanced) with neutral language.
  - `repair`: **deferred to v1.1**. Stub page in v1 shows "Repair results coming soon".
- **Hero ring:** 120px, `stroke-width: 5`, `stroke-dasharray` calc from circumference. Animate `stroke-dashoffset` over 1000ms on mount. Track `slate-100`, fill color semantic by score band (correct-500 ≥80%, warn-500 60–80%, incorrect-500 <60%).
- **Question review:** Tabs (All / Correct / Incorrect / Unanswered) with count pills. Accordion items show item + chosen answer + correct answer + misconception explanation (if any).
- **Next action:** Card at bottom with primary CTA. Examples: "Practice {weakestSkill}", "Review related concepts", "Take another practice exam".
- **Print-safe:** Results page must print legibly (no background image, ring renders as outlined, tabs expanded).

### 5.3 Dashboards (Student / Parent / Teacher)

Shared rules:

- **Above-the-fold snapshot.** First screenful must show the most important state without scrolling at 1280×800. Student: continue-last + today's focus. Parent: child readiness + "What we noticed". Teacher: class alerts + KPIs.
- **Loading:** Skeleton matches final shape. No generic spinners. Skeletons use `slate-100` fill with subtle shimmer animation (disabled under `prefers-reduced-motion`).
- **Empty states:** Every widget has one. "No assignments yet" / "No recent sessions" / "Your child hasn't started a session yet".
- **Error states:** Widget-level error, not page-level. "Couldn't load recent activity" + retry button. A failed widget does not break the page.
- **Stale data:** DTOs carry optional `stale_since`. When present, widget shows subtle "Last updated Xh ago" microcopy.
- **Explanation cards (parent + teacher):** Composed from `ExplanationDTO` via `packages/core/src/explain-format.ts`. Versioned copy templates. Never freeform LLM output in v1.

### 5.4 Billing — `/billing` (Stage 45, Days 55–56)

- **Three tiers side-by-side.** Free / Standard / Premium cards. Current tier marked with brand pill. Monthly/yearly toggle.
- **Upgrade CTA** opens Stripe Checkout in same-tab redirect (not new window) per Stripe's UX guidance.
- **Active subscription pane:** current plan, renewal date, payment method (last 4), invoice history table, cancel/resume actions.
- **Cancellation flow:**
  - Confirmation dialog first.
  - Shows "You'll keep access until {period_end}".
  - `undo` link visible post-cancel until period end.
- **Failed payment banner:** If last invoice status is `past_due`, page-top error banner with CTA to Stripe Customer Portal.
- **Free-tier users:** hero section prompts upgrade; lower section shows plan comparison.
- **Stripe Elements** (payment method update) uses Stripe's own styling; wrap in our `Card`.

---

## 6. States Matrix (every data-bound component)

Every component that reads remote data MUST implement these five states. Reviewers will reject any PR missing one. CI enforces via Storybook coverage.

| State | Trigger | Treatment |
|---|---|---|
| **Loading** | Initial fetch, refetch | Skeleton matching final layout. No spinner inside card. |
| **Empty** | Fetch returned 0 items | `EmptyState` primitive with icon + description + optional CTA. |
| **Error (general)** | 5xx, network, unexpected | Widget-level error card with icon + retry button. Logs to console with trace_id. |
| **Error (402 upgrade)** | Tier gate from server | Upgrade prompt card. CTA: "Upgrade to {tier}" → `/billing`. |
| **Content** | Normal case | Render data. |

Additional states for specific components:

| Component | Extra states |
|---|---|
| Exam engine question | `submitting` (disable respond while server writes), `version-conflict` (toast + refetch session) |
| Session resume banner | `interrupted` (offer resume), `expired` (offer restart) |
| Parent dashboard | `no-children-linked` (CTA to create child) |
| Teacher dashboard | `no-classes` (CTA to join/create class — v1.1, in v1 show "Contact org admin") |
| Billing | `trial-ending` (banner at 3 days), `past-due` (banner until resolved) |

---

## 7. Accessibility Gate (v1 minimum)

The full WCAG 2.1 AA sweep is deferred to v1.1. v1 enforces this critical-path subset, gated in CI from Stage 13 onward.

### 7.1 CI-enforced (axe-core on every Storybook story + these Playwright routes)

1. Signup, login, reset password
2. Student home
3. Session selection
4. **Exam engine (all question states)**
5. Practice
6. Results (all three modes)
7. Parent dashboard
8. Teacher dashboard
9. Billing

**Zero serious or critical violations** on these routes = merge blocker.

### 7.2 Manual gates (per-stage checklist, logged in DAILY_LOG)

Every UI stage verifies:

1. **Keyboard navigation**: every interactive element reachable via Tab; activation via Enter/Space; Escape closes overlays.
2. **Visible focus**: every focusable element shows a focus ring. Use `--shadow-focus` (buttons) or `--shadow-focus-subtle` (cards/inputs).
3. **Target size**: touch targets ≥44px on mobile. `IconButton` and `Button` primitives enforce this at `size="md"` and above.
4. **Color contrast**: body text on surface ≥ 4.5:1. Large text (≥18px bold or ≥24px) ≥ 3:1. Verified via axe.
5. **Reduced motion**: page usable with `prefers-reduced-motion: reduce` — no essential info in animation.
6. **Semantic HTML**: landmarks (`header`, `nav`, `main`, `aside`, `footer`) present. Headings form a proper outline.
7. **Form errors**: `aria-invalid`, `aria-describedby` → error message id. Errors announced via `aria-live="polite"` on form or field.
8. **Status announcements**: autosave, timer warnings, submission results announced via `aria-live`.
9. **Screen reader labels**: every icon-only button has `aria-label`. Decorative icons have `aria-hidden="true"`.
10. **Skip link**: `Skip to main content` as first focusable element on every shell.

### 7.3 Deferred to v1.1

- Complete WCAG 2.1 AA audit across every state of every screen
- High-contrast theme variant
- Screen reader testing on VoiceOver / NVDA / JAWS (v1 does axe + keyboard only)
- Reading order audit in complex grids (analytics heatmaps)
- Content language attribute + lang switching
- Beyond-viewport focus trapping in drawer shells

---

## 8. Iconography

- **Library:** `lucide-react` (tree-shaken, stroke 1.8, size 20 default, 16 compact, 24 hero).
- **No inline SVG** in application code except for brand-specific assets (logo, favicon, results ring).
- **Brand logo:** ship `MindMosaic_Logo_Sample.svg` and `MindMosaic_Favion_Sample.svg` as-is into `apps/web/public/brand/`. Favicon wired through `next/head` in `layout.tsx`.
- **Icon colors:** inherit from parent text color via `currentColor`. Never hard-code.
- **Semantic icons fixed mapping:**
  - Check → correct (`lucide:Check`)
  - X → incorrect (`lucide:X`)
  - AlertTriangle → warn
  - Info → info
  - Clock → timer
  - BookOpen → content / skill
  - Target → goal / assignment
  - BarChart3 → analytics
  - Sparkles → achievement / celebration
  - Bell → notifications

---

## 9. Copy & Voice

**Voice:** Direct, warm, age-appropriate. No jargon in student-facing surfaces. No euphemisms for wrong answers. No corporate filler.

### 9.1 Rules

- Never use "Whoops!" or "Oops!" for errors. Say what happened: "We couldn't save your answer. Trying again."
- Never congratulate a wrong answer. "Not quite — here's what tripped you up."
- Misconception names are shown directly to students only when they have an accompanying explanation. Never just "You have a subtraction misconception."
- Parent-facing explanations lead with observation, then interpretation, then suggestion. Template: "{student} has been {observation}. This often means {interpretation}. {suggestion}."
- Teacher-facing analytics use plain English over statistics. "5 students struggling with fractions" not "5 students with mastery < 0.4 on σ1.2".

### 9.2 Microcopy inventory (locked in v1)

| Context | Copy |
|---|---|
| Empty assignments (student) | "No assignments yet. Start a practice session to keep learning." |
| Empty sessions (parent) | "{childFirstName} hasn't started a session yet." |
| Network error (generic) | "Couldn't connect. Check your connection and try again." |
| 402 upgrade | "This is a {tierName} feature. Upgrade to continue." |
| Submit confirm (with unanswered) | "You have {count} unanswered questions. Submit anyway?" |
| Autosave success | "Saved" |
| Autosave failure | (silent in UI; logged) |
| Timer warn (≤5min) | Visual only; screen-reader: "5 minutes remaining." |
| Timer danger (≤1min) | Visual; screen-reader: "1 minute remaining." |
| Offline | "Working offline — your answers are saved here and will sync when you're back online." |
| Back online | "Synced." |

All microcopy lives in `apps/web/src/lib/copy.ts` as a typed constant record. No inline strings in components.

---

## 10. Responsive Rules

**v1 breakpoint targets:**
- `sm`: 640px (stretch goal — tolerant, not polished)
- `md`: 768px (functional)
- `lg`: 1024px (primary target for teacher/admin)
- `xl`: 1280px (primary target for student/parent)
- `2xl`: 1536px (graceful max-width clamp)

### 10.1 Behaviour per shell

| Shell | <md (mobile) | md–lg (tablet) | ≥lg (desktop) |
|---|---|---|---|
| `public` | single column form | single column form | single column form, max-w-[420px] |
| `student-parent` | TopNav → hamburger + drawer | TopNav visible | TopNav full |
| `teacher` | Sidebar → drawer, hamburger in top bar | Sidebar → drawer | Sidebar sticky |
| `admin` | Sidebar → drawer | Sidebar → drawer | Sidebar sticky |
| `focus` | QuestionMap → bottom sheet | QuestionMap → bottom sheet | QuestionMap sticky left |

### 10.2 What's deferred to v1.1

- Mobile-first polish of dashboards (layout works but is not optimised)
- Bottom-tab nav alternative for mobile student
- Responsive chart rendering (charts use fixed widths in v1; horizontal scroll on mobile)
- Landing page mobile perfection (functional in v1)

---

## 11. Implementation Stages (cross-reference to DEV_PLAN)

This contract is applied in these stages:

| Stage | Day | UI contract work |
|---|---|---|
| 13 | 13 | `tokens.css`, Tailwind preset, all primitives from §3 with stories, axe-core CI gate live |
| 14 | 14 | `AppShell` variants, auth screens (`public`), student empty dashboard (`student-parent`) |
| 22 | 24 | Session selection, practice screen |
| 23 | 25–27 | **Exam engine (critical a11y gate)** |
| 24 | 28 | Results (all 3 modes) |
| 25 | 29 | Student dashboard (minimal) |
| 36 | 43–44 | Parent dashboard (`ChildSwitcher`, `ExplanationCard`, `MasterySnapshot`) |
| 37 | 45–46 | Teacher dashboard (`teacher` shell, `Sidebar`, intervention alerts) |
| 38 | 47 | Teacher student detail |
| 39 | 48 | Assignment engine |
| 40 | 49 | Student assignments + dashboard v2 (plan widget) |
| 45 | 55–56 | Billing screen |
| 48 | 59 | Full a11y sweep across shipped routes; axe-core across every story |

Admin intelligence screen (`16-admin-intelligence.html`) renders in v1 as a read-only console for platform_admin via `admin` shell (mapped into Stages 28–32 jobs admin endpoints). Full admin-svc UI is P2-deferred.

Engagement screen (`11-engagement.html`) renders in v1 as a display-only widget inside the student dashboard (streaks, achievements read from backend). Writer service is v1.1 P2; in v1 the underlying tables exist but contain only seeded demo data. Non-functional interactions (e.g. claim reward) are visually present but disabled with tooltip "Coming soon".

Learning hub (`06-learning-hub.html`) ships as browse/filter over `pathway` and `item` catalogue — Stage 22 scope.

---

## 12. Divergences from Mockups (intentional)

Where the final implementation diverges from the HTML mockups, document here. Reviewers check this list before flagging "visual mismatch".

### 12.1 Approved divergences

1. **Per-file Tailwind `<script>` blocks → centralised preset.** Every mockup has an inline `tailwind.config`. In code, there is exactly one preset in `packages/ui` consumed by `apps/web/tailwind.config.ts`.
2. **Per-file `:root` token blocks → single `tokens.css`.** Mockups re-declare tokens each file. Code has one source.
3. **Magic-hex literals → CSS vars or Tailwind classes.** Mockup uses `#5D3FD3` inline; code uses `bg-brand-500` or `var(--primary)`.
4. **Inline JS in `<script>` → React components + hooks.** Mockup JS (timer logic, state machines) is reference only; re-implement in React/TypeScript.
5. **`06-learning-hub.html` and `11-engagement.html`** are rich reference; v1 implements the 80% core, defers animated polish to v1.1.
6. **Orange accent reconciled to `#ef6843` in-app.** Mockups show variants; in-app implementation locks to `#ef6843`.
7. **Landing page `#f9a825` accent** is intentionally different; marketing-only scope.
8. **Admin dark sidebar uses `data-surface="admin-dark"` attribute-scoped tokens**, not duplicated classes as in mockup.
9. **`.btn-submit` gradient in exam engine mockup** is reproduced via a `variant="submit"` on `Button`; no ad-hoc gradient class.
10. **Floating-label inputs from auth mockup** are promoted to the standard `Input` primitive for all forms (not just auth).

### 12.2 Not-yet-approved divergences

Any divergence not in §12.1 requires a new entry with rationale before merging. Add entries as commits labeled `ui-divergence`.

---

## 13. Definition of Done (UI stages)

A UI stage is merge-ready ONLY when:

1. All component states (Loading / Empty / Error / 402 / Content) implemented and in Storybook.
2. axe-core: zero serious/critical on new stories and on updated Playwright routes.
3. Keyboard-only smoke test: every new interactive element reachable + operable.
4. Responsive check at 640 / 768 / 1024 / 1280 / 1536.
5. `prefers-reduced-motion: reduce` tested — no essential motion.
6. Tokens only — no magic hex, no one-off font sizes, no inline `style={{ }}` for anything this contract covers.
7. `UI_PRIMITIVES.md` updated with new primitives if introduced.
8. Microcopy from `copy.ts` — no inline strings.
9. Copy reviewed against §9 voice rules.
10. Visual parity with mockup ≥ 90% OR divergence logged in §12.

---

## 14. Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-21 | Initial UI Contract v1.0 | Replaces `00-design-system.html` stub; locks tokens + shells + a11y gate for 75-day v1 |

---

*End of UI/UX Contract v1.0.*
