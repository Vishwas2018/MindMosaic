import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-label={title}
      className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center"
    >
      {icon && (
        <div className="text-[var(--muted-2)]" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-base font-medium text-[var(--text)]">{title}</p>
      {description && (
        <p className="text-sm text-[var(--muted)] max-w-xs">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
