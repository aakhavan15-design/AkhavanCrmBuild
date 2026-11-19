import React, { useState } from 'react';
import { RefreshCw, Database, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ErpContextService } from '../../services/erpContextService';

export interface DataSourceStatusProps {
  source?: 'ERP' | 'CRM' | 'LOCAL' | 'HYBRID';
  sourceName?: string;
  lastSyncedAt?: string;
  isAuthoritative?: boolean;
  onRefresh?: () => Promise<void> | void;
  className?: string;
}

const contextService = new ErpContextService();

export function DataSourceStatus({
  source = 'CRM',
  sourceName,
  lastSyncedAt,
  isAuthoritative = true,
  onRefresh,
  className
}: DataSourceStatusProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      contextService.invalidate();
      await onRefresh();
      setJustRefreshed(true);
      setTimeout(() => setJustRefreshed(false), 2000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const sourceLabel = source === 'ERP' ? 'سامانه مالی' : source === 'CRM' ? 'سامانه داخلی' : source === 'HYBRID' ? 'منابع ترکیبی' : 'ذخیره‌سازی محلی';
  const trustLabel = source === 'ERP' && isAuthoritative ? 'سند رسمی معتبر' : source === 'CRM' ? 'داده ثبت‌شده در سامانه' : isAuthoritative ? 'منبع معتبر' : 'برآورد عملیاتی';

  const formattedTime = lastSyncedAt
    ? new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(lastSyncedAt))
    : 'زمان به‌روزرسانی ثبت نشده';

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2.5 px-3 py-2 rounded-xl bg-canvas border border-border text-xs text-text-secondary select-none",
        className
      )}
      dir="rtl"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1 font-bold text-text-main">
          <Database size={13} className="text-primary" />
          <span>منبع داده: {sourceName || sourceLabel}</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-success-soft text-success border border-success-border">
          <span className={cn("w-1.5 h-1.5 rounded-full", source === 'ERP' && isAuthoritative ? "bg-success" : source === 'LOCAL' ? "bg-slate-400" : "bg-primary")} />
          {trustLabel}
        </span>
        <span className="text-mini text-text-secondary font-mono">
          به‌روزرسانی: {formattedTime}
        </span>
      </div>

      {onRefresh && <button
        type="button"
        onClick={handleRefresh}
        disabled={isRefreshing}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-caption font-bold transition-all cursor-pointer",
          justRefreshed 
            ? "bg-success-soft text-success" 
            : "bg-surface hover:bg-canvas text-text-main border border-border shadow-xs"
        )}
        title="دریافت دوباره اطلاعات از منبع"
      >
        {justRefreshed ? (
          <>
            <CheckCircle2 size={13} className="text-success" />
            <span>به‌روز شد</span>
          </>
        ) : (
          <>
            <RefreshCw size={13} className={cn("text-primary", isRefreshing && "animate-spin")} />
            <span>{isRefreshing ? 'در حال دریافت...' : 'به‌روزرسانی'}</span>
          </>
        )}
      </button>}
    </div>
  );
}
