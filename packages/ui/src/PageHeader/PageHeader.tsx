import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text)]">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
