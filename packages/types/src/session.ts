import { z } from 'zod';
import { SessionIdSchema, SessionModeSchema, AssignmentIdSchema } from './shared.js';
import { ItemDTOSchema } from './content.js';

const NavigationSchema = z.object({
  can_go_back: z.boolean(),
  can_skip: z.boolean(),
  can_flag: z.boolean(),
});

const ProgressSchema = z.object({
  answered: z.number().int(),
  total: z.number().int().nullable(),
  time_remaining_ms: z.number().int().nullable(),
});

// ─── PracticeExamComposerParams (v1.1-S2, ADR-0036) ─────────────────────────
// Optional, additive extension to CreateSessionRequest. When present, the
// session is composed from the question bank by pathway + difficulty mix +
// time limit. Bounds per ADR-0036 §Bounds; integer-distribution model per
// Decision 6 (sum of band counts === item_count).
//
// item_count ∈ [5, 80]; time_limit_ms ∈ [300_000, 10_800_000].
// difficulty_distribution: integer counts per band, each ≥ 0, sum === item_count.

const DifficultyDistributionSchema = z.object({
  easy: z.number().int().nonnegative(),
  mid:  z.number().int().nonnegative(),
  hard: z.number().int().nonnegative(),
});
export type DifficultyDistribution = z.infer<typeof DifficultyDistributionSchema>;

export const PracticeExamComposerParamsSchema = z
  .object({
    item_count: z.number().int().min(5).max(80),
    difficulty_distribution: DifficultyDistributionSchema,
    time_limit_ms: z.number().int().min(300_000).max(10_800_000),
  })
  .refine(
    (v) => v.difficulty_distribution.easy + v.difficulty_distribution.mid + v.difficulty_distribution.hard === v.item_count,
    {
      message: 'difficulty_distribution band counts must sum to item_count',
      path: ['difficulty_distribution'],
    },
  )
  .refine(
    (v) => v.difficulty_distribution.easy + v.difficulty_distribution.mid + v.difficulty_distribution.hard > 0,
    {
      message: 'difficulty_distribution must contain at least one item across all bands',
      path: ['difficulty_distribution'],
    },
  );
export type PracticeExamComposerParams = z.infer<typeof PracticeExamComposerParamsSchema>;

// ─── SimulationParams (v1.1-S3, ADR-0037) ───────────────────────────────────
// Optional, additive extension to CreateSessionRequest. When present, the
// session is administered under strict simulation-exam conditions. Orthogonal
// to PracticeExamComposerParams — both can be set on the same request (compose
// then administer). Minimum flag set per ADR-0037 §Decision 2:
// - no_back_nav: locks LinearEngine.canNavigateBack to false. Enforced server-side.
// - hide_feedback_until_submit: gates per-item feedback exposure in
//   respondToSession (handlers.ts:535 — is_correct returned as null when true).
// Both flags default-true when simulation_params is present.
// strict_timing intentionally OMITTED — redundant against mode='exam'
// server-authoritative timing per spec §18 'Exam' row.

export const SimulationParamsSchema = z.object({
  no_back_nav: z.boolean().default(true),
  hide_feedback_until_submit: z.boolean().default(true),
});
export type SimulationParams = z.infer<typeof SimulationParamsSchema>;

export const CreateSessionRequestSchema = z.object({
  assessment_profile_id: z.string().uuid().nullable(),
  repair_sequence_id: z.string().uuid().nullable(),
  assignment_id: AssignmentIdSchema.nullable(),
  mode: SessionModeSchema,
  target_skills: z.array(z.string()).nullable(),
  pathway_id: z.string().nullable(),
  composer_params: PracticeExamComposerParamsSchema.optional(),
  simulation_params: SimulationParamsSchema.optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const CreateSessionResponseSchema = z.object({
  session_id: SessionIdSchema,
  mode: z.string(),
  engine_type: z.string(),
  total_items: z.number().int().nullable(),
  time_limit_ms: z.number().int().nullable(),
  first_item: ItemDTOSchema,
  navigation: NavigationSchema,
  lock_token: z.string(),
  version: z.number().int(),
});
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

export const RecordResponseRequestSchema = z.object({
  item_id: z.string().uuid(),
  response_data: z.record(z.string(), z.unknown()),
  telemetry: z.object({
    time_to_answer_ms: z.number().int(),
    time_to_first_action_ms: z.number().int(),
    answer_changes: z.number().int(),
    items_since_session_start: z.number().int(),
    time_since_session_start_ms: z.number().int(),
    skipped_then_returned: z.boolean(),
    scroll_to_bottom: z.boolean().nullable(),
  }),
  expected_version: z.number().int(),
});
export type RecordResponseRequest = z.infer<typeof RecordResponseRequestSchema>;

export const RecordResponseResponseSchema = z.object({
  is_correct: z.boolean().nullable(),
  explanation: z.record(z.string(), z.unknown()).nullable(),
  next_item: ItemDTOSchema.nullable(),
  termination: z
    .object({
      reason: z.string(),
      auto_submitted: z.boolean(),
    })
    .nullable(),
  progress: ProgressSchema,
  version: z.number().int(),
  // ADR-0026 (Q-19.4): server rotates the lock_token on every successful
  // respond. Client echoes the new token via X-Session-Lock on the next
  // /respond, /checkpoint, or /abandon. Mismatch → 409 LOCK_CONFLICT.
  lock_token: z.string(),
});
export type RecordResponseResponse = z.infer<typeof RecordResponseResponseSchema>;

export const SubmitSessionResponseSchema = z.object({
  session_id: SessionIdSchema,
  status: z.literal('submitted'),
  score: z.object({
    raw: z.number().nullable(),
    scaled: z.number().nullable(),
    band: z.string().nullable(),
  }),
  summary: z.object({
    items_answered: z.number().int(),
    items_correct: z.number().int(),
    duration_ms: z.number().int(),
    active_duration_ms: z.number().int(),
    skills_touched: z.array(z.string()),
  }),
  pipeline_status: z.enum(['pending', 'sync_complete']),
});
export type SubmitSessionResponse = z.infer<typeof SubmitSessionResponseSchema>;

export const SessionStateDTOSchema = z.object({
  session_id: SessionIdSchema,
  status: z.literal('active'),
  engine_type: z.string(),
  mode: z.string(),
  current_item: ItemDTOSchema,
  progress: ProgressSchema,
  navigation: NavigationSchema,
  answered_item_ids: z.array(z.string()),
  lock_token: z.string(),
  version: z.number().int(),
  // v1.1-S5 (ADR-0039 Q-1.1-5.4 Option a): server-authoritative simulation flag.
  // assessment-svc resumeSession derives this from engine_state_snapshot.simulation_params.
  // Additive; clients read only. Persists correctly on session resume.
  is_simulation: z.boolean(),
});
export type SessionStateDTO = z.infer<typeof SessionStateDTOSchema>;

export const SessionSummaryDTOSchema = z.object({
  session_id: SessionIdSchema,
  mode: z.string(),
  pathway_name: z.string().nullable(),
  started_at: z.string().datetime(),
  submitted_at: z.string().datetime().nullable(),
  duration_ms: z.number().int().nullable(),
  active_duration_ms: z.number().int().nullable(),
  score_band: z.string().nullable(),
  raw_score: z.number().nullable(),
  skills_touched_count: z.number().int(),
});
export type SessionSummaryDTO = z.infer<typeof SessionSummaryDTOSchema>;

export const AbandonSessionResponseSchema = z.object({
  session_id: SessionIdSchema,
  status: z.literal('abandoned'),
});
export type AbandonSessionResponse = z.infer<typeof AbandonSessionResponseSchema>;

export const CheckpointRequestSchema = z.object({
  checkpoint_number: z.number().int(),
  current_question_index: z.number().int(),
  answers: z.array(
    z.object({
      item_id: z.string().uuid(),
      sequence_number: z.number().int(),
      response_data: z.record(z.string(), z.unknown()),
    }),
  ),
  client_timestamp: z.string().datetime(),
});
export type CheckpointRequest = z.infer<typeof CheckpointRequestSchema>;
