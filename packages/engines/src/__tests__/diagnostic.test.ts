/**
 * DiagnosticEngine — Stage 16 unit tests.
 *
 * Covers Spec §3.2.4 (binary-search probe), §8.4 (confidence model — v1
 * structural confidence from range narrowing).
 */
import { describe, expect, it } from 'vitest';
import {
  DiagnosticEngine,
  proficiencyMap,
  estimateConfidence,
  isTerminationSignal,
  EngineStateSchema,
  type DiagnosticEngineState,
  type EngineItem,
  type EngineResponse,
  type ItemId,
  type SkillId,
} from '../index.js';
import {
  buildEngineItem,
  buildEngineItemPool,
  buildDiagnosticSession,
  buildDiagnosticConfig,
  buildResponse,
  clockAt,
  skillId,
} from './_fixtures.js';

const SKILL_A = skillId(0);
const SKILL_B = skillId(1);

function denseDifficultyPool(skills: SkillId[]): EngineItem[] {
  // 0.05, 0.10, 0.15, ... 1.00 — 20 difficulties per skill.
  const difficulties = Array.from({ length: 20 }, (_, i) => Math.round((i + 1) * 5) / 100);
  return buildEngineItemPool({ skills, difficulties });
}

function asDiagnostic(state: ReturnType<typeof DiagnosticEngine.initialise>): DiagnosticEngineState {
  if (state.engine_type !== 'diagnostic') throw new Error('expected diagnostic state');
  return state;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DiagnosticEngine — initialise', () => {
  it('builds a JSON-round-trippable EngineState', () => {
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: denseDifficultyPool([SKILL_A]) });
    const state = DiagnosticEngine.initialise(session, buildDiagnosticConfig());
    const parsed = EngineStateSchema.parse(JSON.parse(JSON.stringify(state)));
    expect(parsed).toEqual(state);
  });

  it('per_skill_probe seeded with bounds [0,1] and start mastery from config', () => {
    const session = buildDiagnosticSession({
      skills: [SKILL_A, SKILL_B],
      pool: denseDifficultyPool([SKILL_A, SKILL_B]),
    });
    const config = buildDiagnosticConfig({ diagnostic_start_difficulty: 0.5 });
    const state = asDiagnostic(DiagnosticEngine.initialise(session, config));
    expect(state.per_skill_probe).toHaveLength(2);
    state.per_skill_probe.forEach(p => {
      expect(p.low_difficulty).toBe(0);
      expect(p.high_difficulty).toBe(1);
      expect(p.estimated_mastery).toBe(0.5);
      expect(p.estimated_confidence).toBe(0);
    });
  });

  it('throws on engine_type mismatch (config)', () => {
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: denseDifficultyPool([SKILL_A]) });
    expect(() =>
      DiagnosticEngine.initialise(session, buildDiagnosticConfig({ engine_type: 'linear' })),
    ).toThrow(/expected engine_type='diagnostic'/);
  });
});

describe('DiagnosticEngine — getNextItem', () => {
  it('picks an item near the start_difficulty for the first probe', () => {
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: denseDifficultyPool([SKILL_A]) });
    const config = buildDiagnosticConfig({ diagnostic_start_difficulty: 0.5 });
    const state = DiagnosticEngine.initialise(session, config);
    const next = DiagnosticEngine.getNextItem(state);
    expect(isTerminationSignal(next)).toBe(false);
    expect((next as EngineItem).difficulty).toBeCloseTo(0.5, 5);
  });

  it('tie-break: lexicographic by item_id when difficulty distance ties', () => {
    // Two items at exactly 0.5 — alphabetical first wins.
    const item0 = buildEngineItem({ index: 0, skill_ids: [SKILL_A], difficulty: 0.5 });
    const item1 = buildEngineItem({ index: 1, skill_ids: [SKILL_A], difficulty: 0.5 });
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: [item0, item1] });
    const state = DiagnosticEngine.initialise(session, buildDiagnosticConfig());
    const next = DiagnosticEngine.getNextItem(state);
    if (isTerminationSignal(next)) throw new Error('expected an item');
    expect(next.item_id).toBe(item0.item_id);
  });

  it('signals max_items_reached when responses.length === max_items', () => {
    const pool = denseDifficultyPool([SKILL_A]);
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool });
    const config = buildDiagnosticConfig({ max_items: 3, confidence_threshold: 0.99 });
    let state = DiagnosticEngine.initialise(session, config);
    for (let i = 0; i < 3; i++) {
      const result = DiagnosticEngine.getNextItem(state);
      if (isTerminationSignal(result)) throw new Error('expected an item');
      state = DiagnosticEngine.recordResponse(
        state,
        buildResponse({ item: result as EngineItem, isCorrect: i % 2 === 0, offsetMs: (i + 1) * 1_000 }),
      );
    }
    const next = DiagnosticEngine.getNextItem(state);
    expect(isTerminationSignal(next)).toBe(true);
    if (isTerminationSignal(next)) {
      expect(next.reason).toBe('max_items_reached');
    }
  });

  it('signals confidence_threshold_met when all skills converge', () => {
    const pool = denseDifficultyPool([SKILL_A]);
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool });
    // Set threshold low enough that one or two responses might suffice.
    const config = buildDiagnosticConfig({ confidence_threshold: 0.05, max_items: 50 });
    let state = DiagnosticEngine.initialise(session, config);
    // First probe at 0.5; if correct, low becomes 0.5 → confidence = 0.5 ≥ 0.05.
    const first = DiagnosticEngine.getNextItem(state);
    if (isTerminationSignal(first)) throw new Error('expected an item');
    state = DiagnosticEngine.recordResponse(
      state,
      buildResponse({ item: first as EngineItem, isCorrect: true, offsetMs: 1_000 }),
    );
    const next = DiagnosticEngine.getNextItem(state);
    expect(isTerminationSignal(next)).toBe(true);
    if (isTerminationSignal(next)) {
      expect(next.reason).toBe('confidence_threshold_met');
    }
  });

  it('empty target_skills → completed', () => {
    const session = buildDiagnosticSession({ skills: [], pool: denseDifficultyPool([SKILL_A]) });
    const state = DiagnosticEngine.initialise(session, buildDiagnosticConfig());
    const next = DiagnosticEngine.getNextItem(state);
    expect(isTerminationSignal(next)).toBe(true);
  });
});

describe('DiagnosticEngine — recordResponse (binary search)', () => {
  it('correct response raises low_difficulty to current item difficulty', () => {
    const item = buildEngineItem({ index: 0, skill_ids: [SKILL_A], difficulty: 0.5 });
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: [item] });
    let state = DiagnosticEngine.initialise(session, buildDiagnosticConfig());
    state = DiagnosticEngine.recordResponse(
      state,
      buildResponse({ item, isCorrect: true, offsetMs: 1_000 }),
    );
    const probe = asDiagnostic(state).per_skill_probe[0]!;
    expect(probe.low_difficulty).toBe(0.5);
    expect(probe.high_difficulty).toBe(1);
    expect(probe.items_administered).toBe(1);
  });

  it('incorrect response lowers high_difficulty to current item difficulty', () => {
    const item = buildEngineItem({ index: 0, skill_ids: [SKILL_A], difficulty: 0.5 });
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: [item] });
    let state = DiagnosticEngine.initialise(session, buildDiagnosticConfig());
    state = DiagnosticEngine.recordResponse(
      state,
      buildResponse({ item, isCorrect: false, offsetMs: 1_000 }),
    );
    const probe = asDiagnostic(state).per_skill_probe[0]!;
    expect(probe.low_difficulty).toBe(0);
    expect(probe.high_difficulty).toBe(0.5);
  });

  it('updates estimated_mastery to midpoint of new range', () => {
    const item = buildEngineItem({ index: 0, skill_ids: [SKILL_A], difficulty: 0.6 });
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: [item] });
    let state = DiagnosticEngine.initialise(session, buildDiagnosticConfig());
    state = DiagnosticEngine.recordResponse(
      state,
      buildResponse({ item, isCorrect: true, offsetMs: 1_000 }),
    );
    const probe = asDiagnostic(state).per_skill_probe[0]!;
    expect(probe.estimated_mastery).toBeCloseTo(0.8, 5); // (0.6 + 1.0) / 2
  });

  it('updates estimated_confidence as range narrows', () => {
    const item = buildEngineItem({ index: 0, skill_ids: [SKILL_A], difficulty: 0.6 });
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: [item] });
    let state = DiagnosticEngine.initialise(session, buildDiagnosticConfig());
    state = DiagnosticEngine.recordResponse(
      state,
      buildResponse({ item, isCorrect: true, offsetMs: 1_000 }),
    );
    const probe = asDiagnostic(state).per_skill_probe[0]!;
    // range = 1 - 0.6 = 0.4 → confidence = 1 - 0.4 = 0.6
    expect(probe.estimated_confidence).toBeCloseTo(0.6, 5);
  });

  it('throws when item not in pool', () => {
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: denseDifficultyPool([SKILL_A]) });
    const state = DiagnosticEngine.initialise(session, buildDiagnosticConfig());
    const stranger: EngineResponse = {
      item_id: '99999999-9999-4999-8999-999999999999' as ItemId,
      is_correct: false,
      response_data: {},
      answered_at: '2026-05-04T10:00:00.000Z',
    };
    expect(() => DiagnosticEngine.recordResponse(state, stranger)).toThrow(/not in item_pool/);
  });
});

describe('DiagnosticEngine — binary-search convergence', () => {
  it('12-item probe of true mastery 0.7 converges range to ≤ 0.1', () => {
    const TRUE_MASTERY = 0.7;
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: denseDifficultyPool([SKILL_A]) });
    const config = buildDiagnosticConfig({ max_items: 50, confidence_threshold: 0.99 });
    let state = DiagnosticEngine.initialise(session, config);
    for (let i = 0; i < 12; i++) {
      const next = DiagnosticEngine.getNextItem(state);
      if (isTerminationSignal(next)) break;
      const item = next as EngineItem;
      const isCorrect = item.difficulty <= TRUE_MASTERY;
      state = DiagnosticEngine.recordResponse(
        state,
        buildResponse({ item, isCorrect, offsetMs: (i + 1) * 1_000 }),
      );
    }
    const probe = asDiagnostic(state).per_skill_probe[0]!;
    const range = probe.high_difficulty - probe.low_difficulty;
    expect(range).toBeLessThanOrEqual(0.1);
    expect(probe.estimated_mastery).toBeCloseTo(TRUE_MASTERY, 1);
  });
});

describe('DiagnosticEngine — proficiencyMap helper', () => {
  it('emits one entry per target skill with band, mastery_level, confidence', () => {
    const session = buildDiagnosticSession({
      skills: [SKILL_A, SKILL_B],
      pool: denseDifficultyPool([SKILL_A, SKILL_B]),
    });
    let state = DiagnosticEngine.initialise(session, buildDiagnosticConfig());
    // Drive SKILL_A high mastery: answer correct on a 0.9-difficulty item.
    const itemAHigh = (state as DiagnosticEngineState).item_pool.find(
      it => it.skill_ids.includes(SKILL_A) && it.difficulty === 0.9,
    )!;
    state = DiagnosticEngine.recordResponse(
      state,
      buildResponse({ item: itemAHigh, isCorrect: true, offsetMs: 1_000 }),
    );

    const map = proficiencyMap(state, clockAt(60_000));
    expect(map.skills).toHaveLength(2);
    expect(map.duration_ms).toBe(60_000);
    const aEntry = map.skills.find(s => s.skill_id === SKILL_A)!;
    expect(aEntry.items_administered).toBe(1);
    expect(aEntry.mastery_level).toBeGreaterThan(0.5);
  });

  it('maps mastery to MasteryBand correctly', () => {
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: denseDifficultyPool([SKILL_A]) });
    let state = DiagnosticEngine.initialise(session, buildDiagnosticConfig());
    // Force mastery of 0.95 by manual probe injection (correct on 0.95 item).
    const high = (state as DiagnosticEngineState).item_pool.find(
      it => it.skill_ids.includes(SKILL_A) && it.difficulty === 0.95,
    )!;
    state = DiagnosticEngine.recordResponse(
      state,
      buildResponse({ item: high, isCorrect: true, offsetMs: 1_000 }),
    );
    const map = proficiencyMap(state);
    // mastery = (0.95 + 1) / 2 = 0.975 → 'mastered' (≥ 0.85)
    expect(map.skills[0]!.band).toBe('mastered');
  });
});

describe('DiagnosticEngine — invariants', () => {
  it('canNavigateBack is always false', () => {
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: denseDifficultyPool([SKILL_A]) });
    const state = DiagnosticEngine.initialise(session, buildDiagnosticConfig());
    expect(DiagnosticEngine.canNavigateBack(state)).toBe(false);
  });

  it('terminate produces FinalResult with neutral score and clock-derived terminated_at', () => {
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: denseDifficultyPool([SKILL_A]) });
    const state = DiagnosticEngine.initialise(session, buildDiagnosticConfig());
    const final = DiagnosticEngine.terminate(state, 'user_submitted', clockAt(60_000));
    expect(final.reason).toBe('user_submitted');
    expect(final.score.scaled).toBe(0);
    expect(final.score.band).toBeNull();
    expect(final.score.duration_ms).toBe(60_000);
  });

  it('estimateConfidence helper: range 0 → confidence 1', () => {
    const probe = {
      skill_id: SKILL_A,
      low_difficulty: 0.5,
      high_difficulty: 0.5,
      items_administered: 1,
      estimated_mastery: 0.5,
      estimated_confidence: 0,
    };
    expect(estimateConfidence(probe)).toBe(1);
  });

  it('getTimeRemaining returns null when no limit', () => {
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: denseDifficultyPool([SKILL_A]) });
    const state = DiagnosticEngine.initialise(session, buildDiagnosticConfig());
    expect(DiagnosticEngine.getTimeRemaining(state, clockAt(1_000))).toBeNull();
  });
});

describe('DiagnosticEngine — replay determinism', () => {
  it('two independent runs with same inputs → deep-equal state at every step', () => {
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: denseDifficultyPool([SKILL_A]) });
    const config = buildDiagnosticConfig({ max_items: 10, confidence_threshold: 0.99 });
    let stateA = DiagnosticEngine.initialise(session, config);
    let stateB = DiagnosticEngine.initialise(session, config);
    expect(stateA).toEqual(stateB);

    const TRUE_MASTERY = 0.6;
    for (let i = 0; i < 6; i++) {
      const nextA = DiagnosticEngine.getNextItem(stateA);
      const nextB = DiagnosticEngine.getNextItem(stateB);
      if (isTerminationSignal(nextA) || isTerminationSignal(nextB)) break;
      const isCorrect = (nextA as EngineItem).difficulty <= TRUE_MASTERY;
      stateA = DiagnosticEngine.recordResponse(
        stateA,
        buildResponse({ item: nextA as EngineItem, isCorrect, offsetMs: (i + 1) * 1_000 }),
      );
      stateB = DiagnosticEngine.recordResponse(
        stateB,
        buildResponse({ item: nextB as EngineItem, isCorrect, offsetMs: (i + 1) * 1_000 }),
      );
      expect(stateA).toEqual(stateB);
    }

    const finalA = DiagnosticEngine.terminate(stateA, 'completed', clockAt(300_000));
    const finalB = DiagnosticEngine.terminate(stateB, 'completed', clockAt(300_000));
    expect(JSON.stringify(finalA)).toBe(JSON.stringify(finalB));
  });
});

describe('DiagnosticEngine — edge cases', () => {
  it('single skill with single item: completes after first response', () => {
    const item = buildEngineItem({ index: 0, skill_ids: [SKILL_A], difficulty: 0.5 });
    const session = buildDiagnosticSession({ skills: [SKILL_A], pool: [item] });
    let state = DiagnosticEngine.initialise(session, buildDiagnosticConfig({ confidence_threshold: 0.99 }));
    state = DiagnosticEngine.recordResponse(
      state,
      buildResponse({ item, isCorrect: true, offsetMs: 1_000 }),
    );
    const next = DiagnosticEngine.getNextItem(state);
    expect(isTerminationSignal(next)).toBe(true);
    // Either confidence_threshold_met (range narrowed) or completed (no items left).
    if (isTerminationSignal(next)) {
      expect(['completed', 'confidence_threshold_met', 'max_items_reached']).toContain(next.reason);
    }
  });
});
