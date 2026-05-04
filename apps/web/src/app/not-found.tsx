import Link from 'next/link'
import { Brand } from '@mm/ui'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center bg-white">
      <Brand size="lg" />
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold text-[var(--brand-text-deep)] leading-tight">
          Page not found
        </h1>
        <p className="text-sm text-[var(--muted)]">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
      </div>
      <Link href="/login" className="text-sm font-medium text-[var(--primary)] hover:underline">
        Back to sign in
      </Link>
    </div>
  )
}
