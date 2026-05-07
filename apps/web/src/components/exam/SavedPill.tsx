'use client'
import { useEffect, useState } from 'react'

interface SavedPillProps {
  /** Increments each time a checkpoint successfully lands. The pill fades
   *  in on a fresh value and out 1500ms later. */
  saveTick: number
  /** When true, the pill suppresses itself (offline + queued state takes
   *  visual precedence via the OfflineBanner). */
  suppressed: boolean
}

export function SavedPill({ saveTick, suppressed }: SavedPillProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (saveTick === 0) return
    setVisible(true)
    const timeout = setTimeout(() => setVisible(false), 1500)
    return () => clearTimeout(timeout)
  }, [saveTick])

  if (suppressed) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none inline-flex items-center gap-1 rounded-pill bg-[var(--correct-50)] px-2 py-0.5 text-xs font-medium text-[var(--correct-700)] transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {visible && <span aria-hidden="true">✓</span>}
      {visible && 'Saved'}
    </div>
  )
}
