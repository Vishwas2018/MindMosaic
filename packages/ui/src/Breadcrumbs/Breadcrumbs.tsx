import { ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex items-center gap-1 flex-wrap">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight
                  aria-hidden="true"
                  size={14}
                  className="text-[var(--muted-2)] flex-shrink-0"
                />
              )}
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={clsx(
                    'text-sm',
                    isLast ? 'font-medium text-[var(--text)]' : 'text-[var(--muted)]',
                  )}
                >
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href}
                  className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors focus-visible:outline-none focus-visible:shadow-focus-subtle rounded"
                >
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
