import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

export type IconButtonVariant = 'ghost' | 'filled';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  loading?: boolean;
  label: string;
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = 'ghost', loading, label, icon, className, disabled, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        aria-label={label}
        disabled={disabled ?? loading}
        aria-disabled={disabled ?? loading}
        aria-busy={loading}
        className={clsx(
          // X6: 44×44 tap target
          'h-11 w-11 inline-flex items-center justify-center rounded-btn',
          'transition-colors duration-fast',
          'focus-visible:outline-none focus-visible:shadow-focus',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variant === 'ghost' && 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--slate-75)]',
          variant === 'filled' && 'bg-[var(--primary)] text-white hover:bg-[var(--primary-d)]',
          className,
        )}
        {...rest}
      >
        {loading
          ? <Loader2 size={18} aria-hidden="true" className="animate-spin" />
          : <span aria-hidden="true">{icon}</span>
        }
      </button>
    );
  },
);
IconButton.displayName = 'IconButton';
