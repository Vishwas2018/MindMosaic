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
