'use client'

// Screen 18 — Teacher Dashboard (/teacher). Six content blocks:
// 1 class switcher · 2 KPI strip · 3 intervention alerts ·
// 4 student performance table · 5 topic mastery (v1.1 placeholder) · 6 assignments widget.
// Shell: teacher (sidebar + top bar). Route guard: teacher role (layout.tsx).
// Authority: SCREEN_SPECS Screen 18 (SCREEN_SPECS.md:994–1056).

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AppShell,
  Brand,
  Button,
  Card,
  EmptyState,
  NavLink,
  ProgressBar,
  Sidebar,
  StatTile,
  TopBar,
} from '@mm/ui'
import {
  useAssignmentsForClass,
  useClassKpi,
  useClassStudents,
  useDismissAlert,
  useInterventionAlerts,
  useMyClasses,
} from '@mm/sdk'
import type { ClassGroupDTO } from '@mm/sdk'

// ── shared layout atoms ──────────────────────────────────────────────────────

function SectionHeading({ label }: { label: string }) {
  return <h2 className="text-base font-semibold text-[var(--text)] mb-3">{label}</h2>
}

function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className={`rounded-card border border-[var(--border)] bg-[var(--surface)] animate-pulse h-24 ${className}`}
    />
  )
}

// ── Block 1: Class Switcher ───────────────────────────────────────────────────

function ClassSwitcher({
  classes,
  activeClassId,
}: {
  classes: ClassGroupDTO[]
  activeClassId: string
}) {
  const router = useRouter()
  if (classes.length <= 1) return null
  return (
    <select
      aria-label="Switch class"
      className="ml-4 text-sm border border-[var(--border)] rounded-field px-3 py-1.5 bg-[var(--field-bg)] text-[var(--text)] focus:outline-none focus:shadow-focus-subtle"
      value={activeClassId}
      onChange={(e) => {
        router.push(`?class=${encodeURIComponent(e.target.value)}`)
      }}
    >
      {classes.map((cls) => (
        <option key={cls.id} value={cls.id}>
          {cls.name} ({cls.student_count})
        </option>
      ))}
    </select>
  )
}

// ── Block 2: Class KPI Strip ──────────────────────────────────────────────────

function ClassKpiStrip({ classId }: { classId: string }) {
  const { data, isLoading, isError } = useClassKpi(classId)

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
      </div>
    )
  }
  if (isError || !data) {
    return <p className="text-sm text-[var(--error)]">Failed to load class stats.</p>
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatTile label="Active students" value={data.active_students} />
      <StatTile
        label="Avg class score"
        // ISSUE-0028: trend sparkline absent v1; static last-score shown.
        value={data.avg_class_score != null ? `${Math.round(data.avg_class_score)}%` : '—'}
      />
      <StatTile label="Sessions this week" value={data.sessions_this_week} />
      <StatTile label="Assignments active" value={data.assignments_active} />
    </div>
  )
}

// ── Block 3: Intervention Alerts ──────────────────────────────────────────────

function InterventionAlertsSection({ classId }: { classId: string }) {
  const { data: alerts, isLoading, isError } = useInterventionAlerts(classId)
  const { mutate: patchAlert, isPending } = useDismissAlert()

  if (isLoading) return <SkeletonCard />
  if (isError) return <p className="text-sm text-[var(--error)]">Failed to load alerts.</p>

  const active = (alerts ?? []).filter((a) => a.status === 'active')

  if (active.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">No interventions needed this week.</p>
    )
  }

  return (
    <ul className="space-y-3" aria-label="Intervention alerts">
      {active.map((alert) => (
        <li
          key={alert.id}
          className="flex items-start justify-between gap-4 rounded-card border border-[var(--warn-500)] bg-[var(--surface)] p-4"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text)] capitalize">
              {alert.alert_type.replace(/_/g, ' ')}
            </p>
            <p className="text-xs text-[var(--muted)] mt-0.5">Severity: {alert.severity}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            <a
              href={`/teacher/students/${alert.student_id}`}
              className="inline-flex items-center h-8 px-3 text-xs font-medium rounded-btn text-[var(--text-2)] hover:bg-[var(--slate-75)] hover:text-[var(--text)] transition-colors"
            >
              Review
            </a>
            <a
              href={`/teacher/assignments/new?target_student=${alert.student_id}`}
              className="inline-flex items-center h-8 px-3 text-xs font-medium rounded-btn text-[var(--text-2)] hover:bg-[var(--slate-75)] hover:text-[var(--text)] transition-colors"
            >
              Assign Work
            </a>
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => patchAlert({ alertId: alert.id, action: 'acknowledge' })}
            >
              Acknowledge
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => patchAlert({ alertId: alert.id, action: 'dismiss' })}
            >
              Dismiss
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── Block 4: Student Performance Table ───────────────────────────────────────

type SortKey = 'display_name' | 'avg_score' | 'mastery_summary' | 'last_session_at'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function StudentPerformanceTable({ classId }: { classId: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('display_name')
  const [sortAsc, setSortAsc] = useState(true)
  const { data, isLoading, isError } = useClassStudents(classId, 1)

  const sorted = useMemo(() => {
    const rows = data?.students ?? []
    return [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av === null || av === undefined) return sortAsc ? 1 : -1
      if (bv === null || bv === undefined) return sortAsc ? -1 : 1
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortAsc ? cmp : -cmp
    })
  }, [data, sortKey, sortAsc])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((p) => !p)
    else { setSortKey(key); setSortAsc(true) }
  }

  function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (sortKey !== key) return 'none'
    return sortAsc ? 'ascending' : 'descending'
  }

  if (isLoading) return <SkeletonCard className="h-48" />
  if (isError) return <p className="text-sm text-[var(--error)]">Failed to load student data.</p>
  if (!data || data.students.length === 0) {
    return (
      <EmptyState
        title="No students yet"
        description="Ask your admin to add students to your class."
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-card border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--slate-50)]">
            {(
              [
                { key: 'display_name', label: 'Student' },
                { key: 'avg_score', label: 'Avg score' },
                { key: 'mastery_summary', label: 'Skills mastered' },
                { key: 'last_session_at', label: 'Last session' },
              ] as { key: SortKey; label: string }[]
            ).map(({ key, label }) => (
              <th
                key={key}
                scope="col"
                aria-sort={ariaSort(key)}
                className="px-4 py-3 text-left font-medium text-[var(--muted)]"
              >
                <button
                  className="hover:text-[var(--text)] transition-colors focus-visible:outline-none focus-visible:shadow-focus"
                  onClick={() => toggleSort(key)}
                >
                  {label}
                </button>
              </th>
            ))}
            <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--muted)]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr
              key={s.id}
              className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--slate-50)] transition-colors"
            >
              <td className="px-4 py-3 font-medium text-[var(--text)]">
                {s.display_name ?? '—'}
              </td>
              <td className="px-4 py-3 text-[var(--text-2)] tabular-nums">
                {s.avg_score != null ? `${Math.round(s.avg_score)}%` : '—'}
              </td>
              <td className="px-4 py-3 text-[var(--text-2)] tabular-nums">
                {s.mastery_summary}
              </td>
              <td className="px-4 py-3 text-[var(--text-2)]">
                {formatDate(s.last_session_at)}
              </td>
              <td className="px-4 py-3">
                <a
                  href={`/teacher/students/${s.id}`}
                  className="text-xs font-medium text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                >
                  View
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Block 5: Topic Mastery (deferred v1.1) ────────────────────────────────────

function TopicMasterySection() {
  return (
    <Card>
      {/* TODO: ISSUE-0027: class-strand mastery endpoint absent — v1.1 */}
      <EmptyState
        title="Topic mastery breakdown"
        description="Available in a future release."
      />
    </Card>
  )
}

// ── Block 6: Assignments Widget ───────────────────────────────────────────────

function AssignmentsWidget({ classId }: { classId: string }) {
  const { data: assignments, isLoading, isError } = useAssignmentsForClass(classId)

  if (isLoading) return <SkeletonCard />
  if (isError) return <p className="text-sm text-[var(--error)]">Failed to load assignments.</p>

  const published = (assignments ?? []).filter(
    (a) => a.status === 'published' && a.archived_at === null,
  )

  if (published.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No active assignments.</p>
  }

  return (
    <ul className="space-y-4" aria-label="Active assignments">
      {published.map((a) => (
        <li key={a.id}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-[var(--text)]">{a.title}</p>
            <a
              href={`/teacher/assignments/${a.id}`}
              className="text-xs font-medium text-[var(--primary)] hover:underline focus-visible:outline-none"
            >
              View
            </a>
          </div>
          {a.due_at && (
            <p className="text-xs text-[var(--muted)] mb-1">
              Due {formatDate(a.due_at)}
            </p>
          )}
          <ProgressBar
            value={0}
            max={100}
            label={`${a.title} completion`}
            variant="brand"
          />
        </li>
      ))}
    </ul>
  )
}

// ── Sidebar nav ───────────────────────────────────────────────────────────────

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
        {/* PHASE-2: Settings deferred v1.1 */}
      </nav>
    </Sidebar>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeacherDashboardPage() {
  const searchParams = useSearchParams()
  const { data: classesData, isLoading: classesLoading } = useMyClasses()

  const classes = classesData?.classes ?? []
  const activeClassId: string =
    searchParams.get('class') ?? classes[0]?.id ?? ''

  if (classesLoading) {
    return (
      <AppShell variant="teacher">
        <div className="flex h-screen">
          <TeacherSidebarNav pathname="/teacher" />
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar>
              <Brand logoSrc="/logo.svg" size="sm" />
            </TopBar>
            <main className="flex-1 overflow-auto p-6 space-y-6">
              {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
            </main>
          </div>
        </div>
      </AppShell>
    )
  }

  if (classes.length === 0) {
    return (
      <AppShell variant="teacher">
        <div className="flex h-screen">
          <TeacherSidebarNav pathname="/teacher" />
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar>
              <Brand logoSrc="/logo.svg" size="sm" />
            </TopBar>
            <main className="flex-1 overflow-auto p-6">
              <EmptyState
                title="No classes yet"
                description="Ask your admin to assign a class to your account."
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
        <TeacherSidebarNav pathname="/teacher" />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar>
            <Brand logoSrc="/logo.svg" size="sm" />
            <ClassSwitcher classes={classes} activeClassId={activeClassId} />
          </TopBar>
          <main className="flex-1 overflow-auto p-6 space-y-8">
            {/* Block 2: KPI strip */}
            <section aria-labelledby="kpi-heading">
              <h2 id="kpi-heading" className="sr-only">Class overview</h2>
              <ClassKpiStrip classId={activeClassId} />
            </section>

            {/* Block 3: Intervention alerts */}
            <section aria-labelledby="alerts-heading">
              <SectionHeading label="Intervention alerts" />
              <InterventionAlertsSection classId={activeClassId} />
            </section>

            {/* Block 4: Student performance table */}
            <section aria-labelledby="students-heading">
              <SectionHeading label="Student performance" />
              <StudentPerformanceTable classId={activeClassId} />
            </section>

            {/* Block 5: Topic mastery (deferred v1.1) */}
            <section aria-labelledby="mastery-heading">
              <SectionHeading label="Topic mastery" />
              <TopicMasterySection />
            </section>

            {/* Block 6: Assignments widget */}
            <section aria-labelledby="assignments-heading">
              <SectionHeading label="Assignments" />
              <AssignmentsWidget classId={activeClassId} />
            </section>
          </main>
        </div>
      </div>
    </AppShell>
  )
}
