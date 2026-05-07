import { z } from 'zod';

// Schemas defined first; types derived via z.infer. Do not maintain parallel interface declarations.
// X4: Bump SCHEMA_VERSION on any breaking field change to any DTO. Minor bumps for additive
// fields. Patch for non-semantic fixes. Stage 12 SDK reads this to negotiate version compatibility.
export const SCHEMA_VERSION = '1.0.0' as const;

// ─── Branded IDs ─────────────────────────────────────────────────────────────
// X2: Named phantom-property brand pattern. Each type carries a uniquely-named
// readonly property so structural typing prevents cross-brand assignment.
// Avoids `unique symbol` computed keys which tsc --declaration cannot emit
// across module boundaries (TS4023).

export type TenantId = string & { readonly _TenantId: never };
export const TenantIdSchema = z.string().uuid().transform((s): TenantId => s as TenantId);

export type UserId = string & { readonly _UserId: never };
export const UserIdSchema = z.string().uuid().transform((s): UserId => s as UserId);

export type SessionId = string & { readonly _SessionId: never };
export const SessionIdSchema = z.string().uuid().transform((s): SessionId => s as SessionId);

export type ItemId = string & { readonly _ItemId: never };
export const ItemIdSchema = z.string().uuid().transform((s): ItemId => s as ItemId);

export type SkillId = string & { readonly _SkillId: never };
export const SkillIdSchema = z.string().uuid().transform((s): SkillId => s as SkillId);

export type PathwayId = string & { readonly _PathwayId: never };
export const PathwayIdSchema = z.string().uuid().transform((s): PathwayId => s as PathwayId);

export type AssignmentId = string & { readonly _AssignmentId: never };
export const AssignmentIdSchema = z
  .string()
  .uuid()
  .transform((s): AssignmentId => s as AssignmentId);

export type PlanId = string & { readonly _PlanId: never };
export const PlanIdSchema = z.string().uuid().transform((s): PlanId => s as PlanId);

export type GraphVersionId = string & { readonly _GraphVersionId: never };
export const GraphVersionIdSchema = z
  .string()
  .uuid()
  .transform((s): GraphVersionId => s as GraphVersionId);

export type FrameworkConfigId = string & { readonly _FrameworkConfigId: never };
export const FrameworkConfigIdSchema = z
  .string()
  .uuid()
  .transform((s): FrameworkConfigId => s as FrameworkConfigId);

// ─── DB Enum Schemas ─────────────────────────────────────────────────────────
// Values MUST match 0001_enums_tenancy_auth.sql exactly.
// X1 parity tests in src/__tests__/schemas.test.ts catch drift at CI time.

// 0001_enums_tenancy_auth.sql lines 18–20
export const UserRoleSchema = z.enum([
  'student',
  'parent',
  'teacher',
  'tutor',
  'org_admin',
  'platform_admin',
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

// 0001_enums_tenancy_auth.sql lines 21–23
export const SubscriptionTierSchema = z.enum([
  'free',
  'standard',
  'premium',
  'institutional',
]);
export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;

// 0001_enums_tenancy_auth.sql lines 65–67
export const SessionModeSchema = z.enum([
  'exam',
  'practice',
  'diagnostic',
  'skill_drill',
  'repair',
  'challenge',
]);
export type SessionMode = z.infer<typeof SessionModeSchema>;

// 0001_enums_tenancy_auth.sql lines 83–85
export const RepairStatusSchema = z.enum([
  'queued',
  'in_progress',
  'completed',
  'failed',
  'deferred',
]);
export type RepairStatus = z.infer<typeof RepairStatusSchema>;

// 0001_enums_tenancy_auth.sql lines 89–91
export const PlanTypeSchema = z.enum([
  'weekly',
  'exam_countdown',
  'long_term',
  'transition',
]);
export type PlanType = z.infer<typeof PlanTypeSchema>;

// 0001_enums_tenancy_auth.sql lines 92–94
export const PlanStatusSchema = z.enum(['active', 'superseded', 'expired']);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

// 0001_enums_tenancy_auth.sql lines 95–97
export const PlanSessionStatusSchema = z.enum(['pending', 'completed', 'skipped']);
export type PlanSessionStatus = z.infer<typeof PlanSessionStatusSchema>;

// 0001_enums_tenancy_auth.sql lines 98–100
export const PlanOverrideTypeSchema = z.enum([
  'pin_skill',
  'dismiss_recommendation',
  'override_plan_item',
]);
export type PlanOverrideType = z.infer<typeof PlanOverrideTypeSchema>;

// 0001_enums_tenancy_auth.sql lines 105–107
export const AlertSeveritySchema = z.enum(['info', 'warning', 'urgent']);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

// 0001_enums_tenancy_auth.sql lines 108–110
export const AlertStatusSchema = z.enum([
  'active',
  'acknowledged',
  'dismissed',
  'resolved',
]);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;

// 0001_enums_tenancy_auth.sql lines 116–118
export const JobStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'dead_letter',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

// 0001_enums_tenancy_auth.sql lines 119–121
export const PipelineStepStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'skipped',
]);
export type PipelineStepStatus = z.infer<typeof PipelineStepStatusSchema>;

// 0001_enums_tenancy_auth.sql lines 129–131
export const AssignmentStatusSchema = z.enum(['draft', 'published', 'archived']);
export type AssignmentStatus = z.infer<typeof AssignmentStatusSchema>;

// 0001_enums_tenancy_auth.sql lines 132–134
export const AssignmentSessionStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'overdue',
]);
export type AssignmentSessionStatus = z.infer<typeof AssignmentSessionStatusSchema>;

// 0001_enums_tenancy_auth.sql lines 137–139
export const InvoiceStatusSchema = z.enum([
  'draft',
  'open',
  'paid',
  'uncollectible',
  'void',
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

// 0001_enums_tenancy_auth.sql lines 142–144
export const AchievementTierSchema = z.enum(['bronze', 'silver', 'gold', 'platinum']);
export type AchievementTier = z.infer<typeof AchievementTierSchema>;

// ─── Error Envelope ───────────────────────────────────────────────────────────
// Arch §1.5 error code vocabulary (16 codes; LOCK_CONFLICT added Stage 26 per
// ISSUE-0008 — assessment-svc emits this on X-Session-Lock header mismatch).

export const ErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FEATURE_GATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'SESSION_CONFLICT',
  'VERSION_CONFLICT',
  'ACTIVE_SESSION_EXISTS',
  'LOCK_CONFLICT',
  'IDEMPOTENCY_IN_FLIGHT',
  'GONE',
  'IDEMPOTENCY_MISMATCH',
  'UNPROCESSABLE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const APIErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    status: z.number().int(),
    details: z.unknown().nullable(),
    trace_id: z.string(),
  }),
});
export type APIErrorEnvelope = z.infer<typeof APIErrorEnvelopeSchema>;
