'use client'

interface OfflineBannerProps {
  pendingCount: number
}

export function OfflineBanner({ pendingCount }: OfflineBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--warn-200)] bg-[var(--warn-50)] px-6 py-3 text-sm text-[var(--warn-700)] shadow-md"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <p>
          <span className="font-semibold">Working offline.</span> Your answers are
          saved locally and will sync when you reconnect. Don&apos;t reload this
          page until reconnected.
        </p>
        {pendingCount > 0 && (
          <p className="tabular-nums whitespace-nowrap">
            {pendingCount} answer{pendingCount === 1 ? '' : 's'} queued
          </p>
        )}
      </div>
    </div>
  )
}
