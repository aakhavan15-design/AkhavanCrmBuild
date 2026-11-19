/**
 * نرخ مالیات هاردکد نیست (قاعدهٔ مالک): نرخ هر کالا از ERP می‌آید (`taxRatePercent` روی کالا؛ ممکن است ۰، ۱۰، ۱۶ … باشد).
 * ترتیب: نرخ کالا ← نرخ سازمانی تنظیمات (جایگزین صریح) ← «نامشخص» (null؛ نرخ فرضی اعمال نمی‌شود).
 * ۰٪ نرخ معتبر است (کالای معاف) و با «نامشخص» فرق دارد.
 */
export interface TaxProductRef { id?: string; taxRatePercent?: unknown }
export interface TaxLineRef { productId?: string; lineTotal?: unknown; unitPrice?: unknown; quantity?: unknown }

export function normalizeTaxRate(raw: unknown): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export function resolveLineTaxRate(product: TaxProductRef | undefined, orgPercent?: unknown): { rate: number | null; source: 'PRODUCT' | 'ORG' | 'UNKNOWN' } {
  const own = normalizeTaxRate(product?.taxRatePercent);
  if (own !== null) return { rate: own, source: 'PRODUCT' };
  const org = normalizeTaxRate(orgPercent);
  return org !== null ? { rate: org, source: 'ORG' } : { rate: null, source: 'UNKNOWN' };
}

export interface QuoteTaxResult {
  /** جمع مالیات؛ null اگر نرخ حتی یک سطر نامشخص باشد */
  amount: number | null;
  byRate: Array<{ rate: number; taxable: number; tax: number }>;
  unknownLines: number;
}

/** تخفیف کل به‌نسبت مبلغ هر سطر بین سطرها پخش می‌شود؛ مالیات هر سطر با نرخ کالای خودش. */
export function computeQuoteTax(lines: TaxLineRef[], discountAmount: number, productsById: Map<string, TaxProductRef>, orgPercent?: unknown): QuoteTaxResult {
  const amounts = lines.map(l => {
    const t = Number.isFinite(Number(l.lineTotal)) ? Number(l.lineTotal) : Number(l.unitPrice) * Number(l.quantity);
    return Number.isFinite(t) && t > 0 ? t : 0;
  });
  const gross = amounts.reduce((s, a) => s + a, 0);
  const discount = Math.min(Math.max(0, Number(discountAmount) || 0), gross);
  const groups = new Map<number, number>();
  let unknownLines = 0;
  lines.forEach((l, i) => {
    if (amounts[i] <= 0) return;
    const net = gross > 0 ? amounts[i] - discount * (amounts[i] / gross) : 0;
    const { rate } = resolveLineTaxRate(l.productId ? productsById.get(l.productId) : undefined, orgPercent);
    if (rate === null) { unknownLines += 1; return; }
    groups.set(rate, (groups.get(rate) || 0) + net);
  });
  const byRate = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([rate, taxable]) => ({ rate, taxable: Math.round(taxable), tax: Math.round(taxable * rate / 100) }));
  return { amount: unknownLines > 0 ? null : byRate.reduce((s, r) => s + r.tax, 0), byRate, unknownLines };
}
