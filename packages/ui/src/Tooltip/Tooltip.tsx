import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { clsx } from 'clsx';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

// X3: forwardRef on Trigger so parent can attach focus/measurement refs
export const TooltipTrigger = forwardRef<
  React.ElementRef<typeof RadixTooltip.Trigger>,
  React.ComponentPropsWithoutRef<typeof RadixTooltip.Trigger>
>((props, ref) => <RadixTooltip.Trigger ref={ref} {...props} />);
TooltipTrigger.displayName = 'TooltipTrigger';

export function TooltipProvider({ children }: { children: ReactNode }) {
  // 200ms delay per UI_CONTRACT §3.4
  return <RadixTooltip.Provider delayDuration={200}>{children}</RadixTooltip.Provider>;
}

export function Tooltip({ content, children, side = 'top', delayDuration = 200 }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={4}
            className={clsx(
              'z-50 rounded-lg px-2.5 py-1.5',
              'bg-[var(--slate-800)] text-white text-xs leading-snug',
              'shadow-elevated max-w-xs',
              'animate-in fade-in-0 zoom-in-95',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            )}
          >
            {content}
            <RadixTooltip.Arrow className="fill-[var(--slate-800)]" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
