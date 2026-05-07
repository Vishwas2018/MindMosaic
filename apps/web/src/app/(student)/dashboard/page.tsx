'use client'

// SCREEN_SPECS §7 — Student Dashboard v1. Six sections in strict order:
// greeting · continue/start CTA · pathway tiles · mastery snapshot ·
// recent sessions · engagement strip. Shell: student-parent.
// TODO: ISSUE-0011f — mastery snapshot needs intelligence-svc /learner-profile (Stage 28+).

import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { AppShell, Button, Card, EmptyState, StatTile, TopBar, Brand } from '@mm/ui'
import { useListRecentSessions, useMe, usePathways } from '@mm/sdk'
import type { PathwayDTO, SessionSummaryDTO } from '@mm/types'
import {
  findActiveSession,
  formatMode,
  greetingText,
  sessionPagePath,
  sessionsThisWeek,
  totalSkillsTouched,
} from '@/lib/dashboard-utils'

// ── pure page-local formatters ────────────────────────────────────────────────

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return m === 0 ? `${s}s` : `${m}m ${s % 60}s`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// ── shared layout atoms ───────────────────────────────────────────────────────

function SectionHeading({ children }: { children: string }) {
  return <h2 className="text-base font-semibold text-[var(--text)] mb-3">{children}</h2>
}

function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`rounded-card border border-[var(--border)] bg-[var(--surface)] animate-pulse ${className}`}
    />
  )
}

// ── Section 1: Greeting ───────────────────────────────────────────────────────

function GreetingSection({
  displayName,
  yearLevel,
  loading,
}: {
  displayName: string | null
  yearLevel: number | null
  loading: boolean
}) {
  if (loading) return <SkeletonCard className="h-20" />
  return (
    <Card>
      <h1 className="text-xl font-semibold text-[var(--text)]">
        {greetingText(displayName ?? 'there')}
      </h1>
      {yearLevel !== null && (
        <p className="mt-1 text-sm text-[var(--muted)]">Year {yearLevel}</p>
      )}
    </Card>
  )
}

// ── Section 2: Continue / Start CTA ──────────────────────────────────────────

function ContinueSection({
  activeSession,
  sessionsExist,
  loading,
  onContinue,
  onStart,
}: {
  activeSession: SessionSummaryDTO | null
  sessionsExist: boolean
  loading: boolean
  onContinue: (path: string) => void
  onStart: () => void
}) {
  if (loading) return <SkeletonCard className="h-28" />

  if (activeSession !== null) {
    return (
      <Card className="border-l-4 border-l-[var(--primary)]">
        <p className="text-sm text-[var(--muted)]">Pick up where you left off</p>
        <p className="mt-1 text-base font-semibold text-[var(--text)]">
          {formatMode(activeSession.mode)} session in progress
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={() => onContinue(sessionPagePath(activeSession))}>
            Continue session
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <p className="text-base font-semibold text-[var(--text)]">
        {sessionsExist ? 'Ready for another session?' : 'Start your learning journey'}
      </p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {sessionsExist
          ? 'Choose a pathway below to begin.'
          : 'Pick a pathway below to get started.'}
      </p>
      <div className="mt-4">
        <Button variant="primary" onClick={onStart}>
          {sessionsExist ? 'Start new session' : 'Start first session'}
        </Button>
      </div>
    </Card>
  )
}

// ── Section 3: Pathway tiles ──────────────────────────────────────────────────

function PathwayTile({
  pathway,
  onStart,
}: {
  pathway: PathwayDTO
  onStart: () => void
}) {
  const yearLabel =
    pathway.year_levels.length > 0 ? `Year ${pathway.year_levels.join(', ')}` : null

  if (!pathway.entitled) {
    return (
      <div
        className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-6 opacity-50"
        aria-label={`${pathway.display_name} — locked`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">{pathway.display_name}</p>
            {yearLabel !== null && (
              <p className="mt-0.5 text-xs text-[var(--muted)]">{yearLabel}</p>
            )}
          </div>
          <Lock size={16} aria-hidden="true" className="flex-shrink-0 mt-0.5 text-[var(--muted)]" />
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          {pathway.locked_reason ?? 'Upgrade to access'}
        </p>
      </div>
    )
  }

  return (
    <Card>
      <p className="text-sm font-semibold text-[var(--text)]">{pathway.display_name}</p>
      {yearLabel !== null && (
        <p className="mt-0.5 text-xs text-[var(--muted)]">{yearLabel}</p>
      )}
      <p className="mt-1 text-xs text-[var(--muted-2)]">{pathway.program}</p>
      <div className="mt-4">
        <Button variant="secondary" size="sm" onClick={onStart}>
          Start session
        </Button>
      </div>
    </Card>
  )
}

function PathwaySection({
  pathways,
  loading,
  onStart,
}: {
  pathways: PathwayDTO[]
  loading: boolean
  onStart: () => void
}) {
  if (loading) {
    return (
      <section aria-label="Pathways">
        <SectionHeading>Quick start</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SkeletonCard className="h-36" />
          <SkeletonCard className="h-36" />
        </div>
      </section>
    )
  }

  if (pathways.length === 0) return null

  return (
    <section aria-label="Pathways">
      <SectionHeading>Quick start</SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pathways.map((pathway) => (
          <PathwayTile key={pathway.slug} pathway={pathway} onStart={onStart} />
        ))}
      </div>
    </section>
  )
}

// ── Section 4: Mastery snapshot (ISSUE-0011f stub) ───────────────────────────

function MasterySection({
  skillsCount,
  loading,
}: {
  skillsCount: number
  loading: boolean
}) {
  if (loading) {
    return (
      <section aria-label="Mastery snapshot">
        <SectionHeading>Mastery snapshot</SectionHeading>
        <SkeletonCard className="h-24" />
      </section>
    )
  }

  return (
    <section aria-label="Mastery snapshot">
      <SectionHeading>Mastery snapshot</SectionHeading>
      {/* TODO: ISSUE-0011f — replace StatTile with useLearnerProfile data (Stage 28+) */}
      <StatTile label="Skills touched" value={skillsCount} />
      <p className="mt-2 text-xs text-[var(--muted)]">
        Full mastery data in a future release
      </p>
    </section>
  )
}

// ── Section 5: Recent sessions ────────────────────────────────────────────────

function RecentSessionsSection({
  sessions,
  loading,
  onSessionClick,
}: {
  sessions: SessionSummaryDTO[]
  loading: boolean
  onSessionClick: (id: string) => void
}) {
  if (loading) {
    return (
      <section aria-label="Recent sessions">
        <SectionHeading>Recent sessions</SectionHeading>
        <SkeletonCard className="h-32" />
      </section>
    )
  }

  if (sessions.length === 0) {
    return (
      <section aria-label="Recent sessions">
        <SectionHeading>Recent sessions</SectionHeading>
        <EmptyState
          title="No sessions yet"
          description="Complete a session to see your history here."
        />
      </section>
    )
  }

  return (
    <section aria-label="Recent sessions">
      <SectionHeading>Recent sessions</SectionHeading>
      <Card padding="none">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th
                scope="col"
                className="text-left px-4 py-3 text-xs font-medium text-[var(--muted)]"
              >
                Mode
              </th>
              <th
                scope="col"
                className="text-left px-4 py-3 text-xs font-medium text-[var(--muted)]"
              >
                Date
              </th>
              <th
                scope="col"
                className="text-left px-4 py-3 text-xs font-medium text-[var(--muted)]"
              >
                Duration
              </th>
              <th
                scope="col"
                className="text-left px-4 py-3 text-xs font-medium text-[var(--muted)]"
              >
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr
                key={session.session_id}
                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--slate-75)] transition-colors cursor-pointer"
                onClick={() => onSessionClick(session.session_id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSessionClick(session.session_id)
                  }
                }}
                aria-label={`${formatMode(session.mode)} session${session.submitted_at !== null ? `, ${formatDate(session.submitted_at)}` : ''}`}
              >
                <td className="px-4 py-3">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--primary-50)] text-[var(--primary)]">
                    {formatMode(session.mode)}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--text-2)]">
                  {session.submitted_at !== null ? formatDate(session.submitted_at) : '—'}
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--text-2)]">
                  {formatDuration(session.duration_ms)}
                </td>
                <td className="px-4 py-3 text-[var(--text-2)]">
                  {session.score_band ??
                    (session.raw_score !== null ? `${session.raw_score}%` : '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  )
}

// ── Section 6: Engagement strip ───────────────────────────────────────────────

function EngagementStrip({ sessionsThisWeekCount }: { sessionsThisWeekCount: number }) {
  return (
    <section aria-label="Engagement">
      <SectionHeading>Your progress</SectionHeading>
      <div className="grid grid-cols-2 gap-4">
        <StatTile label="Sessions this week" value={sessionsThisWeekCount} />
        {/* streak stub — no server data until Stage 28+ */}
        <div className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-6">
          <p className="text-sm text-[var(--muted)]">Streak</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text)]">—</p>
          <p className="mt-2 text-xs text-[var(--muted)]">Coming soon</p>
        </div>
      </div>
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudentDashboardPage() {
  const router = useRouter()
  const me = useMe()
  const recentSessions = useListRecentSessions()
  const pathways = usePathways()

  const sessions = recentSessions.data ?? []
  const activeSession = findActiveSession(sessions)
  const submittedSessions = sessions
    .filter((s): s is SessionSummaryDTO & { submitted_at: string } => s.submitted_at !== null)
    .slice(0, 5)
  const thisWeekCount = sessionsThisWeek(sessions)
  const skillsCount = totalSkillsTouched(sessions)

  function handleStart() {
    router.push('/session-selection')
  }

  function handleContinue(path: string) {
    router.push(path)
  }

  function handleSessionClick(sessionId: string) {
    router.push(`/results/${sessionId}`)
  }

  return (
    <AppShell variant="student-parent">
      <TopBar>
        <Brand logoSrc="/logo.svg" size="sm" />
      </TopBar>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* 1. Greeting */}
        <GreetingSection
          displayName={me.data?.display_name ?? null}
          yearLevel={me.data?.year_level ?? null}
          loading={me.isPending}
        />

        {/* 2. Continue / Start CTA */}
        <ContinueSection
          activeSession={activeSession}
          sessionsExist={sessions.length > 0}
          loading={recentSessions.isPending}
          onContinue={handleContinue}
          onStart={handleStart}
        />

        {/* 3. Quick-start pathway tiles */}
        <PathwaySection
          pathways={pathways.data ?? []}
          loading={pathways.isPending}
          onStart={handleStart}
        />

        {/* 4. Mastery snapshot — ISSUE-0011f stub (Stage 28+) */}
        <MasterySection skillsCount={skillsCount} loading={recentSessions.isPending} />

        {/* 5. Recent sessions */}
        <RecentSessionsSection
          sessions={submittedSessions}
          loading={recentSessions.isPending}
          onSessionClick={handleSessionClick}
        />

        {/* 6. Engagement strip */}
        <EngagementStrip sessionsThisWeekCount={thisWeekCount} />
      </main>
    </AppShell>
  )
}
