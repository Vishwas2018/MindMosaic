/**
 * LinearEngine — Spec §3.2.2.
 *
 * Used by ICAS, Selective Entry, and any framework that delivers a fixed
 * sequence of items in a single pass.
 *
 * Pure-function namespace per ADR-0022. Every method is a side-effect-free
 * function; the engine never reads `Date.now()`, `Math.random`, or any global.
 * Time is sourced via the `clock` parameter on `getTimeRemaining` and
 * `terminate` only.
 *
 * Stage 16 — `EngineState` is now a discriminated union (ADR-0023). Each method
 * starts with `assertLinearState(state)` to narrow the union to this engine's
 * branch.
 */
import {
  assertLinearState,
  type AssessmentEngine,
  type EngineItem,
  type EngineResponse,
  type EngineState,
  type FinalResult,
  type FrameworkConfig,
  type ItemDTO,
  type LinearEngineState,
  type ScoreResult,
  type ScoringRules,
  type SessionContext,
  type SkillId,
  type TerminationReason,
  type TerminationSignal,
} from './contracts.js';

// ─── Helpers (private) ───────────────────────────────────────────────────────

function selectScoringRules(config: FrameworkConfig): ScoringRules {
  return config.scoring_rules;
}

function applyScoringFormula(
  rules: ScoringRules,
  rawCorrect: number,
  totalItems: number,
): number {
  if (rules.scaled_score_formula === 'identity') {
    return rawCorrect;
  }
  if (totalItems === 0) return 0;
  return Math.round((rawCorrect / totalItems) * 100);
}

function selectBand(rules: ScoringRules, scaled: number): string | null {
  for (const band of rules.bands) {
    if (scaled >= band.min && scaled <= band.max) return band.label;
  }
  return null;
}

function durationMs(state: LinearEngineState, clock: () => number): number {
  const startedMs = Date.parse(state.started_at);
  const elapsed = clock() - startedMs;
  return elapsed > 0 ? elapsed : 0;
}

function uniqueSkillsTouched(state: LinearEngineState): SkillId[] {
  // Items now carry skill_ids (Stage 16 EngineItem). Aggregate unique skills
  // across items the student has actually responded to.
  const answered = new Set(state.responses.map(r => r.item_id));
  const skills = new Set<SkillId>();
  for (const item of state.planned_items) {
    if (!answered.has(item.item_id)) continue;
    for (const sid of item.skill_ids) skills.add(sid);
  }
  return Array.from(skills).sort();
}

// ─── LinearEngine ────────────────────────────────────────────────────────────

export const LinearEngine: AssessmentEngine = {
  initialise(session: SessionContext, config: FrameworkConfig): EngineState {
    if (config.engine_type !== 'linear') {
      throw new Error(
        `LinearEngine.initialise: expected engine_type='linear', got '${config.engine_type}'`,
      );
    }
    if (session.engine_type !== 'linear') {
      throw new Error(
        `LinearEngine.initialise: SessionContext.engine_type must be 'linear', got '${session.engine_type}'`,
      );
    }
    const timeLimitMs =
      config.time_limit_ms !== null ? config.time_limit_ms : session.time_limit_ms;

    const state: LinearEngineState = {
      engine_type: 'linear',
      session_id: session.session_id,
      mode: session.mode,
      planned_items: session.planned_items,
      current_index: 0,
      responses: [],
      flagged_item_ids: [],
      started_at: session.started_at,
      time_limit_ms: timeLimitMs,
      total_items: session.planned_items.length,
    };
    return state;
  },

  getNextItem(state: EngineState): ItemDTO | TerminationSignal {
    assertLinearState(state);
    if (state.current_index >= state.planned_items.length) {
      return { termination: true, reason: 'completed' };
    }
    const next: EngineItem | undefined = state.planned_items[state.current_index];
    if (next === undefined) {
      return { termination: true, reason: 'completed' };
    }
    return next;
  },

  recordResponse(state: EngineState, response: EngineResponse): EngineState {
    assertLinearState(state);
    const existingIndex = state.responses.findIndex(r => r.item_id === response.item_id);
    let newResponses: EngineResponse[];
    let newCurrentIndex: number;

    if (existingIndex >= 0) {
      newResponses = state.responses.map((r, i) => (i === existingIndex ? response : r));
      newCurrentIndex = state.current_index;
    } else {
      const itemIndex = state.planned_items.findIndex(it => it.item_id === response.item_id);
      if (itemIndex < 0) {
        throw new Error(
          `LinearEngine.recordResponse: response.item_id is not in planned_items`,
        );
      }
      newResponses = [...state.responses, response];
      if (itemIndex === state.current_index) {
        newCurrentIndex = Math.min(state.current_index + 1, state.planned_items.length);
      } else {
        newCurrentIndex = state.current_index;
      }
    }

    const next: LinearEngineState = {
      ...state,
      responses: newResponses,
      current_index: newCurrentIndex,
    };
    return next;
  },

  score(state: EngineState): ScoreResult {
    assertLinearState(state);
    const itemsCorrect = state.responses.filter(r => r.is_correct).length;
    const itemsAnswered = state.responses.length;

    return {
      raw: itemsCorrect,
      scaled: itemsCorrect, // identity-default; scoreWithConfig applies formula
      band: null,
      items_correct: itemsCorrect,
      items_answered: itemsAnswered,
      duration_ms: 0, // wall-clock duration is emitted by terminate()
      skills_touched: uniqueSkillsTouched(state),
    };
  },

  canNavigateBack(state: EngineState): boolean {
    assertLinearState(state);
    // v1.1-S3 (ADR-0037 §Decision 4, Q-1.1-3.3): simulation mode locks
    // back-navigation server-side. State-flag consultation; no interface change.
    if (state.simulation_params?.no_back_nav === true) return false;
    return state.current_index > 0;
  },

  getTimeRemaining(state: EngineState, clock: () => number): number | null {
    assertLinearState(state);
    if (state.time_limit_ms === null) return null;
    const startedMs = Date.parse(state.started_at);
    const elapsed = clock() - startedMs;
    const remaining = state.time_limit_ms - elapsed;
    return remaining > 0 ? remaining : 0;
  },

  terminate(
    state: EngineState,
    reason: TerminationReason,
    clock: () => number,
  ): FinalResult {
    assertLinearState(state);
    const score = LinearEngine.score(state);
    const elapsed = durationMs(state, clock);
    const finalScore: ScoreResult = { ...score, duration_ms: elapsed };
    return {
      state,
      score: finalScore,
      reason,
      terminated_at: new Date(clock()).toISOString(),
    };
  },
};

// ─── Public extras (config-aware scoring) ────────────────────────────────────
// The plain `score(state)` defaults to identity; assessment-svc and tests call
// these helpers when they want band/scaled values from a specific
// FrameworkConfig.

export function scoreWithConfig(
  state: EngineState,
  config: FrameworkConfig,
): ScoreResult {
  assertLinearState(state);
  const base = LinearEngine.score(state);
  const rules = selectScoringRules(config);
  const scaled = applyScoringFormula(rules, base.raw, state.total_items);
  const band = selectBand(rules, scaled);
  return { ...base, scaled, band };
}

export function terminateWithConfig(
  state: EngineState,
  reason: TerminationReason,
  clock: () => number,
  config: FrameworkConfig,
): FinalResult {
  assertLinearState(state);
  const base = LinearEngine.terminate(state, reason, clock);
  const score = scoreWithConfig(state, config);
  return { ...base, score: { ...score, duration_ms: base.score.duration_ms } };
}
