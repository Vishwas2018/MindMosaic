import { ProgressBar } from '../ProgressBar/ProgressBar.js';
import type { ProgressBarVariant } from '../ProgressBar/ProgressBar.js';

export interface SkillBarProps {
  label: string;
  value: number;
  max?: number;
  variant?: ProgressBarVariant;
  showPercent?: boolean;
}

export function SkillBar({ label, value, max = 100, variant = 'brand', showPercent = true }: SkillBarProps) {
  const pct = Math.round(Math.min(100, Math.max(0, (value / max) * 100)));
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
