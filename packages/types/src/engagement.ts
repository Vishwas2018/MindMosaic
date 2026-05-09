import { z } from 'zod';
import { UserIdSchema, AchievementTierSchema } from './shared.js';

export const EngagementSummaryDTOSchema = z.object({
  student_id: UserIdSchema,
  streak: z.object({
    current_days: z.number().int(),
    best_days: z.number().int(),
    last_active_date: z.string().nullable(),
  }),
  weekly_goal: z.object({
    target_sessions: z.number().int(),
    completed_sessions: z.number().int(),
    target_minutes: z.number().int(),
    completed_minutes: z.number().int(),
  }),
  totals: z.object({
    lifetime_sessions: z.number().int(),
    lifetime_minutes: z.number().int(),
    skills_mastered: z.number().int(),
  }),
});
export type EngagementSummaryDTO = z.infer<typeof EngagementSummaryDTOSchema>;

export const AchievementDTOSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  tier: AchievementTierSchema,
  icon: z.string().nullable(),
  earned: z.boolean(),
  earned_at: z.string().datetime().nullable(),
});
export type AchievementDTO = z.infer<typeof AchievementDTOSchema>;

export const NotificationDTOSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  read: z.boolean(),
  created_at: z.string().datetime(),
});
export type NotificationDTO = z.infer<typeof NotificationDTOSchema>;

export const NotificationsListSchema = z.array(NotificationDTOSchema);
export const MarkAllReadResponseSchema = z.object({ count: z.number().int().nonnegative() });
export const CreateNotificationResponseSchema = z.object({
  deduped: z.boolean(),
  notification: NotificationDTOSchema.nullable(),
});
