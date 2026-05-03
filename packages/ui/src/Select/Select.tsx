import { forwardRef } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import { clsx } from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  label: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  id?: string;
}

// X3: forwardRef on Trigger for parent measurement
export const SelectTrigger = forwardRef<
  React.ElementRef<typeof RadixSelect.Trigger>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Trigger>
>((props, ref) => <RadixSelect.Trigger ref={ref} {...props} />);
SelectTrigger.displayName = 'SelectTrigger';

export function Select({
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Select…',
  disabled,
  error,
  id,
}: SelectProps) {
  const selectId = id ?? `select-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const hintId = error ? `${selectId}-error` : undefined;

  return (
    <div className="w-full">
      <label htmlFor={selectId} className="block text-xs font-medium text-[var(--muted)] mb-1">
        {label}
      </label>
      <RadixSelect.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <RadixSelect.Trigger
          id={selectId}
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={hintId}
          className={clsx(
            'flex w-full items-center justify-between min-h-[44px] px-3',
            'bg-[var(--field-bg)] rounded-field text-sm',
            'border transition-colors duration-fast',
            'focus:outline-none focus:shadow-focus-subtle',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error
              ? 'border-[var(--error)]'
              : 'border-[var(--border)] focus:border-[var(--primary)]',
          )}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon>
            <ChevronDown size={16} aria-hidden="true" className="text-[var(--muted)] ml-2" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            className={clsx(
              'z-50 min-w-[8rem] overflow-hidden rounded-card bg-[var(--surface)]',
              'border border-[var(--border)] shadow-elevated',
            )}
            position="popper"
            sideOffset={4}
          >
            <RadixSelect.Viewport className="p-1">
              {options.map((opt) => (
                <RadixSelect.Item
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className={clsx(
                    'relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
                    'cursor-pointer select-none outline-none',
                    'focus:bg-[var(--slate-75)] focus:text-[var(--text)]',
                    'data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
                    'text-[var(--text)]',
                  )}
                >
                  <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="ml-auto">
                    <Check size={14} aria-hidden="true" />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
      {error && (
        <p id={`${selectId}-error`} role="alert" className="mt-1 text-xs text-[var(--error)]">
          {error}
        </p>
      )}
    </div>
  );
}
