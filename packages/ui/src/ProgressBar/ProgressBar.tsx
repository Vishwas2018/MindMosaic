import { clsx } from 'clsx';

export type ProgressBarVariant = 'brand' | 'correct' | 'incorrect' | 'warn';

export interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: ProgressBarVariant;
  className?: string;
  label?: string;
}

const fillColor: Record<ProgressBarVariant, string> = {
  brand:     'bg-[var(--primary)]',
  correct:   'bg-[var(--correct-500)]',
  incorrect: 'bg-[var(--incorrect-500)]',
  warn:      'bg-[var(--warn-500)]',
};

export function ProgressBar({ value, max = 100, variant = 'brand', className, label }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label ?? 'Progress'}
      className={clsx('h-1.5 w-full rounded-pill bg-[var(--border)] overflow-hidden', className)}
    >
      <div
        className={clsx(
          'h-full rounded-pill transition-[width]',
          fillColor[variant],
        )}
        style={{
          width: `${pct}%`,
          transitionDuration: 'var(--duration-progress)',
          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </div>
  );
}
