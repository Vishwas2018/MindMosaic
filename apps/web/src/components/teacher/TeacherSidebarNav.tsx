'use client'

import { Brand, NavLink, Sidebar } from '@mm/ui'

const NAV = [
  { href: '/teacher', label: 'Overview' },
  { href: '/teacher/students', label: 'Students' },
  { href: '/teacher/assignments', label: 'Assignments' },
  { href: '/teacher/content', label: 'Exam Content' },
  { href: '/teacher/analytics', label: 'Analytics' },
]

export function TeacherSidebarNav({ pathname }: { pathname: string }) {
  return (
    <Sidebar variant="teacher">
      <div className="p-4 border-b border-[var(--border)]">
        <Brand logoSrc="/logo.svg" size="sm" />
      </div>
      <nav className="flex-1 px-2 py-4 space-y-0.5" aria-label="Teacher navigation">
        {NAV.map(({ href, label }) => (
          <NavLink
            key={href}
            href={href}
            active={pathname.startsWith(href) && (href !== '/teacher' || pathname === '/teacher')}
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </Sidebar>
  )
}
