import { z } from 'zod';
import { SessionIdSchema, JobStatusSchema, PipelineStepStatusSchema } from './shared.js';

export const JobStatusDTOSchema = z.object({
  id: z.string().uuid(),
  job_type: z.string(),
  status: JobStatusSchema,
  priority: z.string(),
  attempts: z.number().int(),
  max_attempts: z.number().int(),
  last_error: z.string().nullable(),
  scheduled_at: z.string().datetime(),
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type JobStatusDTO = z.infer<typeof JobStatusDTOSchema>;

export const PipelineEventDTOSchema = z.object({
  id: z.string().uuid(),
  session_id: SessionIdSchema,
  step: z.number().int(),
  step_name: z.string(),
  status: PipelineStepStatusSchema,
  attempts: z.number().int(),
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  error: z.string().nullable(),
});
export type PipelineEventDTO = z.infer<typeof PipelineEventDTOSchema>;
