'use client'
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AppShell,
  Button,
  Card,
  Dialog,
  FocusHeader,
  QuestionMap,
  useToast,
} from '@mm/ui'
import type { QuestionMapItem, QuestionStatus } from '@mm/ui'
import {
  useCheckpoint,
  useRecordResponse,
  useSessionState,
  useSubmitSession,
} from '@mm/sdk'
import type { ItemDTO, RecordResponseRequest, RecordResponseResponse } from '@mm/types'
import { OfflineBanner } from '@/components/exam/OfflineBanner'
import { SavedPill } from '@/components/exam/SavedPill'
import { Timer } from '@/components/exam/Timer'
import { useResponseQueue } from '@/components/exam/useResponseQueue'

// Stage 23 — Exam Engine. UI_CONTRACT §5.1, SCREEN_SPECS §9.
// ADR-0030 in-memory offline queue. Q-23.1..5 §2A resolutions baked in.
//
// UI-DIVERGENCE list (logged at evening ritual):
//   - In-memory queue vs IndexedDB (ADR-0030 / ISSUE-0009).
//   - No service worker (ADR-0030 / ISSUE-0009).
//   - No adaptive section banner (Q-23.4 / ISSUE-0010).
//   - Question map enforces forward-only nav (Q-23.4); free back-jump
//     for linear sessions returns when ISSUE-0010 lands.

type ModalKind =
  | 'version-conflict'
  | 'lock-expired'
  | 'session-abandoned'
  | 'submit-confirm'
  | 'exit-confirm'
  | null

interface AnswerRecord {
  itemId: string
  sequenceNumber: number
  responseData: Record<string, unknown>
}

const AUTOSAVE_INTERVAL_MS = 30_000

function readPlainText(rec: Record<string, unknown> | null | undefined): string {
  if (rec === null || rec === undefined) return ''
  const value = rec['value']
  if (typeof value === 'string') return value
  const text = rec['text']
  if (typeof text === 'string') return text
  return ''
}

function readOptions(config: Record<string, unknown>): string[] {
  const options = config['options']
  if (Array.isArray(options) && options.every((o) => typeof o === 'string')) {
    return options as string[]
  }
  return []
}

interface QuestionDisplayProps {
  item: ItemDTO
  selected: string | null
  flagged: boolean
  disabled: boolean
  questionHeadingRef: React.RefObject<HTMLHeadingElement>
  onSelect: (choice: string) => void
  onBlurOption: () => void
  onToggleFlag: () => void
}

function QuestionDisplay({
  item,
  selected,
  flagged,
  disabled,
  questionHeadingRef,
  onSelect,
  onBlurOption,
  onToggleFlag,
}: QuestionDisplayProps) {
  const stemText = readPlainText(item.stem)
  const stimulusText =
    item.stimulus !== null ? readPlainText(item.stimulus.content) : ''
  const options = readOptions(item.response_config)
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <h1
          ref={questionHeadingRef}
          tabIndex={-1}
          className="text-xl font-semibold text-[var(--text)]"
        >
          {stemText !== '' ? stemText : `Question ${item.sequence_number + 1}`}
        </h1>
        <button
          type="button"
          aria-pressed={flagged}
          aria-label={flagged ? 'Unflag this question' : 'Flag this question'}
          onClick={onToggleFlag}
          className={
            'inline-flex h-9 w-9 items-center justify-center rounded-btn border text-sm transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus ' +
            (flagged
              ? 'border-[var(--warn-200)] bg-[var(--warn-50)] text-[var(--warn-700)]'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--slate-75)]')
          }
        >
          <span aria-hidden="true">⚑</span>
        </button>
      </div>
      {stimulusText !== '' && (
        <div className="mt-3 rounded-card bg-[var(--slate-75)] p-4 text-sm text-[var(--text-2)]">
          {stimulusText}
        </div>
      )}
      <div className="mt-6">
        {options.length > 0 ? (
          <div role="radiogroup" aria-labelledby={undefined} className="space-y-2">
            {options.map((option, idx) => {
              const checked = selected === option
              return (
                <label
                  key={`${item.item_id}-${idx}`}
                  className={
                    'flex items-center gap-3 rounded-card border p-3 text-sm cursor-pointer transition-colors duration-fast ' +
                    (checked
                      ? 'border-[var(--primary)] bg-[var(--primary-50)]'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--slate-75)]')
                  }
                >
                  <input
                    type="radio"
                    name={`q-${item.item_id}`}
                    value={option}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onSelect(option)}
                    onBlur={onBlurOption}
                    className="h-4 w-4 accent-[var(--primary)] focus-visible:outline-none focus-visible:shadow-focus"
                  />
                  <span className="text-[var(--text)]">{option}</span>
                </label>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            This question type is not yet supported in v1 exam.
          </p>
        )}
      </div>
    </Card>
  )
}

export default function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params)
  const router = useRouter()
  const toast = useToast()

  const sessionState = useSessionState(sessionId)
  const { updateLockToken: seedRespondLockToken, ...recordResponse } = useRecordResponse(sessionId)
  const submitSession = useSubmitSession(sessionId)
  const { updateLockToken: seedCheckpointLockToken, ...checkpoint } = useCheckpoint(sessionId)

  const [currentItem, setCurrentItem] = useState<ItemDTO | null>(null)
  const [version, setVersion] = useState<number>(0)
  const [serverRemainingMs, setServerRemainingMs] = useState<number | null>(null)
  const [progressTotal, setProgressTotal] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalKind>(null)
  const [saveTick, setSaveTick] = useState(0)

  // Per-item state held in refs so navigation doesn't churn render order.
  const answersRef = useRef<Map<string, AnswerRecord>>(new Map())
  const flagsRef = useRef<Map<string, boolean>>(new Map())
  const checkpointCounterRef = useRef(0)
  const questionHeadingRef = useRef<HTMLHeadingElement>(null)

  // Hydrate the working item on mount or when state refetches with no
  // local item.
  useEffect(() => {
    if (sessionState.data && currentItem === null) {
      const data = sessionState.data
      // Mode guard: only exam / adaptive sessions belong on this page.
      if (!['exam', 'adaptive'].includes(data.mode)) {
        router.push(`/session/${sessionId}/practice`)
        return
      }
      setCurrentItem(data.current_item)
      setVersion(data.version)
      setServerRemainingMs(data.progress.time_remaining_ms)
      setProgressTotal(data.progress.total)
    }
  }, [sessionState.data, currentItem, sessionId, router])

  // ADR-0026: seed / re-seed lock_token whenever session state arrives or
  // refreshes (version-conflict + lock-expired recovery paths).
  useEffect(() => {
    if (sessionState.data) {
      seedRespondLockToken(sessionState.data.lock_token)
      seedCheckpointLockToken(sessionState.data.lock_token)
    }
  }, [sessionState.data, seedRespondLockToken, seedCheckpointLockToken])

  // Move focus to the question heading on each transition.
  const currentItemId = currentItem?.item_id ?? null
  useEffect(() => {
    if (currentItemId !== null) {
      questionHeadingRef.current?.focus()
    }
  }, [currentItemId])

  // ── Response-queue wiring ─────────────────────────────────────────────
  const handleResponseSuccess = useCallback(
    (response: RecordResponseResponse) => {
      setVersion(response.version)
      setServerRemainingMs(response.progress.time_remaining_ms)
      if (response.termination !== null || response.next_item === null) {
        // Engine indicates session is over — submit unconditionally.
        submitSession.mutate(undefined, {
          onSuccess: (s) => router.push(`/results/${s.session_id}`),
          onError: () => {
            toast.addToast({
              title: 'Could not end session',
              description: 'Please try again.',
              variant: 'error',
            })
          },
        })
        return
      }
      setCurrentItem(response.next_item)
      setSelected(null)
    },
    [submitSession, router, toast],
  )

  const handleResponseHardError = useCallback(
    (err: unknown) => {
      const apiErr = err as { status?: number }
      if (apiErr.status === 410) {
        setModal('session-abandoned')
        return
      }
      // Any other repeated failure (incl. 409 max-attempts) — surface the
      // version-conflict modal so the user can refresh state.
      setModal('version-conflict')
    },
    [],
  )

  const queue = useResponseQueue({
    // SDK's useRecordResponse manages its own idempotency key per-mount; the
    // queue's `_idempotencyKey` parameter will become load-bearing when
    // ISSUE-0007 lands the lock-token plumbing + per-attempt key passing.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    send: (request, _idempotencyKey) =>
      recordResponse.mutateAsync(request) as Promise<RecordResponseResponse>,
    onSuccess: handleResponseSuccess,
    onHardError: handleResponseHardError,
    maxAttempts: 3,
  })

  // ── Submit a response ────────────────────────────────────────────────
  const itemStartRef = useRef<number>(Date.now())
  const sessionStartRef = useRef<number>(Date.now())
  const itemsAnsweredRef = useRef<number>(0)

  function handleSubmitResponse(opts: { skip: boolean }) {
    if (currentItem === null) return
    const now = Date.now()
    const responseData = opts.skip ? {} : { choice: selected }
    // Persist locally so cumulative checkpoints + question map both see it.
    answersRef.current.set(currentItem.item_id, {
      itemId: currentItem.item_id,
      sequenceNumber: currentItem.sequence_number,
      responseData,
    })
    const request: RecordResponseRequest = {
      item_id: currentItem.item_id,
      response_data: responseData,
      telemetry: {
        time_to_answer_ms: Math.max(0, now - itemStartRef.current),
        time_to_first_action_ms: Math.max(0, now - itemStartRef.current),
        answer_changes: 0,
        items_since_session_start: itemsAnsweredRef.current,
        time_since_session_start_ms: Math.max(0, now - sessionStartRef.current),
        skipped_then_returned: false,
        scroll_to_bottom: null,
      },
      expected_version: version,
    }
    itemsAnsweredRef.current += 1
    itemStartRef.current = Date.now()
    // Always go through the queue so offline + online paths share one code path.
    queue.enqueue(request, crypto.randomUUID())
  }

  // ── Autosave (Q-23.1: useCheckpoint) ─────────────────────────────────
  const performCheckpoint = useCallback(() => {
    if (currentItem === null) return
    if (answersRef.current.size === 0) return
    const checkpointNumber = ++checkpointCounterRef.current
    const cumulative = Array.from(answersRef.current.values())
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
      .map((rec) => ({
        item_id: rec.itemId,
        sequence_number: rec.sequenceNumber,
        response_data: rec.responseData,
      }))
    checkpoint.mutate(
      {
        checkpoint_number: checkpointNumber,
        current_question_index: currentItem.sequence_number,
        answers: cumulative,
        client_timestamp: new Date().toISOString(),
      },
      {
        onSuccess: () => setSaveTick((t) => t + 1),
        onError: (err) => {
          // Fire-and-forget per UI_CONTRACT §5.1. Log only.
          // eslint-disable-next-line no-console
          console.warn('autosave failed', err)
        },
      },
    )
  }, [checkpoint, currentItem])

  useEffect(() => {
    const interval = setInterval(performCheckpoint, AUTOSAVE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [performCheckpoint])

  // Autosave on tab/window blur (covers the user switching apps mid-exam).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onBlur = () => performCheckpoint()
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [performCheckpoint])

  // ── Question map ─────────────────────────────────────────────────────
  const questionMapItems: QuestionMapItem[] = useMemo(() => {
    void saveTick // invalidation pin (answersRef + flagsRef are refs, not state)
    if (currentItem === null) return []
    const total = progressTotal ?? Math.max(answersRef.current.size + 1, 1)
    return Array.from({ length: total }, (_, i) => {
      // Status derivation. Stage 23 ships forward-nav block per Q-23.4
      // (cross-testlet jump info lands in v1.1 via ISSUE-0010).
      let status: QuestionStatus
      const itemAtIndex = Array.from(answersRef.current.values()).find(
        (a) => a.sequenceNumber === i,
      )
      if (i === currentItem.sequence_number) status = 'current'
      else if (itemAtIndex !== undefined) {
        const flagged = flagsRef.current.get(itemAtIndex.itemId) === true
        status = flagged ? 'flagged' : 'answered'
      } else {
        status = 'unanswered'
      }
      return {
        number: i + 1,
        sequenceNumber: i,
        status,
        // Forward-only nav: cells before current are revisitable on the
        // backend, but Q-23.4 = no client-side back-jump in v1 (block
        // anything that's not strictly ahead-of-current and not the
        // current cell). Future cells past current are always disabled.
        disabled: i !== currentItem.sequence_number,
      }
    })
  }, [currentItem, progressTotal, saveTick])

  const handleJump = useCallback(() => {
    // Q-23.4: forward-nav block; jumps are disabled in v1. The handler
    // is wired so future stages can lift the restriction without touching
    // the QuestionMap consumer.
  }, [])

  // ── Submit / exit ────────────────────────────────────────────────────
  // saveTick pins the recompute to the latest answer/flag mutation since
  // answersRef is a ref (not state) and otherwise wouldn't trigger memo
  // invalidation. Reading it here keeps the linter satisfied without
  // promoting answersRef to state.
  const unansweredCount = useMemo(() => {
    void saveTick
    if (progressTotal === null || currentItem === null) return 0
    return Math.max(0, progressTotal - answersRef.current.size)
  }, [progressTotal, currentItem, saveTick])

  function handleSubmitConfirm() {
    setModal(null)
    submitSession.mutate(undefined, {
      onSuccess: (s) => router.push(`/results/${s.session_id}`),
      onError: (err) => {
        const apiErr = err as { status?: number }
        if (apiErr.status === 409) {
          // Server already terminated — go to results regardless.
          router.push(`/results/${sessionId}`)
          return
        }
        toast.addToast({
          title: 'Could not end session',
          description: 'Please try again.',
          variant: 'error',
        })
      },
    })
  }

  const handleTimerExpire = useCallback(() => {
    submitSession.mutate(undefined, {
      onSuccess: (s) => router.push(`/results/${s.session_id}`),
      onError: (err) => {
        const apiErr = err as { status?: number }
        if (apiErr.status === 409) {
          router.push(`/results/${sessionId}`)
        }
        // If offline at expiry, useResponseQueue holds responses; the
        // submit will retry on reconnect via the standard mutation
        // toast/error path above.
      },
    })
  }, [submitSession, router, sessionId])

  // ── Render ───────────────────────────────────────────────────────────
  if (sessionState.isPending) {
    return (
      <AppShell variant="focus">
        <FocusHeader onExit={() => router.push('/dashboard')} />
        <main className="max-w-5xl mx-auto px-6 py-8">
          <div
            role="status"
            aria-label="Loading session"
            className="h-64 rounded-card border border-[var(--border)] bg-[var(--surface)] animate-pulse"
          />
        </main>
      </AppShell>
    )
  }

  if (sessionState.isError || currentItem === null) {
    return (
      <AppShell variant="focus">
        <FocusHeader onExit={() => router.push('/dashboard')} />
        <main className="max-w-5xl mx-auto px-6 py-8">
          <Card>
            <h1 className="text-base font-semibold text-[var(--text)]">
              Could not load session
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Something went wrong. Try again.
            </p>
            <div className="mt-4">
              <Button variant="secondary" onClick={() => void sessionState.refetch()}>
                Try again
              </Button>
            </div>
          </Card>
        </main>
      </AppShell>
    )
  }

  return (
    <AppShell variant="focus">
      <a
        href="#exam-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-btn focus:bg-[var(--primary)] focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to main content
      </a>
      <FocusHeader
        centre={
          <Timer
            serverRemainingMs={serverRemainingMs}
            onExpire={handleTimerExpire}
          />
        }
        helper={<SavedPill saveTick={saveTick} suppressed={!queue.isOnline} />}
        onExit={() => setModal('exit-confirm')}
      />

      <main
        id="exam-main"
        className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6"
      >
        <QuestionMap items={questionMapItems} onJump={handleJump} className="lg:sticky lg:top-20" />

        <section className="space-y-4">
          <p className="text-xs text-[var(--muted)]">
            Question {currentItem.sequence_number + 1}
            {progressTotal !== null ? ` of ${progressTotal}` : ''}
          </p>

          <QuestionDisplay
            item={currentItem}
            selected={selected}
            flagged={flagsRef.current.get(currentItem.item_id) === true}
            disabled={recordResponse.isPending || queue.isFlushing}
            questionHeadingRef={questionHeadingRef}
            onSelect={setSelected}
            onBlurOption={performCheckpoint}
            onToggleFlag={() => {
              if (currentItem === null) return
              flagsRef.current.set(
                currentItem.item_id,
                !(flagsRef.current.get(currentItem.item_id) === true),
              )
              setSaveTick((t) => t + 1) // trigger map re-render
            }}
          />

          <div className="flex flex-wrap items-center gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => handleSubmitResponse({ skip: true })}
              disabled={recordResponse.isPending || queue.isFlushing}
            >
              Skip
            </Button>
            <Button
              variant="primary"
              onClick={() => handleSubmitResponse({ skip: false })}
              disabled={selected === null || recordResponse.isPending || queue.isFlushing}
              loading={recordResponse.isPending || queue.isFlushing}
            >
              Submit answer
            </Button>
            <Button
              variant="submit"
              onClick={() => setModal('submit-confirm')}
              loading={submitSession.isPending}
            >
              End session
            </Button>
          </div>
        </section>
      </main>

      {!queue.isOnline && <OfflineBanner pendingCount={queue.pendingCount} />}

      <Dialog
        open={modal === 'submit-confirm'}
        onOpenChange={(o) => !o && setModal(null)}
        title="End this session?"
        description={
          unansweredCount > 0
            ? `You have ${unansweredCount} unanswered question${unansweredCount === 1 ? '' : 's'}. Submit anyway?`
            : 'You can review your answers on the results page.'
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setModal(null)}>
            Keep working
          </Button>
          <Button variant="submit" onClick={handleSubmitConfirm} loading={submitSession.isPending}>
            Submit
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={modal === 'exit-confirm'}
        onOpenChange={(o) => !o && setModal(null)}
        title="Leave the exam?"
        description="Your progress is autosaved. You can resume from where you left off."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setModal(null)}>
            Stay
          </Button>
          <Button variant="primary" onClick={() => router.push('/dashboard')}>
            Leave
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={modal === 'version-conflict'}
        onOpenChange={(o) => !o && setModal(null)}
        title="Your session was updated"
        description="We need to refresh this question before you continue."
      >
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={() => {
              setModal(null)
              void sessionState.refetch()
              setCurrentItem(null) // reinit from refetched state
              setSelected(null)
              queue.dropFront()
            }}
          >
            Refresh
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={modal === 'lock-expired'}
        onOpenChange={(o) => !o && setModal(null)}
        title="Your session lock expired"
        description="Click below to reclaim and continue."
      >
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={() => {
              setModal(null)
              void sessionState.refetch()
              setCurrentItem(null)
              queue.dropFront()
            }}
          >
            Reclaim
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={modal === 'session-abandoned'}
        onOpenChange={(o) => !o && setModal(null)}
        title="This session has ended"
        description="It was ended on another device or has been abandoned."
      >
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={() => router.push('/session-selection')}
          >
            Back to selection
          </Button>
        </div>
      </Dialog>
    </AppShell>
  )
}
