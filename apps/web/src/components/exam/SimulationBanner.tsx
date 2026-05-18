'use client'

import { STUDENT_COMPOSER_COPY } from '@/app/(student)/copy/studentComposer'

// v1.1-S5 (ADR-0039 §Decision 5 + Q-1.1-5.5).
// Rendered on /session/[id]/exam when state.is_simulation === true.
// Placement: below FocusHeader, outside QuestionMap focus trap (N2 carry).
// role="status" so screen readers announce on mount without interrupting flow.

export function SimulationBanner(): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-amber-50 border-b border-amber-200 px-6 py-2"
    >
      <p className="text-sm font-medium text-amber-900 text-center">
        {STUDENT_COMPOSER_COPY.simulationBannerText}
      </p>
    </div>
  )
}
