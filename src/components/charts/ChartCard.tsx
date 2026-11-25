import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Info } from 'lucide-react';
import { cn } from '../../lib/utils';
import { LoadingState } from '../ui/LoadingState';
import { ErrorState } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { ExportMenuButton } from '../ui/ExportMenuButton';

export interface ChartCardProps {
  title: string; periodLabel?: string; children?: React.ReactNode; onClick?: () => void;
  onExportExcel?: () => void; onExportCsv?: () => void; onShowSource?: () => void;
  className?: string; loading?: boolean; empty?: boolean; emptyMessage?: string; height?: number | string;
  error?: string; onRetry?: () => void; sourceLabel?: string; freshnessLabel?: string;
}

export function ChartCard({ title, periodLabel, children, onClick, onExportExcel, onExportCsv, onShowSource, className, loading, empty, emptyMessage = 'برای این بازه دادهٔ ثبت‌شده‌ای نیست', height, error, onRetry, sourceLabel, freshnessLabel }: ChartCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);
  return (
    <div className={cn('rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] relative min-w-0', onClick && 'cursor-pointer hover:border-[var(--c-primary)]/40', className)} onClick={onClick} style={height ? { minHeight: height } : undefined}>
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
        <div className="min-w-0 flex-1">
          <h3 className="wrap-break-word text-sm font-semibold text-text-main">
            {onClick ? <button type="button" className="text-start hover:underline"
              onClick={event => { event.stopPropagation(); onClick(); }}>{title}</button> : title}
          </h3>
          {periodLabel && <p className="mt-0.5 text-caption text-text-secondary">{periodLabel}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {(onExportExcel || onExportCsv) && <ExportMenuButton onExportExcel={onExportExcel} onExportCsv={onExportCsv} size={32} />}
          {onShowSource && <div ref={menuRef} className="relative">
            <button type="button" aria-label="گزینه‌های نمودار" aria-expanded={menuOpen} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--c-ink-muted)] hover:bg-[var(--c-hover)]" onClick={() => setMenuOpen(v => !v)}><MoreHorizontal size={18} /></button>
            {menuOpen && (
              <div className="absolute top-full mt-1 end-0 z-50 min-w-40 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] py-1 shadow-lg">
                {onShowSource && <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--c-hover)]" onClick={() => { onShowSource(); setMenuOpen(false); }}><Info size={16} /> منبع داده</button>}
              </div>
            )}
          </div>}
        </div>
      </div>
      <div className="px-4 pb-4 pt-1">
        {loading ? <LoadingState label="در حال دریافت دادهٔ نمودار" />
          : error ? <ErrorState surface="chart" title="دریافت نمودار ممکن نیست" description={error} onRetry={onRetry} />
          : empty ? <EmptyState surface="chart" title={emptyMessage} description="در بازه و دامنه انتخاب‌شده داده معتبر برای نمودار در دسترس نیست." /> : children}
        {(sourceLabel || freshnessLabel) && <p className="mt-2 text-caption text-text-secondary">
          {[sourceLabel, freshnessLabel].filter(Boolean).join(' · ')}
        </p>}
      </div>
    </div>
  );
}
export default ChartCard;
