'use client';

import { forwardRef, createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import * as RadixToast from '@radix-ui/react-toast';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { clsx } from 'clsx';

export type ToastVariant = 'info' | 'success' | 'warn' | 'error';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

const variantConfig = {
  info:    { icon: Info,          bg: 'bg-[var(--surface)]',   text: 'text-[var(--text)]'    },
  success: { icon: CheckCircle,   bg: 'bg-[var(--success-bg)]', text: 'text-[var(--success)]' },
  warn:    { icon: AlertTriangle, bg: 'bg-[var(--warning-bg)]', text: 'text-[var(--warning)]' },
  error:   { icon: XCircle,       bg: 'bg-[var(--error-bg)]',   text: 'text-[var(--error)]'   },
} satisfies Record<ToastVariant, { icon: React.ElementType; bg: string; text: string }>;

// X3: forwardRef on Radix Root
export const ToastRoot = forwardRef<
  React.ElementRef<typeof RadixToast.Root>,
  React.ComponentPropsWithoutRef<typeof RadixToast.Root>
>((props, ref) => <RadixToast.Root ref={ref} {...props} />);
ToastRoot.displayName = 'ToastRoot';

// Provider + context for programmatic toasts
interface ToastContextValue {
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, ...toast }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {toasts.map((toast) => {
          const { icon: Icon, bg, text } = variantConfig[toast.variant ?? 'info'];
          return (
            <RadixToast.Root
              key={toast.id}
              duration={toast.duration ?? 5000}
              onOpenChange={(open) => { if (!open) removeToast(toast.id); }}
              className={clsx(
                'flex items-start gap-3 p-4 rounded-card border border-[var(--border)]',
                'shadow-elevated w-[360px] max-w-[calc(100vw-32px)]',
                bg,
              )}
            >
              <Icon size={18} aria-hidden="true" className={clsx('flex-shrink-0 mt-0.5', text)} />
              <div className="flex-1 min-w-0">
                <RadixToast.Title className="text-sm font-medium text-[var(--text)]">
                  {toast.title}
                </RadixToast.Title>
                {toast.description && (
                  <RadixToast.Description className="mt-0.5 text-xs text-[var(--muted)]">
                    {toast.description}
                  </RadixToast.Description>
                )}
                {toast.action && (
                  <RadixToast.Action altText={toast.action.label} asChild>
                    <button
                      type="button"
                      onClick={toast.action.onClick}
                      className="mt-1.5 text-xs font-medium text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:shadow-focus-subtle rounded"
                    >
                      {toast.action.label}
                    </button>
                  </RadixToast.Action>
                )}
              </div>
              <RadixToast.Close aria-label="Dismiss notification">
                <X size={14} aria-hidden="true" className="text-[var(--muted)] hover:text-[var(--text)]" />
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        {/* Viewport: top-right desktop, bottom-center mobile */}
        <RadixToast.Viewport
          className={clsx(
            'fixed z-[100] flex flex-col gap-2 p-4 outline-none',
            'top-4 right-4',
            'sm:bottom-4 sm:right-4 sm:top-auto',
          )}
          aria-label="Notifications"
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
