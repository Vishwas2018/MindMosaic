'use client'

// v1.1-S5 — /exam-sim entry page (ADR-0039 §Decision 1 + §Decision 2).
// Thin wrapper: renders <StudentComposerForm simulationLocked={true} />.
// Shell: AppShell variant="student-parent" + StudentNav active="exam-sim".
// Redirects to /session/[id]/exam on submit (no new session-running surface — §N Trap 1).
// SCREEN_SPECS gap: this ADR-0039 + Checkpoint A sketch = de-facto spec.

import Link from 'next/link'
import { AppShell, Bell, PageHeader, TopBar } from '@mm/ui'
import { useMyNotifications } from '@mm/sdk'
import { StudentNav } from '@/components/student/StudentNav'
import { StudentComposerForm } from '@/components/student/StudentComposerForm'
import { STUDENT_COMPOSER_COPY as C } from '../copy/studentComposer'

export default function ExamSimPage() {
  const notifications = useMyNotifications(true)

  return (
    <AppShell variant="student-parent">
      <TopBar>
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-base font-bold text-[var(--primary)]">MindMosaic</span>
        </Link>
        <div className="flex-1" />
        <StudentNav active="exam-sim" />
        <Bell
          unreadCount={notifications.data?.length ?? 0}
          onClick={() => {/* notification panel v1.1 */}}
        />
      </TopBar>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <PageHeader
          title={C.examSim.pageTitle}
          subtitle={C.examSim.pageDescription}
        />
        <div className="mt-6">
          <StudentComposerForm simulationLocked={true} />
        </div>
      </main>
    </AppShell>
  )
}
