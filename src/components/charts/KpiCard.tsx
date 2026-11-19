import React from 'react';
import { cn } from '../../lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { MiniChart } from './MiniChart';

export interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  change?: number | null;
  changeLabel?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  /** Compact density for dashboard/report grids; preserves the comfortable default. */
  density?: 'comfortable' | 'compact';
  /** Real, ordered time-series values only. No synthetic sparkline data is generated. */
  sparkline?: number[];
}

export function KpiCard({ label, value, unit, change, changeLabel, icon, onClick, className, loading, empty, emptyMessage = 'برای این بازه دادهٔ ثبت‌شده‌ای نیست', density = 'comfortable', sparkline }: KpiCardProps) {
  if (loading) return <div className={cn('rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 animate-pulse', className)}><div className="h-3 w-20 bg-[var(--c-sunken)] rounded mb-3" /><div className="h-7 w-28 bg-[var(--c-sunken)] rounded" /></div>;
  if (empty) return <div className={cn('rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4', className)}><div className="text-xs text-[var(--c-ink-muted)] mb-2">{label}</div><div className="text-2xl font-bold text-[var(--c-ink-faint)]">—</div><p className="mt-2 text-xs text-[var(--c-ink-muted)]">{emptyMessage}</p></div>;
  const compact = density === 'compact';
  const isUp = change != null && change >= 0;
  const isDown = change != null && change < 0;
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={cn('w-full text-start rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] transition-all duration-200', compact ? 'p-3 sm:p-3.5' : 'p-4', onClick && 'hover:border-[var(--c-primary)] hover:bg-[var(--c-hover)] hover:-translate-y-0.5 hover:shadow-sm cursor-pointer', className)}>
      <div className={cn('flex items-start justify-between gap-2', compact ? 'mb-1.5' : 'mb-2')}><span className={cn('font-medium text-[var(--c-ink-muted)]', compact ? 'text-micro sm:text-caption' : 'text-xs')}>{label}</span>{icon && <span className="text-[var(--c-ink-faint)]">{icon}</span>}</div>
      <div className="flex items-baseline gap-1.5 min-w-0"><span className={cn('font-bold text-[var(--c-ink-main)] tabular-nums truncate', compact ? 'text-xl sm:text-kpi' : 'text-2xl')}>{value}</span>{unit && <span className="text-xs text-[var(--c-ink-muted)]">{unit}</span>}</div>
      {sparkline && sparkline.length > 1 && <div className={cn('mt-1.5', compact ? 'max-w-28' : 'max-w-36')}><MiniChart data={sparkline} height={compact ? 24 : 30} /></div>}
      {(change != null || changeLabel) && (
        <div className="mt-2 flex items-center gap-1">
          {change != null && <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-caption font-medium', isUp && 'bg-[var(--c-success-soft)] text-[var(--c-success)]', isDown && 'bg-[var(--c-burgundy-soft)] text-[var(--c-burgundy)]')}>{isUp && <TrendingUp size={12} />}{isDown && <TrendingDown size={12} />}{Math.abs(change).toLocaleString('fa-IR')}٪</span>}
          {changeLabel && <span className="text-caption text-[var(--c-ink-faint)]">{changeLabel}</span>}
        </div>
      )}
    </button>
  );
}
export default KpiCard;
