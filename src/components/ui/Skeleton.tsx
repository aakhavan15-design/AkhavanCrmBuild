/**
 * Skeleton / Shimmer + ErrorState — loading & error placeholders (2026 Audit)
 * Uses design tokens only. Respects prefers-reduced-motion via global CSS.
 */
import React from 'react';
import { cn } from '../../lib/utils';
import { Button } from './Button';
import { track, AnalyticsEvents } from '../../lib/analytics';

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn('se-skeleton', className)}
      style={style}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div
      className={cn('se-soft-card space-y-2.5 p-3.5', className)}
      aria-busy="true"
      aria-label="در حال بارگذاری"
      role="status"
    >
      <span className="sr-only">در حال بارگذاری</span>
      <Skeleton className="h-3.5 w-2/5" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  );
}

export function ErrorState({
  title = 'خطایی رخ داده است',
  description = 'لطفاً دوباره تلاش کنید. اگر مشکل ادامه داشت با پشتیبانی تماس بگیرید.',
  onRetry,
  className,
  surface = 'unknown',
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
  surface?: string;
}) {
  const handleRetry = () => {
    track(AnalyticsEvents.ERROR_BOUNDARY, {
      surface,
      action: 'retry',
      title,
    });
    onRetry?.();
  };

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col items-center justify-center rounded-2xl border border-dashed border-danger/30 bg-danger-soft/30 p-6 text-center space-y-3',
        className
      )}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-danger/20 bg-surface text-danger">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <div>
        <h3 className="text-sm font-bold text-text-main" dir="auto">{title}</h3>
        {description && (
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-text-secondary" dir="auto">
            {description}
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={handleRetry}>
          تلاش مجدد
        </Button>
      )}
    </div>
  );
}
