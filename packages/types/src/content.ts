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
