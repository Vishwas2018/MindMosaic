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
