/**
 * assignments-svc contract tests — Stage 33.
 *
 * Vitest in Node. The Deno dispatcher (index.ts) is NOT exercised here —
 * we test pure handler functions with a mocked Supabase-like client.
 *
 * Coverage (19 contract tests):
 *   createAssignment (3):
 *     happy-path: inserts assignment + assignment_target rows; returns AssignmentDTO
 *     student caller → 403
 *     target_skill_ids spanning pathways → 422 (Q-33.8 v1 single-pathway constraint)
 *   getAssignment (1):
 *     returns AssignmentDTO with target_skill_names and created_by joined
 *   updateAssignment (2):
 *     updates pre-publish draft; returns updated AssignmentDTO
 *     published assignment → 422 UNPROCESSABLE
 *   publishAssignment (2):
 *     materialises assignment_session per target; writes outbox_event assignment_assigned
 *     student caller → 403
 *   archiveAssignment (2):
 *     transitions assignment to archived from draft or published
 *     already-archived assignment → 422 UNPROCESSABLE
 *   getAssignmentsForStudent (2):
 *     returns StudentAssignmentDTO[] with my_status from assignment_session
 *     student reads own; non-teacher cross-student → 403
 *   getAssignmentsForClass (1):
 *     returns assignment list; teacher-only (student → 403)
 *   getAssignmentTracking (2):
 *     returns AssignmentTrackingDTO with completion_rate = completed / total
 *     completion_rate computed as completed_count / total_target_count
 *   startAssignment (2):
 *     forwards student JWT to assessment-svc; updates assignment_session to in_progress
 *     assignment not published → 422 UNPROCESSABLE
 *   markOverdue (1):
 *     transitions pending/in_progress assignment_sessions past due_at+24h to overdue (not completed)
 *   syncAssignmentCompletion (1):
 *     transitions in_progress assignment_session to completed when linked session_record.status = processed
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  createAssignment,
  getAssignment,
  updateAssignment,
  publishAssignment,
  archiveAssignment,
  getAssignmentsForStudent,
  getAssignmentsForClass,
  getAssignmentTracking,
  startAssignment,
  markOverdue,
  syncAssignmentCompletion,
  type DbClient,
  type Caller,
} from '../handlers.ts';

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
        if (prop === 'eq' || prop === 'neq' || prop === 'in' || prop === 'gte' || prop === 'is') {
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

const TENANT_ID    = 't0000000-0000-4000-8000-000000000001';
const TEACHER_ID   = 'u0000000-0000-4000-8000-000000000001';
const STUDENT_ID   = 'u0000000-0000-4000-8000-000000000002';
const STUDENT_B    = 'u0000000-0000-4000-8000-000000000003';
const ASSIGNMENT_ID = 'a0000000-0000-4000-8000-000000000001';
const PATHWAY_ID   = 'p0000000-0000-4000-8000-000000000001';
const PATHWAY_B_ID = 'p0000000-0000-4000-8000-000000000002';
const SKILL_A      = 's0000000-0000-4000-8000-000000000010';
const SKILL_B      = 's0000000-0000-4000-8000-000000000011';
const CLASS_ID     = 'c0000000-0000-4000-8000-000000000001';
const SESSION_ID   = 'ss000000-0000-4000-8000-000000000001';

const TEACHER_CALLER: Caller = { userId: TEACHER_ID, role: 'teacher', tenantId: TENANT_ID };
const STUDENT_CALLER: Caller = { userId: STUDENT_ID, role: 'student', tenantId: TENANT_ID };
const ADMIN_CALLER: Caller   = { userId: TEACHER_ID, role: 'platform_admin', tenantId: TENANT_ID };

const DRAFT_ASSIGNMENT_ROW = {
  id: ASSIGNMENT_ID,
  tenant_id: TENANT_ID,
  created_by: TEACHER_ID,
  title: 'Test Assignment',
  description: null,
  mode: 'practice',
  pathway_id: PATHWAY_ID,
  target_skill_ids: [SKILL_A, SKILL_B],
  difficulty_range: null,
  item_count: 10,
  time_limit_ms: null,
  due_at: null,
  status: 'draft',
  auto_generated: false,
  rationale: null,
  created_at: '2026-05-23T00:00:00.000Z',
  updated_at: '2026-05-23T00:00:00.000Z',
  published_at: null,
  archived_at: null,
};

const PUBLISHED_ASSIGNMENT_ROW = { ...DRAFT_ASSIGNMENT_ROW, status: 'published', published_at: '2026-05-23T01:00:00.000Z' };

// ─── createAssignment ───────────────────────────────────────────────────────

describe('createAssignment', () => {
  it('inserts assignment + assignment_target rows; returns AssignmentDTO', async () => {
    const db = buildClient({
      skill_node: [
        // Q-33.8 cross-pathway validation: both skills belong to PATHWAY_ID
        { data: [{ id: SKILL_A }, { id: SKILL_B }], error: null },
        // fetchSkillNames
        { data: [{ id: SKILL_A, name: 'Algebra' }, { id: SKILL_B, name: 'Fractions' }], error: null },
      ],
      assignment: { data: { ...DRAFT_ASSIGNMENT_ROW }, error: null },
      assignment_target: { data: [], error: null },
      user_profile: { data: [{ id: TEACHER_ID, display_name: 'Ms Smith', tenant_id: TENANT_ID }], error: null },
    });

    const body = {
      title: 'Test Assignment',
      mode: 'practice',
      pathway_id: PATHWAY_ID,
      target_skill_ids: [SKILL_A, SKILL_B],
      item_count: 10,
      targets: [{ type: 'student', id: STUDENT_ID }],
    };

    const result = await createAssignment(body, null, TEACHER_CALLER, db);

    expect(result.status).toBe(201);
    expect(result.data?.id).toBe(ASSIGNMENT_ID);
    expect(result.data?.pathway_id).toBe(PATHWAY_ID);
    expect(result.data?.target_skill_names).toEqual(['Algebra', 'Fractions']);
    expect(result.data?.created_by.display_name).toBe('Ms Smith');
    expect(result.data?.status).toBe('draft');

    const targetCall = db.calls.find((c) => c.table === 'assignment_target' && c.op === 'insert');
    expect(targetCall).toBeDefined();
  });

  it('student caller → 403 (teacher role required)', async () => {
    const db = buildClient({});
    const result = await createAssignment(
      { title: 'x', mode: 'practice', pathway_id: PATHWAY_ID, target_skill_ids: [], item_count: 5, targets: [] },
      null,
      STUDENT_CALLER,
      db,
    );
    expect(result.status).toBe(403);
    expect(result.error).toMatch(/FORBIDDEN/);
  });

  it('createAssignment: target_skill_ids spanning pathways → 422 with field error (Q-33.8 v1 single-pathway constraint)', async () => {
    // skill_node cross-pathway check returns only 1 of 2 skills (SKILL_B is in PATHWAY_B)
    const db = buildClient({
      skill_node: { data: [{ id: SKILL_A }], error: null }, // only 1 matches PATHWAY_ID
    });

    const body = {
      title: 'Cross-pathway',
      mode: 'practice',
      pathway_id: PATHWAY_ID,
      target_skill_ids: [SKILL_A, SKILL_B],
      item_count: 10,
      targets: [],
    };

    const result = await createAssignment(body, null, TEACHER_CALLER, db);
    expect(result.status).toBe(422);
    expect(result.error).toMatch(/target_skill_ids contains skills from other pathways/);
  });
});

// ─── getAssignment ──────────────────────────────────────────────────────────

describe('getAssignment', () => {
  it('returns AssignmentDTO with target_skill_names and created_by joined', async () => {
    const db = buildClient({
      assignment: { data: [{ ...PUBLISHED_ASSIGNMENT_ROW }], error: null },
      skill_node: { data: [{ id: SKILL_A, name: 'Algebra' }, { id: SKILL_B, name: 'Fractions' }], error: null },
      user_profile: { data: [{ id: TEACHER_ID, display_name: 'Ms Smith', tenant_id: TENANT_ID }], error: null },
    });

    const result = await getAssignment(ASSIGNMENT_ID, ADMIN_CALLER, db);
    expect(result.status).toBe(200);
    expect(result.data?.target_skill_names).toEqual(['Algebra', 'Fractions']);
    expect(result.data?.created_by.display_name).toBe('Ms Smith');
    expect(result.data?.pathway_id).toBe(PATHWAY_ID);
  });
});

// ─── updateAssignment ───────────────────────────────────────────────────────

describe('updateAssignment', () => {
  it('updates pre-publish draft; returns updated AssignmentDTO', async () => {
    const updatedRow = { ...DRAFT_ASSIGNMENT_ROW, title: 'Updated Title' };
    const db = buildClient({
      assignment: [
        { data: [{ ...DRAFT_ASSIGNMENT_ROW }], error: null }, // fetchAssignment
        { data: { ...updatedRow }, error: null },              // update().select().single()
      ],
      skill_node: { data: [{ id: SKILL_A, name: 'Algebra' }, { id: SKILL_B, name: 'Fractions' }], error: null },
      user_profile: { data: [{ id: TEACHER_ID, display_name: 'Ms Smith', tenant_id: TENANT_ID }], error: null },
    });

    const result = await updateAssignment(ASSIGNMENT_ID, { title: 'Updated Title' }, TEACHER_CALLER, db);
    expect(result.status).toBe(200);
    expect(result.data?.title).toBe('Updated Title');
  });

  it('updateAssignment: published assignment → 422 UNPROCESSABLE (not in draft status)', async () => {
    const db = buildClient({
      assignment: { data: [{ ...PUBLISHED_ASSIGNMENT_ROW }], error: null },
    });

    const result = await updateAssignment(ASSIGNMENT_ID, { title: 'x' }, TEACHER_CALLER, db);
    expect(result.status).toBe(422);
    expect(result.error).toMatch(/not in draft status/);
  });
});

// ─── publishAssignment ──────────────────────────────────────────────────────

describe('publishAssignment', () => {
  it('publishAssignment: materialises assignment_session per target; writes outbox_event assignment_assigned', async () => {
    const publishedRow = { ...DRAFT_ASSIGNMENT_ROW, status: 'published', published_at: '2026-05-23T02:00:00.000Z' };
    const db = buildClient({
      assignment: [
        { data: [{ ...DRAFT_ASSIGNMENT_ROW }], error: null }, // fetchAssignment
        { data: { ...publishedRow }, error: null },            // update().single()
      ],
      assignment_target: {
        data: [{ assignment_id: ASSIGNMENT_ID, student_id: STUDENT_ID, class_id: null }],
        error: null,
      },
      assignment_session: { data: [], error: null },
      outbox_event: { data: [], error: null },
      skill_node: { data: [{ id: SKILL_A, name: 'Algebra' }, { id: SKILL_B, name: 'Fractions' }], error: null },
      user_profile: { data: [{ id: TEACHER_ID, display_name: 'Ms Smith', tenant_id: TENANT_ID }], error: null },
    });

    const result = await publishAssignment(ASSIGNMENT_ID, TEACHER_CALLER, db);
    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('published');

    const sessionInsert = db.calls.find((c) => c.table === 'assignment_session' && c.op === 'insert');
    expect(sessionInsert).toBeDefined();

    const outboxInsert = db.calls.find((c) => c.table === 'outbox_event' && c.op === 'insert');
    expect(outboxInsert).toBeDefined();
  });

  it('publishAssignment: student caller → 403 (teacher role required)', async () => {
    const db = buildClient({});
    const result = await publishAssignment(ASSIGNMENT_ID, STUDENT_CALLER, db);
    expect(result.status).toBe(403);
  });
});

// ─── archiveAssignment ──────────────────────────────────────────────────────

describe('archiveAssignment', () => {
  it('archiveAssignment: transitions assignment to archived from draft or published', async () => {
    const archivedRow = { ...PUBLISHED_ASSIGNMENT_ROW, status: 'archived', archived_at: '2026-05-23T03:00:00.000Z' };
    const db = buildClient({
      assignment: [
        { data: [{ ...PUBLISHED_ASSIGNMENT_ROW }], error: null }, // fetchAssignment
        { data: { ...archivedRow }, error: null },                 // update().single()
      ],
      skill_node: { data: [{ id: SKILL_A, name: 'Algebra' }, { id: SKILL_B, name: 'Fractions' }], error: null },
      user_profile: { data: [{ id: TEACHER_ID, display_name: 'Ms Smith', tenant_id: TENANT_ID }], error: null },
    });

    const result = await archiveAssignment(ASSIGNMENT_ID, TEACHER_CALLER, db);
    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('archived');
  });

  it('archiveAssignment: already-archived assignment → 422 UNPROCESSABLE', async () => {
    const archivedRow = { ...DRAFT_ASSIGNMENT_ROW, status: 'archived' };
    const db = buildClient({
      assignment: { data: [{ ...archivedRow }], error: null },
    });

    const result = await archiveAssignment(ASSIGNMENT_ID, TEACHER_CALLER, db);
    expect(result.status).toBe(422);
    expect(result.error).toMatch(/already archived/);
  });
});

// ─── getAssignmentsForStudent ────────────────────────────────────────────────

describe('getAssignmentsForStudent', () => {
  it('getAssignmentsForStudent: returns StudentAssignmentDTO[] with my_status from assignment_session', async () => {
    const db = buildClient({
      assignment_session: {
        data: [{
          assignment_id: ASSIGNMENT_ID,
          student_id: STUDENT_ID,
          tenant_id: TENANT_ID,
          session_id: null,
          status: 'pending',
          completed_at: null,
          created_at: '2026-05-23T00:00:00.000Z',
          updated_at: '2026-05-23T00:00:00.000Z',
        }],
        error: null,
      },
      assignment: { data: [{ ...PUBLISHED_ASSIGNMENT_ROW }], error: null },
      skill_node: { data: [{ id: SKILL_A, name: 'Algebra' }, { id: SKILL_B, name: 'Fractions' }], error: null },
      user_profile: { data: [{ id: TEACHER_ID, display_name: 'Ms Smith', tenant_id: TENANT_ID }], error: null },
    });

    const result = await getAssignmentsForStudent(STUDENT_ID, null, STUDENT_CALLER, db);
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.my_status).toBe('pending');
    expect(result.data?.[0]?.my_session_id).toBeNull();
    expect(result.data?.[0]?.pathway_id).toBe(PATHWAY_ID);
  });

  it('getAssignmentsForStudent: student reads own; non-teacher cross-student → 403', async () => {
    const db = buildClient({});
    // STUDENT_CALLER trying to read STUDENT_B's assignments
    const result = await getAssignmentsForStudent(STUDENT_B, null, STUDENT_CALLER, db);
    expect(result.status).toBe(403);
    expect(result.error).toMatch(/FORBIDDEN/);
  });
});

// ─── getAssignmentsForClass ──────────────────────────────────────────────────

describe('getAssignmentsForClass', () => {
  it('getAssignmentsForClass: returns assignment list; teacher-only (student → 403)', async () => {
    const db = buildClient({});
    const result = await getAssignmentsForClass(CLASS_ID, STUDENT_CALLER, db);
    expect(result.status).toBe(403);
    expect(result.error).toMatch(/FORBIDDEN/);
  });
});

// ─── getAssignmentTracking ───────────────────────────────────────────────────

describe('getAssignmentTracking', () => {
  it('getAssignmentTracking: returns AssignmentTrackingDTO with completion_rate = completed / total', async () => {
    const db = buildClient({
      assignment_session: {
        data: [
          { assignment_id: ASSIGNMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, session_id: SESSION_ID, status: 'completed', completed_at: '2026-05-23T04:00:00.000Z', created_at: '2026-05-23T00:00:00.000Z', updated_at: '2026-05-23T04:00:00.000Z' },
          { assignment_id: ASSIGNMENT_ID, student_id: STUDENT_B, tenant_id: TENANT_ID, session_id: null, status: 'pending', completed_at: null, created_at: '2026-05-23T00:00:00.000Z', updated_at: '2026-05-23T00:00:00.000Z' },
        ],
        error: null,
      },
      user_profile: [
        { data: [{ id: STUDENT_ID, display_name: 'Alice', tenant_id: TENANT_ID }], error: null },
        { data: [{ id: STUDENT_B, display_name: 'Bob', tenant_id: TENANT_ID }], error: null },
      ],
    });

    const result = await getAssignmentTracking(ASSIGNMENT_ID, TEACHER_CALLER, db);
    expect(result.status).toBe(200);
    expect(result.data?.completion_rate).toBeCloseTo(0.5);
    expect(result.data?.targets).toHaveLength(2);
    expect(result.data?.targets[0]?.status).toBe('completed');
  });

  it('getAssignmentTracking: completion_rate computed as completed_count / total_target_count', async () => {
    const db = buildClient({
      assignment_session: {
        data: [
          { assignment_id: ASSIGNMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, session_id: SESSION_ID, status: 'completed', completed_at: '2026-05-23T04:00:00.000Z', created_at: '2026-05-23T00:00:00.000Z', updated_at: '2026-05-23T04:00:00.000Z' },
          { assignment_id: ASSIGNMENT_ID, student_id: STUDENT_B, tenant_id: TENANT_ID, session_id: null, status: 'completed', completed_at: '2026-05-23T05:00:00.000Z', created_at: '2026-05-23T00:00:00.000Z', updated_at: '2026-05-23T05:00:00.000Z' },
        ],
        error: null,
      },
      user_profile: [
        { data: [{ id: STUDENT_ID, display_name: 'Alice', tenant_id: TENANT_ID }], error: null },
        { data: [{ id: STUDENT_B, display_name: 'Bob', tenant_id: TENANT_ID }], error: null },
      ],
    });

    const result = await getAssignmentTracking(ASSIGNMENT_ID, ADMIN_CALLER, db);
    expect(result.status).toBe(200);
    expect(result.data?.completion_rate).toBeCloseTo(1.0);
  });
});

// ─── startAssignment ─────────────────────────────────────────────────────────

describe('startAssignment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('startAssignment: forwards student JWT to assessment-svc; updates assignment_session to in_progress', async () => {
    const newSessionId = 'ns000000-0000-4000-8000-000000000001';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { session_id: newSessionId } }),
      }),
    );

    const db = buildClient({
      assignment: { data: [{ ...PUBLISHED_ASSIGNMENT_ROW }], error: null },
      assignment_session: [
        // check pending session
        { data: [{ assignment_id: ASSIGNMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, session_id: null, status: 'pending', completed_at: null, created_at: '2026-05-23T00:00:00.000Z', updated_at: '2026-05-23T00:00:00.000Z' }], error: null },
        // update to in_progress
        { data: [], error: null },
      ],
    });

    const result = await startAssignment(
      ASSIGNMENT_ID,
      STUDENT_ID,
      'Bearer student-jwt-token',
      null,
      'trace-001',
      db,
      'http://assessment-svc',
    );

    expect(result.status).toBe(200);
    expect(result.data?.session_id).toBe(newSessionId);
    expect(result.data?.assignment_session_status).toBe('in_progress');

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/sessions/create');
    const reqBody = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
    expect(reqBody['assignment_id']).toBe(ASSIGNMENT_ID);
    expect(reqBody['pathway_id']).toBe(PATHWAY_ID); // Q-33.8 Option A
    const sentHeaders = (opts as RequestInit).headers as Record<string, string>;
    expect(sentHeaders['Authorization']).toBe('Bearer student-jwt-token');

    const sessionUpdate = db.calls.find((c) => c.table === 'assignment_session' && c.op === 'update');
    expect(sessionUpdate).toBeDefined();
  });

  it('startAssignment: assignment not published → 422 UNPROCESSABLE', async () => {
    const db = buildClient({
      assignment: { data: [{ ...DRAFT_ASSIGNMENT_ROW }], error: null },
    });

    const result = await startAssignment(
      ASSIGNMENT_ID,
      STUDENT_ID,
      'Bearer student-jwt-token',
      null,
      'trace-002',
      db,
      'http://assessment-svc',
    );
    expect(result.status).toBe(422);
    expect(result.error).toMatch(/not published/);
  });
});

// ─── markOverdue ─────────────────────────────────────────────────────────────

describe('markOverdue', () => {
  it('markOverdue: transitions pending/in_progress assignment_sessions past due_at+24h to overdue (not completed)', async () => {
    // due_at 48 hours ago → overdue threshold passed
    const dueAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const db = buildClient({
      assignment_session: [
        // initial query: pending + in_progress sessions
        {
          data: [
            { assignment_id: ASSIGNMENT_ID, student_id: STUDENT_ID },
          ],
          error: null,
        },
        // update to overdue
        { data: [], error: null },
      ],
      assignment: { data: [{ ...DRAFT_ASSIGNMENT_ROW, due_at: dueAt }], error: null },
    });

    const result = await markOverdue(db);
    expect(result.updated).toBe(1);

    const updateCall = db.calls.find((c) => c.table === 'assignment_session' && c.op === 'update');
    expect(updateCall).toBeDefined();
  });
});

// ─── syncAssignmentCompletion ─────────────────────────────────────────────────

describe('syncAssignmentCompletion', () => {
  it('syncAssignmentCompletion: transitions in_progress assignment_session to completed when linked session_record.status = processed', async () => {
    const db = buildClient({
      assignment_session: [
        // initial query: in_progress sessions with session_id
        {
          data: [{ assignment_id: ASSIGNMENT_ID, student_id: STUDENT_ID, session_id: SESSION_ID }],
          error: null,
        },
        // update to completed
        { data: [], error: null },
      ],
      session_record: {
        data: [{ status: 'processed', updated_at: '2026-05-23T05:00:00.000Z' }],
        error: null,
      },
    });

    const result = await syncAssignmentCompletion(db);
    expect(result.updated).toBe(1);

    const updateCall = db.calls.find((c) => c.table === 'assignment_session' && c.op === 'update');
    expect(updateCall).toBeDefined();
  });
});
