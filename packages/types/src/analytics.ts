import { z } from 'zod';
import { UserIdSchema, AlertSeveritySchema, AlertStatusSchema } from './shared.js';
import { ExplanationDTOSchema } from './intelligence.js';

export const InterventionAlertDTOSchema = z.object({
  id: z.string().uuid(),
  student_id: UserIdSchema,
  student_name: z.string(),
  class_id: z.string().uuid().nullable(),
  alert_type: z.string(),
  severity: AlertSeveritySchema,
  status: AlertStatusSchema,
  detail: z.record(z.string(), z.unknown()),
  suggested_action: z.string(),
  explanation: ExplanationDTOSchema,
  created_at: z.string().datetime(),
});
export type InterventionAlertDTO = z.infer<typeof InterventionAlertDTOSchema>;

export const CohortOverviewDTOSchema = z.object({
  cohort_key: z.string(),
  student_count: z.number().int(),
  avg_mastery: z.number(),
  avg_velocity: z.number(),
  top_gap_skills: z.array(
    z.object({
      skill_id: z.string(),
      skill_name: z.string(),
      avg_mastery: z.number(),
    }),
  ),
  top_misconceptions: z.array(
    z.object({
      misconception_id: z.string(),
      name: z.string(),
      affected_count: z.number().int(),
    }),
  ),
  alerts_active: z.number().int(),
  generated_at: z.string().datetime(),
});
export type CohortOverviewDTO = z.infer<typeof CohortOverviewDTOSchema>;

export const AutoGroupDTOSchema = z.object({
  class_id: z.string().uuid(),
  skill_id: z.string().uuid(),
  groups: z.array(
    z.object({
      label: z.string(),
      students: z.array(z.object({ id: z.string(), display_name: z.string() })),
      suggested_activity: z.string(),
      suggested_items: z.array(z.string()),
    }),
  ),
});
export type AutoGroupDTO = z.infer<typeof AutoGroupDTOSchema>;
