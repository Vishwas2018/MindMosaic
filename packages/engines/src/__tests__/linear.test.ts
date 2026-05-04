/**
 * LinearEngine — Stage 15 unit tests (Stage 16 fixtures).
 * Per Q-15.7 / ADR-0022: discipline-driven (no Date.now / no Math.random in
 * engine). One golden replay test now; property tests deferred to Stage 17.
 */
import { describe, expect, it } from 'vitest';
import {
  LinearEngine,
  scoreWithConfig,
  terminateWithConfig,
  isTerminationSignal,
  EngineStateSchema,
  type EngineItem,
  type EngineResponse,
  type ItemId,
} from '../index.js';
import {
  STARTED_AT_MS,
  buildLinearSession,
  buildLinearConfig,
  buildResponse,
  clockAt,
} from './_fixtures.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LinearEngine — initialise', () => {
  it('builds an EngineState that round-trips through Zod (JSON-serialisable)', () => {
    const state = LinearEngine.initialise(buildLinearSession(5), buildLinearConfig());
    const parsed = EngineStateSchema.parse(JSON.parse(JSON.stringify(state)));
    expect(parsed).toEqual(state);
  });

  it('initialises with empty responses, current_index 0, no flags', () => {
    const state = LinearEngine.initialise(buildLinearSession(30), buildLinearConfig());
    if (state.engine_type !== 'linear') throw new Error('expected linear state');
    expect(state.responses).toEqual([]);
    expect(state.current_index).toBe(0);
    expect(state.flagged_item_ids).toEqual([]);
    expect(state.total_items).toBe(30);
  });

  it('config.time_limit_ms takes precedence over session.time_limit_ms', () => {
    const state = LinearEngine.initialise(
      buildLinearSession(5, { time_limit_ms: 10_000 }),
      buildLinearConfig({ time_limit_ms: 99_000 }),
    );
    if (state.engine_type !== 'linear') throw new Error('expected linear state');
    expect(state.time_limit_ms).toBe(99_000);
  });

  it('throws on engine_type mismatch in config', () => {
    expect(() =>
      LinearEngine.initialise(buildLinearSession(5), buildLinearConfig({ engine_type: 'adaptive' })),
    ).toThrow(/expected engine_type='linear'/);
  });

  it('throws on engine_type mismatch in session', () => {
    expect(() =>
      LinearEngine.initialise(buildLinearSession(5, { engine_type: 'adaptive' }), buildLinearConfig()),
    ).toThrow(/SessionContext.engine_type must be 'linear'/);
  });
});

describe('LinearEngine — getNextItem & navigation', () => {
  it('returns the first item from a fresh state', () => {
    const state = LinearEngine.initialise(buildLinearSession(3), buildLinearConfig());
    const next = LinearEngine.getNextItem(state);
    expect(isTerminationSignal(next)).toBe(false);
    expect((next as EngineItem).sequence_number).toBe(1);
  });

  it('returns TerminationSignal { reason: "completed" } when index past end', () => {
    const session = buildLinearSession(3);
    const state = LinearEngine.initialise(session, buildLinearConfig());
    if (state.engine_type !== 'linear') throw new Error('expected linear state');
    const exhausted = { ...state, current_index: 3 };
    const next = LinearEngine.getNextItem(exhausted);
    expect(isTerminationSignal(next)).toBe(true);
    if (isTerminationSignal(next)) {
      expect(next.reason).toBe('completed');
    }
  });

  it('canNavigateBack is false at index 0', () => {
    const state = LinearEngine.initialise(buildLinearSession(3), buildLinearConfig());
    expect(LinearEngine.canNavigateBack(state)).toBe(false);
  });

  it('canNavigateBack is true at index 1+', () => {
    const session = buildLinearSession(3);
    let state = LinearEngine.initialise(session, buildLinearConfig());
    state = LinearEngine.recordResponse(
      state,
      buildResponse({ item: session.planned_items[0]!, isCorrect: true, offsetMs: 1_000 }),
    );
    expect(LinearEngine.canNavigateBack(state)).toBe(true);
  });

  it('edge: empty items array signals immediate termination', () => {
    const state = LinearEngine.initialise(buildLinearSession(0), buildLinearConfig());
    const next = LinearEngine.getNextItem(state);
    expect(isTerminationSignal(next)).toBe(true);
    if (isTerminationSignal(next)) expect(next.reason).toBe('completed');
  });
});

describe('LinearEngine — recordResponse', () => {
  it('appends a new response and advances the cursor', () => {
    const session = buildLinearSession(3);
    let state = LinearEngine.initialise(session, buildLinearConfig());
    state = LinearEngine.recordResponse(
      state,
      buildResponse({ item: session.planned_items[0]!, isCorrect: true, offsetMs: 1_000 }),
    );
    if (state.engine_type !== 'linear') throw new Error('expected linear state');
    expect(state.responses).toHaveLength(1);
    expect(state.current_index).toBe(1);
  });

  it('back-nav re-answer replaces the existing response in place (no duplicate)', () => {
    const session = buildLinearSession(3);
    let state = LinearEngine.initialise(session, buildLinearConfig());
    state = LinearEngine.recordResponse(
      state,
      buildResponse({ item: session.planned_items[0]!, isCorrect: false, offsetMs: 1_000 }),
    );
    state = LinearEngine.recordResponse(
      state,
      buildResponse({ item: session.planned_items[1]!, isCorrect: true, offsetMs: 2_000 }),
    );
    state = LinearEngine.recordResponse(
      state,
      buildResponse({ item: session.planned_items[0]!, isCorrect: true, offsetMs: 3_000 }),
    );
    if (state.engine_type !== 'linear') throw new Error('expected linear state');
    expect(state.responses).toHaveLength(2);
    const item0Response = state.responses.find(
      r => r.item_id === session.planned_items[0]!.item_id,
    );
    expect(item0Response?.is_correct).toBe(true);
    expect(state.current_index).toBe(2);
  });

  it('throws if response.item_id is not in planned_items', () => {
    const session = buildLinearSession(3);
    const state = LinearEngine.initialise(session, buildLinearConfig());
    const stranger: EngineResponse = {
      item_id: '99999999-9999-4999-8999-999999999999' as ItemId,
      is_correct: false,
      response_data: {},
      answered_at: '2026-05-04T10:00:00.000Z',
    };
    expect(() => LinearEngine.recordResponse(state, stranger)).toThrow(
      /not in planned_items/,
    );
  });

  it('does not advance past the end of planned_items', () => {
    const session = buildLinearSession(2);
    let state = LinearEngine.initialise(session, buildLinearConfig());
    state = LinearEngine.recordResponse(
      state,
      buildResponse({ item: session.planned_items[0]!, isCorrect: true, offsetMs: 1_000 }),
    );
    state = LinearEngine.recordResponse(
      state,
      buildResponse({ item: session.planned_items[1]!, isCorrect: true, offsetMs: 2_000 }),
    );
    if (state.engine_type !== 'linear') throw new Error('expected linear state');
    expect(state.current_index).toBe(2);
    expect(state.current_index).toBe(state.planned_items.length);
  });
});

describe('LinearEngine — score & scoreWithConfig', () => {
  it('all correct → max raw, max scaled, top band', () => {
    const session = buildLinearSession(10);
    const config = buildLinearConfig();
    let state = LinearEngine.initialise(session, config);
    session.planned_items.forEach((it, i) => {
      state = LinearEngine.recordResponse(
        state,
        buildResponse({ item: it, isCorrect: true, offsetMs: (i + 1) * 1_000 }),
      );
    });
    const result = scoreWithConfig(state, config);
    expect(result.raw).toBe(10);
    expect(result.items_correct).toBe(10);
    expect(result.items_answered).toBe(10);
    expect(result.scaled).toBe(100);
    expect(result.band).toBe('high_distinction');
  });

  it('all incorrect → zero raw, zero scaled, lowest band', () => {
    const session = buildLinearSession(10);
    const config = buildLinearConfig();
    let state = LinearEngine.initialise(session, config);
    session.planned_items.forEach((it, i) => {
      state = LinearEngine.recordResponse(
        state,
        buildResponse({ item: it, isCorrect: false, offsetMs: (i + 1) * 1_000 }),
      );
    });
    const result = scoreWithConfig(state, config);
    expect(result.raw).toBe(0);
    expect(result.scaled).toBe(0);
    expect(result.band).toBe('fail');
  });

  it('partial correctness → proportional score (7/10 = 70 → credit)', () => {
    const session = buildLinearSession(10);
    const config = buildLinearConfig();
    let state = LinearEngine.initialise(session, config);
    session.planned_items.forEach((it, i) => {
      state = LinearEngine.recordResponse(
        state,
        buildResponse({ item: it, isCorrect: i < 7, offsetMs: (i + 1) * 1_000 }),
      );
    });
    const result = scoreWithConfig(state, config);
    expect(result.raw).toBe(7);
    expect(result.scaled).toBe(70);
    expect(result.band).toBe('credit');
  });

  it('identity scoring formula returns scaled === raw', () => {
    const session = buildLinearSession(5);
    const config = buildLinearConfig({
      scoring_rules: {
        scaled_score_formula: 'identity',
        bands: [{ min: 0, max: 5, label: 'flat' }],
      },
    });
    let state = LinearEngine.initialise(session, config);
    state = LinearEngine.recordResponse(
      state,
      buildResponse({ item: session.planned_items[0]!, isCorrect: true, offsetMs: 1_000 }),
    );
    state = LinearEngine.recordResponse(
      state,
      buildResponse({ item: session.planned_items[1]!, isCorrect: true, offsetMs: 2_000 }),
    );
    const result = scoreWithConfig(state, config);
    expect(result.raw).toBe(2);
    expect(result.scaled).toBe(2);
  });

  it('scaled out of all bands → band null', () => {
    const session = buildLinearSession(10);
    const config = buildLinearConfig({
      scoring_rules: {
        scaled_score_formula: 'percentage',
        bands: [{ min: 95, max: 100, label: 'only_top' }],
      },
    });
    let state = LinearEngine.initialise(session, config);
    state = LinearEngine.recordResponse(
      state,
      buildResponse({ item: session.planned_items[0]!, isCorrect: true, offsetMs: 1_000 }),
    );
    const result = scoreWithConfig(state, config);
    expect(result.scaled).toBe(10);
    expect(result.band).toBeNull();
  });

  it('flagging an item does not affect order or scoring', () => {
    const session = buildLinearSession(5);
    const config = buildLinearConfig();
    let state = LinearEngine.initialise(session, config);
    session.planned_items.forEach((it, i) => {
      state = LinearEngine.recordResponse(
        state,
        buildResponse({ item: it, isCorrect: i < 3, offsetMs: (i + 1) * 1_000 }),
      );
    });
    if (state.engine_type !== 'linear') throw new Error('expected linear state');
    const flagged = { ...state, flagged_item_ids: [session.planned_items[1]!.item_id] };
    const result = scoreWithConfig(flagged, config);
    expect(result.raw).toBe(3);
    expect(result.scaled).toBe(60);
  });
});

describe('LinearEngine — getTimeRemaining', () => {
  it('returns positive remaining when within window', () => {
    const state = LinearEngine.initialise(buildLinearSession(3), buildLinearConfig());
    const remaining = LinearEngine.getTimeRemaining(state, clockAt(15 * 60 * 1000));
    expect(remaining).toBe(45 * 60 * 1000);
  });

  it('returns 0 (clamped) when timer expired', () => {
    const state = LinearEngine.initialise(buildLinearSession(3), buildLinearConfig());
    const remaining = LinearEngine.getTimeRemaining(state, clockAt(2 * 60 * 60 * 1000));
    expect(remaining).toBe(0);
  });

  it('null time_limit_ms → returns null', () => {
    const state = LinearEngine.initialise(
      buildLinearSession(3, { time_limit_ms: null }),
      buildLinearConfig({ time_limit_ms: null }),
    );
    expect(LinearEngine.getTimeRemaining(state, clockAt(1_000))).toBeNull();
  });
});

describe('LinearEngine — terminate', () => {
  it('returns FinalResult with reason and clock-derived terminated_at', () => {
    const session = buildLinearSession(3);
    const config = buildLinearConfig();
    let state = LinearEngine.initialise(session, config);
    state = LinearEngine.recordResponse(
      state,
      buildResponse({ item: session.planned_items[0]!, isCorrect: true, offsetMs: 1_000 }),
    );
    const final = terminateWithConfig(state, 'user_submitted', clockAt(5 * 60_000), config);
    expect(final.reason).toBe('user_submitted');
    expect(final.terminated_at).toBe(new Date(STARTED_AT_MS + 5 * 60_000).toISOString());
    expect(final.score.duration_ms).toBe(5 * 60_000);
  });

  it('user submits at item 5/30 → counts only answered items', () => {
    const session = buildLinearSession(30);
    const config = buildLinearConfig();
    let state = LinearEngine.initialise(session, config);
    for (let i = 0; i < 5; i++) {
      state = LinearEngine.recordResponse(
        state,
        buildResponse({ item: session.planned_items[i]!, isCorrect: true, offsetMs: (i + 1) * 1_000 }),
      );
    }
    const final = terminateWithConfig(state, 'user_submitted', clockAt(10 * 60_000), config);
    expect(final.score.items_answered).toBe(5);
    expect(final.score.items_correct).toBe(5);
    expect(final.score.raw).toBe(5);
    expect(final.score.scaled).toBe(17);
    expect(final.score.band).toBe('fail');
  });

  it('timer expiry termination works the same way (reason differs only)', () => {
    const session = buildLinearSession(30);
    const config = buildLinearConfig();
    let state = LinearEngine.initialise(session, config);
    for (let i = 0; i < 12; i++) {
      state = LinearEngine.recordResponse(
        state,
        buildResponse({ item: session.planned_items[i]!, isCorrect: i % 2 === 0, offsetMs: (i + 1) * 1_000 }),
      );
    }
    const final = terminateWithConfig(state, 'timer_expired', clockAt(60 * 60_000), config);
    expect(final.reason).toBe('timer_expired');
    expect(final.score.items_correct).toBe(6);
    expect(final.score.items_answered).toBe(12);
  });
});

describe('LinearEngine — golden 30-item ICAS session', () => {
  it('full walkthrough with mixed correctness produces deterministic ScoreResult', () => {
    const session = buildLinearSession(30);
    const config = buildLinearConfig();
    let state = LinearEngine.initialise(session, config);

    session.planned_items.forEach((it, i) => {
      const isCorrect = i % 3 !== 2;
      state = LinearEngine.recordResponse(
        state,
        buildResponse({ item: it, isCorrect, offsetMs: (i + 1) * 1_000 }),
      );
    });

    const exhausted = LinearEngine.getNextItem(state);
    expect(isTerminationSignal(exhausted)).toBe(true);

    const final = terminateWithConfig(state, 'completed', clockAt(45 * 60_000), config);
    expect(final.reason).toBe('completed');
    expect(final.score.items_answered).toBe(30);
    expect(final.score.items_correct).toBe(20);
    expect(final.score.raw).toBe(20);
    expect(final.score.scaled).toBe(67);
    expect(final.score.band).toBe('credit');
    expect(final.score.duration_ms).toBe(45 * 60_000);
  });
});

describe('LinearEngine — replay determinism (one explicit golden test)', () => {
  it('two independent runs with same inputs produce deep-equal state at every step and identical FinalResult', () => {
    const sessionA = buildLinearSession(30);
    const sessionB = buildLinearSession(30);
    const configA = buildLinearConfig();
    const configB = buildLinearConfig();
    const clockA = clockAt(45 * 60_000);
    const clockB = clockAt(45 * 60_000);

    let stateA = LinearEngine.initialise(sessionA, configA);
    let stateB = LinearEngine.initialise(sessionB, configB);
    expect(stateA).toEqual(stateB);

    sessionA.planned_items.forEach((it, i) => {
      const isCorrect = i % 3 !== 2;
      const responseA = buildResponse({ item: it, isCorrect, offsetMs: (i + 1) * 1_000 });
      const responseB = buildResponse({
        item: sessionB.planned_items[i]!,
        isCorrect,
        offsetMs: (i + 1) * 1_000,
      });
      stateA = LinearEngine.recordResponse(stateA, responseA);
      stateB = LinearEngine.recordResponse(stateB, responseB);
      expect(stateA).toEqual(stateB);
    });

    const finalA = terminateWithConfig(stateA, 'completed', clockA, configA);
    const finalB = terminateWithConfig(stateB, 'completed', clockB, configB);
    expect(finalA).toEqual(finalB);
    expect(JSON.stringify(finalA)).toBe(JSON.stringify(finalB));
  });
});
