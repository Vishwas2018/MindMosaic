/**
 * intelligence-svc handlers — Stage 29.
 *
 * Stage 28 changes vs Stage 20:
 *   - ISSUE-0006 fix: L3a now reads skill graph via getSkillGraph() (ADR-0028)
 *     instead of querying skill_edge directly. ProcessSessionInput accepts an
 *     optional skillGraph (for tests) or graphLoader (for production); if
 *     neither is provided the handler uses an empty adjacency (no prereqs).
 *   - processCausalFull added: L3b full traversal (traverse_upstream +
 *     traverse_downstream) per spec §5.1.3/4 (Q-28.6, Q-28.7). Called by
 *     jobs-worker via POST /intelligence/pipeline/causal-full (ADR-0031).
 *
 * Stage 29 additions:
 *   - processPredictiveRefresh added: L5 predictive intelligence per spec §12.
 *     Called by jobs-worker via POST /intelligence/pipeline/predictive-refresh.
 *     ADR-0032: L5 does NOT write pipeline_event (session_id NOT NULL FK);
 *     intelligence_audit_log is the sole observability surface for this step.
 *   - getPredictions added: GET /intelligence/predictions/:student_id/:pathway_slug.
 *     Reads cohort_metric_cache and returns fresh/stale/no_data envelope.
 *
 * Pipeline (Spec §7.2 sync portion — L1+L2+L3a, must complete inline):
 *   0. Audit-log dedup (Q-20.7).
 *   1. L1 Foundation — mastery / velocity / streak; UPSERT skill_mastery +
 *      learning_velocity; INSERT pipeline_event(step=1).
 *   2. L2 Behaviour — guess_probability / fatigue / cog load; INSERT
 *      learning_event(behaviour_signal); UPSERT behaviour_profile;
 *      INSERT pipeline_event(step=2).
 *   3. L3a Causal-scoped — depth-1 prereq walk via skill-graph-cache;
 *      misconception lookup; UPSERT student_misconception;
 *      INSERT pipeline_event(step=3).
 *   4. Audit log summary row.
 *
 * Async pipeline (jobs-worker → this handler):
 *   3b. L3b Causal-full — traverse_upstream + traverse_downstream per
 *       spec §5.1.3/4; pipeline_event(step=4); audit log.
 *   5.  L5 Predictive-refresh — readiness score + gap skills + mastery
 *       timelines; cohort_metric_cache UPSERT; audit log only (ADR-0032).
 *
 * Q-28.8 note: spec §5.1.3 requires strength >= 0.4 edge filter; §5.1.4
 * requires dependency_class == required filter. The SkillGraphCache adjacency
 * currently stores all edges without these metadata fields. For v1, all cached
 * edges are used without filtering (Option B per Q-28.8 surface). V1 seed
 * content contains only required/supportive edges (no enriching). Grep for
 * 'Q-28.8' to find the deferral sites.
 *
 * Replay determinism (Q-20.4 / ADR-0027):
 *   - All aggregates ORDER BY skill_id ASC, response_id ASC.
 *   - canonicalize() on every audit-log input_snapshot.
 *   - No Math.random; no Date.now() as algorithm input.
 *   - L3b traversal: output sorted skill_id ASC for determinism.
 *   - L5 gap skills: sorted skill_id ASC; strand iteration sorted strandId ASC.
 *
 * Spec refs: §5.1.3, §5.1.4, §7.2, §7.4.2, §8.1, §9.2, §9.3, §9.5, §9.6,
 * §10.2, §12.1–12.4; arch §4.5, §5.2; ADR-0027, ADR-0028, ADR-0031, ADR-0032.
 */

import { EngineStateSchema, type EngineState, retentionHalfLifeDays } from '@mm/engines';
import {
  ALGORITHM_VERSION,
  blendBehaviour,
  canonicalize,
  cognitiveLoad,
  fatigueScore,
  guessProbability,
  masteryFormula,
  recencyWeightedAccuracy,
  sortBySkillId,
  walkPrereqsDepth1,
  yearLevelDefaults,
  type BehaviourDefaults,
} from '../_shared/intelligence-helpers.ts';
import {
  getSkillGraph,
  type SkillGraphCache,
  type SkillGraphCacheLoader,
} from '../_shared/skill-graph-cache.ts';

// ─── Tagged result envelope ──────────────────────────────────────────────────

export type HandlerResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; code: string; message: string; details?: Record<string, unknown> };

const ok = <T>(data: T, status = 200): HandlerResult<T> => ({ ok: true, data, status });
const err = (
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): HandlerResult<never> => {
  const out: HandlerResult<never> = { ok: false, status, code, message };
  if (details !== undefined) (out as { details?: Record<string, unknown> }).details = details;
  return out;
};

// ─── Effects ────────────────────────────────────────────────────────────────

export interface Effects {
  now: () => string;
  uuid: () => string;
  /** Used ONLY for processing_time_ms (Q-20.5). Single delta at handler exit. */
  perfNow: () => number;
}

export const DEFAULT_EFFECTS: Effects = {
  now: () => new Date().toISOString(),
  uuid: () => crypto.randomUUID(),
  perfNow: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
};

// ─── DbClient surface ────────────────────────────────────────────────────────

export interface DbClient {
  from(table: string): DbBuilder;
  rpc?(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}

export type DbBuilder = {
  select: (cols: string) => DbBuilder;
  insert: (row: unknown) => DbBuilder;
  update: (patch: unknown) => DbBuilder;
  upsert: (row: unknown, opts?: { onConflict?: string }) => DbBuilder;
  delete: () => DbBuilder;
  eq: (col: string, val: unknown) => DbBuilder;
  in: (col: string, vals: unknown[]) => DbBuilder;
  gte: (col: string, val: unknown) => DbBuilder;
  contains: (col: string, val: unknown) => DbBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => DbBuilder;
  limit: (n: number) => DbBuilder;
  maybeSingle: () => Promise<{ data: unknown | null; error: { message: string; code?: string } | null }>;
  single: () => Promise<{ data: unknown | null; error: { message: string; code?: string } | null }>;
} & PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null }>;

// ─── Row shapes ──────────────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  student_id: string;
  tenant_id: string;
  pathway_id: string | null;
  engine_type: string;
  engine_state_snapshot: unknown;
  status: string;
}

interface ResponseRow {
  id: string;
  session_id: string;
  item_id: string;
  is_correct: boolean | null;
  difficulty: number;
  sequence_number: number;
  response_data: Record<string, unknown>;
  telemetry: { time_to_answer_ms: number; answer_changes: number } | null;
  answered_at: string;
}

interface UserProfileRow {
  id: string;
  tenant_id: string;
  year_level: string | null;
}

interface ItemRow {
  id: string;
  skill_ids: string[];
}

interface ItemVersionRow {
  item_id: string;
  distractor_rationale: Record<string, { misconception_id?: string }> | null;
}

interface MasteryRow {
  student_id: string;
  skill_id: string;
  tenant_id: string;
  mastery_level: number;
  confidence: number;
  total_attempts: number;
  correct_attempts: number;
  streak_current: number;
  streak_best: number;
}

interface BehaviourProfileRow {
  student_id: string;
  data_points: number;
  computed_at: string | null;
}

// ─── L3b traversal constants ─────────────────────────────────────────────────

const MASTERY_THRESHOLD = 0.8;
const TRAVERSAL_CAP = 50;

// ─── processSession public types ─────────────────────────────────────────────

export interface ProcessSessionResponse {
  status: 'processed' | 'already_processed';
  session_id: string;
  algorithm_version: string;
  processing_time_ms: number | null;
  layers: {
    foundation: { skills_touched: number; mastery_upserts: number } | null;
    behaviour: { signals_written: number; profile_blended: boolean } | null;
    causal: { prereqs_walked: number; misconceptions_upserted: number } | null;
  };
}

export interface ProcessSessionInput {
  client: DbClient;
  sessionId: string;
  traceId: string;
  effects?: Partial<Effects>;
  /**
   * Pre-built skill graph for testing (bypasses getSkillGraph cache call).
   * Pass `null` to use empty adjacency (no prereq walks).
   */
  skillGraph?: SkillGraphCache | null;
  /**
   * Cache loader for production path. If neither skillGraph nor graphLoader
   * is provided, an empty adjacency is used (no prereq walks).
   */
  graphLoader?: SkillGraphCacheLoader;
}

// ─── processCausalFull public types ──────────────────────────────────────────

export interface ProcessCausalFullResponse {
  status: 'processed' | 'already_processed';
  session_id: string;
  algorithm_version: string;
  processing_time_ms: number | null;
  causal_full: {
    skills_traversed: number;
    root_causes: string[];
    unlocked_skills: string[];
  } | null;
}

export interface ProcessCausalFullInput {
  client: DbClient;
  sessionId: string;
  traceId: string;
  effects?: Partial<Effects>;
  skillGraph?: SkillGraphCache | null;
  graphLoader?: SkillGraphCacheLoader;
}

// ─── processSession ──────────────────────────────────────────────────────────

export async function processSession(
  input: ProcessSessionInput,
): Promise<HandlerResult<ProcessSessionResponse>> {
  const eff = { ...DEFAULT_EFFECTS, ...input.effects };
  const { client, sessionId, traceId } = input;
  const t0 = eff.perfNow();

  // 0. Audit-log dedup (Q-20.7) ─────────────────────────────────────────────
  const dedupRes = await client
    .from('intelligence_audit_log')
    .select('id')
    .eq('event_type', 'session.processed')
    .eq('algorithm_version', ALGORITHM_VERSION)
    .eq('input_snapshot->>session_id', sessionId)
    .limit(1);
  if (dedupRes.error !== null) {
    return err(500, 'INTERNAL_ERROR', `audit-log dedup lookup failed: ${dedupRes.error.message}`);
  }
  const existing = (dedupRes.data ?? []) as { id: string }[];
  if (existing.length > 0) {
    return ok<ProcessSessionResponse>({
      status: 'already_processed',
      session_id: sessionId,
      algorithm_version: ALGORITHM_VERSION,
      processing_time_ms: null,
      layers: { foundation: null, behaviour: null, causal: null },
    });
  }

  // 1. Load session_record + responses + user_profile ───────────────────────
  const sessionRes = await client
    .from('session_record')
    .select('id, student_id, tenant_id, pathway_id, engine_type, engine_state_snapshot, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionRes.error !== null) return err(500, 'INTERNAL_ERROR', sessionRes.error.message);
  if (sessionRes.data === null) return err(404, 'NOT_FOUND', `Session '${sessionId}' not found`);
  const session = sessionRes.data as SessionRow;

  if (session.status !== 'submitted') {
    return err(409, 'SESSION_CONFLICT', `Session is not submitted (current: ${session.status})`);
  }

  const stateParse = EngineStateSchema.safeParse(session.engine_state_snapshot);
  if (!stateParse.success) {
    return err(500, 'INTERNAL_ERROR', `engine_state_snapshot invalid: ${stateParse.error.message}`);
  }
  const state = stateParse.data;

  const profileRes = await client
    .from('user_profile')
    .select('id, tenant_id, year_level')
    .eq('id', session.student_id)
    .maybeSingle();
  if (profileRes.error !== null) return err(500, 'INTERNAL_ERROR', profileRes.error.message);
  if (profileRes.data === null) return err(500, 'INTERNAL_ERROR', 'Student profile missing');
  const profile = profileRes.data as UserProfileRow;

  const responsesRes = await client
    .from('session_response')
    .select('id, session_id, item_id, is_correct, difficulty, sequence_number, response_data, telemetry, answered_at')
    .eq('session_id', sessionId)
    .order('sequence_number', { ascending: true });
  if (responsesRes.error !== null) return err(500, 'INTERNAL_ERROR', responsesRes.error.message);
  const responses = (responsesRes.data ?? []) as ResponseRow[];

  // Resolve skill graph for L3a (ISSUE-0006 fix + ADR-0028).
  const skillGraph: SkillGraphCache | null =
    input.skillGraph !== undefined
      ? input.skillGraph
      : input.graphLoader !== undefined
        ? await getSkillGraph(input.graphLoader, eff.perfNow(), traceId)
        : null;

  // ── 2. L1 Foundation ─────────────────────────────────────────────────────
  await insertPipelineEvent(client, sessionId, session.student_id, 1, 'foundation.update', 'processing', eff);
  const l1 = await runFoundation({ client, session, profile, responses, state, eff, traceId });
  await markPipelineEventCompleted(client, sessionId, 1, 'foundation.update', l1.error, eff);
  if (l1.error !== null) return err(500, 'INTERNAL_ERROR', `L1 foundation failed: ${l1.error}`);

  // ── 3. L2 Behaviour ──────────────────────────────────────────────────────
  await insertPipelineEvent(client, sessionId, session.student_id, 2, 'behaviour.analyse', 'processing', eff);
  const l2 = await runBehaviour({ client, session, profile, responses, state, eff, traceId });
  await markPipelineEventCompleted(client, sessionId, 2, 'behaviour.analyse', l2.error, eff);
  if (l2.error !== null) return err(500, 'INTERNAL_ERROR', `L2 behaviour failed: ${l2.error}`);

  // ── 4. L3a Causal-scoped ─────────────────────────────────────────────────
  await insertPipelineEvent(client, sessionId, session.student_id, 3, 'causal.evaluate_scoped', 'processing', eff);
  const l3a = await runCausalScoped({
    client, session, responses,
    touchedSkills: l1.touchedSkills,
    eff, traceId, skillGraph,
  });
  await markPipelineEventCompleted(client, sessionId, 3, 'causal.evaluate_scoped', l3a.error, eff);
  if (l3a.error !== null) return err(500, 'INTERNAL_ERROR', `L3a causal failed: ${l3a.error}`);

  // ── 5. Audit log summary ─────────────────────────────────────────────────
  const processingTimeMs = Math.round(eff.perfNow() - t0);
  const summaryInput = canonicalize({
    session_id: sessionId,
    student_id: session.student_id,
    response_count: responses.length,
    skills_touched: sortBySkillId(l1.touchedSkills.map(s => ({ skill_id: s }))).map(s => s.skill_id),
  });
  const summaryOutput = canonicalize({
    foundation: { skills_touched: l1.touchedSkills.length, mastery_upserts: l1.upsertCount },
    behaviour: { signals_written: l2.signalsWritten, profile_blended: l2.profileBlended },
    causal: { prereqs_walked: l3a.prereqsWalked, misconceptions_upserted: l3a.misconceptionsUpserted },
    processing_time_ms: processingTimeMs,
  });
  const auditInsert = await client.from('intelligence_audit_log').insert({
    student_id: session.student_id,
    tenant_id: session.tenant_id,
    event_type: 'session.processed',
    layer: 'all',
    algorithm_version: ALGORITHM_VERSION,
    trace_id: traceId,
    input_snapshot: JSON.parse(summaryInput),
    output: JSON.parse(summaryOutput),
  });
  if (auditInsert.error !== null) {
    return err(500, 'INTERNAL_ERROR', `audit-log summary insert failed: ${auditInsert.error.message}`);
  }

  return ok<ProcessSessionResponse>({
    status: 'processed',
    session_id: sessionId,
    algorithm_version: ALGORITHM_VERSION,
    processing_time_ms: processingTimeMs,
    layers: {
      foundation: { skills_touched: l1.touchedSkills.length, mastery_upserts: l1.upsertCount },
      behaviour: { signals_written: l2.signalsWritten, profile_blended: l2.profileBlended },
      causal: { prereqs_walked: l3a.prereqsWalked, misconceptions_upserted: l3a.misconceptionsUpserted },
    },
  });
}

// ─── processCausalFull (L3b async) ───────────────────────────────────────────

export async function processCausalFull(
  input: ProcessCausalFullInput,
): Promise<HandlerResult<ProcessCausalFullResponse>> {
  const eff = { ...DEFAULT_EFFECTS, ...input.effects };
  const { client, sessionId, traceId } = input;
  const t0 = eff.perfNow();

  // 0. Dedup (same pattern as processSession, separate event_type).
  const dedupRes = await client
    .from('intelligence_audit_log')
    .select('id')
    .eq('event_type', 'L3b.causal.full')
    .eq('algorithm_version', ALGORITHM_VERSION)
    .eq('input_snapshot->>session_id', sessionId)
    .limit(1);
  if (dedupRes.error !== null) {
    return err(500, 'INTERNAL_ERROR', `L3b dedup lookup failed: ${dedupRes.error.message}`);
  }
  const existing = (dedupRes.data ?? []) as { id: string }[];
  if (existing.length > 0) {
    return ok<ProcessCausalFullResponse>({
      status: 'already_processed',
      session_id: sessionId,
      algorithm_version: ALGORITHM_VERSION,
      processing_time_ms: null,
      causal_full: null,
    });
  }

  // 1. Load session.
  const sessionRes = await client
    .from('session_record')
    .select('id, student_id, tenant_id, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionRes.error !== null) return err(500, 'INTERNAL_ERROR', sessionRes.error.message);
  if (sessionRes.data === null) return err(404, 'NOT_FOUND', `Session '${sessionId}' not found`);
  const session = sessionRes.data as Pick<SessionRow, 'id' | 'student_id' | 'tenant_id' | 'status'>;

  // 2. Load responses → items → touched skills (mirrors L1).
  const responsesRes = await client
    .from('session_response')
    .select('item_id, sequence_number')
    .eq('session_id', sessionId)
    .order('sequence_number', { ascending: true });
  if (responsesRes.error !== null) return err(500, 'INTERNAL_ERROR', responsesRes.error.message);
  const responseRows = (responsesRes.data ?? []) as { item_id: string; sequence_number: number }[];

  const itemIds = [...new Set(responseRows.map(r => r.item_id))].sort();
  let touchedSkills: string[] = [];
  if (itemIds.length > 0) {
    const itemsRes = await client.from('item').select('id, skill_ids').in('id', itemIds);
    if (itemsRes.error !== null) return err(500, 'INTERNAL_ERROR', itemsRes.error.message);
    const skillSet = new Set<string>();
    for (const row of (itemsRes.data ?? []) as ItemRow[]) {
      for (const s of row.skill_ids) skillSet.add(s);
    }
    touchedSkills = [...skillSet].sort();
  }

  // 3. Load skill mastery for this student (all skills → threshold checks).
  const masteryRes = await client
    .from('skill_mastery')
    .select('skill_id, mastery_level')
    .eq('student_id', session.student_id);
  if (masteryRes.error !== null) return err(500, 'INTERNAL_ERROR', masteryRes.error.message);
  const masteryMap = new Map<string, number>(
    ((masteryRes.data ?? []) as { skill_id: string; mastery_level: number }[]).map(r => [
      r.skill_id,
      r.mastery_level,
    ]),
  );

  // 4. Skill graph (same resolution pattern as processSession).
  const skillGraph: SkillGraphCache | null =
    input.skillGraph !== undefined
      ? input.skillGraph
      : input.graphLoader !== undefined
        ? await getSkillGraph(input.graphLoader, eff.perfNow(), traceId)
        : null;
  const adjacency = skillGraph?.adjacency ?? new Map<string, string[]>();
  const downstreamAdj = buildDownstreamAdjacency(adjacency);

  // 5. L3b traversal over touched skills.
  await insertPipelineEvent(client, sessionId, session.student_id, 4, 'causal.evaluate_full', 'processing', eff);

  const rootCausesSet = new Set<string>();
  const unlockedSet = new Set<string>();

  for (const skillId of touchedSkills) {
    const upstream = traverseUpstreamHelper(skillId, new Set(), adjacency, masteryMap);
    for (const rc of upstream) rootCausesSet.add(rc);

    const downstream = traverseDownstreamHelper(skillId, new Set(), downstreamAdj, adjacency, masteryMap);
    for (const u of downstream) unlockedSet.add(u);
  }

  const rootCauses = [...rootCausesSet].sort();
  const unlockedSkills = [...unlockedSet].sort();

  await markPipelineEventCompleted(client, sessionId, 4, 'causal.evaluate_full', null, eff);

  // 6. Audit log.
  const processingTimeMs = Math.round(eff.perfNow() - t0);
  const auditInput = canonicalize({
    session_id: sessionId,
    student_id: session.student_id,
    skills_traversed: touchedSkills.length,
  });
  const auditOutput = canonicalize({
    root_causes: rootCauses,
    unlocked_skills: unlockedSkills,
    processing_time_ms: processingTimeMs,
  });
  const auditIns = await client.from('intelligence_audit_log').insert({
    student_id: session.student_id,
    tenant_id: session.tenant_id,
    event_type: 'L3b.causal.full',
    layer: 'causal',
    algorithm_version: ALGORITHM_VERSION,
    trace_id: traceId,
    input_snapshot: JSON.parse(auditInput),
    output: JSON.parse(auditOutput),
  });
  if (auditIns.error !== null) {
    return err(500, 'INTERNAL_ERROR', `L3b audit-log insert failed: ${auditIns.error.message}`);
  }

  return ok<ProcessCausalFullResponse>({
    status: 'processed',
    session_id: sessionId,
    algorithm_version: ALGORITHM_VERSION,
    processing_time_ms: processingTimeMs,
    causal_full: {
      skills_traversed: touchedSkills.length,
      root_causes: rootCauses,
      unlocked_skills: unlockedSkills,
    },
  });
}

// ─── L3b traversal helpers ───────────────────────────────────────────────────

/**
 * Build reverse adjacency (skill → dependents) from the forward adjacency
 * (skill → prerequisites). Used by traverse_downstream (spec §5.1.4).
 */
function buildDownstreamAdjacency(adjacency: Map<string, string[]>): Map<string, string[]> {
  const down = new Map<string, string[]>();
  for (const [skillId, prereqs] of adjacency) {
    if (!down.has(skillId)) down.set(skillId, []);
    for (const prereqId of prereqs) {
      const list = down.get(prereqId) ?? [];
      if (!list.includes(skillId)) list.push(skillId);
      down.set(prereqId, list);
    }
  }
  return down;
}

/**
 * Recursive upstream traversal per spec §5.1.3.
 *
 * Q-28.8: spec requires strength >= 0.4 filter on edges. Using all cached
 * edges without filtering (Option B). V1 NAPLAN/ICAS content has no enriching
 * edges. Address in v1.1 if content team adds enriching edges.
 *
 * Cap: TRAVERSAL_CAP (50) nodes visited per starting call. On cap: log
 * structured warn, return partial set (never throw — Q-28.6).
 */
function traverseUpstreamHelper(
  skillId: string,
  visited: Set<string>,
  adjacency: Map<string, string[]>,
  masteryMap: Map<string, number>,
): string[] {
  if (visited.has(skillId)) return [];
  if (visited.size >= TRAVERSAL_CAP) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'skill_graph_cycle_cap_hit',
        skill_id: skillId,
        direction: 'upstream',
        visited_count: visited.size,
      }),
    );
    return [];
  }
  visited.add(skillId);

  // Q-28.8: no strength filter — see module docstring.
  const prereqs = [...(adjacency.get(skillId) ?? [])].sort();
  const unmasteredPrereqs = prereqs.filter(
    pid => (masteryMap.get(pid) ?? 0) < MASTERY_THRESHOLD,
  );

  if (unmasteredPrereqs.length === 0) {
    return [skillId];
  }

  const rootCauses = new Set<string>();
  for (const pid of unmasteredPrereqs) {
    for (const rc of traverseUpstreamHelper(pid, visited, adjacency, masteryMap)) {
      rootCauses.add(rc);
    }
  }
  return [...rootCauses].sort();
}

/**
 * Recursive downstream traversal per spec §5.1.4 + Q-28.7 fix
 * (explicit studentId parameter added).
 *
 * Q-28.8: spec requires dependency_class == required filter on edges.
 * Using all edges without filtering. See module docstring.
 */
function traverseDownstreamHelper(
  skillId: string,
  visited: Set<string>,
  downstreamAdj: Map<string, string[]>,
  adjacency: Map<string, string[]>,
  masteryMap: Map<string, number>,
): string[] {
  if (visited.has(skillId)) return [];
  if (visited.size >= TRAVERSAL_CAP) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'skill_graph_cycle_cap_hit',
        skill_id: skillId,
        direction: 'downstream',
        visited_count: visited.size,
      }),
    );
    return [];
  }
  visited.add(skillId);

  const dependents = [...(downstreamAdj.get(skillId) ?? [])].sort();
  const unlocked: string[] = [];

  for (const depId of dependents) {
    // Q-28.8: spec filters dependency_class == required; using all edges.
    const allPrereqs = adjacency.get(depId) ?? [];
    const allMet = allPrereqs.every(pid => (masteryMap.get(pid) ?? 0) >= MASTERY_THRESHOLD);
    if (allMet) {
      unlocked.push(depId);
      for (const u of traverseDownstreamHelper(depId, visited, downstreamAdj, adjacency, masteryMap)) {
        if (!unlocked.includes(u)) unlocked.push(u);
      }
    }
  }
  return unlocked.sort();
}

// ─── Pipeline-event lifecycle helpers ───────────────────────────────────────

async function insertPipelineEvent(
  client: DbClient,
  sessionId: string,
  studentId: string,
  step: number,
  stepName: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  eff: Effects,
): Promise<void> {
  await client.from('pipeline_event').insert({
    session_id: sessionId,
    student_id: studentId,
    step,
    step_name: stepName,
    status,
    started_at: eff.now(),
  });
}

async function markPipelineEventCompleted(
  client: DbClient,
  sessionId: string,
  step: number,
  stepName: string,
  errorMessage: string | null,
  eff: Effects,
): Promise<void> {
  await client
    .from('pipeline_event')
    .update({
      status: errorMessage === null ? 'completed' : 'failed',
      completed_at: eff.now(),
      error: errorMessage,
    })
    .eq('session_id', sessionId)
    .eq('step', step);
}

// ─── L1 Foundation ──────────────────────────────────────────────────────────

interface L1Args {
  client: DbClient;
  session: SessionRow;
  profile: UserProfileRow;
  responses: ResponseRow[];
  state: EngineState;
  eff: Effects;
  traceId: string;
}

interface L1Result {
  touchedSkills: string[];
  upsertCount: number;
  error: string | null;
}

async function runFoundation(args: L1Args): Promise<L1Result> {
  const { client, session, responses, eff, traceId } = args;
  if (responses.length === 0) {
    return { touchedSkills: [], upsertCount: 0, error: null };
  }
  const itemIds = [...new Set(responses.map(r => r.item_id))].sort();
  const itemsRes = await client.from('item').select('id, skill_ids').in('id', itemIds);
  if (itemsRes.error !== null) {
    return { touchedSkills: [], upsertCount: 0, error: itemsRes.error.message };
  }
  const itemRows = (itemsRes.data ?? []) as ItemRow[];
  const itemSkills = new Map<string, string[]>(itemRows.map(r => [r.id, r.skill_ids]));

  const perSkill = new Map<string, ResponseRow[]>();
  for (const resp of responses) {
    const skills = itemSkills.get(resp.item_id) ?? [];
    for (const s of skills) {
      const list = perSkill.get(s) ?? [];
      list.push(resp);
      perSkill.set(s, list);
    }
  }
  const touchedSkills = [...perSkill.keys()].sort();

  const existingRes = await client
    .from('skill_mastery')
    .select('student_id, skill_id, tenant_id, mastery_level, confidence, total_attempts, correct_attempts, streak_current, streak_best')
    .eq('student_id', session.student_id)
    .in('skill_id', touchedSkills);
  if (existingRes.error !== null) {
    return { touchedSkills, upsertCount: 0, error: existingRes.error.message };
  }
  const existing = new Map<string, MasteryRow>(
    ((existingRes.data ?? []) as MasteryRow[]).map(r => [r.skill_id, r]),
  );

  const upserts: MasteryRow[] = [];
  for (const skillId of touchedSkills) {
    const rows = perSkill.get(skillId) ?? [];
    rows.sort((a, b) => a.sequence_number - b.sequence_number);
    const attempts = rows.map(r => ({
      is_correct: r.is_correct,
      difficulty: r.difficulty,
      response_id: r.id,
    }));
    const recent = recencyWeightedAccuracy(attempts);
    const correct = rows.filter(r => r.is_correct === true).length;
    const diffAdjusted =
      rows.length === 0
        ? 0
        : rows.reduce((acc, r) => acc + (r.is_correct === true ? r.difficulty : 0), 0) / rows.length;
    const correctnessSeries: number[] = rows.map(r => (r.is_correct === true ? 1 : 0));
    const seriesLen = Math.max(1, correctnessSeries.length);
    const mean = correctnessSeries.reduce((a: number, b: number) => a + b, 0) / seriesLen;
    const variance =
      correctnessSeries.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / seriesLen;
    const consistency = Math.max(0, 1 - variance * 4);
    const behaviour_penalty = 0;
    const computed = masteryFormula({ recent_accuracy: recent, difficulty_adjusted: diffAdjusted, consistency, behaviour_penalty });

    const prior = existing.get(skillId);
    const totalAttempts = (prior?.total_attempts ?? 0) + rows.length;
    const correctAttempts = (prior?.correct_attempts ?? 0) + correct;
    let streakCurrent = prior?.streak_current ?? 0;
    let streakBest = prior?.streak_best ?? 0;
    for (const r of rows) {
      if (r.is_correct === true) {
        streakCurrent += 1;
        streakBest = Math.max(streakBest, streakCurrent);
      } else {
        streakCurrent = 0;
      }
    }
    const confidence = Math.min(1, totalAttempts / 30);
    upserts.push({
      student_id: session.student_id,
      skill_id: skillId,
      tenant_id: session.tenant_id,
      mastery_level: computed,
      confidence,
      total_attempts: totalAttempts,
      correct_attempts: correctAttempts,
      streak_current: streakCurrent,
      streak_best: streakBest,
    });
  }

  const upsertRes = await client.from('skill_mastery').upsert(upserts, { onConflict: 'student_id,skill_id' });
  if (upsertRes.error !== null) {
    return { touchedSkills, upsertCount: 0, error: upsertRes.error.message };
  }

  const velocityRows = upserts.map(u => ({
    student_id: u.student_id,
    skill_id: u.skill_id,
    tenant_id: u.tenant_id,
    velocity: u.mastery_level - (existing.get(u.skill_id)?.mastery_level ?? 0),
    window_days: 14,
    computed_at: args.eff.now(),
  }));
  const velRes = await client.from('learning_velocity').upsert(velocityRows, { onConflict: 'student_id,skill_id' });
  if (velRes.error !== null) {
    return { touchedSkills, upsertCount: upserts.length, error: velRes.error.message };
  }

  const auditInput = canonicalize({
    skills: sortBySkillId(upserts.map(u => ({ skill_id: u.skill_id, attempts: u.total_attempts, correct: u.correct_attempts }))),
  });
  const auditOutput = canonicalize({
    skills: sortBySkillId(upserts.map(u => ({ skill_id: u.skill_id, mastery_level: u.mastery_level, confidence: u.confidence }))),
  });
  await client.from('intelligence_audit_log').insert({
    student_id: session.student_id,
    tenant_id: session.tenant_id,
    event_type: 'L1.foundation',
    layer: 'foundation',
    algorithm_version: ALGORITHM_VERSION,
    trace_id: traceId,
    input_snapshot: JSON.parse(auditInput),
    output: JSON.parse(auditOutput),
  });

  return { touchedSkills, upsertCount: upserts.length, error: null };
}

// ─── L2 Behaviour ───────────────────────────────────────────────────────────

interface L2Args {
  client: DbClient;
  session: SessionRow;
  profile: UserProfileRow;
  responses: ResponseRow[];
  state: EngineState;
  eff: Effects;
  traceId: string;
}

interface L2Result {
  signalsWritten: number;
  profileBlended: boolean;
  error: string | null;
}

async function runBehaviour(args: L2Args): Promise<L2Result> {
  const { client, session, profile, responses, eff, traceId } = args;
  if (responses.length === 0) {
    return { signalsWritten: 0, profileBlended: false, error: null };
  }

  const expectedTimeMs = engineExpectedTime(args.state);

  const signalRows = responses.map(r => {
    const tel = r.telemetry ?? { time_to_answer_ms: 0, answer_changes: 0 };
    const guess = guessProbability({
      time_to_answer_ms: tel.time_to_answer_ms,
      expected_time_ms: expectedTimeMs,
      is_correct: r.is_correct,
      answer_changes: tel.answer_changes,
    });
    return {
      tenant_id: session.tenant_id,
      session_id: session.id,
      student_id: session.student_id,
      sequence_number: r.sequence_number,
      event_type: 'behaviour_signal',
      item_id: r.item_id,
      duration_ms: tel.time_to_answer_ms,
      metadata: { guess_probability: guess, response_id: r.id },
      created_at: eff.now(),
    };
  });
  const evIns = await client.from('learning_event').insert(signalRows);
  if (evIns.error !== null) {
    return { signalsWritten: 0, profileBlended: false, error: evIns.error.message };
  }

  const baseline = avg(responses.slice(0, 5).map(r => (r.is_correct === true ? 1 : 0)));
  const recent = avg(responses.slice(-5).map(r => (r.is_correct === true ? 1 : 0)));
  const totalDurationMs = responses.reduce((a, r) => a + (r.telemetry?.time_to_answer_ms ?? 0), 0);
  const fatigueThresholdMs = yearLevelDefaults(profile.year_level).avg_fatigue_onset_minutes * 60_000;
  const avgEarly = avg(responses.slice(0, 5).map(r => r.telemetry?.time_to_answer_ms ?? 0));
  const avgRecent = avg(responses.slice(-5).map(r => r.telemetry?.time_to_answer_ms ?? 0));
  const fatigue = fatigueScore({
    baseline_accuracy: baseline,
    recent_accuracy: recent,
    time_since_start_ms: totalDurationMs,
    fatigue_threshold_ms: fatigueThresholdMs,
    avg_time_recent_ms: avgRecent,
    avg_time_early_ms: avgEarly,
  });
  const consec3 = countConsecutiveIncorrectRunsOf3Plus(responses);
  const avgChanges = avg(responses.map(r => r.telemetry?.answer_changes ?? 0));
  const avgTime = avg(responses.map(r => r.telemetry?.time_to_answer_ms ?? 0));
  const cogLoad = cognitiveLoad({
    consecutive_incorrect_runs_3plus: consec3,
    total_items_in_window: responses.length,
    avg_time_to_answer_ms: avgTime,
    expected_time_ms: expectedTimeMs,
    avg_answer_changes: avgChanges,
  });
  const avgGuess = avg(signalRows.map(r => (r.metadata.guess_probability as number)));

  const bpRes = await client
    .from('behaviour_profile')
    .select('student_id, data_points, computed_at')
    .eq('student_id', session.student_id)
    .maybeSingle();
  if (bpRes.error !== null) {
    return { signalsWritten: signalRows.length, profileBlended: false, error: bpRes.error.message };
  }
  const prior = bpRes.data as BehaviourProfileRow | null;
  const newDataPoints = (prior?.data_points ?? 0) + 1;

  const computed: BehaviourDefaults = {
    avg_guess_rate: avgGuess,
    avg_fatigue_onset_minutes: minutesFromMs(fatigueThresholdMs),
    persistence_score: clamp01(1 - cogLoad),
    avg_cognitive_load_comfort: clamp01(1 - cogLoad),
    time_pressure_sensitivity: clamp01(fatigue),
    session_length_sweet_spot: minutesFromMs(fatigueThresholdMs),
  };
  const defaults = yearLevelDefaults(profile.year_level);
  const blended = blendBehaviour(computed, defaults, newDataPoints);

  const upRes = await client.from('behaviour_profile').upsert({
    student_id: session.student_id,
    tenant_id: session.tenant_id,
    avg_guess_rate: blended.avg_guess_rate,
    avg_fatigue_onset_minutes: blended.avg_fatigue_onset_minutes,
    persistence_score: blended.persistence_score,
    avg_cognitive_load_comfort: blended.avg_cognitive_load_comfort,
    time_pressure_sensitivity: blended.time_pressure_sensitivity,
    session_length_sweet_spot: blended.session_length_sweet_spot,
    data_points: newDataPoints,
    computed_at: eff.now(),
  }, { onConflict: 'student_id' });
  if (upRes.error !== null) {
    return { signalsWritten: signalRows.length, profileBlended: false, error: upRes.error.message };
  }

  const auditInput = canonicalize({ session_id: session.id, response_count: responses.length, year_level: profile.year_level });
  const auditOutput = canonicalize({
    avg_guess_rate: blended.avg_guess_rate,
    fatigue_onset_minutes: blended.avg_fatigue_onset_minutes,
    cognitive_load_comfort: blended.avg_cognitive_load_comfort,
    data_points: newDataPoints,
  });
  await client.from('intelligence_audit_log').insert({
    student_id: session.student_id,
    tenant_id: session.tenant_id,
    event_type: 'L2.behaviour',
    layer: 'behaviour',
    algorithm_version: ALGORITHM_VERSION,
    trace_id: traceId,
    input_snapshot: JSON.parse(auditInput),
    output: JSON.parse(auditOutput),
  });

  return { signalsWritten: signalRows.length, profileBlended: true, error: null };
}

// ─── L3a Causal-scoped ──────────────────────────────────────────────────────

interface L3aArgs {
  client: DbClient;
  session: SessionRow;
  responses: ResponseRow[];
  touchedSkills: string[];
  eff: Effects;
  traceId: string;
  /** ADR-0028 / ISSUE-0006 fix: graph loaded by processSession. Null = empty adjacency. */
  skillGraph: SkillGraphCache | null;
}

interface L3aResult {
  prereqsWalked: number;
  misconceptionsUpserted: number;
  error: string | null;
}

async function runCausalScoped(args: L3aArgs): Promise<L3aResult> {
  const { client, session, responses, touchedSkills, eff, traceId, skillGraph } = args;

  // ADR-0028 (ISSUE-0006 fix): use skill-graph-cache adjacency instead of a
  // direct skill_edge query. After Stage 28 there must be zero direct
  // skill_edge queries in this file (exit criterion grep check).
  const adjacency = skillGraph?.adjacency ?? new Map<string, string[]>();
  const walked = walkPrereqsDepth1(touchedSkills, adjacency);

  const incorrectResponses = responses.filter(r => r.is_correct === false);
  const incorrectItemIds = [...new Set(incorrectResponses.map(r => r.item_id))].sort();
  const misconceptionUpserts: {
    student_id: string;
    tenant_id: string;
    misconception_id: string;
    confidence: number;
    status: 'suspected';
    evidence: Record<string, unknown>;
  }[] = [];

  if (incorrectItemIds.length > 0) {
    const ivRes = await client
      .from('item_version')
      .select('item_id, distractor_rationale')
      .in('item_id', incorrectItemIds)
      .eq('is_current', true);
    if (ivRes.error !== null) {
      return { prereqsWalked: walked.length, misconceptionsUpserted: 0, error: ivRes.error.message };
    }
    const versions = new Map<string, ItemVersionRow>(
      ((ivRes.data ?? []) as ItemVersionRow[]).map(r => [r.item_id, r]),
    );
    for (const r of incorrectResponses) {
      const iv = versions.get(r.item_id);
      if (iv === undefined || iv.distractor_rationale === null) continue;
      const choiceId = (r.response_data['choice_id'] ?? r.response_data['selected_id']) as string | undefined;
      if (typeof choiceId !== 'string') continue;
      const entry = iv.distractor_rationale[choiceId];
      if (entry === undefined || entry.misconception_id === undefined) continue;
      misconceptionUpserts.push({
        student_id: session.student_id,
        tenant_id: session.tenant_id,
        misconception_id: entry.misconception_id,
        confidence: 0.6,
        status: 'suspected',
        evidence: { session_id: session.id, response_id: r.id, item_id: r.item_id },
      });
    }
  }

  if (misconceptionUpserts.length > 0) {
    const upRes = await client.from('student_misconception').upsert(misconceptionUpserts, {
      onConflict: 'student_id,misconception_id',
    });
    if (upRes.error !== null) {
      return { prereqsWalked: walked.length, misconceptionsUpserted: 0, error: upRes.error.message };
    }
  }

  const auditInput = canonicalize({
    touched: touchedSkills,
    incorrect_response_count: incorrectResponses.length,
  });
  const auditOutput = canonicalize({
    prereqs_walked: walked,
    misconceptions: sortMisconceptions(misconceptionUpserts).map(m => m.misconception_id),
  });
  await client.from('intelligence_audit_log').insert({
    student_id: session.student_id,
    tenant_id: session.tenant_id,
    event_type: 'L3a.causal',
    layer: 'causal',
    algorithm_version: ALGORITHM_VERSION,
    trace_id: traceId,
    input_snapshot: JSON.parse(auditInput),
    output: JSON.parse(auditOutput),
  });

  return { prereqsWalked: walked.length, misconceptionsUpserted: misconceptionUpserts.length, error: null };
}

// ─── Local utilities ────────────────────────────────────────────────────────

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function minutesFromMs(ms: number): number {
  return Math.round(ms / 60_000);
}

function countConsecutiveIncorrectRunsOf3Plus(responses: ResponseRow[]): number {
  let runs = 0;
  let streak = 0;
  for (const r of responses) {
    if (r.is_correct === false) {
      streak += 1;
      if (streak === 3) runs += 1;
    } else {
      streak = 0;
    }
  }
  return runs;
}

function engineExpectedTime(state: EngineState): number {
  if (state.engine_type === 'skill') return state.expected_time_per_item_ms;
  return 30_000;
}

function sortMisconceptions<T extends { misconception_id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.misconception_id < b.misconception_id ? -1 : a.misconception_id > b.misconception_id ? 1 : 0,
  );
}

// ─── L5 Predictive Intelligence ──────────────────────────────────────────────

export const L5_ALGORITHM_VERSION = 'L5.v1' as const;

const L5_SKILL_THRESHOLD = 0.6;
const L5_TARGET_THRESHOLD_DEFAULT = 0.7;
const L5_MASTERY_DATE_CAP_DAYS = 365;

interface BlueprintStrand {
  slug: string;
  weight: number;
}

interface L5Blueprint {
  strands: BlueprintStrand[];
}

interface L5ScoringRules {
  target_threshold?: number;
  [key: string]: unknown;
}

export interface PredictiveRefreshInput {
  student_id: string;
  pathway_slug: string;
  exam_date?: string | null;
  tenant_id: string;
  trace_id: string;
}

export interface PredictiveSkillGap {
  skill_id: string;
  mastery_level: number;
  velocity: number;
  estimated_mastery_date: string | null;
}

export type PredictiveRefreshPayload =
  | { status: 'insufficient_data' }
  | {
      status: 'fresh';
      current_readiness_score: number;
      projected_readiness: number | null;
      on_track: boolean | null;
      gap_skills: PredictiveSkillGap[];
      data_points: number;
      computed_at: string;
    };

export type PredictiveRefreshResult =
  | { already_processed: true }
  | PredictiveRefreshPayload;

export interface GetPredictionsResponse {
  status: 'fresh' | 'stale' | 'no_data';
  stale_since: string | null;
  payload: unknown;
}

/**
 * L5 predictive-refresh handler (spec §12).
 *
 * ADR-0032: pipeline_event.session_id is NOT NULL — L5 has no session, so
 * pipeline_event writes are skipped. intelligence_audit_log is the sole
 * observability surface for this step.
 *
 * Dedup key: (event_type='L5.predictive.refresh', algorithm_version, student_id,
 * pathway_slug) — differs from L1–L3 session-scoped dedup because L5 operates
 * at the student+pathway level across all sessions, not per-session. A student
 * should be refreshed at most once per (pathway, algorithm version) run.
 */
export async function processPredictiveRefresh(
  input: PredictiveRefreshInput,
  db: DbClient,
  effects?: Partial<Effects>,
): Promise<HandlerResult<PredictiveRefreshResult>> {
  const eff = { ...DEFAULT_EFFECTS, ...effects };
  const t0 = eff.perfNow();
  const {
    student_id: studentId,
    pathway_slug: pathwaySlug,
    exam_date: examDate,
    tenant_id: tenantId,
    trace_id: traceId,
  } = input;

  // 0. Dedup — (student_id, pathway_slug, algorithm_version).
  // L1–L3 dedup is session-scoped (input_snapshot->>session_id); L5 is
  // student+pathway-scoped because predictive-refresh aggregates across all
  // pathway sessions, not a single session.
  const dedupRes = await db
    .from('intelligence_audit_log')
    .select('id')
    .eq('event_type', 'L5.predictive.refresh')
    .eq('algorithm_version', L5_ALGORITHM_VERSION)
    .eq('input_snapshot->>student_id', studentId)
    .eq('input_snapshot->>pathway_slug', pathwaySlug)
    .limit(1);
  if (dedupRes.error !== null) {
    return err(500, 'INTERNAL_ERROR', `L5 dedup lookup failed: ${dedupRes.error.message}`);
  }
  if (((dedupRes.data ?? []) as unknown[]).length > 0) {
    return ok<PredictiveRefreshResult>({ already_processed: true });
  }

  // 1. Load user_profile for year_level → retention half-life.
  const profileRes = await db
    .from('user_profile')
    .select('id, year_level')
    .eq('id', studentId)
    .maybeSingle();
  if (profileRes.error !== null) return err(500, 'INTERNAL_ERROR', profileRes.error.message);
  if (profileRes.data === null) return err(404, 'NOT_FOUND', `Student '${studentId}' not found`);
  const profile = profileRes.data as { id: string; year_level: string | null };
  const yearLevelNum = profile.year_level !== null
    ? parseInt(profile.year_level.replace(/\D/g, ''), 10)
    : 0;
  const halfLifeDays = retentionHalfLifeDays(Number.isNaN(yearLevelNum) ? 0 : yearLevelNum);

  // 2. Load pathway.
  const pathwayRes = await db
    .from('pathway')
    .select('id, slug, framework_config_id')
    .eq('slug', pathwaySlug)
    .maybeSingle();
  if (pathwayRes.error !== null) return err(500, 'INTERNAL_ERROR', pathwayRes.error.message);
  if (pathwayRes.data === null) return err(404, 'NOT_FOUND', `Pathway '${pathwaySlug}' not found`);
  const pathway = pathwayRes.data as { id: string; slug: string; framework_config_id: string };

  // 3. Load framework_config (blueprint strands + scoring_rules).
  const frameworkRes = await db
    .from('framework_config')
    .select('id, blueprint, scoring_rules')
    .eq('id', pathway.framework_config_id)
    .maybeSingle();
  if (frameworkRes.error !== null) return err(500, 'INTERNAL_ERROR', frameworkRes.error.message);
  if (frameworkRes.data === null) {
    return err(500, 'INTERNAL_ERROR', `framework_config '${pathway.framework_config_id}' not found`);
  }
  const frameworkConfig = frameworkRes.data as {
    id: string;
    blueprint: L5Blueprint;
    scoring_rules: L5ScoringRules;
  };
  const blueprint = frameworkConfig.blueprint;
  const targetThreshold =
    (frameworkConfig.scoring_rules.target_threshold as number | undefined) ??
    L5_TARGET_THRESHOLD_DEFAULT;
  const blueprintWeightBySlug = new Map(blueprint.strands.map(s => [s.slug, s.weight]));

  // 4. Load pathway leaf skills (level='skill', filtered by exam family client-side).
  // Exam family is extracted from pathway slug prefix (v1: 'naplan', 'icas').
  const examFamily = pathwaySlug.split('-')[0] ?? '';
  const allSkillsRes = await db
    .from('skill_node')
    .select('id, slug, parent_id, pathway_tags')
    .eq('level', 'skill');
  if (allSkillsRes.error !== null) return err(500, 'INTERNAL_ERROR', allSkillsRes.error.message);
  const allSkills = (allSkillsRes.data ?? []) as Array<{
    id: string;
    slug: string;
    parent_id: string;
    pathway_tags: string[];
  }>;
  const pathwaySkills =
    examFamily !== ''
      ? allSkills.filter(s => s.pathway_tags.includes(examFamily))
      : allSkills;
  const skillIds = pathwaySkills.map(s => s.id).sort();

  if (skillIds.length === 0) {
    return err(404, 'NOT_FOUND', `No skills found for pathway '${pathwaySlug}'`);
  }

  // 5. Load skill_mastery for student × pathway skills.
  const masteryRes = await db
    .from('skill_mastery')
    .select('skill_id, mastery_level, total_attempts, last_attempted_at')
    .eq('student_id', studentId)
    .in('skill_id', skillIds);
  if (masteryRes.error !== null) return err(500, 'INTERNAL_ERROR', masteryRes.error.message);
  const masteryRows = (masteryRes.data ?? []) as Array<{
    skill_id: string;
    mastery_level: number;
    total_attempts: number;
    last_attempted_at: string | null;
  }>;

  // 6. Load strand nodes (for blueprint weight mapping via parent_id).
  const strandIds = [...new Set(pathwaySkills.map(s => s.parent_id))].sort();
  const strandRes = await db
    .from('skill_node')
    .select('id, slug')
    .in('id', strandIds);
  if (strandRes.error !== null) return err(500, 'INTERNAL_ERROR', strandRes.error.message);
  const strandRows = (strandRes.data ?? []) as Array<{ id: string; slug: string }>;
  const strandById = new Map(strandRows.map(s => [s.id, s.slug]));

  // 7. Load learning_velocity for student × pathway skills.
  const velocityRes = await db
    .from('learning_velocity')
    .select('skill_id, velocity')
    .eq('student_id', studentId)
    .in('skill_id', skillIds);
  if (velocityRes.error !== null) return err(500, 'INTERNAL_ERROR', velocityRes.error.message);
  const velocityRows = (velocityRes.data ?? []) as Array<{ skill_id: string; velocity: number }>;
  const velocityMap = new Map(velocityRows.map(v => [v.skill_id, v.velocity]));

  // 8. Build mastery map + §12.4 data-threshold guard.
  const masteryRowMap = new Map(masteryRows.map(r => [r.skill_id, r]));
  const totalAttempts = masteryRows.reduce((s, r) => s + r.total_attempts, 0);
  const attemptDates = masteryRows
    .filter(r => r.last_attempted_at !== null)
    .map(r => new Date(r.last_attempted_at!).getTime());
  const nowMs = new Date(eff.now()).getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const oldestAttemptMs = attemptDates.length > 0 ? Math.min(...attemptDates) : nowMs;
  const sufficientData = totalAttempts >= 5 && nowMs - oldestAttemptMs >= sevenDaysMs;

  const nowIso = eff.now();
  const nowDate = new Date(nowIso);
  nowDate.setMinutes(0, 0, 0);
  const timeBucket = nowDate.toISOString();

  if (!sufficientData) {
    const insufficientPayload: PredictiveRefreshPayload = { status: 'insufficient_data' };
    // ISSUE-0015: category mismatch accepted; v1.1 migrates to dedicated student_prediction_cache table
    await db.from('cohort_metric_cache').upsert(
      {
        cohort_key: studentId,
        metric_key: `readiness:${pathwaySlug}`,
        time_bucket: timeBucket,
        tenant_id: tenantId,
        value: insufficientPayload,
        computed_at: nowIso,
      },
      { onConflict: 'cohort_key,metric_key,time_bucket,tenant_id' },
    );
    await db.from('intelligence_audit_log').insert({
      student_id: studentId,
      tenant_id: tenantId,
      event_type: 'L5.predictive.refresh',
      layer: 'predictive',
      algorithm_version: L5_ALGORITHM_VERSION,
      trace_id: traceId,
      input_snapshot: JSON.parse(
        canonicalize({ student_id: studentId, pathway_slug: pathwaySlug, skill_count: skillIds.length, data_points: totalAttempts }),
      ),
      output: JSON.parse(canonicalize({ status: 'insufficient_data', processing_time_ms: Math.round(eff.perfNow() - t0) })),
    });
    return ok<PredictiveRefreshResult>(insufficientPayload);
  }

  // 9. Compute current_readiness_score (§10.3 strand-weighted sum).
  // Skills grouped by strand; avg mastery per strand; weighted by blueprint weight.
  // Sorted strandId ASC for replay determinism (ADR-0027).
  const strandMastery = new Map<string, number[]>();
  for (const skill of [...pathwaySkills].sort((a, b) => a.id.localeCompare(b.id))) {
    const mastery = masteryRowMap.get(skill.id)?.mastery_level ?? 0;
    const levels = strandMastery.get(skill.parent_id) ?? [];
    levels.push(mastery);
    strandMastery.set(skill.parent_id, levels);
  }
  const currentReadinessScore = computeStrandWeightedScore(strandMastery, strandById, blueprintWeightBySlug);

  // 10. Projected readiness (§12.1) — only when exam_date provided.
  let projectedReadiness: number | null = null;
  let onTrack: boolean | null = null;

  if (examDate !== null && examDate !== undefined && examDate !== '') {
    const examDateMs = new Date(examDate).getTime();
    const daysRemaining = Math.max(0, (examDateMs - nowMs) / (24 * 60 * 60 * 1000));

    const strandProjected = new Map<string, number[]>();
    for (const skill of [...pathwaySkills].sort((a, b) => a.id.localeCompare(b.id))) {
      const mastery = masteryRowMap.get(skill.id)?.mastery_level ?? 0;
      const velocity = velocityMap.get(skill.id) ?? 0;
      let projected = Math.min(1.0, mastery + velocity * daysRemaining);
      projected *= Math.exp(-0.693 * daysRemaining / halfLifeDays);
      const arr = strandProjected.get(skill.parent_id) ?? [];
      arr.push(projected);
      strandProjected.set(skill.parent_id, arr);
    }
    projectedReadiness = computeStrandWeightedScore(strandProjected, strandById, blueprintWeightBySlug);
    onTrack = projectedReadiness >= targetThreshold;
  }

  // 11. Gap skills (§12.3) — sorted skill_id ASC for replay determinism.
  const gapSkills: PredictiveSkillGap[] = [];
  for (const skill of [...pathwaySkills].sort((a, b) => a.id.localeCompare(b.id))) {
    const mastery = masteryRowMap.get(skill.id)?.mastery_level ?? 0;
    if (mastery < L5_SKILL_THRESHOLD) {
      const velocity = velocityMap.get(skill.id) ?? 0;
      const daysNeeded = predictMasteryDateDays(mastery, velocity, L5_SKILL_THRESHOLD);
      const estimatedMasteryDate =
        daysNeeded !== null
          ? new Date(nowMs + daysNeeded * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? null
          : null;
      gapSkills.push({ skill_id: skill.id, mastery_level: mastery, velocity, estimated_mastery_date: estimatedMasteryDate });
    }
  }

  // 12. UPSERT cohort_metric_cache.
  // ISSUE-0015: category mismatch accepted; v1.1 migrates to dedicated student_prediction_cache table
  const payload: PredictiveRefreshPayload = {
    status: 'fresh',
    current_readiness_score: currentReadinessScore,
    projected_readiness: projectedReadiness,
    on_track: onTrack,
    gap_skills: gapSkills,
    data_points: totalAttempts,
    computed_at: nowIso,
  };
  await db.from('cohort_metric_cache').upsert(
    {
      cohort_key: studentId,
      metric_key: `readiness:${pathwaySlug}`,
      time_bucket: timeBucket,
      tenant_id: tenantId,
      value: payload,
      computed_at: nowIso,
    },
    { onConflict: 'cohort_key,metric_key,time_bucket,tenant_id' },
  );

  // 13. INSERT intelligence_audit_log.
  const processingTimeMs = Math.round(eff.perfNow() - t0);
  await db.from('intelligence_audit_log').insert({
    student_id: studentId,
    tenant_id: tenantId,
    event_type: 'L5.predictive.refresh',
    layer: 'predictive',
    algorithm_version: L5_ALGORITHM_VERSION,
    trace_id: traceId,
    input_snapshot: JSON.parse(
      canonicalize({ student_id: studentId, pathway_slug: pathwaySlug, skill_count: skillIds.length, data_points: totalAttempts }),
    ),
    output: JSON.parse(canonicalize({ current_readiness_score: currentReadinessScore, gap_skill_count: gapSkills.length, processing_time_ms: processingTimeMs })),
  });

  return ok<PredictiveRefreshResult>(payload);
}

/**
 * Caller identity passed to getPredictions for role-gated access control.
 * null = service-role caller (bypasses all checks).
 * Role 'teacher' / 'admin' / 'platform_admin' can read any student's predictions.
 * All other roles (student, parent) may only read their own (userId === studentId).
 */
export type PredictionsCallerContext = { userId: string; role: string } | null;

/**
 * GET /intelligence/predictions — reads cohort_metric_cache and returns
 * fresh / stale / no_data envelope per spec constraints §1h TTL.
 *
 * Auth (arch §6.3): service-role → bypass; teacher/admin → any student;
 * student/parent → own predictions only (userId must match studentId).
 */
export async function getPredictions(
  studentId: string,
  pathwaySlug: string,
  db: DbClient,
  caller: PredictionsCallerContext,
  effects?: Partial<Effects>,
): Promise<HandlerResult<GetPredictionsResponse>> {
  const eff = { ...DEFAULT_EFFECTS, ...effects };

  // Role gate — null caller = service-role bypass.
  if (caller !== null) {
    const canReadAny =
      caller.role === 'teacher' ||
      caller.role === 'admin' ||
      caller.role === 'platform_admin';
    if (!canReadAny && caller.userId !== studentId) {
      return err(403, 'FORBIDDEN', 'Students may only read their own predictions');
    }
  }

  const cacheRes = await db
    .from('cohort_metric_cache')
    .select('value, computed_at')
    .eq('cohort_key', studentId)
    .eq('metric_key', `readiness:${pathwaySlug}`)
    .order('computed_at', { ascending: false })
    .limit(1);

  if (cacheRes.error !== null) {
    return err(500, 'INTERNAL_ERROR', cacheRes.error.message);
  }

  const rows = (cacheRes.data ?? []) as Array<{ value: unknown; computed_at: string }>;
  if (rows.length === 0) {
    return ok<GetPredictionsResponse>({ status: 'no_data', stale_since: null, payload: null });
  }

  const row = rows[0]!;
  const nowMs = new Date(eff.now()).getTime();
  const computedAtMs = new Date(row.computed_at).getTime();
  const oneHourMs = 60 * 60 * 1000;
  const isFresh = computedAtMs > nowMs - oneHourMs;

  if (isFresh) {
    return ok<GetPredictionsResponse>({ status: 'fresh', stale_since: null, payload: row.value });
  }
  return ok<GetPredictionsResponse>({ status: 'stale', stale_since: row.computed_at, payload: row.value });
}

// ─── L5 pure helpers ─────────────────────────────────────────────────────────

function computeStrandWeightedScore(
  strandLevels: Map<string, number[]>,
  strandById: Map<string, string>,
  blueprintWeightBySlug: Map<string, number>,
): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const strandId of [...strandLevels.keys()].sort()) {
    const levels = strandLevels.get(strandId)!;
    const strandSlug = strandById.get(strandId);
    const weight = strandSlug !== undefined ? (blueprintWeightBySlug.get(strandSlug) ?? 0) : 0;
    const avgMastery = levels.reduce((s, m) => s + m, 0) / levels.length;
    weightedSum += avgMastery * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function predictMasteryDateDays(
  current: number,
  velocity: number,
  target: number,
): number | null {
  if (velocity <= 0) return null;
  const rawDays = (target - current) / velocity;
  const adjusted = rawDays * (1 + 0.5 * current);
  if (adjusted > L5_MASTERY_DATE_CAP_DAYS) {
    console.warn(
      JSON.stringify({ level: 'warn', event: 'mastery_date_capped', adjusted_days: adjusted, capped_at: L5_MASTERY_DATE_CAP_DAYS }),
    );
    return L5_MASTERY_DATE_CAP_DAYS;
  }
  return Math.ceil(adjusted);
}
