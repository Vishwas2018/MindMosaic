import { describe, it, expect } from 'vitest'
import { SessionSummaryDTOSchema } from '@mm/types'
import type { SessionSummaryDTO } from '@mm/types'
import {
  findActiveSession,
  greetingText,
  sessionsThisWeek,
  totalSkillsTouched,
} from '../lib/dashboard-utils'

function makeSession(overrides: Record<string, unknown> = {}): SessionSummaryDTO {
  return SessionSummaryDTOSchema.parse({
    session_id: 'aaaaaaaa-0000-0000-0000-000000000000',
    mode: 'exam',
    pathway_name: null,
    started_at: '2026-05-15T09:00:00.000Z',
    submitted_at: '2026-05-15T09:30:00.000Z',
    duration_ms: 1800000,
    active_duration_ms: 1750000,
    score_band: 'Proficient',
    raw_score: 75,
    skills_touched_count: 5,
    ...overrides,
  })
}

describe('findActiveSession', () => {
  it('returns null for an empty array', () => {
    expect(findActiveSession([])).toBeNull()
  })

  it('returns the session where submitted_at is null', () => {
    const active = makeSession({
      submitted_at: null,
      session_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    })
    const done = makeSession({ session_id: 'aaaaaaaa-0000-0000-0000-000000000002' })
    expect(findActiveSession([active, done])?.session_id).toBe(
      'aaaaaaaa-0000-0000-0000-000000000001',
    )
  })

  it('returns null when all sessions are submitted', () => {
    expect(
      findActiveSession([
        makeSession(),
        makeSession({ session_id: 'aaaaaaaa-0000-0000-0000-000000000003' }),
      ]),
    ).toBeNull()
  })
})

describe('sessionsThisWeek', () => {
  it('returns 0 for an empty array', () => {
    expect(sessionsThisWeek([], new Date('2026-05-15T12:00:00Z'))).toBe(0)
  })

  it('counts only sessions submitted in the current ISO week, excluding active sessions', () => {
    // Thu 2026-05-15; ISO week: Mon 2026-05-12 – Sun 2026-05-18
    const now = new Date('2026-05-15T12:00:00Z')
    const thisWeek = makeSession({ submitted_at: '2026-05-13T10:00:00.000Z' })
    const lastWeek = makeSession({ submitted_at: '2026-05-05T10:00:00.000Z' })
    const active = makeSession({ submitted_at: null })
    expect(sessionsThisWeek([thisWeek, lastWeek, active], now)).toBe(1)
  })
})

describe('totalSkillsTouched', () => {
  it('sums skills_touched_count across all sessions', () => {
    expect(
      totalSkillsTouched([
        makeSession({ skills_touched_count: 3 }),
        makeSession({ skills_touched_count: 7 }),
      ]),
    ).toBe(10)
  })

  it('returns 0 for an empty array', () => {
    expect(totalSkillsTouched([])).toBe(0)
  })
})

describe('greetingText', () => {
  it('returns morning greeting for hours 5–11', () => {
    expect(greetingText('Alex', 9)).toMatch(/good morning/i)
  })

  it('returns afternoon greeting for hours 12–16', () => {
    expect(greetingText('Alex', 14)).toMatch(/good afternoon/i)
  })

  it('returns evening greeting for hours 17–20', () => {
    expect(greetingText('Alex', 19)).toMatch(/good evening/i)
  })

  it('returns fallback greeting outside standard hours', () => {
    expect(greetingText('Alex', 2)).toMatch(/hello/i)
  })
})
