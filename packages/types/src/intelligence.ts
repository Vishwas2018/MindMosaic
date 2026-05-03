import { z } from 'zod';
import { UserIdSchema, RepairStatusSchema } from './shared.js';
import { PathwayReadinessDTOSchema } from './orchestration.js';

export const BehaviourProfileDTOSchema = z.object({
  avg_guess_rate: z.number(),
  avg_fatigue_onset_minutes: z.number(),
  persistence_score: z.number(),
  avg_cognitive_load_comfort: z.number(),
  time_pressure_sensitivity: z.number(),
  session_length_sweet_spot: z.number(),
  data_points: z.number().int(),
  computed_at: z.string().datetime(),
  stale_since: z.string().datetime().nullable(),
});
export type BehaviourProfileDTO = z.infer<typeof BehaviourProfileDTOSchema>;

export const SkillProgressDTOSchema = z.object({
  skill_id: z.string().uuid(),
  skill_name: z.string(),
  mastery_level: z.number(),
  confidence: z.number(),
  velocity: z.number(),
  retention_estimate: z.number(),
  status: z.enum(['not_started', 'developing', 'proficient', 'advanced', 'mastered']),
  trend: z.enum(['improving', 'stable', 'declining', 'insufficient_data']),
  active_misconceptions: z.array(
    z.object({
      misconception_id: z.string(),
      name: z.string(),
      confidence: z.number(),
      severity: z.string(),
    }),
  ),
  last_practiced_at: z.string().datetime().nullable(),
  data_points: z.number().int(),
});
export type SkillProgressDTO = z.infer<typeof SkillProgressDTOSchema>;

export const RepairSessionDTOSchema = z.object({
  repair_record_id: z.string().uuid(),
  misconception_id: z.string().uuid().nullable(),
  misconception_name: z.string().nullable(),
  root_cause_skill_id: z.string().uuid().nullable(),
  root_cause_skill_name: z.string().nullable(),
  repair_sequence_name: z.string(),
  status: RepairStatusSchema,
  stages_completed: z.number().int(),
  total_stages: z.number().int(),
  estimated_duration_min: z.number().int(),
  priority: z.enum(['critical', 'high', 'medium']),
  rationale: z.string(),
});
export type RepairSessionDTO = z.infer<typeof RepairSessionDTOSchema>;

export const CausalMapDTOSchema = z.object({
  root_cause_skills: z.array(
    z.object({
      skill_id: z.string(),
      skill_name: z.string(),
      mastery: z.number(),
      affected_skill_count: z.number().int(),
      priority: z.enum(['critical', 'high', 'medium']),
    }),
  ),
  active_misconceptions: z.array(
    z.object({
      misconception_id: z.string(),
      name: z.string(),
      category: z.string(),
      confidence: z.number(),
      severity: z.string(),
      affected_skill_count: z.number().int(),
    }),
  ),
  repair_queue: z.array(RepairSessionDTOSchema),
});
export type CausalMapDTO = z.infer<typeof CausalMapDTOSchema>;

export const ExplanationDTOSchema = z.object({
  summary: z.string(),
  factors: z.array(
    z.object({
      factor_type: z.string(),
      value: z.union([z.string(), z.number()]),
      weight: z.number(),
      direction: z.enum(['positive', 'negative', 'neutral']),
    }),
  ),
  source_layer: z.string(),
  evidence_ids: z.array(z.string()),
  generated_at: z.string().datetime(),
});
export type ExplanationDTO = z.infer<typeof ExplanationDTOSchema>;

export const LearningDNADTOSchema = z.object({
  student_id: UserIdSchema,
  overall_level: z.string(),
  domain_profiles: z.record(
    z.string(),
    z.object({
      mastery: z.number(),
      velocity: z.number(),
      weakest_skills: z.array(z.string()),
      strongest_skills: z.array(z.string()),
    }),
  ),
  behaviour_profile: BehaviourProfileDTOSchema,
  active_misconceptions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      confidence: z.number(),
      severity: z.string(),
    }),
  ),
  active_repair_ids: z.array(z.string()),
  pathway_readiness: z.record(z.string(), PathwayReadinessDTOSchema),
  stretch_readiness: z.record(z.string(), z.unknown()),
  computed_at: z.string().datetime(),
  stale_since: z.string().datetime().nullable(),
});
export type LearningDNADTO = z.infer<typeof LearningDNADTOSchema>;
