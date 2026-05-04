/**
 * SkillEngine — Stage 16 unit tests.
 *
 * Covers Spec §3.2.3 (SkillEngine behaviour), §7.5.1 (in-session difficulty
 * rule including the cognitive-load branch — explicit DEV_PLAN exit
 * criterion), §7.5.2 (skill prioritisation), §9.5 (cognitive load formula).
 *
 * Every test uses a deterministic clock and constructed responses; no
 * Math.random, no real Date.now.
 */
import { describe, expect, it } from 'vitest';
import {
  SkillEngine,
  cognitiveLoad,
  prioritiseSkills,
  masteryDelta,
  isTerminationSignal,
  EngineStateSchema,
  type EngineItem,
  type EngineResponse,
  type FrameworkConfig,
  type ItemId,
  type SessionContext,
  type SkillEngineState,
} from '../index.js';
import {
  buildEngineItemPool,
  buildSkillSession,
  buildSkillConfig,
  buildResponse,
  clockAt,
  skillId,
} from './_fixtures.js';

// ─── Fixtures specific to these tests ────────────────────────────────────────

const SKILL_A = skillId(0);
const SKILL_B = skillId(1);
const SKILL_C = skillId(2);

function singleSkillSetup(opts: { difficulties?: number[] } = {}): {
  session: SessionContext;
  config: FrameworkConfig;
  pool: EngineItem[];
} {
  const difficulties = opts.difficulties ?? [0.3, 0.5, 0.7, 0.4, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5];
  const pool = buildEngineItemPool({ skills: [SKILL_A], difficulties });
  const session = buildSkillSession({ skills: [SKILL_A], pool });
  const config = buildSkillConfig();
  return { session, config, pool };
}

function multiSkillSetup(): { session: SessionContext; config: FrameworkConfig; pool: EngineItem[] } {
  const pool = buildEngineItemPool({
    skills: [SKILL_A, SKILL_B, SKILL_C],
    difficulties: [0.3, 0.5, 0.7],
  });
  const session = buildSkillSession({ skills: [SKILL_A, SKILL_B, SKILL_C], pool });
  const config = buildSkillConfig();
  return { session, config, pool };
}

function asSkill(state: ReturnType<typeof SkillEngine.initialise>): SkillEngineState {
  if (state.engine_type !== 'skill') throw new Error('expected skill state');
  return state;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SkillEngine — initialise', () => {
  it('builds a JSON-round-trippable EngineState', () => {
    const { session, config } = multiSkillSetup();
    const state = SkillEngine.initialise(session, config);
    const parsed = EngineStateSchema.parse(JSON.parse(JSON.stringify(state)));
    expect(parsed).toEqual(state);
  });

  it('per_skill_state has one entry per target skill, all defaults', () => {
    const { session, config } = multiSkillSetup();
    const state = asSkill(SkillEngine.initialise(session, config));
    expect(state.per_skill_state).toHaveLength(3);
    expect(state.per_skill_state.map(s => s.skill_id).sort()).toEqual(
      [SKILL_A, SKILL_B, SKILL_C].sort(),
    );
    state.per_skill_state.forEach(s => {
      expect(s.items_attempted).toBe(0);
      expect(s.items_correct).toBe(0);
      expect(s.consecutive_correct).toBe(0);
      expect(s.consecutive_incorrect).toBe(0);
      expect(s.estimated_mastery).toBe(0);
    });
    expect(state.current_difficulty).toBe(config.diagnostic_start_difficulty);
    expect(state.current_skill_id).toBeNull();
  });

  it('throws on engine_type mismatch (config)', () => {
    const { session } = singleSkillSetup();
    expect(() => SkillEngine.initialise(session, buildSkillConfig({ engine_type: 'linear' }))).toThrow(
      /expected engine_type='skill'/,
    );
  });

  it('throws on engine_type mismatch (session)', () => {
    const { session, config } = singleSkillSetup();
    const wrongSession = { ...session, engine_type: 'linear' as const };
    expect(() => SkillEngine.initialise(wrongSession, config)).toThrow(
      /SessionContext.engine_type must be 'skill'/,
    );
  });
});

describe('SkillEngine — getNextItem & selection', () => {
  it('empty target_skills → completed termination', () => {
    const pool = buildEngineItemPool({ skills: [SKILL_A], difficulties: [0.5] });
    const session = buildSkillSession({ skills: [], pool });
    const config = buildSkillConfig();
    const state = SkillEngine.initialise(session, config);
    const next = SkillEngine.getNextItem(state);
    expect(isTerminationSignal(next)).toBe(true);
  });

  it('picks the closest-difficulty item for the highest-priority skill', () => {
    const { session, config, pool } = singleSkillSetup({ difficulties: [0.1, 0.5, 0.9] });
    const state = SkillEngine.initialise(session, config);
    const next = SkillEngine.getNextItem(state);
    expect(isTerminationSignal(next)).toBe(false);
    // current_difficulty defaults to 0.5 → matches the 0.5 item exactly
    expect((next as EngineItem).item_id).toBe(pool[1]!.item_id);
  });

  it('tie-break: lexicographic by item_id when difficulty distance ties', () => {
    // Two items at equidistant difficulty (0.4 and 0.6 from 0.5).
    const pool = buildEngineItemPool({ skills: [SKILL_A], difficulties: [0.6, 0.4] });
    const session = buildSkillSession({ skills: [SKILL_A], pool });
    const state = SkillEngine.initialise(session, buildSkillConfig());
    const next = SkillEngine.getNextItem(state);
    if (isTerminationSignal(next)) throw new Error('expected an item');
    // Pool index 0 = first item ID alphabetically, index 1 = second.
    expect(next.item_id).toBe(pool[0]!.item_id);
  });

  it('picks the highest-priority skill (lowest accuracy first)', () => {
    const { session, config, pool } = multiSkillSetup();
    let state = SkillEngine.initialise(session, config);

    // Answer 2 correct on SKILL_A, 1 incorrect on SKILL_B; SKILL_C untouched.
    const itemA = pool.find(it => it.skill_ids.includes(SKILL_A) && it.difficulty === 0.5)!;
    const itemB = pool.find(it => it.skill_ids.includes(SKILL_B) && it.difficulty === 0.5)!;
    state = SkillEngine.recordResponse(
      state,
      buildResponse({ item: itemA, isCorrect: true, offsetMs: 1_000 }),
    );
    state = SkillEngine.recordResponse(
      state,
      buildResponse({ item: itemB, isCorrect: false, offsetMs: 2_000 }),
    );

    const prioritised = prioritiseSkills(asSkill(state));
    // SKILL_C (untouched, accuracy 0) and SKILL_B (1 attempt, 0% accuracy) tie on
    // accuracy — but SKILL_C has lower under-practice score so SKILL_B wins;
    // both should sit ahead of SKILL_A which has 100% accuracy. Verify SKILL_A
    // is last regardless of tie-break order.
    expect(prioritised[2]).toBe(SKILL_A);
  });

  it('signals mastery_reached when all skills above threshold', () => {
    const { session, config, pool } = singleSkillSetup({
      difficulties: [0.5, 0.5, 0.5, 0.5, 0.5],
    });
    let state = SkillEngine.initialise(session, config);
    // Answer 5 correct → mastery = 1.0 ≥ 0.85 default threshold.
    pool.forEach((it, i) => {
      state = SkillEngine.recordResponse(
        state,
        buildResponse({ item: it, isCorrect: true, offsetMs: (i + 1) * 1_000 }),
      );
    });
    const next = SkillEngine.getNextItem(state);
    expect(isTerminationSignal(next)).toBe(true);
    if (isTerminationSignal(next)) {
      expect(next.reason).toBe('mastery_reached');
    }
  });
});

describe('SkillEngine — recordResponse', () => {
  it('updates per_skill counters for the responded skill', () => {
    const { session, config, pool } = singleSkillSetup();
    let state = SkillEngine.initialise(session, config);
    state = SkillEngine.recordResponse(
      state,
      buildResponse({ item: pool[0]!, isCorrect: true, offsetMs: 1_000 }),
    );
    const skState = asSkill(state).per_skill_state[0]!;
    expect(skState.items_attempted).toBe(1);
    expect(skState.items_correct).toBe(1);
    expect(skState.estimated_mastery).toBe(1);
    expect(skState.consecutive_correct).toBe(1);
    expect(skState.consecutive_incorrect).toBe(0);
  });

  it('consecutive_correct resets on incorrect, consecutive_incorrect increments', () => {
    const { session, config, pool } = singleSkillSetup();
    let state = SkillEngine.initialise(session, config);
    state = SkillEngine.recordResponse(
      state,
      buildResponse({ item: pool[0]!, isCorrect: true, offsetMs: 1_000 }),
    );
    state = SkillEngine.recordResponse(
      state,
      buildResponse({ item: pool[1]!, isCorrect: true, offsetMs: 2_000 }),
    );
    state = SkillEngine.recordResponse(
      state,
      buildResponse({ item: pool[2]!, isCorrect: false, offsetMs: 3_000 }),
    );
    const skState = asSkill(state).per_skill_state[0]!;
    expect(skState.consecutive_correct).toBe(0);
    expect(skState.consecutive_incorrect).toBe(1);
    expect(skState.items_correct).toBe(2);
  });

  it('throws when response.item_id is not in item_pool', () => {
    const { session, config } = singleSkillSetup();
    const state = SkillEngine.initialise(session, config);
    const stranger: EngineResponse = {
      item_id: '99999999-9999-4999-8999-999999999999' as ItemId,
      is_correct: false,
      response_data: {},
      answered_at: '2026-05-04T10:00:00.000Z',
    };
    expect(() => SkillEngine.recordResponse(state, stranger)).toThrow(/not in item_pool/);
  });
});

describe('SkillEngine — difficulty rule (§7.5.1)', () => {
  it('3+ recent at ≥ 80% accuracy → difficulty + step_up (0.1)', () => {
    const { session, config, pool } = singleSkillSetup();
    let state = SkillEngine.initialise(session, config);
    // 3 correct in a row → 100% accuracy → +0.1 from 0.5 = 0.6
    for (let i = 0; i < 3; i++) {
      state = SkillEngine.recordResponse(
        state,
        buildResponse({ item: pool[i]!, isCorrect: true, offsetMs: (i + 1) * 1_000 }),
      );
    }
    expect(asSkill(state).current_difficulty).toBeCloseTo(0.6, 5);
  });

  it('3+ recent at ≤ 30% accuracy → difficulty − step_down (0.15)', () => {
    const { session, config, pool } = singleSkillSetup();
    let state = SkillEngine.initialise(session, config);
    // 3 incorrect: rule fires after the 3rd response and applies once.
    // (A 4th would re-trigger and stack, dropping by 0.15 again — that's
    // intentional per Spec §7.5.1, applied per-response.)
    for (let i = 0; i < 3; i++) {
      state = SkillEngine.recordResponse(
        state,
        buildResponse({ item: pool[i]!, isCorrect: false, offsetMs: (i + 1) * 1_000 }),
      );
    }
    expect(asSkill(state).current_difficulty).toBeCloseTo(0.35, 5);
  });

  it('cognitive_load > 0.8 with moderate accuracy → difficulty − cognitive_load_step_down (-0.1) — DEV_PLAN exit criterion', () => {
    // Use a pool with a 0.5 difficulty item available for each response to
    // avoid difficulty drift from item difficulty itself.
    const pool = buildEngineItemPool({
      skills: [SKILL_A],
      difficulties: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    });
    const session = buildSkillSession({ skills: [SKILL_A], pool });
    const config = buildSkillConfig();
    let state = SkillEngine.initialise(session, config);

    // Pattern [T,T,F,F,F] over the last 5 produces:
    //   accuracy = 40% → not >=80, not <=30 (avoids low-accuracy branch)
    //   trailing 3-incorrect run → error_burst = 3/5 = 0.6
    // With high telemetry, cognitive_load = 0.4*0.6 + 0.35 + 0.25 = 0.84 > 0.8.
    // Triggers the cognitive-load branch (-0.1).
    const tele = { time_to_answer_ms: 200_000, answer_changes: 10 };
    const pattern = [true, true, false, false, false];
    pattern.forEach((isCorrect, i) => {
      state = SkillEngine.recordResponse(
        state,
        buildResponse({ item: pool[i]!, isCorrect, offsetMs: (i + 1) * 1_000, telemetry: tele }),
      );
    });
    // Two earlier responses (T,T) with <3 in window → unchanged.
    // Then T,T,F → 67% → load = 0 (no 3-run yet) + 0.6 = 0.60 → unchanged.
    // Then T,T,F,F → 50% → load = 0 + 0.6 = 0.60 → unchanged.
    // Then T,T,F,F,F → 40% → error_burst 0.6 → load = 0.84 → −0.1.
    const final = asSkill(state).current_difficulty;
    expect(final).toBeLessThan(0.5);
    expect(final).toBeCloseTo(0.4, 5);
  });

  it('< 3 responses → difficulty unchanged', () => {
    const { session, config, pool } = singleSkillSetup();
    let state = SkillEngine.initialise(session, config);
    state = SkillEngine.recordResponse(
      state,
      buildResponse({ item: pool[0]!, isCorrect: true, offsetMs: 1_000 }),
    );
    state = SkillEngine.recordResponse(
      state,
      buildResponse({ item: pool[1]!, isCorrect: true, offsetMs: 2_000 }),
    );
    expect(asSkill(state).current_difficulty).toBeCloseTo(0.5, 5);
  });

  it('difficulty clamped to [0,1]', () => {
    const { session, pool } = singleSkillSetup();
    let state = SkillEngine.initialise(session, buildSkillConfig({ diagnostic_start_difficulty: 0.95 }));
    // 3 correct → +0.1 would push to 1.05; expect clamp to 1.
    for (let i = 0; i < 3; i++) {
      state = SkillEngine.recordResponse(
        state,
        buildResponse({ item: pool[i]!, isCorrect: true, offsetMs: (i + 1) * 1_000 }),
      );
    }
    expect(asSkill(state).current_difficulty).toBeLessThanOrEqual(1);
    expect(asSkill(state).current_difficulty).toBe(1);
  });
});

describe('SkillEngine — cognitiveLoad formula (§9.5)', () => {
  it('empty window → 0', () => {
    expect(cognitiveLoad([], 30_000)).toBe(0);
  });

  it('no errors, no telemetry → 0', () => {
    const responses: EngineResponse[] = Array.from({ length: 3 }, (_, i) => ({
      item_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` as ItemId,
      is_correct: true,
      response_data: {},
      answered_at: '2026-05-04T10:00:00.000Z',
    }));
    expect(cognitiveLoad(responses, 30_000)).toBe(0);
  });

  it('3+ consecutive incorrect contributes to error_burst', () => {
    const responses: EngineResponse[] = Array.from({ length: 5 }, (_, i) => ({
      item_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` as ItemId,
      is_correct: i >= 3, // first 3 are incorrect (i=0,1,2 → false), last 2 correct → run of 3
      response_data: {},
      answered_at: '2026-05-04T10:00:00.000Z',
    }));
    const load = cognitiveLoad(responses, 30_000);
    // error_burst = 3/5 = 0.6 → 0.4 * 0.6 = 0.24
    expect(load).toBeCloseTo(0.24, 5);
  });

  it('time_inflation > expected scales the time component', () => {
    const responses: EngineResponse[] = Array.from({ length: 3 }, (_, i) => ({
      item_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` as ItemId,
      is_correct: true,
      response_data: {},
      answered_at: '2026-05-04T10:00:00.000Z',
      telemetry: { time_to_answer_ms: 90_000, answer_changes: 0 }, // 3x expected
    }));
    const load = cognitiveLoad(responses, 30_000);
    // No errors, 0 changes; time_inflation/3 = 1.0 (clamped) → 0.35 * 1 = 0.35
    expect(load).toBeCloseTo(0.35, 5);
  });
});

describe('SkillEngine — termination', () => {
  it('mastery threshold terminates — DEV_PLAN exit criterion', () => {
    const pool = buildEngineItemPool({
      skills: [SKILL_A],
      difficulties: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    });
    const session = buildSkillSession({ skills: [SKILL_A], pool });
    const config = buildSkillConfig({ mastery_threshold: 0.85 });
    let state = SkillEngine.initialise(session, config);
    // 9 correct of 10 → mastery 0.9 ≥ 0.85
    for (let i = 0; i < 10; i++) {
      state = SkillEngine.recordResponse(
        state,
        buildResponse({ item: pool[i]!, isCorrect: i < 9, offsetMs: (i + 1) * 1_000 }),
      );
    }
    const next = SkillEngine.getNextItem(state);
    expect(isTerminationSignal(next)).toBe(true);
    if (isTerminationSignal(next)) {
      expect(next.reason).toBe('mastery_reached');
    }
  });

  it('user_submitted termination produces FinalResult with neutral score', () => {
    const { session, config, pool } = singleSkillSetup();
    let state = SkillEngine.initialise(session, config);
    state = SkillEngine.recordResponse(
      state,
      buildResponse({ item: pool[0]!, isCorrect: true, offsetMs: 1_000 }),
    );
    const final = SkillEngine.terminate(state, 'user_submitted', clockAt(120_000));
    expect(final.reason).toBe('user_submitted');
    expect(final.score.scaled).toBe(0);
    expect(final.score.band).toBeNull();
    expect(final.score.items_correct).toBe(1);
    expect(final.score.duration_ms).toBe(120_000);
  });
});

describe('SkillEngine — masteryDelta helper', () => {
  it('emits one entry per target skill with attempt counts and current mastery', () => {
    const { session, config, pool } = multiSkillSetup();
    let state = SkillEngine.initialise(session, config);
    const itemA = pool.find(it => it.skill_ids.includes(SKILL_A) && it.difficulty === 0.5)!;
    const itemB = pool.find(it => it.skill_ids.includes(SKILL_B) && it.difficulty === 0.5)!;
    state = SkillEngine.recordResponse(
      state,
      buildResponse({ item: itemA, isCorrect: true, offsetMs: 1_000 }),
    );
    state = SkillEngine.recordResponse(
      state,
      buildResponse({ item: itemB, isCorrect: false, offsetMs: 2_000 }),
    );

    const delta = masteryDelta(state, clockAt(60_000));
    expect(delta.per_skill).toHaveLength(3);
    const a = delta.per_skill.find(s => s.skill_id === SKILL_A)!;
    expect(a.items_attempted).toBe(1);
    expect(a.items_correct).toBe(1);
    expect(a.new_estimated_mastery).toBe(1);
    expect(delta.duration_ms).toBe(60_000);
  });
});

describe('SkillEngine — invariants', () => {
  it('canNavigateBack is always false', () => {
    const { session, config } = singleSkillSetup();
    const state = SkillEngine.initialise(session, config);
    expect(SkillEngine.canNavigateBack(state)).toBe(false);
  });

  it('getTimeRemaining returns null when no limit', () => {
    const { session, config } = singleSkillSetup();
    const state = SkillEngine.initialise(session, config);
    expect(SkillEngine.getTimeRemaining(state, clockAt(1_000))).toBeNull();
  });
});

describe('SkillEngine — replay determinism', () => {
  it('two independent runs with same pool + responses → deep-equal state at every step', () => {
    const { session, config, pool } = multiSkillSetup();
    let stateA = SkillEngine.initialise(session, config);
    let stateB = SkillEngine.initialise(session, config);
    expect(stateA).toEqual(stateB);

    const tele = { time_to_answer_ms: 25_000, answer_changes: 1 };
    pool.forEach((it, i) => {
      const isCorrect = i % 2 === 0;
      const responseA = buildResponse({ item: it, isCorrect, offsetMs: (i + 1) * 1_000, telemetry: tele });
      const responseB = buildResponse({ item: it, isCorrect, offsetMs: (i + 1) * 1_000, telemetry: tele });
      stateA = SkillEngine.recordResponse(stateA, responseA);
      stateB = SkillEngine.recordResponse(stateB, responseB);
      expect(stateA).toEqual(stateB);
    });

    const finalA = SkillEngine.terminate(stateA, 'user_submitted', clockAt(900_000));
    const finalB = SkillEngine.terminate(stateB, 'user_submitted', clockAt(900_000));
    expect(JSON.stringify(finalA)).toBe(JSON.stringify(finalB));
  });
});
