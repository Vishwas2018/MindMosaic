import { forwardRef } from 'react';
import Image from 'next/image';
import { clsx } from 'clsx';

export type BrandSize = 'sm' | 'md' | 'lg';
export type BrandVariant = 'default' | 'on-dark';

export interface BrandProps {
  /** Public-path URL to the logo image. Passed by the consuming app — not bundled into @mm/ui. */
  logoSrc?: string;
  size?: BrandSize;
  variant?: BrandVariant;
  showSlogan?: boolean;
  className?: string;
}

// Canonical logo aspect is 1248:696 ≈ 1.79; widths derived from heights below.
const logoDims: Record<BrandSize, { width: number; height: number }> = {
  sm: { width: 56,  height: 32 },
  md: { width: 86,  height: 48 },
  lg: { width: 115, height: 64 },
};

const wordmarkSizes: Record<BrandSize, string> = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-3xl',
};

const sloganSizes: Record<BrandSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

// Pull wordmark toward the brain icon. The source SVG has ~12.5% transparent
// padding on each horizontal edge inside its canvas, scaled per logo width.
const wordmarkPull: Record<BrandSize, string> = {
  sm: '-ml-2',
  md: '-ml-3',
  lg: '-ml-4',
};

export const Brand = forwardRef<HTMLDivElement, BrandProps>(
  ({ logoSrc = '/logo.svg', size = 'md', variant = 'default', showSlogan = false, className }, ref) => {
    const onDark = variant === 'on-dark';
    const dims = logoDims[size];

    const mindClass   = onDark ? 'text-white' : 'text-brand-primary';
    const mosaicClass = onDark ? 'text-white' : 'text-brand-secondary';
    const sloganClass = onDark
      ? 'text-white/70'
      : 'text-[var(--brand-text-deep)]';

    return (
      <div
        ref={ref}
        className={clsx('inline-flex flex-col items-center gap-1', className)}
        aria-label="MindMosaic"
        role="img"
      >
        <div className="flex items-center">
          <Image
            src={logoSrc}
            alt=""
            width={dims.width}
            height={dims.height}
            unoptimized
            priority
            aria-hidden="true"
            className="flex-shrink-0"
          />
          <span
            className={clsx(
              wordmarkSizes[size],
              wordmarkPull[size],
              'font-bold tracking-tight leading-none select-none',
            )}
            aria-hidden="true"
          >
            <span className={mindClass}>Mind</span>
            <span className={mosaicClass}>Mosaic</span>
          </span>
        </div>

        {showSlogan && (
          <p
            className={clsx(
              'font-semibold text-center leading-snug tracking-tight',
              sloganSizes[size],
              sloganClass,
            )}
            aria-hidden="true"
          >
            Turning practice into mastery
          </p>
        )}
      </div>
    );
  },
);
Brand.displayName = 'Brand';
