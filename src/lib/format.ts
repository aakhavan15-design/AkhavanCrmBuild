/**
 * قالب‌بندی مرکزی اعداد و مبالغ — فقط fa-IR
 * همهٔ رندرهای عدد در UI باید از این توابع عبور کنند.
 */
import { toPersianDigits } from './digits';

const FA = 'fa-IR';
const wholeDecimalFormatter = new Intl.NumberFormat(FA);

/** Preserves the precision of decimal strings returned by SQL Server. */
export function formatDecimalString(value: string | null | undefined): string {
  const match = typeof value === 'string' && /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return 'نامشخص';
  const whole = wholeDecimalFormatter.format(BigInt(match[2]));
  const fraction = match[3]?.replace(/0+$/, '');
  const sign = match[1] && (BigInt(match[2]) !== 0n || fraction) ? '−' : '';
  return fraction ? `${sign}${whole}٫${toPersianDigits(fraction)}` : `${sign}${whole}`;
}

export function formatNumber(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions
): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return toPersianDigits(Number(value).toLocaleString(FA, options));
}

export function formatCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return toPersianDigits(Math.round(Number(value)).toLocaleString(FA));
}

export function formatPercent(
  value: number | null | undefined,
  fractionDigits = 1
): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const formatted = n.toLocaleString(FA, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: 0,
  });
  return `${toPersianDigits(formatted)}٪`;
}

/** مبلغ کامل با جداکننده هزارگان (برای Tooltip و جزئیات) */
export function formatMoney(
  value: number | null | undefined,
  unit = 'ریال'
): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const abs = Math.abs(Number(value));
  const sign = Number(value) < 0 ? '−' : '';
  return `${sign}${toPersianDigits(abs.toLocaleString(FA))} ${unit}`.trim();
}

/**
 * مبلغ فشرده برای کارت‌ها:
 * ≥ ۱ میلیارد → «۱٫۲ میلیارد ریال»
 * ≥ ۱ میلیون → «۴۶۸٫۶ میلیون ریال»
 * در غیر این صورت مبلغ کامل
 */
export function formatMoneyCompact(
  value: number | null | undefined,
  unit = 'ریال'
): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000_000) {
    const v = (abs / 1_000_000_000).toLocaleString(FA, { maximumFractionDigits: 1 });
    return `${sign}${toPersianDigits(v)} میلیارد ${unit}`.trim();
  }
  if (abs >= 1_000_000) {
    const v = (abs / 1_000_000).toLocaleString(FA, { maximumFractionDigits: 1 });
    return `${sign}${toPersianDigits(v)} میلیون ${unit}`.trim();
  }
  return formatMoney(n, unit);
}

export function formatChangeChip(change: number | null | undefined): string {
  if (change == null || Number.isNaN(Number(change))) return '';
  const n = Number(change);
  const arrow = n >= 0 ? '↑' : '↓';
  return `${arrow}${formatPercent(Math.abs(n))}`;
}
