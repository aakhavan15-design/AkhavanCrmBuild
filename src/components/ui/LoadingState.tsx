import React from 'react';
import { cn } from '../../lib/utils';
import { Skeleton } from './Skeleton';

export interface LoadingStateProps {
  /** تعداد خطوط اسکلتون؛ به بازه ۱ تا ۸ محدود می‌شود. */
  lines?: number;
  /** متن قابل‌اعلام به فناوری‌های کمکی */
  label?: string;
  /** فاصله و تراکم کمتر برای فضاهای محدود */
  compact?: boolean;
  className?: string;
}

/**
 * LoadingState — پوشش دسترس‌پذیر روی Skeleton (Audit-hardened)
 * - role=status + aria-busy + sr-only
 * - احترام کامل به prefers-reduced-motion از طریق کلاس se-skeleton
 */
export function LoadingState({
  lines = 3,
  label = 'در حال بارگذاری',
  compact = false,
  className,
}: LoadingStateProps) {
  const safeLines = Number.isFinite(lines)
    ? Math.min(8, Math.max(1, Math.floor(lines)))
    : 3;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className={cn('min-w-0', compact ? 'space-y-1.5' : 'space-y-2.5', className)}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className={cn('min-w-0', compact ? 'space-y-1.5' : 'space-y-2.5')}>
        {Array.from({ length: safeLines }, (_, index) => (
          <Skeleton
            key={index}
            className={cn(
              'h-3.5',
              index === safeLines - 1 && safeLines > 1 ? 'w-2/3' : 'w-full'
            )}
          />
        ))}
      </div>
    </div>
  );
}

export interface CardSkeletonProps {
  className?: string;
  /** متن قابل‌اعلام به فناوری‌های کمکی */
  label?: string;
}

/** اسکلتون کارت استاندارد با توکن‌های فعلی */
export function CardSkeleton({
  className,
  label = 'در حال بارگذاری کارت',
}: CardSkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className={cn('min-w-0 rounded-2xl border border-border bg-surface p-4', className)}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-2/5" />
          <Skeleton className="h-7 w-7 rounded-full" />
        </div>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3.5 w-full" />
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3.5 w-1/4" />
        </div>
      </div>
    </div>
  );
}

export default LoadingState;
