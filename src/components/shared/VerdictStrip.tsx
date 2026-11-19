import React from 'react';
import { AlertTriangle, CheckCircle2, Info, ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface VerdictStripProps {
  verdict: string;
  magnitude?: string;
  tone?: 'danger' | 'warning' | 'success' | 'info' | 'neutral';
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function VerdictStrip({
  verdict,
  magnitude,
  tone = 'neutral',
  actionLabel,
  onAction,
  className
}: VerdictStripProps) {
  const iconMap = {
    danger: <AlertTriangle size={15} className="text-danger shrink-0" />,
    warning: <AlertTriangle size={15} className="text-warning shrink-0" />,
    success: <CheckCircle2 size={15} className="text-success shrink-0" />,
    info: <Info size={15} className="text-info shrink-0" />,
    neutral: <Info size={15} className="text-text-secondary shrink-0" />
  };

  const toneClasses = {
    danger: 'bg-danger-soft/60 border-danger-border text-danger',
    warning: 'bg-warning-soft/60 border-warning-border text-warning',
    success: 'bg-success-soft/60 border-success-border text-success',
    info: 'bg-info-soft/60 border-info-border text-info',
    neutral: 'bg-canvas border-border text-text-secondary'
  };

  return (
    <div
      role="status"
      className={cn(
        'crm-verdict-strip flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border text-label font-medium select-none',
        toneClasses[tone],
        className
      )}
      dir="rtl"
    >
      <div className="flex items-center gap-2 min-w-0">
        {iconMap[tone]}
        <span className="font-semibold text-text-main truncate">{verdict}</span>
        {magnitude && (
          <span className="font-mono font-bold tabular-nums text-text-secondary hidden sm:inline">
            · {magnitude}
          </span>
        )}
      </div>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1 text-caption font-bold text-primary hover:underline shrink-0 cursor-pointer"
        >
          <span>{actionLabel}</span>
          <ArrowUpRight size={13} />
        </button>
      )}
    </div>
  );
}
