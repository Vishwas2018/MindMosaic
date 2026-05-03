import type { ReactNode } from 'react';
import { clsx } from 'clsx';

export type AppShellVariant = 'student-parent' | 'teacher' | 'admin' | 'focus' | 'public';

export interface AppShellProps {
  variant: AppShellVariant;
  children: ReactNode;
  className?: string;
}

export function AppShell({ variant, children, className }: AppShellProps) {
  return (
    <div
      data-variant={variant}
      className={clsx('min-h-screen bg-[var(--bg)] font-sans text-[var(--text)]', className)}
    >
      {children}
    </div>
  );
}
