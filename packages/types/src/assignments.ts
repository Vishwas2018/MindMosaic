import { z } from 'zod';
import {
  AssignmentIdSchema,
  AssignmentStatusSchema,
  AssignmentSessionStatusSchema,
  UserIdSchema,
} from './shared.js';

const DifficultyRangeSchema = z.object({ min: z.number(), max: z.number() });

const CreatedBySchema = z.object({ id: z.string(), display_name: z.string() });

export const AssignmentDTOSchema = z.object({
  id: AssignmentIdSchema,
  title: z.string(),
  description: z.string().nullable(),
  mode: z.string(),
  pathway_id: z.string().uuid(),
  target_skill_ids: z.array(z.string()),
  target_skill_names: z.array(z.string()),
  difficulty_range: DifficultyRangeSchema.nullable(),
  item_count: z.number().int(),
  time_limit_ms: z.number().int().nullable(),
  due_at: z.string().datetime().nullable(),
  status: AssignmentStatusSchema,
  auto_generated: z.boolean(),
  rationale: z.string().nullable(),
  created_by: CreatedBySchema,
  created_at: z.string().datetime(),
  published_at: z.string().datetime().nullable(),
});
export type AssignmentDTO = z.infer<typeof AssignmentDTOSchema>;

export const CreateAssignmentRequestSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  mode: z.enum(['practice', 'exam', 'diagnostic', 'skill_drill']),
  pathway_id: z.string().uuid(),
  target_skill_ids: z.array(z.string()),
  difficulty_range: DifficultyRangeSchema.optional(),
  item_count: z.number().int(),
  time_limit_ms: z.number().int().optional(),
  due_at: z.string().datetime().optional(),
  targets: z.array(z.object({ type: z.enum(['student', 'class']), id: z.string() })),
  auto_generated: z.boolean().optional(),
  rationale: z.string().optional(),
});
export type CreateAssignmentRequest = z.infer<typeof CreateAssignmentRequestSchema>;

export const StudentAssignmentDTOSchema = AssignmentDTOSchema.extend({
  my_status: AssignmentSessionStatusSchema,
  my_session_id: z.string().uuid().nullable(),
  completed_at: z.string().datetime().nullable(),
});
export type StudentAssignmentDTO = z.infer<typeof StudentAssignmentDTOSchema>;

export const AssignmentTrackingDTOSchema = z.object({
  assignment_id: AssignmentIdSchema,
  targets: z.array(
    z.object({
      student_id: UserIdSchema,
      display_name: z.string(),
      status: AssignmentSessionStatusSchema,
      session_id: z.string().uuid().nullable(),
      score: z.number().nullable(),
      completed_at: z.string().datetime().nullable(),
    }),
  ),
  completion_rate: z.number(),
});
export type AssignmentTrackingDTO = z.infer<typeof AssignmentTrackingDTOSchema>;
