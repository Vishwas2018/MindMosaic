import { forwardRef } from 'react';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';

export interface CheckboxProps {
  id?: string;
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  indeterminate?: boolean;
}

// X3: forwardRef wraps Radix Checkbox.Root
export const Checkbox = forwardRef<
  React.ElementRef<typeof RadixCheckbox.Root>,
  CheckboxProps
>(({ id, label, checked, defaultChecked, onCheckedChange, disabled, indeterminate }, ref) => {
  const checkId = id ?? `checkbox-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const checkedState = indeterminate ? 'indeterminate' : checked;

  return (
    <div className="flex items-center gap-2">
      <RadixCheckbox.Root
        ref={ref}
        id={checkId}
        aria-label={label}
        checked={checkedState}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange as RadixCheckbox.CheckboxProps['onCheckedChange']}
        disabled={disabled}
        className={clsx(
          // 18px square per UI_CONTRACT §3.3
          'h-[18px] w-[18px] flex-shrink-0 rounded-[4px] border border-[var(--border)]',
          'bg-[var(--field-bg)] transition-colors duration-fast',
          'focus-visible:outline-none focus-visible:shadow-focus',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'data-[state=checked]:bg-[var(--primary)] data-[state=checked]:border-[var(--primary)]',
          'data-[state=indeterminate]:bg-[var(--primary)] data-[state=indeterminate]:border-[var(--primary)]',
        )}
      >
        <RadixCheckbox.Indicator className="flex items-center justify-center text-white">
          {indeterminate
            ? <span className="block w-2 h-0.5 bg-white rounded" />
            : <Check size={12} aria-hidden="true" />
          }
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <label
        htmlFor={checkId}
        className={clsx(
          'text-sm text-[var(--text)] cursor-pointer select-none',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {label}
      </label>
    </div>
  );
});
Checkbox.displayName = 'Checkbox';
