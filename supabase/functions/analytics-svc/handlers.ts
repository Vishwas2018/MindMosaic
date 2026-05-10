/**
 * analytics-svc handlers — Stage 30.
 *
 * L7 Teacher Intervention Intelligence (spec §14) + auto-group read endpoint.
 * Dispatched by jobs-worker via POST /analytics/pipeline/teacher-refresh (ADR-0031).
 *
 * Observability note (ADR-0032 — Stage 30 Amendment):
 *   pipeline_event skipped: session_id NOT NULL blocks class-scoped writes.
 *   intelligence_audit_log skipped: student_id NOT NULL blocks class-scoped writes.
 *   Sole observability surface: intervention_alert INSERTs + cohort_metric_cache UPSERT.
 *   // ADR-0032: intelligence_audit_log skipped — student_id NOT NULL blocks
 *   //           class-scoped writes; observability via intervention_alert + cohort_metric_cache
 *
 * Alert triggers (§14.2) — 5 of 6 implemented:
 *   ✓ declining_performance   velocity < -0.02 across ≥3 skills   (warning)
 *   ✓ persistent_misconception active >21 days or recurred         (warning)
 *   ✓ repair_failure           repair_attempts ≥ 2                 (urgent)
 *   ✓ low_persistence          persistence_score < 0.3             (warning)
 *   ✓ exceptional_progress     velocity > 0.05 across ≥3 skills    (info)
 *   ✗ high_fatigue             DEFERRED — ISSUE-0017: avg_fatigue_onset_minutes
 *                              is a rolling average, not per-session onset data.
 *                              Cannot derive last-5-session fatigue pattern from
 *                              this column without a per-session join.
 *
 * k-means: Lloyd's, k=4 per Spec §14.1 (max_groups=4), determinism contract per Q-30.3 (see @mm/engines kMeans).
 *
 * Spec refs: §14.1–§14.3; arch §4.7, §1.2, §2.10; ADR-0031, ADR-0032, ADR-0033.
 */

import { kMeans } from '@mm/engines';

// ---------------------------------------------------------------------------
// DbClient contract (mirrors intelligence-svc shape for test harness parity)
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
// Payload + result types
// ---------------------------------------------------------------------------

export interface TeacherRefreshPayload {
  class_id: string;
  skill_id: string;
  tenant_id: string;
  trace_id?: string;
}

function parseTeacherRefreshPayload(raw: unknown): TeacherRefreshPayload {
  if (typeof raw !== 'object' || raw === null) throw new Error('payload must be an object');
  const p = raw as Record<string, unknown>;
  if (typeof p['class_id'] !== 'string') throw new Error('payload.class_id required (string)');
  if (typeof p['skill_id'] !== 'string') throw new Error('payload.skill_id required (string)');
  if (typeof p['tenant_id'] !== 'string') throw new Error('payload.tenant_id required (string)');
  return {
    class_id: p['class_id'],
    skill_id: p['skill_id'],
    tenant_id: p['tenant_id'],
    trace_id: typeof p['trace_id'] === 'string' ? p['trace_id'] : undefined,
  };
}

export interface TeacherRefreshResult {
  class_id: string;
  skill_id: string;
  student_count: number;
  groups: number;
  alerts_inserted: number;
  alerts_suppressed: number;
  processing_time_ms: number;
}

// ---------------------------------------------------------------------------
// Internal row types
// ---------------------------------------------------------------------------

interface SkillMasteryRow {
  student_id: string;
  mastery_level: number;
}

interface LearningVelocityRow {
  student_id: string;
  skill_id: string;
  velocity: number;
}

interface BehaviourProfileRow {
  student_id: string;
  persistence_score: number;
  avg_cognitive_load_comfort: number;
}

interface MisconductRow {
  student_id: string;
  confidence: number;
  status: string;
  detected_at: string;
  repair_attempts: number;
}

interface AlertRow {
  student_id: string;
  alert_type: string;
  created_at: string;
}

interface ClassGroupRow {
  teacher_id: string;
}

interface ClassStudentRow {
  student_id: string;
}

// ---------------------------------------------------------------------------
// Role gate helper (for GET endpoints)
// ---------------------------------------------------------------------------

export interface Caller {
  userId: string;
  role: string;
}

// ---------------------------------------------------------------------------
// processTeacherRefresh
// ---------------------------------------------------------------------------

const L7_ALGORITHM_VERSION = 'L7.v1';
const K = 4; // Spec §14.1: auto_group(max_groups=4) → cluster(k=max_groups)
const DECLINE_THRESHOLD = -0.02;
const EXCEPTIONAL_THRESHOLD = 0.05;
const VELOCITY_MIN_SKILLS = 3;
const PERSISTENT_DAYS = 21;
const LOW_PERSISTENCE_THRESHOLD = 0.3;
const REPAIR_FAILURE_ATTEMPTS = 2;
const DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function processTeacherRefresh(
  rawPayload: unknown,
  db: DbClient,
  now: Date = new Date()
): Promise<TeacherRefreshResult> {
  const t0 = now.getTime();
  const payload = parseTeacherRefreshPayload(rawPayload);

  // 1. Load class group (teacher_id)
  const { data: classRows, error: classErr } = (await db
    .from('class_group')
    .select('teacher_id')
    .eq('id', payload.class_id)) as { data: ClassGroupRow[] | null; error: unknown };
  if (classErr || !classRows?.[0]) {
    throw new Error(`class_group load failed for ${payload.class_id}: ${String(classErr)}`);
  }
  const teacherId = classRows[0]!.teacher_id;

  // 2. Load class roster
  const { data: rosterRows, error: rosterErr } = (await db
    .from('class_student')
    .select('student_id')
    .eq('class_id', payload.class_id)) as { data: ClassStudentRow[] | null; error: unknown };
  if (rosterErr) throw new Error(`class_student load failed: ${String(rosterErr)}`);
  const studentIds = (rosterRows ?? []).map((r) => r.student_id);

  if (studentIds.length === 0) {
    return {
      class_id: payload.class_id,
      skill_id: payload.skill_id,
      student_count: 0,
      groups: 0,
      alerts_inserted: 0,
      alerts_suppressed: 0,
      processing_time_ms: Date.now() - t0,
    };
  }

  // 3. Parallel data load
  const [masteryRes, velocityRes, profileRes, miscRes, alertRes] = await Promise.all([
    db
      .from('skill_mastery')
      .select('student_id,mastery_level')
      .in('student_id', studentIds)
      .eq('skill_id', payload.skill_id) as unknown as Promise<{ data: SkillMasteryRow[] | null; error: unknown }>,
    db
      .from('learning_velocity')
      .select('student_id,skill_id,velocity')
      .in('student_id', studentIds) as unknown as Promise<{ data: LearningVelocityRow[] | null; error: unknown }>,
    db
      .from('behaviour_profile')
      .select('student_id,persistence_score,avg_cognitive_load_comfort')
      .in('student_id', studentIds) as unknown as Promise<{ data: BehaviourProfileRow[] | null; error: unknown }>,
    db
      .from('student_misconception')
      .select('student_id,confidence,status,detected_at,repair_attempts')
      .in('student_id', studentIds) as unknown as Promise<{ data: MisconductRow[] | null; error: unknown }>,
    db
      .from('intervention_alert')
      .select('student_id,alert_type,created_at')
      .in('student_id', studentIds)
      .eq('status', 'active') as unknown as Promise<{ data: AlertRow[] | null; error: unknown }>,
  ]);

  // 4. Build lookup maps
  const masteryMap = new Map<string, number>();
  for (const r of masteryRes.data ?? []) masteryMap.set(r.student_id, r.mastery_level);

  const velocityByStudent = new Map<string, LearningVelocityRow[]>();
  for (const r of velocityRes.data ?? []) {
    const list = velocityByStudent.get(r.student_id) ?? [];
    list.push(r);
    velocityByStudent.set(r.student_id, list);
  }

  const profileMap = new Map<string, BehaviourProfileRow>();
  for (const r of profileRes.data ?? []) profileMap.set(r.student_id, r);

  const miscByStudent = new Map<string, MisconductRow[]>();
  for (const r of miscRes.data ?? []) {
    const list = miscByStudent.get(r.student_id) ?? [];
    list.push(r);
    miscByStudent.set(r.student_id, list);
  }

  // 5. Soft dedup: active alerts within 2-hour window
  const twoHoursAgo = new Date(now.getTime() - DEDUP_WINDOW_MS);
  const dedupSet = new Set<string>();
  for (const a of alertRes.data ?? []) {
    if (new Date(a.created_at) >= twoHoursAgo) {
      dedupSet.add(`${a.student_id}:${a.alert_type}`);
    }
  }

  // 6. Build k-means feature vectors (skill-scoped mastery + velocity)
  const points = studentIds.map((sid) => {
    const masteryLevel = masteryMap.get(sid) ?? 0.0;
    const velocities = velocityByStudent.get(sid) ?? [];
    const skillVelocity = velocities.find((v) => v.skill_id === payload.skill_id)?.velocity ?? 0.0;
    const profile = profileMap.get(sid);
    const persistenceScore = profile?.persistence_score ?? 0.5;
    const cognitiveLoadComfort = profile?.avg_cognitive_load_comfort ?? 0.4;
    const miscs = miscByStudent.get(sid) ?? [];
    const topConf = miscs
      .filter((m) => m.status === 'active' || m.status === 'suspected')
      .reduce((best, m) => Math.max(best, m.confidence), 0.0);
    return {
      id: sid,
      features: [masteryLevel, skillVelocity, topConf, persistenceScore, cognitiveLoadComfort],
    };
  });

  const groups = kMeans(points, K);

  // 7. Evaluate trigger rules per student and collect alerts to insert
  const persistentCutoff = new Date(now.getTime() - PERSISTENT_DAYS * 24 * 60 * 60 * 1000);

  const alertsToInsert: Array<{
    student_id: string;
    tenant_id: string;
    class_id: string;
    teacher_id: string;
    alert_type: string;
    severity: string;
    detail: Record<string, unknown>;
  }> = [];

  let suppressed = 0;

  for (const sid of studentIds) {
    const velocities = velocityByStudent.get(sid) ?? [];
    const profile = profileMap.get(sid);
    const miscs = miscByStudent.get(sid) ?? [];

    const candidate = (
      alertType: string,
      severity: string,
      detail: Record<string, unknown>
    ) => {
      const key = `${sid}:${alertType}`;
      if (dedupSet.has(key)) {
        suppressed++;
        return;
      }
      alertsToInsert.push({
        student_id: sid,
        tenant_id: payload.tenant_id,
        class_id: payload.class_id,
        teacher_id: teacherId,
        alert_type: alertType,
        severity,
        detail,
      });
    };

    // declining_performance: velocity < -0.02 across ≥3 skills
    const decliningSkills = velocities.filter((v) => v.velocity < DECLINE_THRESHOLD);
    if (decliningSkills.length >= VELOCITY_MIN_SKILLS) {
      candidate('declining_performance', 'warning', {
        declining_skill_count: decliningSkills.length,
        skill_ids: decliningSkills.map((v) => v.skill_id),
      });
    }

    // persistent_misconception: active >21 days or recurred
    const persistent = miscs.find(
      (m) =>
        (m.status === 'active' && new Date(m.detected_at) < persistentCutoff) ||
        m.status === 'recurred'
    );
    if (persistent) {
      candidate('persistent_misconception', 'warning', {
        status: persistent.status,
        detected_at: persistent.detected_at,
        confidence: persistent.confidence,
      });
    }

    // repair_failure: repair_attempts >= 2
    const failedRepair = miscs.find((m) => m.repair_attempts >= REPAIR_FAILURE_ATTEMPTS);
    if (failedRepair) {
      candidate('repair_failure', 'urgent', {
        repair_attempts: failedRepair.repair_attempts,
        status: failedRepair.status,
      });
    }

    // low_persistence: persistence_score < 0.3
    const persistenceScore = profile?.persistence_score ?? 0.5;
    if (persistenceScore < LOW_PERSISTENCE_THRESHOLD) {
      candidate('low_persistence', 'warning', { persistence_score: persistenceScore });
    }

    // exceptional_progress: velocity > 0.05 across ≥3 skills
    const exceptionalSkills = velocities.filter((v) => v.velocity > EXCEPTIONAL_THRESHOLD);
    if (exceptionalSkills.length >= VELOCITY_MIN_SKILLS) {
      candidate('exceptional_progress', 'info', {
        exceptional_skill_count: exceptionalSkills.length,
        skill_ids: exceptionalSkills.map((v) => v.skill_id),
      });
    }

    // high_fatigue: DEFERRED — ISSUE-0017
    // avg_fatigue_onset_minutes is a rolling average (not per-session onset data);
    // last-5-session pattern requires a per-session join not available as a direct column.
  }

  // 8. Insert alerts
  if (alertsToInsert.length > 0) {
    const { error: insertErr } = (await db
      .from('intervention_alert')
      .insert(alertsToInsert)) as { data: unknown; error: unknown };
    if (insertErr) throw new Error(`intervention_alert insert failed: ${String(insertErr)}`);

    // Q-34.4: notify teacher per alert (ADR-0031 fourth amendment).
    // aggregate_id = student_id UUID (Q-34.6 self-resolve: alert_id not returned by bulk INSERT).
    // ISSUE-0025 dedup guard: (teacher_id, intervention_alert, student_id) within 1h in notifications-svc.
    await db.from('outbox_event').insert(
      alertsToInsert.map((a) => ({
        aggregate_type: 'alert',
        aggregate_id: a.student_id,
        event_type: 'intervention_alert',
        payload: { student_id: a.student_id, teacher_id: a.teacher_id, tenant_id: a.tenant_id, alert_type: a.alert_type },
      }))
    );
  }

  // 9. Upsert cohort_metric_cache
  // ADR-0032: intelligence_audit_log skipped — student_id NOT NULL blocks
  //           class-scoped writes; observability via intervention_alert + cohort_metric_cache
  const processingMs = Date.now() - t0;
  const cacheValue = {
    groups: groups.map((g) => ({ centroid: g.centroid, member_ids: g.memberIds })),
    k: K,
    student_count: studentIds.length,
    algorithm_version: L7_ALGORITHM_VERSION,
    computed_at: now.toISOString(),
    processing_time_ms: processingMs,
  };
  const { error: upsertErr } = (await db.from('cohort_metric_cache').upsert(
    {
      cohort_key: `class:${payload.class_id}:${payload.skill_id}`,
      metric_key: 'auto_groups',
      time_bucket: now.toISOString().slice(0, 10),
      tenant_id: payload.tenant_id,
      value: cacheValue,
      computed_at: now.toISOString(),
    },
    { onConflict: 'cohort_key,metric_key,time_bucket,tenant_id' }
  )) as { data: unknown; error: unknown };
  if (upsertErr) throw new Error(`cohort_metric_cache upsert failed: ${String(upsertErr)}`);

  return {
    class_id: payload.class_id,
    skill_id: payload.skill_id,
    student_count: studentIds.length,
    groups: groups.length,
    alerts_inserted: alertsToInsert.length,
    alerts_suppressed: suppressed,
    processing_time_ms: processingMs,
  };
}

// ---------------------------------------------------------------------------
// getAutoGroups
// ---------------------------------------------------------------------------

export interface AutoGroupsResult {
  cohort_key: string;
  time_bucket: string;
  value: unknown;
}

export async function getAutoGroups(
  classId: string,
  skillId: string,
  caller: Caller,
  db: DbClient
): Promise<{ data: AutoGroupsResult | null; status: number; error?: string }> {
  const gate = await checkTeacherOwnership(classId, caller, db);
  if (gate.forbidden) return { data: null, status: 403, error: 'FORBIDDEN' };

  const cohortKey = `class:${classId}:${skillId}`;
  const { data: rows, error } = (await db
    .from('cohort_metric_cache')
    .select('cohort_key,time_bucket,value')
    .eq('cohort_key', cohortKey)
    .eq('metric_key', 'auto_groups')
    .order('time_bucket', { ascending: false })
    .limit(1)) as { data: Array<{ cohort_key: string; time_bucket: string; value: unknown }> | null; error: unknown };

  if (error) return { data: null, status: 500, error: 'DB_ERROR' };
  if (!rows?.[0]) return { data: null, status: 200 };
  return { data: rows[0], status: 200 };
}

// ---------------------------------------------------------------------------
// getInterventionAlerts
// ---------------------------------------------------------------------------

export interface InterventionAlertRow {
  id: string;
  student_id: string;
  alert_type: string;
  severity: string;
  status: string;
  detail: unknown;
  created_at: string;
}

export async function getInterventionAlerts(
  classId: string,
  caller: Caller,
  db: DbClient
): Promise<{ data: InterventionAlertRow[] | null; status: number; error?: string }> {
  const gate = await checkTeacherOwnership(classId, caller, db);
  if (gate.forbidden) return { data: null, status: 403, error: 'FORBIDDEN' };

  const { data: rows, error } = (await db
    .from('intervention_alert')
    .select('id,student_id,alert_type,severity,status,detail,created_at')
    .eq('class_id', classId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })) as {
    data: InterventionAlertRow[] | null;
    error: unknown;
  };

  if (error) return { data: null, status: 500, error: 'DB_ERROR' };
  return { data: rows ?? [], status: 200 };
}

// ---------------------------------------------------------------------------
// Internal: teacher ownership gate
// ---------------------------------------------------------------------------

async function checkTeacherOwnership(
  classId: string,
  caller: Caller,
  db: DbClient
): Promise<{ forbidden: boolean }> {
  const isAdmin = caller.role === 'platform_admin' || caller.role === 'org_admin';
  if (isAdmin) return { forbidden: false };

  if (caller.role !== 'teacher') return { forbidden: true };

  const { data: rows } = (await db
    .from('class_group')
    .select('teacher_id')
    .eq('id', classId)) as { data: ClassGroupRow[] | null; error: unknown };

  const owns = rows?.[0]?.teacher_id === caller.userId;
  return { forbidden: !owns };
}

// ---------------------------------------------------------------------------
// Stage 32 — Analytics GET endpoints + generate-assignment
//
// Spec refs: arch §4.7, §6.4 (PathwayReadinessDTO), §6.6 (AssignmentDTO);
// spec §9.6 (30-day staleness); spec §14.3 (generate-assignment defaults);
// Q-32.1 (DraftAssignmentDTO), Q-32.2 (CohortDTO), Q-32.3–Q-32.5.
// ---------------------------------------------------------------------------

const THIRTY_DAYS_MS_A = 30 * 24 * 60 * 60 * 1000;
const L5_SKILL_THRESHOLD_A = 0.6; // Q-32.3: target_mastery for gap skills
const ASSIGNMENT_ITEM_COUNT_DEFAULT = 15; // spec §14.3 line 2135

function staleSinceA(computedAt: string, nowMs: number): string | null {
  return nowMs - new Date(computedAt).getTime() > THIRTY_DAYS_MS_A ? computedAt : null;
}

function compositeLabel(score: number): 'not_ready' | 'developing' | 'on_track' | 'ready' | 'strong' {
  // Q-32.4: threshold bands derived from 5-band split (arch unspecified).
  if (score < 0.3) return 'not_ready';
  if (score < 0.5) return 'developing';
  if (score < 0.7) return 'on_track';
  if (score < 0.85) return 'ready';
  return 'strong';
}

function isTeacherOrAdmin(caller: Caller): boolean {
  return (
    caller.role === 'teacher' ||
    caller.role === 'tutor' ||
    caller.role === 'org_admin' ||
    caller.role === 'platform_admin'
  );
}

// ---------------------------------------------------------------------------
// CohortDTO + getCohort
// ---------------------------------------------------------------------------

export interface ClusterGroup {
  centroid: number[];
  member_ids: string[];
}

export interface CohortDTO {
  group_id: string;
  class_id: string;
  skill_id: string;
  groups: ClusterGroup[];
  computed_at: string;
  stale_since: string | null;
}

type AnalyticsResult<T> = { data: T | null; status: number; error?: string };

/**
 * GET /analytics/cohort/{group_id} (arch §4.7).
 * group_id = cohort_key string (format: class:{class_id}:{skill_id}).
 * Teacher/admin only. Returns most recent auto_groups result from cohort_metric_cache.
 */
export async function getCohort(
  groupId: string,
  caller: Caller,
  db: DbClient,
): Promise<AnalyticsResult<CohortDTO>> {
  if (!isTeacherOrAdmin(caller)) return { data: null, status: 403, error: 'FORBIDDEN' };

  // Teacher ownership: parse class_id from cohort_key (class:{class_id}:{skill_id}).
  const parts = groupId.split(':');
  const classId = parts[1] ?? '';
  if (caller.role === 'teacher' || caller.role === 'tutor') {
    const gate = await checkTeacherOwnership(classId, caller, db);
    if (gate.forbidden) return { data: null, status: 403, error: 'FORBIDDEN' };
  }

  const { data: rows, error } = (await db
    .from('cohort_metric_cache')
    .select('cohort_key,value,computed_at')
    .eq('cohort_key', groupId)
    .eq('metric_key', 'auto_groups')
    .order('computed_at', { ascending: false })
    .limit(1)) as { data: Array<{ cohort_key: string; value: { groups?: ClusterGroup[] }; computed_at: string }> | null; error: unknown };

  if (error) return { data: null, status: 500, error: 'DB_ERROR' };
  if (!rows?.[0]) return { data: null, status: 404, error: 'NOT_FOUND' };

  const row = rows[0]!;
  const skillId = parts[2] ?? '';
  return {
    data: {
      group_id: groupId,
      class_id: classId,
      skill_id: skillId,
      groups: row.value.groups ?? [],
      computed_at: row.computed_at,
      stale_since: staleSinceA(row.computed_at, Date.now()),
    },
    status: 200,
  };
}

// ---------------------------------------------------------------------------
// PathwayReadinessDTO + getPathwayReadiness
// ---------------------------------------------------------------------------

export interface PathwayReadinessDTO {
  pathway_slug: string;
  pathway_name: string;
  skill_readiness: number;
  coverage: number;
  condition_readiness: number;
  composite_readiness: number;
  composite_label: 'not_ready' | 'developing' | 'on_track' | 'ready' | 'strong';
  gap_skills: Array<{ skill_id: string; skill_name: string; current_mastery: number; target_mastery: number }>;
  active_misconceptions_affecting: number;
  predicted_ready_date: string | null;
  exam_date: string | null;
  days_remaining: number | null;
  stale_since: string | null;
}

interface L5PredictivePayloadFresh {
  status: 'fresh';
  current_readiness_score: number;
  gap_skills: Array<{ skill_id: string; mastery_level: number; velocity: number; estimated_mastery_date: string | null }>;
  data_points: number;
  computed_at: string;
}

interface L5PredictivePayloadInsufficient {
  status: 'insufficient_data';
}

type L5PredictivePayload = L5PredictivePayloadFresh | L5PredictivePayloadInsufficient;

/**
 * GET /analytics/pathway-readiness/{student_id}/{pathway_slug} (arch §4.7).
 * Reads L5 cache; maps to PathwayReadinessDTO per Q-32.3 Option B.
 * Role-gated: student reads own; teacher/admin reads any.
 */
export async function getPathwayReadiness(
  studentId: string,
  pathwaySlug: string,
  caller: Caller,
  db: DbClient,
): Promise<AnalyticsResult<PathwayReadinessDTO>> {
  // Role gate: student/parent reads own; teacher/admin reads any.
  if (!isTeacherOrAdmin(caller) && caller.role !== 'parent' && caller.userId !== studentId) {
    return { data: null, status: 403, error: 'FORBIDDEN' };
  }

  // 1. Load L5 cache entry.
  const { data: cacheRows, error: cacheErr } = (await db
    .from('cohort_metric_cache')
    .select('value,computed_at')
    .eq('cohort_key', studentId)
    .eq('metric_key', `readiness:${pathwaySlug}`)
    .order('computed_at', { ascending: false })
    .limit(1)) as { data: Array<{ value: L5PredictivePayload; computed_at: string }> | null; error: unknown };

  if (cacheErr) return { data: null, status: 500, error: 'DB_ERROR' };
  const cacheRow = cacheRows?.[0];
  if (!cacheRow) return { data: null, status: 404, error: 'NOT_FOUND' };

  const payload = cacheRow.value;
  if (payload.status === 'insufficient_data') {
    return { data: null, status: 404, error: 'NOT_FOUND' };
  }

  // 2. pathway display_name.
  const { data: pathwayRows, error: pathwayErr } = (await db
    .from('pathway')
    .select('display_name')
    .eq('slug', pathwaySlug)
    .limit(1)) as { data: Array<{ display_name: string }> | null; error: unknown };
  if (pathwayErr) return { data: null, status: 500, error: 'DB_ERROR' };
  const pathwayName = pathwayRows?.[0]?.display_name ?? pathwaySlug;

  // 3. skill_node names for gap_skills.
  const gapIds = [...payload.gap_skills].map(g => g.skill_id).sort();
  const skillNameMap = new Map<string, string>();
  if (gapIds.length > 0) {
    const { data: snRows, error: snErr } = (await db
      .from('skill_node')
      .select('id,name')
      .in('id', gapIds)) as { data: Array<{ id: string; name: string }> | null; error: unknown };
    if (snErr) return { data: null, status: 500, error: 'DB_ERROR' };
    for (const row of snRows ?? []) skillNameMap.set(row.id, row.name);
  }

  // 4. Map L5 payload → PathwayReadinessDTO (Q-32.3 Option B).
  const composite = payload.current_readiness_score;
  const gapSkills = [...payload.gap_skills]
    .sort((a, b) => a.skill_id.localeCompare(b.skill_id))
    .map(g => ({
      skill_id: g.skill_id,
      skill_name: skillNameMap.get(g.skill_id) ?? g.skill_id,
      current_mastery: g.mastery_level,
      target_mastery: L5_SKILL_THRESHOLD_A,
    }));

  return {
    data: {
      pathway_slug: pathwaySlug,
      pathway_name: pathwayName,
      skill_readiness: composite,       // Q-32.3: v1 uses single composite
      coverage: composite,
      condition_readiness: composite,
      composite_readiness: composite,
      composite_label: compositeLabel(composite),
      gap_skills: gapSkills,
      active_misconceptions_affecting: 0, // Q-32.3: not in L5 cache
      predicted_ready_date: null,          // Q-32.3: not in L5 cache
      exam_date: null,                     // DEV-20260519-1: exam_date v1.1 deferral
      days_remaining: null,
      stale_since: staleSinceA(cacheRow.computed_at, Date.now()),
    },
    status: 200,
  };
}

// ---------------------------------------------------------------------------
// DraftAssignmentDTO + generateAssignment
// ---------------------------------------------------------------------------

export interface DraftAssignmentDTO {
  title: string;
  description: string | null;
  mode: string;
  target_skill_ids: string[];
  target_skill_names: string[];
  difficulty_range: { min: number; max: number } | null;
  item_count: number;
  time_limit_ms: number | null;
  due_at: string | null;
  status: 'draft';
  auto_generated: boolean;
  rationale: string | null;
  created_by: { id: string; display_name: string };
  published_at: null;
}

interface GenerateAssignmentBody {
  class_id: string;
  target_skill_ids?: string[];
  difficulty_range?: { min: number; max: number } | null;
  item_count?: number | null;
  time_limit_ms?: number | null;
  mode?: string;
  due_at?: string | null;
  rationale?: string | null;
}

function parseGenerateAssignmentBody(raw: unknown): GenerateAssignmentBody {
  if (typeof raw !== 'object' || raw === null) throw new Error('body must be an object');
  const b = raw as Record<string, unknown>;
  if (typeof b['class_id'] !== 'string') throw new Error('class_id required (string)');
  return {
    class_id: b['class_id'],
    target_skill_ids: Array.isArray(b['target_skill_ids']) ? (b['target_skill_ids'] as string[]) : undefined,
    difficulty_range: (typeof b['difficulty_range'] === 'object' && b['difficulty_range'] !== null)
      ? (b['difficulty_range'] as { min: number; max: number })
      : null,
    item_count: typeof b['item_count'] === 'number' ? b['item_count'] : null,
    time_limit_ms: typeof b['time_limit_ms'] === 'number' ? b['time_limit_ms'] : null,
    mode: typeof b['mode'] === 'string' ? b['mode'] : 'practice',
    due_at: typeof b['due_at'] === 'string' ? b['due_at'] : null,
    rationale: typeof b['rationale'] === 'string' ? b['rationale'] : null,
  };
}

/**
 * POST /analytics/generate-assignment (arch §4.7, spec §14.3).
 * Teacher/admin only. Returns DraftAssignmentDTO without INSERT (Q-32.1 Option B).
 * Stage 33 assignments-svc persists this draft via POST /assignments.
 *
 * Spec §14.3 defaults: item_count=15, prefer_high_discrimination=true.
 * exclude_recently_seen: queries class roster + session_response for last 14 days (Q-32.5).
 */
export async function generateAssignment(
  rawBody: unknown,
  caller: Caller,
  db: DbClient,
): Promise<AnalyticsResult<DraftAssignmentDTO>> {
  if (!isTeacherOrAdmin(caller)) return { data: null, status: 403, error: 'FORBIDDEN' };

  let body: GenerateAssignmentBody;
  try {
    body = parseGenerateAssignmentBody(rawBody);
  } catch (e) {
    return { data: null, status: 400, error: `BAD_REQUEST: ${String(e)}` };
  }

  const itemCount = body.item_count ?? ASSIGNMENT_ITEM_COUNT_DEFAULT;
  const targetSkillIds = body.target_skill_ids ?? [];

  // 1. Caller display_name for created_by.
  const { data: profileRows, error: profileErr } = (await db
    .from('user_profile')
    .select('display_name')
    .eq('id', caller.userId)
    .limit(1)) as { data: Array<{ display_name: string }> | null; error: unknown };
  if (profileErr) return { data: null, status: 500, error: 'DB_ERROR' };
  const displayName = profileRows?.[0]?.display_name ?? '';

  // 2. exclude_recently_seen = last 14 days (spec §14.3 line 2135, Q-32.5 full impl).
  const cutoffDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const recentItemIds = new Set<string>();

  const { data: rosterRows, error: rosterErr } = (await db
    .from('class_student')
    .select('student_id')
    .eq('class_id', body.class_id)) as { data: Array<{ student_id: string }> | null; error: unknown };
  if (rosterErr) return { data: null, status: 500, error: 'DB_ERROR' };
  const studentIds = (rosterRows ?? []).map(r => r.student_id);

  if (studentIds.length > 0) {
    const { data: sessionRows, error: sessionErr } = (await db
      .from('session_record')
      .select('id')
      .in('student_id', studentIds)
      .gte('created_at', cutoffDate)) as { data: Array<{ id: string }> | null; error: unknown };
    if (sessionErr) return { data: null, status: 500, error: 'DB_ERROR' };
    const sessionIds = (sessionRows ?? []).map(r => r.id);

    if (sessionIds.length > 0) {
      const { data: respRows, error: respErr } = (await db
        .from('session_response')
        .select('item_id')
        .in('session_id', sessionIds)) as { data: Array<{ item_id: string }> | null; error: unknown };
      if (respErr) return { data: null, status: 500, error: 'DB_ERROR' };
      for (const r of respRows ?? []) recentItemIds.add(r.item_id);
    }
  }

  // 3. Query items: filter by skill_ids overlap, lifecycle=published, is_active=true.
  //    prefer_high_discrimination=true → ORDER BY discrimination DESC NULLS LAST.
  let itemQuery = db
    .from('item')
    .select('id,skill_ids,difficulty,discrimination')
    .eq('lifecycle', 'published')
    .eq('is_active', true)
    .order('discrimination', { ascending: false });

  if (body.difficulty_range !== null && body.difficulty_range !== undefined) {
    itemQuery = itemQuery.gte('difficulty', body.difficulty_range.min);
  }

  const { data: itemRows, error: itemErr } = (await itemQuery) as {
    data: Array<{ id: string; skill_ids: string[]; difficulty: number; discrimination: number | null }> | null;
    error: unknown;
  };
  if (itemErr) return { data: null, status: 500, error: 'DB_ERROR' };

  // Filter by target_skill_ids overlap + difficulty_range upper bound + exclude recently seen.
  const filtered = (itemRows ?? []).filter(item => {
    if (recentItemIds.has(item.id)) return false;
    if (targetSkillIds.length > 0 && !targetSkillIds.some(sid => item.skill_ids.includes(sid))) return false;
    if (body.difficulty_range !== null && body.difficulty_range !== undefined) {
      if (item.difficulty > body.difficulty_range.max) return false;
    }
    return true;
  });
  const selected = filtered.slice(0, itemCount);
  const selectedSkillIds = [...new Set(selected.flatMap(i => i.skill_ids))].sort();

  // 4. Skill names for target_skill_names.
  const skillNameMap2 = new Map<string, string>();
  const idsToName = targetSkillIds.length > 0 ? targetSkillIds : selectedSkillIds;
  if (idsToName.length > 0) {
    const { data: snRows, error: snErr } = (await db
      .from('skill_node')
      .select('id,name')
      .in('id', idsToName)) as { data: Array<{ id: string; name: string }> | null; error: unknown };
    if (snErr) return { data: null, status: 500, error: 'DB_ERROR' };
    for (const row of snRows ?? []) skillNameMap2.set(row.id, row.name);
  }
  const targetSkillNames = (targetSkillIds.length > 0 ? targetSkillIds : selectedSkillIds)
    .map(id => skillNameMap2.get(id) ?? id);

  const finalSkillIds = targetSkillIds.length > 0 ? targetSkillIds : selectedSkillIds;

  // Stage 33 assignments-svc persists this draft via POST /assignments.
  return {
    data: {
      title: `Auto-generated: ${finalSkillIds.slice(0, 3).map(id => skillNameMap2.get(id) ?? id).join(', ')}`,
      description: null,
      mode: body.mode ?? 'practice',
      target_skill_ids: finalSkillIds,
      target_skill_names: targetSkillNames,
      difficulty_range: body.difficulty_range ?? null,
      item_count: selected.length > 0 ? selected.length : itemCount,
      time_limit_ms: body.time_limit_ms ?? null,
      due_at: body.due_at ?? null,
      status: 'draft',
      auto_generated: true,
      rationale: body.rationale ?? `Targeting ${finalSkillIds.length} skill(s) for class ${body.class_id}`,
      created_by: { id: caller.userId, display_name: displayName },
      published_at: null,
    },
    status: 200,
  };
}

// ---------------------------------------------------------------------------
// Stage 37 — GET /analytics/class-kpi/{class_id}
//
// Screen 18 Block 2 (Q-37.5 Option A): 4 aggregated class KPIs.
// Role-gated teacher/admin; teacher must own class (checkTeacherOwnership).
// No caching in v1 — returns fresh aggregates on every call.
// ---------------------------------------------------------------------------

export interface ClassKpiDTO {
  active_students: number;
  avg_class_score: number | null;
  sessions_this_week: number;
  assignments_active: number;
  computed_at: string;
  stale_since: null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const LAST_N_SESSIONS = 5;

export async function getClassKpi(
  classId: string,
  caller: Caller,
  db: DbClient,
): Promise<AnalyticsResult<ClassKpiDTO>> {
  if (!isTeacherOrAdmin(caller)) return { data: null, status: 403, error: 'FORBIDDEN' };

  if (caller.role === 'teacher' || caller.role === 'tutor') {
    const gate = await checkTeacherOwnership(classId, caller, db);
    if (gate.forbidden) return { data: null, status: 403, error: 'FORBIDDEN' };
  }

  // 1. active_students = COUNT(class_student) WHERE class_id
  const { data: rosterRows, error: rosterErr } = (await db
    .from('class_student')
    .select('student_id')
    .eq('class_id', classId)) as { data: Array<{ student_id: string }> | null; error: unknown };
  if (rosterErr) return { data: null, status: 500, error: 'DB_ERROR' };

  const studentIds = (rosterRows ?? []).map((r) => r.student_id);
  const activeStudents = studentIds.length;

  if (activeStudents === 0) {
    return {
      data: {
        active_students: 0,
        avg_class_score: null,
        sessions_this_week: 0,
        assignments_active: 0,
        computed_at: new Date().toISOString(),
        stale_since: null,
      },
      status: 200,
    };
  }

  // 2 + 3: load processed sessions for all class students (raw_score + created_at)
  const [sessionRes, targetRes] = await Promise.all([
    db
      .from('session_record')
      .select('student_id,raw_score,submitted_at,created_at')
      .in('student_id', studentIds)
      .eq('status', 'processed') as unknown as Promise<{
        data: Array<{ student_id: string; raw_score: number | null; submitted_at: string | null; created_at: string }> | null;
        error: unknown;
      }>,
    db
      .from('assignment_target')
      .select('assignment_id')
      .eq('class_id', classId) as unknown as Promise<{
        data: Array<{ assignment_id: string }> | null;
        error: unknown;
      }>,
  ]);

  if (sessionRes.error) return { data: null, status: 500, error: 'DB_ERROR' };
  if (targetRes.error) return { data: null, status: 500, error: 'DB_ERROR' };

  const allSessions = sessionRes.data ?? [];
  const now = Date.now();
  const weekCutoff = new Date(now - SEVEN_DAYS_MS).toISOString();

  // sessions_this_week: processed sessions with created_at within last 7 days
  const sessionsThisWeek = allSessions.filter((s) => s.created_at >= weekCutoff).length;

  // avg_class_score: last LAST_N_SESSIONS processed sessions per student → avg raw_score across class
  const byStudent = new Map<string, Array<number | null>>();
  for (const s of allSessions) {
    const list = byStudent.get(s.student_id) ?? [];
    list.push(s.raw_score);
    byStudent.set(s.student_id, list);
  }

  const classScores: number[] = [];
  for (const [, scores] of byStudent) {
    const capped = scores.slice(0, LAST_N_SESSIONS);
    const studentAvg =
      capped.filter((v): v is number => v !== null).reduce((a, b) => a + b, 0) /
      (capped.filter((v) => v !== null).length || 1);
    if (capped.some((v) => v !== null)) classScores.push(studentAvg);
  }
  const avgClassScore =
    classScores.length > 0
      ? classScores.reduce((a, b) => a + b, 0) / classScores.length
      : null;

  // assignments_active: published + not archived assignments targeting this class
  const assignmentIds = [...new Set((targetRes.data ?? []).map((t) => t.assignment_id))];
  let assignmentsActive = 0;
  if (assignmentIds.length > 0) {
    const { data: asgRows, error: asgErr } = (await db
      .from('assignment')
      .select('id,status,archived_at')
      .in('id', assignmentIds)) as {
      data: Array<{ id: string; status: string; archived_at: string | null }> | null;
      error: unknown;
    };
    if (asgErr) return { data: null, status: 500, error: 'DB_ERROR' };
    assignmentsActive = (asgRows ?? []).filter(
      (a) => a.status === 'published' && a.archived_at == null,
    ).length;
  }

  return {
    data: {
      active_students: activeStudents,
      avg_class_score: avgClassScore,
      sessions_this_week: sessionsThisWeek,
      assignments_active: assignmentsActive,
      computed_at: new Date().toISOString(),
      stale_since: null,
    },
    status: 200,
  };
}

// ---------------------------------------------------------------------------
// Stage 37 — PATCH /analytics/intervention-alerts/{id}
//
// Screen 18 Block 3 action buttons (SCREEN_SPECS:1026–1027).
// Body: { dismissed: true } → status='dismissed'; { acknowledged: true } → status='acknowledged'.
// Q-37.7 (self-resolve): ownership checked via alert.teacher_id = caller.userId directly
// (class_id is nullable ON DELETE SET NULL; teacher_id is NOT NULL on the row).
// ---------------------------------------------------------------------------

interface AlertOwnerRow {
  id: string;
  student_id: string;
  alert_type: string;
  severity: string;
  status: string;
  detail: unknown;
  created_at: string;
  teacher_id: string;
}

export async function patchInterventionAlert(
  alertId: string,
  body: { dismissed?: boolean; acknowledged?: boolean },
  caller: Caller,
  db: DbClient,
): Promise<AnalyticsResult<InterventionAlertRow>> {
  if (!isTeacherOrAdmin(caller)) return { data: null, status: 403, error: 'FORBIDDEN' };

  // Load alert to verify existence and ownership
  const { data: rows, error: loadErr } = (await db
    .from('intervention_alert')
    .select('id,student_id,alert_type,severity,status,detail,created_at,teacher_id')
    .eq('id', alertId)
    .limit(1)) as { data: AlertOwnerRow[] | null; error: unknown };

  if (loadErr) return { data: null, status: 500, error: 'DB_ERROR' };
  const alert = rows?.[0];
  if (!alert) return { data: null, status: 404, error: 'NOT_FOUND' };

  // Teacher/tutor ownership: alert.teacher_id must match caller (Q-37.7)
  if (caller.role === 'teacher' || caller.role === 'tutor') {
    if (alert.teacher_id !== caller.userId) return { data: null, status: 403, error: 'FORBIDDEN' };
  }

  let newStatus: string;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.dismissed === true) {
    newStatus = 'dismissed';
    patch['status'] = 'dismissed';
  } else if (body.acknowledged === true) {
    newStatus = 'acknowledged';
    patch['status'] = 'acknowledged';
    patch['acknowledged_at'] = new Date().toISOString();
  } else {
    return { data: null, status: 400, error: 'BAD_REQUEST: dismissed or acknowledged required' };
  }

  const { data: updated, error: updateErr } = (await db
    .from('intervention_alert')
    .update(patch)
    .eq('id', alertId)
    .select('id,student_id,alert_type,severity,status,detail,created_at')
    .limit(1)) as { data: InterventionAlertRow[] | null; error: unknown };

  if (updateErr) return { data: null, status: 500, error: 'DB_ERROR' };

  // Return the updated row (fall back to constructed shape if select returns empty)
  const result: InterventionAlertRow = updated?.[0] ?? {
    id: alert.id,
    student_id: alert.student_id,
    alert_type: alert.alert_type,
    severity: alert.severity,
    status: newStatus,
    detail: alert.detail,
    created_at: alert.created_at,
  };

  return { data: result, status: 200 };
}
