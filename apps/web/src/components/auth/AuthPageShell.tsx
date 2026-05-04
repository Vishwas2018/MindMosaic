import type { ReactNode } from 'react'
import { Brand } from '@mm/ui'

interface AuthPageShellProps {
  children: ReactNode
  heading: string
  subheading?: string
}

export function AuthPageShell({ children, heading, subheading }: AuthPageShellProps) {
  return (
    <div className="min-h-screen flex">
      {/* Form panel */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-16 xl:px-24 bg-white">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Brand size="md" />
          </div>
          <h1 className="text-2xl font-extrabold text-[var(--brand-text-deep)] mb-1 leading-tight">
            {heading}
          </h1>
          {subheading && (
            <p className="text-sm text-[var(--muted)] mb-8">{subheading}</p>
          )}
          {!subheading && <div className="mb-8" />}
          {children}
        </div>
      </div>

      {/* Brand panel — hidden on mobile */}
      <div
        className="hidden lg:flex lg:w-[440px] xl:w-[520px] flex-col items-center justify-center gap-6 px-12"
        style={{ background: 'var(--gradient-brand-panel)' }}
        aria-hidden="true"
      >
        <Brand variant="on-dark" size="lg" showSlogan />
        <p className="text-white/60 text-sm text-center max-w-xs leading-relaxed">
          Track progress, build skills, and master NAPLAN Y5 Numeracy + ICAS Math.
        </p>
      </div>
    </div>
  )
}
