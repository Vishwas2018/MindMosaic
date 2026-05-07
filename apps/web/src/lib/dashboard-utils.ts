import type { SessionSummaryDTO } from '@mm/types'

/** Returns the first session with submitted_at === null (active/interrupted). */
export function findActiveSession(sessions: SessionSummaryDTO[]): SessionSummaryDTO | null {
  return sessions.find((s) => s.submitted_at === null) ?? null
}

function startOfISOWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const offset = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + offset)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Counts sessions submitted within the ISO week that contains `now`. */
export function sessionsThisWeek(sessions: SessionSummaryDTO[], now = new Date()): number {
  const weekStart = startOfISOWeek(now)
  return sessions.filter(
    (s) => s.submitted_at !== null && new Date(s.submitted_at) >= weekStart,
  ).length
}

/** Sums skills_touched_count across all sessions. */
export function totalSkillsTouched(sessions: SessionSummaryDTO[]): number {
  return sessions.reduce((sum, s) => sum + s.skills_touched_count, 0)
}

/** Returns a time-of-day greeting. */
export function greetingText(name: string, hour = new Date().getHours()): string {
  if (hour >= 5 && hour < 12) return `Good morning, ${name}`
  if (hour >= 12 && hour < 17) return `Good afternoon, ${name}`
  if (hour >= 17 && hour < 21) return `Good evening, ${name}`
  return `Hello, ${name}`
}

/** Maps session mode to its app route path. */
export function sessionPagePath(session: SessionSummaryDTO): string {
  return session.mode === 'practice'
    ? `/session/${session.session_id}/practice`
    : `/session/${session.session_id}/exam`
}

/** Capitalises mode for display: "practice" → "Practice". */
export function formatMode(mode: string): string {
  if (!mode) return mode
  return mode.charAt(0).toUpperCase() + mode.slice(1)
}
