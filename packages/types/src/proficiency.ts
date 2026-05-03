import { z } from 'zod';
import { SkillIdSchema, UserIdSchema } from './shared.js';

// 4-band classification for ProficiencyMapDTO (arch §6 gap; Stage 24 Results screen).
// Distinct from SkillProgressDTO.status which uses a 5-band vocabulary per arch §6.4.
export const MasteryBandSchema = z.enum(['novice', 'developing', 'proficient', 'mastered']);
export type MasteryBand = z.infer<typeof MasteryBandSchema>;

export const ProficiencyMapDTOSchema = z.object({
  student_id: UserIdSchema,
  pathway_slug: z.string(),
  skills: z.array(
    z.object({
      skill_id: SkillIdSchema,
      skill_name: z.string(),
      band: MasteryBandSchema,
      mastery_level: z.number().min(0).max(1),
      last_practiced_at: z.string().datetime().nullable(),
    }),
  ),
  summary: z.object({
    novice: z.number().int(),
    developing: z.number().int(),
    proficient: z.number().int(),
    mastered: z.number().int(),
  }),
  computed_at: z.string().datetime(),
});
export type ProficiencyMapDTO = z.infer<typeof ProficiencyMapDTOSchema>;
