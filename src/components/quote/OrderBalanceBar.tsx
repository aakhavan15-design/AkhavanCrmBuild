import React from 'react';
import { Scale } from 'lucide-react';
import type { BalanceState, OrderBalance } from '../../lib/cpqEngine';
import { cn } from '../../lib/utils';
import { formatNumber } from '../../lib/format';

/** مقدار پولی با علامت صریح (علامت + متن؛ فقط رنگ نیست). */
export function formatSignedAmount(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const abs = formatNumber(Math.abs(n));
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : abs;
}

export const BALANCE_TONE: Record<BalanceState, { box: string; text: string; label: string }> = {
  POSITIVE: { box: 'bg-success-soft border-success-line', text: 'text-success', label: 'تراز مثبت' },
  NEGATIVE: { box: 'bg-danger-soft border-danger-line', text: 'text-danger', label: 'تراز منفی (کسری)' },
  ZERO: { box: 'bg-sunken border-border', text: 'text-ink', label: 'برابر کلاس منتخب' },
  UNKNOWN: { box: 'bg-sunken border-border', text: 'text-ink-soft', label: 'تراز نامعلوم' }
};

interface Props {
  balance: OrderBalance;
  /** قلمِ در حال درج در جمع لحاظ شده است */
  includesPending?: boolean;
  className?: string;
}

/**
 * نوار تراز کل سفارش: همیشه بالای محتوای اسکرول‌شونده می‌ماند (sticky) و با هر تغییر تعداد/فی آنی به‌روز می‌شود.
 * مقدار تراز ثابت و در یک نقطه است؛ «نرخ تراز» = تراز ÷ ارزش کلاس منتخب.
 */
export function OrderBalanceBar({ balance, includesPending = false, className }: Props) {
  const tone = BALANCE_TONE[balance.state];
  const ratio = balance.ratioPercent;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="order-balance-bar"
      className={cn('sticky top-0 z-20 -mx-4 px-4 py-2 border-b backdrop-blur-sm', tone.box, className)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className={cn('flex items-center gap-1.5 text-caption font-bold', tone.text)}>
            <Scale size={14} aria-hidden /> {tone.label}
          </div>
          <div className="text-micro text-ink-soft truncate">
            {formatNumber(balance.countedLineCount)} قلم محاسبه‌شده
            {balance.negativeLineCount > 0 && ` · ${formatNumber(balance.negativeLineCount)} قلم پایین‌تر از کلاس منتخب`}
            {balance.excludedLineCount > 0 && ` · ${formatNumber(balance.excludedLineCount)} قلم بدون قیمت کلاس`}
            {includesPending && ' · شامل قلم در حال درج'}
          </div>
        </div>
        <div className="text-left shrink-0">
          <div className={cn('font-mono font-extrabold text-lead leading-tight', tone.text)} dir="ltr">
            <bdi>{balance.state === 'UNKNOWN' ? '—' : formatSignedRial(balance.total)}</bdi>
            <span className="text-micro font-bold mr-1"> {balance.currencyCode || 'واحد پول نامشخص'}</span>
          </div>
          <div className={cn('text-micro font-bold', tone.text)} dir="ltr">
            {ratio === null ? 'نرخ تراز: —' : `نرخ تراز: ${ratio > 0 ? '+' : ratio < 0 ? '−' : ''}${formatNumber(Math.abs(ratio), { maximumFractionDigits: 1 })}٪`}
          </div>
        </div>
      </div>
    </div>
  );
}
