/**
 * test-scoring.ts — ADR-0027 replay determinism harness.
 *
 * 50 LinearEngine sessions (5 patterns × 10 replays) with fixed inputs.
 * Asserts determinism (same inputs → identical score) and correctness
 * (known correct counts → expected raw/scaled/band).
 *
 * No DB, no network, no Date.now() / Math.random() in engine bodies.
 * Usage: pnpm test:replay
 */

import {
  FrameworkConfigSchema,
  LinearEngine,
  isTerminationSignal,
  scoreWithConfig,
  type EngineItem,
  type EngineResponse,
  type EngineState,
  type FrameworkConfig,
  type ItemId,
  type ScoreResult,
  type SessionContext,
  type SessionId,
  type SkillId,
} from '@mm/engines';

// ─── Fixed fixtures ───────────────────────────────────────────────────────────

const STARTED_AT = '2026-01-01T00:00:00.000Z';
const SKILL_ID = '00000000-0000-0000-0000-000000000099' as SkillId;
const ITEM_COUNT = 25;

function makeItem(index: number): EngineItem {
  const id = `00000000-0000-0000-0001-${String(index + 1).padStart(12, '0')}` as ItemId;
  return {
    item_id: id,
    version: 1,
    stem: { text: `Question ${index + 1}` },
    stimulus: null,
    response_type: 'mcq',
    response_config: { options: ['A', 'B', 'C', 'D'], correct_option_id: 'A' },
    tools_available: [],
    sequence_number: index,
    skill_ids: [SKILL_ID],
    difficulty: 0.5,
    discrimination: null,
  };
}

const ITEMS: EngineItem[] = Array.from({ length: ITEM_COUNT }, (_, i) => makeItem(i));

const CONFIG: FrameworkConfig = FrameworkConfigSchema.parse({
  engine_type: 'linear',
  scoring_rules: {
    scaled_score_formula: 'percentage',
    bands: [
      { min: 0, max: 39, label: 'developing' },
      { min: 40, max: 69, label: 'proficient' },
      { min: 70, max: 100, label: 'advanced' },
    ],
  },
  time_limit_ms: null,
  back_navigation_enabled: false,
  flag_for_review_enabled: true,
});

function makeContext(sessionIndex: number): SessionContext {
  const idx = String(sessionIndex).padStart(4, '0');
  const sessionId = `00000000-0000-0000-${idx}-000000000001` as SessionId;
  return {
    session_id: sessionId,
    mode: 'exam',
    engine_type: 'linear',
    total_items: ITEM_COUNT,
    time_limit_ms: null,
    started_at: STARTED_AT,
    planned_items: ITEMS,
    target_skills: [],
  };
}

// ─── Replay ───────────────────────────────────────────────────────────────────

function replaySession(sessionIndex: number, correctPattern: boolean[]): ScoreResult {
  const ctx = makeContext(sessionIndex);
  let state: EngineState = LinearEngine.initialise(ctx, CONFIG);

  for (let i = 0; i < ITEM_COUNT; i++) {
    const next = LinearEngine.getNextItem(state);
    if (isTerminationSignal(next)) break;

    const isCorrect = correctPattern[i] ?? false;
    const response: EngineResponse = {
      item_id: next.item_id,
      is_correct: isCorrect,
      response_data: { choice: isCorrect ? 'A' : 'B' },
      answered_at: STARTED_AT,
      telemetry: { time_to_answer_ms: 10_000, answer_changes: 0 },
    };
    state = LinearEngine.recordResponse(state, response);
  }

  return scoreWithConfig(state, CONFIG);
}

// ─── Assertions ───────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string): void {
  if (condition) {
    pass++;
  } else {
    fail++;
    failures.push(label);
  }
}

function assertDeterministic(results: ScoreResult[], label: string): void {
  const r0 = results[0]!;
  for (let i = 1; i < results.length; i++) {
    const r = results[i]!;
    assert(
      r.raw === r0.raw && r.scaled === r0.scaled && r.band === r0.band,
      `${label}: session[${i}] diverges from session[0] (raw ${r.raw}≠${r0.raw} scaled ${r.scaled}≠${r0.scaled})`,
    );
  }
}

// Pattern 1 — all correct (sessions 0-9)
const allCorrect = Array<boolean>(ITEM_COUNT).fill(true);
const allCorrectResults = Array.from({ length: 10 }, (_, i) => replaySession(i, allCorrect));
assert(allCorrectResults[0]!.raw === ITEM_COUNT, `all-correct raw = ${ITEM_COUNT}`);
assert(allCorrectResults[0]!.scaled === 100, 'all-correct scaled = 100');
assert(allCorrectResults[0]!.band === 'advanced', 'all-correct band = advanced');
assertDeterministic(allCorrectResults, 'all-correct');

// Pattern 2 — all incorrect (sessions 10-19)
const allWrong = Array<boolean>(ITEM_COUNT).fill(false);
const allWrongResults = Array.from({ length: 10 }, (_, i) => replaySession(10 + i, allWrong));
assert(allWrongResults[0]!.raw === 0, 'all-wrong raw = 0');
assert(allWrongResults[0]!.scaled === 0, 'all-wrong scaled = 0');
assert(allWrongResults[0]!.band === 'developing', 'all-wrong band = developing');
assertDeterministic(allWrongResults, 'all-wrong');

// Pattern 3 — alternating correct/incorrect (sessions 20-29)
const alternating = Array.from({ length: ITEM_COUNT }, (_, i) => i % 2 === 0);
const altCorrectCount = alternating.filter(Boolean).length; // 13 correct out of 25
const altResults = Array.from({ length: 10 }, (_, i) => replaySession(20 + i, alternating));
assert(altResults[0]!.raw === altCorrectCount, `alternating raw = ${altCorrectCount}`);
assertDeterministic(altResults, 'alternating');

// Pattern 4 — first 20 correct (sessions 30-39) → scaled = 80 → advanced
const first20 = Array.from({ length: ITEM_COUNT }, (_, i) => i < 20);
const first20Results = Array.from({ length: 10 }, (_, i) => replaySession(30 + i, first20));
assert(first20Results[0]!.raw === 20, 'first-20-correct raw = 20');
assert(first20Results[0]!.scaled === 80, 'first-20-correct scaled = 80');
assert(first20Results[0]!.band === 'advanced', 'first-20-correct band = advanced');
assertDeterministic(first20Results, 'first-20-correct');

// Pattern 5 — first 10 correct (sessions 40-49) → scaled = 40 → proficient
const first10 = Array.from({ length: ITEM_COUNT }, (_, i) => i < 10);
const first10Results = Array.from({ length: 10 }, (_, i) => replaySession(40 + i, first10));
assert(first10Results[0]!.raw === 10, 'first-10-correct raw = 10');
assert(first10Results[0]!.scaled === 40, 'first-10-correct scaled = 40');
assert(first10Results[0]!.band === 'proficient', 'first-10-correct band = proficient');
assertDeterministic(first10Results, 'first-10-correct');

// ─── Summary ──────────────────────────────────────────────────────────────────

const total = pass + fail;
console.log(`test:replay — ${total} assertions, ${pass} pass, ${fail} fail`);
if (failures.length > 0) {
  console.error('FAILURES:');
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log('All assertions passed (50 sessions replayed).');
}
