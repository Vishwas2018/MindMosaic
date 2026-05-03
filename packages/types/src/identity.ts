import { z } from 'zod';
import { TenantIdSchema, UserIdSchema, UserRoleSchema, SubscriptionTierSchema } from './shared.js';

export const UserMeDTOSchema = z.object({
  id: UserIdSchema,
  email: z.string().email().nullable(),
  display_name: z.string(),
  role: UserRoleSchema,
  tenant_id: TenantIdSchema,
  year_level: z.number().int().nullable(),
  subscription_tier: SubscriptionTierSchema,
  entitlements: z.record(z.string(), z.boolean()),
  preferences: z.record(z.string(), z.unknown()),
});
export type UserMeDTO = z.infer<typeof UserMeDTOSchema>;

export const TenantDTOSchema = z.object({
  id: TenantIdSchema,
  name: z.string(),
  type: z.enum(['family', 'school', 'tutor_centre']),
  region: z.string(),
});
export type TenantDTO = z.infer<typeof TenantDTOSchema>;
