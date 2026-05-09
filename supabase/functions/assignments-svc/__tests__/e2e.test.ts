/**
 * assignments-svc e2e test — Stage 33.
 *
 * Full lifecycle: teacher creates → publishes → student sees → starts → cron syncs → tracking shows completed.
 *
 * Uses the same sequential-counter mock client as contract.test.ts.
 * fn_sync_assignment_completion invoked directly to simulate cron tick (no time-wait).
 * Does NOT exercise index.ts or Deno.serve.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  createAssignment,
  publishAssignment,
  getAssignmentsForStudent,
  startAssignment,
  syncAssignmentCompletion,
  getAssignmentTracking,
  type DbClient,
  type Caller,
} from '../handlers.ts';

// ─── Mock client harness (mirrors contract.test.ts) ───────────────────────

interface QueryStub {
  data: unknown;
  error: { message: string } | null;
}

type Stubs = Record<string, QueryStub | QueryStub[]>;

function buildClient(stubs: Stubs): DbClient {
  const counters: Record<string, number> = {};

  const builder = (_table: string, stub: QueryStub): unknown => {
    const target = function () {} as unknown as object;
    const handler: ProxyHandler<object> = {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: QueryStub) => unknown) => resolve(stub);
        }
        if (prop === 'single') {
          return () => Promise.resolve(stub);
        }
        if (['select','insert','update','upsert','delete'].includes(prop as string)) {
          return () => new Proxy(target, handler);
        }
        return () => new Proxy(target, handler);
      },
    };
    return new Proxy(target, handler);
  };

  return {
    from(table: string) {
      const i = counters[table] ?? 0;
      counters[table] = i + 1;
      const entry = stubs[table];
      if (entry === undefined) {
        // Return empty success for unexpected tables (graceful fallback in e2e)
        return builder(table, { data: [], error: null }) as never;
      }
      const stub = Array.isArray(entry) ? (entry[i] ?? entry[entry.length - 1]!) : entry;
      return builder(table, stub) as never;
    },
  };
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID      = 't0000000-0000-4000-8000-000000000010';
const TEACHER_ID     = 'u0000000-0000-4000-8000-000000000010';
const STUDENT_ID     = 'u0000000-0000-4000-8000-000000000011';
const ASSIGNMENT_ID  = 'a0000000-0000-4000-8000-000000000010';
const PATHWAY_ID     = 'p0000000-0000-4000-8000-000000000010';
const SKILL_A        = 's0000000-0000-4000-8000-000000000010';
const NEW_SESSION_ID = 'ns000000-0000-4000-8000-000000000010';

const TEACHER_CALLER: Caller = { userId: TEACHER_ID, role: 'teacher', tenantId: TENANT_ID };
const STUDENT_CALLER: Caller = { userId: STUDENT_ID, role: 'student', tenantId: TENANT_ID };

const DRAFT_ROW = {
  id: ASSIGNMENT_ID, tenant_id: TENANT_ID, created_by: TEACHER_ID,
  title: 'E2E Assignment', description: null, mode: 'practice',
  pathway_id: PATHWAY_ID, target_skill_ids: [SKILL_A], difficulty_range: null,
  item_count: 5, time_limit_ms: null, due_at: null, status: 'draft',
  auto_generated: false, rationale: null, created_at: '2026-05-23T00:00:00.000Z',
  updated_at: '2026-05-23T00:00:00.000Z', published_at: null, archived_at: null,
};

const PUBLISHED_ROW = { ...DRAFT_ROW, status: 'published', published_at: '2026-05-23T01:00:00.000Z' };

const SKILL_ROW = { id: SKILL_A, name: 'Number Sense' };
const TEACHER_PROFILE = { id: TEACHER_ID, display_name: 'Mr Jones', tenant_id: TENANT_ID };
const STUDENT_PROFILE = { id: STUDENT_ID, display_name: 'Alice', tenant_id: TENANT_ID };

// ─── e2e ─────────────────────────────────────────────────────────────────────

describe('e2e', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('e2e: teacher creates → publishes → student sees → starts → cron syncs → tracking shows completed', async () => {

    // ------------------------------------------------------------------
    // STEP 1: Teacher creates assignment
    // Handler calls: skill_node (Q-33.8), assignment (INSERT), assignment_target (INSERT),
    //                skill_node (fetchSkillNames), user_profile (fetchDisplayName)
    // ------------------------------------------------------------------
    const createDb = buildClient({
      skill_node: [
        { data: [{ id: SKILL_A }], error: null },                         // Q-33.8 validation
        { data: [SKILL_ROW], error: null },                                // fetchSkillNames
      ],
      assignment: { data: DRAFT_ROW, error: null },                        // INSERT → returns row
      assignment_target: { data: [], error: null },
      user_profile: { data: [TEACHER_PROFILE], error: null },
    });

    const createResult = await createAssignment(
      {
        title: 'E2E Assignment',
        mode: 'practice',
        pathway_id: PATHWAY_ID,
        target_skill_ids: [SKILL_A],
        item_count: 5,
        targets: [{ type: 'student', id: STUDENT_ID }],
      },
      null,
      TEACHER_CALLER,
      createDb,
    );
    expect(createResult.status).toBe(201);
    expect(createResult.data?.id).toBe(ASSIGNMENT_ID);
    expect(createResult.data?.pathway_id).toBe(PATHWAY_ID);

    // ------------------------------------------------------------------
    // STEP 2: Teacher publishes assignment
    // Handler calls: assignment (fetchAssignment), assignment_target (targets),
    //                assignment_session (INSERT sessions), outbox_event (INSERT),
    //                assignment (UPDATE → published), skill_node, user_profile
    // ------------------------------------------------------------------
    const publishDb = buildClient({
      assignment: [
        { data: [DRAFT_ROW], error: null },                                // fetchAssignment
        { data: PUBLISHED_ROW, error: null },                              // UPDATE → single()
      ],
      assignment_target: {
        data: [{ assignment_id: ASSIGNMENT_ID, student_id: STUDENT_ID, class_id: null }],
        error: null,
      },
      assignment_session: { data: [], error: null },
      outbox_event: { data: [], error: null },
      skill_node: { data: [SKILL_ROW], error: null },
      user_profile: { data: [TEACHER_PROFILE], error: null },
    });

    const publishResult = await publishAssignment(ASSIGNMENT_ID, TEACHER_CALLER, publishDb);
    expect(publishResult.status).toBe(200);
    expect(publishResult.data?.status).toBe('published');

    // ------------------------------------------------------------------
    // STEP 3: Student sees assignment
    // Handler calls: assignment_session (query), assignment (fetch by IDs),
    //                skill_node, user_profile
    // ------------------------------------------------------------------
    const listDb = buildClient({
      assignment_session: {
        data: [{
          assignment_id: ASSIGNMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID,
          session_id: null, status: 'pending', completed_at: null,
          created_at: '2026-05-23T00:00:00.000Z', updated_at: '2026-05-23T00:00:00.000Z',
        }],
        error: null,
      },
      assignment: { data: [PUBLISHED_ROW], error: null },
      skill_node: { data: [SKILL_ROW], error: null },
      user_profile: { data: [TEACHER_PROFILE], error: null },
    });

    const listResult = await getAssignmentsForStudent(STUDENT_ID, null, STUDENT_CALLER, listDb);
    expect(listResult.status).toBe(200);
    expect(listResult.data).toHaveLength(1);
    expect(listResult.data?.[0]?.my_status).toBe('pending');
    expect(listResult.data?.[0]?.my_session_id).toBeNull();

    // ------------------------------------------------------------------
    // STEP 4: Student starts assignment (mocked assessment-svc)
    // Handler calls: assignment (fetchAssignment), assignment_session (check pending),
    //                fetch (→ assessment-svc), assignment_session (UPDATE in_progress)
    // ------------------------------------------------------------------
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { session_id: NEW_SESSION_ID } }),
      }),
    );

    const startDb = buildClient({
      assignment: { data: [PUBLISHED_ROW], error: null },
      assignment_session: [
        // check pending session
        {
          data: [{
            assignment_id: ASSIGNMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID,
            session_id: null, status: 'pending', completed_at: null,
            created_at: '2026-05-23T00:00:00.000Z', updated_at: '2026-05-23T00:00:00.000Z',
          }],
          error: null,
        },
        // UPDATE to in_progress
        { data: [], error: null },
      ],
    });

    const startResult = await startAssignment(
      ASSIGNMENT_ID,
      STUDENT_ID,
      'Bearer student-jwt',
      null,
      'trace-e2e',
      startDb,
      'http://assessment-svc',
    );
    expect(startResult.status).toBe(200);
    expect(startResult.data?.session_id).toBe(NEW_SESSION_ID);
    expect(startResult.data?.assignment_session_status).toBe('in_progress');

    const fetchMock = vi.mocked(fetch);
    const [, opts] = fetchMock.mock.calls[0]!;
    const reqBody = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
    expect(reqBody['pathway_id']).toBe(PATHWAY_ID); // Q-33.8 Option A verified in e2e

    // ------------------------------------------------------------------
    // STEP 5: Session completes; cron tick syncs completion
    // Handler calls: assignment_session (query in_progress), session_record (check status),
    //                assignment_session (UPDATE completed)
    // ------------------------------------------------------------------
    const syncDb = buildClient({
      assignment_session: [
        { data: [{ assignment_id: ASSIGNMENT_ID, student_id: STUDENT_ID, session_id: NEW_SESSION_ID }], error: null },
        { data: [], error: null }, // UPDATE
      ],
      session_record: { data: [{ status: 'processed', updated_at: '2026-05-23T05:00:00.000Z' }], error: null },
    });

    const syncResult = await syncAssignmentCompletion(syncDb);
    expect(syncResult.updated).toBe(1);

    // ------------------------------------------------------------------
    // STEP 6: Tracking shows completed
    // Handler calls: assignment_session (query), user_profile (fetchDisplayName)
    // ------------------------------------------------------------------
    const trackingDb = buildClient({
      assignment_session: {
        data: [{
          assignment_id: ASSIGNMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID,
          session_id: NEW_SESSION_ID, status: 'completed', completed_at: '2026-05-23T05:00:00.000Z',
          created_at: '2026-05-23T00:00:00.000Z', updated_at: '2026-05-23T05:00:00.000Z',
        }],
        error: null,
      },
      user_profile: { data: [STUDENT_PROFILE], error: null },
    });

    const trackingResult = await getAssignmentTracking(ASSIGNMENT_ID, TEACHER_CALLER, trackingDb);
    expect(trackingResult.status).toBe(200);
    expect(trackingResult.data?.completion_rate).toBeCloseTo(1.0);
    expect(trackingResult.data?.targets[0]?.status).toBe('completed');
    expect(trackingResult.data?.targets[0]?.session_id).toBe(NEW_SESSION_ID);
  });
});
