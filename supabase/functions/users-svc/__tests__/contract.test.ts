/**
 * users-svc contract tests — Stage 37.
 *
 * Vitest in Node. Tests pure handler functions with mocked Supabase-like client.
 *
 * Coverage:
 *   handleGetMyClasses (3):
 *     returns class list with student_count for teacher
 *     returns empty array when teacher has no classes
 *     returns 403 for non-teacher role
 *   handleGetClassStudents (2):
 *     returns paginated student roster for teacher who owns class
 *     teacher ownership enforced: 403 for teacher who does not own class
 */
import { describe, expect, it, vi } from 'vitest';
import {
  handleGetMyClasses,
  handleGetClassStudents,
  type DbClient,
} from '../handlers.ts';

// ─── Mock client harness (mirrors analytics-svc harness) ─────────────────────

interface CapturedCall {
  table: string;
  op: 'select' | 'insert' | 'update';
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
        if (prop === 'select' || prop === 'insert' || prop === 'update') {
          return (...args: unknown[]) => {
            const writeOps = new Set(['insert', 'update']);
            if (prop === 'select' && writeOps.has(captured.op)) {
              return new Proxy(target, handler);
            }
            captured = { ...captured, op: prop as CapturedCall['op'], args: args[0] };
            return new Proxy(target, handler);
          };
        }
        if (prop === 'eq' || prop === 'in') {
          return (col: string, val: unknown) => {
            captured.conditions = [
              ...(captured.conditions ?? []),
              { kind: prop as string, col, val },
            ];
            return new Proxy(target, handler);
          };
        }
        // .order / .limit / .range → pass-through
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

const CLASS_A   = 'c0000000-0000-4000-8000-000000000001';
const CLASS_B   = 'c0000000-0000-4000-8000-000000000002';
const TEACHER   = 'u0000000-0000-4000-8000-000000000001';
const TEACHER_B = 'u0000000-0000-4000-8000-000000000009';
const STUDENT_A = 'u0000000-0000-4000-8000-000000000002';
const STUDENT_B = 'u0000000-0000-4000-8000-000000000003';
const STUDENT_C = 'u0000000-0000-4000-8000-000000000004';

// ─── handleGetMyClasses ──────────────────────────────────────────────────────

describe('GET /users/me/classes: returns class list with student_count for teacher', () => {
  it('returns class list with student_count for teacher', async () => {
    const db = buildClient({
      class_group: {
        data: [
          { id: CLASS_A, name: 'Year 5 Numeracy', year_level: 5, created_at: '2026-05-01T00:00:00Z' },
          { id: CLASS_B, name: 'Year 6 Maths',   year_level: 6, created_at: '2026-05-02T00:00:00Z' },
        ],
        error: null,
      },
      class_student: {
        data: [
          { class_id: CLASS_A, student_id: STUDENT_A },
          { class_id: CLASS_A, student_id: STUDENT_B },
          { class_id: CLASS_B, student_id: STUDENT_C },
        ],
        error: null,
      },
    });

    const result = await handleGetMyClasses(TEACHER, 'teacher', db);

    expect(result.status).toBe(200);
    expect(result.data?.classes).toHaveLength(2);
    const classA = result.data!.classes.find((c) => c.id === CLASS_A);
    const classB = result.data!.classes.find((c) => c.id === CLASS_B);
    expect(classA?.student_count).toBe(2);
    expect(classB?.student_count).toBe(1);
    expect(classA?.name).toBe('Year 5 Numeracy');
  });

  it('returns empty array when teacher has no classes', async () => {
    const db = buildClient({
      class_group: { data: [], error: null },
    });

    const result = await handleGetMyClasses(TEACHER, 'teacher', db);

    expect(result.status).toBe(200);
    expect(result.data?.classes).toHaveLength(0);
  });

  it('returns 403 for non-teacher role', async () => {
    const db = buildClient({});

    const result = await handleGetMyClasses(STUDENT_A, 'student', db);

    expect(result.status).toBe(403);
    expect(result.error).toBe('FORBIDDEN');
  });
});

// ─── handleGetClassStudents ──────────────────────────────────────────────────

describe('GET /users/classes/{class_id}/students: returns paginated student roster', () => {
  it('returns paginated student roster for teacher who owns class', async () => {
    const db = buildClient({
      class_group: { data: [{ teacher_id: TEACHER }], error: null },
      class_student: {
        data: [{ student_id: STUDENT_A }, { student_id: STUDENT_B }],
        error: null,
      },
      user_profile: {
        data: [
          { id: STUDENT_A, display_name: 'Alice Smith', year_level: 5 },
          { id: STUDENT_B, display_name: 'Bob Jones',   year_level: 5 },
        ],
        error: null,
      },
      session_record: {
        data: [
          { student_id: STUDENT_A, raw_score: 80, submitted_at: '2026-05-20T09:00:00Z' },
          { student_id: STUDENT_A, raw_score: 70, submitted_at: '2026-05-15T09:00:00Z' },
        ],
        error: null,
      },
      skill_mastery: {
        data: [
          { student_id: STUDENT_A, mastery_level: 0.9 },
          { student_id: STUDENT_A, mastery_level: 0.85 },
          { student_id: STUDENT_B, mastery_level: 0.5 },
        ],
        error: null,
      },
    });

    const result = await handleGetClassStudents(CLASS_A, TEACHER, 'teacher', 1, db);

    expect(result.status).toBe(200);
    expect(result.data?.students).toHaveLength(2);
    expect(result.data?.total).toBe(2);
    expect(result.data?.page).toBe(1);
    expect(result.data?.page_size).toBe(50);

    const alice = result.data!.students.find((s) => s.id === STUDENT_A);
    expect(alice?.display_name).toBe('Alice Smith');
    expect(alice?.avg_score).toBeCloseTo(75); // (80+70)/2
    expect(alice?.mastery_summary).toBe(2);   // 2 skills >= 0.8

    const bob = result.data!.students.find((s) => s.id === STUDENT_B);
    expect(bob?.mastery_summary).toBe(0);     // 0 skills >= 0.8
  });

  it('teacher ownership enforced: 403 for teacher who does not own class', async () => {
    const db = buildClient({
      class_group: { data: [{ teacher_id: TEACHER }], error: null },
    });

    const result = await handleGetClassStudents(CLASS_A, TEACHER_B, 'teacher', 1, db);

    expect(result.status).toBe(403);
    expect(result.error).toBe('FORBIDDEN');
  });
});
