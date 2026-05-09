import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { Bell as BellIcon } from 'lucide-react';

export interface BellProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  unreadCount: number;
}

export const Bell = forwardRef<HTMLButtonElement, BellProps>(
  ({ unreadCount, className, ...rest }, ref) => {
    const capped = Math.min(unreadCount, 99);
    return (
      <button
        ref={ref}
        aria-label={unreadCount > 0 ? `Notifications, ${capped} unread` : 'Notifications'}
        className={clsx(
          // X6: 44×44 tap target
          'relative h-11 w-11 inline-flex items-center justify-center rounded-btn',
          'transition-colors duration-fast',
          'focus-visible:outline-none focus-visible:shadow-focus',
          'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--slate-75)]',
          className,
        )}
        {...rest}
      >
        <BellIcon size={20} aria-hidden="true" />
        {capped > 0 && (
          <span
            aria-hidden="true"
            className={clsx(
              'absolute top-1 right-1',
              'min-w-[1.125rem] h-[1.125rem] px-1',
              'flex items-center justify-center',
              'rounded-full bg-[var(--primary)] text-white',
              'text-[0.625rem] font-semibold leading-none',
            )}
          >
            {capped}
          </span>
        )}
      </button>
    );
  },
);
Bell.displayName = 'Bell';
