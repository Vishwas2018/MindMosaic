import { forwardRef } from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { clsx } from 'clsx';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
  content: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

export function Tabs({ items, defaultValue, value, onValueChange, className }: TabsProps) {
  const initial = defaultValue ?? items[0]?.value ?? '';
  return (
    <RadixTabs.Root
      defaultValue={initial}
      value={value}
      onValueChange={onValueChange}
      className={clsx('w-full', className)}
    >
      <RadixTabs.List
        className="flex border-b border-[var(--border)] gap-0"
        aria-label="Navigation tabs"
      >
        {items.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors',
              'border-b-2 -mb-px',
              'focus-visible:outline-none focus-visible:shadow-focus-subtle',
              'text-[var(--muted)] border-transparent',
              'hover:text-[var(--text)] hover:border-[var(--border-strong)]',
              'data-[state=active]:text-[var(--primary)] data-[state=active]:border-[var(--primary)]',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="rounded-pill bg-[var(--border)] px-1.5 py-0.5 text-xs tabular-nums">
                {tab.count}
              </span>
            )}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((tab) => (
        <RadixTabs.Content key={tab.value} value={tab.value} className="pt-4">
          {tab.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

// X3: forwardRef for the Tabs root
export const TabsRoot = forwardRef<
  React.ElementRef<typeof RadixTabs.Root>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Root>
>((props, ref) => <RadixTabs.Root ref={ref} {...props} />);
TabsRoot.displayName = 'TabsRoot';
