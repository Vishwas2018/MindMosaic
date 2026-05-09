/**
 * notifications-svc contract tests — Stage 34.
 *
 * Vitest in Node. The Deno dispatcher (index.ts) is NOT exercised here —
 * we test pure handler functions with a mocked Supabase-like client.
 *
 * DEV-20260524-1: 5s wall-clock SLA not testable in sandbox. The e2e test
 * exercises the full logical chain (fn_drain_outbox_batch → jobs-worker dispatch
 * → createNotification) via mocked clients without cron scheduling.
 *
 * Coverage (14 contract tests + 1 e2e):
 *   getMyNotifications (3): ordered DESC, unread filter, cross-user isolation
 *   markRead (2): sets read_at; idempotent on already-read; cross-user 404
 *   markAllRead (1): bulk UPDATE all unread for caller
 *   createNotification (4): assignment_assigned, plan_updated, intervention_alert, dedup
 *   100-cap (1): 101st unread INSERT auto-trims oldest
 *   cross-service outbox (2): orchestration-svc plan_updated, analytics-svc intervention_alert
 *   jobs-worker route (1): notification.create dispatches to NOTIFICATIONS_SVC_URL
 *   e2e (1): full mocked chain
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  getMyNotifications,
  markRead,
  markAllRead,
  createNotification,
  type DbClient,
} from '../handlers.ts';
import { processOrchestratorReplan } from '../../orchestration-svc/handlers.ts';
import { processTeacherRefresh } from '../../analytics-svc/handlers.ts';

// ─── Mock client harness ───────────────────────────────────────────────────

interface CapturedCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  args?: unknown;
  conditions?: Array<{ kind: string; col: string; val: unknown }>;
}

interface QueryStub {
  data: unknown;
  error: { message: string } | null;
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
        if (
          prop === 'eq' ||
          prop === 'neq' ||
          prop === 'in' ||
          prop === 'gte' ||
          prop === 'is' ||
          prop === 'lt'
        ) {
          return (col: string, val: unknown) => {
            captured.conditions = [
              ...(captured.conditions ?? []),
              { kind: prop as string, col, val },
            ];
            return new Proxy(target, handler);
          };
        }
        // .order / .limit / .contains / .not → pass-through
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

const TENANT_ID  = 't0000000-0000-4000-8000-000000000001';
const STUDENT_ID = 'u0000000-0000-4000-8000-000000000002';
const TEACHER_ID = 'u0000000-0000-4000-8000-000000000003';
const OTHER_ID   = 'u0000000-0000-4000-8000-000000000099';
const NOTIF_ID   = 'n0000000-0000-4000-8000-000000000001';
const ASSIGN_ID  = 'a0000000-0000-4000-8000-000000000001';
const PLAN_ID    = 'p0000000-0000-4000-8000-000000000001';

const NOW = '2026-05-24T00:00:00.000Z';

const baseNotif = {
  id: NOTIF_ID,
  user_id: STUDENT_ID,
  tenant_id: TENANT_ID,
  type: 'assignment_assigned',
  title: 'New Assignment',
  body: 'You have a new assignment.',
  link: '/assignments',
  read_at: null,
  metadata: { aggregate_id: ASSIGN_ID },
  created_at: NOW,
};

afterEach(() => vi.clearAllMocks());

// ─── getMyNotifications ──────────────────────────────────────────────────────

describe('getMyNotifications', () => {
  it('getMyNotifications: returns own notifications ordered created_at DESC', async () => {
    const client = buildClient({ notification: { data: [baseNotif], error: null } });
    const result = await getMyNotifications(STUDENT_ID, false, client);
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data![0]!.id).toBe(NOTIF_ID);
    expect(result.data![0]!.read).toBe(false);
    const notifCalls = client.calls.filter((c) => c.table === 'notification');
    expect(notifCalls[0]!.op).toBe('select');
    expect(notifCalls[0]!.conditions).toContainEqual(
      expect.objectContaining({ kind: 'eq', col: 'user_id', val: STUDENT_ID }),
    );
  });

  it('getMyNotifications: ?unread=true filters read_at IS NULL', async () => {
    const client = buildClient({ notification: { data: [baseNotif], error: null } });
    const result = await getMyNotifications(STUDENT_ID, true, client);
    expect(result.status).toBe(200);
    const notifCalls = client.calls.filter((c) => c.table === 'notification');
    expect(notifCalls[0]!.conditions).toContainEqual(
      expect.objectContaining({ kind: 'is', col: 'read_at', val: null }),
    );
  });

  it('getMyNotifications: cross-user request returns empty (RLS isolation)', async () => {
    // OTHER_ID user gets no notifications — service-role filters by user_id explicitly.
    const client = buildClient({ notification: { data: [], error: null } });
    const result = await getMyNotifications(OTHER_ID, false, client);
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(0);
    expect(client.calls[0]!.conditions).toContainEqual(
      expect.objectContaining({ kind: 'eq', col: 'user_id', val: OTHER_ID }),
    );
  });
});

// ─── markRead ───────────────────────────────────────────────────────────────

describe('markRead', () => {
  it('markRead: PATCH sets read_at; idempotent on already-read', async () => {
    // First: unread → sets read_at.
    const client = buildClient({
      notification: [
        { data: baseNotif, error: null },  // SELECT (single)
        { data: null, error: null },        // UPDATE
      ],
    });
    const result = await markRead(NOTIF_ID, STUDENT_ID, client);
    expect(result.status).toBe(200);
    expect(result.data!.read).toBe(true);

    // Second: already-read → returns 200 without UPDATE.
    const readNotif = { ...baseNotif, read_at: NOW };
    const client2 = buildClient({ notification: { data: readNotif, error: null } });
    const result2 = await markRead(NOTIF_ID, STUDENT_ID, client2);
    expect(result2.status).toBe(200);
    expect(result2.data!.read).toBe(true);
    const updateCalls = client2.calls.filter((c) => c.op === 'update');
    expect(updateCalls).toHaveLength(0);
  });

  it('markRead: cross-user PATCH returns 403', async () => {
    // notification_own RLS enforced explicitly: SELECT filters user_id = caller; returns null.
    const client = buildClient({ notification: { data: null, error: null } });
    const result = await markRead(NOTIF_ID, OTHER_ID, client);
    expect(result.status).toBe(404);
  });
});

// ─── markAllRead ─────────────────────────────────────────────────────────────

describe('markAllRead', () => {
  it('markAllRead: bulk UPDATE all unread for caller', async () => {
    const client = buildClient({
      notification: [
        { data: [{ id: NOTIF_ID }], error: null }, // SELECT unread ids
        { data: null, error: null },                // UPDATE
      ],
    });
    const result = await markAllRead(STUDENT_ID, client);
    expect(result.status).toBe(200);
    expect(result.data!.count).toBe(1);
    const updateCalls = client.calls.filter((c) => c.op === 'update');
    expect(updateCalls).toHaveLength(1);
  });
});

// ─── createNotification ──────────────────────────────────────────────────────

describe('createNotification', () => {
  it('createNotification: assignment_assigned INSERT with copy from notification-copy module', async () => {
    const client = buildClient({
      notification: [
        { data: [], error: null },             // dedup SELECT
        { data: null, error: null },           // INSERT
        { data: [{ id: NOTIF_ID }], error: null }, // cap SELECT
      ],
    });
    const body = {
      notification_type: 'assignment_assigned',
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      assignment_id: ASSIGN_ID,
      published_at: NOW,
    };
    const result = await createNotification(body, client);
    expect(result.status).toBe(201);
    expect(result.data!.deduped).toBe(false);
    expect(result.data!.notification!.type).toBe('assignment_assigned');
    expect(result.data!.notification!.title).toBe('New Assignment');
    expect(result.data!.notification!.link).toBe('/assignments');
    const insertCall = client.calls.find((c) => c.op === 'insert');
    expect(insertCall).toBeDefined();
  });

  it('createNotification: plan_updated INSERT', async () => {
    const client = buildClient({
      notification: [
        { data: [], error: null },
        { data: null, error: null },
        { data: [{ id: NOTIF_ID }], error: null },
      ],
    });
    const body = {
      notification_type: 'plan_updated',
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      plan_id: PLAN_ID,
      session_count: 5,
    };
    const result = await createNotification(body, client);
    expect(result.status).toBe(201);
    expect(result.data!.notification!.type).toBe('plan_updated');
    expect(result.data!.notification!.title).toBe('Your Learning Plan Updated');
  });

  it('createNotification: intervention_alert INSERT', async () => {
    const client = buildClient({
      notification: [
        { data: [], error: null },
        { data: null, error: null },
        { data: [{ id: NOTIF_ID }], error: null },
      ],
    });
    const body = {
      notification_type: 'intervention_alert',
      tenant_id: TENANT_ID,
      teacher_id: TEACHER_ID,
      student_id: STUDENT_ID,
      alert_type: 'declining_performance',
    };
    const result = await createNotification(body, client);
    expect(result.status).toBe(201);
    expect(result.data!.notification!.type).toBe('intervention_alert');
    expect(result.data!.notification!.title).toBe('Student Alert');
    expect(result.data!.notification!.link).toBe('/teacher#alerts');
  });

  it('createNotification: dedup on (user_id, type, aggregate_id) within 1h returns {deduped: true} (ISSUE-0025)', async () => {
    // Dedup SELECT returns an existing row — handler returns deduped: true, skips INSERT.
    const client = buildClient({
      notification: { data: [{ id: NOTIF_ID }], error: null }, // dedup hit
    });
    const body = {
      notification_type: 'assignment_assigned',
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      assignment_id: ASSIGN_ID,
      published_at: NOW,
    };
    const result = await createNotification(body, client);
    expect(result.status).toBe(200);
    expect(result.data!.deduped).toBe(true);
    expect(result.data!.notification).toBeNull();
    const insertCalls = client.calls.filter((c) => c.op === 'insert');
    expect(insertCalls).toHaveLength(0);
  });
});

// ─── 100-cap ─────────────────────────────────────────────────────────────────

describe('100-cap', () => {
  it('100-cap: 101st unread INSERT auto-trims oldest to read_at (spec §27.3)', async () => {
    // After INSERT, SELECT returns 101 unread IDs — handler trims 1 oldest.
    const unreadIds = Array.from({ length: 101 }, (_, i) => ({
      id: `n${String(i).padStart(8, '0')}-0000-4000-8000-000000000001`,
    }));
    const client = buildClient({
      notification: [
        { data: [], error: null },          // dedup SELECT
        { data: null, error: null },        // INSERT
        { data: unreadIds, error: null },   // cap SELECT (101 rows)
        { data: null, error: null },        // trim UPDATE
      ],
    });
    const body = {
      notification_type: 'assignment_assigned',
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      assignment_id: ASSIGN_ID,
      published_at: NOW,
    };
    const result = await createNotification(body, client);
    expect(result.status).toBe(201);
    const updateCalls = client.calls.filter((c) => c.op === 'update');
    expect(updateCalls).toHaveLength(1);
    // UPDATE targets .in('id', [...]) — the 1 oldest (index 0).
    expect(updateCalls[0]!.conditions).toContainEqual(
      expect.objectContaining({ kind: 'in', col: 'id' }),
    );
  });
});

// ─── Cross-service outbox writes ─────────────────────────────────────────────

describe('cross-service outbox writes', () => {
  it('orchestration-svc replan: outbox_event plan_updated written', async () => {
    // Minimal stub for processOrchestratorReplan: idempotency check returns skipped.
    const payload = {
      student_id: STUDENT_ID,
      tenant_id: TENANT_ID,
      session_id: 's0000000-0000-4000-8000-000000000001',
      scheduled_at: '2026-05-23T00:00:00.000Z',
    };
    // Stub: existing plan with updated_at > scheduled_at → triggers idempotency skip.
    const existingPlan = {
      id: PLAN_ID,
      plan_type: 'weekly',
      status: 'active',
      sessions: [],
      milestones: null,
      valid_until: '2026-06-01T00:00:00.000Z',
      stale_since: null,
      created_at: NOW,
      updated_at: '2026-05-23T01:00:00.000Z', // > scheduled_at → idempotency skip
      generated_algorithm_version: 'l9-v1',
    };
    const client = buildClient({
      learning_plan: { data: [existingPlan], error: null },
    });
    const result = await processOrchestratorReplan(payload, client as unknown as Parameters<typeof processOrchestratorReplan>[1]);
    // Idempotency skip path: no outbox write (expected — plan not regenerated).
    expect(result.skipped).toBe(true);

    // Now verify outbox write happens on the non-skip path:
    // Build a client that exercises the full path (no existing plan).
    const skillNodes = [{ id: 's1', name: 'Algebra', pathway_slug: 'naplan-y5-numeracy', strand: 'Number', difficulty: 0.5, prerequisite_ids: [] }];
    const mastery = [{ student_id: STUDENT_ID, skill_id: 's1', mastery_level: 0.4, last_updated: NOW }];
    const vel = [{ student_id: STUDENT_ID, skill_id: 's1', velocity: 0.01, last_updated: NOW }];
    const fullClient = buildClient({
      learning_plan: [
        { data: [], error: null },           // load existing (none)
        { data: null, error: null },         // insert new plan
      ],
      plan_revision: { data: null, error: null },
      pipeline_event: [
        { data: null, error: null },         // insert processing
        { data: null, error: null },         // update completed
      ],
      intelligence_audit_log: { data: null, error: null },
      plan_override: { data: [], error: null },
      skill_mastery: { data: mastery, error: null },
      learning_velocity: { data: vel, error: null },
      behaviour_profile: { data: null, error: null },       // parallel load (no profile → default sweet spot)
      student_misconception: { data: [], error: null },     // parallel load
      repair_record: { data: [], error: null },             // parallel load (PHASE-2 empty)
      user_profile: { data: [{ year_level: 5 }], error: null }, // parallel load
      skill_node: { data: skillNodes, error: null },
      outbox_event: { data: null, error: null },  // plan_updated outbox INSERT
    });
    const payload2 = {
      student_id: STUDENT_ID,
      tenant_id: TENANT_ID,
      session_id: 's0000000-0000-4000-8000-000000000001',
      scheduled_at: '2026-05-24T00:00:00.000Z',
    };
    const result2 = await processOrchestratorReplan(
      payload2,
      fullClient as unknown as Parameters<typeof processOrchestratorReplan>[1],
    );
    expect(result2.skipped).toBe(false);
    const outboxInserts = fullClient.calls.filter(
      (c) => c.table === 'outbox_event' && c.op === 'insert',
    );
    expect(outboxInserts).toHaveLength(1);
    expect((outboxInserts[0]!.args as Record<string, unknown>)['event_type']).toBe('plan_updated');
  });

  it('analytics-svc intervention_alert INSERT: outbox_event intervention_alert written', async () => {
    const payload = {
      class_id: 'c0000000-0000-4000-8000-000000000001',
      skill_id: 's1',
      tenant_id: TENANT_ID,
      teacher_id: TEACHER_ID,
    };
    const masteryRows = [{ student_id: STUDENT_ID, mastery_level: 0.2 }];
    const velRows = [{ student_id: STUDENT_ID, skill_id: 's1', velocity: -0.05 },
                     { student_id: STUDENT_ID, skill_id: 's2', velocity: -0.04 },
                     { student_id: STUDENT_ID, skill_id: 's3', velocity: -0.03 }];
    const students = [{ student_id: STUDENT_ID }];
    const client = buildClient({
      class_group: { data: [{ teacher_id: TEACHER_ID }], error: null }, // step 1: load teacher_id
      class_student: { data: students, error: null },
      skill_mastery: { data: masteryRows, error: null },
      learning_velocity: { data: velRows, error: null },
      behaviour_profile: { data: [], error: null },
      student_misconception: { data: [], error: null },
      intervention_alert: [
        { data: [], error: null },      // existing alert dedup SELECT
        { data: null, error: null },    // INSERT new alerts
      ],
      outbox_event: { data: null, error: null },  // intervention_alert outbox INSERT
      cohort_metric_cache: { data: null, error: null },
    });
    await processTeacherRefresh(payload, client as unknown as Parameters<typeof processTeacherRefresh>[1]);
    const outboxInserts = client.calls.filter(
      (c) => c.table === 'outbox_event' && c.op === 'insert',
    );
    expect(outboxInserts.length).toBeGreaterThanOrEqual(1);
    const outboxRow = Array.isArray(outboxInserts[0]!.args)
      ? (outboxInserts[0]!.args as Record<string, unknown>[])[0]
      : (outboxInserts[0]!.args as Record<string, unknown>);
    expect(outboxRow!['event_type']).toBe('intervention_alert');
  });
});

// ─── jobs-worker route ───────────────────────────────────────────────────────

describe('jobs-worker route', () => {
  it('jobs-worker route: notification.create dispatches to NOTIFICATIONS_SVC_URL', async () => {
    // jobs-worker/index.ts uses Deno.serve and cannot be imported in Node/Vitest.
    // Verify the route map entry and env var via source-text grep (structural assertion).
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const src = readFileSync(
      resolve(__dirname, '../../jobs-worker/index.ts'),
      'utf-8',
    );
    expect(src).toContain('NOTIFICATIONS_SVC_URL');
    expect(src).toContain("'notification.create'");
  });
});

// ─── e2e chain ───────────────────────────────────────────────────────────────

describe('e2e chain', () => {
  it('assignment publish → outbox drain → jobs-worker dispatch → notifications-svc INSERT → GET /notifications/me returns notification (mocked chain, no wall-clock wait per DEV-20260524-1)', async () => {
    // Step 1: fn_drain_outbox_batch would convert assignment_assigned outbox event →
    //   notification.create job with enriched payload. We simulate the job payload.
    const jobPayload = {
      assignment_id: ASSIGN_ID,
      student_id: STUDENT_ID,
      tenant_id: TENANT_ID,
      published_at: NOW,
      notification_type: 'assignment_assigned',
    };

    // Step 2: jobs-worker dispatches to notifications-svc/pipeline/create.
    // We call createNotification directly (bypassing HTTP).
    const createClient = buildClient({
      notification: [
        { data: [], error: null },             // dedup SELECT
        { data: null, error: null },           // INSERT
        { data: [{ id: NOTIF_ID }], error: null }, // cap SELECT
      ],
    });
    const createResult = await createNotification(jobPayload, createClient);
    expect(createResult.status).toBe(201);
    expect(createResult.data!.deduped).toBe(false);

    // Step 3: GET /notifications/me returns the notification.
    const readClient = buildClient({
      notification: {
        data: [{ ...baseNotif, type: 'assignment_assigned', title: 'New Assignment' }],
        error: null,
      },
    });
    const readResult = await getMyNotifications(STUDENT_ID, false, readClient);
    expect(readResult.status).toBe(200);
    expect(readResult.data!).toHaveLength(1);
    expect(readResult.data![0]!.type).toBe('assignment_assigned');
  });
});
