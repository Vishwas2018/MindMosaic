/**
 * assessment-svc handlers — Stage 19.
 *
 * Pure functions: each handler accepts a Supabase-client-like object + the
 * minimal context it needs (caller user_id, tenant_id, lock token, body),
 * returns a tagged `HandlerResult<T>`. The Deno dispatcher (`index.ts`)
 * serialises results into HTTP responses; tests assert on the data/result
 * shape directly.
 *
 * Spec refs: arch §4.4 (endpoints), §7.3 (idempotency), spec §3.4 (session
 * state machine), §3.6 (DTO contracts), §3.7 (autosave / recovery), §21.0.2
 * (concurrency). ADR-0026 governs lock-token rotation.
 *
 * Stage 18 split pattern: this file is Node-testable Vitest; the Deno
 * `index.ts` wires URL imports and serves HTTP. No URL imports here.
 */

import {
  LinearEngine,
  SkillEngine,
  DiagnosticEngine,
  AdaptiveEngine,
  EngineStateSchema,
  scoreWithConfig as linearScoreWithConfig,
  terminateWithConfig as linearTerminateWithConfig,
  scoreAdaptiveWithConfig,
  terminateAdaptiveWithConfig,
  type EngineState,
  type EngineResponse,
  type EngineItem,
  type FrameworkConfig,
  type SessionContext,
  type ScoreResult,
  type FinalResult,
  type AssessmentEngine,
  type EngineType,
  isTerminationSignal,
} from '@mm/engines';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  RecordResponseRequest,
  RecordResponseResponse,
  SubmitSessionResponse,
  SessionStateDTO,
  SessionSummaryDTO,
  CheckpointRequest,
  PracticeExamComposerParams,
  SessionId,
  SkillId,
  ItemId,
} from '@mm/types';
import { checkFeatureFlag, type FeatureFlagDbClient } from '../_shared/feature-gate.ts';

// ─── Shared types ────────────────────────────────────────────────────────────

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

/**
 * Minimal SupabaseClient-like surface. The Deno client and Vitest mocks
 * satisfy this structurally. Avoids hard-binding to URL imports.
 */
export interface DbClient {
  from(table: string): DbBuilder;
  rpc(name: string, args?: Record<string, unknown>): Promise<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
}

export type DbBuilder = {
  select: (cols: string) => DbBuilder;
  insert: (row: unknown) => DbBuilder;
  update: (patch: unknown) => DbBuilder;
  upsert: (row: unknown, opts?: { onConflict?: string }) => DbBuilder;
  delete: () => DbBuilder;
  eq: (col: string, val: unknown) => DbBuilder;
  in: (col: string, vals: unknown[]) => DbBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => DbBuilder;
  limit: (n: number) => DbBuilder;
  range: (from: number, to: number) => DbBuilder;
  maybeSingle: () => Promise<{ data: unknown | null; error: { message: string; code?: string } | null }>;
  single: () => Promise<{ data: unknown | null; error: { message: string; code?: string } | null }>;
} & PromiseLike<{
  data: unknown[] | null;
  count: number | null;
  error: { message: string; code?: string } | null;
}>;

/**
 * HTTP fetch surface for the content-svc /content/select call. Injected so
 * tests can stub without going through Deno's fetch.
 *
 * v1.1-S2 (ADR-0036): `composer` carries the practice-exam composition
 * parameters + seed end-to-end. Seed is derived from `session_id` at
 * createSession call time (ADR-0036 §Decision 4) so the assembled item list
 * is replay-deterministic. Absent → existing blueprint / adaptive routing.
 */
export type ContentSelectFetcher = (input: {
  pathway_id: string;
  blueprint_id?: string;
  exclude_recently_seen?: string[];
  target_difficulty_band?: 'easy' | 'mid' | 'hard';
  composer?: {
    item_count: number;
    difficulty_distribution: { easy: number; mid: number; hard: number };
    seed: string;
  };
}) => Promise<{ ok: true; data: EngineItem[] } | { ok: false; status: number; code: string; message: string }>;

/**
 * Clock + random injection so handlers are pure and replay-deterministic.
 */
export interface Effects {
  /** ISO timestamp; default `new Date().toISOString()`. */
  now: () => string;
  /** UUID generator; default `crypto.randomUUID()`. */
  uuid: () => string;
  /** Numeric milliseconds clock (for engine.terminate); default `Date.now()`. */
  ms: () => number;
}

export const DEFAULT_EFFECTS: Effects = {
  now: () => new Date().toISOString(),
  uuid: () => crypto.randomUUID(),
  ms: () => Date.now(),
};

// ─── Engine dispatch ─────────────────────────────────────────────────────────

function pickEngine(engineType: EngineType): AssessmentEngine {
  switch (engineType) {
    case 'linear':
      return LinearEngine;
    case 'skill':
      return SkillEngine;
    case 'diagnostic':
      return DiagnosticEngine;
    case 'adaptive':
      return AdaptiveEngine;
    case 'repair':
      throw new Error('RepairEngine is v1.1 — not available in v1');
  }
}

function scoreForConfig(state: EngineState, config: FrameworkConfig): ScoreResult {
  if (state.engine_type === 'linear') return linearScoreWithConfig(state, config);
  if (state.engine_type === 'adaptive') return scoreAdaptiveWithConfig(state, config);
  // skill + diagnostic emit neutral score; their real outputs are mastery/proficiency
  return pickEngine(state.engine_type).score(state);
}

function terminateForConfig(
  state: EngineState,
  reason: 'user_submitted' | 'timer_expired' | 'completed',
  config: FrameworkConfig,
  clock: () => number,
): FinalResult {
  if (state.engine_type === 'linear') return linearTerminateWithConfig(state, reason, clock, config);
  if (state.engine_type === 'adaptive') return terminateAdaptiveWithConfig(state, reason, clock, config);
  return pickEngine(state.engine_type).terminate(state, reason, clock);
}

// ─── DB row shapes (subset of session_record / pathway / framework_config) ───

interface SessionRow {
  id: string;
  student_id: string;
  tenant_id: string;
  pathway_id: string | null;
  assessment_profile_id: string | null;
  engine_type: EngineType;
  mode: string;
  status: 'created' | 'active' | 'interrupted' | 'submitted' | 'processed' | 'abandoned';
  version: number;
  lock_token: string | null;
  started_at: string | null;
  submitted_at: string | null;
  duration_ms: number | null;
  active_duration_ms: number | null;
  item_count: number;
  items_answered: number;
  items_correct: number;
  raw_score: number | null;
  scaled_score: number | null;
  score_band: string | null;
  engine_state_snapshot: unknown;
  skills_touched: string[];
  pipeline_status: 'pending' | 'sync_complete' | 'async_complete' | 'async_partial' | 'async_failed';
}

interface PathwayRow {
  id: string;
  slug: string;
  display_name: string;
  engine_type: EngineType;
  framework_config_id: string;
  required_feature_key: string | null;
}

interface FrameworkConfigRow {
  id: string;
  config: FrameworkConfig;
}

// ─── createSession ──────────────────────────────────────────────────────────

export interface CreateSessionInput {
  client: DbClient;
  studentId: string;
  tenantId: string;
  body: CreateSessionRequest;
  fetchContentSelect: ContentSelectFetcher;
  effects?: Partial<Effects>;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<HandlerResult<CreateSessionResponse>> {
  const eff = { ...DEFAULT_EFFECTS, ...input.effects };
  const { client, studentId, tenantId, body } = input;

  if (body.pathway_id === null) {
    return err(400, 'VALIDATION_ERROR', 'pathway_id is required');
  }

  // 1. Resolve pathway + framework_config
  const pathwayRes = await client
    .from('pathway')
    .select('id, slug, display_name, engine_type, framework_config_id, required_feature_key')
    .eq('id', body.pathway_id)
    .maybeSingle();
  if (pathwayRes.error !== null) return err(500, 'INTERNAL_ERROR', pathwayRes.error.message);
  if (pathwayRes.data === null) return err(404, 'NOT_FOUND', `Pathway '${body.pathway_id}' not found`);
  const pathway = pathwayRes.data as PathwayRow;

  // 2. Feature gate
  const gate = await checkFeatureFlag(
    client as unknown as FeatureFlagDbClient,
    tenantId,
    pathway.required_feature_key,
  );
  if (!gate.allowed) {
    return err(gate.status, gate.code, gate.message, gate.details);
  }

  // 3. framework_config
  const fcRes = await client
    .from('framework_config')
    .select('id, config')
    .eq('id', pathway.framework_config_id)
    .maybeSingle();
  if (fcRes.error !== null) return err(500, 'INTERNAL_ERROR', fcRes.error.message);
  if (fcRes.data === null) {
    return err(500, 'INTERNAL_ERROR', `framework_config '${pathway.framework_config_id}' missing`);
  }
  const fc = fcRes.data as FrameworkConfigRow;

  // 4. Insert session_record (status=created)
  const sessionId = eff.uuid();
  const lockToken = eff.uuid();
  const startedAt = eff.now();

  const insertRes = await client.from('session_record').insert({
    id: sessionId,
    student_id: studentId,
    tenant_id: tenantId,
    pathway_id: pathway.id,
    assessment_profile_id: body.assessment_profile_id,
    assignment_id: body.assignment_id,
    engine_type: pathway.engine_type,
    mode: body.mode,
    status: 'created',
    version: 1,
    lock_token: lockToken,
    engine_state_snapshot: {},
  });
  if (insertRes.error !== null) {
    if (insertRes.error.code === '23505') {
      return err(409, 'ACTIVE_SESSION_EXISTS', 'Student already has an active session', {
        constraint: 'one_active_session',
      });
    }
    return err(500, 'INTERNAL_ERROR', insertRes.error.message);
  }

  // 5. content-svc /content/select (HTTP, service-role; Q-19.7).
  //    v1.1-S2: pass composer_params + session_id-derived seed when present
  //    (ADR-0036 §Decision 4/5). Absent → existing blueprint/adaptive routing.
  const composerParams: PracticeExamComposerParams | undefined = body.composer_params;
  const contentRes = await input.fetchContentSelect({
    pathway_id: pathway.id,
    ...(composerParams !== undefined
      ? {
          composer: {
            item_count: composerParams.item_count,
            difficulty_distribution: composerParams.difficulty_distribution,
            seed: sessionId,
          },
        }
      : {}),
  });
  if (!contentRes.ok) {
    // Roll back the session row so the student isn't blocked by a half-create.
    await client.from('session_record').delete().eq('id', sessionId);
    return err(contentRes.status, contentRes.code, contentRes.message);
  }
  const items = contentRes.data;

  if (items.length === 0) {
    await client.from('session_record').delete().eq('id', sessionId);
    return err(404, 'NOT_FOUND', 'No items selected for pathway');
  }

  // 6. Build SessionContext + initialise engine state.
  //    v1.1-S2: when composer_params drove selection, prefer the caller's
  //    time_limit_ms over framework_config (ADR-0036). The composer marker
  //    is folded into initialState below for the linear-engine branch.
  const effectiveTimeLimitMs =
    composerParams !== undefined ? composerParams.time_limit_ms : fc.config.time_limit_ms;
  const ctx: SessionContext = {
    session_id: sessionId as SessionId,
    mode: body.mode,
    engine_type: pathway.engine_type,
    total_items: items.length,
    time_limit_ms: effectiveTimeLimitMs,
    started_at: startedAt,
    planned_items: items,
    target_skills: (body.target_skills ?? []) as SkillId[],
  };
  const engine = pickEngine(pathway.engine_type);
  const baseState = engine.initialise(ctx, fc.config);
  // ADR-0036 §Decision 3 / Q-1.1-2.5: persist composer_params on the linear-
  // engine state so the analytics marker survives respondToSession's
  // EngineStateSchema parse → RPC re-write round-trip. Linear is the only
  // engine that participates in composed practice exams (mode='exam').
  const initialState =
    composerParams !== undefined && baseState.engine_type === 'linear'
      ? { ...baseState, composer_params: composerParams }
      : baseState;

  const next = engine.getNextItem(initialState);
  if (isTerminationSignal(next)) {
    await client.from('session_record').delete().eq('id', sessionId);
    return err(500, 'INTERNAL_ERROR', 'Engine terminated before delivering first item');
  }
  const firstItem = next;

  // 7. Transition created → active + persist initial engine_state_snapshot.
  const upd = await client
    .from('session_record')
    .update({
      status: 'active',
      started_at: startedAt,
      item_count: items.length,
      engine_state_snapshot: initialState,
      version: 2,
    })
    .eq('id', sessionId);
  if (upd.error !== null) return err(500, 'INTERNAL_ERROR', upd.error.message);

  return ok<CreateSessionResponse>(
    {
      session_id: sessionId as SessionId,
      mode: body.mode,
      engine_type: pathway.engine_type,
      total_items: items.length,
      time_limit_ms: effectiveTimeLimitMs,
      first_item: firstItem,
      navigation: {
        can_go_back: engine.canNavigateBack(initialState),
        can_skip: false,
        can_flag: fc.config.flag_for_review_enabled,
      },
      lock_token: lockToken,
      version: 2,
    },
    201,
  );
}

// ─── respondToSession ───────────────────────────────────────────────────────

export interface RespondInput {
  client: DbClient;
  sessionId: string;
  studentId: string;
  lockHeader: string | null;
  body: RecordResponseRequest;
  effects?: Partial<Effects>;
}

export async function respondToSession(
  input: RespondInput,
): Promise<HandlerResult<RecordResponseResponse>> {
  const eff = { ...DEFAULT_EFFECTS, ...input.effects };
  const { client, sessionId, studentId, lockHeader, body } = input;

  // 1. Load session_record
  const rowRes = await client
    .from('session_record')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (rowRes.error !== null) return err(500, 'INTERNAL_ERROR', rowRes.error.message);
  if (rowRes.data === null) return err(404, 'NOT_FOUND', `Session '${sessionId}' not found`);
  const row = rowRes.data as SessionRow;

  if (row.student_id !== studentId) return err(404, 'NOT_FOUND', 'Session not owned by caller');

  // 2. Lock token validation (ADR-0026)
  if (lockHeader === null || row.lock_token === null || lockHeader !== row.lock_token) {
    return err(409, 'LOCK_CONFLICT', 'X-Session-Lock header missing or stale');
  }

  // 3. State machine: must be active
  if (row.status !== 'active') {
    return err(409, 'SESSION_CONFLICT', `Session is not active (current: ${row.status})`, {
      current_state: row.status,
    });
  }

  // 4. Optimistic lock check (handled by RPC, but check version locally for clarity)
  if (row.version !== body.expected_version) {
    return err(409, 'VERSION_CONFLICT', 'Version conflict — refresh state and retry', {
      expected_version: body.expected_version,
      actual_version: row.version,
    });
  }

  // 5. Parse engine state via Zod (Q-19.6)
  const stateParse = EngineStateSchema.safeParse(row.engine_state_snapshot);
  if (!stateParse.success) {
    return err(500, 'INTERNAL_ERROR', `engine_state_snapshot invalid: ${stateParse.error.message}`);
  }
  const state = stateParse.data;

  // 6. Build EngineResponse + apply
  const engineResp: EngineResponse = {
    item_id: body.item_id as ItemId,
    is_correct: null, // server-derived below; engines that need it (linear) compute via item lookup
    response_data: body.response_data,
    answered_at: eff.now(),
    telemetry: {
      time_to_answer_ms: body.telemetry.time_to_answer_ms,
      answer_changes: body.telemetry.answer_changes,
    },
  };

  // Resolve correctness from the item pool inside the engine state (the
  // EngineItem carries authoritative correct-answer metadata via
  // response_config + engine-specific scoring — for v1 we use a simple match
  // against item.response_config.correct_option_id).
  const planned = collectPlannedItems(state);
  const item = planned.find(it => it.item_id === body.item_id);
  if (item === undefined) {
    return err(404, 'NOT_FOUND', `Item '${body.item_id}' is not in this session`);
  }
  engineResp.is_correct = computeCorrectness(item, body.response_data);

  const engine = pickEngine(row.engine_type);
  const newState = engine.recordResponse(state, engineResp);

  // 7. Atomic write via widened RPC (Q-19.1)
  const newLockToken = eff.uuid();
  const score = engineResp.is_correct === true ? 1.0 : 0.0;
  const difficulty = item.difficulty;
  const guess = 0.0;

  const rpcRes = await client.rpc('create_session_response_atomic', {
    p_session_id: sessionId,
    p_expected_version: body.expected_version,
    p_item_id: body.item_id,
    p_response_data: body.response_data,
    p_is_correct: engineResp.is_correct,
    p_score: score,
    p_difficulty: difficulty,
    p_telemetry: body.telemetry,
    p_guess_probability: guess,
    p_answer_changes: body.telemetry.answer_changes,
    p_engine_state: newState,
  });
  if (rpcRes.error !== null) {
    if (rpcRes.error.code === 'P0001') {
      return err(409, 'VERSION_CONFLICT', 'Version conflict — refresh state and retry');
    }
    return err(500, 'INTERNAL_ERROR', rpcRes.error.message);
  }
  const rpcRow = (Array.isArray(rpcRes.data) ? rpcRes.data[0] : rpcRes.data) as
    | { response_id: string; event_id: string; new_sequence: number; new_version: number }
    | null;
  if (rpcRow === null) return err(500, 'INTERNAL_ERROR', 'RPC returned no row');

  // 8. Rotate lock_token (separate UPDATE — RPC doesn't touch it)
  const lockUpd = await client
    .from('session_record')
    .update({ lock_token: newLockToken })
    .eq('id', sessionId);
  if (lockUpd.error !== null) return err(500, 'INTERNAL_ERROR', lockUpd.error.message);

  // 9. Compute next item (or termination)
  const next = engine.getNextItem(newState);
  let nextItem: RecordResponseResponse['next_item'] = null;
  let termination: RecordResponseResponse['termination'] = null;
  if (isTerminationSignal(next)) {
    termination = { reason: next.reason, auto_submitted: false };
  } else {
    nextItem = next;
  }

  // 10. Compute progress
  const totalItems = totalItemsFor(newState);
  const itemsAnswered = answeredCountFor(newState);
  const progress: RecordResponseResponse['progress'] = {
    answered: itemsAnswered,
    total: totalItems,
    time_remaining_ms: engine.getTimeRemaining(newState, eff.ms),
  };

  return ok<RecordResponseResponse>({
    is_correct: engineResp.is_correct,
    explanation: null, // exam mode hides explanations; practice/repair will populate (v1.1)
    next_item: nextItem,
    termination,
    progress,
    version: rpcRow.new_version,
    lock_token: newLockToken,
  });
}

// ─── submitSession ──────────────────────────────────────────────────────────

/**
 * Inline call surface for intelligence-svc /process-session/{id} (Q-20.1).
 * Injected so tests can stub without going through Deno's fetch + the
 * Stage 20 ADR-0027 4-second timeout.
 *
 * On success the caller flips `pipeline_status` to `'sync_complete'`. On
 * timeout / 4xx / 5xx / network error the caller leaves `'pending'` and
 * surfaces a structured warn log — never fails the user-facing submit.
 */
export type ProcessIntelligenceFetcher = (input: {
  sessionId: string;
  traceId: string;
}) => Promise<
  | { ok: true; status: 'processed' | 'already_processed' }
  | { ok: false; reason: 'timeout' | 'error'; status?: number; message: string }
>;

export interface SubmitInput {
  client: DbClient;
  sessionId: string;
  studentId: string;
  /** Q-20.14: trace_id flowing through to intelligence-svc. Optional in tests. */
  traceId?: string;
  /** Q-20.1: inline intelligence-svc HTTP. Optional — null skips sync (legacy/Stage 19 path). */
  fetchProcessIntelligence?: ProcessIntelligenceFetcher | null;
  effects?: Partial<Effects>;
}

export async function submitSession(
  input: SubmitInput,
): Promise<HandlerResult<SubmitSessionResponse>> {
  const eff = { ...DEFAULT_EFFECTS, ...input.effects };
  const { client, sessionId, studentId } = input;
  const traceId = input.traceId ?? eff.uuid();

  const rowRes = await client
    .from('session_record')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (rowRes.error !== null) return err(500, 'INTERNAL_ERROR', rowRes.error.message);
  if (rowRes.data === null) return err(404, 'NOT_FOUND', `Session '${sessionId}' not found`);
  const row = rowRes.data as SessionRow;

  if (row.student_id !== studentId) return err(404, 'NOT_FOUND', 'Session not owned by caller');
  if (row.status !== 'active') {
    return err(409, 'SESSION_CONFLICT', `Session is not active (current: ${row.status})`, {
      current_state: row.status,
    });
  }

  // Resolve framework_config for scoring
  if (row.pathway_id === null) {
    return err(500, 'INTERNAL_ERROR', 'Submitted session has no pathway_id — cannot resolve config');
  }
  const pathwayRes = await client
    .from('pathway')
    .select('framework_config_id')
    .eq('id', row.pathway_id)
    .maybeSingle();
  if (pathwayRes.error !== null) return err(500, 'INTERNAL_ERROR', pathwayRes.error.message);
  const pathway = pathwayRes.data as { framework_config_id: string } | null;
  if (pathway === null) return err(500, 'INTERNAL_ERROR', 'Pathway missing for active session');

  const fcRes = await client
    .from('framework_config')
    .select('id, config')
    .eq('id', pathway.framework_config_id)
    .maybeSingle();
  if (fcRes.error !== null) return err(500, 'INTERNAL_ERROR', fcRes.error.message);
  const fc = (fcRes.data as FrameworkConfigRow | null) ?? null;
  if (fc === null) return err(500, 'INTERNAL_ERROR', 'framework_config missing');

  const stateParse = EngineStateSchema.safeParse(row.engine_state_snapshot);
  if (!stateParse.success) {
    return err(500, 'INTERNAL_ERROR', `engine_state_snapshot invalid: ${stateParse.error.message}`);
  }
  const state = stateParse.data;

  const final = terminateForConfig(state, 'user_submitted', fc.config, eff.ms);
  const submittedAt = eff.now();

  // Update session_record terminal columns. version not bumped here per
  // ADR-C3 — terminal transitions don't conflict with concurrent responses
  // (the RPC requires status='active', which this UPDATE invalidates).
  const upd = await client
    .from('session_record')
    .update({
      status: 'submitted',
      submitted_at: submittedAt,
      duration_ms: final.score.duration_ms,
      active_duration_ms: final.score.duration_ms,
      items_correct: final.score.items_correct,
      raw_score: final.score.raw,
      scaled_score: final.score.scaled,
      score_band: final.score.band,
      skills_touched: final.score.skills_touched,
      pipeline_status: 'pending',
    })
    .eq('id', sessionId);
  if (upd.error !== null) return err(500, 'INTERNAL_ERROR', upd.error.message);

  // Q-19.2: write outbox_event regardless of whether the inline sync call
  // below succeeds — outbox is the audit trail + the Stage 28 worker retry
  // path if the inline call timed out / errored.
  const outboxRes = await client.from('outbox_event').insert({
    aggregate_type: 'session_record',
    aggregate_id: sessionId,
    event_type: 'session.submitted',
    payload: {
      session_id: sessionId,
      student_id: row.student_id,
      tenant_id: row.tenant_id,
      submitted_at: submittedAt,
    },
  });
  if (outboxRes.error !== null) return err(500, 'INTERNAL_ERROR', outboxRes.error.message);

  // Q-20.1 + ADR-0027: call intelligence-svc /process-session/{id} inline.
  // 4s timeout + soft-fail (Q-20.15): on timeout / 4xx / 5xx / network error
  // we leave pipeline_status='pending' and rely on the outbox + Stage 28
  // worker to retry. Never fail the user-facing submit.
  let pipelineStatus: 'pending' | 'sync_complete' = 'pending';
  if (input.fetchProcessIntelligence !== undefined && input.fetchProcessIntelligence !== null) {
    const intel = await input.fetchProcessIntelligence({ sessionId, traceId });
    if (intel.ok) {
      pipelineStatus = 'sync_complete';
      const flip = await client
        .from('session_record')
        .update({ pipeline_status: 'sync_complete' })
        .eq('id', sessionId);
      if (flip.error !== null) {
        // Treat a flip failure as soft — the data is in intelligence-svc;
        // the row label is stale and Stage 28 will rectify.
        console.warn(JSON.stringify({
          level: 'warn',
          service: 'assessment-svc',
          trace_id: traceId,
          event: 'pipeline_status_flip_failed',
          session_id: sessionId,
          error: flip.error.message,
        }));
        pipelineStatus = 'pending';
      }
    } else {
      console.warn(JSON.stringify({
        level: 'warn',
        service: 'assessment-svc',
        trace_id: traceId,
        event: 'intelligence_svc_inline_failed',
        session_id: sessionId,
        reason: intel.reason,
        status: intel.status ?? null,
        message: intel.message,
      }));
    }
  }

  return ok<SubmitSessionResponse>({
    session_id: sessionId as SessionId,
    status: 'submitted',
    score: {
      raw: final.score.raw,
      scaled: final.score.scaled,
      band: final.score.band,
    },
    summary: {
      items_answered: final.score.items_answered,
      items_correct: final.score.items_correct,
      duration_ms: final.score.duration_ms,
      active_duration_ms: final.score.duration_ms,
      skills_touched: final.score.skills_touched,
    },
    pipeline_status: pipelineStatus,
  });
}

// ─── checkpointSession (autosave; never bumps version, ADR-C3) ──────────────

export interface CheckpointInput {
  client: DbClient;
  sessionId: string;
  studentId: string;
  lockHeader: string | null;
  body: CheckpointRequest;
}

export async function checkpointSession(
  input: CheckpointInput,
): Promise<HandlerResult<{ session_id: string; checkpoint_number: number; server_timestamp: string }>> {
  const { client, sessionId, studentId, lockHeader, body } = input;

  const rowRes = await client
    .from('session_record')
    .select('id, student_id, status, lock_token')
    .eq('id', sessionId)
    .maybeSingle();
  if (rowRes.error !== null) return err(500, 'INTERNAL_ERROR', rowRes.error.message);
  if (rowRes.data === null) return err(404, 'NOT_FOUND', `Session '${sessionId}' not found`);
  const row = rowRes.data as Pick<SessionRow, 'id' | 'student_id' | 'status' | 'lock_token'>;

  if (row.student_id !== studentId) return err(404, 'NOT_FOUND', 'Session not owned by caller');
  if (lockHeader === null || row.lock_token === null || lockHeader !== row.lock_token) {
    return err(409, 'LOCK_CONFLICT', 'X-Session-Lock header missing or stale');
  }
  if (row.status !== 'active') {
    return err(409, 'SESSION_CONFLICT', `Session is not active (current: ${row.status})`, {
      current_state: row.status,
    });
  }

  const serverTimestamp = new Date().toISOString();
  const upsertRes = await client.from('session_checkpoint').upsert(
    {
      session_id: sessionId,
      checkpoint_number: body.checkpoint_number,
      current_question_index: body.current_question_index,
      answers: body.answers,
      telemetry_buffer: [],
      client_timestamp: body.client_timestamp,
      server_timestamp: serverTimestamp,
    },
    { onConflict: 'session_id' },
  );
  if (upsertRes.error !== null) return err(500, 'INTERNAL_ERROR', upsertRes.error.message);

  return ok({ session_id: sessionId, checkpoint_number: body.checkpoint_number, server_timestamp: serverTimestamp });
}

// ─── resumeSession ──────────────────────────────────────────────────────────

export interface ResumeInput {
  client: DbClient;
  sessionId: string;
  studentId: string;
  effects?: Partial<Effects>;
}

export async function resumeSession(
  input: ResumeInput,
): Promise<HandlerResult<SessionStateDTO>> {
  const eff = { ...DEFAULT_EFFECTS, ...input.effects };
  const { client, sessionId, studentId } = input;

  const rowRes = await client
    .from('session_record')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (rowRes.error !== null) return err(500, 'INTERNAL_ERROR', rowRes.error.message);
  if (rowRes.data === null) return err(404, 'NOT_FOUND', `Session '${sessionId}' not found`);
  const row = rowRes.data as SessionRow;

  if (row.student_id !== studentId) return err(404, 'NOT_FOUND', 'Session not owned by caller');
  if (row.status !== 'interrupted' && row.status !== 'active') {
    return err(409, 'SESSION_CONFLICT', `Session is not resumable (current: ${row.status})`, {
      current_state: row.status,
    });
  }

  const stateParse = EngineStateSchema.safeParse(row.engine_state_snapshot);
  if (!stateParse.success) {
    return err(500, 'INTERNAL_ERROR', `engine_state_snapshot invalid: ${stateParse.error.message}`);
  }
  const state = stateParse.data;
  const engine = pickEngine(row.engine_type);
  const next = engine.getNextItem(state);
  if (isTerminationSignal(next)) {
    return err(409, 'SESSION_CONFLICT', 'Session has no remaining items');
  }

  const newLockToken = eff.uuid();
  const upd = await client
    .from('session_record')
    .update({ status: 'active', lock_token: newLockToken })
    .eq('id', sessionId);
  if (upd.error !== null) return err(500, 'INTERNAL_ERROR', upd.error.message);

  const totalItems = totalItemsFor(state);
  const itemsAnswered = answeredCountFor(state);

  return ok<SessionStateDTO>({
    session_id: sessionId as SessionId,
    status: 'active',
    engine_type: row.engine_type,
    mode: row.mode,
    current_item: next,
    progress: {
      answered: itemsAnswered,
      total: totalItems,
      time_remaining_ms: engine.getTimeRemaining(state, eff.ms),
    },
    navigation: {
      can_go_back: engine.canNavigateBack(state),
      can_skip: false,
      can_flag: true,
    },
    answered_item_ids: answeredItemIds(state),
    lock_token: newLockToken,
    version: row.version,
  });
}

// ─── abandonSession ─────────────────────────────────────────────────────────

export interface AbandonInput {
  client: DbClient;
  sessionId: string;
  studentId: string;
  lockHeader: string | null;
  effects?: Partial<Effects>;
}

export async function abandonSession(
  input: AbandonInput,
): Promise<HandlerResult<{ session_id: string; status: 'abandoned' }>> {
  const eff = { ...DEFAULT_EFFECTS, ...input.effects };
  const { client, sessionId, studentId, lockHeader } = input;

  const rowRes = await client
    .from('session_record')
    .select('id, student_id, status, lock_token')
    .eq('id', sessionId)
    .maybeSingle();
  if (rowRes.error !== null) return err(500, 'INTERNAL_ERROR', rowRes.error.message);
  if (rowRes.data === null) return err(404, 'NOT_FOUND', `Session '${sessionId}' not found`);
  const row = rowRes.data as Pick<SessionRow, 'id' | 'student_id' | 'status' | 'lock_token'>;

  if (row.student_id !== studentId) return err(404, 'NOT_FOUND', 'Session not owned by caller');
  if (lockHeader === null || row.lock_token === null || lockHeader !== row.lock_token) {
    return err(409, 'LOCK_CONFLICT', 'X-Session-Lock header missing or stale');
  }
  if (row.status !== 'active' && row.status !== 'interrupted') {
    return err(409, 'SESSION_CONFLICT', `Session cannot be abandoned (current: ${row.status})`, {
      current_state: row.status,
    });
  }

  const upd = await client
    .from('session_record')
    .update({ status: 'abandoned', submitted_at: eff.now() })
    .eq('id', sessionId);
  if (upd.error !== null) return err(500, 'INTERNAL_ERROR', upd.error.message);

  return ok({ session_id: sessionId, status: 'abandoned' as const });
}

// ─── listRecentSessions ─────────────────────────────────────────────────────

export async function listRecentSessions(
  client: DbClient,
  studentId: string,
  limit = 10,
): Promise<HandlerResult<SessionSummaryDTO[]>> {
  const res = await client
    .from('session_record')
    .select(
      'id, mode, started_at, submitted_at, duration_ms, active_duration_ms, score_band, raw_score, skills_touched, pathway_id',
    )
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: false })
    .limit(limit);
  if (res.error !== null) return err(500, 'INTERNAL_ERROR', res.error.message);
  const rows = (res.data ?? []) as Array<{
    id: string;
    mode: string;
    started_at: string | null;
    submitted_at: string | null;
    duration_ms: number | null;
    active_duration_ms: number | null;
    score_band: string | null;
    raw_score: number | null;
    skills_touched: string[];
    pathway_id: string | null;
  }>;
  const out: SessionSummaryDTO[] = rows.map(r => ({
    session_id: r.id as SessionId,
    mode: r.mode,
    pathway_name: null, // joined name resolution deferred to v1.1
    started_at: r.started_at ?? new Date(0).toISOString(),
    submitted_at: r.submitted_at,
    duration_ms: r.duration_ms,
    active_duration_ms: r.active_duration_ms,
    score_band: r.score_band,
    raw_score: r.raw_score,
    skills_touched_count: (r.skills_touched ?? []).length,
  }));
  return ok(out);
}

// ─── getSessionSummary (single, for post-processing display) ────────────────

export async function getSessionSummary(
  client: DbClient,
  sessionId: string,
  studentId: string,
): Promise<HandlerResult<SessionSummaryDTO>> {
  const res = await client
    .from('session_record')
    .select(
      'id, student_id, mode, started_at, submitted_at, duration_ms, active_duration_ms, score_band, raw_score, skills_touched',
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (res.error !== null) return err(500, 'INTERNAL_ERROR', res.error.message);
  if (res.data === null) return err(404, 'NOT_FOUND', `Session '${sessionId}' not found`);
  const r = res.data as {
    id: string;
    student_id: string;
    mode: string;
    started_at: string | null;
    submitted_at: string | null;
    duration_ms: number | null;
    active_duration_ms: number | null;
    score_band: string | null;
    raw_score: number | null;
    skills_touched: string[];
  };
  if (r.student_id !== studentId) return err(404, 'NOT_FOUND', 'Session not owned by caller');
  return ok<SessionSummaryDTO>({
    session_id: r.id as SessionId,
    mode: r.mode,
    pathway_name: null,
    started_at: r.started_at ?? new Date(0).toISOString(),
    submitted_at: r.submitted_at,
    duration_ms: r.duration_ms,
    active_duration_ms: r.active_duration_ms,
    score_band: r.score_band,
    raw_score: r.raw_score,
    skills_touched_count: (r.skills_touched ?? []).length,
  });
}

// ─── helpers ────────────────────────────────────────────────────────────────

function collectPlannedItems(state: EngineState): EngineItem[] {
  if (state.engine_type === 'linear') return state.planned_items;
  if (state.engine_type === 'skill') return state.item_pool;
  if (state.engine_type === 'diagnostic') return state.item_pool;
  // adaptive: union across all stages' items + the pool
  const fromStages: EngineItem[] = state.stages.flatMap(
    (s: { items: EngineItem[] }) => s.items,
  );
  const seen = new Set<string>();
  const out: EngineItem[] = [];
  for (const it of [...fromStages, ...state.item_pool]) {
    if (!seen.has(it.item_id)) {
      seen.add(it.item_id);
      out.push(it);
    }
  }
  return out;
}

function totalItemsFor(state: EngineState): number | null {
  if (state.engine_type === 'linear') return state.total_items;
  if (state.engine_type === 'adaptive') {
    return state.stages.reduce(
      (acc: number, s: { items: EngineItem[] }) => acc + s.items.length,
      0,
    );
  }
  return null; // skill + diagnostic are unbounded
}

function answeredCountFor(state: EngineState): number {
  if (state.engine_type === 'linear') return state.responses.length;
  if (state.engine_type === 'skill' || state.engine_type === 'diagnostic') {
    return state.responses.length;
  }
  // adaptive: sum across stages
  return state.stages.reduce(
    (acc: number, s: { responses: EngineResponse[] }) => acc + s.responses.length,
    0,
  );
}

function answeredItemIds(state: EngineState): string[] {
  if (state.engine_type === 'linear') {
    return state.responses.map((r: EngineResponse) => r.item_id);
  }
  if (state.engine_type === 'skill' || state.engine_type === 'diagnostic') {
    return state.answered_item_ids;
  }
  return state.stages.flatMap((s: { responses: EngineResponse[] }) =>
    s.responses.map((r: EngineResponse) => r.item_id),
  );
}

/**
 * V1 correctness rule: if response_data.option_id matches
 * item.response_config.correct_option_id, response is correct. For other
 * response types (numeric, text), v1 returns null and lets the engine treat
 * it as incorrect (no auto-marking). Q-17.5 governs writing items.
 */
function computeCorrectness(item: EngineItem, responseData: Record<string, unknown>): boolean | null {
  if (item.is_writing_item === true) return null;
  const cfg = item.response_config as Record<string, unknown> | undefined;
  if (cfg === undefined) return null;
  const correct = cfg['correct_option_id'];
  if (typeof correct !== 'string') return null;
  const submitted = responseData['option_id'];
  if (typeof submitted !== 'string') return false;
  return submitted === correct;
}
