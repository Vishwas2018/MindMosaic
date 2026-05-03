import type { ReactNode } from 'react';
import { clsx } from 'clsx';

export type SidebarVariant = 'teacher' | 'admin';

export interface SidebarProps {
  variant: SidebarVariant;
  children: ReactNode;
  className?: string;
}

export function Sidebar({ variant, children, className }: SidebarProps) {
  const isAdmin = variant === 'admin';
  return (
    <aside
      aria-label={isAdmin ? 'Admin navigation' : 'Teacher navigation'}
      data-surface={isAdmin ? 'admin-dark' : undefined}
      className={clsx(
        'sticky top-0 h-screen overflow-y-auto flex-shrink-0 flex flex-col',
        'border-r border-[var(--border)]',
        isAdmin ? 'w-[220px] bg-[var(--slate-950)]' : 'w-[260px] bg-[var(--surface)]',
        className,
      )}
    >
      {children}
    </aside>
  );
}
