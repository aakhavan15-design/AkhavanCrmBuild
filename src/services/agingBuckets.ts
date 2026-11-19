import { resolveCustomerBalanceView } from '../lib/receivableReconciliation.ts';
import type { DetailBalancesResult } from '../lib/receivableReconciliation.ts';
import { parseFlexibleDate } from '../lib/dateParse.ts';

/**
 * Pure aging helpers (no app imports) so they are unit-testable and shared by the engine and UI.
 */
export interface DynamicAgingBucket { key: string; label: string; fromDay: number; toDay: number | null; amount: number; invoiceCount: number }

/** مرزهای پیش‌فرض (روز) — فقط پیش‌فرض؛ با settings.agingBucketBounds قابل تغییر است. */
export const DEFAULT_AGING_BOUNDS = [30, 60, 90];

/** مرزهای نامعتبر (غیرعدد، صفر/منفی، تکراری) حذف و مرتب می‌شوند؛ اگر چیزی نماند پیش‌فرض برمی‌گردد. */
export function normalizeAgingBounds(bounds: unknown): number[] {
  const list = Array.isArray(bounds) ? bounds.map(Number).filter(n => Number.isFinite(n) && n >= 1).map(n => Math.floor(n)) : [];
  const unique = Array.from(new Set(list)).sort((a, b) => a - b);
  return unique.length ? unique : [...DEFAULT_AGING_BOUNDS];
}

/**
 * بازه‌بندی سنی با مرزهای دلخواه: «جاری» (سررسیدنشده) + بازه‌های بسته + یک بازه بدون سقف.
 * هر مبلغ دقیقاً در یک بازه قرار می‌گیرد (بدون هم‌پوشانی)؛ جمع بازه‌ها همیشه برابر جمع ورودی است.
 */
export function buildAgingBuckets(items: { days: number; amount: number }[], boundsInput: unknown = DEFAULT_AGING_BOUNDS): { buckets: DynamicAgingBucket[]; total: number; bucketSum: number; balanced: boolean; bounds: number[] } {
  const bounds = normalizeAgingBounds(boundsInput);
  const buckets: DynamicAgingBucket[] = [{ key: 'current', label: 'سررسیدنشده', fromDay: 0, toDay: 0, amount: 0, invoiceCount: 0 }];
  let from = 1;
  for (const bound of bounds) { buckets.push({ key: `d${from}_${bound}`, label: `${from} تا ${bound} روز`, fromDay: from, toDay: bound, amount: 0, invoiceCount: 0 }); from = bound + 1; }
  buckets.push({ key: `d${from}_plus`, label: `بیش از ${from - 1} روز`, fromDay: from, toDay: null, amount: 0, invoiceCount: 0 });
  let total = 0;
  for (const item of items) {
    if (!Number.isFinite(item.amount) || item.amount <= 0) continue;
    const days = Number.isFinite(item.days) ? item.days : 0;
    const bucket = days <= 0 ? buckets[0] : buckets.find(b => b.key !== 'current' && days >= b.fromDay && (b.toDay === null || days <= b.toDay)) || buckets[buckets.length - 1];
    bucket.amount += item.amount; bucket.invoiceCount += 1; total += item.amount;
  }
  const bucketSum = buckets.reduce((sum, b) => sum + b.amount, 0);
  return { buckets, total, bucketSum, balanced: Math.abs(total - bucketSum) < 0.5, bounds };
}

/** وضعیت‌هایی که فاکتور را «مطالبهٔ واقعی» نمی‌کنند (هم‌راستا با فیلتر داشبورد). */
export const NON_RECEIVABLE_INVOICE_STATUSES = ['DRAFT', 'CANCELLED', 'CANCELED', 'VOID', 'VOIDED', 'REJECTED'];
export const isReceivableInvoice = (invoice: { status?: string; deletedAt?: unknown; isDeleted?: unknown }): boolean => !(invoice.deletedAt || invoice.isDeleted) && !NON_RECEIVABLE_INVOICE_STATUSES.includes(String(invoice.status || '').toUpperCase());

/**
 * سنی مطالبات «تخمینی» از مانده دفتری (قاعدهٔ مالک): مانده بدهکار هر مشتری از «آخرین فاکتور» شروع می‌شود؛
 * اگر بدهی بیشتر از آن فاکتور بود به فاکتور قبل می‌رود و همین‌طور تا اول. تخصیص ثبت‌شده در CRM هیچ نقشی ندارد.
 * فاکتور بدون تاریخ سررسید قابل سنجش نیست؛ مبلغ بدون فاکتور مرتبط در `unattributed` می‌آید (نه حدس).
 */
export interface LedgerAgingInput { id?: string; name?: string; balance: number; invoices: Array<{ number?: string; total: number; date?: string; dueDate?: string }> }
export interface LedgerAgingCustomer { id: string; name: string; balance: number; covered: Array<{ invoiceNumber: string; date: string; dueDate: string; invoiceTotal: number; covered: number; days: number | null }>; unattributed: number }
export function estimateLedgerAging(customers: LedgerAgingInput[], asOf: Date = new Date()): { items: { days: number; amount: number }[]; unattributed: number; customers: LedgerAgingCustomer[] } {
  const dayMs = 86400000;
  const today = new Date(asOf.toISOString().slice(0, 10)).getTime();
  const items: { days: number; amount: number }[] = [];
  let unattributed = 0;
  const detail: LedgerAgingCustomer[] = [];
  for (const c of customers) {
    let remaining = Number.isFinite(c.balance) && c.balance > 0 ? c.balance : 0;
    if (remaining <= 0) continue;
    const row: LedgerAgingCustomer = { id: c.id || '', name: c.name || '', balance: remaining, covered: [], unattributed: 0 };
    const sorted = [...c.invoices].filter(i => Number(i.total) > 0).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    for (const inv of sorted) {
      if (remaining <= 0) break;
      const part = Math.min(remaining, Number(inv.total));
      remaining -= part;
      const due = inv.dueDate ? new Date(inv.dueDate).getTime() : NaN;
      if (!Number.isFinite(due)) { unattributed += part; row.unattributed += part; row.covered.push({ invoiceNumber: inv.number || '', date: inv.date || '', dueDate: '', invoiceTotal: Number(inv.total), covered: part, days: null }); continue; }
      const days = Math.max(0, Math.floor((today - new Date(new Date(due).toISOString().slice(0, 10)).getTime()) / dayMs));
      items.push({ days, amount: part });
      row.covered.push({ invoiceNumber: inv.number || '', date: inv.date || '', dueDate: String(inv.dueDate), invoiceTotal: Number(inv.total), covered: part, days });
    }
    unattributed += remaining; row.unattributed += remaining;
    detail.push(row);
  }
  return { items, unattributed, customers: detail };
}

/**
 * F0-16: ورودی مشترک «سنی تخمینی» برای همهٔ مصرف‌کنندگان (FinanceWorkspace، ReportEnginePanels، …).
 * مانده هر مشتری فقط از مانده دفتری (Σبدهکار−Σبستانکار تفصیلی×معین) می‌آید؛ مشتری بدون گردش/بدون مانده بدهکار حذف می‌شود
 * (نامشخص، نه صفر). فاکتورها فقط برای «پوشش از آخرین فاکتور به عقب» به‌کار می‌روند، نه برای مانده.
 */
export function buildLedgerAgingInputs(
  ledgerBalances: DetailBalancesResult | null | undefined,
  accounts: Array<{ id: string; name?: string; code?: string; detailAccountId?: string; externalDetailCode?: string }>,
  invoices: Array<{ status?: string; deletedAt?: unknown; isDeleted?: unknown; customerId?: string; accountId?: string; invoiceNumber?: string; totalAmount?: unknown; date?: string; dueDate?: string }>
): LedgerAgingInput[] {
  if (!ledgerBalances) return [];
  return accounts.flatMap(account => {
    const view = resolveCustomerBalanceView(ledgerBalances, account);
    if (view.kind !== 'OK' || view.total <= 0) return [];
    return [{
      id: account.id,
      name: account.name,
      balance: view.total,
      invoices: invoices
        .filter(inv => (inv.customerId === account.id || inv.accountId === account.id) && isReceivableInvoice(inv))
        .map(inv => ({ number: inv.invoiceNumber, total: Number(inv.totalAmount), date: inv.date, dueDate: inv.dueDate })),
    }];
  });
}

/**
 * قاعدهٔ مالک (LIFO): مانده دفتری مشتری از «آخرین فاکتور» به عقب بین فاکتورها پخش می‌شود.
 * مثال: مانده ۲۵ و فاکتورها ۳/۷/۸/۱۲ ⇒ فاکتور۴=۱۲ کامل، فاکتور۳=۸ کامل، فاکتور۲=۵ از ۷، فاکتور۱=۰.
 * ترتیب: تاریخ نزولی؛ هم‌تاریخ‌ها با شمارهٔ فاکتور نزولی (عددی)؛ سپس شناسه — قطعی و تکرارپذیر.
 * خروجی همیشه Σcovered + unattributed = مانده (بدون مبلغ ساختگی).
 */
export interface LifoInvoiceInput { id: string; total: number; date?: string; number?: string }
export interface LifoCoverage { id: string; covered: number }
const cmpInvoiceNewestFirst = (a: LifoInvoiceInput, b: LifoInvoiceInput): number => {
  const da = parseFlexibleDate(a.date), db = parseFlexibleDate(b.date);
  if (da !== db) return (db ?? -Infinity) - (da ?? -Infinity) > 0 ? 1 : -1;
  const n = String(b.number || '').localeCompare(String(a.number || ''), 'en', { numeric: true });
  return n !== 0 ? n : String(b.id).localeCompare(String(a.id));
};
export function allocateLifo(balance: number, invoices: LifoInvoiceInput[]): { rows: LifoCoverage[]; unattributed: number } {
  let remaining = Number.isFinite(balance) && balance > 0 ? balance : 0;
  const rows: LifoCoverage[] = [];
  for (const inv of [...invoices].filter(i => Number(i.total) > 0).sort(cmpInvoiceNewestFirst)) {
    const part = Math.min(remaining, Number(inv.total));
    remaining -= part;
    rows.push({ id: inv.id, covered: part });
  }
  return { rows, unattributed: remaining };
}

/**
 * مانده «تخمینی» هر فاکتور (LIFO از مانده دفتری مشتری). Map<شناسه فاکتور, مانده | null>:
 * null = نامشخص (مانده دفتری در دسترس نیست/بدون گردش/بدون مجوز)؛ 0 = کاملاً تسویه‌شده بر پایهٔ مانده.
 * فاکتورهای باطل/پیش‌نویس در Map نمی‌آیند.
 */
export function estimateInvoiceRemaining(
  ledgerBalances: DetailBalancesResult | null | undefined,
  accounts: Array<{ id: string; name?: string; code?: string; detailAccountId?: string; externalDetailCode?: string }>,
  invoices: Array<{ id: string; status?: string; deletedAt?: unknown; isDeleted?: unknown; customerId?: string; accountId?: string; invoiceNumber?: string; totalAmount?: unknown; date?: string }>
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const live = invoices.filter(isReceivableInvoice);
  for (const inv of live) out.set(inv.id, null);
  if (!ledgerBalances) return out;
  for (const account of accounts) {
    const view = resolveCustomerBalanceView(ledgerBalances, account);
    if (view.kind !== 'OK') continue;
    const mine = live.filter(inv => inv.customerId === account.id || inv.accountId === account.id);
    const { rows } = allocateLifo(view.total, mine.map(inv => ({ id: inv.id, total: Number(inv.totalAmount), date: inv.date, number: inv.invoiceNumber })));
    const byId = new Map(rows.map(r => [r.id, r.covered]));
    for (const inv of mine) out.set(inv.id, Number(inv.totalAmount) > 0 ? (byId.get(inv.id) ?? 0) : 0);
  }
  return out;
}
