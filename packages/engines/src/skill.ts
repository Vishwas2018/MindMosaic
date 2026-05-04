/**
 * SkillEngine — Spec §3.2.3.
 *
 * Used by Skill Practice mode. Delivers an unbounded stream of items targeting
 * the session's `target_skills`. Selection prioritises under-mastered /
 * under-practised skills (§7.5.2) and adapts difficulty per-item via the
 * up/down rule (§7.5.1). Cognitive-load aware (§9.5).
 *
 * Pure-function namespace per ADR-0022. JSON-serialisable state. Clock injected
 * per call to `getTimeRemaining`/`terminate`. No `Math.random`, no `Date.now`.
 *
 * Output: `masteryDelta(state)` — a per-skill mastery delta, NOT a score (per
 * §3.2.3 "Session produces skill mastery delta, not a score"). The base
 * `score()` returns neutral values to satisfy the AssessmentEngine interface.
 */
import {
  assertSkillState,
  type AssessmentEngine,
  type EngineItem,
  type EngineResponse,
  type EngineState,
  type FinalResult,
  type FrameworkConfig,
  type ItemDTO,
  type MasteryDeltaResult,
  type ScoreResult,
  type SessionContext,
  type SkillEngineState,
  type SkillId,
  type TerminationReason,
  type TerminationSignal,
} from './contracts.js';

// ─── Helpers (private) ───────────────────────────────────────────────────────

function durationMs(state: SkillEngineState, clock: () => number): number {
  const startedMs = Date.parse(state.started_at);
  const elapsed = clock() - startedMs;
  return elapsed > 0 ? elapsed : 0;
}

function primarySkillForItem(item: EngineItem, targetSkills: SkillId[]): SkillId {
  const match = item.skill_ids.find(s => targetSkills.includes(s));
  if (match === undefined) {
    throw new Error(
      `SkillEngine.recordResponse: item ${item.item_id} is not for any target_skill`,
    );
  }
  return match;
}

/**
 * Cognitive load — Spec §9.5.
 *   load = 0.4*error_burst + 0.35*min(1, time_inflation/3) + 0.25*min(1, answer_change_rate/3)
 *
 * - error_burst: fraction of items that sit inside a run of 3+ consecutive
 *   incorrect responses. With window [I,I,I,C,I] the leading 3-run contributes
 *   3 items → 3/5 = 0.6.
 * - time_inflation: avg(time_to_answer_ms) / expected_time_ms.
 * - answer_change_rate: avg(answer_changes) per item.
 *
 * Telemetry-free responses contribute 0 to time/changes components; only
 * is_correct is needed for error_burst.
 */
export function cognitiveLoad(
  responses: EngineResponse[],
  expectedTimePerItemMs: number,
): number {
  if (responses.length === 0) return 0;
  const n = responses.length;

  // error_burst: count of items inside a run of >= 3 consecutive incorrect.
  let inBurstCount = 0;
  let runStart = -1;
  for (let i = 0; i < n; i++) {
    const r = responses[i];
    if (r === undefined) continue;
    if (!r.is_correct) {
      if (runStart < 0) runStart = i;
    } else {
      if (runStart >= 0 && i - runStart >= 3) {
        inBurstCount += i - runStart;
      }
      runStart = -1;
    }
  }
  if (runStart >= 0 && n - runStart >= 3) {
    inBurstCount += n - runStart;
  }
  const errorBurst = inBurstCount / n;

  // time_inflation: avg time / expected.
  let timeSum = 0;
  let timeCount = 0;
  let changesSum = 0;
  let changesCount = 0;
  for (const r of responses) {
    if (r.telemetry !== undefined) {
      timeSum += r.telemetry.time_to_answer_ms;
      timeCount += 1;
      changesSum += r.telemetry.answer_changes;
      changesCount += 1;
    }
  }
  const timeInflation =
    timeCount > 0 && expectedTimePerItemMs > 0
      ? timeSum / timeCount / expectedTimePerItemMs
      : 0;
  const answerChangeRate = changesCount > 0 ? changesSum / changesCount : 0;

  return (
    0.4 * errorBurst +
    0.35 * Math.min(1, timeInflation / 3) +
    0.25 * Math.min(1, answerChangeRate / 3)
  );
}

/**
 * Skill prioritisation — Spec §7.5.2.
 * Higher score = higher priority. Tie-break: lexicographic by skill_id (Q-16.9).
 */
export function prioritiseSkills(state: SkillEngineState): SkillId[] {
  const targetAttempts = 10; // v1 default; future: per-skill from blueprint
  const pathwayWeight = state.target_skills.length > 0 ? 1 / state.target_skills.length : 0;

  const scored = state.per_skill_state.map(s => {
    const sessionAccuracy =
      s.items_attempted > 0 ? s.items_correct / s.items_attempted : 0;
    const underPractice = Math.max(0, 1 - s.items_attempted / targetAttempts);
    const priority = (1 - sessionAccuracy) * 0.5 + underPractice * 0.3 + pathwayWeight * 0.2;
    return { skill_id: s.skill_id, priority };
  });

  scored.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority; // desc
    return a.skill_id.localeCompare(b.skill_id);
  });
  return scored.map(s => s.skill_id);
}

/**
 * Apply the §7.5.1 in-session difficulty rule on the most recent responses.
 * Returns the new difficulty (clamped to [0,1]).
 */
function applyDifficultyRule(
  current: number,
  responses: EngineResponse[],
  config: {
    difficulty_step_up: number;
    difficulty_step_down: number;
    cognitive_load_threshold: number;
    cognitive_load_step_down: number;
    expected_time_per_item_ms: number;
  },
): number {
  const recent = responses.slice(-5);
  if (recent.length < 3) return current;

  const correctCount = recent.filter(r => r.is_correct).length;
  const accuracy = correctCount / recent.length;

  if (accuracy >= 0.8) {
    return Math.min(1, current + config.difficulty_step_up);
  }
  if (accuracy <= 0.3) {
    return Math.max(0, current - config.difficulty_step_down);
  }
  const load = cognitiveLoad(recent, config.expected_time_per_item_ms);
  if (load > config.cognitive_load_threshold) {
    return Math.max(0, current - config.cognitive_load_step_down);
  }
  return current;
}

// ─── SkillEngine ─────────────────────────────────────────────────────────────

export const SkillEngine: AssessmentEngine = {
  initialise(session: SessionContext, config: FrameworkConfig): EngineState {
    if (config.engine_type !== 'skill') {
      throw new Error(
        `SkillEngine.initialise: expected engine_type='skill', got '${config.engine_type}'`,
      );
    }
    if (session.engine_type !== 'skill') {
      throw new Error(
        `SkillEngine.initialise: SessionContext.engine_type must be 'skill', got '${session.engine_type}'`,
      );
    }
    const timeLimitMs =
      config.time_limit_ms !== null ? config.time_limit_ms : session.time_limit_ms;

    const state: SkillEngineState = {
      engine_type: 'skill',
      session_id: session.session_id,
      mode: session.mode,
      started_at: session.started_at,
      time_limit_ms: timeLimitMs,
      target_skills: session.target_skills,
      per_skill_state: session.target_skills.map(sid => ({
        skill_id: sid,
        items_attempted: 0,
        items_correct: 0,
        last_difficulty: config.diagnostic_start_difficulty,
        consecutive_correct: 0,
        consecutive_incorrect: 0,
        estimated_mastery: 0,
      })),
      current_difficulty: config.diagnostic_start_difficulty,
      current_skill_id: null,
      responses: [],
      answered_item_ids: [],
      item_pool: session.planned_items,
      mastery_threshold: config.mastery_threshold,
      difficulty_step_up: config.difficulty_step_up,
      difficulty_step_down: config.difficulty_step_down,
      cognitive_load_threshold: config.cognitive_load_threshold,
      cognitive_load_step_down: config.cognitive_load_step_down,
      expected_time_per_item_ms: config.expected_time_per_item_ms,
    };
    return state;
  },

  getNextItem(state: EngineState): ItemDTO | TerminationSignal {
    assertSkillState(state);

    if (state.target_skills.length === 0) {
      return { termination: true, reason: 'completed' };
    }

    // Mastery threshold check — terminate when ALL target skills are mastered.
    const allMastered = state.per_skill_state.every(
      s => s.estimated_mastery >= state.mastery_threshold,
    );
    if (allMastered && state.per_skill_state.some(s => s.items_attempted > 0)) {
      // Require at least one item answered before declaring mastery —
      // a fresh session with mastery_threshold=0 wouldn't terminate immediately.
      return { termination: true, reason: 'mastery_reached' };
    }

    const prioritised = prioritiseSkills(state);
    if (prioritised.length === 0) {
      return { termination: true, reason: 'completed' };
    }

    // Try each skill in priority order — fall through if a skill has no
    // unanswered items left in the pool.
    for (const skillId of prioritised) {
      const candidates = state.item_pool.filter(
        it =>
          it.skill_ids.includes(skillId) && !state.answered_item_ids.includes(it.item_id),
      );
      if (candidates.length === 0) continue;

      // Closest difficulty match; tie-break lexicographic by item_id (Q-16.9).
      candidates.sort((a, b) => {
        const da = Math.abs(a.difficulty - state.current_difficulty);
        const db = Math.abs(b.difficulty - state.current_difficulty);
        if (da !== db) return da - db;
        return a.item_id.localeCompare(b.item_id);
      });
      const next = candidates[0];
      if (next !== undefined) return next;
    }

    // No items left for any target skill.
    return { termination: true, reason: 'completed' };
  },

  recordResponse(state: EngineState, response: EngineResponse): EngineState {
    assertSkillState(state);

    const item = state.item_pool.find(it => it.item_id === response.item_id);
    if (item === undefined) {
      throw new Error(
        `SkillEngine.recordResponse: response.item_id is not in item_pool`,
      );
    }
    const skillId = primarySkillForItem(item, state.target_skills);

    const newPerSkill = state.per_skill_state.map(ps => {
      if (ps.skill_id !== skillId) return ps;
      const itemsAttempted = ps.items_attempted + 1;
      const itemsCorrect = ps.items_correct + (response.is_correct ? 1 : 0);
      return {
        skill_id: ps.skill_id,
        items_attempted: itemsAttempted,
        items_correct: itemsCorrect,
        last_difficulty: item.difficulty,
        consecutive_correct: response.is_correct ? ps.consecutive_correct + 1 : 0,
        consecutive_incorrect: response.is_correct ? 0 : ps.consecutive_incorrect + 1,
        estimated_mastery: itemsCorrect / itemsAttempted,
      };
    });

    const newResponses = [...state.responses, response];
    const newDifficulty = applyDifficultyRule(state.current_difficulty, newResponses, {
      difficulty_step_up: state.difficulty_step_up,
      difficulty_step_down: state.difficulty_step_down,
      cognitive_load_threshold: state.cognitive_load_threshold,
      cognitive_load_step_down: state.cognitive_load_step_down,
      expected_time_per_item_ms: state.expected_time_per_item_ms,
    });

    const next: SkillEngineState = {
      ...state,
      per_skill_state: newPerSkill,
      responses: newResponses,
      answered_item_ids: [...state.answered_item_ids, response.item_id],
      current_difficulty: newDifficulty,
      current_skill_id: skillId,
    };
    return next;
  },

  score(state: EngineState): ScoreResult {
    assertSkillState(state);
    const itemsCorrect = state.responses.filter(r => r.is_correct).length;
    const itemsAnswered = state.responses.length;
    return {
      raw: itemsCorrect, // count of correct responses
      scaled: 0,         // unscored mode (§3.2.3): real output is masteryDelta()
      band: null,
      items_correct: itemsCorrect,
      items_answered: itemsAnswered,
      duration_ms: 0,
      skills_touched: [...state.target_skills].sort(),
    };
  },

  canNavigateBack(state: EngineState): boolean {
    assertSkillState(state);
    // Skill practice is forward-only — re-attempting a "different" item at a
    // different difficulty is the user-facing equivalent of a re-do.
    return false;
  },

  getTimeRemaining(state: EngineState, clock: () => number): number | null {
    assertSkillState(state);
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
    assertSkillState(state);
    const score = SkillEngine.score(state);
    const elapsed = durationMs(state, clock);
    return {
      state,
      score: { ...score, duration_ms: elapsed },
      reason,
      terminated_at: new Date(clock()).toISOString(),
    };
  },
};

// ─── Output helper ───────────────────────────────────────────────────────────

export function masteryDelta(state: EngineState, clock?: () => number): MasteryDeltaResult {
  assertSkillState(state);
  return {
    per_skill: state.per_skill_state.map(s => ({
      skill_id: s.skill_id,
      items_attempted: s.items_attempted,
      items_correct: s.items_correct,
      // Pre-session estimate is 0 in v1 (Stage 20 will plug real prior mastery).
      delta_mastery: s.estimated_mastery,
      new_estimated_mastery: s.estimated_mastery,
    })),
    duration_ms: clock !== undefined ? durationMs(state, clock) : 0,
  };
}
