import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Cloud, 
  CloudOff, 
  CheckCircle2, 
  RefreshCw, 
  AlertCircle, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Database,
  X
} from 'lucide-react';
import { useDataSyncStatus } from '../../services/dataSyncController';
import { toPersianDigits } from '../../lib/digits';

export function SyncProgressIndicator() {
  const navigate = useNavigate();
  const { 
    state, 
    stateLabel, 
    pendingCount, 
    lastSyncedAt, 
    lastError, 
    retryAttempt, 
    isSqlActive,
    syncNow, 
    retrieveNow, 
    retry 
  } = useDataSyncStatus();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  // فرمت‌بندی زمان آخرین همگام‌سازی
  const formattedTime = React.useMemo(() => {
    if (!lastSyncedAt) return 'به‌تازگی';
    try {
      const d = new Date(lastSyncedAt);
      return new Intl.DateTimeFormat('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(d);
    } catch {
      return 'به‌تازگی';
    }
  }, [lastSyncedAt]);

  const handleManualSync = async () => {
    setIsActionPending(true);
    await syncNow();
    setIsActionPending(false);
  };

  const handleManualRetrieve = async () => {
    setIsActionPending(true);
    await retrieveNow();
    setIsActionPending(false);
  };

  const handleRetry = async () => {
    setIsActionPending(true);
    await retry();
    setIsActionPending(false);
  };

  // نشانگر سراسری فشرده؛ جزئیات و عملیات فقط در مرکز همگام‌سازی نمایش داده می‌شود.
  const renderStatusBadge = () => {
    const color = !isSqlActive || !lastSyncedAt ? 'bg-slate-400' : state === 'failed' || state === 'offline' ? 'bg-rose-500' : ['saving', 'syncing', 'retrieving', 'retrying'].includes(state) ? 'bg-amber-500 animate-pulse' : pendingCount > 0 ? 'bg-amber-500' : 'bg-emerald-500';
    return <span className="flex items-center gap-1.5" aria-hidden="true"><span className={`h-2.5 w-2.5 rounded-full ${color} ${isSqlActive && Boolean(lastSyncedAt) && !['failed','offline','saving','syncing','retrieving','retrying'].includes(state) && pendingCount === 0 ? 'shadow-[0_0_0_4px_rgba(16,185,129,.12)]' : ''}`} />{pendingCount > 0 && <span className="text-micro font-mono font-bold text-text-secondary">{toPersianDigits(pendingCount)}</span>}</span>;
  };

  return (
    <div className="relative inline-flex items-center">
      {/* دکمه بازکردن پنجره وضعیت هدر */}
      <button
        type="button"
        onClick={() => setIsPopoverOpen(!isPopoverOpen)}
        className="grid h-8 min-w-8 place-items-center rounded-full bg-surface/80 px-2 hover:bg-canvas border border-border/80 shadow-2xs transition-all cursor-pointer active:scale-95"
        title={`وضعیت داده‌ها: ${stateLabel}`}
        aria-label={`وضعیت همگام‌سازی داده‌ها: ${stateLabel}. مشاهده مرکز همگام‌سازی`}
      >
        {renderStatusBadge()}
      </button>

      {/* پنجره شناور جزئیات همگام‌سازی (Sync Status Popover) */}
      {isPopoverOpen && (
        <div 
          className="absolute top-9 start-0 z-50 w-72 p-3 rounded-2xl bg-surface/98 border border-border shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 text-start"
          dir="rtl"
        >
          <div className="flex items-center justify-between pb-2 border-b border-border/80">
            <div className="flex items-center gap-1.5">
              <Database size={15} className="text-primary" />
              <span className="text-xs font-bold text-text-main">همگام‌سازی متمرکز پایگاه‌داده</span>
            </div>
            <button
              type="button"
              onClick={() => setIsPopoverOpen(false)}
              className="w-5 h-5 rounded-md flex items-center justify-center text-text-secondary hover:text-text-main hover:bg-canvas cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>

          <div className="py-2.5 space-y-2 text-xs">
            <div className="flex items-center justify-between text-label">
              <span className="text-text-secondary">وضعیت فعلی:</span>
              <span className="font-bold text-text-main">{stateLabel}</span>
            </div>

            <div className="flex items-center justify-between text-label">
              <span className="text-text-secondary">تغییرات معلق در صف:</span>
              <span className="font-mono font-bold text-primary">
                {toPersianDigits(pendingCount)} رکورد
              </span>
            </div>

            <div className="flex items-center justify-between text-label">
              <span className="text-text-secondary">آخرین همگام‌سازی موفق:</span>
              <span className="font-mono text-text-main">{formattedTime}</span>
            </div>

            {lastError && (
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-mini text-rose-700 dark:text-rose-400 font-medium">
                {lastError}
              </div>
            )}
          </div>

          <button type="button" onClick={() => { setIsPopoverOpen(false); navigate('/sync-center'); }} className="mb-2 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-xs font-bold text-text-main hover:bg-surface">مشاهده مرکز همگام‌سازی داده‌ها</button>
          <div className="pt-2 border-t border-border flex items-center gap-1.5">
            {state === 'failed' || state === 'retrying' ? (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isActionPending}
                className="flex-1 py-1.5 rounded-lg bg-primary text-white text-caption font-bold hover:bg-primary-hover flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={12} className={isActionPending ? 'animate-spin' : ''} />
                <span>تلاش مجدد</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isActionPending || pendingCount === 0}
                  className="flex-1 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-caption font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                  title="ارسال تغییرات محلی به پایگاه دادهٔ مرکزی"
                >
                  <ArrowUpCircle size={12} className={isActionPending ? 'animate-spin' : ''} />
                  <span>ارسال به سرور</span>
                </button>

                <button
                  type="button"
                  onClick={handleManualRetrieve}
                  disabled={isActionPending}
                  className="flex-1 py-1.5 rounded-lg bg-surface hover:bg-canvas border border-border text-text-main text-caption font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                  title="دریافت آخرین رکوردهای معتبر از پایگاه دادهٔ مرکزی"
                >
                  <ArrowDownCircle size={12} className={isActionPending ? 'animate-spin' : ''} />
                  <span>بازیابی داده</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
