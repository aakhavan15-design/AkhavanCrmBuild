import React from 'react';
import { cn } from '../../lib/utils';
import { Button } from './Button';
import { track, AnalyticsEvents } from '../../lib/analytics';

export interface EmptyStateProps {
  /** آیکون اختیاری؛ در صورت تزئینی بودن از درخت دسترس‌پذیری کنار گذاشته می‌شود. */
  icon?: React.ReactNode;
  /** عنوان کوتاه و واضح */
  title: string;
  /** راهنمایی برای اقدام بعدی */
  description?: string;
  /** برچسب دکمه اصلی */
  actionLabel?: string;
  /** هندلر دکمه اصلی */
  onAction?: () => void;
  /** برچسب دکمه ثانویه */
  secondaryActionLabel?: string;
  /** هندلر دکمه ثانویه */
  onSecondaryAction?: () => void;
  /** محتوای اقدام سفارشی؛ مستقل از دکمه‌های استاندارد نمایش داده می‌شود. */
  action?: React.ReactNode;
  /** کلاس اضافی */
  className?: string;
  /** نمایش فشرده برای کارت‌ها و فضاهای محدود */
  compact?: boolean;
  /** شناسه سطح برای analytics (مثلاً leads_list / finance_aging) */
  surface?: string;
}

/**
 * EmptyState — نسخه تقویت‌شده (Audit remediation F0-14-UX)
 * - توکن‌های معنایی
 * - RTL + dir=auto
 * - aria-live برای screen reader
 * - tracking خودکار اقدام‌ها
 * - کنتراست و فضای تنفس بهتر
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description = 'در حال حاضر موردی برای نمایش وجود ندارد.',
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  action,
  className,
  compact = false,
  surface = 'unknown',
}) => {
  const hasActions = Boolean(
    (actionLabel && onAction) ||
    (secondaryActionLabel && onSecondaryAction) ||
    action
  );

  const handlePrimary = () => {
    track(AnalyticsEvents.EMPTY_STATE_ACTION, {
      surface,
      action: 'primary',
      label: actionLabel || '',
    });
    onAction?.();
  };

  const handleSecondary = () => {
    track(AnalyticsEvents.EMPTY_STATE_ACTION, {
      surface,
      action: 'secondary',
      label: secondaryActionLabel || '',
    });
    onSecondaryAction?.();
  };

  return (
    <section
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'flex min-w-0 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface text-center',
        compact ? 'px-4 py-5' : 'p-6 sm:p-8',
        className
      )}
    >
      {icon && (
        <div
          aria-hidden="true"
          className={cn(
            'flex shrink-0 items-center justify-center rounded-2xl border border-border bg-sunken text-text-secondary',
            compact ? 'mb-3 h-10 w-10' : 'mb-4 h-12 w-12'
          )}
        >
          {icon}
        </div>
      )}

      <h3
        dir="auto"
        className={cn(
          'font-bold text-text-main',
          compact ? 'text-sm' : 'text-base'
        )}
      >
        {title}
      </h3>

      {description && (
        <p
          dir="auto"
          className={cn(
            'mt-1.5 max-w-prose leading-relaxed text-text-secondary',
            compact ? 'text-xs' : 'mb-5 text-xs sm:text-sm'
          )}
        >
          {description}
        </p>
      )}

      {hasActions && (
        <div
          className={cn(
            'flex w-full flex-wrap items-center justify-center gap-2',
            compact ? 'mt-3' : 'mt-1'
          )}
        >
          {actionLabel && onAction && (
            <Button variant="primary" size="sm" onClick={handlePrimary}>
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="outline" size="sm" onClick={handleSecondary}>
              {secondaryActionLabel}
            </Button>
          )}
          {action}
        </div>
      )}
    </section>
  );
};

export default EmptyState;


/**
 * @deprecated برای کدهای قدیمی نگه داشته شده است.
 * از این پس انیمیشن و ظاهر Skeleton از کلاس مشترک se-skeleton می‌آید.
 * برای کدهای جدید، LoadingState و Skeleton را از ui barrel وارد کنید.
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

/** آداپتور سازگاری API قدیمی؛ موتور انیمیشن موازی ایجاد نمی‌کند. */
export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'rectangular',
  width,
  height,
  style,
  ...props
}) => {
  const variantStyles: Record<NonNullable<SkeletonProps['variant']>, string> = {
    text: 'rounded-md h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-xl',
  };

  return (
    <div
      className={cn('se-skeleton', variantStyles[variant], className)}
      style={{ width, height, ...style }}
      {...props}
    />
  );
};

/** @deprecated برای حفظ سازگاری importهای قدیمی نگه داشته شده است. */
export const CardSkeleton: React.FC = () => (
  <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
    <div className="flex items-center justify-between">
      <Skeleton variant="rectangular" width="40%" height={16} />
      <Skeleton variant="circular" width={28} height={28} />
    </div>
    <Skeleton variant="text" width="70%" height={24} />
    <Skeleton variant="text" width="90%" height={12} />
    <div className="flex justify-between border-t border-border pt-2">
      <Skeleton variant="text" width="30%" height={14} />
      <Skeleton variant="text" width="20%" height={14} />
    </div>
  </div>
);
