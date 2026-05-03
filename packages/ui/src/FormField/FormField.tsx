import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Input } from '../Input/Input.js';
import type { InputProps } from '../Input/Input.js';

export interface FormFieldProps extends InputProps {
  hint?: string;
}

export function FormField({ hint, ...inputProps }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Input {...inputProps} />
      {hint && !inputProps.error && (
        <p className="text-xs text-[var(--muted)] px-0.5">{hint}</p>
      )}
    </div>
  );
}

// Generic field wrapper for custom inputs (Checkbox, Select, etc.)
export interface FieldWrapperProps {
  children: ReactNode;
  error?: string;
  hint?: string;
  className?: string;
}

export function FieldWrapper({ children, error, hint, className }: FieldWrapperProps) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {children}
      {error && (
        <p role="alert" className="text-xs text-[var(--error)]">{error}</p>
      )}
      {hint && !error && (
        <p className="text-xs text-[var(--muted)]">{hint}</p>
      )}
    </div>
  );
}
