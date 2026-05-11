'use client'

// Screen 20 — Teacher: Student Detail (/teacher/students/[id]).
// T5 layout: breadcrumb header → student hero → stat strip → strand mastery card →
// assignment table → score trend (EmptyState v1) → activity feed → teacher notes → action bar.
// Authority: SCREEN_SPECS Screen 20 (SCREEN_SPECS.md); Q-38.UI-1..5 resolutions.
//
// Q-38.UI-2: NAPLAN tab only (ISSUE-0030 — strand keys ≠ pathway slugs → single tab, static label).
// Q-38.UI-3: hero sessions count + streak omitted (data absent v1).
// Q-38.UI-4: Message Parent button omitted entirely (v1 scope cut).
// Q-38.UI-5: SkillBar horizontal layout variant used in strand card.

import { useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  AppShell,
  Brand,
  Button,
  Card,
  EmptyState,
  NavLink,
  Sidebar,
  StatTile,
  SkillBar,
  TopBar,
} from '@mm/ui'
import {
  useFlagForReview,
  useLearnerProfile,
  useStudentAssignments,
  useStudentProfile,
  useTeacherRecentSessions,
} from '@mm/sdk'

// ── Layout atoms ──────────────────────────────────────────────────────────────

function SectionHeading({ label }: { label: string }) {
  return <h2 className="text-base font-semibold text-[var(--text)] mb-3">{label}</h2>
}

function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className={`rounded-card border border-[var(--border)] bg-[var(--surface)] animate-pulse h-20 ${className}`}
    />
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function TeacherSidebarNav({ pathname }: { pathname: string }) {
  const nav = [
    { href: '/teacher', label: 'Overview' },
    { href: '/teacher/students', label: 'Students' },
    { href: '/teacher/assignments', label: 'Assignments' },
    { href: '/teacher/analytics', label: 'Analytics' },
  ]
  return (
    <Sidebar variant="teacher">
      <div className="p-4 border-b border-[var(--border)]">
        <Brand logoSrc="/logo.svg" size="sm" />
      </div>
      <nav className="flex-1 px-2 py-4 space-y-0.5" aria-label="Teacher navigation">
        {nav.map(({ href, label }) => (
          <NavLink key={href} href={href} active={pathname === href}>
            {label}
          </NavLink>
        ))}
      </nav>
    </Sidebar>
  )
}

// ── Section 1: Breadcrumb header ──────────────────────────────────────────────

function BreadcrumbHeader({
  displayName,
  className: studentClass,
}: {
  displayName: string | null
  className: string | null
}) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
      <button
        onClick={() => router.back()}
        className="hover:text-[var(--text)] transition-colors focus-visible:outline-none focus-visible:shadow-focus"
        aria-label="Back to students"
      >
        ← Students
      </button>
      <span aria-hidden>/</span>
      <span className="text-[var(--text)] font-medium">
        {displayName ?? 'Student'}
      </span>
      {studentClass && (
        <>
          <span aria-hidden>·</span>
          <span>{studentClass}</span>
        </>
      )}
    </div>
  )
}

// ── Section 2: Student hero ───────────────────────────────────────────────────

function StudentHero({
  displayName,
  yearLevel,
  avgScore,
  lastSessionAt,
}: {
  displayName: string | null
  yearLevel: number | null
  avgScore: number | null
  lastSessionAt: string | null
}) {
  function fmt(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="flex items-start gap-5">
      {/* Avatar placeholder */}
      <div
        className="w-16 h-16 rounded-full bg-[var(--slate-100)] flex items-center justify-center text-2xl font-bold text-[var(--muted)] flex-shrink-0"
        aria-hidden
      >
        {displayName?.[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-[var(--text)] truncate">
          {displayName ?? 'Unknown student'}
        </h1>
        {yearLevel && (
          <p className="text-sm text-[var(--muted)] mt-0.5">Year {yearLevel}</p>
        )}
      </div>
      {/* Q-38.UI-3: hero stat strip — only avg_score + last_session shown; count + streak absent v1 */}
      <div className="ml-auto flex gap-6 flex-shrink-0">
        <StatTile
          label="Avg score"
          value={avgScore != null ? `${Math.round(avgScore)}%` : '—'}
        />
        <StatTile
          label="Last session"
          value={fmt(lastSessionAt)}
        />
      </div>
    </div>
  )
}

// ── Section 3a: Strand mastery card ──────────────────────────────────────────
// Q-38.UI-1: Strand Mastery tile instead of sessions count + streak.
// Q-38.UI-2: NAPLAN tab only — domain_profiles keys are strand names, not pathway slugs (ISSUE-0030).

function StrandMasteryCard({ studentId }: { studentId: string }) {
  const { data, isLoading, isError } = useLearnerProfile(studentId)

  if (isLoading) return <SkeletonCard className="h-32" />
  if (isError || !data) {
    return (
      <Card>
        <EmptyState title="Strand mastery unavailable" description="Mastery data will appear after sessions." />
      </Card>
    )
  }

  const profiles = (data as { domain_profiles?: Record<string, { mastery: number }> }).domain_profiles
  if (!profiles || Object.keys(profiles).length === 0) {
    return (
      <Card>
        <EmptyState title="No strand data yet" description="Complete sessions to see strand mastery." />
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <SectionHeading label="Strand mastery" />
        {/* ISSUE-0030: NAPLAN only — strand keys ≠ pathway slugs; ICAS/Selective hidden */}
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-[var(--slate-100)] text-[var(--muted)]">
          NAPLAN
        </span>
      </div>
      <div className="space-y-3">
        {Object.entries(profiles).map(([strand, profile]) => (
          <SkillBar
            key={strand}
            label={strand}
            value={Math.round((profile.mastery ?? 0) * 100)}
            layout="horizontal"
          />
        ))}
      </div>
    </Card>
  )
}

// ── Section 3b: Misconceptions stat ──────────────────────────────────────────
// Q-38.UI-1: Misconceptions count (weakest_skills length) as secondary stat tile.

function MisconceptionsStatTile({ studentId }: { studentId: string }) {
  const { data } = useLearnerProfile(studentId)
  const profiles = (data as { domain_profiles?: Record<string, { weakest_skills?: string[] }> } | undefined)?.domain_profiles
  const count = profiles
    ? Object.values(profiles).reduce((acc, p) => acc + (p.weakest_skills?.length ?? 0), 0)
    : null

  return <StatTile label="Misconceptions" value={count ?? '—'} />
}

// ── Section 4: Assignment table ───────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function AssignmentTable({ studentId }: { studentId: string }) {
  const { data: assignments, isLoading, isError } = useStudentAssignments(studentId)

  if (isLoading) return <SkeletonCard className="h-32" />
  if (isError) return <p className="text-sm text-[var(--error)]">Failed to load assignments.</p>

  const list = assignments ?? []

  if (list.length === 0) {
    return (
      <EmptyState
        title="No assignments yet"
        description="Create an assignment for this student from the Assignments page."
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-card border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--slate-50)]">
            <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--muted)]">Title</th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--muted)]">Status</th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--muted)]">Due</th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--muted)]">My status</th>
          </tr>
        </thead>
        <tbody>
          {list.map((a) => (
            <tr
              key={a.id}
              className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--slate-50)] transition-colors"
            >
              <td className="px-4 py-3 font-medium text-[var(--text)]">{a.title}</td>
              <td className="px-4 py-3 text-[var(--text-2)] capitalize">{a.status}</td>
              <td className="px-4 py-3 text-[var(--text-2)]">{formatDate(a.due_at)}</td>
              <td className="px-4 py-3 text-[var(--text-2)] capitalize">
                {a.my_status ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Section 5a: Score trend (EmptyState v1) ───────────────────────────────────
// ISSUE-0029: score trend chart absent v1 (Recharts not wired).

function ScoreTrendSection() {
  return (
    <Card>
      <EmptyState
        title="Score trend"
        description="Score trend chart available in a future release."
      />
    </Card>
  )
}

// ── Section 5b: Activity feed ─────────────────────────────────────────────────

function ActivityFeed({ studentId }: { studentId: string }) {
  const { data: sessions, isLoading, isError } = useTeacherRecentSessions(studentId, 5)

  if (isLoading) return <SkeletonCard />
  if (isError) return <p className="text-sm text-[var(--error)]">Failed to load activity.</p>
  if (!sessions || sessions.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No recent sessions.</p>
  }

  return (
    <ul className="space-y-2" aria-label="Recent sessions">
      {sessions.map((s) => (
        <li
          key={s.session_id}
          className="flex items-center justify-between text-sm px-3 py-2 rounded-field bg-[var(--slate-50)]"
        >
          <span className="text-[var(--text)] capitalize">{s.mode ?? 'Session'}</span>
          <span className="tabular-nums text-[var(--muted)]">
            {s.raw_score != null ? `${Math.round(s.raw_score)}%` : '—'}
          </span>
          <span className="text-[var(--muted)]">{formatDate(s.submitted_at ?? null)}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Section 5c: Teacher notes ─────────────────────────────────────────────────
// Q-38.UI — notes stored localStorage only (v1 client-side per SCREEN_SPECS §20).

const NOTES_KEY = (teacherId: string, studentId: string) => `mm:notes:${teacherId}:${studentId}`

function TeacherNotes({ teacherId, studentId }: { teacherId: string; studentId: string }) {
  const key = NOTES_KEY(teacherId, studentId)
  const [notes, setNotes] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(key) ?? ''
  })
  const [saved, setSaved] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(val: string) {
    setNotes(val)
    setSaved(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      localStorage.setItem(key, val)
      setSaved(true)
    }, 800)
  }

  return (
    <div className="space-y-2">
      <label htmlFor="teacher-notes" className="text-sm font-medium text-[var(--text)]">
        Teacher notes
      </label>
      <textarea
        id="teacher-notes"
        className="w-full rounded-field border border-[var(--border)] bg-[var(--field-bg)] text-[var(--text)] text-sm px-3 py-2 resize-y min-h-[80px] focus:outline-none focus:shadow-focus-subtle"
        placeholder="Add notes about this student…"
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        aria-describedby="teacher-notes-hint"
      />
      <p id="teacher-notes-hint" className="text-xs text-[var(--muted)]">
        {saved ? 'Saved' : 'Saved automatically in your browser.'}
      </p>
    </div>
  )
}

// ── Section 5d: Action bar ────────────────────────────────────────────────────
// Q-38.UI-4: Message Parent omitted. Q-38.5: Flag for Review → POST /analytics/intervention-alerts.

function ActionBar({
  studentId,
  classId,
}: {
  studentId: string
  classId: string
}) {
  const { mutate: flag, isPending } = useFlagForReview()
  const [flagged, setFlagged] = useState(false)

  function handleFlag() {
    flag(
      { studentId, classId, reason: 'Manually flagged by teacher for review' },
      {
        onSuccess: () => setFlagged(true),
      },
    )
  }

  return (
    <div className="flex gap-3 flex-wrap">
      <Button
        variant="secondary"
        size="sm"
        onClick={handleFlag}
        disabled={isPending || flagged}
        aria-label="Flag student for review"
      >
        {flagged ? 'Flagged' : isPending ? 'Flagging…' : 'Flag for Review'}
      </Button>
      <a
        href={`/teacher/assignments/new?target_student=${encodeURIComponent(studentId)}`}
        className="inline-flex items-center h-8 px-4 text-sm font-medium rounded-btn bg-[var(--primary)] text-white hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:shadow-focus"
      >
        Assign Work
      </a>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>()
  const studentId = params.id

  // Teacher user ID from session — accessed via browser token; use a stable fallback for localStorage key.
  // Full teacher ID requires server-side session; localStorage key gracefully degrades to studentId-scoped.
  const teacherStorageKey = typeof window !== 'undefined'
    ? (localStorage.getItem('mm:teacher_id') ?? 'teacher')
    : 'teacher'

  const { data: profile, isLoading: profileLoading, isError: profileError } = useStudentProfile(studentId)

  if (profileLoading) {
    return (
      <AppShell variant="teacher">
        <div className="flex h-screen">
          <TeacherSidebarNav pathname="/teacher/students" />
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar>
              <Brand logoSrc="/logo.svg" size="sm" />
            </TopBar>
            <main className="flex-1 overflow-auto p-6 space-y-6">
              {[0, 1, 2].map((i) => <SkeletonCard key={i} className="h-20" />)}
            </main>
          </div>
        </div>
      </AppShell>
    )
  }

  if (profileError || !profile) {
    return (
      <AppShell variant="teacher">
        <div className="flex h-screen">
          <TeacherSidebarNav pathname="/teacher/students" />
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar>
              <Brand logoSrc="/logo.svg" size="sm" />
            </TopBar>
            <main className="flex-1 overflow-auto p-6">
              <EmptyState
                title="Student not found"
                description="This student may have been removed or you may not have access."
              />
            </main>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell variant="teacher">
      <div className="flex h-screen">
        <TeacherSidebarNav pathname="/teacher/students" />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar>
            <Brand logoSrc="/logo.svg" size="sm" />
          </TopBar>
          <main className="flex-1 overflow-auto p-6 space-y-6">

            {/* Section 1: Breadcrumb */}
            <BreadcrumbHeader
              displayName={profile.display_name}
              className={profile.class_name}
            />

            {/* Section 2: Student hero + Q-38.UI-3 stat strip */}
            <Card>
              <StudentHero
                displayName={profile.display_name}
                yearLevel={profile.year_level}
                avgScore={profile.avg_score}
                lastSessionAt={profile.last_session_at}
              />
            </Card>

            {/* Section 3a + 3b: Strand mastery + Misconceptions (Q-38.UI-1) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <StrandMasteryCard studentId={studentId} />
              </div>
              <div>
                <Card>
                  <SectionHeading label="Stats" />
                  <div className="space-y-4">
                    <MisconceptionsStatTile studentId={studentId} />
                  </div>
                </Card>
              </div>
            </div>

            {/* Section 4: Assignment table */}
            <section aria-labelledby="assignments-heading">
              <SectionHeading label="Assignments" />
              <AssignmentTable studentId={studentId} />
            </section>

            {/* Section 5a: Score trend (EmptyState v1 — ISSUE-0029) */}
            <section aria-labelledby="trend-heading">
              <SectionHeading label="Score trend" />
              <ScoreTrendSection />
            </section>

            {/* Section 5b: Activity feed */}
            <section aria-labelledby="activity-heading">
              <SectionHeading label="Recent activity" />
              <ActivityFeed studentId={studentId} />
            </section>

            {/* Section 5c: Teacher notes (localStorage, v1 client-side only) */}
            <section aria-labelledby="notes-heading">
              <Card>
                <TeacherNotes teacherId={teacherStorageKey} studentId={studentId} />
              </Card>
            </section>

            {/* Section 5d: Action bar — Flag for Review + Assign Work (Q-38.UI-4: Message Parent omitted) */}
            <section aria-label="Student actions">
              <ActionBar
                studentId={studentId}
                classId={profile.class_id ?? ''}
              />
            </section>

          </main>
        </div>
      </div>
    </AppShell>
  )
}
