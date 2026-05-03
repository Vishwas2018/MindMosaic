import type { ReactNode } from 'react';
import { clsx } from 'clsx';

export interface TopBarProps {
  children: ReactNode;
  className?: string;
}

export function TopBar({ children, className }: TopBarProps) {
  return (
    <header
      role="banner"
      className={clsx(
        'sticky top-0 z-40 h-16 w-full',
        'bg-white/80 backdrop-blur-xl',
        'border-b border-[var(--border)]',
        'flex items-center px-6 gap-4',
        className,
      )}
    >
      {children}
    </header>
  );
}
