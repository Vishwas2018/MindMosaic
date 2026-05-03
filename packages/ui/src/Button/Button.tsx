import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'submit';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonIntent = 'neutral' | 'destructive';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  intent?: ButtonIntent;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:   'bg-[var(--primary)] text-white hover:bg-[var(--primary-d)] active:bg-[var(--primary-ink)] shadow-sm',
  secondary: 'border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--slate-75)]',
  ghost:     'text-[var(--text-2)] hover:bg-[var(--slate-75)] hover:text-[var(--text)]',
  danger:    'bg-[var(--error-bg)] text-[var(--error)] hover:bg-[var(--incorrect-100)] border border-[var(--incorrect-200)]',
  submit:    'bg-gradient-to-r from-[var(--brand-500)] to-[var(--brand-600)] text-white shadow-sm hover:from-[var(--brand-600)] hover:to-[var(--brand-700)]',
};

// X6: size="md" enforces 44px minimum height (h-11 = 2.75rem = 44px)
const sizeClasses: Record<ButtonSize, string> = {
  sm:  'h-8 px-3 text-xs rounded-btn',
  md:  'h-11 px-4 text-sm rounded-btn',
  lg:  'h-12 px-6 text-base rounded-btn',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ({ variant = 'primary', size = 'md', loading, intent: _intent, className, disabled, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled ?? loading}
        aria-disabled={disabled ?? loading}
        aria-busy={loading}
        className={clsx(
          'inline-flex items-center justify-center gap-2 font-medium',
          'transition-colors duration-fast',
          'focus-visible:outline-none focus-visible:shadow-focus',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...rest}
      >
        {loading && (
          <Loader2 size={16} aria-hidden="true" className="animate-spin flex-shrink-0" />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
