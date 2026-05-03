import { clsx } from 'clsx';

export type LoadingStateVariant = 'card' | 'row' | 'text' | 'avatar';

export interface LoadingStateProps {
  variant?: LoadingStateVariant;
  rows?: number;
  className?: string;
}

const shimmer =
  'animate-pulse bg-[var(--border)] rounded';

function SkeletonCard() {
  return (
    <div className="rounded-card border border-[var(--border)] bg-[var(--surface)] p-6 space-y-3">
      <div className={clsx(shimmer, 'h-4 w-2/3')} />
      <div className={clsx(shimmer, 'h-4 w-1/2')} />
      <div className={clsx(shimmer, 'h-8 w-full mt-4')} />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className={clsx(shimmer, 'h-8 w-8 rounded-full flex-shrink-0')} />
      <div className="flex-1 space-y-2">
        <div className={clsx(shimmer, 'h-3 w-3/4')} />
        <div className={clsx(shimmer, 'h-3 w-1/2')} />
      </div>
    </div>
  );
}

function SkeletonText({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={clsx(shimmer, 'h-3', i === rows - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

export function LoadingState({
  variant = 'card',
  rows = 3,
  className,
}: LoadingStateProps) {
  return (
    <div role="status" aria-label="Loading…" className={className}>
      <span className="sr-only">Loading…</span>
      {variant === 'card' && <SkeletonCard />}
      {variant === 'row' && (
        <div className="divide-y divide-[var(--border)]">
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      )}
      {variant === 'text' && <SkeletonText rows={rows} />}
      {variant === 'avatar' && (
        <div className={clsx(shimmer, 'h-10 w-10 rounded-full')} />
      )}
    </div>
  );
}
