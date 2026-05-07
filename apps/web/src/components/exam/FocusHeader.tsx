'use client'
import type { ReactNode } from 'react'
import { Brand, IconButton, TopBar } from '@mm/ui'

interface FocusHeaderProps {
  /** Centre slot — typically the Timer. */
  centre?: ReactNode
  /** Right-of-centre helper — typically the SavedPill. */
  helper?: ReactNode
  onExit: () => void
}

// FocusHeader — UI_CONTRACT §5.1 explicit chrome for the Exam Engine.
// Logo (left) · timer (centre) · saved-pill + exit (right).
export function FocusHeader({ centre, helper, onExit }: FocusHeaderProps) {
  return (
    <TopBar>
      <Brand logoSrc="/logo.svg" size="sm" />
      <div className="ml-auto flex items-center gap-3">
        {centre}
        {helper}
        <IconButton
          label="Exit session"
          icon={<span aria-hidden="true">×</span>}
          onClick={onExit}
        />
      </div>
    </TopBar>
  )
}
