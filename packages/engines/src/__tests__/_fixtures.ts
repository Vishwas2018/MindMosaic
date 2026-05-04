/**
 * Shared test fixtures for engine tests (Stage 16 +).
 *
 * Deterministic — every helper returns stable, index-derived UUIDs so the same
 * fixture configuration always produces the same data. Replay tests rely on
 * this property.
 *
 * Conventions:
 * - Item IDs: `00000000-0000-4000-8000-XXXXXXXXXXXX` (X = zero-padded index).
 * - Skill IDs: `11111111-1111-4111-8111-XXXXXXXXXXXX`.
 * - Session ID: `22222222-2222-4222-8222-222222222222`.
 * - Started-at: 2026-05-04T10:00:00.000Z.
 */
import {
  type EngineItem,
  type EngineResponse,
  type FrameworkConfig,
  type SessionContext,
  type ItemId,
  type SessionId,
  type SkillId,
} from '../index.js';

export const SESSION_ID = '22222222-2222-4222-8222-222222222222' as SessionId;
export const STARTED_AT = '2026-05-04T10:00:00.000Z';
export const STARTED_AT_MS = Date.parse(STARTED_AT);

// ─── IDs ─────────────────────────────────────────────────────────────────────

export function skillId(index: number): SkillId {
  const hex = String(index + 1).padStart(12, '0');
  return `11111111-1111-4111-8111-${hex}` as SkillId;
}

export function itemId(index: number): ItemId {
  const hex = String(index + 1).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}` as ItemId;
}

// A default skill ID for engines that ignore skill metadata (LinearEngine).
export const DEFAULT_SKILL_ID = skillId(0);

// ─── Clock ───────────────────────────────────────────────────────────────────

export function clockAt(offsetMs: number): () => number {
  return () => STARTED_AT_MS + offsetMs;
}

// ─── Items ───────────────────────────────────────────────────────────────────

export interface BuildItemInput {
  index: number;
  skill_ids?: SkillId[];
  difficulty?: number;
  overrides?: Partial<EngineItem>;
}

export function buildEngineItem({
  index,
  skill_ids = [DEFAULT_SKILL_ID],
  difficulty = 0.5,
  overrides,
}: BuildItemInput): EngineItem {
  return {
    item_id: itemId(index),
    version: 1,
    stem: { kind: 'plain_text', value: `Question ${index + 1}` },
    stimulus: null,
    response_type: 'multiple_choice',
    response_config: { options: ['A', 'B', 'C', 'D'], correct: 'A' },
    tools_available: [],
    sequence_number: index + 1,
    skill_ids,
    difficulty,
    ...overrides,
  };
}

/** Build N items with a single skill and uniform difficulty (Linear-style fixture). */
export function buildEngineItems(count: number, opts?: Partial<BuildItemInput>): EngineItem[] {
  return Array.from({ length: count }, (_, i) => buildEngineItem({ index: i, ...opts }));
}

/**
 * Build an item pool with a specified skills × difficulties matrix.
 * Each combination yields one unique item; total = skills * difficulties.length.
 */
export function buildEngineItemPool({
  skills,
  difficulties,
}: {
  skills: SkillId[];
  difficulties: number[];
}): EngineItem[] {
  const out: EngineItem[] = [];
  let i = 0;
  for (const sid of skills) {
    for (const diff of difficulties) {
      out.push(
        buildEngineItem({
          index: i,
          skill_ids: [sid],
          difficulty: diff,
        }),
      );
      i++;
    }
  }
  return out;
}

// ─── Responses ───────────────────────────────────────────────────────────────

export interface BuildResponseInput {
  item: EngineItem;
  isCorrect: boolean;
  offsetMs: number;
  telemetry?: { time_to_answer_ms: number; answer_changes: number };
}

export function buildResponse({
  item,
  isCorrect,
  offsetMs,
  telemetry,
}: BuildResponseInput): EngineResponse {
  const base: EngineResponse = {
    item_id: item.item_id,
    is_correct: isCorrect,
    response_data: { selected: isCorrect ? 'A' : 'B' },
    answered_at: new Date(STARTED_AT_MS + offsetMs).toISOString(),
  };
  if (telemetry !== undefined) {
    base.telemetry = telemetry;
  }
  return base;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export function buildLinearSession(
  itemCount: number,
  overrides: Partial<SessionContext> = {},
): SessionContext {
  return {
    session_id: SESSION_ID,
    mode: 'exam',
    engine_type: 'linear',
    total_items: itemCount,
    time_limit_ms: 60 * 60 * 1000,
    started_at: STARTED_AT,
    planned_items: buildEngineItems(itemCount),
    target_skills: [],
    ...overrides,
  };
}

export function buildSkillSession({
  skills,
  pool,
  overrides = {},
}: {
  skills: SkillId[];
  pool: EngineItem[];
  overrides?: Partial<SessionContext>;
}): SessionContext {
  return {
    session_id: SESSION_ID,
    mode: 'practice',
    engine_type: 'skill',
    total_items: null,
    time_limit_ms: null,
    started_at: STARTED_AT,
    planned_items: pool,
    target_skills: skills,
    ...overrides,
  };
}

export function buildDiagnosticSession({
  skills,
  pool,
  overrides = {},
}: {
  skills: SkillId[];
  pool: EngineItem[];
  overrides?: Partial<SessionContext>;
}): SessionContext {
  return {
    session_id: SESSION_ID,
    mode: 'diagnostic',
    engine_type: 'diagnostic',
    total_items: null,
    time_limit_ms: null,
    started_at: STARTED_AT,
    planned_items: pool,
    target_skills: skills,
    ...overrides,
  };
}

// ─── Configs ─────────────────────────────────────────────────────────────────

export function buildLinearConfig(overrides: Partial<FrameworkConfig> = {}): FrameworkConfig {
  return {
    engine_type: 'linear',
    time_limit_ms: 60 * 60 * 1000,
    back_navigation_enabled: true,
    flag_for_review_enabled: true,
    scoring_rules: {
      scaled_score_formula: 'percentage',
      bands: [
        { min: 0,  max: 49,  label: 'fail' },
        { min: 50, max: 64,  label: 'pass' },
        { min: 65, max: 79,  label: 'credit' },
        { min: 80, max: 89,  label: 'distinction' },
        { min: 90, max: 100, label: 'high_distinction' },
      ],
    },
    mastery_threshold: 0.85,
    difficulty_step_up: 0.1,
    difficulty_step_down: 0.15,
    cognitive_load_threshold: 0.8,
    cognitive_load_step_down: 0.1,
    expected_time_per_item_ms: 30_000,
    max_items: 20,
    confidence_threshold: 0.7,
    diagnostic_start_difficulty: 0.5,
    ...overrides,
  };
}

export function buildSkillConfig(overrides: Partial<FrameworkConfig> = {}): FrameworkConfig {
  return buildLinearConfig({
    engine_type: 'skill',
    back_navigation_enabled: false,
    time_limit_ms: null,
    ...overrides,
  });
}

export function buildDiagnosticConfig(overrides: Partial<FrameworkConfig> = {}): FrameworkConfig {
  return buildLinearConfig({
    engine_type: 'diagnostic',
    back_navigation_enabled: false,
    time_limit_ms: null,
    ...overrides,
  });
}
