import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { formatNumber } from '../../lib/format';
import { cn } from '../../lib/utils';
import { Sparkline } from './Sparkline';

export interface KpiCardProps {
  label:string;
  value:ReactNode;
  unit?:string;
  description?:string;
  change?:number|null;
  changeLabel?:string;
  icon?:ReactNode;
  onClick?:()=>void;
  className?:string;
  loading?:boolean;
  empty?:boolean;
  emptyMessage?:string;
  density?:'comfortable'|'compact';
  /** An ordered series of observed, comparable values. */
  sparkline?:number[];
  sparklineLabel?:string;
}

export function KpiCard({label,value,unit,description,change,changeLabel,icon,onClick,className,loading,empty,
  emptyMessage='برای این بازه دادهٔ ثبت‌شده‌ای نیست',density='comfortable',sparkline,sparklineLabel}:KpiCardProps) {
  const compact=density==='compact';
  const card=cn('flex h-full min-w-0 w-full flex-col items-start rounded-2xl border border-border bg-surface text-start',
    compact ? 'p-2.5 sm:p-3' : 'p-4',className);
  if (loading) return <div className={card} aria-busy="true" aria-label={`در حال دریافت ${label}`}>
    <div className="mb-3 h-3 w-14 rounded bg-canvas motion-safe:animate-pulse" />
    <div className="h-6 w-20 rounded bg-canvas motion-safe:animate-pulse" />
  </div>;
  const delta=typeof change==='number' && Number.isFinite(change) ? change : null;
  const hasTrend=Boolean(sparkline && sparkline.length>1 && sparkline.every(Number.isFinite));
  const contents=<>
    <span className="mb-1.5 flex w-full items-start justify-between gap-2 text-caption font-medium text-text-secondary">
      <span>{label}</span>{icon && <span className="shrink-0 text-text-secondary" aria-hidden="true">{icon}</span>}
    </span>
    <span className="flex w-full flex-wrap items-baseline gap-x-1.5">
      <span className={cn('min-w-0 wrap-break-word font-bold tabular-nums text-text-main',compact ? 'text-base sm:text-lg' : 'text-xl')}>
        {empty ? 'نامشخص' : value}
      </span>{unit && !empty && <span className="text-caption text-text-secondary">{unit}</span>}
    </span>
    {empty ? <span className="mt-1 text-caption text-text-secondary">{emptyMessage}</span> : <>
      {(delta!==null || changeLabel) && <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption">
        {delta!==null && <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-1.5 py-0.5 font-semibold text-text-main">
          {delta>0 ? <TrendingUp size={12} aria-hidden="true"/> : delta<0 ? <TrendingDown size={12} aria-hidden="true"/> : null}
          <bdi>{delta>0 ? '+' : ''}{formatNumber(delta,{maximumFractionDigits:1})}٪</bdi>
        </span>}
        {changeLabel && <span className="text-text-secondary">{changeLabel}</span>}
      </span>}
      {hasTrend && <span className="mt-1.5 min-w-0 max-w-full" role={sparklineLabel ? 'img' : undefined} aria-label={sparklineLabel}>
        <Sparkline values={sparkline} width={compact ? 64 : 96} height={compact ? 20 : 28} />
      </span>}
      {description && <span className="mt-1 text-caption leading-relaxed text-text-secondary">{description}</span>}
    </>}
  </>;
  return onClick && !empty ? <button type="button" onClick={onClick}
    className={cn(card,'cursor-pointer hover:border-primary/40 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-safe:transition-colors')}>
    {contents}
  </button> : <div className={card}>{contents}</div>;
}

export default KpiCard;
