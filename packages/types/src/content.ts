import { z } from 'zod';
import { ItemIdSchema } from './shared.js';

export const PathwayDTOSchema = z.object({
  slug: z.string(),
  display_name: z.string(),
  exam_family: z.string(),
  program: z.string(),
  year_levels: z.array(z.number().int()),
  entitled: z.boolean(),
  locked_reason: z.string().nullable(),
  id: z.string().uuid(),
});
export type PathwayDTO = z.infer<typeof PathwayDTOSchema>;

export const AssessmentProfileDTOSchema = z.object({
  id: z.string().uuid(),
  exam_family: z.string(),
  program: z.string(),
  year_level: z.number().int(),
  duration_minutes: z.number().int(),
});
export type AssessmentProfileDTO = z.infer<typeof AssessmentProfileDTOSchema>;

const StimulusSchema = z.object({
  id: z.string(),
  type: z.string(),
  content: z.record(z.string(), z.unknown()),
});

export const ItemDTOSchema = z.object({
  item_id: ItemIdSchema,
  version: z.number().int(),
  stem: z.record(z.string(), z.unknown()),
  stimulus: StimulusSchema.nullable(),
  response_type: z.string(),
  response_config: z.record(z.string(), z.unknown()),
  tools_available: z.array(z.string()),
  sequence_number: z.number().int(),
});
export type ItemDTO = z.infer<typeof ItemDTOSchema>;

// ─── Content authoring schemas (v1.1-S1) ────────────────────────────────────

export const ItemAdminDTOSchema = z.object({
  id: z.string().uuid(),
  source_item_id: z.string().nullable(),
  stimulus_id: z.string().nullable(),
  response_type: z.string(),
  skill_ids: z.array(z.string()),
  difficulty: z.number(),
  discrimination: z.number().nullable(),
  expected_time_secs: z.number().int().nullable(),
  year_levels: z.array(z.number().int()),
  exam_families: z.array(z.string()),
  programs: z.array(z.string()),
  countries: z.array(z.string()),
  curricula: z.array(z.string()),
  bloom_level: z.string().nullable(),
  lifecycle: z.enum(['draft', 'review', 'active', 'monitored', 'retired']),
  is_active: z.boolean(),
  current_version: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ItemAdminDTO = z.infer<typeof ItemAdminDTOSchema>;

export const ItemCreateDTOSchema = z.object({
  source_item_id: z.string().nullable().optional(),
  stimulus_id: z.string().nullable().optional(),
  response_type: z.string().min(1),
  skill_ids: z.array(z.string()).min(1),
  difficulty: z.number(),
  discrimination: z.number().nullable().optional(),
  expected_time_secs: z.number().int().nullable().optional(),
  year_levels: z.array(z.number().int()).min(1),
  exam_families: z.array(z.string()).min(1),
  programs: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  curricula: z.array(z.string()).optional(),
  bloom_level: z.string().nullable().optional(),
});
export type ItemCreateDTO = z.infer<typeof ItemCreateDTOSchema>;

export const ItemUpdateDTOSchema = z.object({
  source_item_id: z.string().nullable().optional(),
  stimulus_id: z.string().nullable().optional(),
  skill_ids: z.array(z.string()).min(1).optional(),
  difficulty: z.number().optional(),
  discrimination: z.number().nullable().optional(),
  expected_time_secs: z.number().int().nullable().optional(),
  year_levels: z.array(z.number().int()).min(1).optional(),
  exam_families: z.array(z.string()).min(1).optional(),
  programs: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  curricula: z.array(z.string()).optional(),
  bloom_level: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});
export type ItemUpdateDTO = z.infer<typeof ItemUpdateDTOSchema>;

export const ItemVersionDTOSchema = z.object({
  item_id: z.string().uuid(),
  version: z.number().int(),
  stem: z.record(z.string(), z.unknown()),
  response_config: z.record(z.string(), z.unknown()),
  distractor_rationale: z.record(z.string(), z.unknown()).nullable(),
  explanation: z.record(z.string(), z.unknown()).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  authoring_method: z.enum(['human', 'ai_assisted_human_reviewed']),
  difficulty: z.number(),
  discrimination: z.number().nullable(),
  is_current: z.boolean(),
  supersedes: z.number().int().nullable(),
  created_at: z.string(),
});
export type ItemVersionDTO = z.infer<typeof ItemVersionDTOSchema>;

export const ItemVersionCreateDTOSchema = z.object({
  stem: z.record(z.string(), z.unknown()),
  response_config: z.record(z.string(), z.unknown()),
  distractor_rationale: z.record(z.string(), z.unknown()).nullable().optional(),
  explanation: z.record(z.string(), z.unknown()).nullable().optional(),
  difficulty: z.number(),
  discrimination: z.number().nullable().optional(),
  supersedes: z.number().int().nullable().optional(),
  authoring_method: z.enum(['human', 'ai_assisted_human_reviewed']),
});
export type ItemVersionCreateDTO = z.infer<typeof ItemVersionCreateDTOSchema>;

export const ItemLifecycleTransitionDTOSchema = z.object({
  lifecycle: z.enum(['draft', 'review', 'active', 'monitored', 'retired']),
});
export type ItemLifecycleTransitionDTO = z.infer<typeof ItemLifecycleTransitionDTOSchema>;

export const StimulusAdminDTOSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  content: z.record(z.string(), z.unknown()),
  source_attribution: z.string().nullable(),
  year_levels: z.array(z.number().int()),
  exam_families: z.array(z.string()),
  is_active: z.boolean(),
  created_at: z.string(),
});
export type StimulusAdminDTO = z.infer<typeof StimulusAdminDTOSchema>;

export const StimulusCreateDTOSchema = z.object({
  type: z.string().min(1),
  content: z.record(z.string(), z.unknown()),
  source_attribution: z.string().nullable().optional(),
  year_levels: z.array(z.number().int()).optional(),
  exam_families: z.array(z.string()).optional(),
});
export type StimulusCreateDTO = z.infer<typeof StimulusCreateDTOSchema>;

export const StimulusUpdateDTOSchema = z.object({
  content: z.record(z.string(), z.unknown()).optional(),
  source_attribution: z.string().nullable().optional(),
  year_levels: z.array(z.number().int()).optional(),
  exam_families: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});
export type StimulusUpdateDTO = z.infer<typeof StimulusUpdateDTOSchema>;

// ─── Bulk import manifest schemas (v1.1-S6) ──────────────────────────────────

export const ImportManifestItemSchema = z.object({
  external_key: z.string().min(1).max(200),
  copyright_declaration: z.literal('original'),
  authoring_method: z.enum(['human', 'ai_assisted_human_reviewed']),
  item: z.object({
    response_type: z.string().min(1),
    skill_ids: z.array(z.string()).min(1),
    difficulty: z.number(),
    year_levels: z.array(z.number().int()).min(1),
    exam_families: z.array(z.string()).min(1),
    source_item_id: z.string().nullable().optional(),
    stimulus_id: z.string().nullable().optional(),
    discrimination: z.number().nullable().optional(),
    expected_time_secs: z.number().int().nullable().optional(),
    programs: z.array(z.string()).optional(),
    countries: z.array(z.string()).optional(),
    curricula: z.array(z.string()).optional(),
    bloom_level: z.string().nullable().optional(),
  }),
  version: z.object({
    stem: z.record(z.string(), z.unknown()),
    response_config: z.record(z.string(), z.unknown()),
    difficulty: z.number(),
    distractor_rationale: z.record(z.string(), z.unknown()).nullable().optional(),
    explanation: z.record(z.string(), z.unknown()).nullable().optional(),
    discrimination: z.number().nullable().optional(),
  }),
  stimulus: z.object({
    type: z.string().min(1),
    content: z.record(z.string(), z.unknown()),
    source_attribution: z.string().nullable().optional(),
    year_levels: z.array(z.number().int()).optional(),
    exam_families: z.array(z.string()).optional(),
  }).optional(),
});
export type ImportManifestItem = z.infer<typeof ImportManifestItemSchema>;

export const ImportManifestSchema = z.object({
  manifest_version: z.literal('1.0'),
  items: z.array(ImportManifestItemSchema).min(1).max(500),
});
export type ImportManifest = z.infer<typeof ImportManifestSchema>;
