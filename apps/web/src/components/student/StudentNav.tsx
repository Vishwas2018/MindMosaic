'use client'

import Link from 'next/link'
import { STUDENT_COPY } from '@/copy/student'
import { STUDENT_COMPOSER_COPY } from '@/app/(student)/copy/studentComposer'

export type StudentNavActive =
  | 'dashboard'
  | 'assignments'
  | 'results'
  | 'practice'
  | 'exam-sim'

interface StudentNavProps {
  active: StudentNavActive
}

const NAV_ITEMS = [
  { key: 'dashboard' as const,   label: STUDENT_COPY.nav.dashboard,               href: '/dashboard' },
  { key: 'assignments' as const, label: STUDENT_COPY.nav.assignments,              href: '/assignments' },
  { key: 'results' as const,     label: STUDENT_COPY.nav.results,                  href: '/results' },
  { key: 'practice' as const,    label: STUDENT_COMPOSER_COPY.nav.practice,        href: '/practice' },
  { key: 'exam-sim' as const,    label: STUDENT_COMPOSER_COPY.nav.examSim,         href: '/exam-sim' },
]

export function StudentNav({ active }: StudentNavProps) {
  return (
    <nav className="flex items-center gap-1">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={[
            'px-3 py-1.5 rounded-btn text-sm font-medium transition-colors',
            active === item.key
              ? 'text-[var(--primary)] bg-[var(--primary-50)]'
              : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--slate-75)]',
          ].join(' ')}
          aria-current={active === item.key ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
