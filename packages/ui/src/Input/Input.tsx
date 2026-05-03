import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

export type InputState = 'idle' | 'focus' | 'error' | 'success' | 'disabled';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  success?: string;
  icon?: ReactNode;
  trailingAction?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, success, icon, trailingAction, className, id, disabled, ...rest }, ref) => {
    const inputId = id ?? `input-${label.toLowerCase().replace(/\s+/g, '-')}`;
    const hintId = error ? `${inputId}-error` : success ? `${inputId}-success` : undefined;
    const state = error ? 'error' : success ? 'success' : 'idle';

    return (
      <div className={clsx('relative w-full', className)}>
        <div className="relative flex items-center">
          {icon && (
            <span
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
            >
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            placeholder=" "
            aria-invalid={state === 'error'}
            aria-describedby={hintId}
            className={clsx(
              // 44px height enforced via min-h — floating label uses padding-top
              'peer w-full min-h-[44px] bg-[var(--field-bg)] rounded-field text-sm',
              'border transition-colors duration-fast',
              'pt-5 pb-1 pr-3',
              icon ? 'pl-9' : 'pl-3',
              'placeholder-transparent text-[var(--text)]',
              'focus:outline-none focus:shadow-focus-subtle',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              state === 'error'
                ? 'border-[var(--error)] focus:border-[var(--error)]'
                : state === 'success'
                ? 'border-[var(--correct-500)] focus:border-[var(--correct-500)]'
                : 'border-[var(--border)] focus:border-[var(--primary)]',
            )}
            {...rest}
          />
          {/* Floating label — moves via peer state */}
          <label
            htmlFor={inputId}
            className={clsx(
              'absolute pointer-events-none transition-all duration-fast',
              'text-sm text-[var(--muted)]',
              icon ? 'left-9' : 'left-3',
              // float up when focused or has value (:not(:placeholder-shown))
              'top-1/2 -translate-y-1/2',
              'peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:text-[var(--primary)]',
              'peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[11px]',
            )}
          >
            {label}
          </label>
          {trailingAction && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {trailingAction}
            </span>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} role="alert" className="mt-1 text-xs text-[var(--error)]">
            {error}
          </p>
        )}
        {success && !error && (
          <p id={`${inputId}-success`} className="mt-1 text-xs text-[var(--success)]">
            {success}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
