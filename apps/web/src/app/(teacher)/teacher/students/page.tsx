'use client'

// Screen 19 — Teacher: Students List (/teacher/students). Searchable table.
// Authority: SCREEN_SPECS Screen 19 (SCREEN_SPECS.md:1058–1090).

import { useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  AppShell,
  Brand,
  EmptyState,
  NavLink,
  Sidebar,
  TopBar,
} from '@mm/ui'
import { useClassStudents, useMyClasses } from '@mm/sdk'
import type { ClassGroupDTO, StudentRowDTO } from '@mm/sdk'

// ── shared atoms ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-[var(--border)] animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// ── Class Switcher ────────────────────────────────────────────────────────────

function ClassFilter({
  classes,
  activeClassId,
}: {
  classes: ClassGroupDTO[]
  activeClassId: string
}) {
  const router = useRouter()
  return (
    <select
      aria-label="Filter by class"
      className="text-sm border border-[var(--border)] rounded-field px-3 py-1.5 bg-[var(--field-bg)] text-[var(--text)] focus:outline-none focus:shadow-focus-subtle"
      value={activeClassId}
      onChange={(e) => {
        router.push(`/teacher/students?class=${encodeURIComponent(e.target.value)}`)
      }}
    >
      {classes.map((cls) => (
        <option key={cls.id} value={cls.id}>
          {cls.name}
        </option>
      ))}
    </select>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function TeacherSidebarNav() {
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
          <NavLink key={href} href={href} active={href === '/teacher/students'}>
            {label}
          </NavLink>
        ))}
        {/* PHASE-2: Settings deferred v1.1 */}
      </nav>
    </Sidebar>
  )
}

// ── Students Table ────────────────────────────────────────────────────────────

function StudentsTable({
  students,
  search,
}: {
  students: StudentRowDTO[]
  search: string
}) {
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q
      ? students.filter((s) => s.display_name?.toLowerCase().includes(q))
      : students
  }, [students, search])

  if (filtered.length === 0) {
    return (
      <EmptyState
        title="No students match your filters"
        description="Try adjusting your search or class filter."
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-card border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--slate-50)]">
            <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--muted)]">
              Student
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--muted)]">
              Year
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--muted)]">
              Avg score
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--muted)]">
              Last session
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--muted)]">
              Skills mastered
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--muted)]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => (
            <tr
              key={s.id}
              className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--slate-50)] transition-colors"
            >
              <td className="px-4 py-3 font-medium text-[var(--text)]">
                {s.display_name ?? '—'}
              </td>
              <td className="px-4 py-3 text-[var(--text-2)] tabular-nums">
                {s.year_level ?? '—'}
              </td>
              <td className="px-4 py-3 text-[var(--text-2)] tabular-nums">
                {s.avg_score != null ? `${Math.round(s.avg_score)}%` : '—'}
              </td>
              <td className="px-4 py-3 text-[var(--text-2)]">
                {formatDate(s.last_session_at)}
              </td>
              <td className="px-4 py-3 text-[var(--text-2)] tabular-nums">
                {s.mastery_summary}
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudentsListPage() {
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')

  const { data: classesData, isLoading: classesLoading } = useMyClasses()
  const classes = classesData?.classes ?? []
  const activeClassId: string =
    searchParams.get('class') ?? classes[0]?.id ?? ''

  const { data, isLoading, isError } = useClassStudents(activeClassId, 1)

  const loadingState = classesLoading || isLoading

  return (
    <AppShell variant="teacher">
      <div className="flex h-screen">
        <TeacherSidebarNav />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar>
            <Brand logoSrc="/logo.svg" size="sm" />
          </TopBar>
          <main className="flex-1 overflow-auto p-6">
            <div className="mb-6 flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold text-[var(--text)]">Students</h1>
              {classes.length > 0 && (
                <ClassFilter classes={classes} activeClassId={activeClassId} />
              )}
              <input
                type="search"
                placeholder="Search by name…"
                aria-label="Search students by name"
                className="ml-auto text-sm border border-[var(--border)] rounded-field px-3 py-1.5 bg-[var(--field-bg)] text-[var(--text)] focus:outline-none focus:shadow-focus-subtle w-56"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {isError && (
              <p className="text-sm text-[var(--error)] mb-4">Failed to load students.</p>
            )}

            {loadingState ? (
              <div className="overflow-x-auto rounded-card border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--slate-50)]">
                      {['Student', 'Year', 'Avg score', 'Last session', 'Skills mastered', 'Actions'].map(
                        (h) => (
                          <th
                            key={h}
                            scope="col"
                            className="px-4 py-3 text-left font-medium text-[var(--muted)]"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
                  </tbody>
                </table>
              </div>
            ) : (
              <StudentsTable students={data?.students ?? []} search={search} />
            )}

            {data && (
              <p className="mt-4 text-xs text-[var(--muted)]">
                Showing {Math.min(data.page_size, data.students.length)} of {data.total} students
              </p>
            )}
          </main>
        </div>
      </div>
    </AppShell>
  )
}
