# MindMosaic — Screen Specs (v1.0)

**Status:** Binding on all v1 frontend work.
**Companion to:** `UI_CONTRACT.md`, `BUILD_CONTRACT.md`, `DEV_PLAN.md`, `OWNERS.md`.
**Source of truth for visual parity:** HTML mockups in `docs/mockups/` (read-only reference).
**Source of truth for tokens/primitives/shells:** `UI_CONTRACT.md`.
**Source of truth for API DTOs:** `packages/types` (`@mm/types`).

This document is the **per-screen functional specification**. It closes the gap between "what the app looks like" (UI contract) and "what every field does, what validates it, what errors can surface, and what's out of scope". Every shipped screen has one section below; no screen is built without reference to its section.

## How to use this document

- **For each screen** you get: purpose, user stories, fields, actions, links, states, API calls, a11y notes, out-of-scope.
- **Field format** — `name | type | required | client validation | server validation | error copy`.
- **Error copy** follows `UI_CONTRACT.md` §9 voice rules (direct, warm, no jargon).
- **States** are mandatory per `UI_CONTRACT.md` §6 (Loading / Empty / Error / 402-upgrade / Content).
- **Defer notes** mark anything consciously pushed to v1.1+ (tracked in `DEV_PLAN.md` §5).

## Global decisions (apply to every screen)

These resolve open questions that recur across screens:

| Decision | Choice | Rationale |
|---|---|---|
| Social login (Google / Apple / Microsoft / Facebook) | **Deferred to v1.1** | Adds ~3 days to auth stage; email+password covers 100% of audience at launch |
| "Remember me" checkbox | **Not shipped** | Supabase issues long-lived refresh tokens by default; a checkbox is UX theatre without short-session variant |
| "Try a sample test" pre-signup | **Deferred to v1.1** | Growth feature, not core; landing page CTA goes to signup |
| Email verification | **Magic-link via Supabase built-in** | Zero custom code; user signs up → "check your email" → click link → auto-authenticated |
| Password policy | **Min 10 chars, ≥1 letter + ≥1 number** | Per NIST SP 800-63B; no special-char requirement; no forced periodic rotation |
| MFA / 2FA | **Deferred to v1.1** | Not required for family/student tier; school tier in v1.2 |
| Account deletion (self-serve) | **Deferred to v1.1** (G-deferred, spec §22.3.2) | Manual admin process satisfies APP compliance at launch scale |
| Language | English (en-AU) only | Internationalisation deferred to P3 |
| Timezone display | User's browser TZ, labelled; all server times ISO-8601 UTC | Simple, correct, no per-user settings |
| Marketing consent | Checkbox at signup, default unchecked | APP compliance; value written to `user_profile.marketing_consent` |
| Cookies banner | Single non-blocking banner, dismissible | AU privacy policy requires disclosure; functional cookies are strictly necessary and not gated |
| Loading thresholds | Skeleton shows after 200ms; content fades in 150ms | Avoids flash for fast responses |

---

# Public & Auth Screens

## Screen 1 — Landing (`/` unauthenticated)

**Mockup:** `17-landing.html`
**Shell:** `public`
**Stage:** Not a core v1 stage; ships as a static page alongside Stage 14 auth.
**Route guard:** unauthenticated only. Authenticated users redirect to their role home.

### Purpose
Marketing page for prospective customers. Primary goal: drive signup. Secondary: credibility + feature explanation.

### Scope for v1
- **In scope:** single-page marketing with hero, feature grid, pricing preview, FAQ, CTAs to signup.
- **Not in scope:** blog, case studies, school contact form, ROI calculator, internationalised variants.

### User stories
- As a prospective parent, I understand what the product does in <15 seconds.
- As a prospective parent, I can see pricing tiers before signing up.
- As a prospective parent, I can start signup from any prominent CTA.

### Content sections (locked)
1. **Hero** — H1 + subtitle + primary CTA "Start free" + secondary "See pricing".
2. **Features grid** — 3–6 feature cards (icon + title + 1-sentence description). Content authored from Spec §1.
3. **How it works** — 3-step visual (Assess → Understand → Improve).
4. **Pricing preview** — tier summaries with prices, "Full comparison →" link to `/signup?intent=billing`.
5. **FAQ** — 5–8 questions, accordion.
6. **Footer** — links to Privacy, Terms, Contact.

### Actions
| Label | Result | Notes |
|---|---|---|
| Start free | → `/signup` | Primary CTA in hero and footer |
| See pricing | → scroll to pricing section | Anchor link |
| Log in | → `/login` | Top nav |
| Contact | → `mailto:hello@mindmosaic.app` | v1 simple; contact form in v1.1 |

### States
- **Loading:** static page, no loading state required.
- **Empty/Error/402:** N/A (no remote data).
- **Content:** default.

### API calls
None. Fully static.

### Analytics events (deferred to v1.1)
Mark `landing_viewed`, `landing_cta_clicked` as placeholders in `/src/lib/analytics.ts` — no implementation in v1. Structured-log-only if needed.

### a11y notes
- All section headings form a proper outline (H1 → H2 per section).
- Links have accessible names; icons are `aria-hidden`.
- Skip-link to main content as first focusable element.
- Color contrast check on marketing accent `#f9a825`: verify against white bg (passes AA for ≥18px bold only — use only in heading/button positions, never for body copy).

### Out of scope for v1
- Testimonials (content not yet sourced)
- Video hero
- Free-trial sample test direct from landing (deferred)

---

## Screen 2 — Signup (`/signup`)

**Mockup:** `01-authentication.html` (signup form portion)
**Shell:** `public`
**Stage:** 14 (Day 14)
**Route guard:** unauthenticated only.

### Purpose
Parent self-signup. Per G1, this is the ONLY self-serve signup path. Student + teacher accounts are created via other flows (not this screen).

### User stories
- As a parent, I create an account with email + password.
- As a parent, I see my password strength as I type.
- As a parent, I understand what happens after I submit (check email).
- As a parent, I see clear field-level errors if something's wrong.
- As a parent accepting a school invite, I land here with role and tenant pre-filled (invite token in URL).

### Query params
| Param | Purpose |
|---|---|
| `invite` | Signed JWT from a teacher/tutor invite (G1). Changes the flow: role and tenant pre-set from token; `role=parent` is overridden. |
| `intent` | e.g. `billing` — after signup, redirect to `/billing` instead of dashboard |
| `email` | Prefill email field (from invite email body) |

### Fields

| name | type | required | client validation | server validation | error copy |
|---|---|---|---|---|---|
| `display_name` | text | ✅ | 2–80 chars, trim whitespace, no leading/trailing spaces | same; reject control chars | "Enter your name so we know what to call you." |
| `email` | email | ✅ | RFC 5322 basic regex, ≤254 chars | same; DNS MX lookup optional (v1: skip); reject disposable domains from seeded list | "Enter a valid email address." / "An account with this email already exists — try signing in." |
| `password` | password | ✅ | **Min 10 chars, ≥1 letter, ≥1 number** | same; hash via Supabase Auth | "Password needs at least 10 characters, with letters and numbers." |
| `confirm_password` | password | ✅ | must equal `password` | n/a (not sent to server) | "Passwords don't match." |
| `marketing_consent` | checkbox | optional | default false | persisted to `user_profile.marketing_consent` | n/a |
| `terms_accepted` | checkbox | ✅ | must be true to enable Submit | server double-checks; rejects if false | "You'll need to accept the Terms to continue." |

### Password strength visual
- `PasswordRulesChecklist` component (UI_CONTRACT §3.3).
- Rules shown:
  - ✔ / ✘ "10+ characters"
  - ✔ / ✘ "Contains a letter"
  - ✔ / ✘ "Contains a number"
- Diverges from mockup's 5-rule checklist (uppercase, lowercase, special). Mockup is legacy; per §Global decisions we use NIST-aligned policy.

### Actions

| Button | Type | Action | Idempotency | Rate limit |
|---|---|---|---|---|
| **Create account** | primary submit | `POST /auth/signup` → on success, show "Check your email" state | `Idempotency-Key` header = UUID v4 from client (regenerated on submit) | 5 req / 15 min per IP |
| Show/hide password | icon | toggle input `type` | n/a | n/a |
| Log in instead | ghost link | → `/login` | n/a | n/a |
| Forgot password | ghost link | → `/forgot-password` | n/a | n/a |

### Links out
- → `/login`
- → `/forgot-password`
- → `/terms` (static page, v1: link opens in new tab to a hosted Notion/GitHub page until we build a Terms route in v1.1)
- → `/privacy` (same treatment)

### States
- **Loading (form disabled):** while `POST /auth/signup` in flight, disable Submit + show spinner inside button, keep form readable.
- **Empty:** N/A (form always has initial state).
- **Error — field-level:** per-field red border + message below; focus first invalid field on submit attempt.
- **Error — form-level:** `Banner variant="error"` above submit: "Something went wrong. Try again or contact support." Retains form values.
- **Error — known (409 email exists):** inline error on email field: "An account with this email already exists — try signing in." with `→ /login?email=...` link.
- **Success (post-submit):** form replaced with "Check your email" state: envelope icon, copy: "We sent a link to {email}. Click it within 60 minutes to finish signing up.", CTA "Resend email" (30s cooldown).

### API calls
- **`POST /auth/signup`**
  - Request DTO: `{ display_name, email, password, role: 'parent', marketing_consent: bool, invite_token?: string }`
  - Response (200): `{ user_id, message: 'verification_email_sent' }`
  - Errors:
    - `400 INVALID_INPUT` — field-level details; show inline
    - `409 EMAIL_EXISTS` — show email-exists path
    - `422 INVALID_INVITE` — show banner: "That invitation link has expired or is invalid. Ask for a new one."
    - `429 RATE_LIMITED` — banner: "Too many attempts. Try again in a minute."

### Auth configuration
- **Social login:** none in v1 (§Global decisions).
- **Email verification:** magic-link via Supabase. User must click the link in their email within 60 minutes.
- **Auto-login after verification:** yes — the magic link includes a one-time session token that completes login.
- **Session lifetime:** Supabase default (1 hour access token, long-lived refresh).

### Tenant handling (G1)
- **Without `invite` param:** On successful signup, `handle_new_user()` trigger creates a `family`-type tenant and links the user as `parent`. User profile `tenant_id` populated.
- **With `invite` param:** Role and tenant resolved from signed JWT. User joins the existing tenant in the role encoded in the token (teacher / tutor / org_admin). `role=parent` is ignored.
- **If user attempts `role=student`:** Request is rejected at the endpoint (422 with details.reason = 'students_created_via_parent_or_invite'). The client UI does not expose a student signup path at all.

### Analytics events (deferred)
Placeholder entries: `signup_viewed`, `signup_submitted`, `signup_error`, `signup_verified`.

### a11y notes
- `<form>` with submit button; no JS-only submission.
- Each field: `<label>` associated via `htmlFor`, `aria-invalid` on error, `aria-describedby` → error message ID.
- Password strength checklist: `aria-live="polite"` so screen reader announces changes.
- Show/hide password button: `aria-label="Show password"` / `"Hide password"` toggled on click; `aria-pressed` reflects state.
- Submit disabled state includes `aria-disabled="true"`.
- Focus on first invalid field on failed submit.

### Out of scope for v1
- OAuth buttons (Google, Apple, Microsoft, Facebook) — visible in mockup but **removed from v1 UI**
- "Try a sample test" link — **removed from v1 UI**
- CAPTCHA — rate limit only in v1; Cloudflare Turnstile in v1.1
- Password-strength meter beyond rule-list
- Optional profile photo upload at signup

---

## Screen 3 — Login (`/login`)

**Mockup:** `01-authentication.html` (signin form)
**Shell:** `public`
**Stage:** 14 (Day 14)
**Route guard:** unauthenticated only. If session exists, redirect to role home.

### Purpose
Email+password login.

### Query params
| Param | Purpose |
|---|---|
| `email` | Prefill email field (from "email exists" redirect or invite) |
| `redirect` | Safe relative path to return to after login (allowlisted origins only) |

### Fields

| name | type | required | client validation | server validation | error copy |
|---|---|---|---|---|---|
| `email` | email | ✅ | basic RFC 5322 regex | n/a (handled via Supabase) | "Enter a valid email address." |
| `password` | password | ✅ | non-empty | n/a | "Enter your password." |

### Actions

| Button | Type | Action | Rate limit |
|---|---|---|---|
| **Log in** | primary submit | `POST /auth/login` (Supabase) → on success, redirect to `redirect` or role home | 10 / 15 min per IP |
| Show/hide password | icon | toggle `type` | n/a |
| Forgot password? | ghost link | → `/forgot-password?email=...` | n/a |
| Sign up | ghost link | → `/signup` | n/a |

### States
- **Loading:** button spinner + form disabled.
- **Error — generic 401:** Banner: "Email or password doesn't match. Try again." (do NOT disclose which is wrong)
- **Error — email unverified:** Banner with action: "Please verify your email before logging in." + button: "Resend verification email" (30s cooldown).
- **Error — account locked** (after 10 failed attempts in 15 min): Banner: "Too many attempts. Try again in 15 minutes, or reset your password." + link to `/forgot-password`.
- **Error — network:** Banner: "Couldn't connect. Check your connection and try again."

### API calls
- `POST /auth/login` — Supabase auth endpoint. Request: `{ email, password }`. Response: session tokens.
- On success, SDK persists session; client then calls `GET /users/me` to hydrate entitlements and role. **Role-based redirect happens after `/users/me` response.**

### Auth configuration
- **Social login:** none in v1.
- **Remember me:** no checkbox; session lifetime is Supabase default.
- **Passwordless magic link login:** not shipped in v1 (signup verification uses magic link, but regular login is email+password).

### Redirect rules
- Student → `/` (student home)
- Parent → `/parent` (parent dashboard)
- Teacher / tutor / org_admin → `/teacher`
- Platform_admin → `/admin`
- If `?redirect=<path>` and path is allowlisted (same origin, known prefixes) → that path instead.

### a11y notes
- Same as Signup.
- `autocomplete="email"` and `autocomplete="current-password"` set correctly.

### Out of scope for v1
- Social login buttons
- MFA / TOTP
- Magic-link login variant (only used for signup verification)
- "Remember me" checkbox
- Device management (list active sessions) — v1.1

---

## Screen 4 — Forgot Password (`/forgot-password`)

**Mockup:** `01-authentication.html` (reset modal)
**Shell:** `public`
**Stage:** 14 (Day 14)
**Route guard:** unauthenticated only.

### Purpose
Request password reset email.

### Fields

| name | type | required | client validation | error copy |
|---|---|---|---|---|
| `email` | email | ✅ | RFC 5322 regex | "Enter a valid email address." |

### Actions

| Button | Type | Action | Rate limit |
|---|---|---|---|
| **Send reset link** | primary submit | `POST /auth/forgot-password` | 3 / 15 min per email |
| Back to log in | ghost link | → `/login` | n/a |

### States
- **Content (default):** form visible.
- **Loading:** button spinner.
- **Success:** form replaced with confirmation: "If an account exists for {email}, we sent a reset link. Check your inbox within 15 minutes." (generic — does NOT disclose whether account exists)
- **Error — rate limited:** Banner: "Too many reset requests. Try again in 15 minutes."

### API calls
- `POST /auth/forgot-password` — request: `{ email }`. Response is **always 200 OK** with a generic success message (prevents email enumeration).

### a11y notes
- Same field a11y patterns as Signup.
- Success state has `aria-live="polite"` so announced.

### Out of scope for v1
- "I don't have access to my email anymore" recovery flow — v1.1 (manual support)

---

## Screen 5 — Reset Password (`/reset-password`)

**Mockup:** derived from `01-authentication.html` + new; not a distinct mockup screen.
**Shell:** `public`
**Stage:** 14 (Day 14)
**Route guard:** requires valid `token` query param.

### Purpose
User clicks the reset link from email → lands here with token → sets new password.

### Query params
| Param | Required | Purpose |
|---|---|---|
| `token` | ✅ | Supabase reset token from email |

### Fields

| name | type | required | client validation | server validation | error copy |
|---|---|---|---|---|---|
| `new_password` | password | ✅ | same policy as signup | same | "Password needs at least 10 characters, with letters and numbers." |
| `confirm_password` | password | ✅ | must match `new_password` | n/a | "Passwords don't match." |

### States
- **Token invalid/expired (on mount):** full-page error: "This reset link has expired or has already been used. [Request a new one](/forgot-password)."
- **Content:** form with password rules checklist.
- **Loading:** button spinner.
- **Success:** redirect to `/login?reset=success` with toast "Password updated. Log in to continue."

### API calls
- `POST /auth/reset-password` — request: `{ token, new_password }`. Response 200 OK.
- Errors: `401 INVALID_TOKEN`, `400 INVALID_PASSWORD` (policy failure).

### a11y notes
- Same as Signup field patterns.
- Success redirect announces via toast `aria-live`.

### Out of scope for v1
- Showing account email on this screen (Supabase token includes it but we don't display — keeps flow neutral)

---

## Screen 6 — Email Verification Landing (`/auth/verify`)

**Mockup:** not mocked; simple derived screen.
**Shell:** `public`
**Stage:** 14 (Day 14)

### Purpose
User clicks magic link in signup email → lands here → server exchanges code for session → redirects to role home.

### States
- **Loading (default, usually <1s):** spinner + "Verifying your email…"
- **Success:** silent redirect to role home.
- **Error — invalid/expired link:** "This link has expired. [Resend verification](/resend-verification)" + link back to `/signup`.

### API calls
- `GET /auth/verify?token=...` — server-side in Next.js route handler. On success sets session cookie + 302 redirects. On failure renders error state.

### Out of scope for v1
- Standalone "resend verification" flow with email entry — covered by the post-signup "Resend email" button only in v1.

---

# Student Screens

## Screen 7 — Student Home (`/`)

**Mockup:** `02-dashboard.html` (primary) + `05-student-home.html` (session mode selector variant)
**Shell:** `student-parent`
**Stage:** 25 (Day 29) minimal; Stage 40 (Day 49) full with plan widget.
**Route guard:** authenticated student.

### Purpose
Student's home after login. Shows continue-last, today's focus, mastery snapshot.

### v1 content (locked)
1. **Continue-last card** (if active/interrupted session exists) — hero card with brand gradient, big resume CTA. Uses `SessionSummaryCard` composition.
2. **Weekly Learning Plan widget** (from Stage 40 only) — 3–5 items from `/orchestration/plan/{student_id}/current`. Each item: title, skill, est. duration, Start button.
3. **Mastery Snapshot** — 3–5 `SkillBar` items from `/intelligence/learner-profile/{student_id}`.
4. **Quick Insights** (from Stage 40) — 2–3 cards composed from `ExplanationDTO` via `explain-format.ts`.
5. **Start fresh tiles** — 2 tiles (Practice mode / Mock exam) per `05-student-home.html`.
6. **Recent sessions** — last 5 sessions via `GET /sessions/recent`.

### Actions

| Element | Action |
|---|---|
| Continue-last CTA | → `/session/{id}/exam` or `/session/{id}/practice` (mode-aware) |
| Plan item "Start" | → `/session-selection?preset={plan_item_id}` |
| Practice tile | → `/session-selection?mode=practice` |
| Mock exam tile | → `/session-selection?mode=exam` |
| Session in recent | → `/results/{id}` |
| Bell icon | → notifications dropdown |
| User avatar | → user menu |

### States
- **Loading:** skeleton for each card. Hero skeleton is gradient placeholder.
- **Empty (no sessions ever):** replace continue-last + recent with onboarding card: "Welcome! Start your first session to see insights here." → Practice tile primary.
- **Error (widget-level):** each widget shows "Couldn't load" + retry. Other widgets render normally.
- **402:** N/A on student home (student always has free-tier read access).
- **Content:** default.

### API calls
- `GET /users/me` (already hydrated in AuthProvider)
- `GET /sessions/recent?limit=5`
- `GET /intelligence/learner-profile/{student_id}` (skill_mastery summary)
- `GET /orchestration/plan/{student_id}/current` (Stage 40+)
- `GET /notifications/me?unread=true` (for bell badge)

### a11y notes
- H1 at top of page: "Welcome back, {first_name}" (visually hidden if mockup doesn't show).
- Each card has an H2 or H3.
- "Continue-last" interactive card: entire card is focusable, role="link".
- Recent sessions list: ordered list, each item with session title, score, date.

### Out of scope for v1
- Streaks / engagement widgets as interactive (display-only from seeded demo data)
- "Recommended for you" from content intelligence (L8 deferred)
- Daily goal tracker
- Chart of progress over time (deferred to v1.1)

---

## Screen 8 — Session Selection (`/session-selection`)

**Mockup:** derived from `02-dashboard.html` + `05-student-home.html` mode selector
**Shell:** `student-parent`
**Stage:** 22 (Day 24)

### Purpose
Student picks what to practice or which mock exam to take.

### Query params
| Param | Purpose |
|---|---|
| `mode` | `practice` \| `exam` \| `diagnostic` — pre-filters tiles |
| `preset` | UUID of a plan item — pre-selects it |
| `subject` | e.g. `numeracy` — pre-filters subject chip |

### v1 content
1. **Heading + subtitle:** "How do you want to study today?"
2. **Subject chips row** — All subjects / Numeracy / Reading / Writing / Language Conventions. Single-select.
3. **Pathway cards** — filtered by entitlements (`/pathways`). Each card shows: pathway name, mode options (Practice / Exam / Diagnostic), lock icon if not entitled.
4. **Locked pathways** — rendered dimmed with "Upgrade to unlock" CTA → `/billing`.

### Actions

| Element | Action |
|---|---|
| Subject chip | Client-side filter, no fetch |
| Pathway card → Start Practice | `POST /sessions/create { mode: 'practice', pathway_slug }` → `/session/{id}/practice` |
| Pathway card → Start Exam | `POST /sessions/create { mode: 'exam', pathway_slug }` → `/session/{id}/exam` |
| Pathway card → Start Diagnostic | `POST /sessions/create { mode: 'diagnostic', pathway_slug }` → `/session/{id}/practice` (diagnostic variant) |
| Locked pathway CTA | → `/billing?intent=upgrade&pathway={slug}` |

### States
- **Loading:** skeleton cards (3 placeholder).
- **Empty (no entitled pathways, only free tier):** show free-tier pathways ("NAPLAN Y5 Numeracy practice") + banner "Upgrade to unlock full mock exams and all subjects."
- **Error:** widget-level error card + retry.
- **402 (session create denied):** toast "This is a Premium feature" + link to billing. Do not navigate.
- **Content:** default.

### API calls
- `GET /pathways` (entitlement-filtered)
- `POST /sessions/create` with `Idempotency-Key`:
  - Request DTO: `CreateSessionRequest { pathway_slug, mode, blueprint_id? }`
  - Response: `CreateSessionResponse { session_id, first_item, lock_token, expected_version }`
  - Errors: `402 TIER_GATED` (trigger upgrade toast), `409 SESSION_ALREADY_ACTIVE` (banner with "Resume active session" link), `429 RATE_LIMITED`.

### a11y notes
- Subject chips: `role="tablist"`, chips `role="tab"` with `aria-selected`.
- Pathway cards: `role="button"`, focusable, Enter/Space activates.
- Locked cards have `aria-disabled="true"` and visible lock icon with `aria-label="Locked — upgrade to access"`.

### Out of scope for v1
- "Recommended" tab (deferred to L8)
- Duration estimator per pathway (generic "20–30 min" label only in v1)

---

## Screen 9 — Exam Engine (`/session/[id]/exam`)

**Mockup:** `07-exam-engine.html`
**Shell:** `focus` (custom minimal chrome)
**Stage:** 23 (Days 25–27) — **the critical a11y gate**
**Route guard:** authenticated student; session must exist, belong to student, be in `in_progress` state, and be mode `exam` or `adaptive`.

### Purpose
Server-authoritative exam flow. Student answers items under timer with navigation and offline resilience.

**Full contract in `UI_CONTRACT.md` §5.1.** This section adds the functional specifics.

### Layout
- **Top:** `FocusHeader` — logo left, timer center, exit right.
- **Left:** `QuestionMap` sidebar (240px) — grid of question number buttons; status-colored (unanswered / answered / flagged / current). Collapsible on mobile (bottom sheet).
- **Main:** question stem + stimulus if any + options + footer nav.

### Question types supported in v1
| Type | Behavior |
|---|---|
| `multiple_choice` | Radio selection, 4 options typical; one correct |
| `multiple_select` | Checkbox selection, 2+ correct |
| `numeric_input` | Single number, validated client-side for numeric |
| `text_input` | Short text (≤200 chars); writing stage only, no auto-marking |
| `extended_response` | Long text (≤2000 chars); writing stage only, no auto-marking |

### Fields per question
| field | notes |
|---|---|
| `response` | User's answer; shape varies by question type |
| `flagged` | Boolean; can toggle without submitting response |
| `time_on_item_ms` | Client-measured; sent with response; **server authoritative on session total** |

### Actions

| Element | Action |
|---|---|
| Option (MCQ) | Select answer, autosave (not submit) |
| Flag button | Toggle flag on current item |
| Prev / Next | Navigate; server returns next item via `CreateSessionResponse.navigation` |
| Question map item | Jump to item (if allowed by engine — adaptive blocks cross-stage) |
| Autosave (every 30s + on blur) | `POST /sessions/{id}/respond` with current response state (fire-and-forget) |
| Submit response | `POST /sessions/{id}/respond` with final response and `navigation: 'next'` |
| Submit session | `POST /sessions/{id}/submit` → `/results/{id}` |
| Exit | Confirmation dialog → if confirmed, autosave + navigate to `/` |

### Timer rules
- Server returns `remaining_seconds` on every `/respond` response; client resets its ticker.
- Three visual states (see UI_CONTRACT §5.1).
- At 5:00 remaining: `aria-live` announces "5 minutes remaining".
- At 1:00: announces "1 minute remaining".
- At 0:00: client calls `/submit` automatically; if offline, queues submit.

### Autosave contract
- **Every 30s** via `setInterval`.
- **On `blur`** of any response input.
- **On navigation** (Prev/Next/Jump).
- **Never blocks the UI.** Failures are silent; a "Last saved Xs ago" microcopy shows in header.
- Uses idempotency keys (`item_id + sequence_number` hash) to prevent duplicate saves on retry.

### Offline
- Service worker caches session shell + current item.
- Responses queued to IndexedDB with idempotency keys.
- `OfflineBanner` visible at bottom.
- Reconnect replays queue; on success, shows toast "Synced" (aria-live).
- **Do not block user from answering while offline.**

### States
- **Loading (mount):** skeleton of question + options layout.
- **Error — version conflict:** modal: "Your session was updated elsewhere. Refreshing…" → refetch `/sessions/{id}/state`, reconcile, continue.
- **Error — lock expired:** modal: "Your session lock expired. Click to reclaim and continue." → refetch state + new lock token.
- **Error — session abandoned (another device):** modal: "This session was ended on another device." → `/session-selection`.
- **Warning — unanswered on submit:** dialog: "You have {n} unanswered questions. Submit anyway?" primary + ghost.
- **Success — submit:** redirect to `/results/{id}`.

### API calls
- `GET /sessions/{id}/state` (mount + resume)
- `POST /sessions/{id}/respond` (each interaction; idempotency-keyed)
- `POST /sessions/{id}/checkpoint` (autosave variant that doesn't bump version)
- `POST /sessions/{id}/submit` (terminal, idempotency-keyed)
- `POST /sessions/{id}/abandon` (on exit confirm)

### a11y (non-negotiable — merge blocker if violated)
- Full keyboard navigation: Tab to every control, arrows in option group, Space/Enter to select.
- Visible focus ring on every focusable element.
- Timer `aria-live="polite"` with polite re-announcement at warn/danger transitions only.
- Question heading `<h1>` receives focus on transition.
- Question map operable via arrow keys.
- Every icon-only button has `aria-label`.
- axe-core zero serious/critical.

### Out of scope for v1
- Drag-and-drop question types
- Graphing / equation-input question types
- Hint system (mockup has "lightbulb" icon; not wired in v1)
- Calculator overlay
- Bookmark with notes feature
- Review mode before submit (simpler confirm-dialog instead)

---

## Screen 10 — Practice (`/session/[id]/practice`)

**Mockup:** `08-practice.html`
**Shell:** `focus` (but with less restriction than exam)
**Stage:** 22 (Day 24)
**Route guard:** authenticated student, session `in_progress`, mode `practice` or `diagnostic`.

### Purpose
Low-pressure session with immediate feedback. Same engine contracts as exam but UX differs.

### Difference from exam engine
- **No timer** (or optional soft timer, decorative).
- **Immediate feedback** after each submit: shows correct answer + explanation + misconception note if applicable.
- **Navigation** only forward (no back-nav by default, but `skill` mode allows it).
- **Option to quit** returns to home without confirmation (session is saved).

### Actions (deltas from exam)
| Element | Action |
|---|---|
| Submit response | `/respond` → feedback panel appears → "Next question" button |
| Why this answer? | Expands explanation panel (if misconception_id on distractor) |
| Skip | `/respond` with `response: null`, marked unanswered, next item |
| End session | `POST /sessions/{id}/submit` → `/results/{id}` |

### States
Same as exam engine, plus:
- **Feedback state (per item):** after submit, shows correct/incorrect icon + explanation card. Primary action "Next".

### a11y notes
- Feedback panel `aria-live="polite"` announces outcome.
- Explanation panel: focus moves to the explanation heading on open.

### Out of scope for v1
- Session-level pacing ("you're going fast — slow down")
- Adaptive hint tier before revealing answer

---

## Screen 11 — Results (`/results/[id]`)

**Mockup:** `09-results.html`
**Shell:** `student-parent`
**Stage:** 24 (Day 28)
**Route guard:** authenticated; session must be terminal (`submitted` / `abandoned`) and belong to student (or parent of student, or teacher of student's class).

### Purpose
Mode-aware summary of a completed session. Full contract in `UI_CONTRACT.md` §5.2.

### Variants
| Mode | Layout |
|---|---|
| `scored` (NAPLAN / ICAS / mock) | Hero ring with accuracy % + topic breakdown + insights + next action |
| `practice` | No ring; mastery-delta card; question summary |
| `diagnostic` | Proficiency map (bars + confidence bands); no ring, no score |
| `repair` | **Deferred v1.1** — stub page: "Repair results coming soon." |

### Content blocks (scored variant)
1. **Hero** — ring (120px) + "Well done, {first_name}!" (serif) + score band pill + session meta (date, duration, items).
2. **Stat row** — Correct / Incorrect / Unanswered / Accuracy / Time / Improvement (vs last similar session).
3. **Topic breakdown** — list of strand cards with SkillBar per topic.
4. **Performance Insights** — 1–3 cards (slowest topic, fastest topic, unusual patterns) composed from ExplanationDTO.
5. **Question Review** — tabs (All / Correct / Incorrect / Unanswered) with accordion items. Each shows item + chosen answer + correct answer + explanation if misconception.
6. **Next action** — primary CTA card: "Practice {weakest_skill}".

### Fields — not applicable (read-only view).

### Actions
| Button | Action |
|---|---|
| Practice {skill} | → `/session-selection?mode=practice&skill={id}` |
| Share with parent (if student signed in) | email/copy link intent — **deferred v1.1** |
| Back to home | → `/` |
| Print | `window.print()` — must render legibly |

### States
- **Loading:** skeleton of ring + cards.
- **Empty:** N/A (results page only renders for a real session).
- **Error — session not terminal:** redirect to `/session/{id}/exam` (or practice) to resume.
- **Error — permissions:** 403 page: "You don't have access to this result."
- **402:** N/A.

### API calls
- `GET /sessions/{id}` (summary)
- `GET /intelligence/learner-profile/{student_id}` (mastery deltas)
- `GET /content/items/{item_id}` (for each review item — batched where possible)

### a11y notes
- Hero ring has `role="img"` and `aria-label="{score}% accuracy — {band}"`.
- Question review accordion uses native `<details>` or ARIA `button + aria-expanded + aria-controls`.
- Tabs: `role="tablist"` / `role="tab"` / `role="tabpanel"`.

### Out of scope for v1
- Detailed per-item timing (shown aggregate only)
- Export to PDF (print-only in v1)
- Social share / parent share link

---

## Screen 12 — Learning Hub (`/learn`)

**Mockup:** `06-learning-hub.html`
**Shell:** `student-parent`
**Stage:** 22 (Day 24) — minimal; fuller version integrated via Stage 25.
**Route guard:** authenticated student.

### Purpose
Browse + start activities by skill and subject. Where the student explores content vs being directed by plan.

### v1 content
1. **Today's focus hero** — skill card with "Why this skill?" explanation.
2. **Activity grid** — 3 tiles: Diagnostic / Practice / Mock Exam. Each tile starts a session.
3. **Skill tree / subject browser** — list of skills from seeded graph, grouped by strand. Click → filters activity tiles.
4. **Recent activity** — last 5 sessions (shared with home).

### Actions
| Element | Action |
|---|---|
| Activity tile | `POST /sessions/create` with appropriate mode |
| Skill in browser | Filters + scrolls to activity grid |
| "Why this skill?" | Expands `ExplanationDTO` panel |

### States
Same pattern as home.

### API calls
- `GET /pathways` (entitlement-filtered)
- `GET /skill-graphs/active` (cached)
- `GET /intelligence/learner-profile/{student_id}` (to surface weakest skill as "today's focus")
- `POST /sessions/create` on tile click

### Out of scope for v1
- Curated collections / playlists
- Skill dependency visualization (graph view)
- Stretch-mode tile (L6 deferred)

---

## Screen 13 — Student Assignments (`/assignments`)

**Mockup:** `10-student-assignments.html`
**Shell:** `student-parent`
**Stage:** 40 (Day 49)
**Route guard:** authenticated student.

### Purpose
List assignments from teachers, with tabs by status.

### Tabs
| Tab | Source | Count pill |
|---|---|---|
| To do | `assignment_session.status IN ('assigned', 'in_progress')` where not overdue | unread-style count |
| Completed | `assignment_session.status = 'completed'` | count |
| Overdue | `assignment_session.status IN ('assigned', 'in_progress')` AND `due_at < now()` | red count pill |

### Item card
- Subject icon + title + teacher name + skill tag(s)
- Due date (relative: "Due in 3 days" / "Due today" / "Overdue by 2 days")
- Est. duration
- **Start / Continue** primary button

### Actions
| Button | Action |
|---|---|
| Start / Continue | `POST /assignments/{id}/start` (idempotency-keyed) → redirects to session |
| View history | → dropdown on completed card |

### States
- **Loading:** skeleton cards.
- **Empty:** per-tab: "No assignments to do" / "Nothing completed yet" / "No overdue — keep it up!"
- **Error:** card-level retry.
- **Content:** default.

### API calls
- `GET /assignments/for-student/{student_id}` — returns grouped by status
- `POST /assignments/{id}/start` with Idempotency-Key

### a11y notes
- Tabs standard `tablist`/`tab`/`tabpanel` pattern.
- Each card is a list item within an ordered list per tab.
- Overdue count pill: `aria-label="{n} overdue"`.

### Out of scope for v1
- Assignment submission from this page (opens session which handles it)
- Teacher comments visible to student (v1.1)
- Assignment-level chat / Q&A

---

## Screen 14 — Engagement (`/engagement`)

**Mockup:** `11-engagement.html`
**Shell:** `student-parent`
**Stage:** **Not a dedicated route in v1.** Widgets from this mockup appear inline in Student Home (Stage 40).
**Route guard:** n/a (widgets only).

### v1 scope: display-only inline widgets
- Weekly goal progress bar on student home
- Streak day count badge in nav bell area
- Achievements "peek" on results page

### Deferred to v1.1
- Full `/engagement` standalone route
- Interactive goal-setting
- Achievement gallery
- Daily quest / quiz
- Streak freeze / recovery

The UI primitives needed for v1 widgets (`Badge`, `ProgressBar`, `StatTile`) already exist in UI_CONTRACT §3.

---

# Parent Screens

## Screen 15 — Parent Dashboard (`/parent`)

**Mockup:** `03-parent-dashboard.html`
**Shell:** `student-parent` (with `ChildSwitcher` in nav)
**Stage:** 36 (Days 43–44)
**Route guard:** authenticated parent.

### Purpose
Parent's view of one child at a time. Shows readiness, recent activity, observations, recommended next actions.

### Content blocks
1. **Child switcher** — dropdown in top nav (if >1 child linked). Default: most recently viewed. Persisted via localStorage (`lastViewedChildId`).
2. **Greeting + readiness hero** — "How is {childFirstName} going?" + readiness ring (composite of mastery across strands) + score band.
3. **At a glance** — 3 stat tiles: Sessions this week, Avg score, Topics mastered.
4. **Subject areas** — list of strand cards, each with SkillBar for mastery + recent activity arrow.
5. **Recent sessions** — last 5 sessions (same shape as student home).
6. **What we have noticed** — 2–3 cards composed from `ExplanationDTO`. Observation → Interpretation → Suggestion structure.
7. **What would help next** — 1–3 cards with recommended sessions / actions; primary CTAs start sessions on behalf of child (opens session-selection with preset).

### Actions
| Element | Action |
|---|---|
| Child switcher | Change active child in URL (`?child={id}`) + refetch |
| Session in recent list | → `/results/{id}` |
| "What would help" CTA | → `/session-selection?child={id}&preset=...` (opens child's view) |
| Manage children | → `/parent/children` (account management; v1 minimal) |
| Billing | → `/billing` |

### States
- **Loading:** skeleton per block; child switcher retains value.
- **Empty (no children linked):** full-page card with CTA: "Add your first child" → modal to create child.
- **Empty (child has zero sessions):** "We'll show insights here once {childFirstName} starts a session." + CTA to start one.
- **Error:** per-widget retry.
- **Error — child not found / not linked:** redirect to `/parent` (default child).
- **402:** most widgets visible on free tier; some insights gated → show upgrade prompt inline.

### API calls
- `GET /users/me/children` (parent's linked children)
- `GET /intelligence/learner-profile/{child_id}`
- `GET /sessions/recent?student_id={child_id}&limit=5`
- `GET /analytics/pathway-readiness/{child_id}/{pathway_slug}` (hero ring)
- `GET /intelligence/causal-map/{child_id}` (for "noticed" cards)

### Child creation flow (sub-screen)
Modal dialog triggered from "Add child":
- Fields: `display_name` (2–80), `year_level` (select 3–10), `dob` (optional; YYYY-MM-DD)
- Validation per student role.
- `POST /users/me/children` → refetches children list + selects new child.
- A parent in a family tenant creates a student user under the same tenant; no separate login for the child unless parent generates login credentials (v1.1 feature).

### a11y notes
- Child switcher: `combobox` or `listbox` pattern.
- Readiness ring: `role="img"` with descriptive `aria-label`.
- "Noticed" cards use headings (H3) so screen readers can navigate.

### Out of scope for v1
- Side-by-side comparison of multiple children
- Weekly email digest (v1.1)
- In-page goal-setting
- Tutor / shared-parent permissions

---

## Screen 16 — Parent: Child Management (`/parent/children`)

**Mockup:** not mocked; simple derived screen.
**Shell:** `student-parent`
**Stage:** 36 (Day 43–44, paired with parent dashboard)
**Route guard:** authenticated parent.

### Purpose
Manage linked children: add, rename, archive. v1 minimal.

### v1 content
- List of children (display_name, year_level, sessions count)
- "Add child" button → modal (same as §15)
- Per-child actions: Rename (inline), Archive (confirmation)

### Actions
| Button | Action |
|---|---|
| Add child | Opens create modal |
| Rename | Inline edit + `PATCH /users/{id}` |
| Archive | Confirmation dialog → `PATCH /users/{id}` with `archived: true`; child's sessions remain but child is hidden from dashboard |

### States
- **Loading / Empty / Error / Content** — standard.

### API calls
- `GET /users/me/children`
- `POST /users/me/children`
- `PATCH /users/{id}`

### Out of scope for v1
- Undo archive
- Permanent delete (v1.1, part of Data Subject Rights)
- Parent-student link transfer between parents

---

## Screen 17 — Billing (`/billing`)

**Mockup:** `04-billing.html`
**Shell:** `student-parent`
**Stage:** 45 (Days 55–56)
**Route guard:** authenticated parent (or org_admin for school tenants).

### Purpose
Tier selection, subscription management, invoice history.

### Tabs
1. **Plans** — 3 tier cards (Free / Standard / Premium) side-by-side + monthly/yearly toggle + FAQ.
2. **Compare** — feature comparison table (rows = features, columns = tiers).
3. **Billing** — current subscription, payment method (Stripe Elements), invoice history table.

### Plans tab content
Per-tier card:
- Tier name
- Price (AUD, incl. GST)
- 3–5 feature bullets
- CTA:
  - Current tier → "Current plan" (disabled pill-button)
  - Upgrade → "Upgrade to {tier}" (primary)
  - Downgrade → "Switch to {tier}" (secondary; confirmation required)
- "Popular" badge on Standard.

### Billing tab content
- **Current subscription card:**
  - Plan name, status (active / past_due / canceled / trialing)
  - Next billing date + amount
  - Cancel-at-period-end state (if set): "Your plan ends {date}. [Keep subscription]"
- **Payment method card:** last-4 + expiry; "Update" → Stripe Customer Portal redirect
- **Invoice history table:** date, amount, status (paid / open / past_due), PDF link from Stripe

### Actions
| Button | Action |
|---|---|
| Upgrade/Switch to {tier} | `POST /billing/checkout` with `tier + billing_period` + idempotency-key → redirect to Stripe Checkout (same tab) |
| Monthly / Yearly toggle | Client-side re-render of prices |
| Cancel | Confirmation dialog → `POST /billing/subscription/cancel` (cancel at period end). Shows "keep access until {period_end}". |
| Keep subscription (undo cancel) | `POST /billing/subscription/cancel?undo=true` |
| Manage payment method | `POST /billing/portal` → Stripe Customer Portal redirect |
| Invoice PDF | Stripe-hosted URL, opens in new tab |

### Checkout return handling
Stripe Checkout redirects to `/billing?status=success&session_id=...` or `/billing?status=cancelled`.
- `success`: toast "Welcome to {tier}!" + refresh subscription state; feature flags propagate async (may take up to 30s).
- `cancelled`: no-op toast "Checkout cancelled."

### States
- **Loading:** skeleton for each tab's content.
- **Empty:** N/A (user always has at least a free tier row after signup).
- **Error — checkout failed:** banner "Something went wrong starting checkout. Try again or contact support."
- **Error — past_due:** prominent banner at page top with "Update payment method" CTA → portal.
- **Success (toasts):** see above.
- **402:** N/A (billing page itself is not tier-gated).

### API calls
- `GET /billing/plans` (public catalog; includes Stripe price IDs server-side-resolved)
- `GET /billing/subscription` (current)
- `GET /billing/invoices`
- `POST /billing/checkout` (idempotency-keyed)
- `POST /billing/portal`
- `POST /billing/subscription/cancel` (idempotency-keyed)

### a11y notes
- Tabs: standard tablist pattern.
- Plan cards: each is a focusable region with heading; CTAs are properly labelled.
- Invoice table: real `<table>` with `<thead>` + `<tbody>`; status cell uses both color and text.
- Cancellation dialog: focus trapped; primary action labelled clearly.

### Out of scope for v1
- Dunning reminders UI (Stripe-automated retries only in v1; custom flow v1.1)
- Refund request UI (v1.1 — platform_admin via Stripe directly in v1)
- Add/remove payment methods inline (portal handles it)
- Promo codes / discount entry
- Invoice address update UI (portal handles it)
- GST invoice compliance polish (Stripe Tax handles; CSS-level polish v1.1)

---

# Teacher & Admin Screens

## Screen 18 — Teacher Dashboard (`/teacher`)

**Mockup:** `12-teacher-dashboard.html`
**Shell:** `teacher` (sidebar + top bar)
**Stage:** 37 (Days 45–46)
**Route guard:** authenticated teacher or org_admin.

### Purpose
Class-level home. Shows intervention alerts, KPIs, student performance, assignments at a glance.

### Content blocks
1. **Top bar:** search (students by name), class switcher (if teacher has >1 class).
2. **Class overview strip:** 4 stat tiles: Active students / Avg class score / Sessions this week / Assignments active.
3. **Intervention alerts banner** — 0–N alerts from `/analytics/intervention-alerts`. Each: student + trigger reason + "Review" / "Assign Work" actions.
4. **Student performance table** — rows: student / mastery avg / recent score / trend sparkline / last session / actions.
5. **Topic mastery bars** — class-wide per strand.
6. **Assignments widget** — active assignments list with completion %; link to assignment engine.

### Sidebar navigation
| Item | Route |
|---|---|
| Overview | `/teacher` |
| Students | `/teacher/students` (Stage 38) |
| Assignments | `/teacher/assignments` (Stage 39) |
| Analytics | `/teacher/analytics` (§21) |
| Settings | `/teacher/settings` — **deferred v1.1** |

### Actions
| Element | Action |
|---|---|
| Class switcher | Changes URL `?class={id}`, refetches |
| Alert "Review" | → `/teacher/students/{student_id}` |
| Alert "Assign Work" | → `/teacher/assignments/new?target_student={id}&skill={skill_id}` |
| Alert "Dismiss" | `PATCH /analytics/intervention-alerts/{id}` `{ dismissed: true }` |
| Alert "Acknowledge" | `PATCH /analytics/intervention-alerts/{id}` `{ acknowledged: true }` |
| Student row | → `/teacher/students/{id}` |
| Start assignment | → assignment engine with pre-fill |

### States
- **Loading:** skeleton per widget.
- **Empty (no class members):** "Ask your admin to add students to your class."
- **Empty (no alerts):** alerts banner collapses; text "No interventions needed this week."
- **Error:** per-widget.
- **Content:** default.

### API calls
- `GET /users/me/classes`
- `GET /analytics/cohort/{class_id}` (KPIs)
- `GET /analytics/intervention-alerts?class_id={id}`
- `GET /analytics/auto-groups/{class_id}` (group clustering; v1 basic)
- `GET /assignments/for-class/{class_id}`

### a11y notes
- Alerts banner: each alert is a list item; actions clearly labelled.
- Student performance table: real `<table>`; sortable columns are `<button>` inside `<th>` with `aria-sort`.

### Out of scope for v1
- Co-teacher collaboration
- Custom dashboard widgets / reorder
- Class-level announcements / broadcast messages
- Calendar integration

---

## Screen 19 — Teacher: Students List (`/teacher/students`)

**Mockup:** derived from `12-teacher-dashboard.html`'s student table
**Shell:** `teacher`
**Stage:** 37 (companion to dashboard)
**Route guard:** authenticated teacher.

### Purpose
Searchable, filterable list of all students in teacher's classes.

### Content
- Top bar: search (by name), filter chips (class, year, performance band)
- Virtualised table for >50 students: name, class, year, avg score, last session, mastery summary, actions

### Actions
| Element | Action |
|---|---|
| Student row | → `/teacher/students/{id}` |
| Bulk assign (checkboxes, v1 minimal: up to 25) | → `/teacher/assignments/new?targets=[ids]` |

### States
- **Loading:** skeleton rows.
- **Empty:** "No students match your filters."
- **Error:** banner + retry.
- **Content:** default.

### API calls
- `GET /users/classes/{class_id}/students` (paginated, v1: page_size 50 default)

### Out of scope for v1
- CSV export of student list (v1.1)
- Adding students directly (admin does it)

---

## Screen 20 — Teacher: Student Detail (`/teacher/students/[id]`)

**Mockup:** `13-teacher-student-detail.html`
**Shell:** `teacher`
**Stage:** 38 (Day 47)
**Route guard:** authenticated teacher; student must be in one of teacher's classes.

### Purpose
Full profile of one student from teacher's perspective.

### Content blocks
1. **Header** — student name + avatar + meta (class, year level, last active).
2. **Pathway tabs** — NAPLAN / ICAS / Selective (entitled ones only; Selective deferred → stub tab).
3. **Performance by strand** — SkillBar list.
4. **Score trend** — small chart (last 8 sessions); deferred to static placeholder if chart library complexity delays.
5. **Assignment history** — completed assignments with scores.
6. **Recent activity** — last 10 sessions.
7. **Teacher notes** — simple editable notes per teacher-student pair (unique to the teacher viewing).
8. **Action buttons:** Assign Work / Flag for Review.

### Actions
| Button | Action |
|---|---|
| Assign Work | → `/teacher/assignments/new?target_student={id}` |
| Flag for Review | Confirmation → `POST /analytics/intervention-alerts` with manual reason |
| Add note | Inline textarea → `POST /notes` — **deferred in v1 to avoid new table; v1 notes stored in localStorage per teacher (client-only)** |
| Pathway tab | Filter content |

### Teacher notes (v1 decision)
- **v1:** notes are client-local only (persisted in localStorage keyed by `{teacher_id}:{student_id}`). No backend table. Non-sensitive UX aid.
- **v1.1:** server-backed `teacher_note` table with RLS.

### States
- **Loading:** skeleton per block.
- **Empty:** default (per block): "No sessions yet" / "No assignments yet".
- **Error — student not found / not in class:** 403 redirect to `/teacher/students`.
- **Content:** default.

### API calls
- `GET /users/{student_id}` (basic profile)
- `GET /intelligence/learner-profile/{student_id}`
- `GET /sessions/recent?student_id={id}&limit=10`
- `GET /assignments/for-student/{student_id}`

### Out of scope for v1
- Download full report (v1.1 analytics export)
- Chat with parent from this page
- Scheduling 1:1 session
- Intervention plan builder (freeform goals)

---

## Screen 21 — Teacher: Analytics (`/teacher/analytics`)

**Mockup:** `14-analytics.html`
**Shell:** `teacher`
**Stage:** Not a dedicated stage — lightweight reports page combining existing endpoints. **v1 scope cut to a minimal version inside Stage 37** to avoid new work. Full analytics page deferred to v1.1.

### v1 minimal scope
- Tabs: Student Reports / Class Overview / Topic Analysis
- Each tab renders existing data (no new charts). Re-uses dashboard's data.
- **Export Data** button → disabled with tooltip "Coming in v1.1"

### Deferred to v1.1
- Time Analysis tab (requires new time-window aggregations)
- Interactive charts (client library choice: Recharts default)
- CSV / PDF report export
- Scheduled email reports
- Custom date range picker

### API calls
Same endpoints as dashboard — no new ones required for v1 minimal.

---

## Screen 22 — Teacher: Assignment Engine (`/teacher/assignments`)

**Mockup:** `15-assignment-engine.html`
**Shell:** `teacher`
**Stage:** 39 (Day 48)
**Route guard:** authenticated teacher.

### Purpose
Create, publish, track assignments.

### Sub-routes
- `/teacher/assignments` — list view (default)
- `/teacher/assignments/new` — creation wizard
- `/teacher/assignments/[id]` — tracking view

### List view content
- Tabs: Active / Upcoming / Completed (with count pills)
- Per assignment card: title, target (student count or class name), due date, completion %, status pill
- "Create assignment" primary button

### Creation wizard (4 steps)
1. **Target** — select single student, multiple students, or a class. Search + checkboxes.
2. **Content** — select: skill-based (practice on skill) / blueprint-based (mini exam) / specific items (admin v1.1, not in v1 teacher UI)
   - For skill-based: pick 1–3 skills from graph, target item count, difficulty
   - For blueprint-based: select pathway + blueprint
3. **Schedule** — due date (required), instructions (optional, textarea ≤500 chars)
4. **Review & Publish** — summary + Publish button

### Fields (creation)
| name | type | required | validation | error copy |
|---|---|---|---|---|
| `title` | text | ✅ | 3–100 chars, auto-suggested | "Give your assignment a title." |
| `targets` | array | ✅ | ≥1 target | "Choose at least one student or class." |
| `content_type` | enum | ✅ | `skill_based \| blueprint_based` | n/a |
| `skills` | array uuid | required if skill_based | 1–3 skills | "Pick 1–3 skills." |
| `item_count` | int | required if skill_based | 5–50 | "Choose between 5 and 50 items." |
| `blueprint_id` | uuid | required if blueprint_based | n/a | n/a |
| `due_at` | datetime | ✅ | ≥ now + 1h, ≤ now + 90 days | "Due date must be at least 1 hour from now." |
| `instructions` | text | optional | ≤500 chars | "Instructions can be up to 500 characters." |

### Actions (tracking view)
| Button | Action |
|---|---|
| Publish | `POST /assignments/{id}/publish` (idempotency-keyed) — materialises assignment_session rows |
| Archive | `POST /assignments/{id}/archive` with confirmation |
| View student | → `/teacher/students/{student_id}` |
| Send reminder | **Deferred v1.1** (requires email transport) |

### States
- **Loading:** skeleton for list; per-step skeleton for wizard.
- **Empty:** "No assignments yet. Create your first one."
- **Error (publish failed):** stays on review step with banner "Couldn't publish. Try again."
- **Success:** redirects to tracking view with toast "Assignment published to {n} students."
- **Error — target not in teacher's class:** validation catches pre-submit.
- **402:** N/A (assignments is not tier-gated for teacher tier).

### API calls
- `GET /assignments/for-class/{class_id}` or `GET /assignments/mine`
- `POST /assignments` (draft; idempotency-keyed)
- `PATCH /assignments/{id}` (edit pre-publish)
- `POST /assignments/{id}/publish`
- `POST /assignments/{id}/archive`
- `GET /assignments/{id}/tracking`
- `POST /analytics/generate-assignment` (auto-generate shortcut)

### a11y notes
- Wizard: `role="progressbar"` for step indicator; each step has H1.
- Tracking view: table per student with status/score columns.
- Publish is destructive-ish (materialises data) — confirmation dialog with primary button explicit: "Publish to {n} students".

### Out of scope for v1
- Duplicate existing assignment
- Template library
- Bulk import from CSV
- Parent visibility toggle (always visible to parent in v1)
- Peer-review assignments

---

## Screen 23 — Admin: Intelligence (`/admin/intelligence`)

**Mockup:** `16-admin-intelligence.html`
**Shell:** `admin` (dark sidebar)
**Stage:** Not a dedicated v1 stage. **v1 scope cut to read-only "content monitoring" view** attached to platform_admin-only route via Stage 28 jobs admin endpoints.
**Route guard:** authenticated `platform_admin` only.

### v1 scope
- Dark sidebar navigation: Jobs (primary, from Stage 28), Content Intelligence (read-only stub), Users (future)
- **Content Intelligence tab:** renders a placeholder card: "Content intelligence monitoring is coming in v1.1. For content validation, run `scripts/validate-content.ts` locally."
- **Jobs tab:** full read-only table of `job_queue` with filter by status, retry button for dead-letter (Stage 28 functionality).

### Deferred to v1.1/v1.2
- Question performance heatmap
- Topic coverage charts
- Insights from L8 content intelligence loop (L8 deferred)
- Content quality flagging UI

### API calls (v1 minimal)
- `GET /admin/jobs?status=&job_type=`
- `POST /admin/jobs/{id}/retry`
- `GET /admin/jobs/dead-letter`

### a11y notes
- Admin dark palette has its own contrast rules (UI_CONTRACT §2.1 `[data-surface="admin-dark"]`); verify axe passes on sidebar nav.

### Out of scope for v1
- Everything beyond Jobs read + retry.

---

# Shared Flows (UI elements that cross screens)

## Flow A — Session resume

Triggered from: Student Home, Student Assignments, direct URL.

**Rule:** A student can have only one active (`in_progress`) session at a time. If they navigate to start a new session:
- Server returns `409 SESSION_ALREADY_ACTIVE` with the active session ID.
- Client shows modal: "You already have an active session. Resume or abandon it to start a new one."
- Actions: **Resume** → `/session/{active_id}/{exam|practice}`; **Abandon** → `POST /sessions/{active_id}/abandon` + then retry create.

## Flow B — Version conflict during session

Triggered from: `/sessions/{id}/respond` returning `409 VERSION_CONFLICT`.

- Client shows modal: "Your session was updated elsewhere. Refreshing…"
- Client calls `GET /sessions/{id}/state`.
- On success: updates local state, retries failed action with new version.
- Max retries: 3. On final failure: modal: "Session state out of sync. Refresh page to continue." (user-initiated reload)

## Flow C — Lock token expiry

Triggered from: `/sessions/{id}/respond` returning `403 LOCK_EXPIRED`.

- Client shows modal: "Your session lock expired. Click to reclaim and continue."
- Actions: **Reclaim** → `POST /sessions/{id}/respond` with `action: 'reclaim_lock'` (gets new lock token + latest state) → continue.

## Flow D — 402 tier-gated upgrade prompt

Triggered from: any endpoint returning `402 TIER_GATED`.

- Client shows toast: "This is a {tier_name} feature. [Upgrade →]"
- Clicking the toast → `/billing?intent=upgrade&feature={feature_key}`
- Toast uses `Banner variant="warn"` pattern. Persists 8 seconds.

## Flow E — Offline session response

Triggered inside Exam/Practice engine when network fails during `/respond`.

- Response queued to IndexedDB with idempotency key = hash of `{session_id, item_id, sequence_number, timestamp}`.
- `OfflineBanner` fades in at bottom.
- Student continues to next question (optimistic).
- On reconnect: queue drains FIFO; duplicates rejected server-side by idempotency key.
- On drain success: toast "Synced".
- On drain failure (non-retryable, e.g. 422): toast "Couldn't sync {n} answer(s). [Retry]" with reload fallback.

## Flow F — Checkout success propagation

Triggered from: Stripe Checkout redirect with `status=success`.

- Toast "Welcome to {tier}! Your access is updating…" (aria-live).
- Client polls `GET /users/me` every 3s for up to 30s (checking `entitlements` tier match).
- On match: second toast "You're all set." Page re-renders with new entitlements.
- On timeout: banner "Payment received. Features may take a few minutes to activate — refresh the page shortly."

## Flow G — Notification bell dropdown

Triggered from: bell icon in nav.

- Dropdown shows up to 10 most recent notifications.
- Item: icon + title + relative time + unread dot.
- Click item: marks read + navigates based on notification type:
  - `assignment_assigned` → `/assignments`
  - `plan_updated` → `/` (student home)
  - `intervention_alert` (teacher) → `/teacher/students/{student_id}`
  - `subscription_active` → `/billing`
  - `subscription_payment_failed` → `/billing?status=past_due`
  - `access_downgraded` → `/billing`
- "Mark all read" button.

API: `GET /notifications/me?unread=`, `PATCH /notifications/{id}/read`, `POST /notifications/read-all`.

---

# Screen-to-Stage Cross-Reference

| Screen | Stage(s) | Owner service(s) |
|---|---|---|
| 1. Landing | static (Stage 14) | none |
| 2. Signup | 14 | auth-svc, users-svc |
| 3. Login | 14 | auth-svc |
| 4. Forgot password | 14 | auth-svc |
| 5. Reset password | 14 | auth-svc |
| 6. Email verify | 14 | auth-svc |
| 7. Student Home | 25 (min) / 40 (full) | intelligence-svc, orchestration-svc, assessment-svc |
| 8. Session Selection | 22 | content-svc, assessment-svc |
| 9. Exam Engine | **23** | assessment-svc |
| 10. Practice | 22 | assessment-svc |
| 11. Results | 24 | assessment-svc, intelligence-svc |
| 12. Learning Hub | 22 (min) | content-svc, intelligence-svc |
| 13. Student Assignments | 40 | assignments-svc |
| 14. Engagement (inline widgets) | 40 | (display-only) |
| 15. Parent Dashboard | 36 | intelligence-svc, analytics-svc, orchestration-svc |
| 16. Parent Children | 36 | users-svc |
| 17. Billing | 45 | billing-svc |
| 18. Teacher Dashboard | 37 | analytics-svc, assignments-svc |
| 19. Teacher Students List | 37 | users-svc |
| 20. Teacher Student Detail | 38 | users-svc, intelligence-svc, assessment-svc |
| 21. Teacher Analytics | 37 (min) | analytics-svc |
| 22. Teacher Assignment Engine | 39 | assignments-svc, analytics-svc |
| 23. Admin Intelligence | 28 (jobs read) | jobs-worker |

---

# Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-21 | Initial SCREEN_SPECS v1.0 | Close the per-screen behavioral gap between UI_CONTRACT (visual) and the spec (conceptual) |

---

*End of Screen Specs v1.0.*
