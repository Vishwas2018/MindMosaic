/**
 * Engine contracts — Spec §3.1 verbatim signatures + supporting types.
 *
 * Implementation discipline (per ADR-0022):
 * - Engines are pure-function namespaces, not classes.
 * - EngineState is fully JSON-serialisable: no Map/Set/Date/functions, only
 *   primitives + plain objects. The state lands in
 *   `session_record.engine_state_snapshot jsonb` (arch §5).
 * - Clocks are injected per-call (`getTimeRemaining`, `terminate`) — never
 *   captured in EngineState. This is the replay-determinism contract.
 * - No `Math.random`, no `Date.now` inside engine bodies.
 *
 * Stage 16 widens (per ADR-0023):
 * - EngineState is a discriminated union (linear | skill | diagnostic).
 * - EngineItem is the server-side item shape (extends ItemDTO with skill_ids
 *   + difficulty so engines can reason about them; assessment-svc projects
 *   to ItemDTO before sending to client).
 * - EngineResponse carries optional telemetry for the §9.5 cognitive load
 *   formula.
 *
 * Spec refs: §3.1 (interface), §3.2.2 (LinearEngine), §3.2.3 (SkillEngine),
 * §3.2.4 (DiagnosticEngine), §3.7 (deterministic scoring), §7.5.1 (in-session
 * difficulty rule), §7.5.2 (skill prioritisation), §8.4 (confidence model),
 * §9.5 (cognitive load), §22.7.1 (testability via mock FrameworkConfig +
 * Session).
 */
import { z } from 'zod';
import {
  ItemIdSchema,
  SessionIdSchema,
  SkillIdSchema,
  SessionModeSchema,
  type ItemId,
  type SessionId,
  type SessionMode,
  type SkillId,
} from '@mm/types';
import { ItemDTOSchema, type ItemDTO } from '@mm/types';
import { MasteryBandSchema, type MasteryBand } from '@mm/types';

// ─── Engine type discriminator ───────────────────────────────────────────────
// Mirrors DB enum `engine_type` from supabase/migrations/0001_enums_tenancy_auth.sql:62.

export const EngineTypeSchema = z.enum(['adaptive', 'linear', 'skill', 'diagnostic', 'repair']);
export type EngineType = z.infer<typeof EngineTypeSchema>;

// ─── Termination ─────────────────────────────────────────────────────────────
// Stage 15 set the four base values; Stage 16 adds three engine-specific reasons.

export const TerminationReasonSchema = z.enum([
  'completed',
  'timer_expired',
  'user_submitted',
  'abandoned',
  'mastery_reached',           // Stage 16 — SkillEngine
  'max_items_reached',         // Stage 16 — DiagnosticEngine
  'confidence_threshold_met',  // Stage 16 — DiagnosticEngine
]);
export type TerminationReason = z.infer<typeof TerminationReasonSchema>;

export const TerminationSignalSchema = z.object({
  termination: z.literal(true),
  reason: TerminationReasonSchema,
});
export type TerminationSignal = z.infer<typeof TerminationSignalSchema>;

export function isTerminationSignal(
  value: ItemDTO | TerminationSignal,
): value is TerminationSignal {
  return (value as TerminationSignal).termination === true;
}

// ─── EngineItem (server-side item shape) ─────────────────────────────────────
// Extends the network ItemDTO with skill mapping + difficulty + discrimination
// — fields engines need but the wire format omits. EngineItem IS-A ItemDTO,
// so values flow into ItemDTO consumers without projection.

export const EngineItemSchema = ItemDTOSchema.extend({
  skill_ids: z.array(SkillIdSchema).min(1),
  difficulty: z.number().min(0).max(1),
  discrimination: z.number().min(0).nullable().optional(),
});
export type EngineItem = z.infer<typeof EngineItemSchema>;

// ─── Session context (engine-only subset of session_record) ──────────────────
// Q-15.4: derived view, never the full DB row. Tenancy/audit columns stay out.
// planned_items is now EngineItem[] (Q-16.5); the assessment-svc populates this
// from content-svc. For SkillEngine + DiagnosticEngine this is the *available
// pool*, not a delivery sequence.

export const SessionContextSchema = z.object({
  session_id: SessionIdSchema,
  mode: SessionModeSchema,
  engine_type: EngineTypeSchema,
  total_items: z.number().int().nullable(),
  time_limit_ms: z.number().int().positive().nullable(),
  started_at: z.string().datetime(),
  planned_items: z.array(EngineItemSchema),
  // Stage 16 — required for SkillEngine + DiagnosticEngine; null/empty for Linear.
  target_skills: z.array(SkillIdSchema).default([]),
});
export type SessionContext = z.infer<typeof SessionContextSchema>;

// ─── FrameworkConfig (engine-only subset) ────────────────────────────────────
// Q-15.3 + Q-16.3/7/8/10: engine-only fields. Stage 16 adds engine-specific
// thresholds; defaults documented inline. Helper `withDefaults(partial)` exists
// in test fixtures for ergonomic construction.

export const ScoringRulesSchema = z.object({
  scaled_score_formula: z.enum(['identity', 'percentage']),
  bands: z
    .array(
      z.object({
        min: z.number(),
        max: z.number(),
        label: z.string(),
      }),
    )
    .min(1),
});
export type ScoringRules = z.infer<typeof ScoringRulesSchema>;

export const FrameworkConfigSchema = z.object({
  engine_type: EngineTypeSchema,
  scoring_rules: ScoringRulesSchema,
  time_limit_ms: z.number().int().positive().nullable(),
  back_navigation_enabled: z.boolean(),
  flag_for_review_enabled: z.boolean(),
  // ── Stage 16 thresholds ───────────────────────────────────────────────────
  // SkillEngine
  mastery_threshold: z.number().min(0).max(1).default(0.85),         // Q-16.3
  difficulty_step_up: z.number().min(0).max(1).default(0.1),
  difficulty_step_down: z.number().min(0).max(1).default(0.15),
  cognitive_load_threshold: z.number().min(0).max(1).default(0.8),
  cognitive_load_step_down: z.number().min(0).max(1).default(0.1),
  expected_time_per_item_ms: z.number().int().positive().default(30_000),
  // DiagnosticEngine
  max_items: z.number().int().positive().default(20),                // Q-16.8
  confidence_threshold: z.number().min(0).max(1).default(0.7),       // Q-16.7
  diagnostic_start_difficulty: z.number().min(0).max(1).default(0.5), // Q-16.10
});
export type FrameworkConfig = z.infer<typeof FrameworkConfigSchema>;

// ─── Engine response ─────────────────────────────────────────────────────────
// Stage 16: telemetry is optional. SkillEngine reads it for the §9.5 cognitive
// load formula; LinearEngine + DiagnosticEngine ignore it.

export const EngineResponseTelemetrySchema = z.object({
  time_to_answer_ms: z.number().int().nonnegative(),
  answer_changes: z.number().int().nonnegative(),
});
export type EngineResponseTelemetry = z.infer<typeof EngineResponseTelemetrySchema>;

export const EngineResponseSchema = z.object({
  item_id: ItemIdSchema,
  is_correct: z.boolean(),
  response_data: z.record(z.string(), z.unknown()),
  answered_at: z.string().datetime(),
  telemetry: EngineResponseTelemetrySchema.optional(),
});
export type EngineResponse = z.infer<typeof EngineResponseSchema>;

// ─── EngineState (discriminated union by engine_type) ────────────────────────

export const LinearEngineStateSchema = z.object({
  engine_type: z.literal('linear'),
  session_id: SessionIdSchema,
  mode: SessionModeSchema,
  planned_items: z.array(EngineItemSchema),
  current_index: z.number().int().nonnegative(),
  responses: z.array(EngineResponseSchema),
  flagged_item_ids: z.array(ItemIdSchema),
  started_at: z.string().datetime(),
  time_limit_ms: z.number().int().positive().nullable(),
  total_items: z.number().int().nonnegative(),
});
export type LinearEngineState = z.infer<typeof LinearEngineStateSchema>;

const SkillStateEntrySchema = z.object({
  skill_id: SkillIdSchema,
  items_attempted: z.number().int().nonnegative(),
  items_correct: z.number().int().nonnegative(),
  last_difficulty: z.number().min(0).max(1),
  consecutive_correct: z.number().int().nonnegative(),
  consecutive_incorrect: z.number().int().nonnegative(),
  estimated_mastery: z.number().min(0).max(1),
});
export type SkillStateEntry = z.infer<typeof SkillStateEntrySchema>;

export const SkillEngineStateSchema = z.object({
  engine_type: z.literal('skill'),
  session_id: SessionIdSchema,
  mode: SessionModeSchema,
  started_at: z.string().datetime(),
  time_limit_ms: z.number().int().positive().nullable(),
  target_skills: z.array(SkillIdSchema),
  per_skill_state: z.array(SkillStateEntrySchema),
  current_difficulty: z.number().min(0).max(1),
  current_skill_id: SkillIdSchema.nullable(),
  responses: z.array(EngineResponseSchema),
  answered_item_ids: z.array(ItemIdSchema),
  // Pool of items available for selection. Mirrors arch §5
  // engine_state_snapshot.planned_items but used as a *pool* not a *sequence*.
  item_pool: z.array(EngineItemSchema),
  mastery_threshold: z.number().min(0).max(1),
  difficulty_step_up: z.number().min(0).max(1),
  difficulty_step_down: z.number().min(0).max(1),
  cognitive_load_threshold: z.number().min(0).max(1),
  cognitive_load_step_down: z.number().min(0).max(1),
  expected_time_per_item_ms: z.number().int().positive(),
});
export type SkillEngineState = z.infer<typeof SkillEngineStateSchema>;

const DiagnosticProbeSchema = z.object({
  skill_id: SkillIdSchema,
  low_difficulty: z.number().min(0).max(1),
  high_difficulty: z.number().min(0).max(1),
  items_administered: z.number().int().nonnegative(),
  estimated_mastery: z.number().min(0).max(1),
  estimated_confidence: z.number().min(0).max(1),
});
export type DiagnosticProbe = z.infer<typeof DiagnosticProbeSchema>;

export const DiagnosticEngineStateSchema = z.object({
  engine_type: z.literal('diagnostic'),
  session_id: SessionIdSchema,
  mode: SessionModeSchema,
  started_at: z.string().datetime(),
  time_limit_ms: z.number().int().positive().nullable(),
  target_skills: z.array(SkillIdSchema),
  per_skill_probe: z.array(DiagnosticProbeSchema),
  responses: z.array(EngineResponseSchema),
  answered_item_ids: z.array(ItemIdSchema),
  item_pool: z.array(EngineItemSchema),
  current_target_skill: SkillIdSchema.nullable(),
  max_items: z.number().int().positive(),
  confidence_threshold: z.number().min(0).max(1),
  diagnostic_start_difficulty: z.number().min(0).max(1),
});
export type DiagnosticEngineState = z.infer<typeof DiagnosticEngineStateSchema>;

// Stage 16 widens EngineState (Q-16.1 / ADR-0023). Stage 17 will add
// AdaptiveEngineState as a fourth branch.
export const EngineStateSchema = z.discriminatedUnion('engine_type', [
  LinearEngineStateSchema,
  SkillEngineStateSchema,
  DiagnosticEngineStateSchema,
]);
export type EngineState = z.infer<typeof EngineStateSchema>;

// ─── ScoreResult & FinalResult ───────────────────────────────────────────────
// Q-15.6: engine emits a superset of SubmitSessionResponse.score; assessment-svc
// projects to the API DTO. Q-16.6: score() stays on the spec interface for all
// engines; SkillEngine + DiagnosticEngine emit neutral values (raw=items_correct
// or 0, scaled=0, band=null) because their real outputs come via
// `masteryDelta()` / `proficiencyMap()` helpers.

export const ScoreResultSchema = z.object({
  raw: z.number(),
  scaled: z.number(),
  band: z.string().nullable(),
  items_correct: z.number().int().nonnegative(),
  items_answered: z.number().int().nonnegative(),
  duration_ms: z.number().int().nonnegative(),
  skills_touched: z.array(SkillIdSchema),
});
export type ScoreResult = z.infer<typeof ScoreResultSchema>;

export const FinalResultSchema = z.object({
  state: EngineStateSchema,
  score: ScoreResultSchema,
  reason: TerminationReasonSchema,
  terminated_at: z.string().datetime(),
});
export type FinalResult = z.infer<typeof FinalResultSchema>;

// ─── Engine-specific output helpers ──────────────────────────────────────────
// Q-16.6: real outputs for unscored engines. Assessment-svc (Stage 19) calls
// the right helper after reading session_record.engine_type.

export const MasteryDeltaEntrySchema = z.object({
  skill_id: SkillIdSchema,
  items_attempted: z.number().int().nonnegative(),
  items_correct: z.number().int().nonnegative(),
  delta_mastery: z.number(),                           // signed: pre-session estimate is 0 in v1
  new_estimated_mastery: z.number().min(0).max(1),
});
export type MasteryDeltaEntry = z.infer<typeof MasteryDeltaEntrySchema>;

export const MasteryDeltaResultSchema = z.object({
  per_skill: z.array(MasteryDeltaEntrySchema),
  duration_ms: z.number().int().nonnegative(),
});
export type MasteryDeltaResult = z.infer<typeof MasteryDeltaResultSchema>;

export const ProficiencySkillEntrySchema = z.object({
  skill_id: SkillIdSchema,
  band: MasteryBandSchema,
  mastery_level: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  items_administered: z.number().int().nonnegative(),
});
export type ProficiencySkillEntry = z.infer<typeof ProficiencySkillEntrySchema>;

export const ProficiencyResultSchema = z.object({
  skills: z.array(ProficiencySkillEntrySchema),
  duration_ms: z.number().int().nonnegative(),
});
export type ProficiencyResult = z.infer<typeof ProficiencyResultSchema>;

// ─── AssessmentEngine interface (Spec §3.1) ──────────────────────────────────

export interface AssessmentEngine {
  initialise(session: SessionContext, config: FrameworkConfig): EngineState;
  getNextItem(state: EngineState): ItemDTO | TerminationSignal;
  recordResponse(state: EngineState, response: EngineResponse): EngineState;
  score(state: EngineState): ScoreResult;
  canNavigateBack(state: EngineState): boolean;
  getTimeRemaining(state: EngineState, clock: () => number): number | null;
  terminate(
    state: EngineState,
    reason: TerminationReason,
    clock: () => number,
  ): FinalResult;
}

// ─── Discriminator assertions (narrow union → branch) ────────────────────────
// Engines call these at the top of every method body to narrow the EngineState
// union to their own branch — keeps the rest of the body free of casts.

export function assertLinearState(state: EngineState): asserts state is LinearEngineState {
  if (state.engine_type !== 'linear') {
    throw new Error(`LinearEngine: expected EngineState.engine_type='linear', got '${state.engine_type}'`);
  }
}

export function assertSkillState(state: EngineState): asserts state is SkillEngineState {
  if (state.engine_type !== 'skill') {
    throw new Error(`SkillEngine: expected EngineState.engine_type='skill', got '${state.engine_type}'`);
  }
}

export function assertDiagnosticState(
  state: EngineState,
): asserts state is DiagnosticEngineState {
  if (state.engine_type !== 'diagnostic') {
    throw new Error(`DiagnosticEngine: expected EngineState.engine_type='diagnostic', got '${state.engine_type}'`);
  }
}

// Re-exports for convenience.
export type { ItemDTO, ItemId, MasteryBand, SessionId, SessionMode, SkillId };
