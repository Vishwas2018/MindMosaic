'use client'
import { useEffect, useRef, useState } from 'react'

// Server-authoritative timer per UI_CONTRACT §5.1.
//
// Resync contract: the page passes `serverRemainingMs` after every
// /respond (and from initial /sessions/{id}/state on mount). The Timer
// resyncs its internal countdown to that value on each change. Between
// syncs, the client decrements via setInterval(1000).
//
// Three visual states:
//   normal: > 5 min
//   warn:   ≤ 5 min
//   danger: ≤ 1 min
//
// aria-live is "polite" on the container; we re-announce ONLY on warn
// + danger transitions (not every second) — see UI_CONTRACT §5.1.

export type TimerState = 'normal' | 'warn' | 'danger' | 'expired'

export interface TimerProps {
  /** Server-authoritative remaining ms; null = no timer (e.g. practice). */
  serverRemainingMs: number | null
  /** Fired exactly once when the client crosses 0. */
  onExpire: () => void
}

const WARN_MS = 5 * 60 * 1000
const DANGER_MS = 60 * 1000

function classify(ms: number | null): TimerState {
  if (ms === null) return 'normal'
  if (ms <= 0) return 'expired'
  if (ms <= DANGER_MS) return 'danger'
  if (ms <= WARN_MS) return 'warn'
  return 'normal'
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const stateClasses: Record<Exclude<TimerState, 'expired'>, string> = {
  normal: 'text-[var(--slate-500)] bg-[var(--slate-50)] border-[var(--slate-100)]',
  warn: 'text-[var(--warn-600)] bg-[var(--warn-50)] border-[var(--warn-200)]',
  danger:
    'text-[var(--incorrect-600)] bg-[var(--incorrect-50)] border-[var(--incorrect-200)]',
}

export function Timer({ serverRemainingMs, onExpire }: TimerProps) {
  const [remaining, setRemaining] = useState<number | null>(serverRemainingMs)
  const expiredRef = useRef(false)

  // Resync on every server response.
  useEffect(() => {
    setRemaining(serverRemainingMs)
    if (serverRemainingMs !== null && serverRemainingMs > 0) {
      expiredRef.current = false
    }
  }, [serverRemainingMs])

  // Tick every second between syncs.
  useEffect(() => {
    if (remaining === null) return
    if (remaining <= 0) {
      if (!expiredRef.current) {
        expiredRef.current = true
        onExpire()
      }
      return
    }
    const interval = setInterval(() => {
      setRemaining((prev) => (prev === null ? prev : Math.max(0, prev - 1000)))
    }, 1000)
    return () => clearInterval(interval)
  }, [remaining, onExpire])

  if (remaining === null) {
    return null
  }

  const state = classify(remaining)
  const visible: Exclude<TimerState, 'expired'> = state === 'expired' ? 'danger' : state
  // Re-announce policy: assertive only at the warn + danger thresholds and
  // at expiry. The container itself is `polite` so the value isn't read
  // every second; the helper span carries the threshold-crossing text.
  let announcement = ''
  if (state === 'warn' && remaining <= WARN_MS && remaining > WARN_MS - 1500) {
    announcement = '5 minutes remaining'
  } else if (state === 'danger' && remaining <= DANGER_MS && remaining > DANGER_MS - 1500) {
    announcement = '1 minute remaining'
  }
  if (state === 'expired' && expiredRef.current) {
    announcement = "Time's up"
  }

  return (
    <div
      role="timer"
      aria-live="polite"
      aria-atomic="true"
      className={`inline-flex items-center gap-2 rounded-pill border px-3 py-1 text-sm font-medium tabular-nums ${stateClasses[visible]}`}
    >
      <span aria-hidden="true">⏱</span>
      <span>{formatMs(remaining)}</span>
      {announcement !== '' && (
        <span className="sr-only" aria-live="assertive">
          {announcement}
        </span>
      )}
    </div>
  )
}
