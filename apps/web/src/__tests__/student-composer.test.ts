// v1.1-S5 — StudentComposerForm schema + copy tests (ADR-0039 §Decisions 2–3).
// Pure schema/function tests — no React rendering (matches apps/web test pattern).
import { describe, it, expect } from 'vitest'
import { ComposerFormSchema, TIME_LIMIT_OPTIONS } from '../components/student/StudentComposerForm'
import { STUDENT_COMPOSER_COPY as C } from '../app/(student)/copy/studentComposer'

// ── ComposerFormSchema validation ────────────────────────────────────────────

function baseValues(overrides: Record<string, unknown> = {}) {
  return {
    pathway_id: 'pathway-abc',
    item_count: 20,
    difficulty_distribution: { easy: 7, mid: 8, hard: 5 },
    time_limit_ms: 3_600_000,
    ...overrides,
  }
}

describe('ComposerFormSchema — valid inputs', () => {
  it('accepts minimal valid form values', () => {
    expect(ComposerFormSchema.safeParse(baseValues()).success).toBe(true)
  })

  it('accepts item_count at minimum boundary (5)', () => {
    expect(
      ComposerFormSchema.safeParse(
        baseValues({ item_count: 5, difficulty_distribution: { easy: 2, mid: 2, hard: 1 } }),
      ).success,
    ).toBe(true)
  })

  it('accepts item_count at maximum boundary (80)', () => {
    expect(
      ComposerFormSchema.safeParse(
        baseValues({ item_count: 80, difficulty_distribution: { easy: 30, mid: 30, hard: 20 } }),
      ).success,
    ).toBe(true)
  })

  it('accepts time_limit_ms at minimum boundary (300_000)', () => {
    expect(ComposerFormSchema.safeParse(baseValues({ time_limit_ms: 300_000 })).success).toBe(true)
  })

  it('accepts time_limit_ms at maximum boundary (10_800_000)', () => {
    expect(
      ComposerFormSchema.safeParse(baseValues({ time_limit_ms: 10_800_000 })).success,
    ).toBe(true)
  })
})

describe('ComposerFormSchema — rejection cases', () => {
  it('rejects item_count below minimum (4)', () => {
    expect(
      ComposerFormSchema.safeParse(
        baseValues({ item_count: 4, difficulty_distribution: { easy: 2, mid: 1, hard: 1 } }),
      ).success,
    ).toBe(false)
  })

  it('rejects item_count above maximum (81)', () => {
    expect(
      ComposerFormSchema.safeParse(
        baseValues({ item_count: 81, difficulty_distribution: { easy: 30, mid: 30, hard: 21 } }),
      ).success,
    ).toBe(false)
  })

  it('rejects time_limit_ms below minimum (299_999)', () => {
    expect(
      ComposerFormSchema.safeParse(baseValues({ time_limit_ms: 299_999 })).success,
    ).toBe(false)
  })

  it('rejects time_limit_ms above maximum (10_800_001)', () => {
    expect(
      ComposerFormSchema.safeParse(baseValues({ time_limit_ms: 10_800_001 })).success,
    ).toBe(false)
  })

  it('rejects empty pathway_id', () => {
    expect(ComposerFormSchema.safeParse(baseValues({ pathway_id: '' })).success).toBe(false)
  })

  it('rejects difficulty sum !== item_count (sum too low)', () => {
    expect(
      ComposerFormSchema.safeParse(
        baseValues({ item_count: 20, difficulty_distribution: { easy: 5, mid: 5, hard: 5 } }),
      ).success,
    ).toBe(false)
  })

  it('rejects difficulty sum !== item_count (sum too high)', () => {
    expect(
      ComposerFormSchema.safeParse(
        baseValues({ item_count: 20, difficulty_distribution: { easy: 10, mid: 10, hard: 5 } }),
      ).success,
    ).toBe(false)
  })

  it('rejects difficulty sum === 0 (all zero, item_count also 0 — fails min(5) first)', () => {
    const result = ComposerFormSchema.safeParse(
      baseValues({ item_count: 0, difficulty_distribution: { easy: 0, mid: 0, hard: 0 } }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects non-integer item_count', () => {
    expect(
      ComposerFormSchema.safeParse(
        baseValues({ item_count: 20.5, difficulty_distribution: { easy: 7, mid: 8, hard: 5 } }),
      ).success,
    ).toBe(false)
  })
})

// ── TIME_LIMIT_OPTIONS coverage ───────────────────────────────────────────────

describe('TIME_LIMIT_OPTIONS', () => {
  it('has 9 options (schema-derived, starting at 5 min per C3 correction)', () => {
    expect(TIME_LIMIT_OPTIONS).toHaveLength(9)
  })

  it('first option is 5 min = 300_000 ms', () => {
    expect(TIME_LIMIT_OPTIONS[0].value).toBe(300_000)
    expect(TIME_LIMIT_OPTIONS[0].label).toBe('5 min')
  })

  it('last option is 180 min = 10_800_000 ms', () => {
    expect(TIME_LIMIT_OPTIONS[8].value).toBe(10_800_000)
    expect(TIME_LIMIT_OPTIONS[8].label).toBe('180 min')
  })

  it('all option values are within schema bounds [300_000, 10_800_000]', () => {
    for (const opt of TIME_LIMIT_OPTIONS) {
      expect(opt.value).toBeGreaterThanOrEqual(300_000)
      expect(opt.value).toBeLessThanOrEqual(10_800_000)
    }
  })
})

// ── STUDENT_COMPOSER_COPY coverage ───────────────────────────────────────────

describe('STUDENT_COMPOSER_COPY', () => {
  it('simulationBannerText is non-empty', () => {
    expect(typeof C.simulationBannerText).toBe('string')
    expect(C.simulationBannerText.length).toBeGreaterThan(0)
  })

  it('form.submitError is non-empty', () => {
    expect(typeof C.form.submitError).toBe('string')
    expect(C.form.submitError.length).toBeGreaterThan(0)
  })

  it('form.pathwayRequired is non-empty', () => {
    expect(typeof C.form.pathwayRequired).toBe('string')
    expect(C.form.pathwayRequired.length).toBeGreaterThan(0)
  })

  it('form.diffSumError(target) returns string containing target', () => {
    const result = C.form.diffSumError(20)
    expect(typeof result).toBe('string')
    expect(result).toContain('20')
  })

  it('practice.submitBtn is non-empty', () => {
    expect(typeof C.practice.submitBtn).toBe('string')
    expect(C.practice.submitBtn.length).toBeGreaterThan(0)
  })

  it('examSim.submitBtn is non-empty', () => {
    expect(typeof C.examSim.submitBtn).toBe('string')
    expect(C.examSim.submitBtn.length).toBeGreaterThan(0)
  })

  it('nav.practice and nav.examSim are non-empty', () => {
    expect(typeof C.nav.practice).toBe('string')
    expect(C.nav.practice.length).toBeGreaterThan(0)
    expect(typeof C.nav.examSim).toBe('string')
    expect(C.nav.examSim.length).toBeGreaterThan(0)
  })
})
