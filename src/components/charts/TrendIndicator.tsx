import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { toPersianDigits } from '../../lib/digits';
import { cn } from '../../lib/utils';

export interface TrendIndicatorProps {
  value: number; // e.g. 12.4 or -5.2
  format?: 'percent' | 'number';
  label?: string; // e.g. 'نسبت به ماه قبل'
  inverted?: boolean; // if true, negative is good (e.g. expenses/debt)
  size?: 'sm' | 'md';
  variant?: 'badge' | 'text' | 'subtle';
  className?: string;
}

export function TrendIndicator({
  value,
  format = 'percent',
  label,
  inverted = false,
  size = 'sm',
  variant = 'badge',
  className
}: TrendIndicatorProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const isNeutral = value === 0 || Number.isNaN(value);

  // Determine good/bad semantics
  const isGood = inverted ? isNegative : isPositive;
  const isBad = inverted ? isPositive : isNegative;

  const formattedNum = toPersianDigits(Math.abs(Math.round(value * 10) / 10).toString());
  const displayValue = `${isPositive ? '+' : isNegative ? '-' : ''}${formattedNum}${format === 'percent' ? '٪' : ''}`;

  const textColor = isNeutral
    ? 'text-text-muted'
    : isGood
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-rose-600 dark:text-rose-400';

  const badgeBg = isNeutral
    ? 'bg-zinc-100 dark:bg-zinc-800 text-text-muted'
    : isGood
    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 font-medium tracking-tight select-none',
        size === 'sm' ? 'text-caption' : 'text-xs',
        variant === 'badge' && cn('px-1.5 py-0.5 rounded-full', badgeBg),
        variant === 'text' && textColor,
        variant === 'subtle' && cn(textColor, 'opacity-90'),
        className
      )}
      dir="ltr"
      title={label ? `${label}: ${displayValue}` : displayValue}
    >
      {isPositive && <TrendingUp size={size === 'sm' ? 12 : 14} className="shrink-0" />}
      {isNegative && <TrendingDown size={size === 'sm' ? 12 : 14} className="shrink-0" />}
      {isNeutral && <Minus size={size === 'sm' ? 12 : 14} className="shrink-0" />}
      
      <span className="font-semibold tabular-nums">{displayValue}</span>
      {label && (
        <span className="text-micro text-text-muted font-normal ps-0.5 font-sans" dir="rtl">
          {label}
        </span>
      )}
    </div>
  );
}
