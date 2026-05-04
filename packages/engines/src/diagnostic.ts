/**
 * DiagnosticEngine — Spec §3.2.4.
 *
 * Used by Diagnostic mode (and onboarding assessments). Estimates proficiency
 * across `target_skills` with as few items as possible by binary-searching
 * difficulty: each correct response raises the lower bound; each incorrect
 * lowers the upper bound. Terminates on `confidence_threshold_met` (all skills
 * have narrow enough ranges) or `max_items_reached`.
 *
 * Output: `proficiencyMap(state)` — per-skill mastery + confidence + items
 * administered, projected onto the `MasteryBand` enum from `@mm/types`.
 *
 * Pure-function namespace per ADR-0022. JSON-serialisable state. Clock injected
 * per-call only.
 *
 * v1 confidence model (Stage 16): structural confidence from range narrowing
 * (`1 - (high - low)`). Stage 20 will plug the full Spec §8.4 model with
 * sample-size + recency + behavioural inputs.
 */
import {
  assertDiagnosticState,
  type AssessmentEngine,
  type DiagnosticEngineState,
  type DiagnosticProbe,
  type EngineItem,
  type EngineResponse,
  type EngineState,
  type FinalResult,
  type FrameworkConfig,
  type ItemDTO,
  type MasteryBand,
  type ProficiencyResult,
  type ProficiencySkillEntry,
  type ScoreResult,
  type SessionContext,
  type SkillId,
  type TerminationReason,
  type TerminationSignal,
} from './contracts.js';

// ─── Helpers (private) ───────────────────────────────────────────────────────

function durationMs(state: DiagnosticEngineState, clock: () => number): number {
  const startedMs = Date.parse(state.started_at);
  const elapsed = clock() - startedMs;
  return elapsed > 0 ? elapsed : 0;
}

function primarySkillForItem(item: EngineItem, targetSkills: SkillId[]): SkillId {
  const match = item.skill_ids.find(s => targetSkills.includes(s));
  if (match === undefined) {
    throw new Error(
      `DiagnosticEngine.recordResponse: item ${item.item_id} is not for any target_skill`,
    );
  }
  return match;
}

/**
 * Estimate confidence from the binary-search range. Range [0,1] → 0 confidence;
 * range [0.45, 0.55] → 0.9 confidence. Always clamped to [0,1].
 */
export function estimateConfidence(probe: DiagnosticProbe): number {
  const range = Math.max(0, probe.high_difficulty - probe.low_difficulty);
  return Math.max(0, Math.min(1, 1 - range));
}

/** Map a 0..1 mastery_level to the 4-band MasteryBand enum from @mm/types. */
function masteryToBand(mastery: number): MasteryBand {
  if (mastery >= 0.85) return 'mastered';
  if (mastery >= 0.65) return 'proficient';
  if (mastery >= 0.4) return 'developing';
  return 'novice';
}

/**
 * Pick the skill with lowest confidence (most uncertain). Tie-break:
 * lexicographic by skill_id (Q-16.9).
 */
function selectTargetSkill(state: DiagnosticEngineState): SkillId | null {
  if (state.per_skill_probe.length === 0) return null;
  const sorted = [...state.per_skill_probe].sort((a, b) => {
    if (a.estimated_confidence !== b.estimated_confidence) {
      return a.estimated_confidence - b.estimated_confidence;
    }
    return a.skill_id.localeCompare(b.skill_id);
  });
  const first = sorted[0];
  return first === undefined ? null : first.skill_id;
}

// ─── DiagnosticEngine ────────────────────────────────────────────────────────

export const DiagnosticEngine: AssessmentEngine = {
  initialise(session: SessionContext, config: FrameworkConfig): EngineState {
    if (config.engine_type !== 'diagnostic') {
      throw new Error(
        `DiagnosticEngine.initialise: expected engine_type='diagnostic', got '${config.engine_type}'`,
      );
    }
    if (session.engine_type !== 'diagnostic') {
      throw new Error(
        `DiagnosticEngine.initialise: SessionContext.engine_type must be 'diagnostic', got '${session.engine_type}'`,
      );
    }
    const timeLimitMs =
      config.time_limit_ms !== null ? config.time_limit_ms : session.time_limit_ms;

    const state: DiagnosticEngineState = {
      engine_type: 'diagnostic',
      session_id: session.session_id,
      mode: session.mode,
      started_at: session.started_at,
      time_limit_ms: timeLimitMs,
      target_skills: session.target_skills,
      per_skill_probe: session.target_skills.map(sid => ({
        skill_id: sid,
        low_difficulty: 0,
        high_difficulty: 1,
        items_administered: 0,
        // Mastery initialised to start_difficulty so the first probe sits there.
        estimated_mastery: config.diagnostic_start_difficulty,
        estimated_confidence: 0,
      })),
      responses: [],
      answered_item_ids: [],
      item_pool: session.planned_items,
      current_target_skill: null,
      max_items: config.max_items,
      confidence_threshold: config.confidence_threshold,
      diagnostic_start_difficulty: config.diagnostic_start_difficulty,
    };
    return state;
  },

  getNextItem(state: EngineState): ItemDTO | TerminationSignal {
    assertDiagnosticState(state);

    if (state.target_skills.length === 0) {
      return { termination: true, reason: 'completed' };
    }

    if (state.responses.length >= state.max_items) {
      return { termination: true, reason: 'max_items_reached' };
    }

    // All skills converged?
    const allConverged = state.per_skill_probe.every(
      p => p.estimated_confidence >= state.confidence_threshold,
    );
    if (allConverged) {
      return { termination: true, reason: 'confidence_threshold_met' };
    }

    const targetSkill = selectTargetSkill(state);
    if (targetSkill === null) {
      return { termination: true, reason: 'completed' };
    }
    const probe = state.per_skill_probe.find(p => p.skill_id === targetSkill);
    if (probe === undefined) {
      return { termination: true, reason: 'completed' };
    }

    const targetDifficulty =
      probe.items_administered === 0
        ? state.diagnostic_start_difficulty
        : (probe.low_difficulty + probe.high_difficulty) / 2;

    const candidates = state.item_pool.filter(
      it =>
        it.skill_ids.includes(targetSkill) && !state.answered_item_ids.includes(it.item_id),
    );
    if (candidates.length === 0) {
      return { termination: true, reason: 'completed' };
    }

    candidates.sort((a, b) => {
      const da = Math.abs(a.difficulty - targetDifficulty);
      const db = Math.abs(b.difficulty - targetDifficulty);
      if (da !== db) return da - db;
      return a.item_id.localeCompare(b.item_id);
    });
    const next = candidates[0];
    if (next === undefined) return { termination: true, reason: 'completed' };
    return next;
  },

  recordResponse(state: EngineState, response: EngineResponse): EngineState {
    assertDiagnosticState(state);

    const item = state.item_pool.find(it => it.item_id === response.item_id);
    if (item === undefined) {
      throw new Error(
        `DiagnosticEngine.recordResponse: response.item_id is not in item_pool`,
      );
    }
    const skillId = primarySkillForItem(item, state.target_skills);

    const newProbe = state.per_skill_probe.map(p => {
      if (p.skill_id !== skillId) return p;

      // Correct → student is at LEAST this difficult; raise low bound.
      // Incorrect → student is at MOST this difficult; lower high bound.
      const newLow = response.is_correct
        ? Math.max(p.low_difficulty, item.difficulty)
        : p.low_difficulty;
      const newHigh = !response.is_correct
        ? Math.min(p.high_difficulty, item.difficulty)
        : p.high_difficulty;

      // Guard inverted ranges (shouldn't happen in well-formed pools).
      const safeLow = Math.min(newLow, newHigh);
      const safeHigh = Math.max(newLow, newHigh);
      const newMastery = (safeLow + safeHigh) / 2;

      const updated: DiagnosticProbe = {
        skill_id: p.skill_id,
        low_difficulty: safeLow,
        high_difficulty: safeHigh,
        items_administered: p.items_administered + 1,
        estimated_mastery: newMastery,
        estimated_confidence: 0, // recomputed below via estimateConfidence
      };
      updated.estimated_confidence = estimateConfidence(updated);
      return updated;
    });

    const next: DiagnosticEngineState = {
      ...state,
      per_skill_probe: newProbe,
      responses: [...state.responses, response],
      answered_item_ids: [...state.answered_item_ids, response.item_id],
      current_target_skill: skillId,
    };
    return next;
  },

  score(state: EngineState): ScoreResult {
    assertDiagnosticState(state);
    return {
      raw: 0,           // diagnostic isn't pass/fail
      scaled: 0,
      band: null,
      items_correct: state.responses.filter(r => r.is_correct).length,
      items_answered: state.responses.length,
      duration_ms: 0,
      skills_touched: [...state.target_skills].sort(),
    };
  },

  canNavigateBack(state: EngineState): boolean {
    assertDiagnosticState(state);
    // Diagnostic probes commit each response into the binary-search range.
    // Allowing back-nav would invalidate the search invariants.
    return false;
  },

  getTimeRemaining(state: EngineState, clock: () => number): number | null {
    assertDiagnosticState(state);
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
    assertDiagnosticState(state);
    const score = DiagnosticEngine.score(state);
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

export function proficiencyMap(
  state: EngineState,
  clock?: () => number,
): ProficiencyResult {
  assertDiagnosticState(state);
  const skills: ProficiencySkillEntry[] = state.per_skill_probe.map(p => ({
    skill_id: p.skill_id,
    band: masteryToBand(p.estimated_mastery),
    mastery_level: p.estimated_mastery,
    confidence: p.estimated_confidence,
    items_administered: p.items_administered,
  }));
  return {
    skills,
    duration_ms: clock !== undefined ? durationMs(state, clock) : 0,
  };
}
