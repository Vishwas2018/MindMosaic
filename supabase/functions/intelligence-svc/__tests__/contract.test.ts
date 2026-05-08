/**
 * intelligence-svc contract tests — Stage 28.
 *
 * Vitest in Node. The Deno dispatcher (`index.ts`) is NOT exercised here —
 * we test the pure handler functions with a mocked Supabase-like client.
 *
 * Named exit criteria (DEV_PLAN Stage 20 + Stage 28):
 *   - 'replay determinism: byte-identical UPSERT payloads across two runs
 *      (DEV_PLAN exit criterion)'
 *   - 'audit-log dedup short-circuits re-processing (Q-20.7)'
 *
 * Stage 28 additions:
 *   - ISSUE-0006 fix: skill_edge removed from baseStubs() — L3a now reads
 *     via skillGraph (empty adjacency when skillGraph=null / undefined).
 *   - processCausalFull L3b suite: dedup, traversal, audit log, error paths.
 *
 * Coverage:
 *   L1 foundation (4)      — mastery delta, velocity, confidence, streak
 *   L2 behaviour  (5)      — guess_probability, behaviour_signal insert,
 *                            year-level defaults, fatigue, blend formula
 *   L3a causal    (3)      — depth-1 walk, misconception detection, no-walk
 *   L3b causal    (6)      — dedup, root-cause, unlocked-skill, audit log,
 *                            skills_traversed count, session-not-found
 *   Replay determinism (1) — byte-identical UPSERT payloads × 2 runs
 *   Dedup        (1)       — already_processed short-circuit
 *   Year defaults (2)      — Y3 vs Y8
 *   Error paths   (2+)     — missing session / invalid engine state
 *   Helpers       (≥ 2)    — canonicalize / walkPrereqsDepth1 / blendBehaviour
 */
import { describe, expect, it, vi } from 'vitest';
import {
  processSession,
  processCausalFull,
  processPredictiveRefresh,
  getPredictions,
  L5_ALGORITHM_VERSION,
  type DbClient,
  type PredictionsCallerContext,
} from '../handlers.ts';
import type { SkillGraphCache } from '../../_shared/skill-graph-cache.ts';
import {
  ALGORITHM_VERSION,
  blendBehaviour,
  canonicalize,
  guessProbability,
  walkPrereqsDepth1,
  yearLevelDefaults,
} from '../../_shared/intelligence-helpers.ts';

// ─── Mock client harness ────────────────────────────────────────────────────
//
// The handler reads from many tables and writes to several. The
// callable-Proxy mock returns a single canned answer per (table, callIndex);
// for write paths it captures every payload for later assertion.

interface CapturedCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  args?: unknown;
  /** Conditions captured via .eq/.in (debug aid). */
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
        if (prop === 'maybeSingle' || prop === 'single') {
          return () => {
            calls.push(captured);
            return Promise.resolve(stub);
          };
        }
        if (prop === 'select' || prop === 'insert' || prop === 'update' || prop === 'upsert' || prop === 'delete') {
          return (...args: unknown[]) => {
            captured = { ...captured, op: prop as CapturedCall['op'], args: args[0] };
            return new Proxy(target, handler);
          };
        }
        if (prop === 'eq' || prop === 'in' || prop === 'gte') {
          return (col: string, val: unknown) => {
            captured.conditions = [...(captured.conditions ?? []), { kind: prop as string, col, val }];
            return new Proxy(target, handler);
          };
        }
        // .order / .limit / etc. are pass-through.
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
    const stub = Array.isArray(entry) ? entry[i] ?? entry[entry.length - 1]! : entry;
    return builder(table, stub) as never;
  });

  return {
    from: fromSpy as never,
    calls,
  } as DbClient & { calls: CapturedCall[] };
}

// ─── Fixture builders (deterministic UUIDs for replay tests) ────────────────

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID  = '33333333-3333-4333-8333-333333333333';
const SKILL_A    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SKILL_B    = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SKILL_C    = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ITEM_1     = '99999999-9999-4999-8999-000000000001';
const ITEM_2     = '99999999-9999-4999-8999-000000000002';
const ITEM_3     = '99999999-9999-4999-8999-000000000003';
const MISC_1     = '88888888-8888-4888-8888-000000000001';

function buildEngineState() {
  return {
    engine_type: 'linear',
    session_id: SESSION_ID,
    mode: 'exam',
    planned_items: [],
    current_index: 3,
    responses: [],
    flagged_item_ids: [],
    started_at: '2026-05-09T10:00:00.000Z',
    time_limit_ms: 600000,
    total_items: 3,
  };
}

function buildSessionStub(over: Partial<{ status: string; engine_state: unknown }> = {}): QueryStub {
  return {
    data: {
      id: SESSION_ID,
      student_id: STUDENT_ID,
      tenant_id: TENANT_ID,
      pathway_id: 'pathway-1',
      engine_type: 'linear',
      engine_state_snapshot: over.engine_state ?? buildEngineState(),
      status: over.status ?? 'submitted',
    },
    error: null,
  };
}

function buildProfileStub(yearLevel: string | null = 'Y5'): QueryStub {
  return {
    data: { id: STUDENT_ID, tenant_id: TENANT_ID, year_level: yearLevel },
    error: null,
  };
}

function buildResponses(opts?: { count?: number; allCorrect?: boolean }): QueryStub {
  const count = opts?.count ?? 3;
  const allCorrect = opts?.allCorrect ?? false;
  const data = Array.from({ length: count }, (_, i) => ({
    id: `response-${String(i).padStart(3, '0')}`,
    session_id: SESSION_ID,
    item_id: i === 0 ? ITEM_1 : i === 1 ? ITEM_2 : ITEM_3,
    is_correct: allCorrect ? true : i % 2 === 0,
    difficulty: 0.5 + i * 0.1,
    sequence_number: i + 1,
    response_data: { choice_id: i % 2 === 0 ? 'A' : 'B' },
    telemetry: { time_to_answer_ms: 12000, answer_changes: 1 },
    answered_at: '2026-05-09T10:00:00.000Z',
  }));
  return { data, error: null };
}

function buildItemsStub(): QueryStub {
  return {
    data: [
      { id: ITEM_1, skill_ids: [SKILL_A] },
      { id: ITEM_2, skill_ids: [SKILL_B] },
      { id: ITEM_3, skill_ids: [SKILL_A, SKILL_C] },
    ],
    error: null,
  };
}

// MOCK_GRAPH mirrors buildEdgesStub edge: SKILL_B is prereq of SKILL_A.
// Used by L3b tests; L3a tests pass skillGraph=undefined (empty adjacency —
// ISSUE-0006 fix: skill_edge no longer queried directly by intelligence-svc).
const MOCK_GRAPH: SkillGraphCache = {
  watermark: 'test-watermark',
  loaded_at: 0,
  version: { id: 'test-version', version: '1.0', published_at: '2026-01-01T00:00:00Z' },
  nodes: new Map([
    [SKILL_A, { id: SKILL_A, slug: 'skill-a', name: 'Skill A', parent_id: null }],
    [SKILL_B, { id: SKILL_B, slug: 'skill-b', name: 'Skill B', parent_id: null }],
    [SKILL_C, { id: SKILL_C, slug: 'skill-c', name: 'Skill C', parent_id: null }],
  ]),
  adjacency: new Map([
    [SKILL_A, [SKILL_B]], // SKILL_A has prereq SKILL_B
    [SKILL_B, []],
    [SKILL_C, []],
  ]),
};

function buildItemVersionsStub(withMisconception = true): QueryStub {
  return {
    data: [
      {
        item_id: ITEM_2,
        distractor_rationale: withMisconception
          ? { B: { misconception_id: MISC_1 } }
          : null,
      },
    ],
    error: null,
  };
}

const EMPTY_OK: QueryStub = { data: null, error: null };
const EMPTY_LIST: QueryStub = { data: [], error: null };

// ─── Helper-tier tests ──────────────────────────────────────────────────────

describe('intelligence-helpers — pure functions', () => {
  it('canonicalize sorts keys recursively', () => {
    const a = canonicalize({ z: 1, a: { y: 2, x: 3 } });
    const b = canonicalize({ a: { x: 3, y: 2 }, z: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"x":3,"y":2},"z":1}');
  });

  it('walkPrereqsDepth1 returns sorted union of touched + depth-1 prereqs', () => {
    const adj = new Map<string, string[]>([
      [SKILL_A, [SKILL_B]],
      [SKILL_C, [SKILL_B]],
    ]);
    const out = walkPrereqsDepth1([SKILL_A, SKILL_C], adj);
    expect(out).toEqual([SKILL_A, SKILL_B, SKILL_C].sort());
  });

  it('walkPrereqsDepth1 does NOT recurse beyond depth 1', () => {
    const adj = new Map<string, string[]>([
      [SKILL_A, [SKILL_B]],
      [SKILL_B, [SKILL_C]], // depth-2 — must NOT appear
    ]);
    const out = walkPrereqsDepth1([SKILL_A], adj);
    expect(out).toContain(SKILL_A);
    expect(out).toContain(SKILL_B);
    expect(out).not.toContain(SKILL_C);
  });

  it('blendBehaviour returns pure default when data_points < 5', () => {
    const computed = yearLevelDefaults('Y3');
    const defaults = yearLevelDefaults('Y3');
    const out = blendBehaviour(computed, defaults, 0);
    expect(out).toEqual(defaults);
  });

  it('blendBehaviour returns pure computed when data_points ≥ 15', () => {
    const computed = { ...yearLevelDefaults('Y5'), avg_guess_rate: 0.42 };
    const defaults = yearLevelDefaults('Y5');
    const out = blendBehaviour(computed, defaults, 20);
    expect(out.avg_guess_rate).toBeCloseTo(0.42);
  });

  it('blendBehaviour blends in [5, 15) range', () => {
    const computed = { ...yearLevelDefaults('Y5'), avg_guess_rate: 0.5 };
    const defaults = { ...yearLevelDefaults('Y5'), avg_guess_rate: 0.1 };
    const out = blendBehaviour(computed, defaults, 10);
    // w = 10/15 ≈ 0.667 → 0.667*0.5 + 0.333*0.1 ≈ 0.367
    expect(out.avg_guess_rate).toBeCloseTo(0.667 * 0.5 + 0.333 * 0.1, 2);
  });

  it('guessProbability higher for very-fast incorrect with 0 changes', () => {
    const fast = guessProbability({
      time_to_answer_ms: 500,
      expected_time_ms: 30000,
      is_correct: false,
      answer_changes: 0,
    });
    const slow = guessProbability({
      time_to_answer_ms: 25000,
      expected_time_ms: 30000,
      is_correct: false,
      answer_changes: 2,
    });
    expect(fast).toBeGreaterThan(slow);
  });

  it('yearLevelDefaults: Y3 → 15min, Y5 → 20min, Y8 → 30min, Y11 → 40min', () => {
    expect(yearLevelDefaults('Y3').avg_fatigue_onset_minutes).toBe(15);
    expect(yearLevelDefaults('Y5').avg_fatigue_onset_minutes).toBe(20);
    expect(yearLevelDefaults('Y8').avg_fatigue_onset_minutes).toBe(30);
    expect(yearLevelDefaults('Y11').avg_fatigue_onset_minutes).toBe(40);
  });

  it('yearLevelDefaults: null falls back to Y4–6 band', () => {
    expect(yearLevelDefaults(null).avg_fatigue_onset_minutes).toBe(20);
  });
});

// ─── Handler tests ──────────────────────────────────────────────────────────

function baseStubs(): Stubs {
  return {
    intelligence_audit_log: [
      EMPTY_LIST,             // dedup check
      EMPTY_OK,                // L1 audit insert
      EMPTY_OK,                // L2 audit insert
      EMPTY_OK,                // L3a audit insert
      EMPTY_OK,                // summary audit insert
    ],
    session_record: buildSessionStub(),
    user_profile: buildProfileStub(),
    session_response: buildResponses(),
    item: buildItemsStub(),
    skill_mastery: [EMPTY_LIST, EMPTY_OK], // existing read + upsert
    learning_velocity: EMPTY_OK,
    pipeline_event: [EMPTY_OK, EMPTY_OK, EMPTY_OK, EMPTY_OK, EMPTY_OK, EMPTY_OK], // 3 inserts + 3 updates
    learning_event: EMPTY_OK,
    behaviour_profile: [EMPTY_OK, EMPTY_OK], // read maybeSingle + upsert
    // skill_edge intentionally absent — ISSUE-0006 fix: L3a reads via
    // skillGraph (empty adjacency when not provided) not direct DB query.
    item_version: buildItemVersionsStub(),
    student_misconception: EMPTY_OK,
  };
}

describe('intelligence-svc — processSession dedup (Q-20.7)', () => {
  it('audit-log dedup short-circuits re-processing (Q-20.7)', async () => {
    const stubs = baseStubs();
    stubs['intelligence_audit_log'] = { data: [{ id: 'prior-audit' }], error: null };
    const client = buildClient(stubs);
    const result = await processSession({
      client,
      sessionId: SESSION_ID,
      traceId: 'trace-1',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.status).toBe('already_processed');
    expect(result.data.processing_time_ms).toBeNull();
    // No skill_mastery upsert should have happened.
    const upserts = client.calls.filter(c => c.op === 'upsert' && c.table === 'skill_mastery');
    expect(upserts).toHaveLength(0);
  });
});

describe('intelligence-svc — processSession L1 Foundation', () => {
  it('writes skill_mastery upsert per touched skill', async () => {
    const client = buildClient(baseStubs());
    const result = await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.status).toBe('processed');
    const upserts = client.calls.filter(c => c.op === 'upsert' && c.table === 'skill_mastery');
    expect(upserts).toHaveLength(1);
    const args = upserts[0]!.args as Array<{ skill_id: string; mastery_level: number }>;
    // touched skills: SKILL_A (items 1+3), SKILL_B (item 2), SKILL_C (item 3) — 3 distinct
    expect(args).toHaveLength(3);
    expect(args.map(a => a.skill_id).sort()).toEqual([SKILL_A, SKILL_B, SKILL_C].sort());
  });

  it('writes learning_velocity upsert with 14-day window', async () => {
    const client = buildClient(baseStubs());
    await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    const vel = client.calls.find(c => c.op === 'upsert' && c.table === 'learning_velocity');
    expect(vel).toBeDefined();
    const args = vel!.args as Array<{ window_days: number }>;
    expect(args.every(r => r.window_days === 14)).toBe(true);
  });

  it('mastery_level is in [0, 1]', async () => {
    const stubs = baseStubs();
    stubs['session_response'] = buildResponses({ count: 3, allCorrect: true });
    const client = buildClient(stubs);
    const result = await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    expect(result.ok).toBe(true);
    const upsert = client.calls.find(c => c.op === 'upsert' && c.table === 'skill_mastery')!;
    const args = upsert.args as Array<{ mastery_level: number }>;
    for (const row of args) {
      expect(row.mastery_level).toBeGreaterThanOrEqual(0);
      expect(row.mastery_level).toBeLessThanOrEqual(1);
    }
  });

  it('streak_current increments on all-correct sequence', async () => {
    const stubs = baseStubs();
    stubs['session_response'] = buildResponses({ count: 3, allCorrect: true });
    const client = buildClient(stubs);
    await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    const upsert = client.calls.find(c => c.op === 'upsert' && c.table === 'skill_mastery')!;
    const args = upsert.args as Array<{ skill_id: string; streak_current: number }>;
    // SKILL_A appears in items 1 + 3 → streak 2
    const a = args.find(x => x.skill_id === SKILL_A)!;
    expect(a.streak_current).toBe(2);
  });
});

describe('intelligence-svc — processSession L2 Behaviour', () => {
  it('inserts one learning_event row per response with event_type=behaviour_signal', async () => {
    const client = buildClient(baseStubs());
    await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    const ev = client.calls.find(c => c.op === 'insert' && c.table === 'learning_event');
    expect(ev).toBeDefined();
    const rows = ev!.args as Array<{ event_type: string; metadata: { guess_probability: number } }>;
    expect(rows).toHaveLength(3);
    expect(rows.every(r => r.event_type === 'behaviour_signal')).toBe(true);
    expect(rows.every(r => typeof r.metadata.guess_probability === 'number')).toBe(true);
  });

  it('upserts behaviour_profile with year-level-aware defaults blended', async () => {
    const client = buildClient(baseStubs());
    await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    const up = client.calls.find(c => c.op === 'upsert' && c.table === 'behaviour_profile')!;
    const row = up.args as { avg_fatigue_onset_minutes: number; data_points: number };
    // Y5 default + 1 session = data_points=1 → pure default; Y5 → 20min
    expect(row.avg_fatigue_onset_minutes).toBe(20);
    expect(row.data_points).toBe(1);
  });

  it('Y3 student gets 15-minute fatigue default', async () => {
    const stubs = baseStubs();
    stubs['user_profile'] = buildProfileStub('Y3');
    const client = buildClient(stubs);
    await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    const up = client.calls.find(c => c.op === 'upsert' && c.table === 'behaviour_profile')!;
    const row = up.args as { avg_fatigue_onset_minutes: number };
    expect(row.avg_fatigue_onset_minutes).toBe(15);
  });

  it('Y8 student gets 30-minute fatigue default', async () => {
    const stubs = baseStubs();
    stubs['user_profile'] = buildProfileStub('Y8');
    const client = buildClient(stubs);
    await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    const up = client.calls.find(c => c.op === 'upsert' && c.table === 'behaviour_profile')!;
    const row = up.args as { avg_fatigue_onset_minutes: number };
    expect(row.avg_fatigue_onset_minutes).toBe(30);
  });

  it('processing_time_ms is non-null + non-negative on full run', async () => {
    const client = buildClient(baseStubs());
    const result = await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.processing_time_ms).not.toBeNull();
    expect(result.data.processing_time_ms!).toBeGreaterThanOrEqual(0);
  });
});

describe('intelligence-svc — processSession L3a Causal-scoped', () => {
  it('walks depth-1 prereqs over touched skills', async () => {
    const client = buildClient(baseStubs());
    const result = await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    if (!result.ok) throw new Error('expected ok');
    // touched: A, B, C → walk yields A, B (prereq of A), C → 3 unique
    expect(result.data.layers.causal!.prereqs_walked).toBe(3);
  });

  it('upserts student_misconception when distractor_rationale matches', async () => {
    const client = buildClient(baseStubs());
    await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    const up = client.calls.find(c => c.op === 'upsert' && c.table === 'student_misconception');
    expect(up).toBeDefined();
    const args = up!.args as Array<{ misconception_id: string; status: string }>;
    expect(args.length).toBeGreaterThan(0);
    expect(args[0]!.misconception_id).toBe(MISC_1);
    expect(args[0]!.status).toBe('suspected');
  });

  it('skips misconception upsert when distractor_rationale absent', async () => {
    const stubs = baseStubs();
    stubs['item_version'] = buildItemVersionsStub(false);
    const client = buildClient(stubs);
    const result = await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.layers.causal!.misconceptions_upserted).toBe(0);
    const up = client.calls.find(c => c.op === 'upsert' && c.table === 'student_misconception');
    expect(up).toBeUndefined();
  });
});

describe('intelligence-svc — processSession audit log', () => {
  it('writes summary audit-log row with event_type=session.processed + algorithm_version', async () => {
    const client = buildClient(baseStubs());
    await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    const inserts = client.calls.filter(c => c.op === 'insert' && c.table === 'intelligence_audit_log');
    // L1 + L2 + L3a + summary = 4 audit rows
    expect(inserts.length).toBe(4);
    const summary = inserts[inserts.length - 1]!.args as { event_type: string; algorithm_version: string; trace_id: string };
    expect(summary.event_type).toBe('session.processed');
    expect(summary.algorithm_version).toBe(ALGORITHM_VERSION);
    expect(summary.trace_id).toBe('trace-1');
  });

  it('writes pipeline_event rows for sync steps 1, 2, 3 (Q-20.8)', async () => {
    const client = buildClient(baseStubs());
    await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    const inserts = client.calls.filter(c => c.op === 'insert' && c.table === 'pipeline_event');
    expect(inserts.length).toBe(3);
    const steps = inserts.map(i => (i.args as { step: number }).step).sort();
    expect(steps).toEqual([1, 2, 3]);
  });
});

describe('intelligence-svc — processSession replay determinism (DEV_PLAN exit criterion)', () => {
  it('replay determinism: byte-identical UPSERT payloads across two runs (DEV_PLAN exit criterion)', async () => {
    // Run 1
    const c1 = buildClient(baseStubs());
    const r1 = await processSession({
      client: c1,
      sessionId: SESSION_ID,
      traceId: 'trace-1',
      effects: { now: () => '2026-05-09T10:00:00.000Z', uuid: () => 'fixed-uuid', perfNow: () => 0 },
    });
    if (!r1.ok) throw new Error('expected ok');

    // Run 2 (fresh stubs, identical fixture)
    const c2 = buildClient(baseStubs());
    const r2 = await processSession({
      client: c2,
      sessionId: SESSION_ID,
      traceId: 'trace-1',
      effects: { now: () => '2026-05-09T10:00:00.000Z', uuid: () => 'fixed-uuid', perfNow: () => 0 },
    });
    if (!r2.ok) throw new Error('expected ok');

    // Compare every UPSERT/INSERT payload byte-for-byte via canonicalize.
    const keep = (c: typeof c1) =>
      c.calls
        .filter(x => x.op === 'upsert' || x.op === 'insert')
        .map(x => ({ table: x.table, op: x.op, args: x.args }));
    const a = canonicalize(keep(c1));
    const b = canonicalize(keep(c2));
    expect(a).toEqual(b);
  });
});

describe('intelligence-svc — processSession error paths', () => {
  it('returns 404 when session does not exist', async () => {
    const stubs = baseStubs();
    stubs['session_record'] = { data: null, error: null };
    const client = buildClient(stubs);
    const result = await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.status).toBe(404);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('returns 409 when session not in submitted status', async () => {
    const stubs = baseStubs();
    stubs['session_record'] = buildSessionStub({ status: 'active' });
    const client = buildClient(stubs);
    const result = await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    if (result.ok) throw new Error('expected err');
    expect(result.status).toBe(409);
    expect(result.code).toBe('SESSION_CONFLICT');
  });

  it('returns 500 when engine_state_snapshot is malformed', async () => {
    const stubs = baseStubs();
    stubs['session_record'] = buildSessionStub({ engine_state: { not_an_engine_state: true } });
    const client = buildClient(stubs);
    const result = await processSession({ client, sessionId: SESSION_ID, traceId: 'trace-1' });
    if (result.ok) throw new Error('expected err');
    expect(result.status).toBe(500);
    expect(result.code).toBe('INTERNAL_ERROR');
  });
});

// ─── L3b processCausalFull tests ─────────────────────────────────────────────

function buildCausalFullStubs(
  masteryData: Array<{ skill_id: string; mastery_level: number }> = [],
): Stubs {
  return {
    intelligence_audit_log: [EMPTY_LIST, EMPTY_OK], // dedup check + audit insert
    session_record: buildSessionStub(),
    session_response: buildResponses(),
    item: buildItemsStub(),
    skill_mastery: { data: masteryData, error: null },
    pipeline_event: [EMPTY_OK, EMPTY_OK], // step-4 insert + step-4 update
  };
}

describe('intelligence-svc — processCausalFull L3b', () => {
  it('already_processed on dedup hit', async () => {
    const stubs = buildCausalFullStubs();
    stubs['intelligence_audit_log'] = { data: [{ id: 'prior-l3b' }], error: null };
    const client = buildClient(stubs);
    const result = await processCausalFull({
      client, sessionId: SESSION_ID, traceId: 'trace-l3b', skillGraph: null,
    });
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.status).toBe('already_processed');
    expect(result.data.causal_full).toBeNull();
  });

  it('unmastered prereq identified as root cause', async () => {
    const client = buildClient(buildCausalFullStubs());
    const result = await processCausalFull({
      client, sessionId: SESSION_ID, traceId: 'trace-l3b', skillGraph: MOCK_GRAPH,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const cf = result.data.causal_full!;
    // SKILL_A has prereq SKILL_B (unmastered) → SKILL_B is root cause
    // SKILL_B and SKILL_C have no prereqs → themselves are root causes
    expect(cf.root_causes).toContain(SKILL_B);
    expect(cf.root_causes).toContain(SKILL_C);
    // determinism: output sorted ASC
    expect(cf.root_causes).toEqual([...cf.root_causes].sort());
  });

  it('mastered prereq unlocks downstream skill', async () => {
    // SKILL_B mastered → SKILL_A's only prereq is met → SKILL_A unlocked
    const client = buildClient(
      buildCausalFullStubs([{ skill_id: SKILL_B, mastery_level: 0.9 }]),
    );
    const result = await processCausalFull({
      client, sessionId: SESSION_ID, traceId: 'trace-l3b', skillGraph: MOCK_GRAPH,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const cf = result.data.causal_full!;
    expect(cf.unlocked_skills).toContain(SKILL_A);
    expect(cf.unlocked_skills).toEqual([...cf.unlocked_skills].sort());
  });

  it('reports correct skills_traversed count', async () => {
    const client = buildClient(buildCausalFullStubs());
    const result = await processCausalFull({
      client, sessionId: SESSION_ID, traceId: 'trace-l3b', skillGraph: MOCK_GRAPH,
    });
    if (!result.ok) throw new Error('expected ok');
    // 3 responses → items 1 (SKILL_A), 2 (SKILL_B), 3 (SKILL_A + SKILL_C) → 3 distinct
    expect(result.data.causal_full!.skills_traversed).toBe(3);
  });

  it('writes L3b audit log row with event_type=L3b.causal.full', async () => {
    const client = buildClient(buildCausalFullStubs());
    await processCausalFull({
      client, sessionId: SESSION_ID, traceId: 'trace-l3b', skillGraph: MOCK_GRAPH,
    });
    const inserts = client.calls.filter(c => c.op === 'insert' && c.table === 'intelligence_audit_log');
    expect(inserts).toHaveLength(1);
    const row = inserts[0]!.args as { event_type: string; algorithm_version: string };
    expect(row.event_type).toBe('L3b.causal.full');
    expect(row.algorithm_version).toBe(ALGORITHM_VERSION);
  });

  it('returns 404 when session not found', async () => {
    const stubs = buildCausalFullStubs();
    stubs['session_record'] = { data: null, error: null };
    const client = buildClient(stubs);
    const result = await processCausalFull({
      client, sessionId: SESSION_ID, traceId: 'trace-l3b', skillGraph: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.status).toBe(404);
    expect(result.code).toBe('NOT_FOUND');
  });
});

// ─── L5 processPredictiveRefresh tests ──────────────────────────────────────

const PATHWAY_SLUG = 'naplan-y5-numeracy';
const PATHWAY_ID   = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FRAMEWORK_CONFIG_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const STRAND_NUMBER = '00000001-0000-4000-8000-000000000001'; // number-algebra
const STRAND_MEASURE = '00000001-0000-4000-8000-000000000002'; // measurement-space

// Fixed "now" for L5 tests: 2026-05-19T10:00:00Z
const L5_NOW = '2026-05-19T10:00:00.000Z';
// earliest attempt date 30 days ago → satisfies ≥7-day history guard
const OLD_ATTEMPT = '2026-04-19T10:00:00.000Z';
// recent attempt date 1 day ago → fails ≥7-day history guard
const RECENT_ATTEMPT = '2026-05-18T10:00:00.000Z';

const L5_SKILLS_STUB: QueryStub = {
  data: [
    { id: SKILL_A, slug: 'place-value',   parent_id: STRAND_NUMBER,  pathway_tags: ['naplan', 'icas'] },
    { id: SKILL_B, slug: 'fractions',     parent_id: STRAND_NUMBER,  pathway_tags: ['naplan', 'icas'] },
    { id: SKILL_C, slug: 'geometry',      parent_id: STRAND_MEASURE, pathway_tags: ['naplan', 'icas'] },
  ],
  error: null,
};

const L5_STRANDS_STUB: QueryStub = {
  data: [
    { id: STRAND_NUMBER,  slug: 'number-algebra' },
    { id: STRAND_MEASURE, slug: 'measurement-space' },
  ],
  error: null,
};

function buildL5Stubs(opts: {
  masteryData?: Array<{ skill_id: string; mastery_level: number; total_attempts: number; last_attempted_at: string | null }>;
  velocityData?: Array<{ skill_id: string; velocity: number }>;
  auditDedupHit?: boolean;
} = {}): Stubs {
  const {
    masteryData = [
      { skill_id: SKILL_A, mastery_level: 0.5, total_attempts: 4, last_attempted_at: OLD_ATTEMPT },
      { skill_id: SKILL_B, mastery_level: 0.7, total_attempts: 5, last_attempted_at: OLD_ATTEMPT },
      { skill_id: SKILL_C, mastery_level: 0.3, total_attempts: 3, last_attempted_at: OLD_ATTEMPT },
    ],
    velocityData = [
      { skill_id: SKILL_A, velocity: 0.002 },
      { skill_id: SKILL_B, velocity: 0.001 },
      { skill_id: SKILL_C, velocity: 0.003 },
    ],
    auditDedupHit = false,
  } = opts;

  const dedupStub: QueryStub = auditDedupHit
    ? { data: [{ id: 'prior-l5' }], error: null }
    : EMPTY_LIST;

  return {
    intelligence_audit_log: [dedupStub, EMPTY_OK], // dedup check + audit insert
    user_profile: { data: { id: STUDENT_ID, tenant_id: TENANT_ID, year_level: 'Y5' }, error: null },
    pathway: { data: { id: PATHWAY_ID, slug: PATHWAY_SLUG, framework_config_id: FRAMEWORK_CONFIG_ID }, error: null },
    framework_config: {
      data: {
        id: FRAMEWORK_CONFIG_ID,
        blueprint: { strands: [{ slug: 'number-algebra', weight: 0.6 }, { slug: 'measurement-space', weight: 0.4 }] },
        scoring_rules: {},
      },
      error: null,
    },
    skill_node: [L5_SKILLS_STUB, L5_STRANDS_STUB], // first: skills; second: strands
    skill_mastery: { data: masteryData, error: null },
    learning_velocity: { data: velocityData, error: null },
    cohort_metric_cache: EMPTY_OK, // upsert
  };
}

describe('intelligence-svc — processPredictiveRefresh L5', () => {
  it('prediction returns for student with 10+ sessions', async () => {
    const client = buildClient(buildL5Stubs());
    const result = await processPredictiveRefresh(
      { student_id: STUDENT_ID, pathway_slug: PATHWAY_SLUG, tenant_id: TENANT_ID, trace_id: 'trace-l5' },
      client,
      { now: () => L5_NOW },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const data = result.data as { status: string; current_readiness_score: number };
    expect(data.status).not.toBe('insufficient_data');
    expect(typeof data.current_readiness_score).toBe('number');
    expect(data.current_readiness_score).toBeGreaterThanOrEqual(0);
    expect(data.current_readiness_score).toBeLessThanOrEqual(1);
  });

  it('insufficient_data returned below data threshold', async () => {
    const client = buildClient(buildL5Stubs({
      masteryData: [
        { skill_id: SKILL_A, mastery_level: 0.5, total_attempts: 1, last_attempted_at: RECENT_ATTEMPT },
        { skill_id: SKILL_B, mastery_level: 0.7, total_attempts: 1, last_attempted_at: RECENT_ATTEMPT },
        { skill_id: SKILL_C, mastery_level: 0.3, total_attempts: 1, last_attempted_at: RECENT_ATTEMPT },
      ],
    }));
    const result = await processPredictiveRefresh(
      { student_id: STUDENT_ID, pathway_slug: PATHWAY_SLUG, tenant_id: TENANT_ID, trace_id: 'trace-l5' },
      client,
      { now: () => L5_NOW },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect((result.data as { status: string }).status).toBe('insufficient_data');
  });

  it('projected_readiness is null when exam_date omitted', async () => {
    const client = buildClient(buildL5Stubs());
    const result = await processPredictiveRefresh(
      { student_id: STUDENT_ID, pathway_slug: PATHWAY_SLUG, exam_date: null, tenant_id: TENANT_ID, trace_id: 'trace-l5' },
      client,
      { now: () => L5_NOW },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const data = result.data as { projected_readiness: unknown; on_track: unknown };
    expect(data.projected_readiness).toBeNull();
    expect(data.on_track).toBeNull();
  });

  it('projected_readiness computed when exam_date provided', async () => {
    const client = buildClient(buildL5Stubs());
    const result = await processPredictiveRefresh(
      {
        student_id: STUDENT_ID,
        pathway_slug: PATHWAY_SLUG,
        exam_date: '2026-10-15',
        tenant_id: TENANT_ID,
        trace_id: 'trace-l5',
      },
      client,
      { now: () => L5_NOW },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const data = result.data as { projected_readiness: unknown; on_track: unknown };
    expect(typeof data.projected_readiness).toBe('number');
    expect((data.projected_readiness as number)).toBeGreaterThanOrEqual(0);
    expect((data.projected_readiness as number)).toBeLessThanOrEqual(1);
    expect(typeof data.on_track).toBe('boolean');
  });

  it('idempotency: second call returns already_processed', async () => {
    const client = buildClient(buildL5Stubs({ auditDedupHit: true }));
    const result = await processPredictiveRefresh(
      { student_id: STUDENT_ID, pathway_slug: PATHWAY_SLUG, tenant_id: TENANT_ID, trace_id: 'trace-l5' },
      client,
      { now: () => L5_NOW },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect((result.data as { already_processed?: boolean }).already_processed).toBe(true);
    // No cohort_metric_cache upsert should happen on dedup short-circuit
    const upserts = client.calls.filter(c => c.op === 'upsert' && c.table === 'cohort_metric_cache');
    expect(upserts).toHaveLength(0);
  });

  it('GET /intelligence/predictions returns stale envelope when cache expired', async () => {
    const staleComputedAt = '2026-05-19T08:00:00.000Z'; // 2 hours before L5_NOW
    const client = buildClient({
      cohort_metric_cache: {
        data: [{ value: { status: 'fresh', current_readiness_score: 0.65 }, computed_at: staleComputedAt }],
        error: null,
      },
    });
    const result = await getPredictions(STUDENT_ID, PATHWAY_SLUG, client, null, { now: () => L5_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.status).toBe('stale');
    expect(result.data.stale_since).toBe(staleComputedAt);
    expect(result.data.payload).not.toBeNull();
  });

  it('GET /intelligence/predictions returns no_data when no cache row', async () => {
    const client = buildClient({
      cohort_metric_cache: { data: [], error: null },
    });
    const result = await getPredictions(STUDENT_ID, PATHWAY_SLUG, client, null, { now: () => L5_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.status).toBe('no_data');
    expect(result.data.stale_since).toBeNull();
    expect(result.data.payload).toBeNull();
  });

  it('GET denies cross-student read for non-teacher role', async () => {
    const client = buildClient({
      cohort_metric_cache: {
        data: [{ value: { status: 'fresh', current_readiness_score: 0.65 }, computed_at: L5_NOW }],
        error: null,
      },
    });
    const otherStudentCaller: PredictionsCallerContext = { userId: 'other-student-uuid', role: 'student' };
    const result = await getPredictions(STUDENT_ID, PATHWAY_SLUG, client, otherStudentCaller, { now: () => L5_NOW });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.status).toBe(403);
    expect(result.code).toBe('FORBIDDEN');
  });

  it('writes audit log with pre-compute input_snapshot and post-compute output + processing_time_ms', async () => {
    const client = buildClient(buildL5Stubs());
    await processPredictiveRefresh(
      { student_id: STUDENT_ID, pathway_slug: PATHWAY_SLUG, tenant_id: TENANT_ID, trace_id: 'trace-l5' },
      client,
      { now: () => L5_NOW, perfNow: () => 0 },
    );
    const inserts = client.calls.filter(c => c.op === 'insert' && c.table === 'intelligence_audit_log');
    expect(inserts).toHaveLength(1);
    const row = inserts[0]!.args as {
      event_type: string;
      algorithm_version: string;
      input_snapshot: { student_id: string; pathway_slug: string; skill_count: number; data_points: number };
      output: { current_readiness_score: number; gap_skill_count: number; processing_time_ms: number };
    };
    // Pre-compute: input fields derived from incoming data before algorithm runs.
    expect(row.event_type).toBe('L5.predictive.refresh');
    expect(row.algorithm_version).toBe(L5_ALGORITHM_VERSION);
    expect(row.input_snapshot.student_id).toBe(STUDENT_ID);
    expect(row.input_snapshot.pathway_slug).toBe(PATHWAY_SLUG);
    expect(typeof row.input_snapshot.skill_count).toBe('number');
    expect(typeof row.input_snapshot.data_points).toBe('number');
    // Post-compute: output fields produced by the algorithm.
    expect(typeof row.output.current_readiness_score).toBe('number');
    expect(typeof row.output.gap_skill_count).toBe('number');
    expect(typeof row.output.processing_time_ms).toBe('number');
  });
});
