/**
 * content-svc handlers — Stage 18.
 *
 * Pure functions: each handler accepts a Supabase-client-like object + the
 * minimal context it needs (caller tenant_id, params), returns a tagged
 * `HandlerResult<T>`. The Deno dispatcher (`index.ts`) serialises results
 * into HTTP responses; tests assert on the data/result shape directly.
 *
 * Spec refs: arch §4.3 (endpoints), §5.2 line 1690 (skill-graph cache),
 * Spec §3.6.5 (DTO shapes). Stage 17 ADR-0024 governs adaptive testlet
 * resolution in `/content/select`.
 */

// ─── Shared types ────────────────────────────────────────────────────────────

export type HandlerResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

const ok = <T>(data: T): HandlerResult<T> => ({ ok: true, data });
const err = (status: number, code: string, message: string): HandlerResult<never> => ({
  ok: false,
  status,
  code,
  message,
});

/**
 * Minimal SupabaseClient-like surface — the chained Postgrest builder. The
 * real client (Deno URL import in `index.ts`) and Vitest mocks both satisfy
 * this structurally.
 */
export type DbBuilder = {
  select: (cols: string) => DbBuilder;
  eq: (col: string, val: unknown) => DbBuilder;
  in: (col: string, vals: unknown[]) => DbBuilder;
  or: (filter: string) => DbBuilder;
  gte: (col: string, val: unknown) => DbBuilder;
  lte: (col: string, val: unknown) => DbBuilder;
  not: (col: string, op: string, val: unknown) => DbBuilder;
  contains: (col: string, val: unknown) => DbBuilder;
  overlaps: (col: string, val: unknown[]) => DbBuilder;
  ilike: (col: string, val: string) => DbBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => DbBuilder;
  limit: (n: number) => DbBuilder;
  range: (from: number, to: number) => DbBuilder;
  maybeSingle: () => Promise<{ data: unknown | null; error: { message: string } | null }>;
  single: () => Promise<{ data: unknown | null; error: { message: string } | null }>;
} & Promise<{ data: unknown[] | null; count: number | null; error: { message: string } | null }>;

export interface DbClient {
  from(table: string): DbBuilder;
}

// ─── DTO shapes (server-side; mirrors @mm/types where applicable) ────────────

export interface PathwayDTO {
  slug: string;
  display_name: string;
  exam_family: string;
  program: string;
  year_levels: number[];
  entitled: boolean;
  locked_reason: string | null;
}

export interface AssessmentProfileDTO {
  id: string;
  exam_family: string;
  program: string;
  year_level: number;
  duration_minutes: number;
}

export interface ItemDTO {
  item_id: string;
  version: number;
  stem: Record<string, unknown>;
  stimulus: { id: string; type: string; content: Record<string, unknown> } | null;
  response_type: string;
  response_config: Record<string, unknown>;
  tools_available: string[];
  sequence_number: number;
}

/** EngineItem extends ItemDTO with engine-side metadata (per ADR-0023, ADR-0024). */
export interface EngineItem extends ItemDTO {
  skill_ids: string[];
  difficulty: number;
  discrimination?: number | null;
  testlet_id?: string;
  stage_id?: string;
  is_writing_item?: boolean;
}

export interface SkillGraphsActiveDTO {
  id: string;
  version: string;
  published_at: string;
}

interface DifficultyBands {
  easy: [number, number];
  mid: [number, number];
  hard: [number, number];
}

const DEFAULT_BANDS: DifficultyBands = {
  easy: [0, 0.35],
  mid: [0.35, 0.7],
  hard: [0.7, 1.0],
};

// ─── /pathways ───────────────────────────────────────────────────────────────

export async function listPathways(
  client: DbClient,
  callerTenantId: string,
): Promise<HandlerResult<PathwayDTO[]>> {
  const { data: pathways, error: pErr } = await (client.from('pathway').select(
    'id, slug, display_name, exam_family, program, year_levels, required_feature_key',
  ) as unknown as Promise<{
    data: Array<{
      id: string;
      slug: string;
      display_name: string;
      exam_family: string;
      program: string;
      year_levels: number[];
      required_feature_key: string;
    }> | null;
    error: { message: string } | null;
  }>);
  if (pErr !== null) return err(500, 'INTERNAL_ERROR', pErr.message);
  if (pathways === null) return ok([]);

  const entitledKeys = await fetchEntitledFeatureKeys(client, callerTenantId);
  if (!entitledKeys.ok) return entitledKeys;

  const dtos: PathwayDTO[] = pathways.map(p => ({
    slug: p.slug,
    display_name: p.display_name,
    exam_family: p.exam_family,
    program: p.program,
    year_levels: p.year_levels,
    entitled: entitledKeys.data.has(p.required_feature_key),
    locked_reason: entitledKeys.data.has(p.required_feature_key) ? null : 'tier_required',
  }));
  return ok(dtos);
}

export async function getPathwayBySlug(
  client: DbClient,
  callerTenantId: string,
  slug: string,
): Promise<HandlerResult<PathwayDTO>> {
  const result = await (client.from('pathway').select(
    'id, slug, display_name, exam_family, program, year_levels, required_feature_key',
  ).eq('slug', slug) as unknown as { maybeSingle: () => Promise<{ data: {
      id: string;
      slug: string;
      display_name: string;
      exam_family: string;
      program: string;
      year_levels: number[];
      required_feature_key: string;
    } | null; error: { message: string } | null }> }).maybeSingle();
  if (result.error !== null) return err(500, 'INTERNAL_ERROR', result.error.message);
  if (result.data === null) return err(404, 'NOT_FOUND', `Pathway '${slug}' not found`);

  const entitledKeys = await fetchEntitledFeatureKeys(client, callerTenantId);
  if (!entitledKeys.ok) return entitledKeys;

  const entitled = entitledKeys.data.has(result.data.required_feature_key);
  return ok({
    slug: result.data.slug,
    display_name: result.data.display_name,
    exam_family: result.data.exam_family,
    program: result.data.program,
    year_levels: result.data.year_levels,
    entitled,
    locked_reason: entitled ? null : 'tier_required',
  });
}

async function fetchEntitledFeatureKeys(
  client: DbClient,
  callerTenantId: string,
): Promise<HandlerResult<Set<string>>> {
  const { data, error } = await (client.from('feature_flag').select(
    'feature_key, tenant_id, enabled',
  ).or(`tenant_id.eq.${callerTenantId},tenant_id.is.null`) as unknown as Promise<{
    data: Array<{ feature_key: string; tenant_id: string | null; enabled: boolean }> | null;
    error: { message: string } | null;
  }>);
  if (error !== null) return err(500, 'INTERNAL_ERROR', error.message);
  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.enabled) set.add(row.feature_key);
  }
  return ok(set);
}

// ─── /assessment-profiles ────────────────────────────────────────────────────

export async function listAssessmentProfiles(
  client: DbClient,
  filters: { exam_family?: string; year_level?: number },
): Promise<HandlerResult<AssessmentProfileDTO[]>> {
  let query = client
    .from('assessment_profile')
    .select('id, exam_family, program, year_level, duration_minutes, is_active')
    .eq('is_active', true);
  if (filters.exam_family !== undefined) query = query.eq('exam_family', filters.exam_family);
  if (filters.year_level !== undefined) query = query.eq('year_level', filters.year_level);

  const { data, error } = await (query as unknown as Promise<{
    data: Array<{
      id: string;
      exam_family: string;
      program: string;
      year_level: number;
      duration_minutes: number;
    }> | null;
    error: { message: string } | null;
  }>);
  if (error !== null) return err(500, 'INTERNAL_ERROR', error.message);
  return ok(
    (data ?? []).map(r => ({
      id: r.id,
      exam_family: r.exam_family,
      program: r.program,
      year_level: r.year_level,
      duration_minutes: r.duration_minutes,
    })),
  );
}

// ─── /content/items/{id} ─────────────────────────────────────────────────────

export async function getItem(
  client: DbClient,
  itemId: string,
): Promise<HandlerResult<ItemDTO>> {
  const result = await (client.from('v_item_current').select(
    'id, current_version, stem, stimulus_id, response_type, response_config',
  ).eq('id', itemId) as unknown as { maybeSingle: () => Promise<{
    data: {
      id: string;
      current_version: number;
      stem: Record<string, unknown>;
      stimulus_id: string | null;
      response_type: string;
      response_config: Record<string, unknown>;
    } | null;
    error: { message: string } | null;
  }> }).maybeSingle();
  if (result.error !== null) return err(500, 'INTERNAL_ERROR', result.error.message);
  if (result.data === null) return err(404, 'NOT_FOUND', `Item '${itemId}' not found`);

  return ok({
    item_id: result.data.id,
    version: result.data.current_version,
    stem: result.data.stem,
    stimulus: null, // stimulus join deferred; v_item_current carries stimulus_id only
    response_type: result.data.response_type,
    response_config: result.data.response_config,
    tools_available: [],
    sequence_number: 1,
  });
}

// ─── /content/select ─────────────────────────────────────────────────────────

export interface ContentSelectRequest {
  blueprint_id?: string;
  pathway_id: string;
  exclude_recently_seen?: string[];
  target_difficulty_band?: 'easy' | 'mid' | 'hard';
}

export async function selectItems(
  client: DbClient,
  req: ContentSelectRequest,
): Promise<HandlerResult<EngineItem[]>> {
  // Resolve pathway + framework_config
  const pathwayResult = await (client.from('pathway').select(
    'id, slug, engine_type, framework_config_id',
  ).eq('id', req.pathway_id) as unknown as { maybeSingle: () => Promise<{
    data: { id: string; slug: string; engine_type: string; framework_config_id: string } | null;
    error: { message: string } | null;
  }> }).maybeSingle();
  if (pathwayResult.error !== null) return err(500, 'INTERNAL_ERROR', pathwayResult.error.message);
  if (pathwayResult.data === null) return err(404, 'NOT_FOUND', `Pathway '${req.pathway_id}' not found`);
  const pathway = pathwayResult.data;

  const fcResult = await (client.from('framework_config').select(
    'id, adaptive_rules, difficulty_bands, blueprint',
  ).eq('id', pathway.framework_config_id) as unknown as { maybeSingle: () => Promise<{
    data: {
      id: string;
      adaptive_rules: AdaptiveRulesShape | null;
      difficulty_bands: Partial<DifficultyBands> | null;
      blueprint: BlueprintInline | null;
    } | null;
    error: { message: string } | null;
  }> }).maybeSingle();
  if (fcResult.error !== null) return err(500, 'INTERNAL_ERROR', fcResult.error.message);
  if (fcResult.data === null) {
    return err(500, 'INTERNAL_ERROR', `framework_config '${pathway.framework_config_id}' missing`);
  }
  const fc = fcResult.data;

  // ── Adaptive path: build EngineItems from testlets ─────────────────────────
  if (pathway.engine_type === 'adaptive') {
    if (fc.adaptive_rules === null) {
      return err(500, 'INTERNAL_ERROR', `Pathway '${pathway.slug}' is adaptive but framework_config has no adaptive_rules`);
    }
    return await selectAdaptiveItems(client, fc.adaptive_rules, req.exclude_recently_seen ?? []);
  }

  // ── Linear / non-adaptive: use blueprint sections ──────────────────────────
  let blueprintSections: BlueprintSection[] | null = null;
  if (req.blueprint_id !== undefined) {
    const bpResult = await (client.from('blueprint').select('sections').eq('id', req.blueprint_id) as unknown as {
      maybeSingle: () => Promise<{
        data: { sections: BlueprintSection[] } | null;
        error: { message: string } | null;
      }>;
    }).maybeSingle();
    if (bpResult.error !== null) return err(500, 'INTERNAL_ERROR', bpResult.error.message);
    if (bpResult.data === null) return err(404, 'NOT_FOUND', `Blueprint '${req.blueprint_id}' not found`);
    blueprintSections = bpResult.data.sections;
  } else if (fc.blueprint !== null && Array.isArray(fc.blueprint)) {
    // framework_config.blueprint is sometimes an array of sections directly
    blueprintSections = fc.blueprint as BlueprintSection[];
  } else if (fc.blueprint !== null && typeof fc.blueprint === 'object' && 'sections' in fc.blueprint) {
    blueprintSections = (fc.blueprint as { sections: BlueprintSection[] }).sections;
  }
  if (blueprintSections === null) {
    return err(400, 'VALIDATION_ERROR', 'blueprint_id required for non-adaptive pathways without an embedded blueprint');
  }

  const bands = mergeDifficultyBands(fc.difficulty_bands);
  return await selectFromBlueprint(client, blueprintSections, bands, req.exclude_recently_seen ?? []);
}

interface BlueprintSection {
  name: string;
  target_items: number;
  skill_slugs: string[];
  difficulty_split: { easy: number; mid: number; hard: number };
}

interface BlueprintInline {
  sections?: BlueprintSection[];
}

interface AdaptiveRulesShape {
  stages: string[];
  start_testlet_id: string;
  testlets: Record<string, {
    stage_id: string;
    time_limit_ms: number;
    item_ids: string[];
  }>;
}

function mergeDifficultyBands(input: Partial<DifficultyBands> | null): DifficultyBands {
  if (input === null) return DEFAULT_BANDS;
  return {
    easy: input.easy ?? DEFAULT_BANDS.easy,
    mid:  input.mid  ?? DEFAULT_BANDS.mid,
    hard: input.hard ?? DEFAULT_BANDS.hard,
  };
}

async function selectAdaptiveItems(
  client: DbClient,
  rules: AdaptiveRulesShape,
  excludeIds: string[],
): Promise<HandlerResult<EngineItem[]>> {
  // Collect every item_id referenced by any testlet, with tagging.
  const tagged: Array<{ item_id: string; testlet_id: string; stage_id: string }> = [];
  for (const [testletId, def] of Object.entries(rules.testlets)) {
    for (const id of def.item_ids) {
      if (excludeIds.includes(id)) continue;
      tagged.push({ item_id: id, testlet_id: testletId, stage_id: def.stage_id });
    }
  }
  if (tagged.length === 0) return ok([]);

  const ids = tagged.map(t => t.item_id);
  const { data, error } = await (client.from('v_item_current').select(
    'id, current_version, stem, response_type, response_config, skill_ids, difficulty, discrimination',
  ).in('id', ids) as unknown as Promise<{
    data: Array<{
      id: string;
      current_version: number;
      stem: Record<string, unknown>;
      response_type: string;
      response_config: Record<string, unknown>;
      skill_ids: string[];
      difficulty: number;
      discrimination: number | null;
    }> | null;
    error: { message: string } | null;
  }>);
  if (error !== null) return err(500, 'INTERNAL_ERROR', error.message);

  const itemsById = new Map<string, NonNullable<typeof data>[number]>();
  for (const row of data ?? []) itemsById.set(row.id, row);

  const out: EngineItem[] = [];
  // Preserve testlet → item_ids ordering, deterministic by lex tie-break.
  tagged.sort((a, b) => {
    if (a.stage_id !== b.stage_id) return a.stage_id.localeCompare(b.stage_id);
    if (a.testlet_id !== b.testlet_id) return a.testlet_id.localeCompare(b.testlet_id);
    return a.item_id.localeCompare(b.item_id);
  });
  for (const t of tagged) {
    const row = itemsById.get(t.item_id);
    if (row === undefined) continue; // testlet references missing item; skip
    out.push(toEngineItem(row, { testlet_id: t.testlet_id, stage_id: t.stage_id }));
  }
  return ok(out);
}

async function selectFromBlueprint(
  client: DbClient,
  sections: BlueprintSection[],
  bands: DifficultyBands,
  excludeIds: string[],
): Promise<HandlerResult<EngineItem[]>> {
  // Resolve skill_slugs → skill_ids via skill_node table (active graph).
  const slugs = Array.from(new Set(sections.flatMap(s => s.skill_slugs)));
  const skillsResult = await (client.from('skill_node').select('id, slug') as unknown as DbBuilder)
    .in('slug', slugs);
  const skillsErr = (skillsResult as unknown as { error: { message: string } | null }).error;
  const skillsData = (skillsResult as unknown as { data: Array<{ id: string; slug: string }> | null }).data;
  if (skillsErr !== null) return err(500, 'INTERNAL_ERROR', skillsErr.message);
  const slugToId = new Map((skillsData ?? []).map(s => [s.slug, s.id]));

  const out: EngineItem[] = [];
  for (const section of sections) {
    const skillIds = section.skill_slugs
      .map(slug => slugToId.get(slug))
      .filter((id): id is string => id !== undefined);
    if (skillIds.length === 0) continue;

    for (const band of ['easy', 'mid', 'hard'] as const) {
      const targetCount = Math.round(section.target_items * section.difficulty_split[band]);
      if (targetCount === 0) continue;
      const [low, high] = bands[band];

      const itemsResult = await (client.from('v_item_current').select(
        'id, current_version, stem, response_type, response_config, skill_ids, difficulty, discrimination',
      ) as unknown as DbBuilder)
        .overlaps('skill_ids', skillIds)
        .gte('difficulty', low)
        .lte('difficulty', high)
        .eq('is_active', true);
      const itemsErr = (itemsResult as unknown as { error: { message: string } | null }).error;
      const itemsData = (itemsResult as unknown as { data: Array<{
        id: string;
        current_version: number;
        stem: Record<string, unknown>;
        response_type: string;
        response_config: Record<string, unknown>;
        skill_ids: string[];
        difficulty: number;
        discrimination: number | null;
      }> | null }).data;
      if (itemsErr !== null) return err(500, 'INTERNAL_ERROR', itemsErr.message);

      const filtered = (itemsData ?? [])
        .filter(it => !excludeIds.includes(it.id))
        // Q-18.4: deterministic tie-break — lexicographic by item_id ASC.
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, targetCount);

      for (const row of filtered) out.push(toEngineItem(row, {}));
    }
  }
  return ok(out);
}

function toEngineItem(
  row: {
    id: string;
    current_version: number;
    stem: Record<string, unknown>;
    response_type: string;
    response_config: Record<string, unknown>;
    skill_ids: string[];
    difficulty: number;
    discrimination: number | null;
  },
  meta: { testlet_id?: string; stage_id?: string; is_writing_item?: boolean },
): EngineItem {
  const item: EngineItem = {
    item_id: row.id,
    version: row.current_version,
    stem: row.stem,
    stimulus: null,
    response_type: row.response_type,
    response_config: row.response_config,
    tools_available: [],
    sequence_number: 1,
    skill_ids: row.skill_ids,
    difficulty: row.difficulty,
    discrimination: row.discrimination,
  };
  if (meta.testlet_id !== undefined) item.testlet_id = meta.testlet_id;
  if (meta.stage_id !== undefined) item.stage_id = meta.stage_id;
  if (meta.is_writing_item === true) item.is_writing_item = true;
  return item;
}

// ─── /content/search ─────────────────────────────────────────────────────────

export interface ContentSearchRequest {
  q?: string;
  skill_ids?: string[];
  difficulty_band?: 'easy' | 'mid' | 'hard';
  page?: number;
  page_size?: number;
}

export async function searchContent(
  client: DbClient,
  req: ContentSearchRequest,
): Promise<HandlerResult<{ items: ItemDTO[]; total: number; page: number }>> {
  const page = Math.max(1, req.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, req.page_size ?? 20));

  let query = client.from('v_item_current').select(
    'id, current_version, stem, response_type, response_config, skill_ids, difficulty',
    // Postgrest `count` option would normally be passed in the second arg;
    // omitted here so the structural typing stays simple.
  );
  if (req.q !== undefined && req.q.length > 0) {
    // Search over stem JSON: use `ilike` on stem->>value when stem is plain_text.
    query = query.ilike('stem->>value', `%${req.q}%`);
  }
  if (req.skill_ids !== undefined && req.skill_ids.length > 0) {
    query = query.overlaps('skill_ids', req.skill_ids);
  }
  if (req.difficulty_band !== undefined) {
    const [low, high] = DEFAULT_BANDS[req.difficulty_band];
    query = query.gte('difficulty', low).lte('difficulty', high);
  }

  const { data, error } = await ((query as unknown as DbBuilder)
    .order('id', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1) as unknown as Promise<{
    data: Array<{
      id: string;
      current_version: number;
      stem: Record<string, unknown>;
      response_type: string;
      response_config: Record<string, unknown>;
      skill_ids: string[];
      difficulty: number;
    }> | null;
    error: { message: string } | null;
  }>);
  if (error !== null) return err(500, 'INTERNAL_ERROR', error.message);

  const items: ItemDTO[] = (data ?? []).map(row => ({
    item_id: row.id,
    version: row.current_version,
    stem: row.stem,
    stimulus: null,
    response_type: row.response_type,
    response_config: row.response_config,
    tools_available: [],
    sequence_number: 1,
  }));
  return ok({ items, total: items.length, page });
}

// ─── /skill-graphs/active ────────────────────────────────────────────────────

import {
  getSkillGraph,
  type SkillGraphCacheLoader,
} from '../_shared/skill-graph-cache.ts';

export async function getActiveSkillGraph(
  loader: SkillGraphCacheLoader,
  now: number = Date.now(),
): Promise<HandlerResult<SkillGraphsActiveDTO>> {
  const cache = await getSkillGraph(loader, now);
  if (cache === null) return err(404, 'NOT_FOUND', 'No published skill graph');
  return ok({
    id: cache.version.id,
    version: cache.version.version,
    published_at: cache.version.published_at,
  });
}
