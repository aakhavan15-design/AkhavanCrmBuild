/**
 * OfflineBanner — Local-First 2026
 * Visible status for offline mode + pending sync count.
 * Zero-clutter, respects reduced motion, WCAG friendly.
 */
import React from 'react';
import { WifiOff, CloudUpload, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { processOfflineQueue, retryFailedOfflineOperations } from '../../lib/offline';

export function OfflineBanner({ className }: { className?: string }) {
  const { isOnline, pendingCount, failedCount, isSyncing, refresh } = useOfflineStatus();

  // Online + nothing pending → render nothing (zero clutter)
  if (isOnline && pendingCount === 0 && failedCount === 0) {
    return null;
  }

  const handleRetry = async () => {
    if (failedCount > 0) {
      await retryFailedOfflineOperations();
    } else {
      await processOfflineQueue();
    }
    await refresh();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      className={cn(
        'sticky top-0 z-40 flex items-center justify-between gap-3 px-3 py-2 text-small font-medium border-b transition-colors duration-200',
        !isOnline
          ? 'bg-warning-soft text-warning border-warning-border'
          : failedCount > 0
            ? 'bg-danger-soft text-danger border-danger-border'
            : 'bg-info-soft text-info border-info/20',
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {!isOnline ? (
          <WifiOff size={15} className="shrink-0" aria-hidden />
        ) : failedCount > 0 ? (
          <AlertCircle size={15} className="shrink-0" aria-hidden />
        ) : (
          <CloudUpload size={15} className="shrink-0" aria-hidden />
        )}

        <span className="truncate">
          {!isOnline
            ? 'حالت آفلاین — تغییرات محلی ذخیره می‌شوند'
            : failedCount > 0
              ? `${failedCount.toLocaleString('fa-IR')} مورد نیاز به تلاش مجدد`
              : isSyncing
                ? 'در حال همگام‌سازی…'
                : `${pendingCount.toLocaleString('fa-IR')} مورد در صف همگام‌سازی`}
        </span>
      </div>

      {(pendingCount > 0 || failedCount > 0) && isOnline && (
        <button
          type="button"
          onClick={() => void handleRetry()}
          disabled={isSyncing}
          className={cn(
            'inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg text-caption font-bold transition-all cursor-pointer',
            'bg-surface/80 hover:bg-surface border border-border/60 shadow-xs active:scale-95',
            isSyncing && 'opacity-60 cursor-wait'
          )}
          aria-label="تلاش مجدد همگام‌سازی"
        >
          <RefreshCw size={12} className={cn(isSyncing && 'animate-spin')} />
          <span>{isSyncing ? 'همگام‌سازی…' : 'همگام‌سازی'}</span>
        </button>
      )}
    </div>
  );
}
