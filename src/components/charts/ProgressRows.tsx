import React from 'react';
import { cn } from '../../lib/utils';
import { formatPercent } from '../../lib/format';

export interface ProgressRowItem {
  label: string;
  value: number; // 0–100
  change?: number | null;
  color?: string;
  onClick?: () => void;
}

interface ProgressRowsProps {
  items: ProgressRowItem[];
  className?: string;
  /** نوار تجمیعی تک‌خطی (برنده/بازنده/باز) */
  stacked?: { label: string; value: number; color: string }[];
  stackedTotalLabel?: string;
}

export function ProgressRows({ items, className, stacked, stackedTotalLabel }: ProgressRowsProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {stacked && stacked.length > 0 && (
        <div className="space-y-1.5">
          {stackedTotalLabel && (
            <div className="text-xs text-[var(--c-ink-muted)] mb-1">{stackedTotalLabel}</div>
          )}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--c-sunken)]">
            {stacked.map((s, i) => (
              <div
                key={i}
                className="h-full transition-all"
                style={{
                  width: `${Math.max(0, Math.min(100, s.value))}%`,
                  background: s.color || 'var(--c-primary)',
                }}
                title={`${s.label}: ${formatPercent(s.value)}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-1">
            {stacked.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-caption text-[var(--c-ink-secondary)]">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label} · {formatPercent(s.value)}
              </span>
            ))}
          </div>
        </div>
      )}
      {items.map((item, idx) => {
        const pct = Math.max(0, Math.min(100, item.value));
        const isUp = item.change != null && item.change >= 0;
        const isDown = item.change != null && item.change < 0;
        const Tag = item.onClick ? 'button' : 'div';
        return (
          <Tag
            key={idx}
            type={item.onClick ? 'button' : undefined}
            onClick={item.onClick}
            className={cn(
              'w-full text-start space-y-1',
              item.onClick && 'cursor-pointer hover:opacity-90'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[var(--c-ink-main)] truncate">{item.label}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-semibold tabular-nums text-[var(--c-ink-main)]">
                  {formatPercent(pct, 0)}
                </span>
                {item.change != null && (
                  <span
                    className={cn(
                      'text-caption font-medium tabular-nums rounded-full px-1.5 py-0.5',
                      isUp && 'bg-[var(--c-success-soft)] text-[var(--c-success)]',
                      isDown && 'bg-[var(--c-burgundy-soft)] text-[var(--c-burgundy)]',
                      !isUp && !isDown && 'bg-[var(--c-sunken)] text-[var(--c-ink-muted)]'
                    )}
                  >
                    {isUp ? '↑' : isDown ? '↓' : ''}
                    {formatPercent(Math.abs(item.change), 1)}
                  </span>
                )}
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--c-sunken)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: item.color || 'var(--c-primary)',
                }}
              />
            </div>
          </Tag>
        );
      })}
    </div>
  );
}

export default ProgressRows;
