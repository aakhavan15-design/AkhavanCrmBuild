import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Info } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ExportMenuButton } from '../ui/ExportMenuButton';

export interface ChartCardProps {
  title: string; periodLabel?: string; children: React.ReactNode; onClick?: () => void;
  onExportExcel?: () => void; onExportCsv?: () => void; onShowSource?: () => void;
  className?: string; loading?: boolean; empty?: boolean; emptyMessage?: string; height?: number | string;
}

export function ChartCard({ title, periodLabel, children, onClick, onExportExcel, onExportCsv, onShowSource, className, loading, empty, emptyMessage = 'برای این بازه دادهٔ ثبت‌شده‌ای نیست', height }: ChartCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);
  return (
    <div className={cn('rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] overflow-hidden', onClick && 'cursor-pointer hover:border-[var(--c-primary)]/40', className)} onClick={onClick} style={height ? { minHeight: height } : undefined}>
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
        <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-[var(--c-ink-main)] truncate">{title}</h3>{periodLabel && <p className="text-caption text-[var(--c-ink-faint)] mt-0.5">{periodLabel}</p>}</div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {(onExportExcel || onExportCsv) && <ExportMenuButton onExportExcel={onExportExcel} onExportCsv={onExportCsv} size={32} />}
          <div ref={menuRef} className="relative">
            <button type="button" aria-label="منوی کارت" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--c-ink-muted)] hover:bg-[var(--c-hover)]" onClick={() => setMenuOpen(v => !v)}><MoreHorizontal size={18} /></button>
            {menuOpen && (
              <div className="absolute top-full mt-1 end-0 z-50 min-w-40 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] py-1 shadow-lg">
                {onShowSource && <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--c-hover)]" onClick={() => { onShowSource(); setMenuOpen(false); }}><Info size={16} /> منبع داده</button>}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="px-4 pb-4 pt-1">{loading ? <div className="h-40 animate-pulse rounded-lg bg-[var(--c-sunken)]" /> : empty ? <div className="flex flex-col items-center justify-center h-36 text-center"><p className="text-sm text-[var(--c-ink-muted)]">{emptyMessage}</p></div> : children}</div>
    </div>
  );
}
export default ChartCard;
