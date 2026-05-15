/**
 * content-svc contract tests — Stage 18.
 *
 * Vitest in Node. The Edge Function `index.ts` (Deno.serve) is NOT exercised
 * here — its URL imports resolve only at Deno runtime. Instead we test the
 * pure handler functions (`handlers.ts`) and the skill-graph cache
 * (`_shared/skill-graph-cache.ts`) by passing in mock client / loader objects
 * that satisfy the same structural interfaces the production code expects.
 *
 * Coverage:
 *   - 10 endpoint contract tests (per DEV_PLAN exit criterion).
 *   - 5 cache tests (cold load, warm hit, watermark mismatch, TTL expiry,
 *     empty graph).
 *
 * Two of these are explicit DEV_PLAN exit criteria — they're labelled in the
 * test descriptions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  invalidateSkillGraph,
  getSkillGraph,
  type SkillGraphCacheLoader,
  type SkillNode,
  type SkillEdge,
} from '../../_shared/skill-graph-cache.ts';
import {
  listPathways,
  getPathwayBySlug,
  listAssessmentProfiles,
  getItem,
  selectItems,
  searchContent,
  getActiveSkillGraph,
  createItem,
  updateItem,
  createItemVersion,
  transitionItemLifecycle,
  listItemVersions,
  createStimulus,
  updateStimulus,
  type DbClient,
} from '../handlers.ts';
import {
  createMockSupabase,
  type MockResponses,
  type MockSupabaseExtras,
} from '../../_test-helpers/mock-supabase.ts';

// ─── Test constants ─────────────────────────────────────────────────────────
//
// Q-21.5: scaling-test request count. Constant rather than literal so the
// load-test floor is grep-able and tunable (Stage 26 may want to raise this).
const REQUEST_COUNT = 1000;

// Q-21.2: synthetic watermark-cost gate. Real <5ms gate at Stage 26 against a
// warm Postgres pool; here we use 50ms (10× margin) to absorb V8 warm-up,
// stub overhead, and incidental GC in Vitest CI runs.
const WATERMARK_COST_ITERATIONS = 100;
const WATERMARK_COST_MEAN_MS_GATE = 50;

// ─── Mock builder (Stage 19 Q-19.13: hoisted to _test-helpers/mock-supabase.ts) ──

function mockClient(
  responses: MockResponses,
): DbClient & { from: ReturnType<typeof vi.fn> } & MockSupabaseExtras {
  return createMockSupabase<DbClient>(responses);
}

afterEach(() => {
  invalidateSkillGraph();
});

// ─── /pathways ───────────────────────────────────────────────────────────────

describe('content-svc — GET /pathways', () => {
  it('returns PathwayDTO[] shape with entitlement field', async () => {
    const client = mockClient({
      pathway: {
        data: [
          {
            id: 'p1',
            slug: 'naplan-y5-numeracy',
            display_name: 'NAPLAN Y5 Numeracy',
            exam_family: 'naplan',
            program: 'NAPLAN',
            year_levels: [5],
            required_feature_key: 'naplan_y5',
          },
          {
            id: 'p2',
            slug: 'icas-math-y5',
            display_name: 'ICAS Maths Y5',
            exam_family: 'icas',
            program: 'ICAS',
            year_levels: [5],
            required_feature_key: 'icas_math_y5',
          },
        ],
        error: null,
      },
      feature_flag: {
        data: [
          { feature_key: 'naplan_y5', tenant_id: 't-1', enabled: true },
          { feature_key: 'icas_math_y5', tenant_id: null, enabled: false },
        ],
        error: null,
      },
    });
    const result = await listPathways(client, 't-1');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toHaveLength(2);
    expect(result.data[0]!.entitled).toBe(true);
    expect(result.data[0]!.locked_reason).toBeNull();
    expect(result.data[1]!.entitled).toBe(false);
    expect(result.data[1]!.locked_reason).toBe('tier_required');
  });

  it('treats DB error as INTERNAL_ERROR', async () => {
    const client = mockClient({
      pathway: { data: null, error: { message: 'connection lost' } },
    });
    const result = await listPathways(client, 't-1');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(500);
    expect(result.code).toBe('INTERNAL_ERROR');
  });
});

// ─── /pathways/{slug} ────────────────────────────────────────────────────────

describe('content-svc — GET /pathways/{slug}', () => {
  it('returns single PathwayDTO with entitled=true when feature flag enabled', async () => {
    const client = mockClient({
      pathway: {
        data: {
          id: 'p1',
          slug: 'naplan-y5-numeracy',
          display_name: 'NAPLAN Y5 Numeracy',
          exam_family: 'naplan',
          program: 'NAPLAN',
          year_levels: [5],
          required_feature_key: 'naplan_y5',
        },
        error: null,
      },
      feature_flag: {
        data: [{ feature_key: 'naplan_y5', tenant_id: 't-1', enabled: true }],
        error: null,
      },
    });
    const result = await getPathwayBySlug(client, 't-1', 'naplan-y5-numeracy');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.slug).toBe('naplan-y5-numeracy');
    expect(result.data.entitled).toBe(true);
  });

  it('returns 404 for unknown slug', async () => {
    const client = mockClient({
      pathway: { data: null, error: null },
    });
    const result = await getPathwayBySlug(client, 't-1', 'nope');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(404);
    expect(result.code).toBe('NOT_FOUND');
  });
});

// ─── /assessment-profiles ────────────────────────────────────────────────────

describe('content-svc — GET /assessment-profiles', () => {
  it('returns AssessmentProfileDTO[] filtered by exam_family', async () => {
    const client = mockClient({
      assessment_profile: {
        data: [
          {
            id: 'ap1',
            exam_family: 'naplan',
            program: 'NAPLAN',
            year_level: 5,
            duration_minutes: 45,
          },
        ],
        error: null,
      },
    });
    const result = await listAssessmentProfiles(client, { exam_family: 'naplan', year_level: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.exam_family).toBe('naplan');
    expect(result.data[0]!.duration_minutes).toBe(45);
  });
});

// ─── /content/items/{id} ─────────────────────────────────────────────────────

describe('content-svc — GET /content/items/{id}', () => {
  it('returns ItemDTO shape', async () => {
    const client = mockClient({
      v_item_current: {
        data: {
          id: 'item-1',
          current_version: 1,
          stem: { kind: 'plain_text', value: 'What is 2 + 2?' },
          stimulus_id: null,
          response_type: 'multiple_choice',
          response_config: { options: ['3', '4', '5', '6'] },
        },
        error: null,
      },
    });
    const result = await getItem(client, 'item-1');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.item_id).toBe('item-1');
    expect(result.data.response_type).toBe('multiple_choice');
  });

  it('returns 404 for unknown item ID', async () => {
    const client = mockClient({
      v_item_current: { data: null, error: null },
    });
    const result = await getItem(client, 'nope');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(404);
  });
});

// ─── /content/select ─────────────────────────────────────────────────────────

describe('content-svc — POST /content/select (DEV_PLAN exit criterion)', () => {
  it('linear pathway: returns blueprint-compliant EngineItem[] with deterministic lex order', async () => {
    // Blueprint: 1 section, 4 items targeting "place-value" skill, all-easy split.
    const client = mockClient({
      pathway: {
        data: {
          id: 'p-icas',
          slug: 'icas-math-y5',
          engine_type: 'linear',
          framework_config_id: 'fc-icas',
        },
        error: null,
      },
      framework_config: {
        data: {
          id: 'fc-icas',
          adaptive_rules: null,
          difficulty_bands: { easy: [0, 0.35], mid: [0.35, 0.7], hard: [0.7, 1.0] },
          blueprint: null,
        },
        error: null,
      },
      blueprint: {
        data: {
          sections: [
            {
              name: 'Number',
              target_items: 3,
              skill_slugs: ['place-value'],
              difficulty_split: { easy: 1.0, mid: 0, hard: 0 },
            },
          ],
        },
        error: null,
      },
      skill_node: {
        data: [{ id: 'sk-pv', slug: 'place-value' }],
        error: null,
      },
      v_item_current: {
        // Returned in non-sorted order; handler must sort lex by id ASC.
        data: [
          {
            id: 'item-c',
            current_version: 1,
            stem: { kind: 'plain_text', value: 'C' },
            response_type: 'mc',
            response_config: {},
            skill_ids: ['sk-pv'],
            difficulty: 0.2,
            discrimination: null,
          },
          {
            id: 'item-a',
            current_version: 1,
            stem: { kind: 'plain_text', value: 'A' },
            response_type: 'mc',
            response_config: {},
            skill_ids: ['sk-pv'],
            difficulty: 0.1,
            discrimination: null,
          },
          {
            id: 'item-b',
            current_version: 1,
            stem: { kind: 'plain_text', value: 'B' },
            response_type: 'mc',
            response_config: {},
            skill_ids: ['sk-pv'],
            difficulty: 0.15,
            discrimination: null,
          },
        ],
        error: null,
      },
    });
    const result = await selectItems(client, {
      pathway_id: 'p-icas',
      blueprint_id: 'bp-icas',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    // 3 items requested, all-easy split — sorted lex by item_id.
    expect(result.data).toHaveLength(3);
    expect(result.data.map(i => i.item_id)).toEqual(['item-a', 'item-b', 'item-c']);
    // EngineItem shape: skill_ids + difficulty present
    expect(result.data[0]!.skill_ids).toEqual(['sk-pv']);
    expect(typeof result.data[0]!.difficulty).toBe('number');
  });

  it('adaptive pathway: returns testlet-tagged items for all testlets', async () => {
    const client = mockClient({
      pathway: {
        data: {
          id: 'p-naplan',
          slug: 'naplan-y5-numeracy',
          engine_type: 'adaptive',
          framework_config_id: 'fc-naplan',
        },
        error: null,
      },
      framework_config: {
        data: {
          id: 'fc-naplan',
          adaptive_rules: {
            stages: ['s1', 's2'],
            start_testlet_id: 't1',
            testlets: {
              t1: { stage_id: 's1', time_limit_ms: 900_000, item_ids: ['it-1', 'it-2'] },
              t2_easy: { stage_id: 's2', time_limit_ms: 900_000, item_ids: ['it-3'] },
            },
          },
          difficulty_bands: null,
          blueprint: null,
        },
        error: null,
      },
      v_item_current: {
        data: [
          { id: 'it-1', current_version: 1, stem: {}, response_type: 'mc', response_config: {}, skill_ids: ['sk-1'], difficulty: 0.5, discrimination: null },
          { id: 'it-2', current_version: 1, stem: {}, response_type: 'mc', response_config: {}, skill_ids: ['sk-1'], difficulty: 0.5, discrimination: null },
          { id: 'it-3', current_version: 1, stem: {}, response_type: 'mc', response_config: {}, skill_ids: ['sk-2'], difficulty: 0.3, discrimination: null },
        ],
        error: null,
      },
    });
    const result = await selectItems(client, { pathway_id: 'p-naplan' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toHaveLength(3);
    // Stage-then-testlet-then-item-id ordering.
    expect(result.data.map(i => i.testlet_id)).toEqual(['t1', 't1', 't2_easy']);
    expect(result.data[0]!.stage_id).toBe('s1');
    expect(result.data[2]!.stage_id).toBe('s2');
  });

  it('exclude_recently_seen filters items from result', async () => {
    const client = mockClient({
      pathway: {
        data: {
          id: 'p-icas',
          slug: 'icas',
          engine_type: 'linear',
          framework_config_id: 'fc',
        },
        error: null,
      },
      framework_config: {
        data: {
          id: 'fc',
          adaptive_rules: null,
          difficulty_bands: null,
          blueprint: null,
        },
        error: null,
      },
      blueprint: {
        data: {
          sections: [
            {
              name: 'S',
              target_items: 2,
              skill_slugs: ['s'],
              difficulty_split: { easy: 1.0, mid: 0, hard: 0 },
            },
          ],
        },
        error: null,
      },
      skill_node: { data: [{ id: 'sk', slug: 's' }], error: null },
      v_item_current: {
        data: [
          { id: 'a', current_version: 1, stem: {}, response_type: 'mc', response_config: {}, skill_ids: ['sk'], difficulty: 0.1, discrimination: null },
          { id: 'b', current_version: 1, stem: {}, response_type: 'mc', response_config: {}, skill_ids: ['sk'], difficulty: 0.2, discrimination: null },
        ],
        error: null,
      },
    });
    const result = await selectItems(client, {
      pathway_id: 'p-icas',
      blueprint_id: 'bp',
      exclude_recently_seen: ['a'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.map(i => i.item_id)).toEqual(['b']);
  });
});

// ─── /content/search ─────────────────────────────────────────────────────────

describe('content-svc — GET /content/search (admin)', () => {
  it('returns paginated ItemDTO[]', async () => {
    const client = mockClient({
      v_item_current: {
        data: [
          {
            id: 'i1',
            current_version: 1,
            stem: { kind: 'plain_text', value: 'X' },
            response_type: 'mc',
            response_config: {},
            skill_ids: ['s'],
            difficulty: 0.5,
          },
        ],
        error: null,
      },
    });
    const result = await searchContent(client, { q: 'X', page: 1, page_size: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.items).toHaveLength(1);
    expect(result.data.page).toBe(1);
  });
});

// ─── /skill-graphs/active ────────────────────────────────────────────────────

describe('content-svc — GET /skill-graphs/active', () => {
  it('returns active graph version (cold load)', async () => {
    const loader: SkillGraphCacheLoader = {
      loadActiveVersion: async () => ({
        id: 'gv-1',
        version: 'v1',
        published_at: '2026-05-01T00:00:00.000Z',
      }),
      loadGraphData: async () => ({ nodes: [], edges: [] }),
    };
    const result = await getActiveSkillGraph(loader);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.id).toBe('gv-1');
  });

  it('returns 404 when no published graph exists', async () => {
    const loader: SkillGraphCacheLoader = {
      loadActiveVersion: async () => null,
      loadGraphData: async () => ({ nodes: [], edges: [] }),
    };
    const result = await getActiveSkillGraph(loader);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(404);
  });
});

// ─── Cache contract tests ───────────────────────────────────────────────────
//
// DEV_PLAN exit criteria:
//   - "Cache hit rate 100% after first load" — second call must NOT re-fetch
//     graph data (only the cheap watermark check happens).
//   - "Cache invalidates on graph publish" — when watermark changes, reload
//     fires.

describe('skill-graph-cache — contract', () => {
  function makeLoader(opts: {
    activeVersions?: Array<{ id: string; version: string; published_at: string } | null>;
    graphData?: Array<{ nodes: { id: string; slug: string; name: string; parent_id: string | null }[]; edges: { from_node_id: string; to_node_id: string }[] }>;
  }): {
    loader: SkillGraphCacheLoader;
    activeCalls: () => number;
    dataCalls: () => number;
  } {
    const versions = opts.activeVersions ?? [{ id: 'gv-1', version: 'v1', published_at: '2026-05-01T00:00:00.000Z' }];
    const data = opts.graphData ?? [{ nodes: [], edges: [] }];
    let activeIdx = 0;
    let dataIdx = 0;
    const activeFn = vi.fn(() => {
      const v = versions[Math.min(activeIdx, versions.length - 1)] ?? null;
      activeIdx += 1;
      return Promise.resolve(v);
    });
    const dataFn = vi.fn(() => {
      const d = data[Math.min(dataIdx, data.length - 1)] ?? { nodes: [], edges: [] };
      dataIdx += 1;
      return Promise.resolve(d);
    });
    return {
      loader: { loadActiveVersion: activeFn, loadGraphData: dataFn },
      activeCalls: () => activeFn.mock.calls.length,
      dataCalls: () => dataFn.mock.calls.length,
    };
  }

  it('cold load: fetches graph data on first call', async () => {
    const { loader, dataCalls } = makeLoader({});
    const cache = await getSkillGraph(loader);
    expect(cache).not.toBeNull();
    expect(dataCalls()).toBe(1);
  });

  it('warm hit (DEV_PLAN exit criterion: 100% hit rate after first load): no graph re-fetch on second call', async () => {
    const { loader, dataCalls, activeCalls } = makeLoader({});
    await getSkillGraph(loader);
    await getSkillGraph(loader);
    expect(dataCalls()).toBe(1); // graph loaded once
    expect(activeCalls()).toBe(2); // watermark checked twice (cheap)
  });

  it('watermark mismatch (DEV_PLAN exit criterion: invalidates on graph publish) triggers reload', async () => {
    const { loader, dataCalls } = makeLoader({
      activeVersions: [
        { id: 'gv-1', version: 'v1', published_at: '2026-05-01T00:00:00.000Z' },
        { id: 'gv-2', version: 'v2', published_at: '2026-05-06T00:00:00.000Z' }, // publish event
      ],
    });
    await getSkillGraph(loader); // cold
    const second = await getSkillGraph(loader); // watermark changed → reload
    expect(dataCalls()).toBe(2);
    expect(second?.watermark).toBe('gv-2');
  });

  it('TTL expiry (1h ceiling) triggers reload even when watermark unchanged', async () => {
    const { loader, dataCalls } = makeLoader({});
    await getSkillGraph(loader, 1_000_000_000_000); // load at t0
    await getSkillGraph(loader, 1_000_000_000_000 + 60 * 60 * 1000 + 1); // t0 + 1h + 1ms
    expect(dataCalls()).toBe(2);
  });

  it('returns null when no published graph exists', async () => {
    const { loader, dataCalls } = makeLoader({ activeVersions: [null] });
    const cache = await getSkillGraph(loader);
    expect(cache).toBeNull();
    expect(dataCalls()).toBe(0);
  });

  // ── Stage 21 hardening tests (ADR-0028) ───────────────────────────────────

  it('concurrent cold-start: two parallel calls share one DB load (Q-21.3)', async () => {
    // Slow loadGraphData so both callers race the in-flight sentinel.
    const versions = [{ id: 'gv-1', version: 'v1', published_at: '2026-05-01T00:00:00.000Z' }];
    const activeFn = vi.fn(() => Promise.resolve(versions[0]!));
    const dataFn = vi.fn(
      () => new Promise<{ nodes: SkillNode[]; edges: SkillEdge[] }>(resolve => {
        setTimeout(() => resolve({ nodes: [], edges: [] }), 10);
      }),
    );
    const loader: SkillGraphCacheLoader = {
      loadActiveVersion: activeFn,
      loadGraphData: dataFn,
    };

    // Fire both calls before the first await yields — both observe cache=null.
    const [a, b] = await Promise.all([getSkillGraph(loader), getSkillGraph(loader)]);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Both promises should resolve to the SAME cache instance — proves they
    // shared the in-flight load rather than each kicking off their own.
    expect(a).toBe(b);
    expect(dataFn.mock.calls.length).toBe(1); // single DB round-trip
  });

  it('stale-while-revalidate: loadGraphData failure retains prior cache + warns (Q-21.4)', async () => {
    // First call: succeeds, populates cache.
    // Second call: new watermark, loadGraphData throws → return prior cache + warn.
    let activeIdx = 0;
    let dataIdx = 0;
    const activeFn = vi.fn(() => {
      const v = activeIdx === 0
        ? { id: 'gv-1', version: 'v1', published_at: '2026-05-01T00:00:00.000Z' }
        : { id: 'gv-2', version: 'v2', published_at: '2026-05-09T00:00:00.000Z' };
      activeIdx += 1;
      return Promise.resolve(v);
    });
    const dataFn = vi.fn(() => {
      if (dataIdx === 0) {
        dataIdx += 1;
        return Promise.resolve({
          nodes: [{ id: 'skill-1', slug: 's1', name: 'S1', parent_id: null }],
          edges: [],
        });
      }
      dataIdx += 1;
      return Promise.reject(new Error('transient DB failure'));
    });
    const loader: SkillGraphCacheLoader = {
      loadActiveVersion: activeFn,
      loadGraphData: dataFn,
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const first = await getSkillGraph(loader, 1_000_000_000_000, 'trace-stage21-1');
    expect(first?.watermark).toBe('gv-1');

    // Second call: new watermark, loadGraphData rejects, prior cache preserved.
    const second = await getSkillGraph(loader, 1_000_000_000_000 + 1000, 'trace-stage21-2');
    expect(second?.watermark).toBe('gv-1'); // prior cache returned
    expect(second).toBe(first);              // exact same instance

    // console.warn fired once with the structured payload.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(warnSpy.mock.calls[0]![0] as string);
    expect(payload.event).toBe('skill_graph_stale_revalidate_failed');
    expect(payload.watermark_old).toBe('gv-1');
    expect(payload.watermark_new).toBe('gv-2');
    expect(payload.trace_id).toBe('trace-stage21-2');
    expect(payload.error).toBe('transient DB failure');

    warnSpy.mockRestore();
  });

  it('stale-while-revalidate does NOT swallow first-ever cold-load failure (Q-21.4 floor)', async () => {
    // Cold cache + loadGraphData rejects → must propagate.
    const loader: SkillGraphCacheLoader = {
      loadActiveVersion: async () => ({ id: 'gv-1', version: 'v1', published_at: '2026-05-01T00:00:00.000Z' }),
      loadGraphData: async () => { throw new Error('cold-start DB failure'); },
    };
    await expect(getSkillGraph(loader)).rejects.toThrow('cold-start DB failure');
  });

  it('in-flight sentinel cleared on rejection so subsequent calls retry (Q-21.3 floor)', async () => {
    // Reject once, then succeed. After the rejection, the next call must
    // observe loadingPromise=null (cleared in finally) and retry.
    let dataIdx = 0;
    const dataFn = vi.fn(() => {
      if (dataIdx === 0) {
        dataIdx += 1;
        return Promise.reject(new Error('first-attempt failure'));
      }
      dataIdx += 1;
      return Promise.resolve({ nodes: [], edges: [] });
    });
    const loader: SkillGraphCacheLoader = {
      loadActiveVersion: async () => ({ id: 'gv-1', version: 'v1', published_at: '2026-05-01T00:00:00.000Z' }),
      loadGraphData: dataFn,
    };
    await expect(getSkillGraph(loader)).rejects.toThrow('first-attempt failure');
    // Second call: sentinel cleared, fresh attempt succeeds.
    const second = await getSkillGraph(loader);
    expect(second).not.toBeNull();
    expect(dataFn.mock.calls.length).toBe(2);
  });

  it(`${REQUEST_COUNT} subsequent requests skip DB (DEV_PLAN exit criterion)`, async () => {
    const { loader, dataCalls, activeCalls } = makeLoader({});
    await getSkillGraph(loader); // cold load
    for (let i = 0; i < REQUEST_COUNT; i += 1) {
      await getSkillGraph(loader);
    }
    expect(dataCalls()).toBe(1);                     // graph loaded exactly once
    expect(activeCalls()).toBe(REQUEST_COUNT + 1);   // cheap watermark check per call
  });

  it(`watermark check cost < ${WATERMARK_COST_MEAN_MS_GATE}ms per iteration synthetic (DEV_PLAN exit criterion 10x margin)`, async () => {
    // Q-21.2: real <5ms gate is at Stage 26 load test against a warm Postgres
    // pool. Here we use 50ms mean (10x margin) over 100 iterations — pinned to
    // mean rather than max so a single GC pause doesn't fail the suite.
    const { loader } = makeLoader({});
    await getSkillGraph(loader); // warm the cache
    const start = performance.now();
    for (let i = 0; i < WATERMARK_COST_ITERATIONS; i += 1) {
      await getSkillGraph(loader);
    }
    const elapsedMs = performance.now() - start;
    const meanMs = elapsedMs / WATERMARK_COST_ITERATIONS;
    expect(meanMs).toBeLessThan(WATERMARK_COST_MEAN_MS_GATE);
  });
});

// ─── Content authoring — v1.1 Stage 1 ────────────────────────────────────────

const ITEM_ADMIN_STUB = {
  id: 'item-uuid-1',
  source_item_id: null,
  stimulus_id: null,
  response_type: 'multiple_choice',
  skill_ids: ['sk-1'],
  difficulty: 0.4,
  discrimination: null,
  expected_time_secs: null,
  year_levels: [5],
  exam_families: ['naplan'],
  programs: [],
  countries: [],
  curricula: [],
  bloom_level: null,
  lifecycle: 'draft',
  is_active: false,
  current_version: 1,
  created_at: '2026-05-14T00:00:00.000Z',
  updated_at: '2026-05-14T00:00:00.000Z',
};

const VERSION_STUB = {
  item_id: 'item-uuid-1',
  version: 2,
  stem: { kind: 'plain_text', value: 'What is 2 + 2?' },
  response_config: { options: ['3', '4', '5', '6'] },
  distractor_rationale: null,
  explanation: null,
  metadata: { author_id: 'author-uuid' },
  difficulty: 0.4,
  discrimination: null,
  is_current: true,
  supersedes: 1,
  created_at: '2026-05-14T00:00:00.000Z',
};

const STIMULUS_STUB = {
  id: 'stim-uuid-1',
  type: 'passage',
  content: { text: 'Once upon a time...' },
  source_attribution: null,
  year_levels: [5],
  exam_families: ['naplan'],
  is_active: true,
  created_at: '2026-05-14T00:00:00.000Z',
};

describe('content-svc — POST /content/items (createItem)', () => {
  it('returns ItemAdminDTO with lifecycle=draft on valid body', async () => {
    const client = mockClient({
      item: { data: ITEM_ADMIN_STUB, error: null },
    });
    const result = await createItem(client, {
      response_type: 'multiple_choice',
      skill_ids: ['sk-1'],
      difficulty: 0.4,
      year_levels: [5],
      exam_families: ['naplan'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.lifecycle).toBe('draft');
    expect(result.data.response_type).toBe('multiple_choice');
    expect(result.data.skill_ids).toEqual(['sk-1']);
  });

  it('returns 422 VALIDATION_ERROR when required fields missing', async () => {
    const client = mockClient({});
    const result = await createItem(client, {
      response_type: '',
      skill_ids: [],
      difficulty: 0.4,
      year_levels: [5],
      exam_families: ['naplan'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(422);
    expect(result.code).toBe('VALIDATION_ERROR');
  });
});

describe('content-svc — PATCH /content/items/{id} (updateItem)', () => {
  it('returns updated ItemAdminDTO when item exists', async () => {
    const updated = { ...ITEM_ADMIN_STUB, difficulty: 0.7 };
    const client = mockClient({
      item: [
        { data: { id: 'item-uuid-1' }, error: null },   // exists check
        { data: updated, error: null },                  // update + select
      ],
    });
    const result = await updateItem(client, 'item-uuid-1', { difficulty: 0.7 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.difficulty).toBe(0.7);
  });

  it('returns 404 when item does not exist', async () => {
    const client = mockClient({
      item: { data: null, error: null },
    });
    const result = await updateItem(client, 'missing-id', { difficulty: 0.5 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(404);
    expect(result.code).toBe('NOT_FOUND');
  });
});

describe('content-svc — POST /content/items/{id}/versions (createItemVersion)', () => {
  it('inserts version 2 with is_current=true and flips prior version (atomic writer contract)', async () => {
    const client = mockClient({
      item: [
        { data: { id: 'item-uuid-1' }, error: null },   // exists check
        { data: null, error: null },                     // sync current_version update
      ],
      item_version: [
        { data: [{ version: 1 }], error: null },         // MAX(version) query
        { data: null, error: null },                     // flip is_current=false
        { data: VERSION_STUB, error: null },             // insert new version
      ],
    });
    const result = await createItemVersion(
      client,
      'item-uuid-1',
      {
        stem: { kind: 'plain_text', value: 'What is 2 + 2?' },
        response_config: { options: ['3', '4', '5', '6'] },
        difficulty: 0.4,
        supersedes: 1,
      },
      'author-uuid',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.version).toBe(2);
    expect(result.data.is_current).toBe(true);
    expect(result.data.metadata).toMatchObject({ author_id: 'author-uuid' });
    // Verify flip was called (item_version queried 3 times: max, flip, insert)
    expect((client as ReturnType<typeof mockClient>).callCounts()['item_version']).toBe(3);
  });

  it('returns 422 VALIDATION_ERROR when stem is missing', async () => {
    const client = mockClient({});
    const result = await createItemVersion(
      client,
      'item-uuid-1',
      { stem: null as unknown as Record<string, unknown>, response_config: {}, difficulty: 0.4 },
      'author-uuid',
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(422);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when item does not exist', async () => {
    const client = mockClient({
      item: { data: null, error: null },
    });
    const result = await createItemVersion(
      client,
      'missing-id',
      { stem: {}, response_config: {}, difficulty: 0.4 },
      'author-uuid',
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(404);
  });
});

// ─── FSM transitions (spec §15.3 verbatim — 6 legal edges) ───────────────────

describe('content-svc — PATCH /content/items/{id}/lifecycle (transitionItemLifecycle)', () => {
  function makeLifecycleClient(currentLifecycle: string) {
    return mockClient({
      item: [
        { data: { id: 'item-uuid-1', lifecycle: currentLifecycle }, error: null },
        { data: null, error: null },  // update
      ],
    });
  }

  it('draft → review (valid edge)', async () => {
    const result = await transitionItemLifecycle(makeLifecycleClient('draft'), 'item-uuid-1', { lifecycle: 'review' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.lifecycle).toBe('review');
  });

  it('review → active (valid edge)', async () => {
    const result = await transitionItemLifecycle(makeLifecycleClient('review'), 'item-uuid-1', { lifecycle: 'active' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.lifecycle).toBe('active');
  });

  it('active → monitored (valid edge)', async () => {
    const result = await transitionItemLifecycle(makeLifecycleClient('active'), 'item-uuid-1', { lifecycle: 'monitored' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.lifecycle).toBe('monitored');
  });

  it('active → retired (valid edge)', async () => {
    const result = await transitionItemLifecycle(makeLifecycleClient('active'), 'item-uuid-1', { lifecycle: 'retired' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.lifecycle).toBe('retired');
  });

  it('monitored → active (valid edge)', async () => {
    const result = await transitionItemLifecycle(makeLifecycleClient('monitored'), 'item-uuid-1', { lifecycle: 'active' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.lifecycle).toBe('active');
  });

  it('monitored → retired (valid edge)', async () => {
    const result = await transitionItemLifecycle(makeLifecycleClient('monitored'), 'item-uuid-1', { lifecycle: 'retired' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.lifecycle).toBe('retired');
  });

  it('draft → retired returns 422 INVALID_TRANSITION (excluded by spec §15.3)', async () => {
    const client = mockClient({
      item: { data: { id: 'item-uuid-1', lifecycle: 'draft' }, error: null },
    });
    const result = await transitionItemLifecycle(client, 'item-uuid-1', { lifecycle: 'retired' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(422);
    expect(result.code).toBe('INVALID_TRANSITION');
  });

  it('same-state draft → draft returns 422 INVALID_TRANSITION', async () => {
    const client = mockClient({
      item: { data: { id: 'item-uuid-1', lifecycle: 'draft' }, error: null },
    });
    const result = await transitionItemLifecycle(client, 'item-uuid-1', { lifecycle: 'draft' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(422);
    expect(result.code).toBe('INVALID_TRANSITION');
  });

  it('review → monitored returns 422 INVALID_TRANSITION (no edge in spec §15.3)', async () => {
    const client = mockClient({
      item: { data: { id: 'item-uuid-1', lifecycle: 'review' }, error: null },
    });
    const result = await transitionItemLifecycle(client, 'item-uuid-1', { lifecycle: 'monitored' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(422);
    expect(result.code).toBe('INVALID_TRANSITION');
  });

  it('retired → draft returns 422 INVALID_TRANSITION (retired has no outgoing edges)', async () => {
    const client = mockClient({
      item: { data: { id: 'item-uuid-1', lifecycle: 'retired' }, error: null },
    });
    const result = await transitionItemLifecycle(client, 'item-uuid-1', { lifecycle: 'draft' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(422);
    expect(result.code).toBe('INVALID_TRANSITION');
  });

  it('returns 404 when item does not exist', async () => {
    const client = mockClient({
      item: { data: null, error: null },
    });
    const result = await transitionItemLifecycle(client, 'missing-id', { lifecycle: 'review' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(404);
  });
});

describe('content-svc — GET /content/items/{id}/versions (listItemVersions)', () => {
  it('returns ItemVersionDTO[] ordered by version desc', async () => {
    const client = mockClient({
      item: { data: { id: 'item-uuid-1' }, error: null },
      item_version: { data: [VERSION_STUB], error: null },
    });
    const result = await listItemVersions(client, 'item-uuid-1');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.version).toBe(2);
  });

  it('returns 404 when item does not exist', async () => {
    const client = mockClient({
      item: { data: null, error: null },
    });
    const result = await listItemVersions(client, 'missing-id');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(404);
  });
});

describe('content-svc — POST /content/stimuli (createStimulus)', () => {
  it('returns StimulusAdminDTO on valid body', async () => {
    const client = mockClient({
      stimulus: { data: STIMULUS_STUB, error: null },
    });
    const result = await createStimulus(client, {
      type: 'passage',
      content: { text: 'Once upon a time...' },
      year_levels: [5],
      exam_families: ['naplan'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.type).toBe('passage');
    expect(result.data.id).toBe('stim-uuid-1');
  });

  it('returns 422 VALIDATION_ERROR when type is missing', async () => {
    const client = mockClient({});
    const result = await createStimulus(client, {
      type: '',
      content: { text: 'test' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(422);
    expect(result.code).toBe('VALIDATION_ERROR');
  });
});

describe('content-svc — PATCH /content/stimuli/{id} (updateStimulus)', () => {
  it('returns updated StimulusAdminDTO when stimulus exists', async () => {
    const updated = { ...STIMULUS_STUB, is_active: false };
    const client = mockClient({
      stimulus: [
        { data: { id: 'stim-uuid-1' }, error: null },  // exists check
        { data: updated, error: null },                  // update + select
      ],
    });
    const result = await updateStimulus(client, 'stim-uuid-1', { is_active: false });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.is_active).toBe(false);
  });

  it('returns 404 when stimulus does not exist', async () => {
    const client = mockClient({
      stimulus: { data: null, error: null },
    });
    const result = await updateStimulus(client, 'missing-stim', { is_active: false });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(404);
    expect(result.code).toBe('NOT_FOUND');
  });
});

// ─── _shared/seeded-shuffle — v1.1-S2 (ADR-0036 §Decision 5) ─────────────────
// Unit tests for the deterministic Fisher-Yates helper. The replay-determinism
// contract (ADR-0022) requires same seed → same permutation across runs.

import { seededShuffle, hashSeed } from '../../_shared/seeded-shuffle.ts';

describe('_shared/seeded-shuffle — deterministic Fisher-Yates', () => {
  it('same seed → same permutation across runs (replay determinism)', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = seededShuffle(input, 'session-uuid-abc');
    const b = seededShuffle(input, 'session-uuid-abc');
    expect(a).toEqual(b);
  });

  it('different seed → different permutations (probabilistic but stable for these seeds)', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const a = seededShuffle(input, 'seed-one');
    const b = seededShuffle(input, 'seed-two');
    expect(a).not.toEqual(b);
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = input.slice();
    seededShuffle(input, 'seed-x');
    expect(input).toEqual(snapshot);
  });

  it('empty + single-element arrays pass through unchanged', () => {
    expect(seededShuffle([], 'seed-x')).toEqual([]);
    expect(seededShuffle(['only'], 'seed-x')).toEqual(['only']);
  });

  it('output length equals input length; all original elements present', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const shuffled = seededShuffle(input, 'session-perm-check');
    expect(shuffled).toHaveLength(input.length);
    expect(shuffled.slice().sort((a, b) => a - b)).toEqual(input);
  });

  it('hashSeed: identical strings → identical hashes; differing strings → differing hashes', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
    // Empty seed must still produce a valid (non-zero) hash — FNV offset basis.
    expect(hashSeed('')).toBe(0x811c9dc5);
  });
});

// ─── /content/select — composer branch (v1.1-S2 / ADR-0036) ──────────────────

describe('content-svc — POST /content/select (composer branch, v1.1-S2)', () => {
  // 30-item bank within the easy band, all matching the pathway scope; the
  // composer should shuffle + slice 10 of them, leaving room for a second
  // call to pick a different sample under a different seed.
  function makeEasyBank(count: number): Array<{
    id: string;
    current_version: number;
    stem: Record<string, unknown>;
    response_type: string;
    response_config: Record<string, unknown>;
    skill_ids: string[];
    difficulty: number;
    discrimination: number | null;
  }> {
    return Array.from({ length: count }, (_, i) => ({
      id: `easy-item-${i.toString().padStart(3, '0')}`,
      current_version: 1,
      stem: { kind: 'plain_text', value: `Easy Q${i}` },
      response_type: 'multiple_choice',
      response_config: {},
      skill_ids: ['sk-1'],
      difficulty: 0.1,
      discrimination: null,
    }));
  }

  const pathwayStub = {
    id: 'p-icas',
    slug: 'icas-math-y5',
    engine_type: 'linear',
    framework_config_id: 'fc-icas',
    exam_family: 'icas',
    year_levels: [5],
  };

  const fcStub = {
    id: 'fc-icas',
    difficulty_bands: { easy: [0, 0.35], mid: [0.35, 0.7], hard: [0.7, 1.0] },
  };

  it('assembles exam of item_count items when all bands sufficient', async () => {
    const easyBank = makeEasyBank(20);
    const midBank = Array.from({ length: 10 }, (_, i) => ({
      id: `mid-item-${i.toString().padStart(3, '0')}`,
      current_version: 1,
      stem: { value: `Mid Q${i}` },
      response_type: 'mc',
      response_config: {},
      skill_ids: ['sk-1'],
      difficulty: 0.5,
      discrimination: null,
    }));
    const hardBank = Array.from({ length: 5 }, (_, i) => ({
      id: `hard-item-${i.toString().padStart(3, '0')}`,
      current_version: 1,
      stem: { value: `Hard Q${i}` },
      response_type: 'mc',
      response_config: {},
      skill_ids: ['sk-1'],
      difficulty: 0.9,
      discrimination: null,
    }));
    const client = mockClient({
      pathway: { data: pathwayStub, error: null },
      framework_config: { data: fcStub, error: null },
      v_item_current: [
        { data: easyBank, error: null },  // easy band call
        { data: midBank, error: null },   // mid band call
        { data: hardBank, error: null },  // hard band call
      ],
    });
    const result = await selectItems(client, {
      pathway_id: 'p-icas',
      composer: {
        item_count: 15,
        difficulty_distribution: { easy: 5, mid: 7, hard: 3 },
        seed: 'session-abc',
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toHaveLength(15);
    // First 5 are from the easy bank, next 7 mid, last 3 hard (output ordering).
    expect(result.data.slice(0, 5).every(i => i.item_id.startsWith('easy-'))).toBe(true);
    expect(result.data.slice(5, 12).every(i => i.item_id.startsWith('mid-'))).toBe(true);
    expect(result.data.slice(12, 15).every(i => i.item_id.startsWith('hard-'))).toBe(true);
  });

  it('returns 422 INSUFFICIENT_ITEMS when a band has fewer candidates than requested', async () => {
    const client = mockClient({
      pathway: { data: pathwayStub, error: null },
      framework_config: { data: fcStub, error: null },
      // Easy band has only 2 items but composer requests 5.
      v_item_current: { data: makeEasyBank(2), error: null },
    });
    const result = await selectItems(client, {
      pathway_id: 'p-icas',
      composer: {
        item_count: 5,
        difficulty_distribution: { easy: 5, mid: 0, hard: 0 },
        seed: 'session-abc',
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.status).toBe(422);
    expect(result.code).toBe('INSUFFICIENT_ITEMS');
    expect(result.message).toMatch(/easy.*2.*candidate.*5 required/i);
  });

  it('deterministic across runs: same seed → identical item order (replay safety)', async () => {
    const bank = makeEasyBank(30);
    function run() {
      const client = mockClient({
        pathway: { data: pathwayStub, error: null },
        framework_config: { data: fcStub, error: null },
        v_item_current: { data: bank, error: null },
      });
      return selectItems(client, {
        pathway_id: 'p-icas',
        composer: {
          item_count: 10,
          difficulty_distribution: { easy: 10, mid: 0, hard: 0 },
          seed: 'stable-session-uuid',
        },
      });
    }
    const a = await run();
    const b = await run();
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(a.data.map(i => i.item_id)).toEqual(b.data.map(i => i.item_id));
  });

  it('different seeds → different selection order from the same bank', async () => {
    const bank = makeEasyBank(30);
    function run(seed: string) {
      const client = mockClient({
        pathway: { data: pathwayStub, error: null },
        framework_config: { data: fcStub, error: null },
        v_item_current: { data: bank, error: null },
      });
      return selectItems(client, {
        pathway_id: 'p-icas',
        composer: {
          item_count: 10,
          difficulty_distribution: { easy: 10, mid: 0, hard: 0 },
          seed,
        },
      });
    }
    const a = await run('seed-one');
    const b = await run('seed-two');
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(a.data.map(i => i.item_id)).not.toEqual(b.data.map(i => i.item_id));
  });

  it('composer branch bypasses adaptive/blueprint routing entirely (no blueprint table query)', async () => {
    // Provide pathway with engine_type='adaptive' to prove composer takes precedence.
    const adaptivePathway = { ...pathwayStub, engine_type: 'adaptive' };
    const client = mockClient({
      pathway: { data: adaptivePathway, error: null },
      framework_config: { data: fcStub, error: null },
      v_item_current: { data: makeEasyBank(10), error: null },
    });
    const result = await selectItems(client, {
      pathway_id: 'p-icas',
      composer: {
        item_count: 5,
        difficulty_distribution: { easy: 5, mid: 0, hard: 0 },
        seed: 'session-abc',
      },
    });
    expect(result.ok).toBe(true);
    // Verify the composer skipped the adaptive testlet path: no `blueprint` or
    // `skill_node` table lookups happened. (If composer had fallen through to
    // selectAdaptiveItems, it would have errored on missing adaptive_rules,
    // since fcStub omits them.)
    const calls = (client as ReturnType<typeof mockClient>).callCounts();
    expect(calls['blueprint']).toBeUndefined();
    expect(calls['skill_node']).toBeUndefined();
  });

  it('regression: existing blueprint-driven branch still works when composer is absent', async () => {
    // Re-asserts the legacy linear path is unchanged. Mirrors the existing
    // "linear pathway: returns blueprint-compliant EngineItem[]" test above
    // but with the new pathway SELECT (which now also returns exam_family +
    // year_levels — additive, ignored by the blueprint branch).
    const client = mockClient({
      pathway: {
        data: {
          id: 'p-icas',
          slug: 'icas-math-y5',
          engine_type: 'linear',
          framework_config_id: 'fc-icas',
          exam_family: 'icas',
          year_levels: [5],
        },
        error: null,
      },
      framework_config: {
        data: {
          id: 'fc-icas',
          adaptive_rules: null,
          difficulty_bands: { easy: [0, 0.35], mid: [0.35, 0.7], hard: [0.7, 1.0] },
          blueprint: null,
        },
        error: null,
      },
      blueprint: {
        data: {
          sections: [
            {
              name: 'Number',
              target_items: 1,
              skill_slugs: ['place-value'],
              difficulty_split: { easy: 1.0, mid: 0, hard: 0 },
            },
          ],
        },
        error: null,
      },
      skill_node: { data: [{ id: 'sk-pv', slug: 'place-value' }], error: null },
      v_item_current: {
        data: [
          { id: 'item-x', current_version: 1, stem: {}, response_type: 'mc', response_config: {}, skill_ids: ['sk-pv'], difficulty: 0.1, discrimination: null },
        ],
        error: null,
      },
    });
    const result = await selectItems(client, {
      pathway_id: 'p-icas',
      blueprint_id: 'bp-icas',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.item_id).toBe('item-x');
  });
});
