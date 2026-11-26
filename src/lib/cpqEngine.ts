import type { QuoteLine, ExternalProduct, PriceWaterfallBreakdown } from '../types';

export interface PriceWaterfallParams {
  basePrice?: number;
  quantity: number;
  costPrice?: number;
  negotiatedUnitPrice?: number;
  appliedVolumeDiscountPercent?: number;
  contractRebatePercent?: number;
  bundleDiscountPercent?: number;
}

export function calculateQuoteLineMargin(
  line: QuoteLine,
  product?: ExternalProduct,
  threshold: number = 15
) {
  const unitCost = product?.costPrice ?? line.costPrice;
  const isCostKnown = typeof unitCost === 'number' && Number.isFinite(unitCost) && unitCost > 0;
  const revenue = Number.isFinite(line.lineTotal) ? line.lineTotal : (line.unitPrice * line.quantity);
  if (!isCostKnown || !Number.isFinite(revenue) || revenue <= 0 || !Number.isFinite(line.quantity) || line.quantity <= 0) {
    return { marginPercent: 0, marginAmount: 0, isBelowThreshold: true, isCostKnown: false };
  }
  const cost = unitCost * line.quantity;
  const profit = revenue - cost;
  const marginPercent = Math.round((profit / revenue) * 1000) / 10;

  return {
    marginPercent,
    marginAmount: profit,
    isBelowThreshold: marginPercent < threshold,
    isCostKnown: true
  };
}

export function calculatePriceWaterfall({
  basePrice = 0,
  quantity = 1,
  costPrice,
  negotiatedUnitPrice,
  appliedVolumeDiscountPercent = 0,
  contractRebatePercent = 0,
  bundleDiscountPercent = 0
}: PriceWaterfallParams): PriceWaterfallBreakdown {
  const totalBasePrice = (basePrice || 0) * quantity;
  const volumeDiscount = Math.round((totalBasePrice * (appliedVolumeDiscountPercent || 0)) / 100);
  const bundleDiscount = Math.round((totalBasePrice * (bundleDiscountPercent || 0)) / 100);
  const contractRebate = Math.round((totalBasePrice * (contractRebatePercent || 0)) / 100);

  const subtotalBeforeNegotiated = totalBasePrice - volumeDiscount - bundleDiscount - contractRebate;
  const targetNetPrice = negotiatedUnitPrice !== undefined 
    ? negotiatedUnitPrice * quantity 
    : subtotalBeforeNegotiated;

  const negotiatedDiscount = Math.max(0, subtotalBeforeNegotiated - targetNetPrice);
  const netPrice = targetNetPrice;
  const costKnown = typeof costPrice === 'number' && Number.isFinite(costPrice) && costPrice > 0;
  const totalCost = costKnown ? costPrice * quantity : 0;
  const grossMarginAmount = costKnown ? netPrice - totalCost : null;
  const grossMarginPercent = costKnown && netPrice > 0 ? Math.round((grossMarginAmount! / netPrice) * 1000) / 10 : null;

  return {
    basePrice: totalBasePrice,
    volumeDiscount,
    bundleDiscount,
    contractRebate,
    negotiatedDiscount,
    netPrice,
    costPrice: totalCost,
    grossMarginAmount,
    grossMarginPercent,
    costKnown
  };
}

/**
 * قفل ویرایش اقلام پیش‌فاکتور: پس از ثبت Price Snapshot (HANDOFF) یا خروج از وضعیت DRAFT،
 * قیمت و اقلام تاریخی نباید تغییر کنند (قابل‌بازسازی بودن شرایط). منبع واحد این قاعده همین تابع است.
 */
export function canEditQuoteLines(quote: { status?: string; pricingSnapshot?: unknown } | null | undefined): { ok: boolean; reason?: string } {
  if (!quote) return { ok: false, reason: 'پیش‌فاکتور یافت نشد.' };
  if (quote.pricingSnapshot) return { ok: false, reason: 'این پیش‌فاکتور تصویر لحظه‌ای قیمت لحظه‌ای دارد و اقلام آن قفل است.' };
  if (quote.status && quote.status !== 'DRAFT') return { ok: false, reason: 'فقط پیش‌فاکتور در وضعیت پیش‌نویس قابل ویرایش اقلام است.' };
  return { ok: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * موتور تراز سفارش بر مبنای کلاس قیمت منتخب + کلاس‌های قیمت
 * قواعد قفل‌شده:
 *  - همهٔ قیمت‌ها از ERP می‌آیند؛ واحد پول/مقیاس ثابت فرض نمی‌شود و CRM قیمتی نمی‌سازد.
 *  - قیمت همیشه به‌ازای واحد پایه است؛ تعداد کارتن × تعداد در کارتن = تعداد واحد پایه.
 *  - تراز ردیف = (فی واردشده − قیمت همان کالا در کلاس منتخب ERP) × تعداد پایه؛ کف مستقل ERP فقط سیاست جداگانه است.
 *  - داده نامعلوم هرگز صفر/یک فرض نمی‌شود (کف نامعلوم ⇒ ردیف از تراز بیرون و علامت‌دار).
 *  - محاسبات فقط برای قیمت‌های عدد صحیح فعلی فعال است؛ دقت اعشاری و مقیاس مبلغ تا قرارداد ERP تأیید نشده و نباید فرض شود.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const PRICE_CLASS_CODES = ['PRICE_CLASS_1', 'PRICE_CLASS_2', 'PRICE_CLASS_3', 'PRICE_CLASS_4', 'PRICE_CLASS_5'] as const;
export type PriceClassCode = typeof PRICE_CLASS_CODES[number];
export type BalanceState = 'POSITIVE' | 'NEGATIVE' | 'ZERO' | 'UNKNOWN';

/** برچسب پیش‌فرض فقط برای چهار کلاس اعلام‌شده؛ کلاس ۵ عمداً بدون نام است و حدس زده نمی‌شود. */
export const DEFAULT_PRICE_CLASS_LABELS: Partial<Record<PriceClassCode, string>> = {
  PRICE_CLASS_1: 'مویرگی',
  PRICE_CLASS_2: 'عمده',
  PRICE_CLASS_3: 'چکی',
  PRICE_CLASS_4: 'فروشگاهی'
};

export interface ErpPriceClassEntry { unitPrice: number; label?: string; currencyCode?: string }
export type ErpPriceClassMap = Partial<Record<PriceClassCode, ErpPriceClassEntry>>;

const positiveInt = (v: unknown): number | null => {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
  const latin = (t: string) => t.replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0)).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));
  const n = typeof v === 'number' ? v : Number(latin(String(v)).replace(/[,٬\s]/g, ''));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

export const normalizeErpPositiveInt = positiveInt;

/** فقط ریال در CRM معتبر است؛ نبود کد پول طبق قرارداد پروژه ریال است. تبدیل ضمنی تومان/ارز دیگر نداریم. */
export function isRialCurrencyCode(raw: unknown): boolean {
  if (raw === null || raw === undefined || String(raw).trim() === '') return true;
  return ['IRR', 'RIAL', 'RIALS', 'ریال'].includes(String(raw).trim().toUpperCase());
}

/**
 * پنج قیمت ERP را به مدل داخلی ریالی نرمال می‌کند.
 * ارز صریحاً غیرریالی رد می‌شود؛ مقدار بدون currencyCode طبق قرارداد این سامانه ریال است.
 */
export function normalizeErpPriceClasses(source: Record<string, unknown> | null | undefined): ErpPriceClassMap {
  const out: ErpPriceClassMap = {};
  if (!source) return out;
  const sourceCurrency = source.currencyCode ?? source.currency;
  if (!isRialCurrencyCode(sourceCurrency)) return out;
  const put = (code: string, raw: unknown, label?: unknown) => {
    if (!(PRICE_CLASS_CODES as readonly string[]).includes(code)) return;
    const entry = raw && typeof raw === 'object' ? raw as Record<string, unknown> : { unitPrice: raw, label };
    if (!isRialCurrencyCode(entry.currencyCode ?? sourceCurrency)) return;
    const unitPrice = positiveInt(entry.unitPrice ?? entry.price);
    if (unitPrice === null) return;
    const text = typeof (entry.label ?? label) === 'string' ? String(entry.label ?? label).trim() : '';
    out[code as PriceClassCode] = { unitPrice, ...(text ? { label: text } : {}), currencyCode: 'IRR' };
  };
  const nested = source.priceClasses;
  if (Array.isArray(nested)) nested.forEach(item => item && typeof item === 'object' && put(String((item as any).code ?? ''), item));
  else if (nested && typeof nested === 'object') Object.entries(nested as Record<string, unknown>).forEach(([code, value]) => put(code, value));
  PRICE_CLASS_CODES.forEach((code, index) => { if (!out[code]) put(code, source[`priceClass${index + 1}`], source[`priceClass${index + 1}Label`]); });
  return out;
}

/** ردیف‌های سفارش ERP را برای شروع پیشنهاد CPQ پیش‌پر می‌کند؛ اصل سفارش ERP تغییر نمی‌کند. */
export function buildDraftQuoteLinesFromErpOrder(
  order: Record<string, unknown>,
  products: Array<Record<string, any>>,
  priceClassCode: string
) {
  const sourceLines = Array.isArray(order.lines) ? order.lines as Array<Record<string, unknown>> : [];
  return sourceLines.map((source, index) => {
    const externalProductId = String(source.externalProductId ?? source.productId ?? source.productCode ?? '').trim();
    const product = products.find(item => [item.id, item.erpId, item.externalId, item.code, item.sku].some(value => String(value ?? '') === externalProductId));
    const unitsPerCarton = positiveInt(source.unitsPerCarton ?? product?.unitsPerCarton);
    const sourceMode = String(source.quantityMode ?? '').toUpperCase();
    const explicitCartons = positiveInt(source.cartonQuantity ?? (sourceMode === 'CARTON' ? source.quantity : undefined));
    const quantityMode = sourceMode === 'CARTON' || explicitCartons !== null ? 'CARTON' as const : 'BASE_UNIT' as const;
    const sourceQuantity = positiveInt(source.quantity) ?? 0;
    const quantity = quantityMode === 'CARTON'
      ? (explicitCartons !== null && unitsPerCarton !== null && Number.isSafeInteger(explicitCartons * unitsPerCarton) ? explicitCartons * unitsPerCarton : 0)
      : sourceQuantity;
    const sourceCurrency = source.currencyCode ?? source.currency ?? order.currencyCode ?? order.currency;
    const sourcePriceIsRial = isRialCurrencyCode(sourceCurrency);
    const unitPrice = sourcePriceIsRial ? (positiveInt(source.unitPrice ?? source.netUnitPrice) ?? 0) : 0;
    const classEntry = product?.priceClasses?.[priceClassCode];
    const classCurrency = classEntry?.currencyCode ?? product?.currencyCode ?? 'IRR';
    const erpClassUnitPrice = isRialCurrencyCode(classCurrency) ? positiveInt(classEntry?.unitPrice) : null;
    const erpClassCurrencyCode = erpClassUnitPrice === null ? null : 'IRR';
    const lineTotal = Number.isSafeInteger(quantity * unitPrice) ? quantity * unitPrice : 0;
    const balance = computeLineBalance({ key: String(index), comparisonPrice: erpClassUnitPrice, currencyCode: erpClassCurrencyCode, unitPrice, baseQuantity: quantity });
    return {
      productId: String(product?.id ?? externalProductId ?? `erp-line-${index + 1}`),
      productName: String(product?.name ?? source.productName ?? source.name ?? 'کالای نامشخص'),
      productCode: String(product?.sku ?? product?.code ?? source.productCode ?? externalProductId),
      quantity, unitPrice, costPrice: positiveInt(product?.costPrice) ?? 0, lineTotal,
      erpClassUnitPrice, erpClassCurrencyCode,
      cartonQuantity: quantityMode === 'CARTON' ? explicitCartons : null,
      unitsPerCarton: unitsPerCarton ?? null, quantityMode,
      lineVariance: balance.variance, balanceStatus: balance.status
    };
  });
}

export interface PriceClassLabelRow { code: PriceClassCode; label: string; source: 'ERP' | 'MANUAL' | 'DEFAULT' | 'NONE' }

/** برچسب کلاس‌ها: ERP ← تعریف دستی تنظیمات ← پیش‌فرض اعلام‌شده ← «کلاس قیمت N» (بدون حدس نام تجاری). */
export function resolvePriceClassLabels(
  manualLabels: Partial<Record<string, unknown>> | null | undefined,
  products: Array<{ priceClasses?: ErpPriceClassMap | null }> | null | undefined
): PriceClassLabelRow[] {
  return PRICE_CLASS_CODES.map((code, i) => {
    const fromErp = (products || []).map(p => p?.priceClasses?.[code]?.label).find(l => typeof l === 'string' && l.trim() !== '');
    if (fromErp) return { code, label: fromErp.trim(), source: 'ERP' as const };
    const manual = manualLabels?.[code];
    if (typeof manual === 'string' && manual.trim() !== '') return { code, label: manual.trim(), source: 'MANUAL' as const };
    const dflt = DEFAULT_PRICE_CLASS_LABELS[code];
    if (dflt) return { code, label: dflt, source: 'DEFAULT' as const };
    return { code, label: `کلاس قیمت ${i + 1}`, source: 'NONE' as const };
  });
}

export interface BalanceLineInput {
  key: string;
  /** کف مستقل ERP به‌ازای واحد پایه؛ null = نامعلوم */
  /** قیمت مرجع همان کلاس سراسری سفارش برای این کالا؛ از ERP */
  comparisonPrice: number | null | undefined;
  /** کف مستقل ERP فقط برای کنترل سیاست؛ در فرمول اختلاف کلاس استفاده نمی‌شود */
  floorPrice?: number | null;
  /** فی واردشدهٔ فروشنده به‌ازای واحد پایه */
  unitPrice: number | null | undefined;
  /** تعداد واحد پایه (= کارتن × تعداد در کارتن) */
  baseQuantity: number | null | undefined;
  unitsPerCarton?: number | null;
  currencyCode?: string | null;
}

export interface LineBalance {
  key: string;
  status: 'OK' | 'REFERENCE_UNKNOWN' | 'INVALID';
  state: BalanceState;
  comparisonPrice: number | null;
  floorPrice: number | null;
  currencyCode: string | null;
  unitPrice: number | null;
  baseQuantity: number | null;
  referenceAmount: number;
  enteredAmount: number;
  /** null وقتی قیمت کلاس منتخب نامعلوم یا ورودی نامعتبر باشد */
  variance: number | null;
}

const asSafeInt = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) ? v : null);
const stateOf = (n: number | null): BalanceState => (n === null ? 'UNKNOWN' : n > 0 ? 'POSITIVE' : n < 0 ? 'NEGATIVE' : 'ZERO');

export function computeLineBalance(input: BalanceLineInput): LineBalance {
  const reference = asSafeInt(input.comparisonPrice);
  const floor = asSafeInt(input.floorPrice);
  const price = asSafeInt(input.unitPrice);
  const qty = asSafeInt(input.baseQuantity);
  const rawCurrencyCode = typeof input.currencyCode === 'string' && input.currencyCode.trim() ? input.currencyCode.trim().toUpperCase() : null;
  const currencyCode = rawCurrencyCode ? (isRialCurrencyCode(rawCurrencyCode) ? 'IRR' : rawCurrencyCode) : null;
  const validEntry = price !== null && price > 0 && qty !== null && qty > 0;
  if (!validEntry) return { key: input.key, status: 'INVALID', state: 'UNKNOWN', comparisonPrice: reference, floorPrice: floor && floor > 0 ? floor : null, currencyCode, unitPrice: price, baseQuantity: qty, referenceAmount: 0, enteredAmount: 0, variance: null };
  const enteredAmount = price! * qty!;
  if (!Number.isSafeInteger(enteredAmount)) return { key: input.key, status: 'INVALID', state: 'UNKNOWN', comparisonPrice: reference, floorPrice: floor && floor > 0 ? floor : null, currencyCode, unitPrice: price, baseQuantity: qty, referenceAmount: 0, enteredAmount: 0, variance: null };
  if (reference === null || reference <= 0 || !currencyCode || !isRialCurrencyCode(rawCurrencyCode)) return { key: input.key, status: 'REFERENCE_UNKNOWN', state: 'UNKNOWN', comparisonPrice: reference, floorPrice: floor && floor > 0 ? floor : null, currencyCode, unitPrice: price, baseQuantity: qty, referenceAmount: 0, enteredAmount, variance: null };
  const referenceAmount = reference * qty!;
  const variance = (price! - reference) * qty!;
  if (!Number.isSafeInteger(referenceAmount) || !Number.isSafeInteger(variance)) return { key: input.key, status: 'INVALID', state: 'UNKNOWN', comparisonPrice: reference, floorPrice: floor && floor > 0 ? floor : null, currencyCode, unitPrice: price, baseQuantity: qty, referenceAmount: 0, enteredAmount: 0, variance: null };
  return { key: input.key, status: 'OK', state: stateOf(variance), comparisonPrice: reference, floorPrice: floor && floor > 0 ? floor : null, currencyCode, unitPrice: price, baseQuantity: qty, referenceAmount, enteredAmount, variance };
}

export interface OrderBalance {
  lines: LineBalance[];
  /** جمع تراز ردیف‌های معتبر در واحد پول یکسان */
  total: number;
  state: BalanceState;
  surplus: number;
  deficit: number;
  referenceAmount: number;
  enteredAmount: number;
  /** تراز نسبت به ارزش کف، به درصد با یک رقم اعشار؛ null اگر ردیف معتبری نباشد */
  ratioPercent: number | null;
  negativeLineCount: number;
  excludedLineCount: number;
  countedLineCount: number;
  currencyCode: string | null;
  currencyMismatch: boolean;
}

export function computeOrderBalance(inputs: BalanceLineInput[]): OrderBalance {
  const lines = inputs.map(computeLineBalance);
  const counted = lines.filter(l => l.variance !== null);
  const currencies = new Set(lines.map(line => line.currencyCode).filter((value): value is string => !!value));
  const currencyMismatch = currencies.size > 1 || [...currencies].some(value => !isRialCurrencyCode(value));
  const usable = currencyMismatch ? [] : counted;
  const total = usable.reduce((s, l) => s + (l.variance as number), 0);
  const referenceAmount = usable.reduce((s, l) => s + l.referenceAmount, 0);
  const enteredAmount = usable.reduce((s, l) => s + l.enteredAmount, 0);
  return {
    lines,
    total,
    state: usable.length === 0 ? 'UNKNOWN' : stateOf(total),
    surplus: usable.reduce((s, l) => s + Math.max(0, l.variance as number), 0),
    deficit: usable.reduce((s, l) => s + Math.max(0, -(l.variance as number)), 0),
    referenceAmount,
    enteredAmount,
    ratioPercent: referenceAmount > 0 ? Math.round((total / referenceAmount) * 1000) / 10 : null,
    negativeLineCount: usable.filter(l => (l.variance as number) < 0).length,
    excludedLineCount: lines.length - usable.length,
    countedLineCount: usable.length,
    currencyCode: currencies.size === 1 && !currencyMismatch ? 'IRR' : null,
    currencyMismatch
  };
}

export interface LineRecoverySuggestion {
  key: string;
  /** NONE = تراز سفارش صفر/مثبت است یا ردیف قابل محاسبه نیست */
  status: 'NONE' | 'AVAILABLE';
  reason?: 'ORDER_NOT_NEGATIVE' | 'LINE_NOT_COMPUTABLE';
  /** کسری سفارش که باید جبران شود (در واحد پول سفارش، مثبت) */
  orderDeficit: number;
  /** فی پیشنهادی همین ردیف (با تعداد فعلی) تا تراز کل صفر شود */
  price: null | { unitPrice: number; delta: number; deltaPercent: number | null };
  /** تعداد پیشنهادی با همان فی فعلی */
  quantity: null | {
    baseQuantity: number | null;
    cartons: number | null;
    extraCartons: number | null;
    effectiveBaseQuantity: number | null;
    /** وقتی فی ≤ کف است، افزایش تعداد تراز را بهتر نمی‌کند */
    unavailableReason?: 'PRICE_NOT_ABOVE_REFERENCE';
  };
}

const ceilDiv = (a: number, b: number) => Math.ceil(a / b);

/**
 * پیشنهاد لحظه‌ای برای یک ردیف تا «تراز کل سفارش» به صفر برسد (Advisory؛ هیچ‌چیز خودکار اعمال نمی‌شود):
 *  - فی پیشنهادی = قیمت کلاس منتخب + ⌈ کسری‌ِ باقی‌مانده بدون این ردیف ÷ تعداد پایهٔ فعلی ⌉ (رو به بالا ⇒ تراز هرگز کمتر از صفر نمی‌ماند)
 *  - تعداد پیشنهادی با همین فی = ⌈ کسری ÷ (فی − قیمت کلاس منتخب) ⌉ و تبدیل به کارتن (رو به بالا)
 * چون تابع خالص است، با هر تغییر تعداد/فی هر ردیف دوباره (همزمان) محاسبه می‌شود.
 */
export function suggestLineRecovery(inputs: BalanceLineInput[], key: string, opts: { priceRoundingStep?: number } = {}): LineRecoverySuggestion {
  const none = (reason: LineRecoverySuggestion['reason'], orderDeficit = 0): LineRecoverySuggestion => ({ key, status: 'NONE', reason, orderDeficit, price: null, quantity: null });
  const order = computeOrderBalance(inputs);
  const line = order.lines.find(l => l.key === key);
  if (!line || line.variance === null || line.comparisonPrice === null || line.unitPrice === null || line.baseQuantity === null) return none('LINE_NOT_COMPUTABLE');
  if (order.total >= 0) return none('ORDER_NOT_NEGATIVE');
  const others = order.total - line.variance;
  const needed = -others; // سهمی که این ردیف باید بدهد تا کل صفر شود
  const step = Number.isSafeInteger(opts.priceRoundingStep) && (opts.priceRoundingStep as number) > 1 ? (opts.priceRoundingStep as number) : 1;

  // پیشنهاد فی نباید از قیمت مرجع کلاس همین کالا پایین‌تر برود.
  let target = Math.max(line.comparisonPrice, line.comparisonPrice + ceilDiv(needed, line.baseQuantity));
  if (step > 1) target = ceilDiv(target, step) * step;
  const delta = target - line.unitPrice;
  const price = { unitPrice: target, delta, deltaPercent: line.unitPrice > 0 ? Math.round((delta / line.unitPrice) * 1000) / 10 : null };

  const surplusPerUnit = line.unitPrice - line.comparisonPrice;
  let quantity: LineRecoverySuggestion['quantity'];
  if (surplusPerUnit <= 0) {
    quantity = { baseQuantity: null, cartons: null, extraCartons: null, effectiveBaseQuantity: null, unavailableReason: 'PRICE_NOT_ABOVE_REFERENCE' };
  } else {
    const baseQuantity = ceilDiv(needed, surplusPerUnit);
    const upc = asSafeInt(inputs.find(i => i.key === key)?.unitsPerCarton);
    if (upc && upc > 0) {
      const cartons = ceilDiv(baseQuantity, upc);
      const currentCartons = ceilDiv(line.baseQuantity, upc);
      quantity = { baseQuantity, cartons, extraCartons: Math.max(0, cartons - currentCartons), effectiveBaseQuantity: cartons * upc };
    } else {
      quantity = { baseQuantity, cartons: null, extraCartons: null, effectiveBaseQuantity: baseQuantity };
    }
  }
  return { key, status: 'AVAILABLE', orderDeficit: -order.total, price, quantity };
}
