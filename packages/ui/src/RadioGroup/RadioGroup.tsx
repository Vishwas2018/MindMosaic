import { forwardRef } from 'react';
import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import { clsx } from 'clsx';

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  label: string;
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

// X3: forwardRef on Radix root
export const RadioGroup = forwardRef<
  React.ElementRef<typeof RadixRadioGroup.Root>,
  RadioGroupProps
>(({ label, options, value, defaultValue, onValueChange, disabled }, ref) => {
  return (
    <fieldset className="border-none p-0 m-0">
      <legend className="text-sm font-medium text-[var(--text)] mb-2">{label}</legend>
      <RadixRadioGroup.Root
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
        aria-label={label}
        className="flex flex-col gap-2"
      >
        {options.map((opt) => {
          const itemId = `radio-${opt.value}`;
          return (
            <div key={opt.value} className="flex items-center gap-2">
              <RadixRadioGroup.Item
                id={itemId}
                value={opt.value}
                aria-label={opt.label}
                disabled={opt.disabled}
                className={clsx(
                  'h-4 w-4 flex-shrink-0 rounded-full border border-[var(--border)]',
                  'bg-[var(--field-bg)] transition-colors duration-fast',
                  'focus-visible:outline-none focus-visible:shadow-focus',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'data-[state=checked]:border-[var(--primary)]',
                )}
              >
                <RadixRadioGroup.Indicator className="flex items-center justify-center w-full h-full">
                  <span className="h-2 w-2 rounded-full bg-[var(--primary)] block" />
                </RadixRadioGroup.Indicator>
              </RadixRadioGroup.Item>
              <label
                htmlFor={itemId}
                className={clsx(
                  'text-sm text-[var(--text)] cursor-pointer select-none',
                  (opt.disabled ?? disabled) && 'opacity-50 cursor-not-allowed',
                )}
              >
                {opt.label}
              </label>
            </div>
          );
        })}
      </RadixRadioGroup.Root>
    </fieldset>
  );
});
RadioGroup.displayName = 'RadioGroup';
