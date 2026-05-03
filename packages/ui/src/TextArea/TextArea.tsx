import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, hint, className, id, disabled, ...rest }, ref) => {
    const areaId = id ?? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}`;
    const hintId = error ? `${areaId}-error` : hint ? `${areaId}-hint` : undefined;

    return (
      <div className={clsx('w-full', className)}>
        <label
          htmlFor={areaId}
          className="block text-xs font-medium text-[var(--muted)] mb-1"
        >
          {label}
        </label>
        <textarea
          ref={ref}
          id={areaId}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={hintId}
          className={clsx(
            'w-full min-h-[120px] px-3 py-2 bg-[var(--field-bg)] rounded-field text-sm',
            'border transition-colors duration-fast resize-y',
            'placeholder:text-[var(--muted)] text-[var(--text)]',
            'focus:outline-none focus:shadow-focus-subtle',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error
              ? 'border-[var(--error)] focus:border-[var(--error)]'
              : 'border-[var(--border)] focus:border-[var(--primary)]',
          )}
          {...rest}
        />
        {error && (
          <p id={`${areaId}-error`} role="alert" className="mt-1 text-xs text-[var(--error)]">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${areaId}-hint`} className="mt-1 text-xs text-[var(--muted)]">
            {hint}
          </p>
        )}
      </div>
    );
  },
);
TextArea.displayName = 'TextArea';
