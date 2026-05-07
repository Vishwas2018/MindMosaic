/**
 * intelligence-svc handlers — Stage 20.
 *
 * Pure-function handler returning a tagged HandlerResult<T>. The Deno
 * dispatcher (`index.ts`) wires URL imports + HTTP plumbing; this file is
 * Vitest-testable in Node with a mocked Supabase-like client.
 *
 * Pipeline (Spec §7.2 sync portion — must complete before submit response):
 *   0. Audit-log dedup (Q-20.7) — short-circuit if (session_id,
 *      algorithm_version, event_type='session.processed') already exists.
 *   1. L1 Foundation — per-skill mastery / velocity / streak; UPSERT
 *      skill_mastery + learning_velocity; INSERT pipeline_event(step=1).
 *   2. L2 Behaviour — per-response guess_probability / fatigue / cog load;
 *      INSERT learning_event(event_type='behaviour_signal') per response;
 *      UPSERT behaviour_profile (defaults blend, year-level keyed);
 *      INSERT pipeline_event(step=2).
 *   3. L3a Causal-scoped — depth-1 prereq walk over touched skills;
 *      misconception lookup via item_version.distractor_rationale;
 *      UPSERT student_misconception; INSERT pipeline_event(step=3).
 *   4. Audit log — per-layer + summary INSERT into intelligence_audit_log.
 *
 * Replay determinism (Q-20.4 / ADR-0027):
 *   - All aggregates ORDER BY skill_id ASC, response_id ASC.
 *   - canonicalize() on every audit-log input_snapshot.
 *   - No Math.random; no Date.now() as algorithm input. Effects.now / .uuid
 *     are write-only metadata, NOT formula inputs.
 *   - Idempotent (UPSERT + audit-log dedup). Stage 28's worker re-pickup is a
 *     no-op against the dedup row.
 *
 * Spec refs: §7.2, §7.4.2, §8.1, §9.2, §9.3, §9.5, §9.6, §10.2; arch §4.5,
 * §5.2; ADR-0027.
 */

import { EngineStateSchema, type EngineState } from '@mm/engines';
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

// ─── Tagged result envelope (mirrors assessment-svc) ────────────────────────

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

// ─── Effects (replay-deterministic — write-only metadata) ───────────────────

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

// ─── DbClient surface (structurally compatible with mock-supabase.ts) ───────

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
  order: (col: string, opts?: { ascending?: boolean }) => DbBuilder;
  limit: (n: number) => DbBuilder;
  maybeSingle: () => Promise<{ data: unknown | null; error: { message: string; code?: string } | null }>;
  single: () => Promise<{ data: unknown | null; error: { message: string; code?: string } | null }>;
} & PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null }>;

// ─── Row shapes (subset of session_record / response / item etc.) ───────────

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
  id: string;                // response_id (PK)
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

// ─── Public response shape ──────────────────────────────────────────────────

export interface ProcessSessionResponse {
  status: 'processed' | 'already_processed';
  session_id: string;
  algorithm_version: string;
  /** Wall-clock processing time in ms; null if dedup short-circuit. */
  processing_time_ms: number | null;
  layers: {
    foundation: { skills_touched: number; mastery_upserts: number } | null;
    behaviour: { signals_written: number; profile_blended: boolean } | null;
    causal: { prereqs_walked: number; misconceptions_upserted: number } | null;
  };
}

// ─── processSession (the only public handler) ───────────────────────────────

export interface ProcessSessionInput {
  client: DbClient;
  sessionId: string;
  /** trace_id flowing in from assessment-svc via x-mm-trace-id (Q-20.14). */
  traceId: string;
  effects?: Partial<Effects>;
}

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

  // ── 2. L1 Foundation ─────────────────────────────────────────────────────
  await insertPipelineEvent(client, sessionId, session.student_id, 1, 'foundation.update', 'processing', eff);
  const l1 = await runFoundation({
    client,
    session,
    profile,
    responses,
    state,
    eff,
    traceId,
  });
  await markPipelineEventCompleted(client, sessionId, 1, 'foundation.update', l1.error, eff);
  if (l1.error !== null) return err(500, 'INTERNAL_ERROR', `L1 foundation failed: ${l1.error}`);

  // ── 3. L2 Behaviour ──────────────────────────────────────────────────────
  await insertPipelineEvent(client, sessionId, session.student_id, 2, 'behaviour.analyse', 'processing', eff);
  const l2 = await runBehaviour({
    client,
    session,
    profile,
    responses,
    state,
    eff,
    traceId,
  });
  await markPipelineEventCompleted(client, sessionId, 2, 'behaviour.analyse', l2.error, eff);
  if (l2.error !== null) return err(500, 'INTERNAL_ERROR', `L2 behaviour failed: ${l2.error}`);

  // ── 4. L3a Causal-scoped ─────────────────────────────────────────────────
  await insertPipelineEvent(client, sessionId, session.student_id, 3, 'causal.evaluate_scoped', 'processing', eff);
  const l3a = await runCausalScoped({
    client,
    session,
    responses,
    touchedSkills: l1.touchedSkills,
    eff,
    traceId,
  });
  await markPipelineEventCompleted(client, sessionId, 3, 'causal.evaluate_scoped', l3a.error, eff);
  if (l3a.error !== null) return err(500, 'INTERNAL_ERROR', `L3a causal failed: ${l3a.error}`);

  // ── 5. Audit log summary row (the dedup key on re-pickup) ────────────────
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
  // Resolve item → skill_ids[] from `item` table for every response item.
  const itemIds = [...new Set(responses.map(r => r.item_id))].sort();
  const itemsRes = await client
    .from('item')
    .select('id, skill_ids')
    .in('id', itemIds);
  if (itemsRes.error !== null) {
    return { touchedSkills: [], upsertCount: 0, error: itemsRes.error.message };
  }
  const itemRows = (itemsRes.data ?? []) as ItemRow[];
  const itemSkills = new Map<string, string[]>(itemRows.map(r => [r.id, r.skill_ids]));

  // Group responses by skill_id (deterministic order).
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

  // Read existing skill_mastery rows to compute deltas (mastery_before).
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

  // Compute per-skill mastery via §8.1 formula.
  const upserts: MasteryRow[] = [];
  for (const skillId of touchedSkills) {
    const rows = perSkill.get(skillId) ?? [];
    // Sort by sequence_number for recency-weighted accuracy.
    rows.sort((a, b) => a.sequence_number - b.sequence_number);
    const attempts = rows.map(r => ({
      is_correct: r.is_correct,
      difficulty: r.difficulty,
      response_id: r.id,
    }));
    const recent = recencyWeightedAccuracy(attempts);
    const correct = rows.filter(r => r.is_correct === true).length;
    // Difficulty-adjusted score: average of (is_correct ? difficulty : 0); rewards
    // correct-on-hard. Bounded [0, 1] by caller-side clamp in masteryFormula.
    const diffAdjusted = rows.length === 0
      ? 0
      : rows.reduce((acc, r) => acc + (r.is_correct === true ? r.difficulty : 0), 0) / rows.length;
    // Consistency: 1 - variance of correctness (lower variance = higher consistency).
    const correctnessSeries: number[] = rows.map(r => (r.is_correct === true ? 1 : 0));
    const seriesLen = Math.max(1, correctnessSeries.length);
    const mean = correctnessSeries.reduce((a: number, b: number) => a + b, 0) / seriesLen;
    const variance = correctnessSeries.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / seriesLen;
    const consistency = Math.max(0, 1 - variance * 4); // *4 scales [0,0.25] variance to [0,1].
    // Behaviour penalty: applied at L2 stage; here use 0 (Q-20.13 input snapshot
    // is per-skill aggregates only — penalty is metadata, not a formula input).
    const behaviour_penalty = 0;
    const computed = masteryFormula({
      recent_accuracy: recent,
      difficulty_adjusted: diffAdjusted,
      consistency,
      behaviour_penalty,
    });

    const prior = existing.get(skillId);
    const totalAttempts = (prior?.total_attempts ?? 0) + rows.length;
    const correctAttempts = (prior?.correct_attempts ?? 0) + correct;
    // Streaks: count from end of session_response sequence backwards.
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
    const confidence = Math.min(1, totalAttempts / 30); // simple §8.4 stat-confidence
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

  // Bulk upsert. Order is sorted-by-skill_id for determinism.
  const upsertRes = await client.from('skill_mastery').upsert(upserts, {
    onConflict: 'student_id,skill_id',
  });
  if (upsertRes.error !== null) {
    return { touchedSkills, upsertCount: 0, error: upsertRes.error.message };
  }

  // Velocity: a 14-day window read of prior mastery_level → slope. v1 MVP uses
  // simple (current - prior_avg) / days. For Stage 20 the velocity table is
  // recomputed but the slope reduces to "current - 0" on first session — that
  // is acceptable per §8.2 ("recomputed after each session touching the skill").
  const velocityRows = upserts.map(u => ({
    student_id: u.student_id,
    skill_id: u.skill_id,
    tenant_id: u.tenant_id,
    velocity: u.mastery_level - (existing.get(u.skill_id)?.mastery_level ?? 0),
    window_days: 14,
    computed_at: args.eff.now(),
  }));
  const velRes = await client.from('learning_velocity').upsert(velocityRows, {
    onConflict: 'student_id,skill_id',
  });
  if (velRes.error !== null) {
    return { touchedSkills, upsertCount: upserts.length, error: velRes.error.message };
  }

  // Per-layer audit log row. Per-skill aggregates only (Q-20.13).
  const auditInput = canonicalize({
    skills: sortBySkillId(upserts.map(u => ({
      skill_id: u.skill_id,
      attempts: u.total_attempts,
      correct: u.correct_attempts,
    }))),
  });
  const auditOutput = canonicalize({
    skills: sortBySkillId(upserts.map(u => ({
      skill_id: u.skill_id,
      mastery_level: u.mastery_level,
      confidence: u.confidence,
    }))),
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

  // §9.5 expected_time_per_item_ms — pull from EngineState if available, else
  // 30s default (matches FrameworkConfig default in @mm/engines).
  const expectedTimeMs = engineExpectedTime(args.state);

  // Compute per-response signals + insert as new learning_event rows
  // (Q-20.12=A — preserves immutability of learning_event).
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

  // Aggregate session-level fatigue + cognitive load + persistence-ish proxy.
  const baseline = avg(responses.slice(0, 5).map(r => (r.is_correct === true ? 1 : 0)));
  const recent = avg(responses.slice(-5).map(r => (r.is_correct === true ? 1 : 0)));
  const totalDurationMs = responses.reduce((a, r) => a + (r.telemetry?.time_to_answer_ms ?? 0), 0);
  const fatigueThresholdMs = (yearLevelDefaults(profile.year_level).avg_fatigue_onset_minutes) * 60_000;
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

  // Read existing behaviour_profile (data_points + computed_at) for §9.6 blend.
  const bpRes = await client
    .from('behaviour_profile')
    .select('student_id, data_points, computed_at')
    .eq('student_id', session.student_id)
    .maybeSingle();
  if (bpRes.error !== null) {
    return { signalsWritten: signalRows.length, profileBlended: false, error: bpRes.error.message };
  }
  const prior = (bpRes.data as BehaviourProfileRow | null);
  const newDataPoints = (prior?.data_points ?? 0) + 1;

  const computed: BehaviourDefaults = {
    avg_guess_rate: avgGuess,
    avg_fatigue_onset_minutes: minutesFromMs(fatigueThresholdMs),
    persistence_score: clamp01(1 - cogLoad), // proxy: low load → high persistence
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

  const auditInput = canonicalize({
    session_id: session.id,
    response_count: responses.length,
    year_level: profile.year_level,
  });
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
}

interface L3aResult {
  prereqsWalked: number;
  misconceptionsUpserted: number;
  error: string | null;
}

async function runCausalScoped(args: L3aArgs): Promise<L3aResult> {
  const { client, session, responses, touchedSkills, eff, traceId } = args;

  // Walk depth-1 prereqs over touched skills. We pull edges scoped to the
  // active graph version — Stage 20 doesn't depend on the cache module here
  // (the cache lives in skill-graph-cache.ts and is wired by index.ts in
  // production; tests pass adjacency directly via a pre-loaded DB).
  // For the handler, query skill_edge directly.
  let adjacency = new Map<string, string[]>();
  if (touchedSkills.length > 0) {
    const edgesRes = await client
      .from('skill_edge')
      .select('from_node_id, to_node_id')
      .in('to_node_id', touchedSkills);
    if (edgesRes.error !== null) {
      return { prereqsWalked: 0, misconceptionsUpserted: 0, error: edgesRes.error.message };
    }
    const edges = (edgesRes.data ?? []) as { from_node_id: string; to_node_id: string }[];
    for (const e of edges) {
      const list = adjacency.get(e.to_node_id) ?? [];
      list.push(e.from_node_id);
      adjacency.set(e.to_node_id, list);
    }
  }
  const walked = walkPrereqsDepth1(touchedSkills, adjacency);

  // Misconception detection: for each incorrect response, look up
  // distractor_rationale[choice_id]?.misconception_id.
  const incorrectResponses = responses.filter(r => r.is_correct === false);
  const incorrectItemIds = [...new Set(incorrectResponses.map(r => r.item_id))].sort();
  const misconceptionUpserts: { student_id: string; tenant_id: string; misconception_id: string; confidence: number; status: 'suspected'; evidence: Record<string, unknown> }[] = [];

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
      // Q-20.11 shape: { [choice_id]: { misconception_id } }
      // Choice id lives in response_data.choice_id (item-type contract).
      const choiceId = (r.response_data['choice_id'] ?? r.response_data['selected_id']) as string | undefined;
      if (typeof choiceId !== 'string') continue;
      const entry = iv.distractor_rationale[choiceId];
      if (entry === undefined || entry.misconception_id === undefined) continue;
      misconceptionUpserts.push({
        student_id: session.student_id,
        tenant_id: session.tenant_id,
        misconception_id: entry.misconception_id,
        confidence: 0.6, // initial detection confidence; v1.1 may refine.
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

  return {
    prereqsWalked: walked.length,
    misconceptionsUpserted: misconceptionUpserts.length,
    error: null,
  };
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
      if (streak === 3) runs += 1; // count each 3+ run once
    } else {
      streak = 0;
    }
  }
  return runs;
}

function engineExpectedTime(state: EngineState): number {
  // SkillEngineState has explicit expected_time_per_item_ms; other engines
  // fall back to the FrameworkConfig default of 30s.
  if (state.engine_type === 'skill') return state.expected_time_per_item_ms;
  return 30_000;
}

function sortMisconceptions<T extends { misconception_id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.misconception_id < b.misconception_id ? -1 : a.misconception_id > b.misconception_id ? 1 : 0,
  );
}
