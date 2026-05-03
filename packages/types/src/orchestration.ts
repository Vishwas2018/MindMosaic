import { z } from 'zod';
import { PlanIdSchema, PlanTypeSchema, PlanStatusSchema, PlanSessionStatusSchema, PlanOverrideTypeSchema } from './shared.js';

export const LearningPlanItemDTOSchema = z.object({
  order: z.number().int(),
  week: z.number().int().nullable(),
  mode: z.string(),
  target_skill_names: z.array(z.string()),
  target_skill_ids: z.array(z.string()),
  difficulty_label: z.string(),
  estimated_duration_min: z.number().int(),
  rationale: z.string(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  status: PlanSessionStatusSchema,
});
export type LearningPlanItemDTO = z.infer<typeof LearningPlanItemDTOSchema>;

export const LearningPlanDTOSchema = z.object({
  plan_id: PlanIdSchema,
  plan_type: PlanTypeSchema,
  status: PlanStatusSchema,
  created_at: z.string().datetime(),
  valid_until: z.string().datetime(),
  sessions: z.array(LearningPlanItemDTOSchema),
  milestones: z
    .array(
      z.object({
        week: z.number().int(),
        target_skills: z.array(z.string()),
        expected_mastery: z.number(),
        actual_mastery: z.number().nullable(),
      }),
    )
    .nullable(),
  stale_since: z.string().datetime().nullable(),
});
export type LearningPlanDTO = z.infer<typeof LearningPlanDTOSchema>;

export const PathwayReadinessDTOSchema = z.object({
  pathway_slug: z.string(),
  pathway_name: z.string(),
  skill_readiness: z.number(),
  coverage: z.number(),
  condition_readiness: z.number(),
  composite_readiness: z.number(),
  composite_label: z.enum(['not_ready', 'developing', 'on_track', 'ready', 'strong']),
  gap_skills: z.array(
    z.object({
      skill_id: z.string(),
      skill_name: z.string(),
      current_mastery: z.number(),
      target_mastery: z.number(),
    }),
  ),
  active_misconceptions_affecting: z.number().int(),
  predicted_ready_date: z.string().datetime().nullable(),
  exam_date: z.string().datetime().nullable(),
  days_remaining: z.number().int().nullable(),
  stale_since: z.string().datetime().nullable(),
});
export type PathwayReadinessDTO = z.infer<typeof PathwayReadinessDTOSchema>;

export const PlanOverrideRequestSchema = z.object({
  type: PlanOverrideTypeSchema,
  target: z.record(z.string(), z.unknown()),
  expires_in_days: z.number().int().optional(),
});
export type PlanOverrideRequest = z.infer<typeof PlanOverrideRequestSchema>;
