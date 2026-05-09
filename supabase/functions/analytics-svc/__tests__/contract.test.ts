/**
 * analytics-svc contract tests — Stage 30.
 *
 * Vitest in Node. The Deno dispatcher (index.ts) is NOT exercised here —
 * we test pure handler functions with a mocked Supabase-like client.
 *
 * Coverage:
 *   processTeacherRefresh (6):
 *     happy-path: declining_performance alert + cache upsert
 *     empty roster: early return, no DB writes
 *     soft dedup: duplicate alert within 2h suppressed
 *     exceptional_progress: velocity > 0.05 across ≥3 skills fires
 *     repair_failure: repair_attempts ≥ 2 fires urgent alert
 *     no-trigger: normal student metrics → 0 alerts
 *   getAutoGroups (2):
 *     teacher owns class → 200 with cached data
 *     non-teacher role → 403
 *   getInterventionAlerts (1):
 *     org_admin bypasses ownership → 200 with alerts
 */
import { describe, expect, it, vi } from 'vitest';
import {
  processTeacherRefresh,
  getAutoGroups,
  getInterventionAlerts,
  getCohort,
  getPathwayReadiness,
  generateAssignment,
  type DbClient,
} from '../handlers.ts';

// ─── Mock client harness (mirrors intelligence-svc contract test harness) ────

interface CapturedCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  args?: unknown;
  conditions?: Array<{ kind: string; col: string; val: unknown }>;
}

interface QueryStub {
  data: unknown;
  error: { message: string; code?: string } | null;
}

type Stubs = Record<string, QueryStub | QueryStub[]>;

function buildClient(stubs: Stubs): DbClient & { calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const counters: Record<string, number> = {};

  const builder = (table: string, stub: QueryStub): unknown => {
    let captured: CapturedCall = { table, op: 'select', conditions: [] };
    const target = function () {} as unknown as object;
    const handler: ProxyHandler<object> = {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: QueryStub) => unknown) => {
            calls.push(captured);
            return resolve(stub);
          };
        }
        if (prop === 'single') {
          return () => {
            calls.push(captured);
            return Promise.resolve(stub);
          };
        }
        if (
          prop === 'select' ||
          prop === 'insert' ||
          prop === 'update' ||
          prop === 'upsert' ||
          prop === 'delete'
        ) {
          return (...args: unknown[]) => {
            captured = { ...captured, op: prop as CapturedCall['op'], args: args[0] };
            return new Proxy(target, handler);
          };
        }
        if (prop === 'eq' || prop === 'in' || prop === 'gte') {
          return (col: string, val: unknown) => {
            captured.conditions = [
              ...(captured.conditions ?? []),
              { kind: prop as string, col, val },
            ];
            return new Proxy(target, handler);
          };
        }
        // .order / .limit / .contains → pass-through
        return () => new Proxy(target, handler);
      },
      apply() {
        return new Proxy(target, handler);
      },
    };
    return new Proxy(target, handler);
  };

  const fromSpy = vi.fn((table: string) => {
    const i = counters[table] ?? 0;
    counters[table] = i + 1;
    const entry = stubs[table];
    if (entry === undefined) {
      throw new Error(`mock client: unexpected table '${table}'`);
    }
    const stub = Array.isArray(entry) ? (entry[i] ?? entry[entry.length - 1]!) : entry;
    return builder(table, stub) as never;
  });

  return { from: fromSpy as never, calls } as DbClient & { calls: CapturedCall[] };
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const CLASS_ID   = 'c0000000-0000-4000-8000-000000000001';
const SKILL_ID   = 's0000000-0000-4000-8000-000000000001';
const TENANT_ID  = 't0000000-0000-4000-8000-000000000001';
const TEACHER_ID = 'u0000000-0000-4000-8000-000000000001';
const STUDENT_A  = 'u0000000-0000-4000-8000-000000000002';
const STUDENT_B  = 'u0000000-0000-4000-8000-000000000003';
const SKILL_X    = 's0000000-0000-4000-8000-000000000010';
const SKILL_Y    = 's0000000-0000-4000-8000-000000000011';
const SKILL_Z    = 's0000000-0000-4000-8000-000000000012';

const BASE_PAYLOAD = {
  class_id: CLASS_ID,
  skill_id: SKILL_ID,
  tenant_id: TENANT_ID,
};

const OK = { error: null };
const NOW = new Date('2026-05-20T10:00:00.000Z');

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('processTeacherRefresh', () => {
  it('happy path: inserts declining_performance alert and upserts cohort_metric_cache', async () => {
    const db = buildClient({
      class_group:           { data: [{ teacher_id: TEACHER_ID }], error: null },
      class_student:         { data: [{ student_id: STUDENT_A }], error: null },
      skill_mastery:         { data: [{ student_id: STUDENT_A, mastery_level: 0.4 }], error: null },
      learning_velocity:     {
        data: [
          { student_id: STUDENT_A, skill_id: SKILL_ID, velocity: -0.05 },
          { student_id: STUDENT_A, skill_id: SKILL_X,  velocity: -0.04 },
          { student_id: STUDENT_A, skill_id: SKILL_Y,  velocity: -0.03 },
        ],
        error: null,
      },
      behaviour_profile:     { data: [{ student_id: STUDENT_A, persistence_score: 0.6, avg_cognitive_load_comfort: 0.5 }], error: null },
      student_misconception: { data: [], error: null },
      intervention_alert:    [
        { data: [], error: null },   // index 0: read existing (dedup)
        { data: null, error: null }, // index 1: insert
      ],
      cohort_metric_cache:   { data: null, error: null },
      outbox_event:          { data: null, error: null }, // Stage 34: intervention_alert outbox write
    });

    const result = await processTeacherRefresh(BASE_PAYLOAD, db, NOW);

    expect(result.student_count).toBe(1);
    expect(result.alerts_inserted).toBe(1);
    expect(result.alerts_suppressed).toBe(0);
    expect(result.groups).toBeGreaterThanOrEqual(1);

    const insertCall = db.calls.find(
      (c) => c.table === 'intervention_alert' && c.op === 'insert'
    );
    expect(insertCall).toBeDefined();
    const inserted = insertCall!.args as Array<{ alert_type: string; severity: string }>;
    expect(inserted[0]!.alert_type).toBe('declining_performance');
    expect(inserted[0]!.severity).toBe('warning');

    const upsertCall = db.calls.find(
      (c) => c.table === 'cohort_metric_cache' && c.op === 'upsert'
    );
    expect(upsertCall).toBeDefined();
    const upserted = upsertCall!.args as { cohort_key: string; metric_key: string; time_bucket: string };
    expect(upserted.cohort_key).toBe(`class:${CLASS_ID}:${SKILL_ID}`);
    expect(upserted.metric_key).toBe('auto_groups');
    expect(upserted.time_bucket).toBe('2026-05-20');
  });

  it('empty roster: returns early with zero counts and no DB writes after roster load', async () => {
    const db = buildClient({
      class_group:   { data: [{ teacher_id: TEACHER_ID }], error: null },
      class_student: { data: [], error: null },
    });

    const result = await processTeacherRefresh(BASE_PAYLOAD, db, NOW);

    expect(result.student_count).toBe(0);
    expect(result.alerts_inserted).toBe(0);
    expect(result.groups).toBe(0);
    // No writes beyond the initial reads
    const writes = db.calls.filter((c) => c.op === 'insert' || c.op === 'upsert');
    expect(writes).toHaveLength(0);
  });

  it('soft dedup: active alert within 2h window suppresses re-insert', async () => {
    const recentAlert = {
      student_id: STUDENT_A,
      alert_type: 'declining_performance',
      created_at: new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(), // 30 min ago
    };
    const db = buildClient({
      class_group:           { data: [{ teacher_id: TEACHER_ID }], error: null },
      class_student:         { data: [{ student_id: STUDENT_A }], error: null },
      skill_mastery:         { data: [], error: null },
      learning_velocity:     {
        data: [
          { student_id: STUDENT_A, skill_id: SKILL_ID, velocity: -0.05 },
          { student_id: STUDENT_A, skill_id: SKILL_X,  velocity: -0.04 },
          { student_id: STUDENT_A, skill_id: SKILL_Y,  velocity: -0.03 },
        ],
        error: null,
      },
      behaviour_profile:     { data: [], error: null },
      student_misconception: { data: [], error: null },
      intervention_alert:    [
        { data: [recentAlert], error: null }, // dedup read returns recent alert
        { data: null, error: null },          // insert (should NOT be called)
      ],
      cohort_metric_cache:   { data: null, error: null },
    });

    const result = await processTeacherRefresh(BASE_PAYLOAD, db, NOW);

    expect(result.alerts_suppressed).toBe(1);
    expect(result.alerts_inserted).toBe(0);
    const insertCall = db.calls.find(
      (c) => c.table === 'intervention_alert' && c.op === 'insert'
    );
    expect(insertCall).toBeUndefined();
  });

  it('exceptional_progress: velocity > 0.05 across ≥3 skills fires info alert', async () => {
    const db = buildClient({
      class_group:           { data: [{ teacher_id: TEACHER_ID }], error: null },
      class_student:         { data: [{ student_id: STUDENT_B }], error: null },
      skill_mastery:         { data: [], error: null },
      learning_velocity:     {
        data: [
          { student_id: STUDENT_B, skill_id: SKILL_ID, velocity: 0.08 },
          { student_id: STUDENT_B, skill_id: SKILL_X,  velocity: 0.06 },
          { student_id: STUDENT_B, skill_id: SKILL_Z,  velocity: 0.07 },
        ],
        error: null,
      },
      behaviour_profile:     { data: [{ student_id: STUDENT_B, persistence_score: 0.8, avg_cognitive_load_comfort: 0.7 }], error: null },
      student_misconception: { data: [], error: null },
      intervention_alert:    [
        { data: [], error: null },
        { data: null, error: null },
      ],
      cohort_metric_cache:   { data: null, error: null },
      outbox_event:          { data: null, error: null }, // Stage 34: intervention_alert outbox write
    });

    const result = await processTeacherRefresh(BASE_PAYLOAD, db, NOW);

    expect(result.alerts_inserted).toBe(1);
    const insertCall = db.calls.find((c) => c.table === 'intervention_alert' && c.op === 'insert');
    const inserted = insertCall!.args as Array<{ alert_type: string; severity: string }>;
    expect(inserted[0]!.alert_type).toBe('exceptional_progress');
    expect(inserted[0]!.severity).toBe('info');
  });

  it('repair_failure: repair_attempts ≥ 2 fires urgent alert', async () => {
    const db = buildClient({
      class_group:           { data: [{ teacher_id: TEACHER_ID }], error: null },
      class_student:         { data: [{ student_id: STUDENT_A }], error: null },
      skill_mastery:         { data: [], error: null },
      learning_velocity:     { data: [], error: null },
      behaviour_profile:     { data: [], error: null },
      student_misconception: {
        data: [
          {
            student_id: STUDENT_A,
            confidence: 0.85,
            status: 'active',
            detected_at: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            repair_attempts: 2,
          },
        ],
        error: null,
      },
      intervention_alert:    [
        { data: [], error: null },
        { data: null, error: null },
      ],
      cohort_metric_cache:   { data: null, error: null },
      outbox_event:          { data: null, error: null }, // Stage 34: intervention_alert outbox write
    });

    const result = await processTeacherRefresh(BASE_PAYLOAD, db, NOW);

    const insertCall = db.calls.find((c) => c.table === 'intervention_alert' && c.op === 'insert');
    const inserted = insertCall!.args as Array<{ alert_type: string; severity: string }>;
    expect(inserted.some((a) => a.alert_type === 'repair_failure' && a.severity === 'urgent')).toBe(true);
    expect(result.alerts_inserted).toBeGreaterThanOrEqual(1);
  });

  it('processTeacherRefresh: groups ≥3 students into up to 4 clusters (Spec §14.1 max_groups=4)', async () => {
    const STUDENT_C = 'u0000000-0000-4000-8000-000000000004';
    const db = buildClient({
      class_group:           { data: [{ teacher_id: TEACHER_ID }], error: null },
      class_student:         {
        data: [
          { student_id: STUDENT_A },
          { student_id: STUDENT_B },
          { student_id: STUDENT_C },
        ],
        error: null,
      },
      skill_mastery:         {
        data: [
          { student_id: STUDENT_A, mastery_level: 0.9 },
          { student_id: STUDENT_B, mastery_level: 0.5 },
          { student_id: STUDENT_C, mastery_level: 0.1 },
        ],
        error: null,
      },
      learning_velocity:     { data: [], error: null },
      behaviour_profile:     { data: [], error: null },
      student_misconception: { data: [], error: null },
      intervention_alert:    { data: [], error: null },
      cohort_metric_cache:   { data: null, error: null },
    });

    const result = await processTeacherRefresh(BASE_PAYLOAD, db, NOW);

    expect(result.student_count).toBe(3);
    expect(result.groups).toBeGreaterThanOrEqual(1);
    expect(result.groups).toBeLessThanOrEqual(4);
    // All 3 students assigned — verified via cache upsert call
    const upsert = db.calls.find((c) => c.table === 'cohort_metric_cache' && c.op === 'upsert');
    expect(upsert).toBeDefined();
    const val = (upsert!.args as { value: { student_count: number } }).value;
    expect(val.student_count).toBe(3);
  });

  it('persistent_misconception alert inserted for status=active >21 days', async () => {
    const oldDate = new Date(NOW.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString(); // 25 days ago
    const db = buildClient({
      class_group:           { data: [{ teacher_id: TEACHER_ID }], error: null },
      class_student:         { data: [{ student_id: STUDENT_A }], error: null },
      skill_mastery:         { data: [], error: null },
      learning_velocity:     { data: [], error: null },
      behaviour_profile:     { data: [], error: null },
      student_misconception: {
        data: [
          {
            student_id: STUDENT_A,
            confidence: 0.9,
            status: 'active',
            detected_at: oldDate, // older than 21 days → triggers persistent_misconception
            repair_attempts: 0,
          },
        ],
        error: null,
      },
      intervention_alert:    [
        { data: [], error: null },
        { data: null, error: null },
      ],
      cohort_metric_cache:   { data: null, error: null },
      outbox_event:          { data: null, error: null }, // Stage 34: intervention_alert outbox write
    });

    const result = await processTeacherRefresh(BASE_PAYLOAD, db, NOW);

    const insertCall = db.calls.find((c) => c.table === 'intervention_alert' && c.op === 'insert');
    expect(insertCall).toBeDefined();
    const inserted = insertCall!.args as Array<{ alert_type: string; severity: string }>;
    expect(inserted.some((a) => a.alert_type === 'persistent_misconception' && a.severity === 'warning')).toBe(true);
    expect(result.alerts_inserted).toBeGreaterThanOrEqual(1);
  });

  it('no-trigger: normal student metrics produce zero alerts', async () => {
    const db = buildClient({
      class_group:           { data: [{ teacher_id: TEACHER_ID }], error: null },
      class_student:         { data: [{ student_id: STUDENT_A }], error: null },
      skill_mastery:         { data: [{ student_id: STUDENT_A, mastery_level: 0.7 }], error: null },
      learning_velocity:     { data: [{ student_id: STUDENT_A, skill_id: SKILL_ID, velocity: 0.01 }], error: null },
      behaviour_profile:     { data: [{ student_id: STUDENT_A, persistence_score: 0.6, avg_cognitive_load_comfort: 0.5 }], error: null },
      student_misconception: { data: [], error: null },
      intervention_alert:    { data: [], error: null }, // single stub reused (no insert expected)
      cohort_metric_cache:   { data: null, error: null },
    });

    const result = await processTeacherRefresh(BASE_PAYLOAD, db, NOW);

    expect(result.alerts_inserted).toBe(0);
    const insertCall = db.calls.find((c) => c.table === 'intervention_alert' && c.op === 'insert');
    expect(insertCall).toBeUndefined();
  });
});

describe('getAutoGroups', () => {
  it('teacher owning class receives cached auto-groups', async () => {
    const cachedValue = { groups: [], k: 3, student_count: 5 };
    const db = buildClient({
      class_group:         { data: [{ teacher_id: TEACHER_ID }], error: null },
      cohort_metric_cache: {
        data: [{ cohort_key: `class:${CLASS_ID}:${SKILL_ID}`, time_bucket: '2026-05-20', value: cachedValue }],
        error: null,
      },
    });

    const result = await getAutoGroups(
      CLASS_ID,
      SKILL_ID,
      { userId: TEACHER_ID, role: 'teacher' },
      db
    );

    expect(result.status).toBe(200);
    expect(result.data?.value).toEqual(cachedValue);
  });

  it('non-teacher role receives 403', async () => {
    const db = buildClient({});

    const result = await getAutoGroups(
      CLASS_ID,
      SKILL_ID,
      { userId: STUDENT_A, role: 'student' },
      db
    );

    expect(result.status).toBe(403);
    expect(result.error).toBe('FORBIDDEN');
  });
});

describe('getInterventionAlerts', () => {
  it('teacher owning class receives active intervention alerts', async () => {
    const db = buildClient({
      class_group:        { data: [{ teacher_id: TEACHER_ID }], error: null },
      intervention_alert: {
        data: [
          {
            id: 'alert-2',
            student_id: STUDENT_B,
            alert_type: 'declining_performance',
            severity: 'warning',
            status: 'active',
            detail: { declining_skill_count: 3 },
            created_at: NOW.toISOString(),
          },
        ],
        error: null,
      },
    });

    const result = await getInterventionAlerts(
      CLASS_ID,
      { userId: TEACHER_ID, role: 'teacher' },
      db
    );

    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data![0]!.alert_type).toBe('declining_performance');
  });

  it('org_admin bypasses class ownership and receives active alerts', async () => {
    const db = buildClient({
      intervention_alert: {
        data: [
          {
            id: 'alert-1',
            student_id: STUDENT_A,
            alert_type: 'low_persistence',
            severity: 'warning',
            status: 'active',
            detail: { persistence_score: 0.2 },
            created_at: NOW.toISOString(),
          },
        ],
        error: null,
      },
    });

    const result = await getInterventionAlerts(
      CLASS_ID,
      { userId: 'admin-user', role: 'org_admin' },
      db
    );

    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data![0]!.alert_type).toBe('low_persistence');
  });
});

// ─── Stage 32 additions ──────────────────────────────────────────────────────

const GROUP_ID2     = `class:${CLASS_ID}:${SKILL_ID}`;
const PATHWAY_SLUG2 = 'naplan-y5-numeracy';
// STALE_DATE2: well in the past so stale_since is set regardless of real system clock.
const STALE_DATE2   = '2024-01-01T00:00:00.000Z';
const ITEM_A2       = 'item-a0000-seen-in-session';
const ITEM_B2       = 'item-b0000-not-seen';

describe('getCohort', () => {
  it('getCohort: returns CohortDTO with ClusterGroup[] for teacher caller', async () => {
    const db = buildClient({
      class_group: { data: [{ teacher_id: TEACHER_ID }], error: null },
      cohort_metric_cache: {
        data: [{
          cohort_key: GROUP_ID2,
          value: { groups: [{ centroid: [0.5], member_ids: [STUDENT_A] }] },
          computed_at: '2026-05-20T10:00:00.000Z',
        }],
        error: null,
      },
    });

    const result = await getCohort(GROUP_ID2, { userId: TEACHER_ID, role: 'teacher' }, db);
    expect(result.status).toBe(200);
    expect(result.data).not.toBeNull();
    expect(result.data!.group_id).toBe(GROUP_ID2);
    expect(result.data!.class_id).toBe(CLASS_ID);
    expect(result.data!.skill_id).toBe(SKILL_ID);
    expect(result.data!.groups).toHaveLength(1);
  });

  it('getCohort: student caller → 403 (teacher/admin role required)', async () => {
    const db = buildClient({});
    const result = await getCohort(GROUP_ID2, { userId: STUDENT_A, role: 'student' }, db);
    expect(result.status).toBe(403);
    expect(result.error).toBe('FORBIDDEN');
  });

  it('getCohort: returns 404 for unknown group_id', async () => {
    const db = buildClient({
      class_group: { data: [{ teacher_id: TEACHER_ID }], error: null },
      cohort_metric_cache: { data: [], error: null },
    });
    const result = await getCohort(GROUP_ID2, { userId: TEACHER_ID, role: 'teacher' }, db);
    expect(result.status).toBe(404);
    expect(result.error).toBe('NOT_FOUND');
  });
});

describe('getPathwayReadiness', () => {
  it('getPathwayReadiness: returns PathwayReadinessDTO; stale_since set when predictive data stale', async () => {
    const db = buildClient({
      cohort_metric_cache: {
        data: [{
          value: {
            status: 'fresh', current_readiness_score: 0.6,
            gap_skills: [], data_points: 5, computed_at: STALE_DATE2,
          },
          computed_at: STALE_DATE2,
        }],
        error: null,
      },
      pathway: { data: [{ display_name: 'NAPLAN Y5 Numeracy' }], error: null },
    });

    const result = await getPathwayReadiness(
      STUDENT_A, PATHWAY_SLUG2,
      { userId: STUDENT_A, role: 'student' }, db,
    );
    expect(result.status).toBe(200);
    expect(result.data).not.toBeNull();
    expect(result.data!.stale_since).toBe(STALE_DATE2);
    expect(result.data!.pathway_name).toBe('NAPLAN Y5 Numeracy');
    expect(result.data!.composite_readiness).toBeCloseTo(0.6);
  });

  it('getPathwayReadiness: student reads own pathway; teacher reads any student in tenant', async () => {
    const stub = {
      cohort_metric_cache: {
        data: [{
          value: { status: 'fresh', current_readiness_score: 0.7, gap_skills: [], data_points: 5, computed_at: '2026-05-20T10:00:00.000Z' },
          computed_at: '2026-05-20T10:00:00.000Z',
        }],
        error: null,
      },
      pathway: { data: [{ display_name: 'NAPLAN Y5 Numeracy' }], error: null },
    };

    // Student reads own pathway.
    const db1 = buildClient(stub);
    const r1 = await getPathwayReadiness(STUDENT_A, PATHWAY_SLUG2, { userId: STUDENT_A, role: 'student' }, db1);
    expect(r1.status).toBe(200);

    // Teacher reads a different student's pathway.
    const db2 = buildClient(stub);
    const r2 = await getPathwayReadiness(STUDENT_A, PATHWAY_SLUG2, { userId: TEACHER_ID, role: 'teacher' }, db2);
    expect(r2.status).toBe(200);
  });

  it('getPathwayReadiness: returns 404 for unknown student_id or pathway_slug', async () => {
    const db = buildClient({
      cohort_metric_cache: { data: [], error: null },
    });
    const result = await getPathwayReadiness(
      STUDENT_A, 'unknown-pathway',
      { userId: STUDENT_A, role: 'student' }, db,
    );
    expect(result.status).toBe(404);
  });
});

describe('generateAssignment', () => {
  it('generateAssignment: returns DraftAssignmentDTO without INSERT to assignment table (Q-32.1 Option B)', async () => {
    const db = buildClient({
      user_profile:  { data: [{ display_name: 'Ms Teacher' }], error: null },
      class_student: { data: [{ student_id: STUDENT_A }], error: null },
      session_record:{ data: [], error: null },
      item:          { data: [{ id: 'item-1', skill_ids: [SKILL_ID], difficulty: 0.5, discrimination: 0.8 }], error: null },
      skill_node:    { data: [{ id: SKILL_ID, name: 'Algebra' }], error: null },
    });

    const result = await generateAssignment(
      { class_id: CLASS_ID, target_skill_ids: [SKILL_ID] },
      { userId: TEACHER_ID, role: 'teacher' },
      db,
    );
    expect(result.status).toBe(200);
    expect(result.data).not.toBeNull();
    expect(result.data!.status).toBe('draft');
    expect(result.data!.auto_generated).toBe(true);
    // Stage 33 assignments-svc persists the draft — no insert here (Q-32.1 Option B).
    const inserts = db.calls.filter((c) => c.table === 'assignment' && c.op === 'insert');
    expect(inserts).toHaveLength(0);
  });

  it('generateAssignment: item_count defaults to 15 when not specified (spec §14.3 line 2135)', async () => {
    const db = buildClient({
      user_profile:  { data: [{ display_name: 'Ms Teacher' }], error: null },
      class_student: { data: [], error: null }, // empty roster → no session queries
      item: {
        data: Array.from({ length: 20 }, (_, i) => ({
          id: `item-${i}`,
          skill_ids: [SKILL_ID],
          difficulty: 0.5,
          discrimination: 0.8,
        })),
        error: null,
      },
      skill_node: { data: [{ id: SKILL_ID, name: 'Algebra' }], error: null },
    });

    const result = await generateAssignment(
      { class_id: CLASS_ID }, // no item_count supplied
      { userId: TEACHER_ID, role: 'teacher' },
      db,
    );
    expect(result.status).toBe(200);
    expect(result.data!.item_count).toBe(15);
  });

  it('generateAssignment: excludes items seen in last 14 days (spec §14.3 line 2135)', async () => {
    const SEEN_SKILL   = 's0000000-0000-4000-8000-000000000099';
    const UNSEEN_SKILL = 's0000000-0000-4000-8000-000000000100';
    const db = buildClient({
      user_profile:     { data: [{ display_name: 'Ms Teacher' }], error: null },
      class_student:    { data: [{ student_id: STUDENT_A }], error: null },
      session_record:   { data: [{ id: 'sess-recent' }], error: null },
      session_response: { data: [{ item_id: ITEM_A2 }], error: null }, // ITEM_A2 seen recently
      item: {
        data: [
          { id: ITEM_A2, skill_ids: [SEEN_SKILL],   difficulty: 0.5, discrimination: 0.8 },
          { id: ITEM_B2, skill_ids: [UNSEEN_SKILL], difficulty: 0.5, discrimination: 0.7 },
        ],
        error: null,
      },
      skill_node: {
        data: [
          { id: SEEN_SKILL,   name: 'Seen Skill' },
          { id: UNSEEN_SKILL, name: 'Unseen Skill' },
        ],
        error: null,
      },
    });

    const result = await generateAssignment(
      { class_id: CLASS_ID },
      { userId: TEACHER_ID, role: 'teacher' },
      db,
    );
    expect(result.status).toBe(200);
    // ITEM_A2 (SEEN_SKILL) was excluded; only ITEM_B2 (UNSEEN_SKILL) passes.
    expect(result.data!.target_skill_ids).toContain(UNSEEN_SKILL);
    expect(result.data!.target_skill_ids).not.toContain(SEEN_SKILL);
  });

  it('generateAssignment: student caller → 403 (teacher role required)', async () => {
    const db = buildClient({});
    const result = await generateAssignment(
      { class_id: CLASS_ID },
      { userId: STUDENT_A, role: 'student' },
      db,
    );
    expect(result.status).toBe(403);
    expect(result.error).toBe('FORBIDDEN');
  });
});
