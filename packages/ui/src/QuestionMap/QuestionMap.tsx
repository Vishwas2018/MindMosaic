'use client';

import { useRef } from 'react';
import { clsx } from 'clsx';

// QuestionMap — Stage 23 Exam Engine sidebar (UI_CONTRACT §5.1).
// 240px desktop sidebar; bottom-sheet pattern composed by callers on mobile.
// Status-coloured grid of question buttons, arrow-key operable + Enter activates.

export type QuestionStatus = 'unanswered' | 'answered' | 'flagged' | 'current';

export interface QuestionMapItem {
  /** 1-based human-facing question number (used for the cell label). */
  number: number;
  /** 0-based sequence index — matches `ItemDTO.sequence_number`. */
  sequenceNumber: number;
  status: QuestionStatus;
  /** When true, the cell is rendered but not activatable (e.g. cross-testlet
   *  jump in adaptive sessions, or a strict forward-nav block). */
  disabled?: boolean;
}

export interface QuestionMapProps {
  items: QuestionMapItem[];
  /** Callback fired when the user activates a non-disabled cell. */
  onJump: (item: QuestionMapItem) => void;
  /** Optional sidebar heading text. Defaults to "Questions". */
  label?: string;
  className?: string;
}

const statusClasses: Record<QuestionStatus, string> = {
  unanswered: 'bg-[var(--slate-75)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--slate-100)]',
  answered: 'bg-[var(--correct-50)] text-[var(--correct-700)] border-[var(--correct-200)] hover:bg-[var(--correct-100)]',
  flagged: 'bg-[var(--warn-50)] text-[var(--warn-700)] border-[var(--warn-200)] hover:bg-[var(--warn-100)]',
  current: 'bg-[var(--primary)] text-white border-[var(--primary-d)] ring-2 ring-[var(--primary-ink)] ring-offset-1',
};

const statusLabels: Record<QuestionStatus, string> = {
  unanswered: 'unanswered',
  answered: 'answered',
  flagged: 'flagged',
  current: 'current',
};

export function QuestionMap({ items, onJump, label = 'Questions', className }: QuestionMapProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'BUTTON') return;
    const cells = Array.from(
      gridRef.current?.querySelectorAll<HTMLElement>('button:not([aria-disabled="true"])') ?? [],
    );
    const idx = cells.indexOf(target);
    if (idx === -1) return;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % cells.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + cells.length) % cells.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = cells.length - 1;
    else return;
    e.preventDefault();
    cells[next]?.focus();
  }

  return (
    <aside
      aria-label={label}
      className={clsx(
        'rounded-card border border-[var(--border)] bg-[var(--surface)] p-4',
        className,
      )}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-3">
        {label}
      </h2>
      <div
        ref={gridRef}
        role="toolbar"
        aria-label={label}
        aria-orientation="horizontal"
        className="grid grid-cols-5 gap-1.5"
        onKeyDown={handleKeyDown}
      >
        {items.map((item) => {
          const disabled = item.disabled ?? false;
          const isCurrent = item.status === 'current';
          return (
            <button
              key={item.sequenceNumber}
              type="button"
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`Question ${item.number}, ${statusLabels[item.status]}${
                disabled ? ', not yet available' : ''
              }`}
              aria-disabled={disabled}
              disabled={disabled}
              onClick={() => {
                if (!disabled) onJump(item);
              }}
              tabIndex={isCurrent ? 0 : -1}
              className={clsx(
                'h-9 rounded-btn border text-sm font-medium tabular-nums',
                'transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:shadow-focus',
                disabled && 'opacity-50 cursor-not-allowed',
                statusClasses[item.status],
              )}
            >
              {item.number}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
