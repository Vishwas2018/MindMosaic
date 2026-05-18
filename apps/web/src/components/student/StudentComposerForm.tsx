'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Button, EmptyState, LoadingState } from '@mm/ui'
import { useCreateSession, usePathways } from '@mm/sdk'
import type { SimulationParams } from '@mm/types'
import { STUDENT_COMPOSER_COPY as C } from '@/app/(student)/copy/studentComposer'

// v1.1-S5 (ADR-0039 §Decisions 2–3 + C2 + N1).
// Shared form for /practice (simulationLocked=false) and /exam-sim (simulationLocked=true).
// Internal state field: simulationParams: SimulationParams | null per C2 resolution.
// Cross-field refinement: easy + mid + hard === item_count, cites session.ts:40+47.

// ── Form schema (structural — N1 cross-field refinement, session.ts:40+47) ────

const DifficultyDistributionFormSchema = z.object({
  easy: z.number().int().nonnegative(),
  mid:  z.number().int().nonnegative(),
  hard: z.number().int().nonnegative(),
})

export const ComposerFormSchema = z
  .object({
    pathway_id:             z.string().min(1),
    // item_count: session.ts:35 — z.number().int().min(5).max(80)
    item_count:             z.number().int().min(5).max(80),
    difficulty_distribution: DifficultyDistributionFormSchema,
    // time_limit_ms: session.ts:37 — min 300_000 / max 10_800_000
    time_limit_ms:          z.number().int().min(300_000).max(10_800_000),
  })
  // Cross-field refinements sourced verbatim from session.ts:40+47
  .refine(
    (v) =>
      v.difficulty_distribution.easy +
        v.difficulty_distribution.mid +
        v.difficulty_distribution.hard ===
      v.item_count,
    { message: 'Difficulty counts must sum to number of items', path: ['difficulty_distribution'] },
  )
  .refine(
    (v) =>
      v.difficulty_distribution.easy +
        v.difficulty_distribution.mid +
        v.difficulty_distribution.hard >
      0,
    { message: 'At least one item required across difficulty bands', path: ['difficulty_distribution'] },
  )

export type ComposerFormValues = z.infer<typeof ComposerFormSchema>

// ── Time-limit option set (ADR-0039 §Composer param option sets, session.ts:37) ─

export const TIME_LIMIT_OPTIONS = [
  { label: '5 min',   value: 300_000 },
  { label: '10 min',  value: 600_000 },
  { label: '15 min',  value: 900_000 },
  { label: '30 min',  value: 1_800_000 },
  { label: '45 min',  value: 2_700_000 },
  { label: '60 min',  value: 3_600_000 },
  { label: '90 min',  value: 5_400_000 },
  { label: '120 min', value: 7_200_000 },
  { label: '180 min', value: 10_800_000 },
] as const

// ── Local state helpers ───────────────────────────────────────────────────────

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

function EmptyState_() {
  return (
    <EmptyState
      title={C.states.emptyPathwaysHeading}
      description={C.states.emptyPathwaysDescription}
    />
  )
}

function ErrorState_({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-center space-y-4">
      <EmptyState title={C.states.errorHeading} description="" />
      <Button variant="secondary" size="sm" onClick={onRetry}>
        {C.states.errorRetry}
      </Button>
    </div>
  )
}

function UpgradeState_() {
  return (
    <EmptyState
      title={C.states.upgradeHeading}
      description={C.states.upgradeDescription}
    />
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface StudentComposerFormProps {
  simulationLocked: boolean
}

export function StudentComposerForm({ simulationLocked }: StudentComposerFormProps) {
  const router = useRouter()
  const pathways = usePathways()
  const createSession = useCreateSession()

  const [simulationParams, setSimulationParams] = useState<SimulationParams | null>(
    simulationLocked ? { no_back_nav: true, hide_feedback_until_submit: true } : null,
  )

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ComposerFormValues>({
    resolver: zodResolver(ComposerFormSchema),
    defaultValues: {
      pathway_id: '',
      item_count: 20,
      difficulty_distribution: { easy: 7, mid: 8, hard: 5 },
      time_limit_ms: 3_600_000,
    },
  })

  const itemCount = watch('item_count')
  const timeLimitMs = watch('time_limit_ms')
  const easy = watch('difficulty_distribution.easy')
  const mid = watch('difficulty_distribution.mid')
  const hard = watch('difficulty_distribution.hard')
  const distSum = (easy ?? 0) + (mid ?? 0) + (hard ?? 0)

  const allPathways = pathways.data ?? []
  const availablePathways = allPathways.filter((p) => p.entitled !== false)

  // ── 5-state matrix ────────────────────────────────────────────────────────

  if (pathways.isPending) {
    return <LoadingState />
  }
  if (pathways.isError) {
    return <ErrorState_ onRetry={() => pathways.refetch()} />
  }
  if (!pathways.isError && allPathways.length === 0) {
    return <EmptyState_ />
  }
  if (availablePathways.length === 0) {
    return <UpgradeState_ />
  }

  // ── Content state (form) ──────────────────────────────────────────────────

  const onSubmit: SubmitHandler<ComposerFormValues> = async (values) => {
    const result = await createSession.mutateAsync({
      assessment_profile_id: null,
      repair_sequence_id: null,
      assignment_id: null,
      // §N Trap 2: always 'exam' (LinearEngine) regardless of "Practice Exam" UI copy.
      mode: 'exam',
      target_skills: null,
      pathway_id: values.pathway_id,
      composer_params: {
        item_count: values.item_count,
        difficulty_distribution: values.difficulty_distribution,
        time_limit_ms: values.time_limit_ms,
      },
      simulation_params: simulationParams ?? undefined,
    })
    router.push(`/session/${result.session_id}/exam`)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Compose exam">

      {/* ── Bank Pick ─────────────────────────────────────────── */}
      <SectionDivider label={C.form.bankPickSection} />

      <div>
        <label
          htmlFor="pathway_id"
          className="block text-sm font-medium text-[var(--text)] mb-1"
        >
          {C.form.pathwayLabel}
        </label>
        <select
          id="pathway_id"
          {...register('pathway_id')}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:shadow-focus"
          aria-required="true"
        >
          <option value="">{C.form.pathwayPlaceholder}</option>
          {availablePathways.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
        {errors.pathway_id && (
          <p role="alert" className="text-xs text-[var(--incorrect)] mt-1">
            {C.form.pathwayRequired}
          </p>
        )}
      </div>

      {/* ── Configure ────────────────────────────────────────── */}
      <SectionDivider label={C.form.configureSection} />

      <div className="space-y-5">
        {/* Item count */}
        <div>
          <label
            htmlFor="item_count"
            className="block text-sm font-medium text-[var(--text)] mb-1"
          >
            {C.form.itemCountLabel}
          </label>
          <input
            id="item_count"
            type="number"
            min={5}
            max={80}
            {...register('item_count', { valueAsNumber: true })}
            className="w-28 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:shadow-focus"
            aria-describedby="item_count_hint"
          />
          <p id="item_count_hint" className="text-xs text-[var(--muted)] mt-1">
            {C.form.itemCountHint}
          </p>
          {errors.item_count && (
            <p role="alert" className="text-xs text-[var(--incorrect)] mt-1">
              {errors.item_count.message}
            </p>
          )}
        </div>

        {/* Difficulty distribution */}
        <fieldset>
          <legend className="text-sm font-medium text-[var(--text)] mb-2">
            {C.form.difficultySection}
          </legend>
          <div className="flex items-end gap-4">
            {(
              [
                { key: 'difficulty_distribution.easy' as const, label: C.form.easyLabel },
                { key: 'difficulty_distribution.mid'  as const, label: C.form.midLabel  },
                { key: 'difficulty_distribution.hard' as const, label: C.form.hardLabel },
              ]
            ).map(({ key, label }) => {
              const fieldId = `diff_${key.split('.')[1]}`
              return (
                <div key={key} className="flex flex-col gap-1">
                  <label htmlFor={fieldId} className="text-xs text-[var(--muted)]">
                    {label}
                  </label>
                  <input
                    id={fieldId}
                    type="number"
                    min={0}
                    max={itemCount}
                    {...register(key, { valueAsNumber: true })}
                    className="w-20 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:shadow-focus"
                  />
                </div>
              )
            })}
          </div>
          <p
            className={[
              'text-xs mt-2',
              distSum === itemCount
                ? 'text-[var(--muted)]'
                : 'text-[var(--incorrect)]',
            ].join(' ')}
            aria-live="polite"
          >
            {C.form.difficultyHint} ({distSum} / {itemCount})
          </p>
          {errors.difficulty_distribution && (
            <p role="alert" className="text-xs text-[var(--incorrect)] mt-1">
              {errors.difficulty_distribution.message ?? C.form.diffSumError(itemCount)}
            </p>
          )}
        </fieldset>

        {/* Time limit */}
        <div>
          <label
            htmlFor="time_limit_ms"
            className="block text-sm font-medium text-[var(--text)] mb-1"
          >
            {C.form.timeLimitLabel}
          </label>
          {/* watch/setValue pattern — select returns string, schema expects number */}
          <select
            id="time_limit_ms"
            value={timeLimitMs}
            onChange={(e) => setValue('time_limit_ms', parseInt(e.target.value, 10))}
            className="w-40 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:shadow-focus"
          >
            {TIME_LIMIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Simulation toggle (only when not locked) */}
        {!simulationLocked && (
          <div className="flex items-start gap-3">
            <input
              id="simulation"
              type="checkbox"
              checked={simulationParams !== null}
              onChange={(e) =>
                setSimulationParams(
                  e.target.checked
                    ? { no_back_nav: true, hide_feedback_until_submit: true }
                    : null,
                )
              }
              aria-label={C.form.simulationToggleLabel}
              className="mt-0.5 h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus-visible:outline-none focus-visible:shadow-focus"
            />
            <div>
              <label
                htmlFor="simulation"
                className="text-sm font-medium text-[var(--text)] cursor-pointer"
              >
                {C.form.simulationToggleLabel}
              </label>
              <p className="text-xs text-[var(--muted)] mt-0.5">{C.form.simulationToggleHint}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Start ────────────────────────────────────────────── */}
      <SectionDivider label={C.form.assignSection} />

      <div className="flex flex-col gap-2">
        {createSession.isError && (
          <p role="alert" className="text-sm text-[var(--incorrect)]">
            {C.form.submitError}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={isSubmitting || createSession.isPending}
        >
          {isSubmitting || createSession.isPending
            ? (simulationLocked ? C.examSim.submittingBtn : C.practice.submittingBtn)
            : (simulationLocked ? C.examSim.submitBtn    : C.practice.submitBtn)}
        </Button>
      </div>

    </form>
  )
}
