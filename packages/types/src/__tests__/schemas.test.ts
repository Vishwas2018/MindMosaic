import { describe, it, expect } from 'vitest';
import { ZodType } from 'zod';
import * as types from '../index.js';

// ─── X1: DB Enum Parity ───────────────────────────────────────────────────────
// Hardcoded DB_ENUM_VALUES must match 0001_enums_tenancy_auth.sql exactly.
// Values cited by line number; test fails at CI if SQL drifts without updating here.

const DB_ENUM_VALUES = {
  // 0001_enums_tenancy_auth.sql lines 18–20
  user_role: ['student', 'parent', 'teacher', 'tutor', 'org_admin', 'platform_admin'],
  // 0001_enums_tenancy_auth.sql lines 21–23
  subscription_tier: ['free', 'standard', 'premium', 'institutional'],
  // 0001_enums_tenancy_auth.sql lines 65–67
  session_mode: ['exam', 'practice', 'diagnostic', 'skill_drill', 'repair', 'challenge'],
  // 0001_enums_tenancy_auth.sql lines 83–85
  repair_status: ['queued', 'in_progress', 'completed', 'failed', 'deferred'],
  // 0001_enums_tenancy_auth.sql lines 89–91
  plan_type: ['weekly', 'exam_countdown', 'long_term', 'transition'],
  // 0001_enums_tenancy_auth.sql lines 92–94
  plan_status: ['active', 'superseded', 'expired'],
  // 0001_enums_tenancy_auth.sql lines 95–97
  plan_session_status: ['pending', 'completed', 'skipped'],
  // 0001_enums_tenancy_auth.sql lines 98–100
  plan_override_type: ['pin_skill', 'dismiss_recommendation', 'override_plan_item'],
  // 0001_enums_tenancy_auth.sql lines 105–107
  alert_severity: ['info', 'warning', 'urgent'],
  // 0001_enums_tenancy_auth.sql lines 108–110
  alert_status: ['active', 'acknowledged', 'dismissed', 'resolved'],
  // 0001_enums_tenancy_auth.sql lines 116–118
  job_status: ['pending', 'processing', 'completed', 'failed', 'dead_letter'],
  // 0001_enums_tenancy_auth.sql lines 119–121
  pipeline_step_status: ['pending', 'processing', 'completed', 'failed', 'skipped'],
  // 0001_enums_tenancy_auth.sql lines 129–131
  assignment_status: ['draft', 'published', 'archived'],
  // 0001_enums_tenancy_auth.sql lines 132–134
  assignment_session_status: ['pending', 'in_progress', 'completed', 'overdue'],
  // 0001_enums_tenancy_auth.sql lines 137–139
  invoice_status: ['draft', 'open', 'paid', 'uncollectible', 'void'],
  // 0001_enums_tenancy_auth.sql lines 142–144
  achievement_tier: ['bronze', 'silver', 'gold', 'platinum'],
} as const;

describe('X1 DB enum parity — schemas match 0001_enums_tenancy_auth.sql', () => {
  it('UserRoleSchema', () => {
    expect([...types.UserRoleSchema.options]).toEqual(DB_ENUM_VALUES.user_role);
  });
  it('SubscriptionTierSchema', () => {
    expect([...types.SubscriptionTierSchema.options]).toEqual(DB_ENUM_VALUES.subscription_tier);
  });
  it('SessionModeSchema', () => {
    expect([...types.SessionModeSchema.options]).toEqual(DB_ENUM_VALUES.session_mode);
  });
  it('RepairStatusSchema', () => {
    expect([...types.RepairStatusSchema.options]).toEqual(DB_ENUM_VALUES.repair_status);
  });
  it('PlanTypeSchema', () => {
    expect([...types.PlanTypeSchema.options]).toEqual(DB_ENUM_VALUES.plan_type);
  });
  it('PlanStatusSchema', () => {
    expect([...types.PlanStatusSchema.options]).toEqual(DB_ENUM_VALUES.plan_status);
  });
  it('PlanSessionStatusSchema', () => {
    expect([...types.PlanSessionStatusSchema.options]).toEqual(DB_ENUM_VALUES.plan_session_status);
  });
  it('PlanOverrideTypeSchema', () => {
    expect([...types.PlanOverrideTypeSchema.options]).toEqual(DB_ENUM_VALUES.plan_override_type);
  });
  it('AlertSeveritySchema', () => {
    expect([...types.AlertSeveritySchema.options]).toEqual(DB_ENUM_VALUES.alert_severity);
  });
  it('AlertStatusSchema', () => {
    expect([...types.AlertStatusSchema.options]).toEqual(DB_ENUM_VALUES.alert_status);
  });
  it('JobStatusSchema', () => {
    expect([...types.JobStatusSchema.options]).toEqual(DB_ENUM_VALUES.job_status);
  });
  it('PipelineStepStatusSchema', () => {
    expect([...types.PipelineStepStatusSchema.options]).toEqual(DB_ENUM_VALUES.pipeline_step_status);
  });
  it('AssignmentStatusSchema', () => {
    expect([...types.AssignmentStatusSchema.options]).toEqual(DB_ENUM_VALUES.assignment_status);
  });
  it('AssignmentSessionStatusSchema', () => {
    expect([...types.AssignmentSessionStatusSchema.options]).toEqual(
      DB_ENUM_VALUES.assignment_session_status,
    );
  });
  it('InvoiceStatusSchema', () => {
    expect([...types.InvoiceStatusSchema.options]).toEqual(DB_ENUM_VALUES.invoice_status);
  });
  it('AchievementTierSchema', () => {
    expect([...types.AchievementTierSchema.options]).toEqual(DB_ENUM_VALUES.achievement_tier);
  });
});

// ─── X3: Exhaustive schema registry ──────────────────────────────────────────
// Every export ending in 'Schema' must be a ZodType instance.

describe('X3 exhaustive schema registry — every *Schema export is a ZodType', () => {
  const schemaEntries = Object.entries(types as Record<string, unknown>).filter(([k]) =>
    k.endsWith('Schema'),
  );

  it('has at least 30 schema exports', () => {
    expect(schemaEntries.length).toBeGreaterThanOrEqual(30);
  });

  schemaEntries.forEach(([name, value]) => {
    it(`${name} is a ZodType`, () => {
      expect(value).toBeInstanceOf(ZodType);
    });
  });
});

// ─── Parse / safeParse smoke tests ───────────────────────────────────────────

describe('shared — branded ID parse', () => {
  it('TenantIdSchema parses a valid UUID', () => {
    const result = types.TenantIdSchema.safeParse('00000000-0000-0000-0000-000000000001');
    expect(result.success).toBe(true);
  });
  it('TenantIdSchema rejects non-UUID', () => {
    expect(types.TenantIdSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('shared — APIErrorEnvelopeSchema', () => {
  it('parses valid error envelope', () => {
    const result = types.APIErrorEnvelopeSchema.safeParse({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        status: 404,
        details: null,
        trace_id: 'abc-123',
      },
    });
    expect(result.success).toBe(true);
  });
  it('rejects unknown error code', () => {
    expect(
      types.APIErrorEnvelopeSchema.safeParse({
        error: {
          code: 'MADE_UP_CODE',
          message: 'x',
          status: 500,
          details: null,
          trace_id: 'x',
        },
      }).success,
    ).toBe(false);
  });
});

describe('session — CreateSessionResponseSchema', () => {
  const validItem = {
    item_id: '00000000-0000-0000-0000-000000000001',
    version: 1,
    stem: { text: 'What is 2+2?' },
    stimulus: null,
    response_type: 'mcq',
    response_config: { options: ['3', '4', '5'] },
    tools_available: [],
    sequence_number: 1,
  };

  it('parses a valid CreateSessionResponse', () => {
    const result = types.CreateSessionResponseSchema.safeParse({
      session_id: '00000000-0000-0000-0000-000000000002',
      mode: 'practice',
      engine_type: 'adaptive',
      total_items: 20,
      time_limit_ms: null,
      first_item: validItem,
      navigation: { can_go_back: false, can_skip: true, can_flag: true },
      lock_token: 'tok_abc',
      version: 1,
    });
    expect(result.success).toBe(true);
  });
});

describe('proficiency — MasteryBandSchema', () => {
  it('accepts all four bands', () => {
    for (const band of ['novice', 'developing', 'proficient', 'mastered']) {
      expect(types.MasteryBandSchema.safeParse(band).success).toBe(true);
    }
  });
  it('rejects fifth band from SkillProgressDTO vocabulary', () => {
    expect(types.MasteryBandSchema.safeParse('advanced').success).toBe(false);
  });
});

describe('billing — CheckoutRequestSchema', () => {
  it('rejects free tier (not purchaseable)', () => {
    expect(
      types.CheckoutRequestSchema.safeParse({
        tier: 'free',
        billing_interval: 'monthly',
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      }).success,
    ).toBe(false);
  });
  it('accepts standard monthly', () => {
    expect(
      types.CheckoutRequestSchema.safeParse({
        tier: 'standard',
        billing_interval: 'monthly',
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      }).success,
    ).toBe(true);
  });
});

describe('assignments — StudentAssignmentDTOSchema extends AssignmentDTOSchema', () => {
  const base = {
    id: '00000000-0000-0000-0000-000000000003',
    title: 'Test Assignment',
    description: null,
    mode: 'practice',
    target_skill_ids: [],
    target_skill_names: [],
    difficulty_range: null,
    item_count: 10,
    time_limit_ms: null,
    due_at: null,
    status: 'published',
    auto_generated: false,
    rationale: null,
    created_by: { id: '00000000-0000-0000-0000-000000000004', display_name: 'Teacher' },
    created_at: '2026-05-03T00:00:00.000Z',
    published_at: '2026-05-03T00:00:00.000Z',
  };

  it('StudentAssignmentDTO requires my_status and my_session_id', () => {
    expect(types.StudentAssignmentDTOSchema.safeParse(base).success).toBe(false);
    expect(
      types.StudentAssignmentDTOSchema.safeParse({
        ...base,
        my_status: 'pending',
        my_session_id: null,
        completed_at: null,
      }).success,
    ).toBe(true);
  });
});
