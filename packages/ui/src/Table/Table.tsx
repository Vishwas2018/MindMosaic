import { forwardRef } from 'react';
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { LoadingState } from '../LoadingState/LoadingState.js';
import { EmptyState } from '../EmptyState/EmptyState.js';

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  loading?: boolean;
  empty?: boolean;
  emptyTitle?: string;
  caption?: string;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ loading, empty, emptyTitle = 'No results', caption, className, children, ...rest }, ref) => {
    if (loading) return <LoadingState variant="row" rows={5} />;
    if (empty) return <EmptyState title={emptyTitle} />;
    return (
      <div className="w-full overflow-x-auto">
        <table
          ref={ref}
          className={clsx('w-full text-sm border-collapse', className)}
          {...rest}
        >
          {caption && <caption className="sr-only">{caption}</caption>}
          {children}
        </table>
      </div>
    );
  },
);
Table.displayName = 'Table';

export const TableHead = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...rest }, ref) => (
    <thead ref={ref} className={clsx('border-b border-[var(--border)]', className)} {...rest} />
  ),
);
TableHead.displayName = 'TableHead';

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...rest }, ref) => (
    <tbody ref={ref} className={clsx('divide-y divide-[var(--border)]', className)} {...rest} />
  ),
);
TableBody.displayName = 'TableBody';

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...rest }, ref) => (
    <tr ref={ref} className={clsx('hover:bg-[var(--surface-alt)] transition-colors', className)} {...rest} />
  ),
);
TableRow.displayName = 'TableRow';

export const TableHeader = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...rest }, ref) => (
    <th
      ref={ref}
      scope="col"
      className={clsx(
        'px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]',
        className,
      )}
      {...rest}
    />
  ),
);
TableHeader.displayName = 'TableHeader';

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...rest }, ref) => (
    <td
      ref={ref}
      className={clsx('px-4 py-3 text-[var(--text)]', className)}
      {...rest}
    />
  ),
);
TableCell.displayName = 'TableCell';
