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

export const CreateSessionRequestSchema = z.object({
  assessment_profile_id: z.string().uuid().nullable(),
  repair_sequence_id: z.string().uuid().nullable(),
  assignment_id: AssignmentIdSchema.nullable(),
  mode: SessionModeSchema,
  target_skills: z.array(z.string()).nullable(),
  pathway_id: z.string().nullable(),
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
