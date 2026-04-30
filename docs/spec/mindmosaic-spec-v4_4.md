# MindMosaic — Master Product Specification v4.4

**Document Status:** Production-Ready
**Last Updated:** April 2026
**Supersedes:** v4.3
**Classification:** Internal — Engineering, Product, QA, AI Systems

### v4.4 Change Log (from v4.3)

| # | Section | Change |
|---|---|---|
| 1 | §3.4 | Checkpoint writes explicitly excluded from state machine / version bumps |
| 2 | §3.5.1 | Defined `duration_ms` vs `active_duration_ms` computation formula |
| 3 | §3.7.2 | Checkpoint dedup key corrected to `(session_id, item_id, sequence_number)` |
| 4 | §3.2.5 | RepairEngine consults both profile and in-session cognitive load |
| 5 | §5.1 | Draft-then-publish skill graph flow; no in-place edits on published graphs |
| 6 | §5.2 | Clarified `stem`/`response_config` live on `item_version`, read via current-version view |
| 7 | §7.2 | Split L3 Causal into L3a sync-scoped and L3b async-full |
| 8 | §7.4.2 | `algorithm_version` stamped in audit log for replay safety |
| 9 | §11.4 | Added repair concurrency invariants (per-misconception/per-skill uniqueness; advisory lock) |
| 10 | §16.6 | Defined `plan_override` types, 14-day default expiry, orchestrator consumption |
| 11 | §19 | Added `SessionSummaryDTO` and `stale_since` treatment rules for all widgets |
| 12 | §20.3.1 | Replaced all-zeros UUID pattern with semantic resolution rule |
| 13 | §22 | Added trace ID propagation, audit log cold storage, table-based rate limit, tenant isolation CI gate |
| 14 | §22.2 | Added admin action logging, Stripe signature verification, PII-free logs |
| 15 | §22.3 | Defined data subject rights flows (export + delete with grace period) |
| 16 | §22.9.2 | Skill graph migration covers misconception, repair, plan references |
| 17 | §24 (new) | Assignments domain — full product definition |
| 18 | §25 (new) | Billing & Subscription Lifecycle |
| 19 | §26 (new) | Engagement (streaks, achievements, nudges) |
| 20 | §27 (new) | Notifications |
| 21 | Appendix B | Added 15 new entities |
| 22 | Appendix C | Split L3 row into L3a / L3b |

---

## Document Map

| Part | Sections   | Focus                                                                                                                                                                                                         |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I    | §1–§6      | Platform foundations: vision, architecture, engines (incl. session lifecycle, autosave, DTOs), frameworks, content (incl. formal skill graph), data                                                           |
| II   | §7–§16     | Intelligence stack: event pipeline, job system, dependency matrix, feedback loop, explainability, real-time adaptation, learner model, behaviour, causal reasoning, concept repair, prediction, orchestration |
| III  | §17–§23    | Operations: cross-pathway intelligence, modes, reporting, SaaS, APIs (incl. intelligence DTOs), NFRs (incl. failure model, versioning), roadmap                                                               |
| IV   | Appendices | Glossary, entity index (34 entities), intelligence layer summary                                                                                                                                              |

---

# PART I — PLATFORM FOUNDATIONS

---

## 1. Product Vision

MindMosaic is a **Learning Intelligence Operating System** for K–12 students (Years 1–12) in Australia and the Asia-Pacific region. It moves beyond exam preparation into a complete learning platform that assesses, diagnoses, repairs, predicts, and orchestrates a student's entire learning journey across multiple examination frameworks.

Where competitors offer practice questions with score tracking, MindMosaic delivers a nine-layer intelligence stack (§7) that understands _why_ a student struggles, _what_ to do about it, and _when_ they will be ready — across every exam type they prepare for simultaneously.

### 1.1 Competitive Positioning

| Capability                                   | SubjectCoach | Cuemath | Khan Academy | IXL     | AoPS | MindMosaic |
| -------------------------------------------- | ------------ | ------- | ------------ | ------- | ---- | ---------- |
| Multi-exam framework support                 | Partial      | No      | No           | No      | No   | Yes        |
| Adaptive engine (real testlet routing)       | No           | No      | Partial      | Partial | No   | Yes        |
| Cross-pathway root cause analysis            | No           | No      | No           | No      | No   | Yes        |
| Misconception classification                 | No           | Partial | No           | No      | No   | Yes        |
| Concept repair with scaffolding              | No           | Yes     | Partial      | No      | No   | Yes        |
| Behavioural intelligence (guessing, fatigue) | No           | No      | No           | No      | No   | Yes        |
| Predictive exam readiness                    | No           | No      | No           | No      | No   | Yes        |
| Teacher intervention intelligence            | No           | No      | Partial      | Partial | No   | Yes        |
| Content self-calibration loop                | No           | No      | No           | Partial | No   | Yes        |
| Long-term learning path orchestration        | No           | Partial | Partial      | No      | No   | Yes        |

### 1.2 Target Pathways

| Pathway         | Region                     | Assessment Style                 | Status  |
| --------------- | -------------------------- | -------------------------------- | ------- |
| NAPLAN          | Australia                  | Adaptive (testlet-based routing) | Phase 1 |
| ICAS            | International (AU-primary) | Linear, fixed-sequence           | Phase 1 |
| Selective Entry | Australia (state-specific) | Reasoning-heavy, timed           | Phase 2 |
| Singapore Math  | Singapore / APAC           | Conceptual mastery, model method | Phase 2 |
| Olympiad / AMC  | International              | Advanced problem solving         | Phase 3 |

### 1.3 Guiding Principles

1. **Configuration over code** — New exam types are added via configuration, not refactoring.
2. **Engine–Framework separation** — Assessment engines are generic; framework rules are injected.
3. **Skill-graph-first** — All content, analytics, and recommendations anchor to a unified skill taxonomy.
4. **Evidence-based intelligence** — Every recommendation is traceable to observed performance data. No hallucination.
5. **Privacy by design** — Row-level security, role-based access, and data minimisation from day one.
6. **Understand before prescribing** — The system diagnoses root causes and misconceptions before recommending practice. Drilling the wrong thing harder is not learning.
7. **Intelligence is layered** — Each intelligence layer has clear inputs, outputs, and dependencies. Layers can be improved independently without cascading changes.

---

## 2. Multi-Pathway Architecture

### 2.1 Core Model

```
Pathway → Framework → Engine → Content → Skill Graph → Intelligence Stack → Learner Model
```

**Pathway** represents a high-level learning goal (e.g., "NAPLAN Year 5 Preparation"). Each pathway is bound to exactly one **Framework**, which encodes the rules, constraints, and structure of a specific exam family. The framework selects and configures a generic **Engine** that drives session flow. The engine draws from the **Content** pool (questions, stimuli) tagged against a unified **Skill Graph**. Performance data flows through the **Intelligence Stack** (§7) — a nine-layer processing pipeline — into the **Learner Model**, which feeds back into engine decisions, concept repair, and learning path orchestration.

### 2.2 Pathway Definition Schema

```
pathway {
  id: uuid
  slug: string                    -- e.g. "naplan-y5-numeracy"
  display_name: string
  exam_family: enum               -- naplan | icas | selective | singapore_math | olympiad
  program: string                 -- e.g. "Year 5 Numeracy"
  country: string                 -- ISO 3166 alpha-2
  curriculum: string              -- e.g. "australian_curriculum_v9"
  framework_config_id: fk         -- points to framework_config
  engine_type: enum               -- adaptive | linear | skill | diagnostic | repair
  year_levels: int[]              -- applicable year levels
  is_active: boolean
  created_at: timestamptz
}
```

### 2.3 Framework Abstraction

A framework configuration encapsulates all exam-specific rules without touching engine code.

```
framework_config {
  id: uuid
  exam_family: enum
  version: string                 -- allows versioned rule sets
  structure: jsonb                -- sections, time limits, question counts
  adaptive_rules: jsonb | null    -- routing tables, testlet config (adaptive only)
  scoring_rules: jsonb            -- raw/scaled score mapping, marking rubrics
  constraints: jsonb              -- calculator policy, tool availability, navigation rules
  difficulty_bands: jsonb         -- framework-specific difficulty mapping
  blueprint: jsonb                -- content distribution requirements
}
```

### 2.4 Cross-Pathway Relationships

Skills are shared across pathways via the unified skill graph (§5). A student preparing for both NAPLAN and Selective Entry will have performance data from both pathways contributing to the same underlying skill nodes. This enables:

- **Root-cause convergence** — If "fraction equivalence" is weak, it appears in both NAPLAN Numeracy and Selective Quantitative Reasoning reports (§10.1).
- **Pathway readiness scoring** — The system estimates readiness for a pathway the student hasn't yet attempted, based on overlapping skill coverage (§10.3).
- **Transfer detection** — Improvement in one pathway's skills automatically updates predicted performance in related pathways (§10.2).
- **Misconception propagation** — A misconception identified in ICAS is immediately flagged in all pathways that share the affected skill (§8.3).

---

## 3. Engine Architecture

All engines implement a common interface and are selected by `pathway.engine_type`. New engines are added by implementing this interface and registering a new `engine_type` value.

### 3.1 Engine Interface

```typescript
interface AssessmentEngine {
  initialise(session: Session, config: FrameworkConfig): EngineState;
  getNextItem(state: EngineState): Item | TerminationSignal;
  recordResponse(state: EngineState, response: Response): EngineState;
  score(state: EngineState): ScoreResult;
  canNavigateBack(state: EngineState): boolean;
  getTimeRemaining(state: EngineState): number | null;
  terminate(state: EngineState, reason: TerminationReason): FinalResult;
}
```

### 3.2 Engine Definitions

#### 3.2.1 AdaptiveEngine

**Used by:** NAPLAN

Implements testlet-based adaptive routing. The session is divided into stages; after each stage, the engine selects the next testlet based on cumulative performance against routing tables defined in `framework_config.adaptive_rules`.

Key behaviours:

- Items within a testlet are presented in fixed order.
- Back-navigation is permitted within the current testlet only.
- Routing decisions are server-authoritative and irreversible.
- A server-authoritative timer governs each stage; auto-submission occurs on expiry.
- The engine supports a writing stage with extended-response capture (text input, no auto-marking in MVP).

Routing logic (pseudocode):

```
after_stage(stage_n):
  score = count_correct(stage_n.responses)
  route = lookup(config.adaptive_rules.routing_table, stage_n.id, score)
  next_testlet = route.target_testlet_id
  update_state(next_testlet)
```

#### 3.2.2 LinearEngine

**Used by:** ICAS, Selective Entry

Presents a fixed sequence of items as defined by the assessment blueprint. All items are delivered in a single pass.

Key behaviours:

- Full back-navigation permitted (configurable per framework).
- Items may be flagged for review.
- Difficulty progression is encoded in content ordering, not engine logic.
- Timer is session-level (single countdown for the entire assessment).
- Scoring is straightforward: correct responses sum to a raw score, which maps to a scaled score via `scoring_rules`.

#### 3.2.3 SkillEngine

**Used by:** Skill Practice mode

Delivers an unbounded stream of items targeting specific skills. There is no fixed length; the student practises until they choose to stop or a mastery threshold is reached.

Key behaviours:

- Item selection is driven by the learner model — prioritises skills below mastery threshold.
- Difficulty adapts per-item based on recent performance within the session (simple up/down rule).
- Immediate feedback after each item (configurable: show correct answer, show explanation).
- No timer by default (configurable per-skill or per-session).
- Session produces skill mastery delta, not a score.

#### 3.2.4 DiagnosticEngine

**Used by:** Diagnostic mode, onboarding assessments

Administers a short, targeted item set designed to estimate proficiency across a skill subtree with minimal questions.

Key behaviours:

- Uses a pre-configured item selection strategy: starts at grade-level midpoint, branches based on correctness (binary search pattern over difficulty).
- Terminates after a configurable max items (default: 15–20 per domain) or when confidence threshold is met.
- Output is a skill-level proficiency estimate with confidence intervals, not a score.
- Results feed directly into the learner model to bootstrap personalisation.

#### 3.2.5 RepairEngine

**Used by:** Concept Repair mode (§9)

A specialised engine that delivers scaffolded learning sequences targeting identified misconceptions. Unlike other engines, it interleaves instruction with assessment.

Key behaviours:

- Driven by misconception records from the Causal Intelligence layer (§10).
- Presents a scaffolded sequence: prerequisite review → visual/conceptual explanation → guided practice → independent practice → mastery check.
- Difficulty starts below the student's current level (building confidence) and ramps to target.
- **Pacing is adaptive in two dimensions:** the engine consults both `behaviour_profile.avg_cognitive_load_comfort` (profile baseline, §9.6) AND the in-session rolling cognitive load computed from the last 5 responses (§9.5). When in-session load exceeds 0.7, the engine slows progression by inserting an additional hint stage or lowering difficulty by one band, regardless of the profile baseline.
- Immediate feedback with worked-solution explanations.
- Terminates when the misconception-specific mastery check is passed or maximum attempts are exhausted.
- On success, clears the misconception flag and triggers a mastery re-evaluation.

### 3.3 Engine Extensibility

To add a new engine (e.g., `ChallengeEngine` for timed competitions):

1. Implement the `AssessmentEngine` interface.
2. Register the new `engine_type` enum value.
3. Define the `framework_config` for any exam families using this engine.
4. No changes to session management, scoring pipeline, or analytics are required — they consume the engine's standardised output.

### 3.4 Session Lifecycle

Every session follows a strict state machine. State transitions are enforced server-side; the client cannot skip or reorder states.

```
                  ┌─────────┐
                  │ created  │
                  └────┬─────┘
                       │ first getNextItem()
                       ▼
                  ┌─────────┐  network loss / timeout
                  │  active  │──────────────────────┐
                  └────┬─────┘                      │
                       │ submit or timer expiry      ▼
                       │                       ┌────────────┐
                       │                       │ interrupted │
                       │                       └─────┬──────┘
                       │      resume (GET /state)    │
                       │◀────────────────────────────┘
                       ▼
                  ┌───────────┐
                  │ submitted  │
                  └─────┬─────┘
                        │ scoring + pipeline trigger
                        ▼
                  ┌───────────┐
                  │ processed  │  (terminal)
                  └───────────┘

                  ┌───────────┐
                  │ abandoned  │  (terminal — no activity for 24h while interrupted)
                  └───────────┘
```

**Valid transitions:**

| From          | To            | Trigger                                                  | Side Effects                                              |
| ------------- | ------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| `created`     | `active`      | First `getNextItem` call                                 | Timer starts (if timed)                                   |
| `active`      | `interrupted` | No client heartbeat for 60s, or explicit disconnect      | Timer paused (practice/repair); timer continues (exam)    |
| `interrupted` | `active`      | `GET /sessions/{id}/state` with valid auth               | Timer resumes; engine state restored                      |
| `interrupted` | `abandoned`   | 24h with no resume                                       | Partial responses saved; no scoring; flagged in analytics |
| `active`      | `submitted`   | `POST /sessions/{id}/submit` or server-side timer expiry | All responses finalised; engine.score() invoked           |
| `submitted`   | `processed`   | Intelligence pipeline completes (sync steps 1–3 of §7.2) | session_record written; async pipeline queued             |

**Invariants:**

- A student may have at most one `active` or `interrupted` session at a time.
- `submitted` → `processed` is automatic and must complete within 5s (SLA from §22.1).
- `abandoned` sessions are never scored and do not update mastery. They are visible in activity logs with an "incomplete" label.
- **Checkpoint writes are NOT state transitions.** Autosave (§3.7) upserts `session_checkpoint` only; it never mutates `session_record.status` or bumps the optimistic lock version. This decouples autosave frequency from response-write concurrency.
- **Optimistic lock version** on `session_record` is bumped only by: (a) state transitions in the table above, and (b) response writes (which also increment the sequence counter atomically). Concurrent checkpoint POSTs during a response write do not cause `VERSION_CONFLICT`.

### 3.5 Session Data Model

#### 3.5.1 session_record

The immutable record of a completed (or abandoned) session. Written on transition to `submitted`.

```
session_record {
  id: uuid
  student_id: uuid
  tenant_id: uuid
  pathway_id: fk | null
  assessment_profile_id: fk | null
  repair_sequence_id: fk | null        -- set if this is a repair session
  engine_type: enum                     -- adaptive | linear | skill | diagnostic | repair
  mode: enum                            -- exam | practice | diagnostic | skill_drill | repair | challenge
  status: enum                          -- submitted | processed | abandoned
  started_at: timestamptz
  submitted_at: timestamptz | null
  processed_at: timestamptz | null
  duration_ms: int                      -- wall clock ms from first `getNextItem` to `submit`
  active_duration_ms: int               -- duration_ms minus sum of (pause → resume) intervals
                                        --   pause intervals come from `learning_event` pause/resume pairs
                                        --   capped at 24h; if session is abandoned, active_duration_ms is
                                        --   computed up to the last observed activity
  item_count: int
  items_answered: int
  items_correct: int
  raw_score: float | null               -- null for unscored modes (practice, diagnostic, repair)
  scaled_score: float | null
  score_band: string | null
  engine_state_snapshot: jsonb          -- frozen engine state at submission (for reproducibility)
  skills_touched: uuid[]                -- denormalised for fast analytics queries
  pipeline_status: enum                 -- pending | sync_complete | async_complete | async_failed
  created_at: timestamptz
}
```

#### 3.5.2 session_response

Individual item-level response within a session. One row per item attempted.

```
session_response {
  id: uuid
  session_id: fk                        -- references session_record
  item_id: fk
  student_id: uuid                      -- denormalised for RLS
  tenant_id: uuid                       -- denormalised for RLS
  sequence_number: int                  -- 1-indexed position in session
  response_data: jsonb                  -- student's answer (option_id, text, numeric value, etc.)
  is_correct: boolean | null            -- null for extended_response pending human marking
  score: float                          -- 0.0 or 1.0 for binary; partial credit for multi-part
  difficulty_at_response: float         -- item difficulty at time of serving (may differ from item.difficulty if live-adjusted)
  answered_at: timestamptz
  created_at: timestamptz
}
```

#### 3.5.3 response_telemetry

Behavioural metadata captured alongside each response (§9.1). One-to-one with `session_response`.

```
response_telemetry {
  response_id: fk                       -- references session_response
  time_to_answer_ms: int                -- from item render to final submission
  time_to_first_action_ms: int          -- from item render to first interaction
  answer_changes: int                   -- number of times the answer was changed
  items_since_session_start: int        -- position in session (for fatigue modelling)
  time_since_session_start_ms: int      -- elapsed time (for fatigue modelling)
  skipped_then_returned: boolean        -- flagged and came back
  scroll_to_bottom: boolean | null      -- for passage-based items, did they read the full stimulus
  created_at: timestamptz
}
```

### 3.6 Frontend/Backend Contracts

The Assessment Service API uses typed request/response DTOs. All payloads are validated with Zod schemas on both client and server.

#### 3.6.1 Create Session

```
-- Request: POST /sessions/create
CreateSessionRequest {
  assessment_profile_id: uuid | null    -- for exam/practice/diagnostic/challenge modes
  repair_sequence_id: uuid | null       -- for repair mode
  mode: enum                            -- exam | practice | diagnostic | skill_drill | repair | challenge
  target_skills: uuid[] | null          -- for skill_drill mode; overrides blueprint
  pathway_id: uuid | null
}

-- Response: 201 Created
CreateSessionResponse {
  session_id: uuid
  mode: enum
  engine_type: enum
  total_items: int | null               -- null for unbounded (skill, repair)
  time_limit_ms: int | null             -- null for untimed
  first_item: ItemDTO
  navigation: { can_go_back: boolean, can_skip: boolean, can_flag: boolean }
}

-- Errors:
-- 402: subscription tier does not permit this mode/pathway
-- 409: student already has an active session (must submit or abandon first)
-- 404: assessment_profile or repair_sequence not found
-- 422: invalid mode/target combination
```

#### 3.6.2 Record Response

```
-- Request: POST /sessions/{id}/respond
RecordResponseRequest {
  item_id: uuid
  response_data: jsonb                  -- answer payload (shape varies by response_type)
  telemetry: {
    time_to_answer_ms: int
    time_to_first_action_ms: int
    answer_changes: int
    scroll_to_bottom: boolean | null
  }
}

-- Response: 200 OK
RecordResponseResponse {
  is_correct: boolean | null            -- null if feedback is deferred (exam mode)
  explanation: jsonb | null             -- null in exam mode; populated in practice/repair
  next_item: ItemDTO | null             -- null if session is terminating
  termination: TerminationDTO | null    -- non-null if session is complete
  progress: { answered: int, total: int | null, time_remaining_ms: int | null }
}

-- Errors:
-- 404: session not found or not owned by caller
-- 409: session is not in 'active' state
-- 422: response_data does not match item's response_type schema
-- 410: item already answered and back-navigation not permitted
```

#### 3.6.3 Submit Session

```
-- Request: POST /sessions/{id}/submit
-- Body: empty (all responses already recorded)

-- Response: 200 OK
SubmitSessionResponse {
  session_id: uuid
  status: "submitted"
  score: { raw: float | null, scaled: float | null, band: string | null }
  summary: {
    items_answered: int
    items_correct: int
    duration_ms: int
    skills_touched: uuid[]
  }
}

-- Errors:
-- 409: session is not in 'active' state
-- 404: session not found
```

#### 3.6.4 Resume Session

```
-- Request: GET /sessions/{id}/state

-- Response: 200 OK
ResumeSessionResponse {
  session_id: uuid
  status: "active"                      -- status after resumption
  engine_type: enum
  mode: enum
  current_item: ItemDTO
  progress: { answered: int, total: int | null, time_remaining_ms: int | null }
  navigation: { can_go_back: boolean, can_skip: boolean, can_flag: boolean }
  answered_item_ids: uuid[]             -- items already completed (for client-side state rebuild)
}

-- Errors:
-- 404: session not found
-- 409: session is not in 'interrupted' state (or has been abandoned)
```

#### 3.6.5 Shared DTOs

```
ItemDTO {
  item_id: uuid
  stem: jsonb                           -- rich text content
  stimulus: { id: uuid, type: enum, content: jsonb } | null
  response_type: enum
  response_config: jsonb                -- options (without correct answer markers), input constraints
  tools_available: string[]             -- e.g., ["calculator"] for NAPLAN Year 7+ Numeracy
  sequence_number: int
}

TerminationDTO {
  reason: enum                          -- completed | time_expired | mastery_reached | max_items
  auto_submitted: boolean               -- true if timer expiry forced submission
}
```

### 3.7 Session Autosave & Recovery

#### 3.7.1 Autosave Behaviour

The client autosaves session state to the server at regular intervals to prevent data loss.

```
session_checkpoint {
  session_id: fk
  checkpoint_number: int                -- monotonically increasing
  current_question_index: int
  answers: jsonb                        -- all responses so far (compact format)
  telemetry_buffer: jsonb               -- unsent telemetry entries
  client_timestamp: timestamptz         -- client clock at save time
  server_timestamp: timestamptz         -- server clock at receipt
}
```

**Autosave rules:**

| Trigger        | Condition                                    | Behaviour                                            |
| -------------- | -------------------------------------------- | ---------------------------------------------------- |
| Periodic       | Every 30 seconds while session is `active`   | Client sends checkpoint silently                     |
| On response    | After every `RecordResponseRequest` succeeds | Implicit — response is already persisted server-side |
| On focus loss  | Browser/app loses focus                      | Immediate checkpoint                                 |
| On low battery | Device battery < 15% (mobile)                | Immediate checkpoint + warning                       |

**Implementation:** The client maintains a local `session_checkpoint` in memory. The autosave POST is fire-and-forget (200 OK or silently retried). The server keeps only the latest checkpoint per session (upsert on `session_id`). Checkpoints are deleted when the session reaches `submitted` or `abandoned`.

#### 3.7.2 Recovery Behaviour

When a student resumes an interrupted session (`GET /sessions/{id}/state`):

```
recover_session(session_id):
  server_state = load_session_responses(session_id)     -- authoritative responses
  checkpoint = load_latest_checkpoint(session_id)

  if checkpoint is null:
    -- no autosave data; resume from last server-confirmed response
    return server_state

  if checkpoint.checkpoint_number <= server_state.last_sequence:
    -- checkpoint is stale; server has more recent data
    return server_state

  -- checkpoint has responses not yet confirmed by server
  -- replay unconfirmed responses from checkpoint
  for answer in checkpoint.answers where answer.sequence > server_state.last_sequence:
    replay_response(session_id, answer)   -- idempotent; dedup key: (session_id, item_id, sequence_number)

  return merged_state
```

#### 3.7.3 Conflict Resolution

**Server wins.** If the client and server disagree on a response for the same item, the server-side `session_response` record is authoritative. The checkpoint replay dedup key is `(session_id, item_id, sequence_number)` — not `item_id` alone. This matters for RepairEngine sessions where the same item legitimately appears twice (e.g., in the initial probe stage and again in the mastery check). If a `session_response` already exists for that `(session_id, item_id, sequence_number)` triple, the checkpoint version is discarded. This is safe because `RecordResponseRequest` is the only way to write a committed response, and it is idempotent (§21.0.2).

**Clock skew:** `client_timestamp` is logged for diagnostics but never used for ordering decisions. All ordering uses `sequence_number` (§3.5.2) which is assigned server-side.

---

## 4. Assessment Framework Specifications

Each framework is a configuration record, not code. This section documents the rules each framework encodes.

> **Note:** Official exam specifications are the property of their respective authorities. Values marked _[platform decision]_ are MindMosaic's modelling choices informed by publicly available information. Values marked _[official characteristic]_ reflect well-documented public attributes of the assessment.

### 4.1 NAPLAN

| Attribute        | Value                                                                               |
| ---------------- | ----------------------------------------------------------------------------------- |
| Assessment style | Adaptive, testlet-based _[official characteristic]_                                 |
| Year levels      | 3, 5, 7, 9 _[official characteristic]_                                              |
| Domains          | Reading, Writing, Conventions of Language, Numeracy _[official characteristic]_     |
| Stages           | 3 stages per domain (except Writing: 1 stage) _[platform decision]_                 |
| Routing          | Performance on stage N determines testlet for stage N+1 _[official characteristic]_ |
| Difficulty paths | Typically 3 difficulty tiers per routing point _[platform decision]_                |
| Navigation       | Back-navigation within current stage only _[platform decision]_                     |
| Timing           | Per-stage timer, server-authoritative _[platform decision]_                         |
| Scoring          | Scaled score mapped from adaptive path + correctness _[official characteristic]_    |
| Writing          | Extended-response, human-marked (platform: text capture only in MVP)                |
| Calculator       | Permitted in designated Numeracy sections for Years 7/9 _[official characteristic]_ |

### 4.2 ICAS

| Attribute        | Value                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Assessment style | Linear, fixed-sequence _[official characteristic]_                                                     |
| Year levels      | 2–12 (mapped to papers A–J) _[official characteristic]_                                                |
| Subjects         | English, Mathematics, Science, Digital Technologies, Spelling Bee, Writing _[official characteristic]_ |
| Question count   | Typically 30–40 per paper _[platform decision]_                                                        |
| Difficulty       | Progressive within paper (easy → hard) _[official characteristic]_                                     |
| Navigation       | Full back-navigation permitted _[platform decision]_                                                   |
| Timing           | Single session timer _[platform decision]_                                                             |
| Scoring          | Raw score → scaled score → medal thresholds _[official characteristic]_                                |
| Marking          | All multiple-choice except Writing _[official characteristic]_                                         |

### 4.3 Selective Entry (AU)

| Attribute        | Value                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Assessment style | Linear, timed _[platform decision]_                                                                             |
| Target year      | Typically entry to Year 9 (varies by state) _[official characteristic]_                                         |
| Domains          | Reading Comprehension, Mathematical Reasoning, Quantitative Reasoning, Written Expression _[platform decision]_ |
| Focus            | Reasoning and higher-order thinking _[official characteristic]_                                                 |
| Navigation       | Full back-navigation _[platform decision]_                                                                      |
| Timing           | Strict per-section timer _[platform decision]_                                                                  |
| Scoring          | Raw score per section, composite total _[platform decision]_                                                    |

### 4.4 Singapore Math

| Attribute        | Value                                                                             |
| ---------------- | --------------------------------------------------------------------------------- |
| Assessment style | Linear with mastery checks _[platform decision]_                                  |
| Year levels      | Primary 1–6, Secondary 1–4 _[platform decision]_                                  |
| Focus            | Model method, bar modelling, conceptual understanding _[official characteristic]_ |
| Content          | Aligned to Singapore MOE syllabus _[platform decision]_                           |
| Difficulty       | CPA progression (Concrete → Pictorial → Abstract) _[platform decision]_           |
| Scoring          | Mastery-based (skill-level, not aggregate score) _[platform decision]_            |

### 4.5 Olympiad / AMC

| Attribute        | Value                                                                          |
| ---------------- | ------------------------------------------------------------------------------ |
| Assessment style | Linear, timed _[platform decision]_                                            |
| Year levels      | Mapped to competition divisions _[platform decision]_                          |
| Focus            | Non-routine problem solving, proof-based reasoning _[official characteristic]_ |
| Question types   | Multiple-choice, short-answer numerical, proof sketch _[platform decision]_    |
| Scoring          | Weighted scoring (harder questions worth more) _[official characteristic]_     |
| Negative marking | Configurable per competition framework _[platform decision]_                   |

---

## 5. Content & Taxonomy Model

### 5.1 Skill Hierarchy

The platform uses a four-level skill taxonomy shared across all pathways.

```
Domain → Strand → Skill → Sub-skill
```

| Level     | Example (Numeracy)                    | Granularity               |
| --------- | ------------------------------------- | ------------------------- |
| Domain    | Number & Algebra                      | Broadest grouping         |
| Strand    | Fractions & Decimals                  | Topic area                |
| Skill     | Equivalent Fractions                  | Assessable concept        |
| Sub-skill | Simplifying fractions to lowest terms | Atomic learning objective |

Each node in the hierarchy carries:

- `id`, `parent_id`, `level` (domain / strand / skill / subskill)
- `curriculum_codes[]` — mappings to external curriculum standards (e.g., Australian Curriculum v9 codes)
- `pathway_tags[]` — which pathways assess this skill
- `difficulty_range` — typical difficulty band for items testing this skill
- `prerequisite_ids[]` — skill dependencies (directed acyclic graph)
- `misconception_ids[]` — linked common misconceptions (§8.3)
- `repair_sequence_ids[]` — linked concept repair sequences (§9)

#### 5.1.1 Formal Skill Node Schema

The skill hierarchy is implemented as a full graph model. Each node is a first-class entity:

```
skill_node {
  id: uuid
  parent_id: uuid | null            -- hierarchy parent (domain→strand→skill→subskill)
  level: enum                       -- domain | strand | skill | subskill
  name: string                      -- e.g., "Equivalent Fractions"
  slug: string                      -- e.g., "equivalent-fractions"
  description: text
  domain_id: uuid                   -- denormalised: top-level domain for fast filtering
  difficulty_range: [float, float]  -- typical item difficulty band [min, max]
  bloom_levels: enum[]              -- which Bloom levels this skill spans
  curriculum_codes: string[]        -- external standard mappings
  pathway_tags: enum[]              -- exam families that assess this skill
  year_levels: int[]                -- applicable year levels
  misconception_ids: uuid[]         -- linked misconceptions (§10.3)
  repair_sequence_ids: uuid[]       -- linked repair sequences (§11)
  is_active: boolean
  created_at: timestamptz
  updated_at: timestamptz
}
```

#### 5.1.2 Graph Relationships

Beyond the parent–child hierarchy, skill nodes are connected by three edge types:

```
skill_edge {
  id: uuid
  source_id: uuid                   -- the dependent skill
  target_id: uuid                   -- the skill it relates to
  edge_type: enum                   -- prerequisite | related | cross_domain
  strength: float                   -- 0.0–1.0
  dependency_class: enum            -- required | supportive | enriching (prerequisite edges only)
}
```

| Edge Type        | Meaning                                               | Directionality             | Used By                                                                    |
| ---------------- | ----------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| **prerequisite** | Source cannot be mastered without target              | Directed (target → source) | Root cause traversal (§10.2), repair sequencing (§11), orchestration (§16) |
| **related**      | Skills that share conceptual overlap                  | Undirected                 | Skill transfer (§17.2), content selection, item recommendation variety     |
| **cross_domain** | Skills in different domains that reinforce each other | Undirected                 | Cross-pathway intelligence (§17), stretch recommendations (§13)            |

The graph is a **directed acyclic graph (DAG)** for prerequisite edges (cycles are rejected on publish). Related and cross-domain edges are bidirectional and may form cycles.

**Graph versioning and edit rules:**

The skill graph is versioned at the graph level (§22.9.2). At any time exactly one `skill_graph_version` has status `published`; all other versions are `draft` or `archived`. **Published graphs are immutable — no in-place node or edge edits are permitted.** To change the graph:

1. Create a new `draft` version by copy-on-write from the current `published` version.
2. Apply edits (add/modify/deactivate nodes and edges) only on the draft.
3. Run the full validation suite (below) on the draft.
4. Invoke the publish flow: the draft is validated again, the previous `published` version is moved to `archived`, and the draft becomes `published`. This is atomic.
5. Entity migration (§22.9.2) runs immediately after publish to rewrite references from old to new skill IDs where the `skill_migration_map` provides a mapping.

In-place editing is forbidden because any active student session, active repair record, or active learning plan may reference skills from the currently published version. Atomic publish-with-migration prevents dangling references.

**Graph validation rules (enforced on every draft publish):**

1. **No prerequisite cycles** — A topological sort must succeed on all prerequisite edges. If a cycle is detected, publish is rejected with the cycle path reported.
2. **No orphan skills** — Every skill_node at level `skill` or `subskill` must have at least one prerequisite or related edge (except explicitly tagged "foundational" nodes with no prerequisites).
3. **No dangling edges** — Both `source_id` and `target_id` must reference active skill_nodes in the same graph version. Cross-version edges are invalid.
4. **Prerequisite depth limit** — No prerequisite chain may exceed 10 hops. If a chain exceeds this, the deepest edge is flagged for review and publish is blocked.
5. **Cross-level consistency** — A `subskill` cannot be a prerequisite of a `domain` or `strand` (edges must not skip more than one hierarchy level upward).
6. **Strength range** — `strength` must be in [0.0, 1.0]. `dependency_class` must be consistent with strength range: `required` requires strength ≥ 0.8, `supportive` requires 0.4–0.79, `enriching` requires < 0.4.
7. **Migration map completeness** — If any node from the previous published version is not present in the new draft, `skill_migration_map` must provide either a replacement `new_skill_id` or an explicit NULL indicating retirement.

Per-edge CHECK constraints (self-edge, strength range, dependency-class consistency) are enforced at the database layer. Complete DAG, orphan, depth, and migration-completeness checks run as an application-level publish step.

#### 5.1.3 Graph Traversal: Upstream (Root Cause Discovery)

Traverses prerequisite edges downward (toward foundations) to find the deepest unmastered skill. This is the primary traversal used by the Causal Intelligence layer (§10.2).

```
traverse_upstream(student, skill, visited=set()):
  if skill in visited: return []    -- cycle guard (should not occur in DAG)
  visited.add(skill)

  prerequisites = get_edges(skill, type=prerequisite, direction=incoming)
                    .filter(strength >= 0.4)
                    .sort_by(strength, descending)

  unmastered_prereqs = [
    p for p in prerequisites
    if mastery(student, p.target_id) < mastery_threshold
  ]

  if unmastered_prereqs is empty:
    return [skill]                  -- this skill is the root cause

  root_causes = []
  for prereq in unmastered_prereqs:
    root_causes.extend(traverse_upstream(student, prereq.target_id, visited))

  return deduplicate(root_causes)
```

#### 5.1.4 Graph Traversal: Downstream (Learning Progression)

Traverses prerequisite edges upward (toward advanced skills) to determine what the student is ready to learn next and what will be unblocked by mastering a given skill.

```
traverse_downstream(skill, visited=set()):
  if skill in visited: return []
  visited.add(skill)

  dependents = get_edges(skill, type=prerequisite, direction=outgoing)
  unlocked = []

  for dep in dependents:
    dependent_skill = dep.source_id
    -- check if ALL prerequisites of the dependent skill are met (not just this one)
    all_prereqs = get_edges(dependent_skill, type=prerequisite, direction=incoming)
                    .filter(dependency_class == required)
    all_met = all(mastery(student, p.target_id) >= mastery_threshold for p in all_prereqs)

    if all_met:
      unlocked.append(dependent_skill)
      unlocked.extend(traverse_downstream(dependent_skill, visited))

  return unlocked
```

**Usage:** After a repair sequence resolves a root cause, `traverse_downstream` identifies which higher-level skills are now unblocked and should be re-assessed or offered for practice. The orchestration layer (§16) uses this to dynamically update the learning plan.

### 5.2 Item Schema

The item entity is split into two tables for versioning safety (§22.9.1): `item` holds stable statistical and tagging fields; `item_version` holds the content payload (stem, options, rationale, explanation). Reads for active sessions always go through the **current-version view** `v_item_current`, which joins `item` to its current `item_version` row.

```
item {
  id: uuid
  source_item_id: string | null     -- external identifier for traceability
  stimulus_id: uuid | null          -- shared stimulus (e.g., reading passage)
  response_type: enum               -- mcq | multi_select | short_answer | extended_response
                                    --   | drag_drop | cloze | numeric_entry
  skill_tags: uuid[]                -- primary + secondary skill references
  difficulty: float                 -- normalised 0.0–1.0 (see §6.4); recalibrated by L8
  discrimination: float | null      -- item quality metric; recalibrated by L8
  expected_time_secs: int | null
  year_level: int[]
  exam_family: enum[]
  program: string[]
  country: string[]
  curriculum: string[]
  bloom_level: enum | null
  lifecycle: enum                   -- draft | review | active | monitored | retired (§15.3)
  current_version: int              -- points to the current item_version row
  is_active: boolean
  created_at: timestamptz
  updated_at: timestamptz
}

item_version {
  item_id: uuid                     -- references item.id
  version: int                      -- monotonically increasing per item
  stem: jsonb                       -- rich text with LaTeX, images, audio refs
  response_config: jsonb            -- options, correct answers, tolerances, rubric
  distractor_rationale: jsonb | null -- per-option misconception mappings (§8.3)
  explanation: jsonb | null         -- solution explanation for practice/repair mode
  metadata: jsonb                   -- author, review status, usage count, tags
  difficulty: float                 -- frozen at version-create time
  discrimination: float | null
  is_current: boolean               -- exactly one current version per item
  supersedes: int | null            -- previous version number
  created_at: timestamptz
}
```

**Rules:**

1. Active assessments and session reads always resolve items via `v_item_current` — never by joining `item` directly to an arbitrary `item_version` row.
2. Historical `session_response` records reference the specific `(item_id, version)` that was served at response time, preserving reproducibility (§22.9.1).
3. Statistical recalibration (difficulty, discrimination, §15.1–15.2) updates the current `item_version` row in place — these are not content changes.
4. Content changes (stem, options, distractors, explanation) create a **new** `item_version` row and flip `is_current` atomically.
5. Items used in adaptive assessments (NAPLAN) must carry `discrimination` values; items used in diagnostic and repair modes must carry `distractor_rationale`.

### 5.3 Tagging Rules

1. Every item must have at least one `skill_tag` at the **skill** or **sub-skill** level.
2. Every item must have at least one `exam_family` tag.
3. `difficulty` must be assigned before the item enters any assessment blueprint.
4. Items used in adaptive assessments (NAPLAN) must also carry `discrimination` values.
5. `year_level` is mandatory; multi-year items are permitted where pedagogically appropriate.
6. `stimulus_id` is required for passage-based or shared-context items; the stimulus is a separate entity with its own metadata.
7. MCQ items should include `distractor_rationale` mapping each incorrect option to a misconception ID where applicable (§8.3). This is recommended for all items but mandatory for items used in diagnostic and repair modes.

### 5.4 Stimulus Schema

```
stimulus {
  id: uuid
  type: enum                -- passage | image_set | data_table | audio_clip | video_clip
  content: jsonb            -- rich content
  source_attribution: text
  year_level: int[]
  exam_family: enum[]
  is_active: boolean
}
```

---

## 6. Multi-Exam Data Architecture

### 6.1 exam_family Model

`exam_family` is the top-level discriminator for all assessment-related data. It is an enum with values: `naplan`, `icas`, `selective`, `singapore_math`, `olympiad`. New families are added by extending this enum and providing a corresponding `framework_config`.

### 6.2 assessment_profile

An `assessment_profile` represents a specific, administrable assessment configuration.

```
assessment_profile {
  id: uuid
  exam_family: enum
  program: string               -- e.g., "ICAS Mathematics Paper D"
  year_level: int
  version: string               -- "2026-practice-1"
  framework_config_id: fk
  blueprint_id: fk
  duration_minutes: int
  is_active: boolean
}
```

### 6.3 Blueprint Linkage

A **blueprint** defines the content distribution for an assessment profile: how many items per skill/strand, at what difficulty bands, and in what order.

```
blueprint {
  id: uuid
  assessment_profile_id: fk
  sections: jsonb               -- ordered list of sections, each with:
                                --   skill_targets, difficulty_distribution,
                                --   item_count, time_allocation, tool_permissions
}
```

The content service selects items matching blueprint constraints at session creation time. For adaptive assessments, multiple testlet blueprints are pre-defined (one per routing path).

### 6.4 Difficulty Normalisation

Each exam family may have its own native difficulty scale. The platform normalises all difficulties to a **0.0–1.0 float** using a per-family mapping function stored in `framework_config.difficulty_bands`.

| Band | Normalised Range | Semantic Label |
| ---- | ---------------- | -------------- |
| 1    | 0.00–0.20        | Foundation     |
| 2    | 0.20–0.40        | Developing     |
| 3    | 0.40–0.60        | Proficient     |
| 4    | 0.60–0.80        | Advanced       |
| 5    | 0.80–1.00        | Expert         |

This normalisation enables cross-pathway difficulty comparison and feeds the unified learner model.

### 6.5 Backward Compatibility

NAPLAN and ICAS content and sessions created under earlier schema versions are migrated via:

- A one-time data migration script mapping legacy fields to the new `exam_family` / `assessment_profile` structure.
- Legacy API endpoints return data in the previous shape, backed by the new schema, for a deprecation period of two release cycles.

---

# PART II — INTELLIGENCE STACK

The Intelligence Stack is MindMosaic's core differentiator. It is a nine-layer processing pipeline that transforms raw session data into actionable learning intelligence. Each layer has defined inputs, outputs, and dependencies. Layers can be improved independently.

---

## 7. Intelligence Stack Overview

```
Layer 1: Foundation Intelligence     — mastery, velocity, retention, confidence
Layer 2: Behaviour Intelligence      — guessing, fatigue, persistence, cognitive load
Layer 3: Causal Intelligence         — skill dependency traversal, root cause, misconceptions
Layer 4: Concept Repair Engine       — scaffolding, visual learning, prerequisite rebuilding
Layer 5: Predictive Intelligence     — exam readiness, performance forecast, mastery timeline
Layer 6: Stretch Intelligence        — challenge detection, above-grade routing, olympiad readiness
Layer 7: Teacher Intervention Intel  — auto-grouping, intervention recs, targeted assignments
Layer 8: Content Intelligence Loop   — difficulty recalibration, discrimination updates, lifecycle
Layer 9: Learning Path Orchestration — long-term plans, pathway switching, exam countdown
```

### 7.1 Layer Dependency Map

| Layer                   | Depends On                             | Feeds Into                                     | Processing Mode              |
| ----------------------- | -------------------------------------- | ---------------------------------------------- | ---------------------------- |
| 1. Foundation           | Raw session data                       | All other layers                               | **Sync** (post-session, <3s) |
| 2. Behaviour            | Raw session data, Foundation           | Causal, Predictive, Teacher                    | **Sync** (post-session, <3s) |
| 3a. Causal (scoped)     | Foundation, Behaviour, Skill Graph     | Repair (fast path), sync-path UI               | **Sync** (post-session, <3s) |
| 3b. Causal (full)       | Foundation, Behaviour, Skill Graph     | Repair (deep), Predictive, Cross-Pathway       | **Async** (queued, <30s)     |
| 4. Repair               | Causal (3a for fast-path; 3b for deep) | Foundation (re-evaluation), Path Orchestration | **Async** (queued, <30s)     |
| 5. Predictive           | Foundation, Behaviour, Causal 3b       | Path Orchestration, Reporting                  | **Async** (queued, <30s)     |
| 6. Stretch              | Foundation, Predictive                 | Path Orchestration                             | **Async** (queued, <30s)     |
| 7. Teacher Intervention | Foundation, Behaviour, Causal 3b       | Reporting                                      | **Async** (queued, <30s)     |
| 8. Content Loop         | Foundation (aggregate across students) | Content Service, all engines                   | **Batch** (hourly scheduled) |
| 9. Path Orchestration   | All layers                             | Recommendation Service, Dashboards             | **Async** (queued, <30s)     |

**Rationale for splitting L3:** Full causal traversal (`traverse_upstream` over the entire skill graph for every touched skill) is unbounded in cost — a session touching 30 skills with depth-5 prerequisite chains can generate hundreds of graph walks. Running this inline would breach the 3s sync SLA under load. L3a performs only a **bounded scoped traversal** on the sync path (touched skills + their immediate-prerequisite layer only, depth 1); L3b performs the full deep traversal asynchronously. The client's post-submit screen gets useful causal hints from L3a within the sync budget; the full causal map appears on the dashboard within 30s.

### 7.2 Processing Pipeline

After every session completion, the system executes:

```
on_session_complete(session):
  -- Synchronous (must complete before submit response is returned)
  1. foundation.update(session)              -- L1: mastery, velocity, retention, confidence
  2. behaviour.analyse(session)              -- L2: guessing, fatigue, persistence signals
  3a. causal.evaluate_scoped(session, foundation)
                                             -- L3a: depth-1 prerequisite walk for touched skills;
                                             --      distractor-rationale misconception detection;
                                             --      suspected/active flagging for fast-path repair
  -- Asynchronous (queued to job system, eventual consistency)
  3b. causal.evaluate_full(student)          -- L3b: full traverse_upstream + traverse_downstream
                                             --      on all weak skills; refined misconception confidence
  4. repair.queue_sequences(causal.misconceptions)
  5. predictive.refresh(student)
  6. stretch.evaluate(student)
  7. teacher.refresh_groups(student.class)
  8. content.recalibrate(session.items)
  9. orchestration.replan(student)
```

**Sync portion (steps 1, 2, 3a) SLA: p95 < 3s.** Achieved by:
- In-memory skill-graph cache in Edge Function module scope (1h TTL, watermark-invalidated on graph publish).
- Batched UPSERTs for `skill_mastery` and `learning_velocity` (single round-trip per batch).
- L3a is bounded: touched_skills × 1 prerequisite layer, not a full graph walk.

If any sync step fails, the session remains in `submitted` state and a retry is scheduled immediately (max 3 retries, exponential backoff starting at 1s). The client receives the submit response optimistically — score data is available, but dashboard data may be stale until `processed`.

**Async portion (steps 3b–9) SLA: p95 < 30s.** Dispatched via the transactional outbox pattern: each step is an independent job with its own retry policy. Step 9 (orchestration) is scheduled with a 10s delay so upstream async steps converge first (eventual consistency; plan refines on next session if not).

#### 7.2.1 Async Pipeline Event Model

Each async step emits a typed event on completion:

```
pipeline_event {
  id: uuid
  session_id: fk
  student_id: uuid
  step: int                             -- 4–9
  step_name: string                     -- e.g., "repair.queue_sequences"
  status: enum                          -- pending | processing | completed | failed | skipped
  attempts: int                         -- retry count
  started_at: timestamptz | null
  completed_at: timestamptz | null
  error: text | null                    -- error message on failure
  created_at: timestamptz
}
```

**Retry and failure rules:**

| Step                    | Max Retries | Backoff    | On Final Failure     | Downstream Impact                                              |
| ----------------------- | ----------- | ---------- | -------------------- | -------------------------------------------------------------- |
| 4. Repair queue         | 3           | 1s, 2s, 4s | Log error; skip step | Misconception repairs delayed until next session               |
| 5. Predictive refresh   | 3           | 1s, 2s, 4s | Log error; skip step | Dashboard shows stale predictions with `stale_since` indicator |
| 6. Stretch evaluate     | 2           | 1s, 2s     | Log error; skip step | No stretch offers until next session                           |
| 7. Teacher refresh      | 2           | 1s, 2s     | Log error; skip step | Class groupings stale until next student session               |
| 8. Content recalibrate  | 1           | —          | Log error; skip step | Recalibration catches up on next hourly batch                  |
| 9. Orchestration replan | 3           | 1s, 2s, 4s | Log error; skip step | Student sees previous plan with `stale_since` indicator        |

**Key invariant:** No async step failure prevents subsequent steps from executing. Each step runs independently. The pipeline coordinator marks the session as `async_complete` when all steps have resolved (completed or skipped). If any step was skipped, `session_record.pipeline_status` is set to `async_partial` rather than `async_complete`.

**Dead letter queue:** Events that exhaust retries are written to a dead-letter table for manual investigation. An operational alert fires if >5% of pipeline events in any 1-hour window end in the dead letter queue.

### 7.3 Intelligence Feedback Loop

The intelligence stack operates as a continuous closed loop, not a one-shot pipeline. Every student interaction produces data that refines the model, which in turn changes what the student sees next.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Student     │────▶│  Data        │────▶│  Intelligence │
│   Interaction │     │  Capture     │     │  Pipeline     │
│  (session)    │     │  (response + │     │  (§7.2)       │
│               │     │   telemetry) │     │               │
└──────────────┘     └──────────────┘     └───────┬───────┘
       ▲                                          │
       │                                          ▼
┌──────┴───────┐     ┌──────────────┐     ┌──────────────┐
│  Next        │◀────│  Orchestrator │◀────│  Model       │
│  Interaction │     │  (§16)       │     │  Update      │
│  (adapted)   │     │  plan refresh│     │  (mastery,   │
│              │     │              │     │   velocity,  │
└──────────────┘     └──────────────┘     │   causal...) │
                                          └──────────────┘
```

**Update timing:**

| Signal                                  | Update Type                    | Latency | Trigger                                      |
| --------------------------------------- | ------------------------------ | ------- | -------------------------------------------- |
| Mastery, confidence                     | Synchronous                    | < 3s    | Every session completion                     |
| Velocity                                | Synchronous                    | < 3s    | Every session touching the skill             |
| Behaviour profile (guess rate, fatigue) | Synchronous                    | < 3s    | Every session                                |
| Retention estimate                      | On-read (computed, not stored) | < 50ms  | Dashboard load, plan generation              |
| Causal map, misconceptions              | Async                          | < 30s   | Session completion                           |
| Repair queue                            | Async                          | < 30s   | Misconception detection or root cause change |
| Learning plan                           | Async                          | < 30s   | Every session; full rebuild weekly           |
| Predictions (readiness, forecast)       | Async                          | < 30s   | Every session; cached with 1hr TTL           |
| Content recalibration                   | Batch                          | Hourly  | Scheduled job                                |

**How recommendations evolve:** The orchestrator (§16) regenerates the plan after every session. If a session reveals a new misconception, the next plan will include a repair sequence. If a session shows rapid mastery improvement, stretch content may appear. If velocity turns negative, the plan shifts from practice to review. The student experiences this as a seamlessly adaptive system — they never see the same stale recommendation twice.

### 7.4 AI Explainability & Audit

Every recommendation, alert, and learning plan entry carries a structured explanation. The system never says "Practice Fractions" — it says why.

#### 7.4.1 Explanation Schema

Every output from the intelligence stack includes:

```
explanation {
  summary: string               -- human-readable, 1 sentence
                                -- e.g., "Fractions recommended: mastery 0.42, declining
                                --        over last 3 sessions, affects 4 downstream skills"
  factors: [
    {
      factor_type: enum         -- mastery | velocity | retention | misconception |
                                --   behaviour | pathway_weight | root_cause | stretch
      value: float | string     -- the actual value
      weight: float             -- how much this factor influenced the decision
      direction: enum           -- positive | negative | neutral
    }
  ]
  source_layer: string          -- which intelligence layer generated this (e.g., "L3:causal")
  evidence_ids: uuid[]          -- session_ids, response_ids backing this decision
  generated_at: timestamptz
}
```

**Examples of explainable outputs:**

| Output Type             | Bad (Opaque)              | Good (Explainable)                                                                                                                                                                |
| ----------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Practice recommendation | "Practice Fractions"      | "Fractions recommended: mastery 0.42 and declining (−0.03/week). Root cause for 4 higher skills including Ratios and Percentages."                                                |
| Repair trigger          | "Repair needed"           | "Misconception detected: 'adds denominators when adding fractions' (confidence 0.85, observed in 4/5 recent fraction items). Repair sequence: Understanding Common Denominators." |
| Stretch offer           | "Try harder content"      | "Algebra mastery 0.92, stable for 21 days, persistence score 0.8. Ready for Year 8 content."                                                                                      |
| Teacher alert           | "Student needs attention" | "Velocity negative on 5 skills for 18 days. Misconception 'add_denominators' failed repair twice. Recommend 1:1 review of fraction concepts."                                     |

#### 7.4.2 Audit Trail

Every intelligence decision is logged immutably:

```
intelligence_audit_log {
  id: uuid
  student_id: uuid
  tenant_id: uuid
  event_type: enum              -- plan_generated | repair_triggered | alert_created |
                                --   misconception_detected | stretch_offered | prediction_made
  input_snapshot: jsonb         -- frozen copy of all input signals at decision time
  output: jsonb                 -- the decision made
  explanation: jsonb            -- structured explanation (§7.4.1)
  layer: string                 -- which intelligence layer (e.g., "L3a", "L9")
  algorithm_version: string     -- semantic version of the algorithm that produced this decision
                                --   (e.g., "foundation.v2.1", "causal.v1.3")
  trace_id: uuid                -- request-level trace ID for cross-service correlation (§22.6)
  created_at: timestamptz
}
```

**Algorithm versioning:** Every intelligence computation stamps the `algorithm_version` of the function that produced the decision. This serves three purposes: (1) when a decision is replayed from `learning_event` with an updated algorithm, the original stamp shows which version was authoritative at the time; (2) A/B testing across algorithm versions can be compared cleanly; (3) regulatory explanations can state "computed by algorithm version X, superseded by Y on date Z."

This enables: debugging why a specific recommendation was made, A/B testing different weight configurations by replaying decisions with alternate weights, and regulatory compliance (parents can request an explanation of any decision affecting their child).

### 7.5 Real-Time Adaptation Layer

While the full intelligence pipeline (§7.2) runs post-session, certain adaptations happen **within** a live session in real-time. This applies to SkillEngine, RepairEngine, and DiagnosticEngine sessions (not Exam mode, which simulates fixed conditions).

#### 7.5.1 In-Session Difficulty Adjustment

```
adjust_difficulty_live(session_state, latest_response):
  recent = session_state.responses[-5:]   -- last 5 items
  recent_accuracy = count(correct in recent) / len(recent)
  current_difficulty = session_state.current_difficulty

  if recent_accuracy >= 0.8 AND len(recent) >= 3:
    -- student is finding this too easy; increase
    new_difficulty = min(1.0, current_difficulty + 0.1)
  elif recent_accuracy <= 0.3 AND len(recent) >= 3:
    -- student is struggling; decrease
    new_difficulty = max(0.0, current_difficulty - 0.15)
  elif cognitive_load(recent) > 0.8:
    -- overloaded even if accuracy is moderate; ease off
    new_difficulty = max(0.0, current_difficulty - 0.1)
  else:
    new_difficulty = current_difficulty   -- stay the course

  session_state.current_difficulty = new_difficulty
  return select_next_item(session_state.target_skills, new_difficulty)
```

#### 7.5.2 In-Session Skill Prioritisation

When a SkillEngine session targets multiple skills, the engine re-prioritises between skills within the session:

```
reprioritise_skills(session_state):
  for skill in session_state.target_skills:
    skill.session_priority = (
      (1 - session_accuracy(skill)) * 0.5      -- lower accuracy = higher priority
      + (1 - session_attempts(skill) / target_attempts) * 0.3  -- under-practised skills
      + pathway_weight(skill) * 0.2             -- pathway importance
    )

  return session_state.target_skills.sort_by(session_priority, descending)
```

This ensures that if a student is sailing through one skill but struggling with another, the session naturally spends more time on the harder material without requiring the student to make that decision.

### 7.6 Learning Event Schema

All student interactions are normalised into a canonical `LearningEvent` before entering the intelligence pipeline. This is the system's single source of truth for what happened.

```
learning_event {
  id: uuid
  student_id: uuid
  tenant_id: uuid
  session_id: fk
  item_id: fk | null                   -- null for non-item events (pause, resume)
  skill_id: uuid | null                -- primary skill of the item (denormalised)
  event_type: enum                     -- answer | hint_requested | skip | pause |
                                       --   resume | submit | timeout | repair_stage_complete
  correctness: boolean | null          -- null for non-answer events
  score: float | null                  -- partial credit if applicable
  duration_ms: int                     -- time spent on this event
  difficulty_at_event: float | null    -- item difficulty when served
  metadata: jsonb                      -- event-type-specific data:
                                       --   answer: { response_data, answer_changes, guess_probability }
                                       --   hint_requested: { hint_level }
                                       --   skip: { skipped_after_ms }
                                       --   repair_stage_complete: { stage_type, passed }
  sequence_number: int                 -- global ordering within session
  created_at: timestamptz
}
```

**Ingestion:** The Assessment Service writes `learning_event` rows as a side effect of `RecordResponseRequest` and engine state transitions. One API call may produce 1–2 events (e.g., an answer event + a timeout event if the timer expired).

**Consumers:** The intelligence pipeline (§7.2) reads events via the session's event stream. Events are immutable after creation. All downstream computations (mastery, behaviour, causal) derive from events — they never read `session_response` directly; `session_response` is the denormalised API-facing view.

**Idempotency:** Events are deduplicated on `(session_id, item_id, event_type, sequence_number)`. Replaying the same event is a no-op.

**Replay capability:** The intelligence pipeline can be re-run for any session by replaying its `learning_event` stream. This enables: debugging (reproduce a decision), backfill (apply a new algorithm retroactively), and A/B testing (compare two algorithms on the same event stream).

### 7.7 Async Job System

All asynchronous work is managed through a unified job system. This includes intelligence pipeline async steps (§7.2.1), batch analytics, and scheduled maintenance.

#### 7.7.1 Job Types

| Job Type                          | Trigger               | Priority | Idempotent                                   | Max Duration | Owner Service |
| --------------------------------- | --------------------- | -------- | -------------------------------------------- | ------------ | ------------- |
| `pipeline.repair_queue`           | Session complete      | High     | Yes (dedup on student_id + misconception_id) | 10s          | Intelligence  |
| `pipeline.predictive_refresh`     | Session complete      | Medium   | Yes (dedup on student_id)                    | 15s          | Intelligence  |
| `pipeline.stretch_evaluate`       | Session complete      | Low      | Yes                                          | 5s           | Intelligence  |
| `pipeline.teacher_refresh`        | Session complete      | Low      | Yes (dedup on class_id)                      | 10s          | Analytics     |
| `pipeline.content_recalibrate`    | Session complete      | Low      | Yes (dedup on item_id)                       | 5s           | Content       |
| `pipeline.orchestration_replan`   | Session complete      | High     | Yes (dedup on student_id)                    | 15s          | Orchestration |
| `batch.content_recalibration`     | Hourly cron           | Low      | Yes                                          | 300s         | Content       |
| `batch.cohort_analytics`          | Hourly cron           | Low      | Yes                                          | 600s         | Analytics     |
| `batch.retention_decay_check`     | Daily cron            | Low      | Yes                                          | 600s         | Intelligence  |
| `batch.abandoned_session_cleanup` | Daily cron            | Low      | Yes                                          | 120s         | Assessment    |
| `batch.plan_expiry_cleanup`       | Daily cron            | Low      | Yes                                          | 60s          | Orchestration |
| `scheduled.follow_up_assessment`  | Repair follow-up date | Medium   | Yes (dedup on repair_record_id)              | 10s          | Intelligence  |

#### 7.7.2 Queue Model

Jobs are stored in a `job_queue` table acting as a transactional outbox:

```
job_queue {
  id: uuid
  job_type: string
  payload: jsonb                        -- job-specific input data
  priority: enum                        -- high | medium | low
  status: enum                          -- pending | processing | completed | failed | dead_letter
  idempotency_key: string              -- dedup key (composite of job_type + entity IDs)
  attempts: int
  max_attempts: int                     -- default: 3
  last_error: text | null
  scheduled_at: timestamptz             -- when the job should run (supports delayed execution)
  started_at: timestamptz | null
  completed_at: timestamptz | null
  created_at: timestamptz
}
```

**Processing:** A worker polls `pending` jobs ordered by `(priority DESC, scheduled_at ASC)`. On pickup, status transitions to `processing`. On success, `completed`. On failure, `attempts` increments; if `attempts >= max_attempts`, status transitions to `dead_letter`. Retry backoff: 1s, 2s, 4s (exponential).

**Deduplication:** Before inserting a job, the system checks for an existing job with the same `idempotency_key` in `pending` or `processing` state. If found, the insert is skipped.

**Observability:** Job completion rates and latencies feed into the metrics defined in §22.6.2. Dead-letter jobs trigger operational alerts.

### 7.8 Intelligence Dependency Matrix

This formalises the inputs, outputs, and data contracts for each intelligence layer. No hidden coupling — every dependency is listed here.

| Layer                 | Input Entities                                                                | Input Fields Used                                                                                       | Output Entities                   | Output Fields Written                                                                      |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| **L1: Foundation**    | `learning_event` (answer events)                                              | `correctness`, `score`, `difficulty_at_event`, `skill_id`                                               | `skill_mastery`                   | `mastery_level`, `confidence`, `total_attempts`, `correct_attempts`, `streak_*`, `history` |
|                       |                                                                               |                                                                                                         | `learning_velocity`               | `velocity`, `computed_at`                                                                  |
| **L2: Behaviour**     | `learning_event` (all types)                                                  | `duration_ms`, `event_type`, `metadata.answer_changes`, `metadata.guess_probability`, `sequence_number` | `behaviour_profile`               | All fields (§9.6)                                                                          |
| **L3: Causal**        | `skill_mastery`, `behaviour_profile`, `skill_edge`, `misconception`           | mastery per skill, guess rate, prerequisite edges, distractor rationales                                | `student_misconception`           | `confidence`, `status`, `evidence`                                                         |
|                       |                                                                               |                                                                                                         | causal_map (computed, not stored) | root causes, repair queue                                                                  |
| **L4: Repair**        | `student_misconception`, `repair_sequence`, `skill_mastery`                   | active misconceptions, available sequences, current mastery                                             | `repair_record`                   | `status`, `stages_completed`, `mastery_check_score`                                        |
| **L5: Predictive**    | `skill_mastery`, `learning_velocity`, `behaviour_profile`, `framework_config` | mastery, velocity, retention, behaviour signals, scoring rules                                          | (computed, cached)                | readiness score, projected mastery, confidence intervals                                   |
| **L6: Stretch**       | `skill_mastery`, `behaviour_profile`, `learning_velocity`                     | mastery ≥ 0.85, persistence ≥ 0.6, velocity ≥ 0                                                         | (computed, cached)                | stretch readiness per skill                                                                |
| **L7: Teacher**       | `skill_mastery`, `behaviour_profile`, `student_misconception`                 | mastery per student, behaviour signals, active misconceptions                                           | `intervention_alert`              | alert_type, severity, detail, suggested_action                                             |
| **L8: Content**       | `learning_event` (aggregate across students per item)                         | `correctness`, `difficulty_at_event`, session scores                                                    | `item`                            | `difficulty` (recalibrated), `discrimination` (updated)                                    |
| **L9: Orchestration** | All L1–L8 outputs, `feature_flag`, `learning_plan` (current)                  | Everything                                                                                              | `learning_plan`, `recommendation` | Full plan with sessions, milestones, rationale                                             |

**Isolation guarantee:** Each layer reads only the entities listed in its "Input Entities" column. If a layer needs data not listed here, the dependency matrix must be updated first — no ad-hoc cross-layer reads.

---

## 8. Foundation Intelligence (Layer 1) — Refined

Every student has a **Learner Profile** (internally: Learning DNA) that aggregates performance signals into a real-time model of their abilities, patterns, and trajectory.

### 8.1 Skill Mastery Model

Each (student, skill) pair maintains a mastery record:

```
skill_mastery {
  student_id: uuid
  skill_id: uuid
  mastery_level: float          -- 0.0–1.0
  confidence: float             -- 0.0–1.0 (how certain the estimate is)
  total_attempts: int
  correct_attempts: int
  last_attempted_at: timestamptz
  streak_current: int
  streak_best: int
  history: jsonb                -- recent attempt log for decay and velocity
}
```

**Mastery calculation (MVP):**

```
mastery_level = weighted_average(
  recent_accuracy,              -- last 10 attempts, recency-weighted
  difficulty_adjusted_score,    -- correct on hard items counts more
  consistency,                  -- low variance = higher mastery
  behaviour_penalty             -- guessing penalty from Layer 2 (0.0–0.2 deduction)
)
```

**Confidence** increases with more attempts and decreases with time since last attempt. A skill with `mastery: 0.8, confidence: 0.3` means "probably strong, but we haven't seen enough recent evidence."

### 8.2 Learning Velocity

```
learning_velocity {
  student_id: uuid
  skill_id: uuid
  velocity: float               -- positive = improving, negative = declining
  window_days: int              -- measurement window (default: 14)
  computed_at: timestamptz
}
```

Velocity is the slope of mastery over time within the measurement window. It is recomputed after each session touching that skill. Velocity feeds the recommendation engine: declining skills are prioritised for intervention; rapidly improving skills may receive stretch content (Layer 6).

### 8.3 Retention Tracking

The platform models knowledge retention using a simplified spaced-repetition decay curve.

```
retention_estimate(skill, student):
  days_since = now - skill_mastery.last_attempted_at
  half_life = base_half_life * (1 + log(skill_mastery.total_attempts))
  retention = mastery_level * exp(-0.693 * days_since / half_life)
  return retention
```

Skills with low predicted retention are surfaced for review, even if their recorded mastery is high.

### 8.4 Confidence Scoring

Confidence combines two dimensions:

1. **Statistical confidence** — sample size and recency of data.
2. **Behavioural confidence** — derived from response patterns (time-to-answer, answer changes, skip-then-return).

```
overall_confidence =
  0.7 * statistical_confidence(attempts, recency) +
  0.3 * behavioural_confidence(response_patterns)
```

Low-confidence skills are prioritised for diagnostic assessment to improve the model.

### 8.5 Learner Profile (Learning DNA)

The Learning DNA is a read-model aggregation computed on demand or cached with TTL.

```
learning_dna {
  student_id: uuid
  overall_level: string                 -- "Foundation" | "Developing" | "Proficient" | "Advanced"
  domain_profiles: {
    [domain_id]: {
      mastery: float
      velocity: float
      weakest_strands: skill_id[]
      strongest_strands: skill_id[]
    }
  }
  behaviour_profile: jsonb              -- aggregated from Layer 2 (see §9)
  active_misconceptions: misconception_id[]  -- from Layer 3 (see §10)
  active_repair_sequences: repair_id[]  -- from Layer 4 (see §11)
  learning_style_indicators: jsonb      -- e.g., { "benefits_from_visual": 0.7,
                                        --         "struggles_with_time_pressure": 0.8 }
  pathway_readiness: {
    [pathway_slug]: {
      estimated_score_band: string
      confidence_interval: [float, float]
      skill_coverage: float             -- % of pathway skills assessed
      gaps: skill_id[]
      predicted_ready_date: date | null
    }
  }
  cross_pathway_insights: jsonb         -- root causes, transfer opportunities
  stretch_readiness: jsonb              -- from Layer 6
  computed_at: timestamptz
}
```

---

## 9. Behaviour Intelligence (Layer 2) — NEW

This layer extracts learning behaviour signals from raw response data. These signals adjust mastery estimates, inform the causal layer, and provide teachers with actionable behavioural insights.

### 9.1 Response Telemetry Schema

Every response records behavioural metadata alongside correctness:

```
response_telemetry {
  response_id: fk
  time_to_answer_ms: int            -- from item render to final submission
  time_to_first_action_ms: int      -- from item render to first interaction
  answer_changes: int               -- number of times the answer was changed
  items_since_session_start: int    -- position in session (for fatigue modelling)
  time_since_session_start_ms: int  -- elapsed time (for fatigue modelling)
  skipped_then_returned: boolean    -- flagged and came back
  scroll_to_bottom: boolean | null  -- for passage-based items, did they read the full stimulus
}
```

### 9.2 Guessing Detection

Detects responses that are likely guesses rather than genuine attempts.

```
guess_probability(response):
  time_factor = sigmoid_low(time_to_answer_ms, expected_time * 0.25)
       -- very fast responses score high (< 25% of expected time)
  accuracy_factor = if incorrect: 0.6 else: 0.2
       -- incorrect answers more likely to be guesses
  change_factor = if answer_changes == 0 AND time_factor > 0.7: 0.8 else: 0.3
       -- no deliberation + fast = likely guess
  pattern_factor = check_sequential_pattern(recent_responses)
       -- e.g., all "A" or alternating pattern

  guess_score = weighted_average(time_factor, accuracy_factor, change_factor, pattern_factor)
  return guess_score  -- 0.0 = certainly genuine, 1.0 = certainly guessing
```

**Usage:** Responses with `guess_score > 0.7` are down-weighted in mastery calculation. Persistent guessing (>40% of responses in a session) triggers a "take a break" nudge and is flagged in teacher reports.

### 9.3 Fatigue Detection

Models declining performance as a function of session duration and item count.

```
fatigue_score(session, current_position):
  baseline_accuracy = accuracy(items[0:5])        -- first 5 items
  recent_accuracy = accuracy(items[-5:])           -- last 5 items
  accuracy_drop = max(0, baseline_accuracy - recent_accuracy)

  time_factor = min(1.0, time_since_start_ms / fatigue_threshold_ms)
       -- fatigue_threshold_ms is age-adjusted: younger students fatigue faster
       -- Year 3: 20 min, Year 5: 30 min, Year 7: 40 min, Year 9: 50 min

  speed_change = avg_time_recent / avg_time_early
       -- ratio > 1.5 suggests slowing down (fatigue) or < 0.5 rushing (disengagement)

  fatigue = 0.4 * accuracy_drop + 0.3 * time_factor + 0.3 * normalise(speed_change)
  return fatigue  -- 0.0 = fresh, 1.0 = severely fatigued
```

**Usage:** When `fatigue > 0.7` during a practice session, the system suggests a break. In exam mode, fatigue is recorded but does not interrupt (to simulate real exam conditions). Fatigue data informs recommended session lengths in the orchestration layer.

### 9.4 Persistence Scoring

Measures a student's willingness to engage with difficult material.

```
persistence_score(student, window_days=30):
  hard_items_attempted = count(responses where item.difficulty > student.mastery + 0.2)
  hard_items_available = count(items offered where difficulty > mastery + 0.2)
  attempt_rate = hard_items_attempted / hard_items_available

  skip_rate = count(skipped items) / count(total items offered)
  retry_rate = count(items where student returned after skip) / count(skipped items)

  session_completion = count(completed sessions) / count(started sessions)

  persistence = 0.3 * attempt_rate + 0.2 * (1 - skip_rate) + 0.2 * retry_rate + 0.3 * session_completion
  return persistence  -- 0.0 = avoidant, 1.0 = highly persistent
```

**Usage:** Low persistence triggers gentler difficulty progression and more encouragement. High persistence enables the stretch intelligence layer (§13) to push harder content.

### 9.5 Cognitive Load Estimation

Estimates whether a student is overwhelmed by the current difficulty level.

```
cognitive_load(session_window):
  error_burst = count(consecutive_incorrect >= 3) / total_items_in_window
  time_inflation = avg(time_to_answer) / expected_time
       -- ratio > 2.0 suggests struggling
  answer_change_rate = avg(answer_changes) per item
       -- high change rate suggests uncertainty

  load = 0.4 * error_burst + 0.35 * min(1.0, time_inflation / 3.0) + 0.25 * min(1.0, answer_change_rate / 3.0)
  return load  -- 0.0 = comfortable, 1.0 = overloaded
```

**Usage:** When `cognitive_load > 0.8` in SkillEngine, difficulty is reduced by one band. The RepairEngine (§11) uses cognitive load to pace scaffolding — if load is high, it slows down and adds more intermediate steps.

### 9.6 Aggregated Behaviour Profile

Per student, the system maintains a rolling behaviour profile:

```
behaviour_profile {
  student_id: uuid
  tenant_id: uuid
  avg_guess_rate: float             -- across last 30 days
  avg_fatigue_onset_minutes: int    -- when fatigue typically kicks in
  persistence_score: float          -- rolling 30-day score
  avg_cognitive_load_comfort: float -- difficulty level where load stays < 0.5
  time_pressure_sensitivity: float  -- performance drop under timed vs untimed conditions
  session_length_sweet_spot: int    -- optimal session duration in minutes
  data_points: int                  -- total sessions contributing to this profile
  computed_at: timestamptz
  updated_at: timestamptz
}
```

**Default values (new student with <5 sessions):**

| Field                        | Default                                                    | Source                         |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------ |
| `avg_guess_rate`             | 0.1                                                        | Conservative assumption        |
| `avg_fatigue_onset_minutes`  | Year-level based: Y1–3: 15, Y4–6: 20, Y7–9: 30, Y10–12: 40 | Pedagogical research           |
| `persistence_score`          | 0.5                                                        | Neutral                        |
| `avg_cognitive_load_comfort` | 0.4 (Developing band midpoint)                             | Year-level expected difficulty |
| `time_pressure_sensitivity`  | 0.3                                                        | Mild assumed sensitivity       |
| `session_length_sweet_spot`  | Same as `avg_fatigue_onset_minutes` default                | Matches fatigue threshold      |

Defaults are used until `data_points ≥ 5`. Between 5 and 15 data points, computed values are blended with defaults: `value = (data_points / 15) * computed + (1 - data_points / 15) * default`. After 15 data points, only computed values are used.

**Staleness rules:**

- `computed_at` is updated after every session that contributes new behavioural data.
- If `computed_at` is older than 30 days, the profile is considered **stale**. Stale profiles fall back to defaults blended with the last computed values (50/50).
- The orchestration layer (§16) checks `computed_at` before using behaviour-derived values like `session_length_sweet_spot`. If stale, it uses the default for the student's year level.

---

## 10. Causal Intelligence (Layer 3) — NEW

This layer moves beyond "what is weak" to "why it is weak." It traverses the skill dependency graph to identify root causes and classifies specific misconceptions.

### 10.1 Skill Dependency Graph

The skill graph (§5.1) encodes prerequisite relationships as a directed acyclic graph (DAG). Each edge carries a dependency strength:

```
skill_dependency {
  skill_id: uuid                    -- the dependent skill
  prerequisite_id: uuid             -- the skill it depends on
  strength: float                   -- 0.0–1.0, how critical the prerequisite is
  dependency_type: enum             -- required | supportive | enriching
}
```

- **required** — Cannot master the dependent skill without this prerequisite (strength ≥ 0.8).
- **supportive** — Helps with the dependent skill but is not strictly necessary (strength 0.4–0.7).
- **enriching** — Provides additional depth/context (strength < 0.4).

### 10.2 Root Cause Identification

When a student has low mastery on a skill, the system traverses the dependency graph downward to find the deepest unmastered prerequisite.

```
find_root_causes(student, weak_skill, depth=0, max_depth=5):
  if depth >= max_depth: return [weak_skill]

  prerequisites = get_prerequisites(weak_skill, type=required|supportive)
  root_causes = []

  for prereq in prerequisites:
    prereq_mastery = get_mastery(student, prereq)
    if prereq_mastery < mastery_threshold:
      -- this prerequisite is also weak; go deeper
      deeper = find_root_causes(student, prereq, depth+1)
      root_causes.extend(deeper)

  if root_causes is empty:
    -- this skill IS the root cause (prerequisites are fine, this skill itself is the problem)
    return [weak_skill]

  return deduplicate(root_causes)
```

**Example:** Student struggles with "solving linear equations" (mastery: 0.3).

- Prerequisite "inverse operations" → mastery: 0.4 → go deeper.
- Prerequisite "additive inverse" → mastery: 0.35 → go deeper.
- Prerequisite "number line understanding" → mastery: 0.8 → OK, stop.
- Prerequisite "subtraction fluency" → mastery: 0.7 → OK, stop.
- Root cause identified: "additive inverse" is the deepest unmastered prerequisite.

The system recommends repairing "additive inverse" before continuing work on "solving linear equations."

### 10.3 Misconception Classification

Misconceptions are specific, named reasoning errors that produce predictable wrong answer patterns. They are stored as a first-class entity:

```
misconception {
  id: uuid
  name: string                      -- e.g., "fraction_addition_add_denominators"
  description: text                 -- "Student adds denominators when adding fractions
                                    --  (e.g., 1/3 + 1/4 = 2/7 instead of 7/12)"
  category: enum                    -- conceptual | procedural | transfer | careless | guessing
  skill_ids: uuid[]                 -- skills affected by this misconception
  detection_rules: jsonb            -- how to detect this misconception from response data
  severity: enum                    -- minor | moderate | critical
  repair_sequence_id: uuid | null   -- linked concept repair sequence
  year_levels: int[]                -- typically observed at these levels
}
```

#### 10.3.1 Misconception Taxonomy

Every misconception is classified into one of five categories. The category determines both the detection strategy and the repair approach.

| Category       | Definition                                                                       | Detection Signal                                                                                                                              | Repair Strategy                                                                                                      | Example                                                             |
| -------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Conceptual** | Fundamental misunderstanding of a concept's meaning                              | Consistent selection of distractors matching a specific wrong mental model                                                                    | Visual explanation → guided practice → mastery check (full repair sequence)                                          | "Fractions are two separate whole numbers" (1/3 + 1/4 = 2/7)        |
| **Procedural** | Correct concept understanding but incorrect execution steps                      | Correct approach identified from partial work or time patterns, but wrong final answer; errors cluster on multi-step items                    | Step-by-step breakdown with worked examples; no conceptual re-teaching needed                                        | Forgetting to "carry" when adding multi-digit numbers               |
| **Transfer**   | Correct application in one context, incorrect application in a different context | High mastery on Skill A, low mastery on Skill B where B requires applying A in a new form; cross-pathway evidence (§17)                       | Bridging exercises that explicitly connect the familiar context to the new context                                   | Can compute 3/4 of 12 but cannot solve "what fraction of 16 is 12?" |
| **Careless**   | Knows the correct method but makes sporadic errors under speed or fatigue        | Errors are inconsistent (not pattern-matching to a specific wrong model); accuracy drops correlate with fatigue score (§9.3) or time pressure | Not a repair candidate; addressed by behaviour nudges (slow down, check work) and fatigue management                 | Misreading "+" as "×" once in 10 items                              |
| **Guessing**   | No genuine attempt; response is random or pattern-based                          | High guess probability score (§9.2) on the relevant items                                                                                     | Not a repair candidate; addressed by engagement intervention (difficulty reduction, encouragement, break suggestion) | Selecting "C" for every MCQ in rapid succession                     |

**Integration with other layers:**

- **Causal Intelligence (§10.2):** Only `conceptual`, `procedural`, and `transfer` misconceptions generate root-cause entries and repair queue items. `Careless` and `guessing` are handled by the Behaviour layer (§9) and do not enter the causal map.
- **Recommendation Engine (§16):** Misconception category determines the recommendation type — a `conceptual` misconception generates a repair sequence recommendation, while a `transfer` misconception generates a cross-context practice recommendation.
- **Content Intelligence (§15):** Items that frequently trigger `careless` misclassifications (i.e., the distractor rationale maps to a conceptual misconception but the error pattern looks careless) are flagged for review — the item may be ambiguous.

**Detection methods:**

1. **Distractor mapping** — Items with `distractor_rationale` (§5.2) map specific wrong answers to specific misconceptions. If a student selects distractor B on three fraction addition items and B corresponds to "add_denominators" misconception, the system flags it.

2. **Pattern matching** — For numeric entry items, the system checks if the wrong answer matches a known misconception formula:

```
detect_misconception_from_answer(item, student_answer):
  for each misconception in item.skill.misconception_ids:
    expected_wrong = apply_misconception_formula(misconception, item.parameters)
    if student_answer == expected_wrong:
      return misconception
  return null
```

3. **Statistical clustering** — When a student consistently fails items tagged with the same skill but passes items tagged with related skills, the system infers a skill-specific misconception even without explicit distractor data.

### 10.4 Misconception Record

When a misconception is detected with sufficient confidence:

```
student_misconception {
  id: uuid
  student_id: uuid
  tenant_id: uuid
  misconception_id: fk
  detected_at: timestamptz
  evidence: jsonb                   -- item_ids, responses, detection method
  confidence: float                 -- 0.0–1.0
  status: enum                      -- active | suspected | repairing | resolved | recurred
  repair_attempts: int
  resolved_at: timestamptz | null
  created_at: timestamptz
  updated_at: timestamptz
}
```

**Confidence thresholds:**

- `confidence ≥ 0.7` — Misconception is flagged as **active** and queued for repair.
- `0.4 ≤ confidence < 0.7` — Misconception is flagged as **suspected**; the diagnostic engine probes with targeted items to confirm or dismiss.
- `confidence < 0.4` — Not flagged; monitoring continues.

### 10.5 Causal Summary Output

The causal layer produces a per-student causal map:

```
causal_map(student):
  return {
    root_cause_skills: [             -- skills at the bottom of dependency chains
      { skill_id, mastery, affected_skills: [...], priority }
    ],
    active_misconceptions: [
      { misconception_id, confidence, affected_skills: [...], severity }
    ],
    repair_queue: [                  -- ordered by impact (how many downstream skills are affected)
      { target: skill_id | misconception_id, type: "root_cause" | "misconception", impact_score }
    ]
  }
```

---

## 11. Concept Repair Engine (Layer 4) — NEW

This layer automatically transitions students from assessment into conceptual learning when misconceptions or root-cause gaps are identified. It is the bridge between "we know what's wrong" and "here's how to fix it."

### 11.0 Repair Trigger Conditions

The system evaluates repair triggers after every session (as part of the intelligence pipeline §7.2, step 4). A repair sequence is queued when any of the following conditions are met:

| Trigger                            | Condition                                                                                                                               | Priority | What is Repaired                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| **Confirmed misconception**        | `student_misconception.confidence ≥ 0.7` AND `category` is `conceptual`, `procedural`, or `transfer`                                    | Critical | The specific misconception                                         |
| **Persistent low mastery**         | `mastery < 0.4` AND `total_attempts ≥ 8` AND `velocity ≤ 0` (not improving despite practice)                                            | High     | Root cause skill (via §10.2 traversal)                             |
| **Low confidence + high attempts** | `confidence < 0.4` AND `total_attempts ≥ 10` (system is uncertain despite ample data — suggests inconsistent understanding)             | High     | The skill itself, with diagnostic probing                          |
| **Repeated incorrect pattern**     | Same distractor selected ≥ 3 times across different items for the same skill (even if misconception confidence has not yet reached 0.7) | Medium   | Suspected misconception (probed first, then repaired if confirmed) |
| **Post-repair recurrence**         | `student_misconception.status = recurred` (misconception was resolved but re-emerged)                                                   | Critical | Re-entry into repair with deeper prerequisite review               |
| **Root cause identified**          | Causal layer (§10.2) identifies a root cause skill with `mastery < threshold`                                                           | High     | The root cause skill                                               |

**What does NOT trigger repair:**

- `Careless` and `guessing` category misconceptions — handled by behaviour nudges (§9), not repair sequences.
- Skills with `total_attempts < 5` — insufficient data; the system queues a diagnostic session instead.
- Skills already in an active repair sequence — prevents double-queuing.

**Trigger evaluation pseudocode:**

```
evaluate_repair_triggers(student, session):
  new_repairs = []

  -- Check all skills touched in this session
  for skill in session.skills_touched:
    m = mastery(student, skill)
    c = confidence(student, skill)
    attempts = total_attempts(student, skill)
    v = velocity(student, skill)

    -- Trigger: persistent low mastery
    if m < 0.4 AND attempts >= 8 AND v <= 0:
      root = find_root_causes(student, skill)
      for r in root:
        if not already_in_repair(student, r):
          new_repairs.append({ target: r, type: "root_cause", priority: "high" })

    -- Trigger: low confidence despite data
    if c < 0.4 AND attempts >= 10:
      if not already_in_repair(student, skill):
        new_repairs.append({ target: skill, type: "uncertain_skill", priority: "high" })

  -- Check misconceptions flagged by causal layer
  for mc in causal.newly_detected_misconceptions(session):
    if mc.confidence >= 0.7 AND mc.category in [conceptual, procedural, transfer]:
      new_repairs.append({ target: mc, type: "misconception", priority: "critical" })

  -- Respect guardrail: max 3 active repairs
  active_count = count(student.repairs where status = in_progress)
  available_slots = 3 - active_count
  return new_repairs[:available_slots]  -- queue overflow repairs for later
```

### 11.1 Repair Sequence Schema

```
repair_sequence {
  id: uuid
  target_type: enum                 -- misconception | root_cause_skill
  target_id: uuid                   -- misconception_id or skill_id
  display_name: string              -- e.g., "Understanding Part-Whole Relationships"
  year_level: int[]
  estimated_duration_minutes: int
  stages: [
    {
      stage_type: enum              -- prerequisite_review | visual_explanation |
                                    --   guided_practice | independent_practice | mastery_check
      content: jsonb                -- stage-specific content (see below)
      success_criteria: jsonb       -- what counts as passing this stage
      fallback_stage_id: uuid | null -- if student fails, go here instead
    }
  ]
  mastery_check_items: uuid[]       -- items used for the final mastery check
  success_threshold: float          -- mastery check pass mark (default: 0.8)
}
```

### 11.2 Stage Types

**prerequisite_review** — Presents 2–3 items targeting prerequisite skills. If the student fails these, the system redirects to a repair sequence for the prerequisite first (recursive repair).

**visual_explanation** — Rich instructional content:

- Worked examples with step-by-step annotations.
- Visual models (bar models, number lines, area diagrams) rendered as interactive components.
- "Common mistake" callouts — "Many students think X, but actually Y because Z."
- Content is stored as structured JSON and rendered by the client. No video dependencies in MVP.

**guided_practice** — Items with immediate hints available. The student attempts the item; if incorrect, a stepped hint sequence is revealed (hint 1 → hint 2 → full worked solution). Mastery credit is reduced for hint-assisted responses.

**independent_practice** — Standard practice items at target difficulty, with feedback after each item but no hints. This stage confirms the student can apply the repaired understanding independently.

**mastery_check** — A short set of items (3–5) at or slightly above the target skill's difficulty. The student must achieve `success_threshold` to mark the repair as complete.

### 11.3 Scaffolding Logic

The RepairEngine (§3.2.5) controls difficulty progression within a repair sequence:

```
repair_difficulty_progression(student, repair_sequence):
  comfort_level = student.behaviour_profile.avg_cognitive_load_comfort
  start_difficulty = max(0.1, comfort_level - 0.2)    -- below comfort zone
  target_difficulty = skill.difficulty_range.midpoint

  for each stage in repair_sequence.stages:
    if stage.type == "prerequisite_review":
      difficulty = start_difficulty
    elif stage.type == "guided_practice":
      difficulty = lerp(start_difficulty, target_difficulty, 0.5)
    elif stage.type == "independent_practice":
      difficulty = target_difficulty
    elif stage.type == "mastery_check":
      difficulty = min(target_difficulty + 0.1, 1.0)

    -- within each stage, micro-adjust based on in-stage performance:
    if consecutive_correct >= 2: difficulty += 0.05
    if consecutive_incorrect >= 2: difficulty -= 0.1
    if cognitive_load > 0.7: difficulty -= 0.15, add_extra_hint_stage()
```

### 11.4 Repair Lifecycle

```
repair_record {
  id: uuid
  student_id: uuid
  tenant_id: uuid
  repair_sequence_id: fk
  misconception_id: fk | null
  root_cause_skill_id: fk | null
  status: enum                      -- queued | in_progress | completed | failed | deferred
  started_at: timestamptz | null
  completed_at: timestamptz | null
  stages_completed: int
  total_stages: int
  mastery_check_score: float | null
  follow_up_assessment_at: timestamptz | null
  follow_up_result: enum | null     -- passed | regressed | pending
  created_at: timestamptz
  updated_at: timestamptz
}
```

**State transitions:**

| From          | To                 | Trigger                                                                                | Side Effects                                                                                                                                                 |
| ------------- | ------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `queued`      | `in_progress`      | Student starts the repair session                                                      | `started_at` set; RepairEngine initialised                                                                                                                   |
| `queued`      | `deferred`         | Max active repairs reached (3); or parent/teacher defers                               | Remains in queue; re-evaluated on next plan generation                                                                                                       |
| `deferred`    | `queued`           | Active repair slot opens; or orchestrator re-queues                                    | Priority re-evaluated                                                                                                                                        |
| `in_progress` | `completed`        | Mastery check score ≥ `success_threshold`                                              | Misconception → `resolved`; mastery re-evaluated; `follow_up_assessment_at` set to +7 days; downstream skills re-assessed via `traverse_downstream` (§5.1.4) |
| `in_progress` | `failed`           | Mastery check score < threshold after max attempts (default: 2 full sequence attempts) | Misconception → `failed`; teacher intervention alert generated (§14.2); deeper prerequisite repair queued if prerequisites exist                             |
| `in_progress` | `queued`           | Student abandons mid-repair (session interrupted >24h)                                 | Progress preserved; `stages_completed` retained; resumes from last completed stage                                                                           |
| `completed`   | `completed` (self) | Follow-up assessment at +7 days: student passes                                        | `follow_up_result` → `passed`; misconception confirmed resolved                                                                                              |
| `completed`   | — (new record)     | Follow-up assessment: student fails                                                    | Misconception → `recurred`; new repair_record created with `priority = critical`; original record unchanged                                                  |

**Invariants:**

- A student cannot have more than 3 repairs in `in_progress` state simultaneously.
- **At most one open `repair_record` per `(student_id, misconception_id)` pair** where `status IN ('queued','in_progress')`. A second detection of the same misconception while a repair is open is a no-op (the existing record's evidence/confidence is updated instead). Enforced by database partial unique index.
- **At most one open `repair_record` per `(student_id, root_cause_skill_id)` pair** where `status IN ('queued','in_progress')` and `misconception_id IS NULL`. Prevents double-queueing of the same root-cause repair. Enforced by database partial unique index.
- **L4 evaluation is serialised per student via an advisory lock.** When the `pipeline.repair_queue` job evaluates a student, it acquires `pg_advisory_xact_lock(hashtext('repair:' || student_id))`. Two sessions completing in quick succession for the same student evaluate serially, so the "max 3 active" check is race-free.
- A `deferred` repair is automatically re-queued when an `in_progress` repair completes or fails.
- `failed` is a terminal state for that repair_record; any retry creates a new record linked to the same misconception.

---

## 12. Predictive Intelligence (Layer 5) — EXPANDED

This layer forecasts future performance and timelines based on current state and historical trends.

### 12.1 Exam Readiness Prediction

```
predict_exam_readiness(student, pathway, exam_date):
  current_readiness = pathway_readiness(student, pathway)  -- from §10.3 of cross-pathway intel

  -- project mastery forward to exam date using velocity
  projected_skills = {}
  for each skill in pathway.required_skills:
    current = mastery(student, skill)
    velocity = velocity(student, skill)
    days_remaining = (exam_date - today).days
    projected = min(1.0, current + velocity * days_remaining)
    -- apply retention decay for skills not recently practised
    projected = projected * retention_factor(skill, student, days_remaining)
    projected_skills[skill] = projected

  projected_readiness = weighted_sum(projected_skills, blueprint_weights)

  return {
    current_readiness_score: current_readiness.score,
    projected_readiness_score: projected_readiness,
    confidence_interval: compute_ci(projected_readiness, data_points),
    estimated_score_band: map_to_band(projected_readiness, pathway.scoring_rules),
    on_track: projected_readiness >= pathway.target_threshold,
    gap_skills: skills where projected < skill_threshold,
    recommended_focus_hours: estimate_hours_to_close_gaps(gap_skills, velocity)
  }
```

### 12.2 Performance Forecasting

For any given skill, predict the mastery level at a future date:

```
forecast_mastery(student, skill, target_date):
  current = mastery(student, skill)
  velocity = velocity(student, skill)
  days = (target_date - today).days
  half_life = retention_half_life(student, skill)

  -- three scenarios
  optimistic = current + velocity * days * 1.3        -- continued improvement
  baseline = current + velocity * days                -- current trajectory
  pessimistic = current * exp(-0.693 * days / half_life)  -- no practice, pure decay

  return {
    optimistic: clamp(optimistic, 0, 1),
    baseline: clamp(baseline, 0, 1),
    pessimistic: clamp(pessimistic, 0, 1),
    confidence: statistical_confidence(student, skill)
  }
```

### 12.3 Mastery Timeline Prediction

Estimates when a student will reach a target mastery level for a skill:

```
predict_mastery_date(student, skill, target_mastery):
  current = mastery(student, skill)
  if current >= target_mastery: return today

  velocity = velocity(student, skill)
  if velocity <= 0:
    return null  -- cannot predict; skill is stagnant or declining

  days_needed = (target_mastery - current) / velocity
  -- adjust for diminishing returns near mastery ceiling
  days_adjusted = days_needed * (1 + 0.5 * current)  -- harder to improve when already high

  return today + days_adjusted
```

### 12.4 Prediction Guardrails

1. **Minimum data threshold** — Predictions require ≥5 data points and ≥7 days of history. Below this, display "insufficient data" rather than unreliable forecasts.
2. **Confidence banding** — All predictions display confidence intervals. Wide intervals are presented with appropriate caveats: "Based on limited data, roughly [band]."
3. **Recency weighting** — Velocity from the last 14 days is weighted 2x vs. older data.
4. **No false precision** — Score band predictions use broad bands (e.g., "Band 6–7"), never exact scores.
5. **Decay assumption** — If velocity is zero, pessimistic projections assume practice stops and retention decays. This creates urgency without false optimism.

---

## 13. Stretch Intelligence (Layer 6) — NEW

This layer determines when a student is ready to be pushed beyond their current level — into harder content, above-grade material, or competition pathways.

### 13.1 Stretch Readiness Criteria

```
evaluate_stretch(student, skill):
  mastery = mastery(student, skill)
  velocity = velocity(student, skill)
  persistence = student.behaviour_profile.persistence_score
  confidence = confidence(student, skill)
  load = student.behaviour_profile.avg_cognitive_load_comfort

  stretch_ready = (
    mastery >= 0.85 AND
    velocity >= 0.0 AND        -- not declining
    persistence >= 0.6 AND     -- willing to engage with hard material
    confidence >= 0.7 AND      -- we're sure about the mastery estimate
    load >= 0.6                -- can handle material above their comfort zone
  )

  return {
    ready: stretch_ready,
    stretch_type: determine_stretch_type(student, skill),
    suggested_difficulty: mastery + 0.15,  -- one band above current
    suggested_pathway: find_stretch_pathway(skill)  -- e.g., Olympiad track
  }
```

### 13.2 Stretch Types

| Type                       | Trigger                                            | Action                                         |
| -------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| **Difficulty escalation**  | Mastery ≥ 0.85, same skill                         | Serve items 1–2 difficulty bands above current |
| **Above-grade content**    | Mastery ≥ 0.90 on all strands in a domain          | Offer year N+1 content for that domain         |
| **Competition pathway**    | Mastery ≥ 0.90 + high persistence + low guess rate | Suggest Olympiad/AMC pathway enrolment         |
| **Cross-domain challenge** | Multiple domains at Advanced+                      | Serve items requiring multi-domain synthesis   |

### 13.3 Stretch Guardrails

- Stretch is never forced; it is offered as optional "challenge" content.
- If a student's performance drops significantly on stretch content (accuracy < 40% over 5 items), the system reverts to standard difficulty and does not re-offer stretch for that skill for 7 days.
- Parents can disable stretch recommendations via preferences.
- Stretch performance does not negatively impact the student's mastery score — it is tracked separately as `stretch_mastery`.

---

## 14. Teacher Intervention Intelligence (Layer 7) — NEW

This layer provides teachers and tutors with automated insights for class management, targeted intervention, and assignment generation.

### 14.1 Automatic Student Grouping

The system clusters students in a class by learning profile for small-group instruction:

```
auto_group(class, target_skill_or_domain, max_groups=4):
  students = class.students
  features_per_student = [
    mastery(s, target),
    velocity(s, target),
    primary_misconceptions(s, target),
    behaviour_profile(s).persistence,
    behaviour_profile(s).cognitive_load_comfort
  ]

  -- k-means clustering on feature vectors
  groups = cluster(features_per_student, k=max_groups)

  -- label each group
  for group in groups:
    group.label = generate_label(group)
       -- e.g., "Needs prerequisite repair", "Ready for independent practice",
       --        "Misconception: add_denominators", "Ready for stretch"
    group.suggested_activity = map_group_to_activity(group)
    group.suggested_items = select_items_for_group(group)

  return groups
```

**Output example:**

- Group A (5 students): "Prerequisite gap — place value." Suggested: Repair sequence for place value.
- Group B (8 students): "Active misconception — fraction addition." Suggested: Guided practice targeting add_denominators misconception.
- Group C (7 students): "On track — standard practice." Suggested: Independent practice, current difficulty.
- Group D (4 students): "Ready for stretch." Suggested: Above-grade items or challenge mode.

### 14.2 Intervention Recommendations

When the system detects a student needing teacher attention:

```
intervention_alert {
  id: uuid
  student_id: uuid
  tenant_id: uuid
  class_id: uuid | null
  teacher_id: uuid
  alert_type: enum                  -- declining_performance | persistent_misconception |
                                    --   high_fatigue | low_persistence | repair_failure |
                                    --   exceptional_progress
  severity: enum                    -- info | warning | urgent
  status: enum                      -- active | acknowledged | dismissed | resolved
  detail: jsonb                     -- specific data supporting the alert
  suggested_action: text            -- plain language recommendation
  explanation: jsonb                -- structured explanation (§7.4.1)
  created_at: timestamptz
  updated_at: timestamptz
  acknowledged_at: timestamptz | null
  resolved_at: timestamptz | null
}
```

**Trigger rules:**

| Alert Type               | Condition                                                           | Severity        |
| ------------------------ | ------------------------------------------------------------------- | --------------- |
| Declining performance    | Velocity < -0.02 for >14 days on ≥3 skills                          | warning         |
| Persistent misconception | Misconception `status = active` for >21 days or `status = recurred` | warning         |
| Repair failure           | Misconception repair failed twice                                   | urgent          |
| High fatigue             | Avg fatigue onset < 15 min over last 5 sessions                     | info            |
| Low persistence          | Persistence score < 0.3 over 30 days                                | warning         |
| Exceptional progress     | Velocity > +0.05 across ≥3 skills for 14+ days                      | info (positive) |

### 14.3 Targeted Assignment Generation

Teachers can request auto-generated assignments:

```
generate_assignment(class_or_group, parameters):
  -- parameters: { target_skills, difficulty_range, item_count, time_limit, mode }

  -- if no target_skills specified, use the group's primary gap skills
  if not parameters.target_skills:
    parameters.target_skills = identify_common_gaps(class_or_group)

  items = content_service.select(
    skills = parameters.target_skills,
    difficulty = parameters.difficulty_range or group_optimal_difficulty(class_or_group),
    count = parameters.item_count or 15,
    exclude_recently_seen = last_14_days,
    prefer_high_discrimination = true
  )

  return assignment {
    items, time_limit, mode,
    rationale: "Targeting [skills] because [X% of group below threshold]"
  }
```

---

## 15. Content Intelligence Loop (Layer 8) — NEW

This layer uses aggregate student performance data to continuously improve the content library. It is the system's feedback mechanism for content quality.

### 15.1 Item Difficulty Recalibration

Authored difficulty values are initial estimates. The system recalibrates difficulty based on observed performance:

```
recalibrate_difficulty(item):
  responses = get_all_responses(item, min_count=30)
  observed_p = count(correct) / count(total)

  -- map observed p-value to normalised difficulty
  -- (low p-value = hard, high p-value = easy)
  new_difficulty = 1.0 - observed_p

  -- smooth update (don't overcorrect from small samples)
  alpha = min(0.5, count(total) / 200)    -- weight increases with more data
  item.difficulty = (1 - alpha) * item.difficulty + alpha * new_difficulty

  -- flag items with large discrepancy for human review
  if abs(item.difficulty - original_difficulty) > 0.3:
    flag_for_review(item, reason="difficulty_drift")
```

### 15.2 Discrimination Updates

Discrimination measures how well an item differentiates between high- and low-ability students:

```
update_discrimination(item):
  responses = get_all_responses(item, min_count=50)

  -- point-biserial correlation between item score and total session score
  item_scores = [1 if correct else 0 for r in responses]
  session_scores = [r.session.total_score for r in responses]
  discrimination = point_biserial(item_scores, session_scores)

  item.discrimination = discrimination

  -- flag low-discrimination items
  if discrimination < 0.15:
    flag_for_review(item, reason="low_discrimination")
  if discrimination < 0.0:
    deactivate(item, reason="negative_discrimination")
```

### 15.3 Content Lifecycle Optimisation

Items move through a lifecycle:

```
Item Lifecycle: draft → review → active → monitored → retired

Transitions:
  draft → review:     author submits, all required fields populated
  review → active:    reviewer approves, passes quality checks
  active → monitored: after 30+ responses, if difficulty_drift or low_discrimination flagged
  monitored → active: human reviewer confirms item is acceptable
  monitored → retired: human reviewer retires item
  active → retired:   item exposure count exceeds threshold (prevents overuse)
                      or discrimination remains < 0.15 after recalibration
```

### 15.4 Feedback Loops from Student Data

| Signal                                             | Action                                                        |
| -------------------------------------------------- | ------------------------------------------------------------- |
| Item p-value drifts >0.3 from authored difficulty  | Recalibrate + flag for review                                 |
| Discrimination < 0.15 after 50+ responses          | Flag for review; exclude from adaptive/diagnostic use         |
| Negative discrimination                            | Auto-deactivate; notify content team                          |
| Specific distractor selected >60% of the time      | Flag distractor as potentially confusing or stem as ambiguous |
| Time-to-answer consistently >3x expected           | Flag as potentially unclear or overly complex                 |
| High guess rate on specific item                   | Flag as potentially too easy or offering obvious elimination  |
| Misconception detection rate from item distractors | Validates or updates misconception mappings                   |

### 15.5 Content Coverage Analytics

The system identifies gaps in the content library:

```
content_coverage_report(exam_family, year_level):
  blueprint = get_blueprint(exam_family, year_level)
  for each skill_target in blueprint.skill_targets:
    available = count(active items matching skill, difficulty_band, year_level)
    required = skill_target.min_items
    coverage = available / required
    if coverage < 1.0:
      flag_content_gap(skill, difficulty_band, shortfall = required - available)

  return gaps sorted by priority (pathway importance * shortfall)
```

### 15.6 IRT Compatibility Path

The content intelligence loop is designed to accumulate the data needed for a future transition to Item Response Theory (IRT) models (Phase 3, §23). Current recalibration uses classical test theory (p-value, point-biserial). The following data is collected now to enable IRT later:

**Data collected per item (ongoing):**

- Full response vector: `(student_id, item_id, correct, time_to_answer, ability_estimate_at_time)` — stored in `session_response` + `response_telemetry`.
- Minimum 100 responses per item before IRT calibration is meaningful.

**IRT model target (Phase 3):** 2-Parameter Logistic (2PL):

```
P(correct | ability, item) = 1 / (1 + exp(-a * (ability - b)))

  a = discrimination parameter (replaces point-biserial)
  b = difficulty parameter (replaces p-value derived difficulty)
```

**Migration strategy:**

1. When an item reaches 200+ responses, run 2PL calibration offline.
2. Store IRT parameters alongside classical parameters: `item.irt_a`, `item.irt_b`, `item.irt_calibrated_at`.
3. Feature-flag switches scoring from classical to IRT per exam_family.
4. Foundation Intelligence (§8) switches from weighted-average mastery to ability estimation via maximum likelihood when IRT is enabled.

No schema changes are needed — `difficulty` and `discrimination` fields already exist. IRT simply provides more accurate values for those same fields.

---

## 16. Learning Path Orchestration (Layer 9) — NEW

This is the capstone intelligence layer. It synthesises outputs from all other layers into a coherent, long-term learning plan for each student.

### 16.1 Learning Plan Schema

```
learning_plan {
  id: uuid
  student_id: uuid
  tenant_id: uuid
  plan_type: enum                   -- weekly | exam_countdown | long_term | transition
  status: enum                      -- active | superseded | expired
  created_at: timestamptz
  updated_at: timestamptz
  valid_until: timestamptz
  sessions: [
    {
      order: int
      week: int | null              -- for multi-week plans: which week (1-indexed)
      mode: enum                    -- practice | diagnostic | repair | exam | challenge
      target_skills: uuid[]
      target_misconceptions: uuid[] | null
      difficulty_range: [float, float]
      estimated_duration_min: int
      rationale: text               -- human-readable explanation (§7.4)
      priority: enum                -- critical | high | medium | low
      source_layer: string          -- which intelligence layer generated this
      status: enum                  -- pending | completed | skipped
    }
  ]
  constraints_applied: jsonb        -- time budget, pathway priorities, parent overrides
  milestones: jsonb | null          -- for long-term plans: target mastery levels per week
}
```

When a new plan is generated, the previous plan's status is set to `superseded`. Only one plan per `(student_id, plan_type)` may be `active` at a time. Expired plans (`valid_until < now()`) are set to `expired` by a daily cleanup job.

### 16.2 Weekly Plan Generation

```
generate_weekly_plan(student, available_minutes_per_week):
  -- Gather intelligence from all layers
  causal = causal_layer.get_map(student)
  predictions = predictive_layer.get_forecasts(student)
  stretch = stretch_layer.evaluate_all(student)
  behaviour = behaviour_layer.get_profile(student)
  repairs = repair_engine.get_queue(student)

  -- Priority queue: repair > root cause > declining > low retention > practice > stretch
  queue = PriorityQueue()

  -- 1. Active repairs (highest priority)
  for repair in repairs where status == "queued":
    queue.add(repair_session(repair), priority=CRITICAL)

  -- 2. Root cause skills
  for root in causal.root_cause_skills:
    queue.add(practice_session(root.skill_id, difficulty=below_mastery), priority=HIGH)

  -- 3. Declining skills (negative velocity)
  for skill in student.skills where velocity < -0.01:
    queue.add(practice_session(skill, difficulty=at_mastery), priority=HIGH)

  -- 4. Low retention skills
  for skill in student.skills where retention_estimate < 0.5 and mastery > 0.6:
    queue.add(review_session(skill), priority=MEDIUM)

  -- 5. Pathway gap skills
  for pathway in student.enrolled_pathways:
    for gap in predictions[pathway].gap_skills:
      queue.add(practice_session(gap, difficulty=progressive), priority=MEDIUM)

  -- 6. Stretch opportunities
  for s in stretch where s.ready:
    queue.add(challenge_session(s.skill, s.suggested_difficulty), priority=LOW)

  -- Assemble plan within time budget
  plan = []
  remaining_minutes = available_minutes_per_week
  optimal_session_length = behaviour.session_length_sweet_spot

  while remaining_minutes > 0 and queue.has_items:
    session = queue.pop()
    session.estimated_duration_min = min(optimal_session_length, remaining_minutes)
    plan.append(session)
    remaining_minutes -= session.estimated_duration_min

  -- Interleave domains for variety (no more than 2 consecutive sessions on same domain)
  plan = interleave_domains(plan)

  return plan
```

### 16.3 Exam Countdown Plan

When a student has a known exam date, the orchestrator generates a structured countdown:

```
generate_countdown_plan(student, pathway, exam_date):
  days_remaining = (exam_date - today).days
  predictions = predictive_layer.predict_readiness(student, pathway, exam_date)

  if days_remaining > 60:
    -- Phase: Foundation repair
    focus = causal.root_cause_skills + causal.active_misconceptions
    strategy = "Fix fundamentals; address misconceptions; build prerequisite chain"

  elif days_remaining > 21:
    -- Phase: Targeted practice
    focus = predictions.gap_skills sorted by pathway_weight
    strategy = "Close highest-impact gaps; maintain strong skills with review"

  elif days_remaining > 7:
    -- Phase: Consolidation
    focus = predictions.gap_skills[:3]  -- top 3 gaps only
    strategy = "Focus narrowly; don't introduce new material; build confidence"

  else:
    -- Phase: Confidence building
    focus = student.strongest_skills
    strategy = "Light practice on strengths; full practice exams; rest"

  return countdown_plan {
    phases,
    daily_session_targets,
    practice_exam_schedule: [days_remaining - 14, days_remaining - 7, days_remaining - 3],
    review_schedule: spaced_repetition_dates(high_retention_risk_skills)
  }
```

### 16.4 Pathway Switching Logic

When a student adds or changes pathways, the orchestrator recalculates:

```
on_pathway_change(student, new_pathway):
  -- Assess current skill coverage against new pathway's requirements
  coverage = compute_skill_overlap(student.assessed_skills, new_pathway.required_skills)

  if coverage < 0.3:
    -- Major gap: schedule a diagnostic session first
    queue_diagnostic(student, new_pathway.domains)
    plan_type = "diagnostic_first"

  elif coverage < 0.7:
    -- Moderate gap: blend diagnostic with practice
    gap_skills = new_pathway.required_skills - student.assessed_skills
    queue_targeted_diagnostic(student, gap_skills)
    plan_type = "blended"

  else:
    -- Good coverage: integrate into existing plan
    plan_type = "integrate"

  orchestration.replan(student)
```

#### 16.4.1 Pathway Transition Plans

Common pathway transitions have pre-defined orchestration templates:

| Transition                       | Prerequisite Check                                                                   | Plan Strategy                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| NAPLAN → Selective Entry         | Assess reasoning skills not covered by NAPLAN (abstract reasoning, verbal reasoning) | Diagnostic on reasoning → fill gaps → blended practice                                  |
| Skill Repair → Challenge Mode    | Verify repaired skills via mastery check; confirm persistence ≥ 0.6                  | Gradual difficulty escalation over 2 weeks; monitor for regression                      |
| ICAS → Olympiad                  | Assess non-routine problem-solving skills; check stretch readiness (§13)             | Targeted practice on proof strategies and multi-step problems → competition simulations |
| Singapore Math → NAPLAN Numeracy | Map Singapore MOE skills to Australian Curriculum equivalents                        | Gap analysis on curriculum alignment; focused practice on Australian context items      |

### 16.5 Long-Term Plan Generation

For plans spanning 4+ weeks (e.g., term-long preparation), the orchestrator generates a phased plan with weekly milestones:

```
generate_long_term_plan(student, pathways, duration_weeks, weekly_minutes):
  -- Phase the duration into learning stages
  phases = allocate_phases(duration_weeks):
    diagnostic_phase:  weeks 1–ceil(duration * 0.1)   -- ~10% diagnostic
    repair_phase:      next ceil(duration * 0.25)      -- ~25% repair + foundation
    practice_phase:    next ceil(duration * 0.40)      -- ~40% targeted practice
    consolidation:     next ceil(duration * 0.15)      -- ~15% mixed review + practice exams
    confidence:        remaining weeks                 -- ~10% strengths + light review

  -- Set weekly milestones
  milestones = []
  for week in 1..duration_weeks:
    phase = current_phase(week)
    target_skills = select_skills_for_phase(phase, student, pathways)
    expected_mastery = project_mastery_targets(student, target_skills, week)
    milestones.append({ week, phase, target_skills, expected_mastery })

  -- Generate weekly session templates (detailed plans for weeks 1-2; sketches for later weeks)
  for week in 1..duration_weeks:
    if week <= 2:
      plans[week] = generate_weekly_plan(student, weekly_minutes)  -- full detail
    else:
      plans[week] = sketch_weekly_plan(milestones[week])           -- regenerated in detail when reached

  return long_term_plan { phases, milestones, plans, review_cadence: "weekly" }
```

**Milestone tracking:** At the end of each week, the orchestrator compares actual mastery to milestone targets. If a student is ahead, the plan compresses repair/practice phases and introduces stretch earlier. If behind, the plan extends the current phase and defers consolidation.

### 16.6 Orchestration Guardrails

1. **No more than 3 repair sequences active simultaneously** — Cognitive overload; queue the rest.
2. **At least 20% of plan time is "enjoyment" sessions** — Skills the student is good at, challenge mode, or variety content. Prevents burnout.
3. **Parent/teacher overrides respected** — See §16.6.1 for the override model.
4. **Session length respects fatigue profile** — Never schedules sessions longer than `behaviour.session_length_sweet_spot + 5 min`.
5. **Plans are regenerated** after every session (micro-adjustments) and weekly (full recalculation).

#### 16.6.1 Plan Override Model

Parents and teachers can steer the plan without bypassing the intelligence pipeline. All overrides are recorded as first-class entities the orchestrator consumes on every replan:

```
plan_override {
  id: uuid
  student_id: uuid
  tenant_id: uuid
  actor_id: uuid              -- parent or teacher who created the override
  type: enum                  -- pin_skill | dismiss_recommendation | override_plan_item
  target: jsonb               -- type-specific target (see below)
  expires_at: timestamptz     -- default now() + 14 days
  created_at: timestamptz
}
```

| Type | Target payload | Orchestrator behaviour |
|---|---|---|
| `pin_skill` | `{ skill_id: uuid, priority: "high" | "critical" }` | Skill is included in every plan regeneration at the specified priority until `expires_at`, regardless of Foundation/Causal signals. |
| `dismiss_recommendation` | `{ recommendation_key: string }` where key is the deterministic hash of `(skill_id, mode, rationale_class)` | Any recommendation matching the key is suppressed from plans until `expires_at`. A new recommendation for the same skill under a different rationale class (e.g., repair vs practice) is not blocked. |
| `override_plan_item` | `{ plan_id: uuid, order: int, replacement: LearningPlanItem }` | The specified plan item is replaced verbatim on every regeneration of that plan until `expires_at`. The replacement is treated as pinned and does not itself re-enter the orchestration queue. |

**Default expiry:** 14 days if not specified, per the guardrail philosophy of "intervene, don't override forever." Overrides can be renewed.

**Actor authorisation:** Parents may create overrides only for students linked via `parent_student_link`; teachers only for students in their classes; platform/org admins may create for any student in the tenant. Enforced at the API layer.

**Audit:** Every override creation and expiry writes an entry to `intelligence_audit_log` with `layer='L9_override'` so plan changes remain fully traceable.

**Self-supersession:** Overrides of the same `type` + `target` replace each other — creating a new `pin_skill` for the same `skill_id` extends the expiry and updates priority rather than stacking.

---

# PART III — OPERATIONS

---

## 17. Cross-Pathway Intelligence — ENHANCED

This section defines intelligence that operates across multiple exam pathways simultaneously. It builds on Foundation (§8) and Causal (§10) layers.

### 17.1 Root Cause Convergence

When the same skill node is assessed by multiple pathways, the system identifies convergent weaknesses with increased confidence:

```
cross_pathway_weakness(student, skill):
  evidence = collect(skill_mastery records across all active pathways)
  pathway_count = count(distinct pathways with data for this skill)

  if pathway_count >= 2 AND all(evidence.mastery < threshold):
    -- confirmed cross-pathway gap; boost confidence
    confidence_boost = 0.15 * (pathway_count - 1)
    flag as "confirmed cross-pathway gap"

    -- run causal analysis from EACH pathway's dependency tree
    root_causes = union(
      find_root_causes(student, skill, pathway_A),
      find_root_causes(student, skill, pathway_B)
    )
    -- root causes that appear in multiple pathways are highest priority
    prioritise by cross_pathway_occurrence_count

    -- check for misconceptions detected across pathways
    misconceptions = collect(student_misconceptions affecting skill, all pathways)
    if same misconception detected in 2+ pathway contexts:
      escalate misconception severity to "critical"

    return { root_causes, misconceptions, cross_pathway_confidence }
```

### 17.2 Skill Transfer Modelling — ENHANCED

When a student improves a skill in one pathway context, the system propagates a partial update to related pathways. v4.0 adds context-weighted transfer:

```
on_mastery_update(student, skill, source_pathway, session):
  for each other_pathway where skill is relevant:
    -- base transfer weight
    base_weight = skill_transfer_weight(source_pathway, other_pathway, skill)

    -- context adjustment: transfer is stronger if the item types are similar
    item_similarity = compute_item_type_overlap(source_pathway, other_pathway, skill)
    context_weight = base_weight * (0.5 + 0.5 * item_similarity)

    -- behaviour adjustment: high-confidence, non-guessed responses transfer more
    quality = 1.0 - session.avg_guess_rate
    adjusted_weight = context_weight * quality

    other_mastery = current_mastery(student, skill, other_pathway)
    updated = other_mastery + adjusted_weight * (new_mastery - other_mastery)
    update_mastery(student, skill, other_pathway, updated)
```

Transfer weights remain conservative by default (base: 0.3) and are tuned per skill-pair based on observed correlation data.

### 17.3 Pathway Readiness — ENHANCED

The system computes readiness with predictive and behavioural dimensions:

```
pathway_readiness(student, pathway, target_date=null):
  required_skills = pathway.framework_config.blueprint.skill_targets
  score = 0
  assessed_count = 0

  for each skill in required_skills:
    weight = blueprint_weight(skill)
    m = mastery(student, skill)
    r = retention(student, skill)
    -- if target date given, project mastery forward
    if target_date:
      m = forecast_mastery(student, skill, target_date).baseline
    score += weight * m * r
    if confidence(student, skill) >= 0.5:
      assessed_count += 1

  coverage = assessed_count / count(required_skills)

  -- behavioural readiness: can the student handle exam conditions?
  time_pressure = student.behaviour_profile.time_pressure_sensitivity
  exam_stamina = student.behaviour_profile.avg_fatigue_onset_minutes
  exam_duration = pathway.framework_config.structure.total_duration_minutes
  condition_readiness = (1.0 - time_pressure) * min(1.0, exam_stamina / exam_duration)

  return {
    skill_readiness: score,
    coverage: coverage,
    condition_readiness: condition_readiness,
    composite_readiness: 0.7 * score + 0.2 * coverage + 0.1 * condition_readiness,
    gap_skills: [skills where projected mastery < skill_threshold],
    active_misconceptions: [misconceptions affecting required skills],
    predicted_ready_date: predict_mastery_date(student, composite, target=0.7)
  }
```

---

## 18. Session Modes

| Mode        | Engine                     | Scored                        | Timed                      | Feedback               | Use Case                                     |
| ----------- | -------------------------- | ----------------------------- | -------------------------- | ---------------------- | -------------------------------------------- |
| Exam        | Adaptive or Linear         | Yes                           | Yes (server-authoritative) | Post-session only      | Full practice exam simulation                |
| Practice    | SkillEngine                | No (mastery delta)            | Optional                   | Immediate per-item     | Targeted skill improvement                   |
| Diagnostic  | DiagnosticEngine           | No (proficiency map)          | No                         | Post-session summary   | Initial assessment, periodic check-in        |
| Skill Drill | SkillEngine (single skill) | No                            | Optional (per-item)        | Immediate              | Deep practice on one skill                   |
| Repair      | RepairEngine               | No (misconception resolution) | No                         | Immediate + scaffolded | Concept repair for identified misconceptions |
| Challenge   | Linear (special config)    | Yes (leaderboard)             | Yes (strict)               | Post-session           | Timed competition, gamification              |

All modes produce standardised session records consumed by the analytics and intelligence systems. The Repair mode is the only mode that can be auto-triggered by the intelligence stack (all others require student or teacher initiation).

---

## 19. Reporting & Analytics

### 19.1 Parent Dashboard

Designed for non-technical users. Presents:

- **Overall progress** — Learning DNA summary: current level, trend direction, recent activity.
- **Pathway readiness** — Per-enrolled-pathway readiness gauge with plain-language interpretation and predicted ready date.
- **Strengths & gaps** — Top 3 strongest and weakest skill areas with recommended actions.
- **Active repairs** — What misconceptions are being addressed and progress through repair sequences.
- **Activity log** — Sessions completed, time spent, consistency streak.
- **Comparison context** — Percentile band relative to cohort (same year level, same pathway). No individual student comparisons.
- **Exam countdown** — If an exam date is set, days remaining with readiness trajectory.

### 19.2 Student Dashboard

Age-appropriate presentation of:

- **Progress indicators** — Visual mastery map (skill tree with colour-coded nodes).
- **Recommendations** — "What to do next" with clear rationale from the orchestration layer.
- **Active repairs** — "You're working on understanding [X]" with progress bar.
- **Achievements** — Streaks, milestones, badges, stretch achievements.
- **Recent results** — Last 5 sessions with key stats.
- **Exam countdown** — Simplified readiness indicator for enrolled pathways.

### 19.3 Teacher / Tutor Analytics

Available to teacher-role users managing a class or group:

- **Class overview** — Aggregate mastery heatmap across skills and students.
- **Auto-generated groups** — Suggested student groupings with activity recommendations (§14.1).
- **Intervention alerts** — Prioritised list of students needing attention with suggested actions (§14.2).
- **Student drill-down** — Individual Learning DNA, causal map, behaviour profile.
- **Gap analysis** — Most common class-wide skill gaps and misconceptions.
- **Progress tracking** — Cohort velocity over time.
- **Assignment builder** — Auto-generated targeted assignments (§14.3).
- **Content effectiveness** — Item-level statistics (difficulty, discrimination, skip rate).

### 19.4 Benchmarking & Trends

- **Cohort benchmarking** — Student performance relative to platform-wide cohort for same year level and pathway.
- **Temporal trends** — Mastery and velocity over configurable time windows (weekly, monthly, term).
- **Predictive bands** — "At current trajectory, expected score band is X" with confidence intervals (§12).
- **Misconception prevalence** — Platform-wide and cohort-level misconception frequency data (anonymised) for curriculum planning.

### 19.5 Analytics Computation

All analytics are derived from source tables:

1. `session_record` — Immutable log of every session (mode, engine, duration, item responses, scores).
2. `session_response` + `response_telemetry` — Individual response data including behavioural signals.
3. `skill_mastery` — Current state per (student, skill) pair.
4. `student_misconception` — Active and historical misconception records.
5. `repair_record` — Concept repair progress and outcomes.

Aggregate analytics (cohort percentiles, heatmaps, misconception prevalence) are precomputed on a schedule (hourly for active cohorts, daily for historical) and cached. Real-time analytics (current session, just-completed session) are computed on demand.

### 19.6 Shared Read Shapes

#### 19.6.1 SessionSummaryDTO

All "recent sessions" widgets (student dashboard, parent dashboard, teacher student-detail) consume one shape:

```
SessionSummaryDTO {
  session_id: uuid
  mode: session_mode
  pathway_name: string | null            -- null for mode-only sessions (practice, skill_drill)
  started_at: timestamptz
  submitted_at: timestamptz | null       -- null for abandoned
  duration_ms: int | null
  active_duration_ms: int | null
  score_band: string | null              -- null for unscored modes
  raw_score: float | null
  skills_touched_count: int
  status: "processed" | "abandoned"
}
```

Returned by `GET /sessions/recent?limit=&student_id=`. The endpoint is role-gated: students see their own; parents see linked children; teachers see class students; admins see tenant.

#### 19.6.2 Staleness Indicator (`stale_since`)

Every intelligence-derived DTO that can be served from cache or from a degraded pipeline carries an optional `stale_since: timestamptz | null` field. The contract:

- `null` — Data is fresh; produced within the expected SLA window.
- Non-null — Data was last refreshed at `stale_since`; the most recent refresh attempt failed or is in progress. Clients must display a visible "Updating…" indicator and expose the timestamp on hover.

DTOs that carry `stale_since`:

| DTO | Fresh window | Stale-since trigger |
|---|---|---|
| `LearningDNADTO` | < 60s after session | Sync pipeline incomplete |
| `LearningPlanDTO` | Within `valid_until` | Async `orchestration.replan` failed on last attempt |
| `PathwayReadinessDTO` | 1h TTL | Predictive job failed |
| `CausalMapDTO` | Within 30s post-session | L3b async failed |
| `BehaviourProfileDTO` | After every session | L2 sync failed (rare) |

Clients never hide stale data. The displayed number is always the last known good value, with the staleness badge as a trust signal.

#### 19.6.3 Widget Loading States

Every dashboard widget renders three states minimum: **Loading** (skeleton matching final shape — no generic spinners), **Empty** (descriptive; includes an action link where possible), **Error** (message + retry action; 402 `FEATURE_GATED` renders an upgrade prompt instead of an error).

---

## 20. SaaS Model

### 20.1 Multi-Tenant Architecture

MindMosaic uses a **shared-database, schema-isolated** multi-tenancy model via Supabase Row-Level Security (RLS).

- Every data row carries a `tenant_id` (organisation or family account).
- RLS policies enforce that queries only return rows matching the authenticated user's tenant.
- Tenant isolation is verified by automated tests on every migration.
- Intelligence layer outputs (Learning DNA, causal maps, behaviour profiles) are tenant-scoped.

### 20.2 Roles & Permissions

| Role                 | Capabilities                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Student**          | Take assessments, view own dashboard, access practice and repair, view recommendations                                   |
| **Parent**           | View linked students' dashboards, manage subscription, set preferences, override recommendations, set exam dates         |
| **Teacher**          | View class analytics, auto-groups, intervention alerts, assign assessments, manage student groups, content effectiveness |
| **Tutor**            | Same as Teacher, scoped to assigned students only                                                                        |
| **Admin (Org)**      | Manage users within organisation, view org-wide analytics, manage content, view misconception reports                    |
| **Admin (Platform)** | Full system access, content management, tenant management, feature flags, content intelligence dashboard                 |

Permissions are enforced at three layers:

1. **Database** — RLS policies (tenant isolation, role-based row access).
2. **API** — Edge Function middleware validates JWT claims against required role for each endpoint.
3. **UI** — Route guards and component-level conditional rendering (defence in depth, not sole enforcement).

### 20.3 Subscription Model

| Tier              | Pathways                          | Intelligence Layers                      | Features                                                                                                                       |
| ----------------- | --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Free**          | 1 pathway, limited sessions/month | Foundation only                          | Basic practice, limited analytics                                                                                              |
| **Standard**      | 2 pathways                        | Foundation + Behaviour + Causal + Repair | Full practice, diagnostics, repair sequences, parent dashboard, recommendations                                                |
| **Premium**       | All pathways                      | All 9 layers                             | Cross-pathway intelligence, predictive analytics, stretch, challenge mode, teacher analytics, exam countdown, priority support |
| **Institutional** | All pathways, multi-seat          | All 9 layers + teacher tools             | Bulk licensing, auto-grouping, intervention alerts, assignment builder, custom branding, SLA                                   |

Subscription state is stored per-tenant and checked at session creation time. Feature gating is configuration-driven via the `feature_flags` table. Intelligence layers above the tier threshold gracefully degrade — the system still collects the data but does not surface the insights.

#### 20.3.1 Feature Flags Schema

```
feature_flag {
  id: uuid
  tenant_id: uuid | null               -- null = platform-wide default
  feature_key: string                   -- e.g., "intelligence.predictive", "mode.challenge",
                                        --       "pathway.selective", "teacher.auto_groups"
  enabled: boolean
  config: jsonb | null                  -- optional config (e.g., { "max_sessions_per_month": 10 })
  source: enum                          -- subscription | admin_override | experiment
  expires_at: timestamptz | null        -- for time-limited trials or experiments
  created_at: timestamptz
  updated_at: timestamptz
}
```

**Resolution order** (first match wins):

1. Tenant-specific override (`tenant_id` = caller's tenant, `source` = `admin_override`)
2. Tenant-specific subscription grant (`tenant_id` = caller's tenant, `source` = `subscription`)
3. Platform-wide default (`tenant_id` = null)

**Feature key registry:**

| Feature Key                    | Free      | Standard   | Premium   | Institutional | Controls                           |
| ------------------------------ | --------- | ---------- | --------- | ------------- | ---------------------------------- |
| `pathway.*`                    | 1 pathway | 2 pathways | All       | All           | Which exam families are accessible |
| `mode.exam`                    | Yes       | Yes        | Yes       | Yes           | Exam simulation mode               |
| `mode.challenge`               | No        | No         | Yes       | Yes           | Challenge/leaderboard mode         |
| `mode.repair`                  | No        | Yes        | Yes       | Yes           | Concept repair sessions            |
| `intelligence.foundation`      | Yes       | Yes        | Yes       | Yes           | Mastery, velocity, retention       |
| `intelligence.behaviour`       | No        | Yes        | Yes       | Yes           | Guessing, fatigue, persistence     |
| `intelligence.causal`          | No        | Yes        | Yes       | Yes           | Root cause, misconceptions         |
| `intelligence.predictive`      | No        | No         | Yes       | Yes           | Readiness predictions, forecasts   |
| `intelligence.stretch`         | No        | No         | Yes       | Yes           | Stretch recommendations            |
| `intelligence.cross_pathway`   | No        | No         | Yes       | Yes           | Cross-pathway analysis             |
| `teacher.analytics`            | No        | No         | Yes       | Yes           | Class-level analytics              |
| `teacher.auto_groups`          | No        | No         | No        | Yes           | Automatic student grouping         |
| `teacher.intervention_alerts`  | No        | No         | No        | Yes           | Intervention alerts                |
| `teacher.assignment_builder`   | No        | No         | No        | Yes           | Auto-generated assignments         |
| `orchestration.exam_countdown` | No        | No         | Yes       | Yes           | Exam countdown plans               |
| `orchestration.long_term_plan` | No        | No         | Yes       | Yes           | Multi-week plans                   |
| `sessions.monthly_limit`       | 10        | unlimited  | unlimited | unlimited     | Session cap                        |

**Gating check** (called at session creation, dashboard load, and plan generation):

```
check_feature(tenant_id, feature_key):
  flag = lookup(feature_flags, tenant_id, feature_key)  -- resolution order above
  if flag is null: return false                          -- deny by default
  if flag.expires_at and flag.expires_at < now(): return false
  return flag.enabled
```

**Graceful degradation:** When a feature is disabled, the system does not show an error. Instead: intelligence layers still compute and store results (so data is ready if the tenant upgrades), but the results are omitted from API responses and dashboards. The UI shows an upgrade prompt in place of gated features.

---

## 21. API & Service Boundaries

The backend is organised into five logical services (expanded from four in v3.0), deployed as Supabase Edge Functions (Deno runtime). Services communicate via direct function invocation or database reads — no inter-service HTTP in MVP.

### 21.0 API Conventions

#### 21.0.1 Standardised Error Envelope

All endpoints return errors in a consistent shape. Clients can rely on this contract for error handling.

```
ErrorResponse {
  error: {
    code: string                        -- machine-readable (e.g., "SESSION_CONFLICT", "FEATURE_GATED")
    message: string                     -- human-readable summary
    status: int                         -- HTTP status code
    details: jsonb | null               -- additional context (e.g., { "active_session_id": "..." })
    trace_id: string                    -- request trace ID for support/debugging
  }
}
```

**Standard error codes used across all services:**

| HTTP Status | Error Code         | Meaning                                                                                                          |
| ----------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 400         | `VALIDATION_ERROR` | Request body fails Zod schema validation. `details` contains field-level errors.                                 |
| 401         | `UNAUTHENTICATED`  | Missing or invalid JWT.                                                                                          |
| 403         | `FORBIDDEN`        | Valid JWT but insufficient role for this endpoint.                                                               |
| 402         | `FEATURE_GATED`    | Tenant subscription does not include the required feature. `details` contains `feature_key` and `required_tier`. |
| 404         | `NOT_FOUND`        | Requested entity does not exist or is not accessible to caller (RLS).                                            |
| 409         | `CONFLICT`         | State conflict (e.g., session not in expected state, duplicate submission). `details` contains `current_state`.  |
| 410         | `GONE`             | Resource existed but is no longer available (e.g., abandoned session).                                           |
| 422         | `UNPROCESSABLE`    | Request is syntactically valid but semantically invalid (e.g., mismatched response_type).                        |
| 429         | `RATE_LIMITED`     | Too many requests. `details` contains `retry_after_ms`.                                                          |
| 500         | `INTERNAL_ERROR`   | Unhandled server error. Logged with `trace_id`.                                                                  |

#### 21.0.2 Service Interaction Rules

- **No synchronous inter-service HTTP calls.** Services read shared database tables directly. Write operations go through the owning service.
- **Data ownership:** Each service owns specific tables and is the only writer. Other services may read.

| Service       | Owns (write)                                                                                                                                    | Reads From                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Assessment    | `session_record`, `session_response`, `response_telemetry`                                                                                      | `item`, `blueprint`, `assessment_profile`, `repair_sequence`, `feature_flag`                            |
| Content       | `item`, `stimulus`, `blueprint`                                                                                                                 | `session_response` (for coverage/quality analytics)                                                     |
| Intelligence  | `skill_mastery`, `learning_velocity`, `behaviour_profile`, `student_misconception`, `repair_record`, `intelligence_audit_log`, `pipeline_event` | `session_record`, `session_response`, `response_telemetry`, `skill_node`, `skill_edge`, `misconception` |
| Analytics     | `intervention_alert` (precomputed caches)                                                                                                       | All tables (read-only aggregation)                                                                      |
| Orchestration | `learning_plan`, `recommendation`                                                                                                               | `skill_mastery`, `behaviour_profile`, `student_misconception`, `repair_record`, `feature_flag`          |

- **Pipeline trigger:** Assessment Service triggers the Intelligence pipeline by inserting a `pipeline_event` with step=1 after writing `session_record`. Intelligence Service picks up from there.
- **Idempotency:** All write endpoints accept an `Idempotency-Key` header. Duplicate requests with the same key within a 24h window return the original response without re-executing.

### 21.1 Assessment Service

**Responsibilities:** Session lifecycle management, engine orchestration (including RepairEngine), timer enforcement, response recording, scoring, telemetry capture.

Key endpoints:

- `POST /sessions/create` — Create session from assessment_profile or repair_sequence, invoke engine.initialise.
- `POST /sessions/{id}/respond` — Record response + telemetry, invoke engine.recordResponse, return next item or termination.
- `POST /sessions/{id}/submit` — Finalise session, invoke engine.score, write session_record, trigger intelligence pipeline.
- `GET /sessions/{id}/state` — Resume interrupted session (returns current engine state).

### 21.2 Content Service

**Responsibilities:** Item retrieval, blueprint resolution, content search, stimulus delivery, content authoring (admin), content lifecycle management.

Key endpoints:

- `POST /content/select` — Select items matching blueprint constraints (used by Assessment Service at session creation).
- `GET /content/items/{id}` — Retrieve single item with stimulus.
- `POST /content/import` — Bulk import items from JSON (admin, with dry-run validation).
- `GET /content/search` — Faceted search over items by skill, difficulty, exam_family, year_level.
- `GET /content/coverage` — Content coverage report (§15.5).
- `GET /content/quality-report` — Item-level quality metrics (difficulty drift, discrimination, flags).

### 21.3 Intelligence Service — NEW

**Responsibilities:** Intelligence pipeline execution, learner model computation, behaviour analysis, causal analysis, misconception management, repair queue management, predictive computation, stretch evaluation.

Key endpoints:

- `POST /intelligence/process-session` — Triggered after session completion; runs the full pipeline (§7.2).
- `GET /intelligence/learner-profile/{student_id}` — Returns Learning DNA including all intelligence layers.
- `GET /intelligence/causal-map/{student_id}` — Returns root causes, misconceptions, repair queue.
- `GET /intelligence/behaviour-profile/{student_id}` — Returns behaviour signals.
- `GET /intelligence/predictions/{student_id}/{pathway_slug}` — Returns readiness prediction and forecasts.
- `GET /intelligence/stretch/{student_id}` — Returns stretch readiness assessment.
- `GET /intelligence/explain/{decision_id}` — Returns structured explanation for any intelligence decision (§7.4).
- `GET /intelligence/audit-log/{student_id}` — Returns intelligence audit trail, filterable by layer and date range (§7.4.2). Parent-accessible.

### 21.4 Analytics Service

**Responsibilities:** Cohort analytics, benchmarking, trend computation, teacher intervention intelligence, report generation.

Key endpoints:

- `GET /analytics/cohort/{group_id}` — Returns aggregate analytics for a student group.
- `GET /analytics/pathway-readiness/{student_id}/{pathway_slug}` — Returns readiness score and gaps.
- `GET /analytics/auto-groups/{class_id}/{skill_id}` — Returns auto-generated student groupings (§14.1).
- `GET /analytics/intervention-alerts/{teacher_id}` — Returns pending intervention alerts (§14.2).
- `POST /analytics/generate-assignment` — Auto-generate targeted assignment (§14.3).
- `GET /analytics/misconception-prevalence/{cohort}` — Returns anonymised misconception frequency data.

### 21.5 Orchestration Service — NEW

**Responsibilities:** Learning plan generation, exam countdown management, pathway switching, recommendation lifecycle.

Key endpoints:

- `POST /orchestration/generate-plan/{student_id}` — Generate or refresh learning plan.
- `GET /orchestration/plan/{student_id}/current` — Return active learning plan.
- `POST /orchestration/exam-countdown/{student_id}/{pathway_slug}` — Create exam countdown plan.
- `POST /orchestration/pathway-switch/{student_id}` — Handle pathway add/change/remove.
- `POST /orchestration/long-term-plan/{student_id}` — Generate multi-week phased plan (§16.5).
- `GET /orchestration/milestones/{student_id}` — Return milestone progress for active long-term plan.
- `POST /orchestration/plan/{id}/feedback` — Record parent/teacher feedback (dismiss, pin, complete).

### 21.6 Intelligence Response DTOs

All intelligence endpoints return typed DTOs. These are the contracts between the Intelligence/Analytics/Orchestration services and the frontend.

#### 21.6.1 SkillProgressDTO

Returned by `GET /intelligence/learner-profile` (per skill within domain profiles).

```
SkillProgressDTO {
  skill_id: uuid
  skill_name: string
  mastery_level: float                  -- 0.0–1.0
  confidence: float                     -- 0.0–1.0
  velocity: float                       -- positive = improving
  retention_estimate: float             -- predicted current mastery accounting for decay
  status: enum                          -- not_started | developing | proficient | advanced | mastered
  trend: enum                           -- improving | stable | declining | insufficient_data
  active_misconceptions: [
    { misconception_id: uuid, name: string, confidence: float, severity: enum }
  ]
  last_practiced_at: timestamptz | null
  data_points: int                      -- total attempts
}
```

#### 21.6.2 LearningPlanDTO

Returned by `GET /orchestration/plan/{student_id}/current`.

```
LearningPlanDTO {
  plan_id: uuid
  plan_type: enum                       -- weekly | exam_countdown | long_term | transition
  status: enum                          -- active | superseded | expired
  created_at: timestamptz
  valid_until: timestamptz
  sessions: [
    {
      order: int
      week: int | null
      mode: enum
      target_skill_names: string[]      -- human-readable (frontend doesn't resolve UUIDs)
      target_skill_ids: uuid[]
      difficulty_label: string          -- "Developing" | "Proficient" | etc.
      estimated_duration_min: int
      rationale: string                 -- explainable recommendation (§7.4)
      priority: enum
      status: enum                      -- pending | completed | skipped
    }
  ]
  milestones: [
    { week: int, target_skills: string[], expected_mastery: float, actual_mastery: float | null }
  ] | null
  stale_since: timestamptz | null       -- non-null if plan could not be refreshed (degraded mode)
}
```

#### 21.6.3 RepairSessionDTO

Returned by `GET /intelligence/causal-map` (within repair queue) and used to start a repair session.

```
RepairSessionDTO {
  repair_record_id: uuid
  misconception_id: uuid | null
  misconception_name: string | null
  root_cause_skill_id: uuid | null
  root_cause_skill_name: string | null
  repair_sequence_name: string
  status: enum                          -- queued | in_progress | completed | failed | deferred
  stages_completed: int
  total_stages: int
  estimated_duration_min: int
  priority: enum                        -- critical | high | medium
  rationale: string                     -- why this repair was triggered (§7.4)
}
```

#### 21.6.4 PathwayReadinessDTO

Returned by `GET /analytics/pathway-readiness/{student_id}/{pathway_slug}`.

```
PathwayReadinessDTO {
  pathway_slug: string
  pathway_name: string
  skill_readiness: float                -- 0.0–1.0
  coverage: float                       -- % of pathway skills assessed
  condition_readiness: float            -- behavioural readiness for exam conditions
  composite_readiness: float            -- weighted combination
  composite_label: enum                 -- not_ready | developing | on_track | ready | strong
  gap_skills: [
    { skill_id: uuid, skill_name: string, current_mastery: float, target_mastery: float }
  ]
  active_misconceptions_affecting: int  -- count of misconceptions impacting pathway skills
  predicted_ready_date: date | null     -- null if insufficient data
  exam_date: date | null                -- if student has set one
  days_remaining: int | null
  stale_since: timestamptz | null       -- non-null if prediction could not be refreshed
}
```

---

## 22. Non-Functional Requirements

### 22.1 Performance

| Metric                                              | Target                                    |
| --------------------------------------------------- | ----------------------------------------- |
| Item delivery latency (p95)                         | < 200ms                                   |
| Session creation latency                            | < 1s                                      |
| Dashboard load (p95)                                | < 2s                                      |
| Intelligence pipeline (post-session, sync portion)  | < 3s                                      |
| Intelligence pipeline (post-session, async portion) | < 30s                                     |
| Predictive computation (per student)                | < 5s                                      |
| Concurrent sessions supported                       | 10,000+ (horizontal scaling via Supabase) |

### 22.2 Security

- **Authentication:** Supabase Auth (email/password, OAuth providers).
- **Authorisation:** RLS on all tables; JWT-based role claims validated in Edge Functions.
- **Data encryption:** TLS in transit (enforced via HSTS); AES-256 at rest (Supabase managed).
- **Input validation:** Zod schemas on all API inputs; parameterised queries only.
- **OWASP compliance:** CSRF protection, rate limiting, secure headers.
- **PII handling:** Student names and emails are the only PII stored; no unnecessary data collection. Australian Privacy Principles (APP) compliance.
- **Behavioural data:** Response telemetry is stored as operational data, not shared externally. Parents can request deletion under APP (§22.3.2).
- **Admin action audit:** Every `org_admin` or `platform_admin` write against a mutable config or subscription table writes a row to `admin_action_log` with `{actor_id, actor_role, action, entity_type, entity_id, payload, ip_address, trace_id, created_at}`. Retained 7 years for compliance. Required for every admin-scoped endpoint (reviewed at PR time).
- **Webhook signature verification:** Stripe (and any future third-party webhook source) signatures are verified before any state change. Invalid signatures return 400 within 300ms and write a `billing_event` row with `processing_error='invalid_signature'`.
- **PII-free logs:** Application logs never contain `response_data`, item `stem` content, payload answers, raw webhook bodies, passwords, or tokens. Logging middleware strips these fields before emission. Only `student_id` / `tenant_id` are logged for correlation; these are joined with PII only in the privileged admin data-export tool, never in monitoring dashboards.
- **Trace ID propagation:** Every request accepts and forwards `X-Trace-Id`. If absent, the edge generates a UUID. Trace IDs propagate into database queries (via `set_config('app.trace_id', ...)`), async jobs (`job_queue.payload.trace_id`), and structured logs. Enables single-request end-to-end correlation across services.
- **Rate limiting:** Table-backed (`rate_limit_bucket`) with atomic `INSERT … ON CONFLICT DO UPDATE` to survive horizontal scaling of Edge Functions. Per-user and per-IP windows. In-memory / per-instance counters are not permitted.

### 22.3 Auditability & Data Subject Rights

#### 22.3.1 Auditability

- Every session response is immutably recorded with telemetry.
- Scoring is deterministic and reproducible from recorded state.
- Misconception detection is traceable to specific evidence (item IDs, responses, detection method).
- Recommendation and plan generation are logged with full input snapshot AND `algorithm_version` (§7.4.2) for replay safety.
- Intelligence pipeline execution is logged with per-layer timing and outputs.
- Schema migrations are versioned and reversible.
- `intelligence_audit_log` is hot-stored for 90 days, then archived to cold storage (Parquet files in Supabase Storage, partitioned daily, queryable via DuckDB for offline audits). Hot retention is bounded; cold retention aligns with APP.

#### 22.3.2 Data Subject Rights (Australian Privacy Principles)

Students and parents can exercise the following rights through authenticated endpoints. Every request enqueues an asynchronous batch job; no action is taken inline on the API call.

| Right | Endpoint | Flow | SLA |
|---|---|---|---|
| **Access / Export** | `POST /privacy/export-data` | Enqueues `batch.privacy_export`; job produces a signed ZIP archive of all tables where caller's `user_id` or `tenant_id` appears, as JSON. Signed download link valid 7 days, delivered via `notification` + email. | Job completes < 24h |
| **Erasure** | `POST /privacy/delete-account` | 7-day grace period during which the caller can cancel. After grace, `batch.privacy_delete` runs: hard-deletes `user_profile` and cascades to session data, intelligence records, plans, engagement, notifications. | Job completes < 48h from end of grace |
| **Correction** | `PATCH /users/me` | Display name and preferences editable directly; email changes require verification via Supabase Auth. | Immediate |

**De-identified aggregate preservation:** On account erasure, aggregate statistics that power the L8 Content Intelligence Loop (item-level `difficulty`, `discrimination`, distractor selection counts) are preserved in a de-identified form — specifically, `session_response.item_id` counts contribute to item recalibration but the `session_id` ↔ `student_id` link is severed. No individual attribution remains.

**Compliance traceability:** Every privacy request writes to `admin_action_log` with `actor_role='self_service_privacy'` and a diff summary of what was deleted. These entries are retained 7 years even after the subject's other data is removed.

#### 22.3.3 Continuous Integration Gate

A tenant-isolation test suite runs in CI on every pull request. For every tenant-scoped table the suite seeds two tenants, attempts cross-tenant reads and writes as each role, and asserts zero leakage. Any new tenant-scoped table must register itself with the suite or CI fails. A PR that modifies RLS policies cannot merge without the suite passing.

### 22.4 Scalability

- Stateless Edge Functions scale horizontally.
- Intelligence pipeline async steps are queue-based (can be parallelised per-student).
- Database read replicas for analytics workloads (Phase 2).
- Precomputed analytics cached with TTL-based invalidation.
- Content delivery via Supabase Storage CDN.
- Feature flags enable gradual rollout and load management.
- Content intelligence recalibration runs as a scheduled background job (not per-request).

### 22.5 Reliability

- **Availability target:** 99.5% uptime (excluding scheduled maintenance).
- **Session durability:** In-progress sessions are persisted server-side; clients can resume after disconnection.
- **Idempotent submissions:** Duplicate response submissions are safely ignored.
- **Graceful degradation:** If the intelligence service is unavailable, dashboards show cached Learning DNA with a staleness indicator. Assessment and practice sessions continue to function without real-time intelligence updates.
- **Pipeline retry:** Failed intelligence pipeline steps are retried with exponential backoff. After 3 failures, the step is logged and skipped; the remaining pipeline continues (§7.2.1).

### 22.6 Observability & Monitoring

Every service emits structured telemetry for operational visibility. The monitoring stack must surface problems before users notice them.

#### 22.6.1 Structured Logging

All Edge Functions log in JSON format with mandatory fields:

```
{
  "timestamp": "ISO-8601",
  "level": "info | warn | error",
  "service": "assessment | content | intelligence | analytics | orchestration",
  "trace_id": "uuid",                  -- propagated across service calls within a request
  "student_id": "uuid | null",
  "tenant_id": "uuid | null",
  "endpoint": "/sessions/create",
  "duration_ms": 142,
  "status_code": 201,
  "error_code": "null | CONFLICT",
  "message": "human-readable context"
}
```

Sensitive data (response content, PII) is never included in logs. `student_id` is logged for request correlation but is not joined with PII in monitoring dashboards.

#### 22.6.2 Metrics

| Metric                             | Type      | Alert Threshold                                                           |
| ---------------------------------- | --------- | ------------------------------------------------------------------------- |
| `session.create.latency_p95`       | Histogram | > 1.5s for 5 min                                                          |
| `session.respond.latency_p95`      | Histogram | > 300ms for 5 min                                                         |
| `session.active.count`             | Gauge     | > 8,000 (80% of capacity target)                                          |
| `pipeline.sync.latency_p95`        | Histogram | > 5s for 5 min                                                            |
| `pipeline.async.step.failure_rate` | Rate      | > 5% in any 1h window                                                     |
| `pipeline.dead_letter.count`       | Counter   | > 0 (any dead-letter event triggers alert)                                |
| `api.error_rate.5xx`               | Rate      | > 1% in any 5 min window                                                  |
| `api.error_rate.429`               | Rate      | > 10% in any 5 min window                                                 |
| `session.abandoned.rate`           | Rate      | > 15% of started sessions in 24h (may indicate UX or reliability issue)   |
| `repair.failure.rate`              | Rate      | > 40% of completed repairs in 7 days (may indicate content quality issue) |
| `content.recalibration.drift`      | Gauge     | Any item with difficulty drift > 0.3 (auto-flagged, see §15.1)            |

#### 22.6.3 Health Check Endpoints

Each service exposes `GET /health` (unauthenticated) returning:

```
{ "service": "assessment", "status": "healthy | degraded | unhealthy", "timestamp": "...", "checks": {
    "database": "ok | timeout | error",
    "queue": "ok | backlog | error"
}}
```

`degraded` = service is functional but one dependency is slow. `unhealthy` = service cannot fulfil requests. Load balancers use health checks for routing decisions.

### 22.7 Testability

The architecture must support automated testing at every layer.

#### 22.7.1 Unit Testability

- All intelligence layer computations (mastery, velocity, guessing detection, causal traversal, etc.) are pure functions with deterministic outputs for given inputs. No database access in computation functions — data is loaded beforehand and passed as arguments.
- Engines implement the `AssessmentEngine` interface (§3.1) which is testable with mock `FrameworkConfig` and `Session` objects.
- Feature flag checks are injectable — tests can override flags without touching the database.

#### 22.7.2 Integration Testability

- **Tenant isolation tests:** Every database migration includes an automated test that verifies RLS policies prevent cross-tenant data access. Test creates two tenants, inserts data for each, and asserts that queries scoped to tenant A return zero rows from tenant B.
- **Pipeline integration tests:** A test harness submits a known session, waits for pipeline completion, and asserts that all 9 layers produced expected outputs. Uses a dedicated test tenant with seeded skill graph and content.
- **Session state machine tests:** Automated tests attempt every invalid state transition and assert rejection. Valid transitions are tested end-to-end.

#### 22.7.3 Contract Testability

- All DTOs (§3.6) have corresponding Zod schemas shared between client and server packages (via the Turborepo monorepo).
- API contract tests assert that real endpoint responses match the declared DTO shapes. These run in CI on every PR.
- Skill graph validation rules (§5.1.2) are tested with intentional violations (cycles, orphans, dangling edges) and asserted to reject.

### 22.8 Failure & Degradation Model

The system must remain usable even when components fail. This section defines expected behaviour for every failure mode.

#### 22.8.1 Failure Modes & Responses

| Component                         | Failure Mode                 | Detection                                  | System Response                                                                             | User Experience                                                              |
| --------------------------------- | ---------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Database**                      | Connection timeout           | Health check (§22.6.3)                     | Retry 3x with 500ms backoff; if all fail, return 503                                        | "Something went wrong, please try again"                                     |
| **Database**                      | Read replica lag >5s         | Replication lag metric                     | Route reads to primary                                                                      | No visible impact                                                            |
| **Intelligence pipeline (sync)**  | Steps 1–3 fail               | Exception in pipeline                      | Retry 3x; if all fail, session stays `submitted` (not `processed`); queued for retry in 60s | Score shown immediately; dashboard shows "updating..."                       |
| **Intelligence pipeline (async)** | Any step fails               | `pipeline_event.status = failed`           | Per-step retry (§7.2.1); independent steps continue; dead-letter after max retries          | Stale data with `stale_since` indicator on affected dashboard widgets        |
| **Content Service**               | Item selection returns empty | Zero items matching blueprint              | Widen difficulty range by ±0.1; if still empty, widen skill scope to parent strand          | Session starts with slightly off-target items; logged for content gap report |
| **Orchestration Service**         | Plan generation fails        | Exception or timeout                       | Return cached previous plan with `stale_since` set                                          | Student sees last valid plan with "Plan updating..." badge                   |
| **Auth / Supabase Auth**          | Token refresh fails          | 401 from any endpoint                      | Client redirects to login; in-progress session autosaved (§3.7)                             | "Please sign in again. Your progress is saved."                              |
| **Client network**                | Offline during session       | No heartbeat response                      | Client continues locally; autosave queued; responses buffered                               | Offline indicator; session continues; sync on reconnect                      |
| **Timer service**                 | Server timer drift           | Client-server time comparison on heartbeat | Server time is authoritative; client adjusts display                                        | Timer may jump slightly on resync                                            |

#### 22.8.2 Circuit Breaker Pattern

For external dependencies (Supabase Auth, Storage CDN), the system uses a circuit breaker:

```
circuit_breaker(service_name):
  states: closed | open | half_open
  failure_threshold: 5 consecutive failures
  recovery_timeout: 30 seconds

  closed: requests pass through normally; failures increment counter
  open: all requests immediately return fallback/cached response; no actual calls
  half_open: after recovery_timeout, allow ONE request through
    if success → closed (reset counter)
    if failure → open (reset timer)
```

**Fallback behaviours when circuit is open:**

| Service                      | Fallback                                                           |
| ---------------------------- | ------------------------------------------------------------------ |
| Supabase Auth                | Return cached user session if token not expired; reject new logins |
| Storage CDN (stimuli/images) | Serve placeholder; log missing asset                               |
| Intelligence pipeline        | Return cached Learning DNA; set `stale_since`                      |

#### 22.8.3 Degraded UX States

The frontend implements three visual degradation levels:

| Level        | Trigger                                                           | Visual Treatment                                                                                                        |
| ------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Normal**   | All systems healthy                                               | Full UI, no indicators                                                                                                  |
| **Partial**  | Some intelligence layers stale (>5 min) or plan generation failed | Affected widgets show "Updating..." badge; data still shown but may be stale; timestamp of last update visible on hover |
| **Degraded** | Core services unavailable (database, auth)                        | Read-only mode; sessions cannot start; cached dashboards shown; banner: "Some features are temporarily unavailable"     |

### 22.9 Versioning Strategy

Content, skill mappings, and learning plans evolve over time. The system must track which version of each was used for any given decision, enabling reproducibility and safe migrations.

#### 22.9.1 Content Versioning

Items are immutable once active. Changes create a new version:

```
item_version {
  item_id: uuid                         -- stable identifier across versions
  version: int                          -- monotonically increasing
  stem: jsonb
  response_config: jsonb
  difficulty: float
  discrimination: float | null
  is_current: boolean                   -- only one version is current at a time
  created_at: timestamptz
  supersedes: uuid | null               -- previous version's item_id + version
}
```

**Rules:**

- Active assessments always use `is_current = true` items.
- Historical `session_response` records reference the `(item_id, version)` that was served, not the current version. This ensures scoring reproducibility.
- Difficulty and discrimination recalibration (§15.1, §15.2) update the current version's values in-place (these are statistical properties, not content changes). Content changes (stem, options) create a new version.
- Retired items have `is_current = false` and no successor.

#### 22.9.2 Skill Graph Versioning

The skill graph is versioned at the graph level, not per-node:

```
skill_graph_version {
  id: uuid
  version: int
  description: string                   -- e.g., "Australian Curriculum v9.1 alignment update"
  status: enum                          -- draft | published | archived
  node_count: int
  edge_count: int
  published_at: timestamptz | null
  archived_at: timestamptz | null
}
```

Each `skill_node` and `skill_edge` carries a `graph_version_id`. When the curriculum changes:

1. A new `skill_graph_version` is created as a `draft` (copy-on-write from the current `published` version).
2. Nodes and edges are modified on the draft only. In-place edits on the published version are forbidden (§5.1.2).
3. A migration mapping is populated: `skill_migration_map { from_graph_version, to_graph_version, old_skill_id → new_skill_id | NULL }`. NULL indicates explicit retirement.
4. The publish flow (atomic):
   a. Full graph validation (§5.1.2).
   b. Previous `published` version is set to `archived`.
   c. Draft is set to `published`.
   d. The migration job `batch.skill_graph_migration` runs immediately to rewrite references in **all** consumer tables.

**Entity migration scope.** The migration job rewrites `old_skill_id → new_skill_id` in:

- `skill_mastery` — mastery transfers to the equivalent new node. If `new_skill_id IS NULL`, the row is preserved but the skill is marked `retired` in the student's visible history and excluded from future traversals.
- `learning_velocity` — same semantics as mastery.
- `student_misconception` — `misconception_id` is unchanged, but any `evidence.skill_ids` or `affected_skills` arrays inside `evidence` jsonb are rewritten.
- `repair_record` — `root_cause_skill_id` is rewritten; if it maps to NULL, the record is moved to `status='deferred'` with `deferred_reason='skill_retired'` for teacher review.
- `learning_plan.sessions[].target_skill_ids` and `recommendation.target_skills` — rewritten in place via jsonb operations; plans become `stale_since = now()` until the next orchestration replan.
- `plan_override.target.skill_id` (for `pin_skill` type) — rewritten; if mapping is NULL, override is expired immediately with an audit entry.
- `assignment.target_skill_ids` — rewritten; published assignments with any unmapped skill are auto-archived and teachers are notified.

**Invariant:** After the migration job completes, no active record references a skill ID from an archived graph version. A post-migration verification query asserts zero dangling references across all consumer tables; failure blocks the publish.

**Rollback:** If post-migration verification fails, the publish is rolled back by flipping status on both versions and rerunning the inverse migration. The 7-day retention of the archived version ensures rollback capability.

#### 22.9.3 Learning Plan Versioning

Plans are already versioned implicitly — each plan generation creates a new `learning_plan` record and supersedes the previous one (§16.1). The `intelligence_audit_log` (§7.4.2) records the full input snapshot for each plan, enabling replay and comparison.

For long-term plans (§16.5), the system tracks plan evolution:

```
plan_revision {
  plan_id: fk
  revision: int                         -- monotonically increasing
  reason: enum                          -- scheduled_weekly | session_triggered | manual_override |
                                        --   milestone_missed | pathway_change
  diff_summary: jsonb                   -- what changed: sessions added/removed/reordered
  created_at: timestamptz
}
```

This enables the parent dashboard to show "Plan updated: 2 sessions added for Fractions repair" rather than silently changing the plan.

---

## 24. Assignments

Assignments are teacher- or system-generated packets of work delivered to individual students or classes. This section defines the product model; the content-selection algorithm used for auto-generation is specified in §14.3.

### 24.1 Assignment Entity

```
assignment {
  id: uuid
  tenant_id: uuid
  created_by: uuid                   -- teacher or system (for auto-generated)
  title: string
  description: string | null
  mode: session_mode                 -- practice | exam | diagnostic | skill_drill
  target_skill_ids: uuid[]           -- required, ≥1
  difficulty_range: { min, max } | null
  item_count: int
  time_limit_ms: int | null
  due_at: timestamptz | null
  status: enum                       -- draft | published | archived
  auto_generated: boolean
  rationale: string | null           -- required when auto_generated = true
  published_at: timestamptz | null
  archived_at: timestamptz | null
  created_at, updated_at
}
```

### 24.2 Targeting

An assignment may target one or more students (directly) or one or more classes (indirectly). Targeting is stored separately and expands at publish time.

```
assignment_target {
  assignment_id: uuid
  student_id: uuid | null
  class_id: uuid | null
  -- XOR: exactly one of student_id or class_id must be non-null
}
```

At `publish`, the system materialises a `assignment_session` row per distinct student — either directly listed or expanded from a class membership. Adding a student to a class after publish does NOT retroactively create an `assignment_session`; teachers must republish or add the student explicitly.

### 24.3 Per-Student Lifecycle

```
assignment_session {
  assignment_id: uuid
  student_id: uuid
  tenant_id: uuid
  session_id: uuid | null            -- links to the session_record once started
  status: enum                       -- pending | in_progress | completed | overdue
  completed_at: timestamptz | null
}
```

**State transitions:**

| From | To | Trigger | Side Effects |
|---|---|---|---|
| `pending` | `in_progress` | Student calls `POST /assignments/{id}/start` → creates `session_record` with `assignment_id` populated | `session_id` linked; student receives `assignment_started` confirmation |
| `in_progress` | `completed` | Linked session reaches `processed` state | `completed_at` set; teacher's tracking view updates |
| `pending` / `in_progress` | `overdue` | Daily cron at `due_at + 24h` if not completed | Teacher + student notified; assignment still startable |

**Invariant:** One `assignment_session` row per `(assignment_id, student_id)` pair; re-targeting the same student is a no-op.

### 24.4 Creation Flow

| Step | Actor | Action |
|---|---|---|
| 1 | Teacher | Opens builder, chooses targets, mode, target skills, item count, due date |
| 2 | Teacher | Optionally clicks "Auto-generate" → Analytics Service returns target skills based on class gaps (§14.3); teacher may accept or modify |
| 3 | Teacher | Saves as `draft` (review later) or publishes directly |
| 4 | Teacher | `POST /assignments/{id}/publish` — system materialises `assignment_session` rows, sends `assignment_assigned` notifications |
| 5 | Students | See assignment on `/assignments` screen; start via `POST /assignments/{id}/start` |
| 6 | Student | Completes linked session; assignment_session auto-transitions to `completed` |
| 7 | Teacher | Reviews `assignment_tracking` showing per-student completion and scores |

### 24.5 Content Selection at Start Time

When a student starts an assignment, the Content Service selects items using:

- `target_skill_ids` from the assignment
- `difficulty_range` (or derived from student's current mastery if null)
- `item_count`
- Excludes items the student has seen in the last 14 days
- Honours blueprint constraints if `mode = exam`

Selection is deterministic: the selected item list is frozen into `session_record.engine_state_snapshot.planned_items` so retries of the same `start` call return the same items (idempotency).

### 24.6 Auto-Generated Assignments

Teachers can request `POST /analytics/generate-assignment` which produces an assignment draft with `auto_generated = true` and a populated `rationale` field explaining the skill selection (e.g., "Targets 'fraction equivalence' — 60% of class below threshold; misconception 'add_denominators' detected in 7 students"). Teachers approve, modify, or discard.

### 24.7 Delivery Guarantees

- A published assignment is visible to targeted students within 30 seconds (notification delivery + dashboard refresh).
- A student may have multiple open assignments simultaneously; they are sorted by `due_at` ASC, with overdue items pinned to the top.
- If an assignment targets a skill no longer in the active skill graph (post graph migration), the assignment is auto-archived and the teacher is notified (§22.9.2).

### 24.8 Roles & Permissions

| Role | Can create | Can target | Can view tracking |
|---|---|---|---|
| Teacher | Own class | Own class + individual students in class | Own assignments |
| Tutor | Assigned students | Assigned students | Own assignments |
| Org admin | Any | Any in tenant | All in tenant |
| Platform admin | Any | Any | All |
| Student | No | — | Own `assignment_session` rows only |
| Parent | No | — | Linked students' `assignment_session` rows only |

---

## 25. Billing & Subscription Lifecycle

Billing converts subscription tier definitions (§20.3) into a production-grade purchase, renewal, and access-management flow. Stripe is the system of record for billing state; MindMosaic mirrors state locally via webhook ingestion.

### 25.1 System of Record

- **Stripe** holds: customer, payment method, subscription, invoice, tax.
- **MindMosaic** holds: `subscription` row mirrored from Stripe, `invoice` row per invoice, `billing_event` audit log of every webhook processed, `billing_customer` mapping `tenant_id ↔ stripe_customer_id`.
- On conflict, Stripe wins. MindMosaic's local state converges via webhook replay.

### 25.2 Checkout Flow

| Step | Actor | Endpoint |
|---|---|---|
| 1 | Caller (parent or org_admin) | `POST /billing/checkout` with `{tier, billing_interval, success_url, cancel_url}` |
| 2 | Server | Look up or create `billing_customer` for tenant; create Stripe Checkout Session with corresponding price ID; return `checkout_url` |
| 3 | Caller | Redirected to Stripe; completes payment |
| 4 | Stripe → Server | `checkout.session.completed` webhook received; server upserts `subscription` row with `tier`, `stripe_subscription_id`, `current_period_end` |
| 5 | Server | Propagates tier to `feature_flag` table (§25.5); enqueues `notification` to caller ("Subscription active") |
| 6 | Caller | Redirected to `success_url`; dashboard reflects new entitlements within 30 seconds |

### 25.3 Subscription States

```
subscription {
  id: uuid
  tenant_id: uuid
  tier: enum                         -- free | standard | premium | institutional
  stripe_subscription_id: string | null  -- null only for the free default
  started_at: timestamptz
  current_period_end: timestamptz | null
  cancel_at: timestamptz | null      -- set when user schedules cancel-at-period-end
  canceled_at: timestamptz | null    -- set when Stripe finalises cancellation
  is_active: boolean
}
```

**Derived visible status:**

| Condition | User-facing label |
|---|---|
| `is_active = true AND cancel_at IS NULL` | Active |
| `is_active = true AND cancel_at IS NOT NULL` | Active until {cancel_at} |
| `is_active = false AND canceled_at IS NOT NULL` | Canceled |
| Invoice past due (from `invoice.status='open'` past due) | Payment issue — update card |

### 25.4 Webhook Events Handled

Every relevant Stripe event is written to `billing_event` as an immutable record and processed idempotently. Duplicate events (same `stripe_event_id`) are no-ops.

| Event | Action |
|---|---|
| `checkout.session.completed` | Create subscription row; propagate feature flags |
| `customer.subscription.created` | Ensure row exists; sync `current_period_end` |
| `customer.subscription.updated` | Update tier, `current_period_end`, `cancel_at`; re-propagate flags if tier changed |
| `customer.subscription.deleted` | Set `is_active = false`, `canceled_at`; downgrade flags to free |
| `invoice.paid` | Insert `invoice` row with `status='paid'`; extend `current_period_end` |
| `invoice.payment_failed` | Insert/update `invoice`; start dunning (§25.7) |
| `customer.updated` | Sync payment method reference |

### 25.5 Feature Flag Propagation

On any subscription change, a service-owned job updates `feature_flag` rows for the tenant per the feature registry in §20.3.1. The job completes within 30 seconds of webhook receipt. An `admin_action_log` entry records the propagation with `actor_role='system'`.

### 25.6 Cancellation & Access Preservation

Users cancel via `POST /billing/subscription/cancel`, which calls Stripe to schedule cancel-at-period-end. The user retains full tier access until `current_period_end`. At that point, the webhook `customer.subscription.deleted` fires, access drops to `free`, and an `access_downgraded` notification is sent.

Users can uncancel during the grace period by calling `POST /billing/subscription/cancel?undo=true` before `cancel_at`.

### 25.7 Dunning (Failed Payment Flow)

| T | Action |
|---|---|
| Day 0 | `invoice.payment_failed` received; notification sent to tenant admin; Stripe begins automatic retry schedule |
| Day 3 | Reminder notification if still unpaid |
| Day 7 | Final notice notification |
| Day 14 | If still unpaid and Stripe has exhausted retries, `customer.subscription.deleted` fires; access drops to free |

Throughout dunning, users retain tier access. The grace period is administrable per-tenant by platform_admin (default 14 days).

### 25.8 Tax Handling

- AU-resident tenants: GST 10%, computed by Stripe Tax from the billing address.
- Other APAC: computed per Stripe Tax rules; MindMosaic does not manually compute tax.
- Invoices returned from Stripe carry tax line items; MindMosaic displays them verbatim.

### 25.9 Refund Policy & Flow

Refunds are not self-service. A refund request creates a ticket; approved refunds are issued via Stripe Dashboard by platform_admin, which generates a `charge.refunded` webhook that writes an `admin_action_log` entry.

### 25.10 Institutional Tier Specifics

- Flat annual price per Stripe quote (not self-serve checkout).
- Invoices issued manually via Stripe; `invoice.paid` webhook mirrors to local state.
- Bulk seat counts governed by `subscription.config.seat_limit`.
- SSO (SAML) configured separately by platform_admin at tenant creation.

---

## 26. Engagement

The engagement layer provides the streak, goal, achievement, and nudge surfaces visible in the student app. Its outputs are derived from sessions and Intelligence Stack state — it does not replicate any business logic from other layers.

### 26.1 Goals of the Engagement Layer

- Reinforce consistent practice without creating unhealthy pressure.
- Celebrate meaningful milestones (mastery, repair completion, stretch success) — not just time spent.
- Surface gentle nudges that match the student's current state (e.g., "You've been fatigued lately — try a shorter session today").

### 26.2 Streaks

A streak is a count of consecutive days on which the student completed at least one session (any mode, any duration > 2 minutes).

```
engagement_streak {
  student_id: uuid                   -- PK
  tenant_id: uuid
  current_days: int
  best_days: int
  last_active_date: date | null
}
```

**Update rule** (daily cron `engagement.streaks`):

- If `last_active_date = today`: no change.
- If `last_active_date = today - 1 day`: `current_days += 1`; update `best_days` if exceeded.
- Otherwise: `current_days = 0` (streak broken).

Session completion during the day bumps the streak counter immediately via an async job (`engagement.streak_touch`) so the UI reflects the new value without waiting for the daily cron.

### 26.3 Weekly Goals

Each student has a weekly goal with two targets: **sessions** (count) and **minutes** (active duration). Defaults by year level:

| Year | Sessions / week | Minutes / week |
|---|---|---|
| 1–3 | 3 | 45 |
| 4–6 | 4 | 80 |
| 7–9 | 5 | 120 |
| 10–12 | 5 | 150 |

Parents can adjust per student via `PATCH /users/{id}` preferences. Goals reset every Monday 00:00 in the student's locale.

### 26.4 Achievements

Achievements are static definitions stored globally; individual earnings are stored per student.

```
achievement_definition {
  id: uuid
  key: string                        -- e.g., "first_repair_completed", "seven_day_streak"
  name: string
  description: string | null
  tier: enum                         -- bronze | silver | gold | platinum
  criteria: jsonb                    -- rule spec (see below)
  icon: string | null
}

student_achievement {
  student_id: uuid
  achievement_id: uuid
  tenant_id: uuid
  earned_at: timestamptz
}
```

**Criteria format** — a DSL evaluated by `engagement.achievement_evaluate` post-session:

```
{ "type": "counter", "event": "session_completed", "threshold": 10 }
{ "type": "streak", "min_days": 7 }
{ "type": "repair_resolved", "min_count": 1 }
{ "type": "mastery_reached", "domain_id": "uuid", "threshold": 0.9 }
{ "type": "stretch_success", "min_count": 3 }
```

New achievements are added by inserting rows, not code changes. Evaluation is idempotent: a student cannot earn the same achievement twice.

### 26.5 Nudges

Nudges are contextual, temporary suggestions surfaced on the dashboard. They are rule-derived at read time (not persisted) so they reflect the latest state.

| Nudge | Condition | Message (example) |
|---|---|---|
| `take_a_break` | Guess rate in last session > 0.4 | "Feeling unsure? A short break often helps." |
| `try_shorter` | Fatigue detected in last 3 sessions | "Try a 10-minute practice today — shorter sessions are working well." |
| `celebrate_streak` | `current_days` divisible by 7 | "7-day streak — beautifully done." |
| `resume_repair` | Repair `in_progress` with no activity in 3+ days | "Come back to 'Understanding Fractions' — you're two stages in." |
| `weekly_goal_close` | `completed / target ≥ 0.75` Friday or later | "One more session hits your weekly goal." |

### 26.6 Guardrails

- Nudges are never alarming. Language is warm, short, non-quantitative.
- No nudge may appear more than once per 48 hours per type.
- Parent preference `engagement.nudges_enabled = false` suppresses all nudges.
- No streak pressure for students under 8 (streaks display hidden by default for Year 1–2).

### 26.7 Engagement Does Not Drive Recommendations

The engagement layer is strictly read-model + gamification. It does not modify plans, repair queues, or intelligence state. Orchestration (§16) may use engagement signals (e.g., `current_days`, fatigue from L2) as inputs to plan generation but engagement entities themselves are never written to by the orchestrator.

---

## 27. Notifications

The notification layer delivers in-app alerts to every persona. It is transport-agnostic: emails and push notifications are downstream transports that consume the same `notification` table.

### 27.1 Entity

```
notification {
  id: uuid
  user_id: uuid                      -- recipient
  tenant_id: uuid
  type: enum                         -- see taxonomy below
  title: string
  body: string
  link: string | null                -- deep link into the app
  read_at: timestamptz | null
  metadata: jsonb                    -- type-specific payload
  created_at: timestamptz
}
```

### 27.2 Type Taxonomy

| Type | Recipient | Trigger | Link |
|---|---|---|---|
| `assignment_assigned` | Student | Teacher publishes assignment | `/assignments` |
| `assignment_due_soon` | Student | Daily cron, 24h before `due_at` | `/assignments` |
| `assignment_overdue` | Student + teacher | `due_at + 24h` cron | `/assignments` |
| `repair_ready` | Student | L4 queues new `repair_record` | `/learning-hub#repairs` |
| `plan_updated` | Student / parent | Orchestration replans materially (sessions added/removed) | `/` |
| `achievement_earned` | Student | L26 evaluator records new achievement | `/engagement` |
| `intervention_alert` | Teacher | L7 creates new `intervention_alert` | `/teacher#alerts` |
| `subscription_active` | Subscriber | Stripe `checkout.session.completed` | `/parent/billing` |
| `subscription_payment_failed` | Subscriber | Stripe `invoice.payment_failed` | `/parent/billing` |
| `access_downgraded` | Subscriber | Subscription ends | `/parent/billing` |
| `system` | Any | Platform announcements | Custom |

### 27.3 Delivery Rules

- Notifications are created via the transactional outbox pattern — the domain that triggers the notification writes both its domain change and an `outbox_event` in one transaction; a dispatcher creates the `notification` row.
- Students and parents can configure per-type email delivery in preferences; in-app notifications are always on.
- A "materially material" plan update suppresses minor plan changes to avoid noise: reordering sessions does not notify, but adding a new repair session does.
- A user may have at most 100 unread notifications; older unread ones are silently read-marked to keep the UI bounded.

### 27.4 Read-State Semantics

- `GET /notifications/me?unread=true` returns unread only.
- `PATCH /notifications/{id}/read` marks a single notification read.
- `POST /notifications/read-all` marks all read (clears the bell indicator).
- Read notifications are retained 90 days then deleted.

### 27.5 Not Handled Here

- **Email transport:** owned by a separate transactional email service (e.g., Postmark, Resend). Emails subscribe to the `outbox_event` stream with type `notification_created` and render templated email per type.
- **Push transport:** deferred to Phase 5.
- **SMS:** out of scope.

---

## 23. Roadmap

### Phase 1 — MVP (Current)

**Goal:** Launch NAPLAN + ICAS exam preparation with foundational intelligence.

Deliverables:

- AdaptiveEngine (NAPLAN), LinearEngine (ICAS), SkillEngine, DiagnosticEngine — fully operational.
- Unified skill taxonomy (Australian Curriculum v9 mapped) with prerequisite DAG.
- Question schema with distractor rationale support, content pipeline (JSON import, dry-run validation, bulk generation).
- **Intelligence:** Foundation layer (mastery, velocity, retention, confidence). Behaviour layer (guessing detection, fatigue, persistence). Basic causal layer (root cause identification via dependency traversal).
- Rules-based recommendation engine with weekly plan generation.
- Student, parent, and admin dashboards.
- Multi-tenant architecture with RLS.
- Subscription gating (Free / Standard tiers).
- Deployment: Supabase + Vercel, Turborepo monorepo.

### Phase 2 — Intelligence Expansion

**Goal:** Add pathways, deploy full intelligence stack, launch teacher tools.

Deliverables:

- Selective Entry and Singapore Math pathways.
- **Intelligence:** Misconception classification system with repair sequences. Full concept repair engine (RepairEngine). Predictive intelligence (exam readiness, performance forecasting, mastery timelines). Stretch intelligence. Teacher intervention intelligence (auto-grouping, alerts, assignment generation).
- Cross-pathway intelligence (enhanced root cause convergence, context-weighted skill transfer, comprehensive readiness).
- Content intelligence loop (difficulty recalibration, discrimination updates, lifecycle management).
- Learning path orchestration (weekly plans, exam countdown, pathway switching).
- Teacher/tutor role with full analytics suite.
- Cohort benchmarking and predictive score bands.
- Premium and Institutional tier launch.
- Enhanced gamification (challenge mode, leaderboards).
- Mobile-optimised experience.
- Database read replicas for analytics performance.

### Phase 3 — Moat Features

**Goal:** Build defensible intelligence advantages that no competitor can easily replicate.

Deliverables:

- Olympiad / AMC pathway.
- IRT-based ability estimation (2PL model) replacing simple mastery calculation in Foundation layer.
- Bayesian Knowledge Tracing (BKT) for real-time skill mastery updates.
- AI-powered content generation (item authoring assistance with human review, including distractor rationale auto-generation).
- Advanced predictive analytics with ensemble models.
- Misconception auto-discovery from response pattern clustering (unsupervised learning).
- Institutional tier with custom branding, SSO, and SLA.
- Open API for third-party integrations (LMS, tutoring platforms).
- Internationalisation (additional curricula and languages).
- Parent-facing "Learning Report Card" — exportable PDF with term-over-term analysis.

---

---

# PART III.5 — v1 IMPLEMENTATION DECISIONS

This section records authoritative decisions that close ambiguities encountered during v1 implementation. They are binding on all v1 work. Where a decision modifies a rule stated earlier in the spec, the decision here takes precedence for v1.

## V1.1 Tenant auto-creation on signup (G1)

**Gap closed:** §20.2 lists roles but does not define how a brand-new user acquires a tenant. The `handle_new_user()` trigger (Backend Arch §2.2) must populate `user_profile.tenant_id` from somewhere.

**Decision — Parent self-signup (`/auth/signup` with `role=parent`):**

- Auto-creates a `tenant` row with:
  - `type = 'family'`
  - `name = "{display_name}'s Family"` (e.g. "Sarah Chen's Family")
  - `slug = <first 8 chars of uuid>-family`
  - `region = 'au-syd'`
  - `is_active = true`
- Parent attached: `user_profile` row with `tenant_id = <new tenant>.id`, `role = 'parent'`.
- `admin_action_log` entry with `actor_role = 'self_service_signup'`.

**Student direct signup:** Rejected. `/auth/signup` with `role=student` returns `422 UNPROCESSABLE` with `details.reason = 'students_created_via_parent_or_invite'`. Students are created via `POST /users/me/children` (family tenant, parent caller) or via teacher/org_admin invite (school tenant).

**School / tutor_centre tenants:** Created only by `platform_admin` via `scripts/create-school-tenant.ts` in v1. Self-serve school onboarding is **deferred to v1.1**.

**Teacher / tutor accounts:** Join existing tenants via signed-JWT email invite, 7-day TTL, issued by `platform_admin` or `org_admin`.

**Implementation:** `handle_new_user()` reads `auth.users.raw_user_meta_data.role` and branches; `/auth/signup` validates role before `auth.admin.createUser`; Zod `SignupRequestSchema` enforces a discriminated union on role.

---

## V1.2 Pre-Stripe flag management (G2)

**Gap closed:** §25 Billing requires Stripe as the authoritative writer of `subscription` and feature flags. v1 ships Stripe in the final week (Stages 42–47). What is the authoritative flag source before then?

**Decision — Stages 1–41: zero Stripe code.**

- `.env.example` lists `STRIPE_*` keys commented out with `# Added in Stage 42+`.
- No Stripe SDK in any `package.json` until Stage 42.
- `billing-svc` Edge Function not deployed until Stage 42.
- CI does not require `STRIPE_*` secrets pre-Stage 42.

**Decision — Flag management Stages 1–41:**

1. **Seed script** (`supabase/seeds/06_subscriptions.sql`) writes `subscription` rows with `stripe_subscription_id = NULL` and the full `feature_flag` set per §20.3.1.
2. **Admin script** `scripts/set-tenant-tier.ts` — `pnpm tsx scripts/set-tenant-tier.ts --tenant <uuid> --tier standard` writes subscription update + feature_flag propagation + `admin_action_log` entry.
3. Direct writes to `feature_flag` from application code outside these two sources are **forbidden in v1**.

**Decision — Stage 42 onward:**

Stripe webhook becomes authoritative writer of `subscription`; `pipeline.feature_flag_propagate` job writes `feature_flag`. Admin script remains for overrides; writes flags with `source = 'admin_override'`. Resolution order (per §20.3.1):

1. Tenant-specific `admin_override`
2. Tenant-specific `subscription` (Stripe-managed)
3. Platform-wide default (`tenant_id = NULL`)

---

## V1.3 X-Client-Version mismatch (G3)

**Gap closed:** Backend Arch §1.4 says "server logs mismatches" but does not define HTTP behaviour on mismatch.

**Decision — Log only, no rejection.** Every Edge Function:

1. Reads `X-Client-Version` header.
2. Compares to server `SCHEMA_VERSION` from `@mm/types`.
3. Emits log fields `client_version: string | null`, `client_version_mismatch: boolean`.
4. **Does not alter HTTP status, response body, or add a warning header on mismatch.**

**Rationale:** A stale client mid-session is strictly safer than a forced disconnect — autosave is fire-and-forget, lock tokens hold, server remains authoritative. Forced refresh requires a service-worker + session-resume mechanism that is out of v1 scope (deferred to v1.1).

---

## V1.4 Skill graph publish guard (G4)

**Gap closed:** Backend Arch §2.3 defines `publish_skill_graph()` with cycle detection. The migration worker that rewrites downstream references (`skill_mastery`, `student_misconception.evidence`, `repair_record.root_cause_skill_id`, `learning_plan.sessions`, `plan_override.target`, `assignment.target_skill_ids`) is **deferred to v1.1**. What prevents a v1 publish from orphaning student data?

**Decision — Code-level guard inside `publish_skill_graph()`:**

```sql
-- Inside publish_skill_graph(graph_id uuid):
SELECT EXISTS (SELECT 1 FROM skill_mastery LIMIT 1)
    OR EXISTS (SELECT 1 FROM student_misconception LIMIT 1)
    OR EXISTS (SELECT 1 FROM learning_plan WHERE status = 'active' LIMIT 1)
  INTO v_has_downstream_data;

v_allow_unsafe := COALESCE(current_setting('app.allow_unsafe_publish', true)::boolean, false);

IF v_has_downstream_data AND NOT v_allow_unsafe THEN
  RAISE EXCEPTION USING
    MESSAGE = 'publish_skill_graph blocked: downstream data present.',
    HINT    = 'Migration worker (v1.1) required. Set app.allow_unsafe_publish=true only for seed.',
    ERRCODE = 'raise_exception';
END IF;
```

**Seed usage:** `set_config('app.allow_unsafe_publish', 'true', true)` (transaction-local) before the initial publish call. Cleared automatically on transaction end.

**v1.1 removal:** When the skill-graph migration worker ships, this guard is replaced with a check that the migration job succeeded — not a blanket block.

---

## V1.5 Phase 1 content depth (G5)

**Gap closed:** §5 specifies the content model but not the v1 seed minimum. Replay determinism (Stage 20), adaptive routing through 3 stages, and meaningful causal detection require sufficient content per skill.

**Decision — Minimum seed for v1:**

| Entity | Count | Distribution |
|---|---|---|
| `item` | **50** | 25 NAPLAN Y5 Numeracy + 25 ICAS Math Paper C |
| Difficulty 0.3 (Developing) | 15 | 7 NAPLAN + 8 ICAS |
| Difficulty 0.55 (Proficient) | 20 | 10 NAPLAN + 10 ICAS |
| Difficulty 0.8 (Advanced) | 15 | 8 NAPLAN + 7 ICAS |
| `misconception` | **10** | Fractions (3), Place Value (2), Operations (3), Word Problems (2) |
| `stimulus` | **2** | 1 reading passage, 1 data table |
| `skill_node` | 6 skills + 2 strands + 1 domain | DAG for replay testing |
| `skill_edge` | 4 prerequisite edges | |
| `item_version` | 50 | One current version per item |

**Quality requirements:**

- Every MCQ has `distractor_rationale` mapping each wrong option to a `misconception_id` where applicable.
- Every item has `skill_tags ≥ 1`.
- Every item has `discrimination ≥ 0.3` (default 0.5 in seed).

**Synthetic content caveat:** Where a content author is unavailable, deterministic synthetic items are acceptable for v1 with `metadata.synthetic: true`. Flagged for replacement in v1.1.

**Validation:** `scripts/validate-content.ts` runs in CI. Asserts the counts above plus distractor rationale coverage and difficulty distribution within ±2 per tier.

---

## V1.6 Brand accent token scope (G6)

**Gap closed:** Mockups use three orange accents (`#ef6843`, `#ef8c56`, `#f9a825`) without scope rationale.

**Decision — Three-mode accent, scoped:**

- **`--accent-500 #ef6843`** — authoritative in-app accent. Used for: brand wordmark "Mosaic" on light surfaces, results hero ring glow (scored mode), celebration micro-moments, accent illustrations on dashboards.
- **`--accent-400 #ef8c56`** — restricted to purple surfaces (auth right panel, hero-on-purple patterns) where `--accent-500` lacks contrast.
- **`--accent-300 #f9a825`** — public marketing landing page only. **Not used anywhere in the authenticated app.**

Full token wiring lives in `UI_CONTRACT.md` §2.1.

---

## V1.7 v1 scope envelope

The following are **deferred to v1.1+** in v1. Spec sections covering them remain authoritative for v1.1+ implementation.

- §3.2.5 RepairEngine, §11 Concept Repair Engine (L4) — deferred
- §13 Stretch Intelligence (L6) — deferred
- §15 Content Intelligence Loop (L8) — deferred
- §16.3–§16.5 Exam Countdown / Pathway Switching / Long-Term Plan Generation — deferred
- §16.6.1 `override_plan_item` override type — deferred (v1 ships `pin_skill` + `dismiss_recommendation` only)
- §17 Cross-Pathway Intelligence — deferred
- §22.3.1 Cold-storage audit log archive — deferred
- §22.3.2 Self-serve data subject rights flows — deferred (manual admin process satisfies APP at launch scale)
- §22.6.2 Full metrics stack (OpenTelemetry, Sentry) — deferred (v1 uses Supabase logs + Vercel errors)
- §22.9.2 Skill graph migration worker — deferred (G4 guard substitutes)
- §25.7 Stripe dunning reminder flow — deferred
- §25.9 Refund audit workflow — deferred
- §25.10 Institutional tier specifics — deferred
- §26 Engagement layer (streaks, achievements, nudges) — display-only stubs in v1 dashboards; writers deferred
- §27 Email + Push transport — deferred (v1 keeps in-app only)
- §4.3 Selective Entry, §4.4 Singapore Math, §4.5 Olympiad/AMC pathways — deferred

Any v1 implementation work that touches a deferred section must stub with `// PHASE-2:` comments and grep-detectable "Available in a future release" UI copy.

---

## V1 Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-21 | G1–G6 initial resolutions (formerly SPEC_GAPS.md) | Unblocking v1 execution |
| 2026-04-26 | Folded G1–G6 into spec as Part III.5; added v1 scope envelope | Single source of truth for v1 decisions |

---

# PART IV — APPENDICES

---

## Appendix A: Glossary

| Term                           | Definition                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| **Pathway**                    | A learning track aligned to a specific exam family and year level                                         |
| **Framework**                  | The rule set governing an exam type (timing, navigation, scoring, structure)                              |
| **Engine**                     | The runtime component that drives session flow (item selection, routing, termination)                     |
| **Blueprint**                  | Content distribution specification for an assessment (skill targets, difficulty bands, counts)            |
| **Intelligence Stack**         | The nine-layer processing pipeline transforming session data into learning intelligence                   |
| **Learning DNA**               | Aggregated learner profile combining all intelligence layer outputs                                       |
| **Skill Mastery**              | Estimated proficiency on a specific skill (0.0–1.0)                                                       |
| **Learning Velocity**          | Rate of mastery change over a time window                                                                 |
| **Retention Estimate**         | Predicted current mastery accounting for time-based decay                                                 |
| **Confidence**                 | Certainty of the mastery estimate based on data volume and recency                                        |
| **Behaviour Profile**          | Aggregated behavioural signals: guessing rate, fatigue onset, persistence, cognitive load comfort         |
| **Misconception**              | A specific, named reasoning error producing predictable wrong-answer patterns                             |
| **Root Cause**                 | The deepest unmastered prerequisite skill in a dependency chain                                           |
| **Repair Sequence**            | A scaffolded instructional sequence targeting a misconception or root-cause gap                           |
| **Repair Trigger**             | A condition that causes the system to queue a concept repair (§11.0)                                      |
| **Misconception Category**     | Classification of a misconception type: conceptual, procedural, transfer, careless, or guessing (§10.3.1) |
| **Skill Edge**                 | A typed relationship between two skill nodes: prerequisite, related, or cross-domain (§5.1.2)             |
| **Upstream Traversal**         | Walking the skill graph toward foundations to find root causes (§5.1.3)                                   |
| **Downstream Traversal**       | Walking the skill graph toward advanced skills to find what mastering a skill unlocks (§5.1.4)            |
| **Explanation**                | Structured rationale attached to every intelligence decision, traceable to evidence (§7.4)                |
| **Intelligence Audit Log**     | Immutable record of every decision made by the intelligence stack (§7.4.2)                                |
| **Real-Time Adaptation**       | In-session difficulty and skill priority adjustments during live practice (§7.5)                          |
| **Long-Term Plan**             | Multi-week phased learning plan with weekly milestones (§16.5)                                            |
| **Pathway Transition**         | Orchestrated switch between learning pathways with gap analysis (§16.4.1)                                 |
| **Causal Map**                 | Per-student graph of root causes, misconceptions, and their downstream effects                            |
| **Stretch Readiness**          | Assessment of whether a student is ready for above-level content or competition pathways                  |
| **Cross-Pathway Intelligence** | Insights derived from performance data spanning multiple exam frameworks                                  |
| **Testlet**                    | A fixed group of items within an adaptive assessment stage                                                |
| **Routing**                    | The adaptive decision that selects the next testlet based on stage performance                            |
| **Orchestration**              | The capstone layer that synthesises all intelligence into a coherent learning plan                        |

## Appendix B: Key Data Entities Summary

| Entity                   | Primary Key              | Tenant-Scoped        | Intelligence Layer | Description                                                     |
| ------------------------ | ------------------------ | -------------------- | ------------------ | --------------------------------------------------------------- |
| `pathway`                | `id`                     | No (global)          | —                  | Learning track definition                                       |
| `framework_config`       | `id`                     | No                   | —                  | Exam rules and constraints                                      |
| `assessment_profile`     | `id`                     | No                   | —                  | Administrable assessment configuration                          |
| `blueprint`              | `id`                     | No                   | —                  | Content distribution spec                                       |
| `item`                   | `id`                     | No (shared)          | L8 (Content Loop)  | Question/task                                                   |
| `item_version`           | `(item_id, version)`     | No                   | L8 (Content Loop)  | Immutable content version (§22.9.1)                             |
| `stimulus`               | `id`                     | No                   | —                  | Shared passage/context                                          |
| `skill_node`             | `id`                     | No                   | —                  | Skill taxonomy node (§5.1.1)                                    |
| `skill_edge`             | `id`                     | No                   | L3 (Causal)        | Typed relationship between skills (§5.1.2)                      |
| `skill_graph_version`    | `id`                     | No                   | —                  | Graph-level version for curriculum changes (§22.9.2)            |
| `misconception`          | `id`                     | No                   | L3 (Causal)        | Named reasoning error with category taxonomy (§10.3.1)          |
| `repair_sequence`        | `id`                     | No                   | L4 (Repair)        | Scaffolded repair definition                                    |
| `learning_event`         | `id`                     | Yes                  | All layers         | Canonical event — single source of truth (§7.6)                 |
| `session_record`         | `id`                     | Yes                  | L1 (Foundation)    | Completed/abandoned session (§3.5.1)                            |
| `session_response`       | `id`                     | Yes                  | L1, L2             | Individual item response (§3.5.2)                               |
| `session_checkpoint`     | `session_id`             | Yes                  | —                  | Autosave state for recovery (§3.7)                              |
| `response_telemetry`     | `response_id`            | Yes                  | L2 (Behaviour)     | Behavioural metadata per response (§3.5.3)                      |
| `skill_mastery`          | `(student_id, skill_id)` | Yes                  | L1 (Foundation)    | Per-student skill state                                         |
| `learning_velocity`      | `(student_id, skill_id)` | Yes                  | L1 (Foundation)    | Mastery change rate                                             |
| `behaviour_profile`      | `student_id`             | Yes                  | L2 (Behaviour)     | Aggregated behaviour signals with defaults and staleness (§9.6) |
| `student_misconception`  | `id`                     | Yes                  | L3 (Causal)        | Per-student misconception record with status lifecycle          |
| `repair_record`          | `id`                     | Yes                  | L4 (Repair)        | Repair progress with state machine (§11.4)                      |
| `learning_plan`          | `id`                     | Yes                  | L9 (Orchestration) | Generated learning plan with status lifecycle                   |
| `plan_revision`          | `(plan_id, revision)`    | Yes                  | L9 (Orchestration) | Plan evolution tracking (§22.9.3)                               |
| `intervention_alert`     | `id`                     | Yes                  | L7 (Teacher)       | Teacher alert with status lifecycle                             |
| `intelligence_audit_log` | `id`                     | Yes                  | All layers         | Immutable decision audit trail (§7.4.2)                         |
| `pipeline_event`         | `id`                     | Yes                  | Pipeline           | Async pipeline step tracking with retry (§7.2.1)                |
| `job_queue`              | `id`                     | Yes                  | All services       | Unified async job system (§7.7)                                 |
| `feature_flag`           | `id`                     | Per-tenant or global | —                  | Feature gating configuration (§20.3.1)                          |
| `recommendation`         | `id`                     | Yes                  | L9 (Orchestration) | Generated recommendation                                        |
| `user_profile`           | `id`                     | Yes                  | —                  | User account and role                                           |
| `tenant`                 | `id`                     | N/A (root)           | —                  | Organisation or family account                                  |
| `subscription`           | `id`                     | Yes                  | —                  | Billing and feature tier                                        |
| `diagnostic_rule`        | `id`                     | No                   | L3 (Causal)        | Diagnostic branching rules                                      |
| `plan_override`          | `id`                     | Yes                  | L9 (Orchestration) | Parent/teacher plan override with expiry (§16.6.1)              |
| `skill_migration_map`    | composite                | No                   | —                  | old→new skill id mapping across graph versions (§22.9.2)        |
| `assignment`             | `id`                     | Yes                  | —                  | Teacher/system-authored work packet (§24.1)                     |
| `assignment_target`      | composite                | Yes                  | —                  | Student or class targeted by an assignment (§24.2)              |
| `assignment_session`     | `(assignment_id, student_id)` | Yes             | —                  | Per-student assignment lifecycle (§24.3)                        |
| `billing_customer`       | `tenant_id`              | Yes (one per tenant) | —                  | Stripe customer mapping (§25.1)                                 |
| `invoice`                | `id`                     | Yes                  | —                  | Stripe-mirrored invoice record (§25)                            |
| `billing_event`          | `id`                     | Yes                  | —                  | Audit of every Stripe webhook received (§25.4)                  |
| `engagement_streak`      | `student_id`             | Yes                  | —                  | Streak counter (§26.2)                                          |
| `achievement_definition` | `id`                     | No (global)          | —                  | Achievement catalog (§26.4)                                     |
| `student_achievement`    | composite                | Yes                  | —                  | Earned achievement per student (§26.4)                          |
| `notification`           | `id`                     | Yes                  | —                  | In-app notification per user (§27)                              |
| `admin_action_log`       | `id`                     | No (platform)        | —                  | Immutable audit of every admin write (§22.2)                    |
| `api_idempotency_key`    | `(idempotency_key, tenant_id)` | Yes            | —                  | Replay-safe request cache (§21.0.2)                             |
| `outbox_event`           | `id`                     | Yes                  | —                  | Transactional outbox for async dispatch (§7.2, §27.3)           |
| `rate_limit_bucket`      | `(bucket_key, window_start)` | No               | —                  | Table-backed rate limit counters (§22.2)                        |
| `cohort_metric_cache`    | composite                | No                   | —                  | Precomputed cohort analytics read-model (§19.5)                 |

## Appendix C: Intelligence Layer Summary

| #   | Layer                | Phase                  | Inputs                              | Outputs                                           | Processing | Key Metric                                  |
| --- | -------------------- | ---------------------- | ----------------------------------- | ------------------------------------------------- | --- | ------------------------------------------- |
| 1   | Foundation           | MVP                    | Session responses                   | Mastery, velocity, retention, confidence          | Sync <3s | Mastery accuracy vs. external assessment    |
| 2   | Behaviour            | MVP                    | Response telemetry                  | Guess rate, fatigue, persistence, cognitive load  | Sync <3s | Guess detection precision                   |
| 3a  | Causal (scoped)      | MVP                    | Foundation + Behaviour + Skill DAG (touched skills + depth-1 prereqs) | Fast-path misconception flags, suspected root causes | Sync <3s | Sync latency adherence |
| 3b  | Causal (full)        | MVP → P2               | Foundation + Behaviour + Skill DAG (full traversal) | Refined root causes, misconceptions, causal map | Async <30s | Root cause hit rate (does repair work?)     |
| 4   | Concept Repair       | P2                     | Causal layer output                 | Repair sequences, resolution rate                 | Async <30s | Misconception resolution rate after repair  |
| 5   | Predictive           | P2                     | Foundation + Behaviour + Causal 3b  | Readiness predictions, mastery timelines          | Async <30s | Prediction accuracy vs. actual exam results |
| 6   | Stretch              | P2                     | Foundation + Predictive + Behaviour | Stretch recommendations, pathway suggestions      | Async <30s | Student engagement with stretch content     |
| 7   | Teacher Intervention | P2                     | Foundation + Behaviour + Causal 3b  | Auto-groups, alerts, assignments                  | Async <30s | Teacher action rate on alerts               |
| 8   | Content Loop         | P2                     | Aggregate Foundation data           | Recalibrated difficulty, discrimination, coverage | Batch hourly | Item quality improvement over time          |
| 9   | Orchestration        | P2                     | All layers                          | Weekly plans, countdown plans, pathway plans      | Async <30s | Plan adherence rate, outcome improvement    |

---

_End of specification._
