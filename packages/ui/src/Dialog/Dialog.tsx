import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg';
}

const maxWidthClass = { sm: 'max-w-sm', md: 'max-w-[420px]', lg: 'max-w-lg' };

// X3: forwardRef on Dialog.Content
export const DialogContent = forwardRef<
  React.ElementRef<typeof RadixDialog.Content>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Content>
>((props, ref) => <RadixDialog.Content ref={ref} {...props} />);
DialogContent.displayName = 'DialogContent';

export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  maxWidth = 'md',
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <RadixDialog.Portal>
        {/* Overlay */}
        <RadixDialog.Overlay
          className={clsx(
            'fixed inset-0 z-50 bg-black/30 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        {/* Content panel */}
        <RadixDialog.Content
          className={clsx(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full px-4',
            maxWidthClass[maxWidth],
            'focus:outline-none',
          )}
        >
          <div
            className={clsx(
              'bg-[var(--surface)] rounded-card-lg shadow-modal p-6',
              'border border-[var(--border)]',
            )}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <RadixDialog.Title className="text-lg font-semibold text-[var(--text)]">
                  {title}
                </RadixDialog.Title>
                {description && (
                  <RadixDialog.Description className="mt-1 text-sm text-[var(--muted)]">
                    {description}
                  </RadixDialog.Description>
                )}
              </div>
              <RadixDialog.Close
                className={clsx(
                  'flex-shrink-0 h-8 w-8 inline-flex items-center justify-center',
                  'rounded-btn text-[var(--muted)] hover:text-[var(--text)]',
                  'hover:bg-[var(--slate-75)] transition-colors duration-fast',
                  'focus-visible:outline-none focus-visible:shadow-focus',
                )}
                aria-label="Close dialog"
              >
                <X size={16} aria-hidden="true" />
              </RadixDialog.Close>
            </div>
            {children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
