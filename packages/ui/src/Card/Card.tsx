import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padding?: 'default' | 'dense' | 'none';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ interactive, padding = 'default', className, children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        tabIndex={interactive ? 0 : undefined}
        className={clsx(
          'rounded-card bg-[var(--surface)] border border-[var(--border)]',
          'shadow-card transition-shadow duration-base',
          padding === 'default' && 'p-6',
          padding === 'dense' && 'p-4',
          interactive && [
            'cursor-pointer focus-visible:outline-none focus-visible:shadow-focus-subtle',
            'hover:shadow-card-hover',
          ],
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
Card.displayName = 'Card';
