import type { AppState } from '../types';

/**
 * سیاست‌های قابل‌پیکربندی سازمان (منبع واحد). مقدار از state.settings.orgConfig خوانده می‌شود.
 * ⚠ LEGACY_*: مقدارهای پیش‌فرض تاریخی کد (هاردکد قبلی) برای حفظ رفتار فعلی در نبود تنظیم؛
 *   تعیین عدد درست یک تصمیم کسب‌وکاری است و باید در تنظیمات سازمان مقداردهی شود.
 */
export const LEGACY_HIGH_VALUE_QUOTE_THRESHOLD = 100_000_000;
export const LEGACY_DEFAULT_CREDIT_LIMIT = 100_000_000;

const cfg = (state?: Pick<AppState, 'settings'> | null): Record<string, unknown> => {
  const value = (state?.settings as Record<string, unknown> | undefined)?.orgConfig;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
};
const positive = (v: unknown): number | undefined => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined; };

export const getHighValueQuoteThreshold = (state?: Pick<AppState, 'settings'> | null): number => positive(cfg(state).highValueQuoteThreshold) ?? LEGACY_HIGH_VALUE_QUOTE_THRESHOLD;
export const getDefaultCreditLimit = (state?: Pick<AppState, 'settings'> | null): number => positive(cfg(state).defaultCreditLimit) ?? LEGACY_DEFAULT_CREDIT_LIMIT;

/** نام سازمان (tenant) از تنظیمات؛ در نبود مقدار رشته‌ی خالی برمی‌گردد و UI به نام محصول برمی‌گردد. */
export const getTenantName = (state?: Pick<AppState, 'settings'> | null): string => {
  const v = cfg(state).tenantName;
  return typeof v === 'string' ? v.trim() : '';
};

/** سیاست هشدار ریزش مشتری؛ تا وقتی هر دو مقدار در تنظیمات سازمان تعریف نشده باشد null (هشداری تولید نمی‌شود، عدد پیش‌فرض نداریم). */
export const getChurnRiskPolicy = (state?: Pick<AppState, 'settings'> | null): { days: number; minSales: number } | null => {
  const days = positive(cfg(state).churnRiskDays); const minSales = positive(cfg(state).churnRiskMinSales);
  return days && minSales ? { days, minSales } : null;
};

/** Explicitly configured terms for a non-posting customer late-fee preview.
 * No default rate, grace period or cap. This setting is not legal or accounting approval.
 */
export interface CustomerLateFeePolicy { code:string; version:number; effectiveFrom:string; effectiveTo?:string; dailyRatePercent:number; graceDays:number; capRials:number }
export function getCustomerLateFeePolicy(state: Pick<AppState,'settings'> | null | undefined, asOf:string): CustomerLateFeePolicy | null {
  const value=cfg(state).customerLateFeePolicy;
  if(!value || typeof value!=='object' || Array.isArray(value))return null;
  const p=value as Record<string,unknown>;
  const date=(v:unknown): v is string=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
  if(!date(asOf) || p.enabled!==true || typeof p.code!=='string' || !p.code.trim() || !Number.isSafeInteger(p.version) || Number(p.version)<1
    || !date(p.effectiveFrom) || p.effectiveFrom>asOf || (p.effectiveTo!=null && (!date(p.effectiveTo) || p.effectiveTo<asOf || p.effectiveTo<p.effectiveFrom))
    || typeof p.dailyRatePercent!=='number' || !Number.isFinite(p.dailyRatePercent) || p.dailyRatePercent<0 || p.dailyRatePercent>100
    || typeof p.graceDays!=='number' || !Number.isSafeInteger(p.graceDays) || p.graceDays<0
    || typeof p.capRials!=='number' || !Number.isSafeInteger(p.capRials) || p.capRials<0)return null;
  return {code:p.code.trim(),version:Number(p.version),effectiveFrom:p.effectiveFrom,effectiveTo:typeof p.effectiveTo==='string'?p.effectiveTo:undefined,dailyRatePercent:p.dailyRatePercent,graceDays:p.graceDays,capRials:p.capRials};
}
