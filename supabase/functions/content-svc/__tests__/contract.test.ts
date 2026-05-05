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
} from '../../_shared/skill-graph-cache.ts';
import {
  listPathways,
  getPathwayBySlug,
  listAssessmentProfiles,
  getItem,
  selectItems,
  searchContent,
  getActiveSkillGraph,
  type DbClient,
} from '../handlers.ts';

// ─── Mock builders ───────────────────────────────────────────────────────────

interface QueryStub {
  data: unknown;
  error: { message: string } | null;
}

/**
 * Build a chainable mock that records calls. Every chain method (`.select`,
 * `.eq`, `.in`, …) returns another callable proxy; awaiting the proxy OR
 * invoking `.maybeSingle()`/`.single()` resolves to the configured stub.
 *
 * Proxy target is a function so the proxy itself is callable (so chained
 * method invocations like `.select('cols')` work).
 */
function mockBuilder(stub: QueryStub): unknown {
  const target = function () {} as unknown as object;
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: QueryStub) => unknown) => resolve(stub);
      }
      if (prop === 'maybeSingle' || prop === 'single') {
        return () => Promise.resolve(stub);
      }
      return new Proxy(target, handler);
    },
    apply() {
      return new Proxy(target, handler);
    },
  };
  return new Proxy(target, handler);
}

/**
 * Build a mock DbClient that returns canned results per (table, callIndex).
 * If only one result is given for a table, it's returned for every call.
 */
function mockClient(
  responses: Record<string, QueryStub | QueryStub[]>,
): DbClient & { from: ReturnType<typeof vi.fn> } {
  const counters: Record<string, number> = {};
  const fromSpy = vi.fn((table: string) => {
    const i = counters[table] ?? 0;
    counters[table] = i + 1;
    const stubs = responses[table];
    if (stubs === undefined) {
      throw new Error(`mockClient: unexpected table '${table}'`);
    }
    const stub = Array.isArray(stubs) ? (stubs[i] ?? stubs[stubs.length - 1]!) : stubs;
    return mockBuilder(stub) as never;
  });
  return { from: fromSpy } as DbClient & { from: ReturnType<typeof vi.fn> };
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
});
