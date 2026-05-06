/**
 * Skill-graph cache (per Edge Function instance).
 *
 * Spec refs: arch §5.2 line 1690 — "1h TTL, invalidated on graph version
 * publish". The cache is module-scope; each Edge Function Worker gets its own
 * instance. No cross-instance coordination — each worker reloads on its own
 * cold start.
 *
 * Design (Stage 18):
 * - Watermark check on every request: SELECT active skill_graph_version row
 *   (one row, indexed). Compare its `id` to the cached watermark. Match →
 *   serve cache. Mismatch → reload.
 * - 1h TTL ceiling: even if watermark unchanged, expire after 1h to bound
 *   cache lifetime (defence against silent staleness).
 * - Pure-function loader pattern: callers inject a `SkillGraphCacheLoader`
 *   that abstracts the DB access. Production code wraps a Supabase client
 *   (see `createDbLoader`); tests pass mocks directly.
 *
 * The cache itself is a module-scope `let` variable. Tests must call
 * `invalidateSkillGraph()` between cases to prevent state leakage.
 *
 * Deno-compatible: no Node-only imports. The `DbClient` type is declared as
 * a minimal structural interface so the same module compiles in Deno (with
 * the real Supabase client passed in via `createDbLoader`) and in Node
 * Vitest (with mocks).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkillGraphVersion {
  id: string;
  version: string;
  published_at: string;
}

export interface SkillNode {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
}

export interface SkillEdge {
  from_node_id: string;
  to_node_id: string;
}

export interface SkillGraphCache {
  watermark: string;
  loaded_at: number;
  nodes: Map<string, SkillNode>;
  /** skill_id → array of prerequisite skill_ids (incoming edges). */
  adjacency: Map<string, string[]>;
  version: SkillGraphVersion;
}

export interface SkillGraphCacheLoader {
  loadActiveVersion(): Promise<SkillGraphVersion | null>;
  loadGraphData(graphVersionId: string): Promise<{ nodes: SkillNode[]; edges: SkillEdge[] }>;
}

/**
 * Minimal Supabase-client-like interface — just what `createDbLoader` uses.
 * Both the real `SupabaseClient` (via Deno URL import in `index.ts`) and
 * Vitest mocks satisfy this structurally.
 */
export interface DbClient {
  from(table: string): {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        order?: (col: string, opts?: unknown) => {
          limit: (n: number) => {
            maybeSingle: () => Promise<{
              data: SkillGraphVersion | null;
              error: { message: string } | null;
            }>;
          };
        };
        limit?: (n: number) => Promise<{
          data: unknown[] | null;
          error: { message: string } | null;
        }>;
      } & Promise<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>;
    };
  };
}

// ─── Module-scope cache ──────────────────────────────────────────────────────

const TTL_MS = 60 * 60 * 1000; // 1 hour

let cache: SkillGraphCache | null = null;

/**
 * Stage 21 / Q-21.3 / ADR-0028: in-flight Promise sentinel.
 *
 * When two requests hit a fresh worker simultaneously, both observe
 * `cache === null` and would otherwise both call `loadGraphData`. The
 * sentinel ensures the second caller awaits the first caller's load
 * instead of issuing a redundant DB round-trip. Cleared in `finally` so
 * a rejection (e.g. transient `loadGraphData` failure on cold start)
 * does NOT permanently wedge the cache — the next caller retries.
 */
let loadingPromise: Promise<SkillGraphCache | null> | null = null;

export function invalidateSkillGraph(): void {
  cache = null;
  loadingPromise = null; // test hygiene — also clears the in-flight sentinel
}

/**
 * For test inspection only. Returns the current in-memory cache (or null).
 */
export function _peekSkillGraphCache(): SkillGraphCache | null {
  return cache;
}

// ─── Loader ──────────────────────────────────────────────────────────────────

function buildAdjacency(nodes: SkillNode[], edges: SkillEdge[]): Map<string, string[]> {
  // skill_id → prerequisite skill_ids (edges represent "from is prerequisite of to").
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    const list = adjacency.get(edge.to_node_id);
    if (list !== undefined) list.push(edge.from_node_id);
  }
  return adjacency;
}

/**
 * Resolve the active skill graph through the cache. Always performs a
 * watermark check (cheap single-row SELECT); reloads on watermark mismatch
 * or TTL expiry.
 *
 * Returns `null` when no published graph exists (clean DB).
 *
 * Stage 21 hardening (ADR-0028):
 *   - Q-21.3: in-flight Promise sentinel coalesces concurrent cold-start
 *     loads into a single DB round-trip per worker per cold cache. The
 *     sentinel is cleared in `finally`, so a rejection unwedges the cache
 *     for the next caller.
 *   - Q-21.4: stale-while-revalidate. If `loadActiveVersion` returns a
 *     new watermark and `loadGraphData` rejects, AND a prior cache
 *     exists, retain the prior cache and emit a structured
 *     `console.warn`. Future calls re-attempt; cache catches up on the
 *     next successful load. Behaviour unchanged when no prior cache
 *     exists (rejection propagates — cold start can't fall back).
 *
 * `traceId` is optional metadata; included in the stale-while-revalidate
 * warn payload when provided. Existing callers can omit it.
 */
export async function getSkillGraph(
  loader: SkillGraphCacheLoader,
  now: number = Date.now(),
  traceId?: string | null,
): Promise<SkillGraphCache | null> {
  const active = await loader.loadActiveVersion();
  if (active === null) {
    cache = null;
    return null;
  }

  const watermarkMatches = cache !== null && cache.watermark === active.id;
  const withinTtl = cache !== null && now - cache.loaded_at <= TTL_MS;

  if (cache !== null && watermarkMatches && withinTtl) {
    return cache;
  }

  // Q-21.3: if another caller is already loading, await their result.
  if (loadingPromise !== null) {
    return loadingPromise;
  }

  // Capture the prior cache for the Q-21.4 stale-while-revalidate fallback.
  const priorCache = cache;
  const previousWatermark = priorCache?.watermark ?? null;

  loadingPromise = (async () => {
    try {
      const data = await loader.loadGraphData(active.id);
      cache = {
        watermark: active.id,
        loaded_at: now,
        nodes: new Map(data.nodes.map(n => [n.id, n])),
        adjacency: buildAdjacency(data.nodes, data.edges),
        version: active,
      };
      return cache;
    } catch (err) {
      // Q-21.4: stale-while-revalidate ONLY when we have prior data to fall
      // back to. First-ever cold-load failure must propagate so the caller
      // sees the error (no silent corruption of an empty cache).
      if (priorCache !== null) {
        console.warn(JSON.stringify({
          level: 'warn',
          event: 'skill_graph_stale_revalidate_failed',
          error: err instanceof Error ? err.message : String(err),
          watermark_old: previousWatermark,
          watermark_new: active.id,
          trace_id: traceId ?? null,
        }));
        return priorCache;
      }
      throw err;
    }
  })();

  try {
    return await loadingPromise;
  } finally {
    // Q-21.3: clear in finally so a rejected cold load does not wedge the
    // cache. The next caller observes loadingPromise === null and retries.
    loadingPromise = null;
  }
}

/**
 * Construct a SkillGraphCacheLoader that pulls from the real DB via a
 * Supabase client. Used by Edge Functions; tests bypass this and pass
 * loader mocks directly to `getSkillGraph`.
 */
export function createDbLoader(client: DbClient): SkillGraphCacheLoader {
  return {
    async loadActiveVersion(): Promise<SkillGraphVersion | null> {
      // SELECT id, version, published_at FROM skill_graph_version
      // WHERE status = 'published' ORDER BY published_at DESC LIMIT 1;
      // Cast the chained client because DbClient's structural interface only
      // captures the surface we use.
      const result = await (client.from('skill_graph_version').select(
        'id, version, published_at',
      ) as unknown as {
        eq: (col: string, val: unknown) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => {
              maybeSingle: () => Promise<{ data: SkillGraphVersion | null; error: unknown }>;
            };
          };
        };
      })
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error !== null && result.error !== undefined) {
        throw new Error(`skill-graph-cache.loadActiveVersion: ${(result.error as { message?: string }).message ?? 'unknown error'}`);
      }
      return result.data;
    },
    async loadGraphData(graphVersionId: string) {
      const [nodesResult, edgesResult] = await Promise.all([
        (client.from('skill_node').select('id, slug, name, parent_id') as unknown as {
          eq: (col: string, val: unknown) => Promise<{ data: SkillNode[] | null; error: unknown }>;
        }).eq('graph_version_id', graphVersionId),
        (client.from('skill_edge').select('from_node_id, to_node_id') as unknown as {
          eq: (col: string, val: unknown) => Promise<{ data: SkillEdge[] | null; error: unknown }>;
        }).eq('graph_version_id', graphVersionId),
      ]);
      if (nodesResult.error !== null && nodesResult.error !== undefined) {
        throw new Error(`skill-graph-cache.loadGraphData(nodes): ${(nodesResult.error as { message?: string }).message ?? 'unknown error'}`);
      }
      if (edgesResult.error !== null && edgesResult.error !== undefined) {
        throw new Error(`skill-graph-cache.loadGraphData(edges): ${(edgesResult.error as { message?: string }).message ?? 'unknown error'}`);
      }
      return {
        nodes: nodesResult.data ?? [],
        edges: edgesResult.data ?? [],
      };
    },
  };
}
