/**
 * orchestration-svc handlers — Stage 31.
 *
 * L9 Orchestration Weekly Plan (spec §16) — capstone intelligence layer.
 * Dispatched by jobs-worker via POST /orchestration/pipeline/orchestration-replan (ADR-0031).
 *
 * Spec §16.2 priority order (verbatim): repair > root cause > declining > low retention > practice > stretch
 *
 * Spec-pinned constants (T1 — verbatim from spec §16):
 *   Declining velocity threshold: velocity < -0.01 (§16.2 line 2331; NOT -0.02 — that is L7 §14.2)
 *   Low retention: retention_estimate < 0.5 and mastery > 0.6 (§16.2 line 2335)
 *   Session guardrail: session_length_sweet_spot + 5 min max per session (§16.6)
 *   Max concurrent repairs: no more than 3 (§16.6)
 *   Enjoyment minimum: at least 20% of plan time (§16.6)
 *   Override default expiry: 14 days if not specified (§16.6.1 line 2504)
 *   Override audit: every override creation and expiry writes an entry with layer='L9_override' (§16.6.1 line 2508)
 *   Interleave rule: no more than 2 consecutive sessions on same domain (§16.2 line 2358)
 *   Idempotency skip: learning_plan.updated_at > job scheduled_at (DEV_PLAN verbatim)
 */

import { retentionHalfLifeDays } from '@mm/engines';

// ---------------------------------------------------------------------------
// Spec-pinned constants (T1 — verbatim citations in header above)
// ---------------------------------------------------------------------------

const L9_ALGORITHM_VERSION = 'L9.v1';
// Declining velocity threshold — spec §16.2 line 2331. NOT -0.02 (L7 §14.2, different spec section).
const DECLINING_VELOCITY_THRESHOLD = -0.01;
// Low retention — spec §16.2 line 2335: retention_estimate < 0.5 and mastery > 0.6.
const LOW_RETENTION_ESTIMATE_THRESHOLD = 0.5;
const LOW_RETENTION_MASTERY_THRESHOLD = 0.6;
// Session guardrail — spec §16.6: session_length_sweet_spot + 5 min max per session.
const SESSION_LENGTH_BUFFER_MINUTES = 5;
// Enjoyment — spec §16.6: at least 20% of plan time is "enjoyment" sessions.
const ENJOYMENT_MIN_FRACTION = 0.2;
// Enjoyment mastery threshold — Q-31.5: "skills the student is good at" = mastery > 0.7.
const ENJOYMENT_MASTERY_THRESHOLD = 0.7;
// Max concurrent repairs — spec §16.6: no more than 3 repair sequences active simultaneously.
const MAX_CONCURRENT_REPAIRS = 3;
// Interleave rule — spec §16.2 line 2358.
const MAX_CONSECUTIVE_SAME_DOMAIN = 2;
// Override default expiry — spec §16.6.1 line 2504: 14 days if not specified.
const OVERRIDE_DEFAULT_EXPIRY_DAYS = 14;
// Gap skill threshold — step 5 practice: mastery < 0.5.
const GAP_SKILL_MASTERY_THRESHOLD = 0.5;
// Plan validity window for weekly plan.
const PLAN_VALIDITY_DAYS = 7;

// ---------------------------------------------------------------------------
// DbClient contract (mirrors analytics-svc / intelligence-svc shape)
// ---------------------------------------------------------------------------

export interface DbClient {
  from(table: string): DbBuilder;
}

export type DbBuilder = {
  select: (cols: string) => DbBuilder;
  insert: (row: unknown) => DbBuilder;
  update: (patch: unknown) => DbBuilder;
  upsert: (row: unknown, opts?: { onConflict?: string }) => DbBuilder;
  delete: () => DbBuilder;
  eq: (col: string, val: unknown) => DbBuilder;
  in: (col: string, vals: unknown[]) => DbBuilder;
  gte: (col: string, val: unknown) => DbBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => DbBuilder;
  limit: (n: number) => DbBuilder;
  single: () => DbBuilder;
} & PromiseLike<{ data: unknown; error: unknown }>;

// ---------------------------------------------------------------------------
// Exported result and DTO types (arch §6 lines 1994–2021 verbatim)
// ---------------------------------------------------------------------------

export interface OrchestratorReplanResult {
  student_id: string;
  plan_type: 'weekly';
  skipped: boolean;
  reason?: string;
  new_plan_id?: string;
  sessions_generated: number;
  processing_time_ms: number;
}

export interface LearningPlanDTO {
  plan_id: string;
  plan_type: 'weekly' | 'exam_countdown' | 'long_term' | 'transition';
  status: 'active' | 'superseded' | 'expired';
  created_at: string;
  valid_until: string;
  sessions: LearningPlanItemDTO[];
  milestones: Array<{
    week: number;
    target_skills: string[];
    expected_mastery: number;
    actual_mastery: number | null;
  }> | null;
  stale_since: string | null;
}

export interface LearningPlanItemDTO {
  order: number;
  week: number | null;
  mode: string;
  target_skill_names: string[];
  target_skill_ids: string[];
  difficulty_label: string;
  estimated_duration_min: number;
  rationale: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'completed' | 'skipped';
}

// ---------------------------------------------------------------------------
// Caller interface (role gate)
// ---------------------------------------------------------------------------

export interface Caller {
  userId: string;
  role: string;
}

// ---------------------------------------------------------------------------
// Internal row types
// ---------------------------------------------------------------------------

interface SkillMasteryRow {
  skill_id: string;
  mastery_level: number;
  last_attempted_at: string | null;
}

interface LearningVelocityRow {
  skill_id: string;
  velocity: number;
}

interface BehaviourProfileRow {
  session_length_sweet_spot: number;
}

interface RepairRecordRow {
  id: string;
  root_cause_skill_id: string | null;
  status: string;
}

interface PlanOverrideRow {
  id: string;
  type: 'pin_skill' | 'dismiss_recommendation' | 'override_plan_item';
  target: {
    skill_id?: string;
    recommendation_key?: string;
    plan_id?: string;
    order?: number;
  };
  expires_at: string;
}

interface SkillNodeRow {
  id: string;
  name: string;
  domain_id: string | null;
}

interface LearningPlanRow {
  id: string;
  plan_type: string;
  status: string;
  sessions: unknown;
  milestones: unknown;
  valid_until: string;
  stale_since: string | null;
  created_at: string;
  updated_at: string;
  generated_algorithm_version: string;
}

interface UserProfileRow {
  year_level: number | null;
}

// ---------------------------------------------------------------------------
// Internal queue item
// ---------------------------------------------------------------------------

interface QueueItem {
  skillId: string;
  domainId: string | null;
  skillName: string;
  masteryLevel: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  mode: string;
  rationaleClass: string;
}

// ---------------------------------------------------------------------------
// Payload types and parser
// ---------------------------------------------------------------------------

export interface OrchestratorReplanPayload {
  student_id: string;
  session_id: string;
  scheduled_at: string;
  tenant_id: string;
}

function parseOrchestratorReplanPayload(raw: unknown): OrchestratorReplanPayload {
  if (typeof raw !== 'object' || raw === null) throw new Error('payload must be an object');
  const p = raw as Record<string, unknown>;
  if (typeof p['student_id'] !== 'string') throw new Error('payload.student_id required (string)');
  if (typeof p['session_id'] !== 'string') throw new Error('payload.session_id required (string)');
  if (typeof p['scheduled_at'] !== 'string') throw new Error('payload.scheduled_at required (string)');
  if (typeof p['tenant_id'] !== 'string') throw new Error('payload.tenant_id required (string)');
  return {
    student_id: p['student_id'],
    session_id: p['session_id'],
    scheduled_at: p['scheduled_at'],
    tenant_id: p['tenant_id'],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeRetentionEstimate(
  mastery: number,
  lastAttemptedAt: string | null,
  halfLifeDays: number,
  now: Date
): number {
  // Spec §16.2 retention_estimate: not a persisted column; computed inline.
  // Reuses @mm/engines retentionHalfLifeDays() from Stage 29 (Q-29.3). v1.1 may persist or replace formula.
  if (lastAttemptedAt === null) return mastery; // NULL last_attempted_at → no decay
  const daysSince =
    (now.getTime() - new Date(lastAttemptedAt).getTime()) / (1000 * 60 * 60 * 24);
  return mastery * Math.exp(-daysSince / halfLifeDays);
}

function difficultyLabel(mastery: number): string {
  if (mastery < 0.3) return 'introductory';
  if (mastery < 0.6) return 'developing';
  if (mastery < 0.8) return 'consolidating';
  return 'extending';
}

function makeRecommendationKey(skillId: string, mode: string, rationaleClass: string): string {
  // Q-31.6: spec says "deterministic hash of (skill_id, mode, rationale_class)"; colon-separated composite string.
  return `${skillId}:${mode}:${rationaleClass}`;
}

function interleaveDomains(items: QueueItem[]): QueueItem[] {
  // spec §16.2 line 2358: no more than 2 consecutive sessions on same domain.
  const result: QueueItem[] = [];
  const remaining = [...items];
  while (remaining.length > 0) {
    const len = result.length;
    const needBreak =
      len >= 2 &&
      result[len - 1]!.domainId !== null &&
      result[len - 1]!.domainId === result[len - 2]!.domainId;
    if (needBreak) {
      const altIdx = remaining.findIndex((x) => x.domainId !== result[len - 1]!.domainId);
      result.push(...remaining.splice(altIdx >= 0 ? altIdx : 0, 1));
    } else {
      result.push(...remaining.splice(0, 1));
    }
  }
  return result;
}

async function checkPlanReadAccess(
  studentId: string,
  caller: Caller
): Promise<boolean> {
  if (caller.role === 'platform_admin' || caller.role === 'org_admin') return true;
  if (caller.role === 'student') return caller.userId === studentId;
  if (caller.role === 'teacher' || caller.role === 'tutor') return true;
  return false;
}

// ---------------------------------------------------------------------------
// processOrchestratorReplan
// ---------------------------------------------------------------------------

export async function processOrchestratorReplan(
  rawPayload: unknown,
  db: DbClient,
  now: Date = new Date(),
  generateUuid: () => string = () => crypto.randomUUID()
): Promise<OrchestratorReplanResult> {
  const t0 = now.getTime();
  const payload = parseOrchestratorReplanPayload(rawPayload);
  const nowIso = now.toISOString();
  let existingPlan: LearningPlanRow | null = null;

  try {
    // 1. Load existing active weekly plan
    const { data: planRows, error: planErr } = (await db
      .from('learning_plan')
      .select(
        'id,plan_type,status,sessions,milestones,valid_until,stale_since,created_at,updated_at,generated_algorithm_version'
      )
      .eq('student_id', payload.student_id)
      .eq('plan_type', 'weekly')
      .eq('status', 'active')
      .limit(1)) as { data: LearningPlanRow[] | null; error: unknown };
    if (planErr) throw new Error(`learning_plan load failed: ${String(planErr)}`);
    existingPlan = planRows?.[0] ?? null;

    // 2. Idempotency check — spec: skip if learning_plan.updated_at > job scheduled_at (DEV_PLAN verbatim)
    if (existingPlan && new Date(existingPlan.updated_at) > new Date(payload.scheduled_at)) {
      return {
        student_id: payload.student_id,
        plan_type: 'weekly',
        skipped: true,
        reason: 'idempotent_skip',
        sessions_generated: 0,
        processing_time_ms: Date.now() - t0,
      };
    }

    // 3. Load signals in parallel
    const [masteryRes, velocityRes, profileRes, , repairRes, overrideRes, userRes] =
      await Promise.all([
        db
          .from('skill_mastery')
          .select('skill_id,mastery_level,last_attempted_at')
          .eq('student_id', payload.student_id) as unknown as Promise<{
            data: SkillMasteryRow[] | null;
            error: unknown;
          }>,
        db
          .from('learning_velocity')
          .select('skill_id,velocity')
          .eq('student_id', payload.student_id) as unknown as Promise<{
            data: LearningVelocityRow[] | null;
            error: unknown;
          }>,
        db
          .from('behaviour_profile')
          .select('session_length_sweet_spot')
          .eq('student_id', payload.student_id)
          .single() as unknown as Promise<{ data: BehaviourProfileRow | null; error: unknown }>,
        db
          .from('student_misconception')
          .select('id,status')
          .eq('student_id', payload.student_id)
          .in('status', ['active', 'suspected']) as unknown as Promise<{
            data: unknown[] | null;
            error: unknown;
          }>,
        // PHASE-2: L4 repair engine deferred per CLAUDE.md scope; query returns empty in v1.
        db
          .from('repair_record')
          .select('id,root_cause_skill_id,status')
          .eq('student_id', payload.student_id)
          .eq('status', 'queued') as unknown as Promise<{
            data: RepairRecordRow[] | null;
            error: unknown;
          }>,
        db
          .from('plan_override')
          .select('id,type,target,expires_at')
          .eq('student_id', payload.student_id)
          .gte('expires_at', nowIso) as unknown as Promise<{
            data: PlanOverrideRow[] | null;
            error: unknown;
          }>,
        db
          .from('user_profile')
          .select('year_level')
          .eq('id', payload.student_id)
          .single() as unknown as Promise<{ data: UserProfileRow | null; error: unknown }>,
      ]);

    if (masteryRes.error) throw new Error(`skill_mastery load failed: ${String(masteryRes.error)}`);
    if (velocityRes.error)
      throw new Error(`learning_velocity load failed: ${String(velocityRes.error)}`);
    if (overrideRes.error)
      throw new Error(`plan_override load failed: ${String(overrideRes.error)}`);

    const masteryRows = masteryRes.data ?? [];
    const velocityRows = velocityRes.data ?? [];
    const behaviourProfile = profileRes.data;
    const repairRows = repairRes.data ?? [];
    const overrideRows = overrideRes.data ?? [];
    const yearLevel = userRes.data?.year_level ?? 9;

    // session_length_sweet_spot default: 20 min (migration 0005 line 67).
    const sessionLengthSweetSpot = behaviourProfile?.session_length_sweet_spot ?? 20;
    // available_minutes_per_week = session_length_sweet_spot * 5 (Q-31.1; spec §16.2 function signature).
    const availableMinutesPerWeek = sessionLengthSweetSpot * 5;
    // spec §16.6 session guardrail: sweet_spot + 5 min max.
    const sessionDuration = Math.min(
      sessionLengthSweetSpot,
      sessionLengthSweetSpot + SESSION_LENGTH_BUFFER_MINUTES
    );

    // 4. Load skill_node names + domain_ids (needed for interleave rule and DTO)
    const skillIds = masteryRows.map((r) => r.skill_id);
    let skillNodes: SkillNodeRow[] = [];
    if (skillIds.length > 0) {
      const { data: nodeRows } = (await db
        .from('skill_node')
        .select('id,name,domain_id')
        .in('id', skillIds)) as { data: SkillNodeRow[] | null; error: unknown };
      skillNodes = nodeRows ?? [];
    }
    const skillNodeMap = new Map<string, SkillNodeRow>(skillNodes.map((n) => [n.id, n]));
    const velocityMap = new Map<string, number>(velocityRows.map((v) => [v.skill_id, v.velocity]));

    // Spec §16.2 retention_estimate computed via retentionHalfLifeDays (Q-31.3; @mm/engines Stage 29).
    const halfLifeDays = retentionHalfLifeDays(yearLevel);

    // -----------------------------------------------------------------------
    // 5. Build priority queue per spec §16.2 — 6 steps
    //    Priority order: repair > root cause > declining > low retention > practice > stretch
    // -----------------------------------------------------------------------

    // Step 1 — Repair sequences (L4 repair engine)
    // PHASE-2: L4 repair engine deferred per CLAUDE.md scope; query returns empty in v1.
    const repairQueueItems: QueueItem[] = [];

    // Max concurrent repairs guardrail — spec §16.6: no more than 3 repair sequences simultaneously.
    const activeRepairCount = repairRows.length;
    const repairSlotsAvailable = Math.max(0, MAX_CONCURRENT_REPAIRS - activeRepairCount);
    const allowedRepairItems = repairQueueItems.slice(0, repairSlotsAvailable);

    // Step 2 — Root cause skills from causal analysis
    // PHASE-2: L4 repair engine deferred per CLAUDE.md scope; root_cause skill queue returns empty in v1.
    const rootCauseItems: QueueItem[] = [];

    // Step 3 — Declining velocity skills (spec §16.2 line 2331: velocity < -0.01)
    const decliningItems: QueueItem[] = [];
    for (const row of masteryRows) {
      const velocity = velocityMap.get(row.skill_id) ?? 0;
      if (velocity < DECLINING_VELOCITY_THRESHOLD) {
        const node = skillNodeMap.get(row.skill_id);
        decliningItems.push({
          skillId: row.skill_id,
          domainId: node?.domain_id ?? null,
          skillName: node?.name ?? row.skill_id,
          masteryLevel: row.mastery_level,
          priority: 'high',
          mode: 'practice',
          rationaleClass: 'declining_velocity',
        });
      }
    }

    // Step 4 — Low retention skills (spec §16.2 line 2335: retention_estimate < 0.5 and mastery > 0.6)
    // Spec §16.2 retention_estimate: not a persisted column; computed inline.
    // Reuses @mm/engines retentionHalfLifeDays() from Stage 29 (Q-29.3). v1.1 may persist or replace formula.
    const lowRetentionItems: QueueItem[] = [];
    for (const row of masteryRows) {
      const retention = computeRetentionEstimate(
        row.mastery_level,
        row.last_attempted_at,
        halfLifeDays,
        now
      );
      if (
        retention < LOW_RETENTION_ESTIMATE_THRESHOLD &&
        row.mastery_level > LOW_RETENTION_MASTERY_THRESHOLD
      ) {
        const node = skillNodeMap.get(row.skill_id);
        lowRetentionItems.push({
          skillId: row.skill_id,
          domainId: node?.domain_id ?? null,
          skillName: node?.name ?? row.skill_id,
          masteryLevel: row.mastery_level,
          priority: 'medium',
          mode: 'practice',
          rationaleClass: 'low_retention',
        });
      }
    }

    // Step 5 — Practice: gap skills (mastery < 0.5)
    const practiceItems: QueueItem[] = [];
    for (const row of masteryRows) {
      if (row.mastery_level < GAP_SKILL_MASTERY_THRESHOLD) {
        const node = skillNodeMap.get(row.skill_id);
        practiceItems.push({
          skillId: row.skill_id,
          domainId: node?.domain_id ?? null,
          skillName: node?.name ?? row.skill_id,
          masteryLevel: row.mastery_level,
          priority: 'medium',
          mode: 'practice',
          rationaleClass: 'practice',
        });
      }
    }

    // Step 6 — Stretch (L6 stretch layer)
    // PHASE-2: L6 stretch layer deferred per CLAUDE.md scope; empty in v1.
    const stretchItems: QueueItem[] = [];

    // Enjoyment pad — spec §16.6: at least 20% of plan time is "enjoyment" sessions.
    // Q-31.5: mastery > 0.7 = "skills the student is good at"; time-based (minutes, not session count).
    const enjoymentMinutes = Math.ceil(ENJOYMENT_MIN_FRACTION * availableMinutesPerWeek);
    const enjoymentSlots = Math.max(1, Math.ceil(enjoymentMinutes / sessionDuration));
    const enjoymentItems: QueueItem[] = masteryRows
      .filter((r) => r.mastery_level > ENJOYMENT_MASTERY_THRESHOLD)
      .slice(0, enjoymentSlots)
      .map((r) => {
        const node = skillNodeMap.get(r.skill_id);
        return {
          skillId: r.skill_id,
          domainId: node?.domain_id ?? null,
          skillName: node?.name ?? r.skill_id,
          masteryLevel: r.mastery_level,
          priority: 'low' as const,
          mode: 'practice',
          rationaleClass: 'enjoyment',
        };
      });

    // Merge in spec §16.2 priority order: repair > root cause > declining > low retention > practice > stretch
    const mainMinutes = availableMinutesPerWeek - enjoymentMinutes;
    const mainSlots = Math.max(0, Math.floor(mainMinutes / sessionDuration));
    const mainQueue: QueueItem[] = [
      ...allowedRepairItems,
      ...rootCauseItems,
      ...decliningItems,
      ...lowRetentionItems,
      ...practiceItems,
      ...stretchItems,
    ].slice(0, mainSlots);

    const rawQueue: QueueItem[] = [...mainQueue, ...enjoymentItems];

    // -----------------------------------------------------------------------
    // 6. Apply plan_override filters
    // -----------------------------------------------------------------------

    const appliedOverrideIds: string[] = [];
    let queueAfterOverrides = rawQueue;

    for (const override of overrideRows) {
      if (override.type === 'dismiss_recommendation') {
        const targetKey = override.target.recommendation_key;
        if (!targetKey) continue;
        const before = queueAfterOverrides.length;
        queueAfterOverrides = queueAfterOverrides.filter((item) => {
          const key = makeRecommendationKey(item.skillId, item.mode, item.rationaleClass);
          return key !== targetKey;
        });
        if (queueAfterOverrides.length < before) appliedOverrideIds.push(override.id);
      } else if (override.type === 'pin_skill') {
        const targetSkillId = override.target.skill_id;
        if (!targetSkillId) continue;
        const existing = queueAfterOverrides.find((item) => item.skillId === targetSkillId);
        if (!existing) {
          const node = skillNodeMap.get(targetSkillId);
          queueAfterOverrides = [
            {
              skillId: targetSkillId,
              domainId: node?.domain_id ?? null,
              skillName: node?.name ?? targetSkillId,
              masteryLevel: 0,
              priority: 'high',
              mode: 'practice',
              rationaleClass: 'pin_skill',
            },
            ...queueAfterOverrides,
          ];
        } else {
          queueAfterOverrides = queueAfterOverrides.map((item) =>
            item.skillId === targetSkillId
              ? { ...item, priority: 'high' as const, rationaleClass: 'pin_skill' }
              : item
          );
        }
        appliedOverrideIds.push(override.id);
      }
      // override_plan_item: targets {plan_id, order} of previous plan — skipped for new plan (Q-31.8).
    }

    // -----------------------------------------------------------------------
    // 7. Interleave domains — spec §16.2 line 2358: ≤2 consecutive same-domain sessions
    // -----------------------------------------------------------------------

    const interleavedQueue = interleaveDomains(queueAfterOverrides);

    // -----------------------------------------------------------------------
    // 8. Build sessions (stored as jsonb in learning_plan.sessions)
    // -----------------------------------------------------------------------

    const sessions: LearningPlanItemDTO[] = interleavedQueue.map((item, i) => ({
      order: i + 1,
      week: 1,
      mode: item.mode,
      target_skill_ids: [item.skillId],
      target_skill_names: [item.skillName],
      difficulty_label: difficultyLabel(item.masteryLevel),
      estimated_duration_min: sessionDuration,
      rationale: item.rationaleClass,
      priority: item.priority,
      status: 'pending',
    }));

    // -----------------------------------------------------------------------
    // 9. Write phase
    // -----------------------------------------------------------------------

    // FOR UPDATE not available in Supabase JS client; idx_plan_active unique partial index + optimistic UPDATE as concurrency guard (Q-31.7).
    if (existingPlan) {
      await db
        .from('learning_plan')
        .update({ status: 'superseded', updated_at: nowIso })
        .eq('id', existingPlan.id)
        .eq('status', 'active');
    }

    const newPlanId = generateUuid();
    const validUntil = new Date(
      now.getTime() + PLAN_VALIDITY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { error: insertErr } = (await db.from('learning_plan').insert({
      id: newPlanId,
      student_id: payload.student_id,
      tenant_id: payload.tenant_id,
      plan_type: 'weekly',
      status: 'active',
      valid_until: validUntil,
      sessions,
      constraints_applied: {
        max_concurrent_repairs: MAX_CONCURRENT_REPAIRS,
        enjoyment_min_fraction: ENJOYMENT_MIN_FRACTION,
        max_consecutive_same_domain: MAX_CONSECUTIVE_SAME_DOMAIN,
        override_default_expiry_days: OVERRIDE_DEFAULT_EXPIRY_DAYS,
        overrides_applied: appliedOverrideIds,
      },
      milestones: null,
      generated_algorithm_version: L9_ALGORITHM_VERSION,
    })) as { data: unknown; error: unknown };
    if (insertErr) throw new Error(`learning_plan insert failed: ${String(insertErr)}`);

    await db.from('plan_revision').insert({
      plan_id: newPlanId,
      revision: 1,
      reason: `L9 weekly replan session_id:${payload.session_id} algorithm_version:${L9_ALGORITHM_VERSION}`,
      diff_summary: {
        previous_plan_id: existingPlan?.id ?? null,
        sessions_count: sessions.length,
      },
    });

    // Stage 28 L3b precedent; session-scoped per arch §5.2 replan:{student_id}:{session_id} — pipeline_event writable unlike L5/L7.
    await db.from('pipeline_event').insert({
      session_id: payload.session_id,
      student_id: payload.student_id,
      step: 9,
      step_name: 'orchestration.replan',
      status: 'processing',
      started_at: nowIso,
    });

    await db
      .from('pipeline_event')
      .update({ status: 'completed', completed_at: nowIso, error: null })
      .eq('session_id', payload.session_id)
      .eq('step', 9);

    await db.from('intelligence_audit_log').insert({
      student_id: payload.student_id,
      tenant_id: payload.tenant_id,
      event_type: 'orchestration_replan',
      layer: 'L9',
      algorithm_version: L9_ALGORITHM_VERSION,
      input_snapshot: {
        session_id: payload.session_id,
        scheduled_at: payload.scheduled_at,
        mastery_count: masteryRows.length,
        velocity_count: velocityRows.length,
        override_count: overrideRows.length,
      },
      output: {
        plan_id: newPlanId,
        sessions_count: sessions.length,
        overrides_applied: appliedOverrideIds.length,
      },
      trace_id: null,
    });

    // Override lifecycle audit — spec §16.6.1 line 2508: every override creation and expiry writes
    // an entry to intelligence_audit_log with layer='L9_override'.
    if (appliedOverrideIds.length > 0) {
      await db.from('intelligence_audit_log').insert(
        appliedOverrideIds.map((oid) => ({
          student_id: payload.student_id,
          tenant_id: payload.tenant_id,
          event_type: 'override_applied',
          layer: 'L9_override',
          algorithm_version: L9_ALGORITHM_VERSION,
          input_snapshot: { override_id: oid },
          output: { plan_id: newPlanId },
          trace_id: null,
        }))
      );
    }

    return {
      student_id: payload.student_id,
      plan_type: 'weekly',
      skipped: false,
      new_plan_id: newPlanId,
      sessions_generated: sessions.length,
      processing_time_ms: Date.now() - t0,
    };
  } catch (err) {
    // Failure path: set stale_since on existing active plan; no new plan inserted, no plan_revision.
    if (existingPlan) {
      await db
        .from('learning_plan')
        .update({ stale_since: nowIso })
        .eq('id', existingPlan.id);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// getCurrentPlan
// ---------------------------------------------------------------------------

export async function getCurrentPlan(
  studentId: string,
  planType: string,
  caller: Caller,
  db: DbClient
): Promise<{ data: LearningPlanDTO | null; status: number; error?: string }> {
  const authorized = await checkPlanReadAccess(studentId, caller);
  if (!authorized) return { data: null, status: 403, error: 'FORBIDDEN' };

  const { data: planRows, error: planErr } = (await db
    .from('learning_plan')
    .select(
      'id,plan_type,status,sessions,milestones,valid_until,stale_since,created_at'
    )
    .eq('student_id', studentId)
    .eq('plan_type', planType)
    .eq('status', 'active')
    .limit(1)) as { data: LearningPlanRow[] | null; error: unknown };

  if (planErr) return { data: null, status: 500, error: 'DB_ERROR' };
  const plan = planRows?.[0] ?? null;
  if (!plan) return { data: null, status: 200 };

  const dto: LearningPlanDTO = {
    plan_id: plan.id,
    plan_type: plan.plan_type as LearningPlanDTO['plan_type'],
    status: plan.status as LearningPlanDTO['status'],
    created_at: plan.created_at,
    valid_until: plan.valid_until,
    sessions: Array.isArray(plan.sessions) ? (plan.sessions as LearningPlanItemDTO[]) : [],
    milestones: Array.isArray(plan.milestones)
      ? (plan.milestones as LearningPlanDTO['milestones'])
      : null,
    stale_since: plan.stale_since,
  };

  return { data: dto, status: 200 };
}

// ---------------------------------------------------------------------------
// generatePlan
// ---------------------------------------------------------------------------

export async function generatePlan(
  studentId: string,
  tenantId: string,
  caller: Caller,
  db: DbClient,
  now: Date = new Date(),
  generateUuid: () => string = () => crypto.randomUUID()
): Promise<{ data: LearningPlanDTO | null; status: number; error?: string }> {
  const authorized = await checkPlanReadAccess(studentId, caller);
  if (!authorized) return { data: null, status: 403, error: 'FORBIDDEN' };

  const sessionId = generateUuid();
  const payload: OrchestratorReplanPayload = {
    student_id: studentId,
    session_id: sessionId,
    scheduled_at: now.toISOString(),
    tenant_id: tenantId,
  };

  // ISSUE-0020: generatePlan calls processOrchestratorReplan
  // synchronously in v1; async upgrade deferred to v1.1.
  await processOrchestratorReplan(payload, db, now, generateUuid);

  return getCurrentPlan(studentId, 'weekly', caller, db);
}
