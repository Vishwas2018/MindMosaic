'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RecordResponseRequest, RecordResponseResponse } from '@mm/types'

// ADR-0030: in-memory offline queue for v1; IndexedDB + service worker
// shell-cache deferred to v1.1 via ISSUE-0009.
//
// Public API mirrors what an IndexedDB-backed implementation would expose
// (enqueue / flush / pendingCount), so the v1.1 swap is a storage-only
// change.

export interface QueuedRespond {
  idempotencyKey: string
  request: RecordResponseRequest
  attempts: number
}

export interface UseResponseQueueArgs {
  /** Mutator that performs the actual /respond call (typically the
   *  `mutateAsync` from `useRecordResponse(sessionId)`). */
  send: (
    request: RecordResponseRequest,
    idempotencyKey: string,
  ) => Promise<RecordResponseResponse>
  /** Called on each successful drain so the page can update server-derived
   *  state (next_item, version, lock_token rotation, progress). */
  onSuccess?: (response: RecordResponseResponse) => void
  /** Called when a drain hits a hard error (e.g. 410 GONE). The page is
   *  expected to show the session-abandoned modal. The queue is paused
   *  until the page drops the offending entry via `dropFront()`. */
  onHardError?: (err: unknown, head: QueuedRespond) => void
  /** Max retries per queued entry on transient (non-409) errors before
   *  bailing. ISSUE-0007 amplification guard — Stage 23 cannot loop on
   *  repeated 409/lock failures. */
  maxAttempts?: number
}

export interface UseResponseQueueReturn {
  enqueue: (request: RecordResponseRequest, idempotencyKey: string) => void
  flush: () => Promise<void>
  dropFront: () => void
  pendingCount: number
  isOnline: boolean
  isFlushing: boolean
}

/**
 * In-memory FIFO queue with `online`/`offline` listener wiring.
 *
 * Non-persistent: page reload during offline = lost queue. Documented in
 * `OfflineBanner` microcopy. Tracked for v1.1 upgrade as ISSUE-0009.
 */
export function useResponseQueue({
  send,
  onSuccess,
  onHardError,
  maxAttempts = 3,
}: UseResponseQueueArgs): UseResponseQueueReturn {
  const queueRef = useRef<QueuedRespond[]>([])
  const flushingRef = useRef(false)
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [pendingCount, setPendingCount] = useState(0)
  const [isFlushing, setIsFlushing] = useState(false)

  const sync = useCallback(() => {
    setPendingCount(queueRef.current.length)
  }, [])

  const flush = useCallback(async () => {
    if (flushingRef.current) return
    if (queueRef.current.length === 0) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    flushingRef.current = true
    setIsFlushing(true)
    try {
      while (queueRef.current.length > 0) {
        const head = queueRef.current[0]
        if (head === undefined) break
        try {
          const response = await send(head.request, head.idempotencyKey)
          // Drain head FIRST so onSuccess sees a consistent queue state.
          queueRef.current.shift()
          sync()
          onSuccess?.(response)
        } catch (err) {
          head.attempts += 1
          const apiErr = err as { status?: number }
          // 410 GONE = hard error; pause the queue and surface to the page.
          if (apiErr.status === 410) {
            onHardError?.(err, head)
            return
          }
          // ISSUE-0007 amplification: bail on too many transient retries
          // rather than spinning. Page-side max-retry guard.
          if (head.attempts >= maxAttempts) {
            onHardError?.(err, head)
            return
          }
          // Transient — bail this drain pass; next online tick or manual
          // flush() will re-attempt.
          return
        }
      }
    } finally {
      flushingRef.current = false
      setIsFlushing(false)
    }
  }, [send, onSuccess, onHardError, maxAttempts, sync])

  const enqueue = useCallback(
    (request: RecordResponseRequest, idempotencyKey: string) => {
      queueRef.current.push({ idempotencyKey, request, attempts: 0 })
      sync()
      // If we're online, opportunistically drain. The flush is
      // re-entrancy-guarded above.
      if (typeof navigator === 'undefined' || navigator.onLine) {
        void flush()
      }
    },
    [flush, sync],
  )

  const dropFront = useCallback(() => {
    queueRef.current.shift()
    sync()
  }, [sync])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onOnline = () => {
      setIsOnline(true)
      void flush()
    }
    const onOffline = () => {
      setIsOnline(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [flush])

  return { enqueue, flush, dropFront, pendingCount, isOnline, isFlushing }
}
