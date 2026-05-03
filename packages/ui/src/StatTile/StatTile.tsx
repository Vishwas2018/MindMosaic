import { clsx } from 'clsx';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { LoadingState } from '../LoadingState/LoadingState.js';

export type StatTileSentiment = 'neutral' | 'positive' | 'negative';

export interface StatTileProps {
  label: string;
  value: string | number;
  trend?: string;
  sentiment?: StatTileSentiment;
  loading?: boolean;
}

const sentimentConfig = {
  neutral: { icon: Minus, color: 'text-[var(--muted)]' },
  positive: { icon: TrendingUp, color: 'text-[var(--success)]' },
  negative: { icon: TrendingDown, color: 'text-[var(--error)]' },
} satisfies Record<StatTileSentiment, { icon: React.ElementType; color: string }>;

export function StatTile({ label, value, trend, sentiment = 'neutral', loading }: StatTileProps) {
  if (loading) return <LoadingState variant="card" />;

  const { icon: TrendIcon, color } = sentimentConfig[sentiment];

  return (
    <div className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-6">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text)]">{value}</p>
      {trend && (
        <div className={clsx('mt-2 flex items-center gap-1 text-xs font-medium', color)}>
          <TrendIcon size={12} aria-hidden="true" />
          <span>{trend}</span>
        </div>
      )}
    </div>
  );
}
