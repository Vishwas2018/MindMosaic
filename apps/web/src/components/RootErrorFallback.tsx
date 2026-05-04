'use client'

export function RootErrorFallback() {
  return (
    <div
      role="alert"
      className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <p className="text-base font-medium text-[var(--text)]">Something went wrong.</p>
      <p className="text-sm text-[var(--muted)]">
        Refresh the page or contact support if the problem persists.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 text-sm font-medium text-[var(--primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2"
      >
        Reload
      </button>
    </div>
  )
}
