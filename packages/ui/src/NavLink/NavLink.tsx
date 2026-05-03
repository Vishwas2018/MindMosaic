import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

export interface NavLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  active?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export function NavLink({ active, icon, children, className, ...rest }: NavLinkProps) {
  return (
    <a
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:shadow-focus',
        active
          ? 'text-[var(--primary)] bg-[var(--primary-l)]'
          : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--slate-75)]',
        className,
      )}
      {...rest}
    >
      {icon && (
        <span className="flex-shrink-0 text-current" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </a>
  );
}
