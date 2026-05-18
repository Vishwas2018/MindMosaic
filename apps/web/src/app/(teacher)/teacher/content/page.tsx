'use client'

// Screen: /teacher/content — Bank browser page (v1.1-S4, ADR-0038).
// T5 layout: sidebar (with Exam Content nav entry) → header (New Exam Assignment btn)
// → pathway list (pathway name + item count).
// States matrix (UI_CONTRACT): LoadingState / EmptyState / ErrorState / UpgradeState / PathwayGrid.
// Authority: ADR-0038 Decision 2 + 5 (two routes; pathway-level browse via usePathways()).

import { usePathname, useRouter } from 'next/navigation'
import {
  AppShell,
  Button,
  Card,
  EmptyState,
  TopBar,
} from '@mm/ui'
import { usePathways } from '@mm/sdk'
import type { PathwayDTO } from '@mm/types'
import { EXAM_CONTENT_COPY as C } from '../../copy/examContent'
import { TeacherSidebarNav } from '../../../../components/teacher/TeacherSidebarNav'

// ── State components ──────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="space-y-3" aria-label={C.loadingLabel} aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-busy="true"
          aria-label="Loading"
          className="rounded-card border border-[var(--border)] bg-[var(--surface)] animate-pulse h-16"
        />
      ))}
    </div>
  )
}

function ErrorState() {
  return <EmptyState title={C.loadErrorTitle} description={C.loadError} />
}

function EmptyState_() {
  return <EmptyState title={C.emptyTitle} description={C.emptyDesc} />
}

function UpgradeState({ lockedList }: { lockedList: PathwayDTO[] }) {
  return (
    <section aria-label="Upgrade required pathways">
      <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">
        {C.upgradeTitle}
      </p>
      <div className="space-y-3 opacity-60 pointer-events-none">
        {lockedList.map((p) => (
          <Card key={p.id} className="p-4 flex items-center gap-5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text)] truncate">
                {p.display_name}
              </p>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                {C.upgradeDesc}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}

function PathwayGrid({
  availableList,
  lockedList,
  onSelect,
}: {
  availableList: PathwayDTO[]
  lockedList: PathwayDTO[]
  onSelect: (id: string) => void
}) {
  return (
    <div className="space-y-6">
      {availableList.length > 0 && (
        <section aria-label="Available pathways">
          <div className="space-y-3">
            {availableList.map((p) => (
              <Card key={p.id} className="p-4 flex items-center gap-5 hover:shadow-elevated transition-shadow">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)] truncate">
                    {p.display_name}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    {p.exam_family} · {p.program}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onSelect(p.id)}
                  aria-label={C.selectPathwayAriaLabel(p.display_name)}
                >
                  {C.newExamBtn}
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}
      {lockedList.length > 0 && (
        <UpgradeState lockedList={lockedList} />
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExamContentPage() {
  const router = useRouter()
  const pathname = usePathname()

  const { data: pathways, isLoading, isError } = usePathways()

  const list = pathways ?? []
  const lockedList = list.filter((p) => p.entitled === false)
  const availableList = list.filter((p) => p.entitled !== false)

  function handleSelectPathway(pathwayId: string) {
    router.push(`/teacher/content/new?pathway_id=${encodeURIComponent(pathwayId)}`)
  }

  function renderContent() {
    if (isLoading) return <LoadingState />
    if (isError) return <ErrorState />
    if (list.length === 0) return <EmptyState_ />
    if (availableList.length === 0) return <UpgradeState lockedList={lockedList} />
    return (
      <PathwayGrid
        availableList={availableList}
        lockedList={lockedList}
        onSelect={handleSelectPathway}
      />
    )
  }

  return (
    <AppShell variant="teacher">
      <div className="flex h-screen">
        <TeacherSidebarNav pathname={pathname ?? ''} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar>
            <div className="flex items-center justify-between w-full">
              <h1 className="text-[15px] font-semibold text-[var(--text)]">{C.heading}</h1>
              <Button
                variant="primary"
                size="sm"
                onClick={() => router.push('/teacher/content/new')}
              >
                {C.newExamBtn}
              </Button>
            </div>
          </TopBar>

          <main className="flex-1 overflow-auto px-6 lg:px-8 py-6">
            {renderContent()}
          </main>
        </div>
      </div>
    </AppShell>
  )
}
