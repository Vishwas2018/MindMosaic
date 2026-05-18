'use client'

// Screen: /teacher/content/new — Exam composer form (v1.1-S4, ADR-0038).
// Single-page form with three section dividers: Bank Pick / Configure / Assign.
// Submits via useCreateAssignment with composer_params + optional simulation_params.
// States matrix (UI_CONTRACT): LoadingState / EmptyState / ErrorState / UpgradeState / Content.
// Authority: ADR-0038 Decision 3 (single-page form with section dividers).

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AppShell,
  Button,
  EmptyState,
} from '@mm/ui'
import { usePathways, useMyClasses, useCreateAssignment } from '@mm/sdk'
import { TeacherSidebarNav } from '../../../../../components/teacher/TeacherSidebarNav'
import { usePathname } from 'next/navigation'
import { EXAM_CONTENT_COPY as C } from '../../../copy/examContent'
import type { PathwayDTO } from '@mm/types'

// ── Section divider ───────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-6">
      <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-[var(--border)]" aria-hidden="true" />
    </div>
  )
}

// ── Form state type ───────────────────────────────────────────────────────────

interface FormState {
  pathway_id: string
  item_count: number
  easy: number
  mid: number
  hard: number
  time_limit_minutes: number
  simulation: boolean
  class_id: string
  due_date: string
}

// ── State components ──────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={C.loadingLabel}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 rounded-card border border-[var(--border)] animate-pulse" />
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

function UpgradeState() {
  return (
    <EmptyState
      title={C.upgradeTitle}
      description={C.upgradeDesc}
    />
  )
}

// ── Composer form (Content state) ─────────────────────────────────────────────

function ComposerForm({
  pathways,
  classesData,
  onSubmit,
  isPending,
  submitError,
}: {
  pathways: PathwayDTO[]
  classesData: { classes: { id: string; name: string }[] } | undefined
  onSubmit: (form: FormState) => void
  isPending: boolean
  submitError: boolean
}) {
  const searchParams = useSearchParams()
  const preselectedPathwayId = searchParams?.get('pathway_id') ?? ''

  const [form, setForm] = useState<FormState>({
    pathway_id: preselectedPathwayId,
    item_count: 20,
    easy: 7,
    mid: 8,
    hard: 5,
    time_limit_minutes: 60,
    simulation: true,
    class_id: '',
    due_date: '',
  })
  const [validationError, setValidationError] = useState<string | null>(null)

  const distSum = form.easy + form.mid + form.hard

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setValidationError(null)
  }

  function validate(): string | null {
    if (!form.pathway_id) return C.pathwayRequired
    if (!form.class_id) return C.classRequired
    if (form.item_count < 5) return C.itemCountMin
    if (form.item_count > 80) return C.itemCountMax
    if (form.time_limit_minutes < 5) return C.timeLimitMin
    if (form.time_limit_minutes > 180) return C.timeLimitMax
    if (distSum !== form.item_count) return C.diffSumError(form.item_count)
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) {
      setValidationError(err)
      return
    }
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label={C.formPageTitle}>

      {/* ── Bank Pick ─────────────────────────────────────────── */}
      <SectionDivider label={C.sectionBankPick} />

      <div className="space-y-4">
        <div>
          <label
            htmlFor="pathway_id"
            className="block text-sm font-medium text-[var(--text)] mb-1"
          >
            {C.pathwayLabel}
          </label>
          <select
            id="pathway_id"
            value={form.pathway_id}
            onChange={(e) => setField('pathway_id', e.target.value)}
            aria-label={C.pathwayAriaLabel}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:shadow-focus"
            required
          >
            <option value="">{C.pathwayPlaceholder}</option>
            {pathways
              .filter((p) => p.entitled !== false)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* ── Configure ────────────────────────────────────────── */}
      <SectionDivider label={C.sectionConfigure} />

      <div className="space-y-5">
        {/* Item count */}
        <div>
          <label
            htmlFor="item_count"
            className="block text-sm font-medium text-[var(--text)] mb-1"
          >
            {C.itemCountFieldLabel}
          </label>
          <input
            id="item_count"
            type="number"
            min={5}
            max={80}
            value={form.item_count}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              if (!isNaN(v)) setField('item_count', v)
            }}
            className="w-28 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:shadow-focus"
            aria-describedby="item_count_hint"
          />
          <p id="item_count_hint" className="text-xs text-[var(--muted)] mt-1">
            {C.itemCountHint}
          </p>
        </div>

        {/* Difficulty distribution */}
        <fieldset>
          <legend className="text-sm font-medium text-[var(--text)] mb-2">
            {C.diffDistLabel}
          </legend>
          <div className="flex items-end gap-4">
            {(
              [
                { key: 'easy', label: C.diffEasyLabel },
                { key: 'mid',  label: C.diffMidLabel  },
                { key: 'hard', label: C.diffHardLabel },
              ] as const
            ).map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <label
                  htmlFor={`diff_${key}`}
                  className="text-xs text-[var(--muted)]"
                >
                  {label}
                </label>
                <input
                  id={`diff_${key}`}
                  type="number"
                  min={0}
                  max={form.item_count}
                  value={form[key]}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!isNaN(v)) setField(key, v)
                  }}
                  className="w-20 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:shadow-focus"
                />
              </div>
            ))}
          </div>
          <p
            className={[
              'text-xs mt-2',
              distSum === form.item_count
                ? 'text-[var(--muted)]'
                : 'text-[var(--incorrect)]',
            ].join(' ')}
            aria-live="polite"
          >
            {C.diffSumHint(distSum, form.item_count)}
          </p>
        </fieldset>

        {/* Time limit */}
        <div>
          <label
            htmlFor="time_limit"
            className="block text-sm font-medium text-[var(--text)] mb-1"
          >
            {C.timeLimitLabel}
          </label>
          <input
            id="time_limit"
            type="number"
            min={5}
            max={180}
            value={form.time_limit_minutes}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              if (!isNaN(v)) setField('time_limit_minutes', v)
            }}
            className="w-28 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:shadow-focus"
            aria-describedby="time_limit_hint"
          />
          <p id="time_limit_hint" className="text-xs text-[var(--muted)] mt-1">
            {C.timeLimitHint}
          </p>
        </div>

        {/* Simulation toggle */}
        <div className="flex items-start gap-3">
          <input
            id="simulation"
            type="checkbox"
            checked={form.simulation}
            onChange={(e) => setField('simulation', e.target.checked)}
            aria-label={C.simulationAriaLabel}
            className="mt-0.5 h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus-visible:outline-none focus-visible:shadow-focus"
          />
          <div>
            <label
              htmlFor="simulation"
              className="text-sm font-medium text-[var(--text)] cursor-pointer"
            >
              {C.simulationLabel}
            </label>
            <p className="text-xs text-[var(--muted)] mt-0.5">{C.simulationDesc}</p>
          </div>
        </div>
      </div>

      {/* ── Assign ───────────────────────────────────────────── */}
      <SectionDivider label={C.sectionAssign} />

      <div className="space-y-4">
        {/* Class selector */}
        <div>
          <label
            htmlFor="class_id"
            className="block text-sm font-medium text-[var(--text)] mb-1"
          >
            {C.classLabel}
          </label>
          <select
            id="class_id"
            value={form.class_id}
            onChange={(e) => setField('class_id', e.target.value)}
            aria-label={C.classAriaLabel}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:shadow-focus"
            required
          >
            <option value="">{C.classPlaceholder}</option>
            {(classesData?.classes ?? []).map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>

        {/* Due date */}
        <div>
          <label
            htmlFor="due_date"
            className="block text-sm font-medium text-[var(--text)] mb-1"
          >
            {C.dueDateLabel}
          </label>
          <input
            id="due_date"
            type="date"
            value={form.due_date}
            onChange={(e) => setField('due_date', e.target.value)}
            aria-label={C.dueDateAriaLabel}
            className="w-48 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:shadow-focus"
          />
        </div>
      </div>

      {/* ── Submit ───────────────────────────────────────────── */}
      <div className="mt-8 flex flex-col gap-2">
        {(validationError ?? (submitError ? C.submitError : null)) && (
          <p
            role="alert"
            className="text-sm text-[var(--incorrect)]"
          >
            {validationError ?? C.submitError}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={isPending}
          aria-label={isPending ? C.submittingLabel : C.submitBtn}
        >
          {isPending ? C.submittingLabel : C.submitBtn}
        </Button>
      </div>

    </form>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewExamPage() {
  const router = useRouter()
  const pathname = usePathname()

  const { data: pathways, isLoading: pathwaysLoading, isError: pathwaysError } = usePathways()
  const { data: classesData, isLoading: classesLoading, isError: classesError } = useMyClasses()
  const { mutate: createAssignment, isPending, isError: submitError, isSuccess } = useCreateAssignment()

  const isLoadingData = pathwaysLoading || classesLoading
  const isDataError = pathwaysError || classesError

  const allPathways = pathways ?? []
  const availablePathways = allPathways.filter((p) => p.entitled !== false)
  const hasNoPathways = !isLoadingData && !isDataError && allPathways.length === 0
  const allPathwaysLocked = !isLoadingData && !isDataError && allPathways.length > 0 && availablePathways.length === 0

  function handleSubmit(form: FormState) {
    const pathway = availablePathways.find((p) => p.id === form.pathway_id)
    createAssignment({
      title: `Exam — ${pathway?.display_name ?? 'Pathway'}`,
      mode: 'exam',
      pathway_id: form.pathway_id,
      target_skill_ids: [],
      item_count: form.item_count,
      time_limit_ms: form.time_limit_minutes * 60 * 1000,
      due_at: form.due_date ? new Date(form.due_date).toISOString() : undefined,
      targets: [{ type: 'class', id: form.class_id }],
      composer_params: {
        item_count: form.item_count,
        difficulty_distribution: { easy: form.easy, mid: form.mid, hard: form.hard },
        time_limit_ms: form.time_limit_minutes * 60 * 1000,
      },
      simulation_params: form.simulation
        ? { no_back_nav: true, hide_feedback_until_submit: true }
        : undefined,
    })
  }

  function renderContent() {
    if (isLoadingData) return <LoadingState />
    if (isDataError) return <ErrorState />
    if (hasNoPathways) return <EmptyState_ />
    if (allPathwaysLocked) return <UpgradeState />
    return (
      <ComposerForm
        pathways={availablePathways}
        classesData={classesData}
        onSubmit={handleSubmit}
        isPending={isPending}
        submitError={submitError}
      />
    )
  }

  return (
    <AppShell variant="teacher">
      <div className="flex h-screen">
        <TeacherSidebarNav pathname={pathname ?? ''} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="px-6 lg:px-8 py-3 border-b border-[var(--border)] flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="text-sm text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:shadow-focus"
              aria-label={C.breadcrumbBack}
            >
              {C.breadcrumbBack}
            </button>
            <span className="text-[var(--muted)]" aria-hidden="true">{'·'}</span>
            <span className="text-sm font-semibold text-[var(--text)]">{C.formPageTitle}</span>
          </div>

          <main className="flex-1 overflow-auto px-6 lg:px-8 py-6 max-w-2xl">
            {isSuccess ? (
              <div>
                <EmptyState
                  title={C.successTitle}
                  description={C.successDesc}
                />
                <div className="mt-6 flex justify-center">
                  <Button variant="primary" size="sm" onClick={() => router.push('/teacher/assignments')}>
                    {C.viewAssignmentsBtn}
                  </Button>
                </div>
              </div>
            ) : (
              renderContent()
            )}
          </main>
        </div>
      </div>
    </AppShell>
  )
}
