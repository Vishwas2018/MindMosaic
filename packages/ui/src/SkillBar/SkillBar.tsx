import { ProgressBar } from '../ProgressBar/ProgressBar.js';
import type { ProgressBarVariant } from '../ProgressBar/ProgressBar.js';

export interface SkillBarProps {
  label: string;
  value: number;
  max?: number;
  variant?: ProgressBarVariant;
  showPercent?: boolean;
  layout?: 'vertical' | 'horizontal';
}

export function SkillBar({
  label,
  value,
  max = 100,
  variant = 'brand',
  showPercent = true,
  layout = 'vertical',
}: SkillBarProps) {
  const pct = Math.round(Math.min(100, Math.max(0, (value / max) * 100)));

  if (layout === 'horizontal') {
    return (
      <div className="flex items-center gap-3 w-full">
        <span className="text-sm text-[var(--text-2)] w-44 flex-shrink-0 truncate">{label}</span>
        <div className="flex-1 min-w-0">
          <ProgressBar value={value} max={max} variant={variant} label={label} />
        </div>
        {showPercent && (
          <span className="text-sm tabular-nums font-semibold text-[var(--text)] w-9 text-right flex-shrink-0">
            {pct}%
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-[var(--text)]">{label}</span>
        {showPercent && (
          <span className="text-sm tabular-nums text-[var(--muted)] flex-shrink-0">{pct}%</span>
        )}
      </div>
      <ProgressBar value={value} max={max} variant={variant} label={label} />
    </div>
  );
}
