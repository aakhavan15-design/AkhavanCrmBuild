import type { DetailBalancesResult } from '../lib/receivableReconciliation.ts';
import { resolveCustomerBalanceView } from '../lib/receivableReconciliation.ts';
import { DAY_MS, parseFlexibleDate } from '../lib/dateParse.ts';
import { allocateLifo, buildAgingBuckets, isReceivableInvoice } from './agingBuckets.ts';

/**
 * موتور واحد گزارش‌های مطالبات بر پایهٔ تخصیص LIFO مانده دفتری (قاعدهٔ مالک، ۱۴۰۵/۰۸/۲۶):
 * مانده هر مشتری فقط از دفتر می‌آید؛ از آخرین فاکتور به عقب روی فاکتورها پخش می‌شود؛
 * همهٔ گزارش‌ها (تجزیهٔ سنی، میانگین سن مطالبات، فاکتورهای خارج از مهلت، به‌تفکیک فروشنده، Drill-down) از همین سطرها ساخته می‌شوند.
 * هیچ مبلغی از وضعیت/پرداخت فاکتور ساخته نمی‌شود.
 */
export interface ReceivableAccountRef { id: string; name?: string; code?: string; detailAccountId?: string; externalDetailCode?: string }
export interface ReceivableInvoiceRef {
  id: string; status?: string; deletedAt?: unknown; isDeleted?: unknown;
  customerId?: string; accountId?: string; invoiceNumber?: string; totalAmount?: unknown; date?: string; dueDate?: string;
  ownerId?: string; sellerId?: string; salesRepId?: string; sellerCode?: string; sellerName?: string;
}
export interface ReceivableInvoiceRow {
  invoiceId: string; invoiceNumber: string; customerId: string; customerName: string;
  sellerKey: string; sellerCode: string; date: string; dueDate: string;
  total: number; outstanding: number;
  /** روز از تاریخ فاکتور؛ null اگر تاریخ فاکتور نامعتبر باشد */
  ageDays: number | null;
  /** روز گذشته از سررسید (تاریخ سررسید فاکتور، یا تاریخ فاکتور + مهلت مجاز)؛ null = سررسید قابل‌سنجش نیست */
  overdueDays: number | null;
  /** از مهلت مجاز گذشته؟ null اگر مهلت مجاز تعریف نشده یا سن قابل‌سنجش نیست */
  exceedsAllowed: boolean | null;
}
export interface SellerReceivableSummary { sellerKey: string; sellerCode: string; outstanding: number; invoiceCount: number; avgAgeDays: number | null; overAllowedAmount: number | null }
export interface ReceivableLifoReport {
  rows: ReceivableInvoiceRow[];
  totalOutstanding: number;
  invoiceCount: number;
  /** میانگین سن مطالبات (وزنی با مانده هر فاکتور)؛ null اگر هیچ فاکتوری سن‌دار نیست */
  avgAgeDays: number | null;
  /** مبلغ مانده‌ای که فاکتوری برای پوشش آن نیست (مانده دفتری > جمع فاکتورها) */
  unattributed: number;
  /** مبلغ مانده‌ای که سررسید آن قابل‌سنجش نیست (نه تاریخ سررسید، نه مهلت مجاز) */
  unknownDueAmount: number;
  aging: ReturnType<typeof buildAgingBuckets>;
  bySeller: SellerReceivableSummary[];
  overAllowed: ReceivableInvoiceRow[];
  allowedDays: number | null;
}

/** کلید یکسان فروشنده: ownerId | sellerId | salesRepId | sellerCode (تهی = UNASSIGNED) */
export function resolveSellerKey(inv: { ownerId?: string; sellerId?: string; salesRepId?: string; sellerCode?: string }): string {
  return String(inv.ownerId || inv.sellerId || inv.salesRepId || inv.sellerCode || '').trim() || 'UNASSIGNED';
}
const sellerOf = (inv: ReceivableInvoiceRef): { key: string; code: string } => {
  const key = resolveSellerKey(inv);
  return { key, code: String(inv.sellerCode || (key === 'UNASSIGNED' ? '' : key)).trim() };
};
const wavg = (rows: ReceivableInvoiceRow[]): number | null => {
  const known = rows.filter(r => r.ageDays !== null && r.outstanding > 0);
  const sum = known.reduce((s, r) => s + r.outstanding, 0);
  return sum > 0 ? Math.round(known.reduce((s, r) => s + (r.ageDays as number) * r.outstanding, 0) / sum * 10) / 10 : null;
};

export function normalizeAllowedDays(raw: unknown): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export function buildReceivableLifoReport(
  ledgerBalances: DetailBalancesResult | null | undefined,
  accounts: ReceivableAccountRef[],
  invoices: ReceivableInvoiceRef[],
  options: { asOf?: Date; allowedDays?: unknown; agingBounds?: unknown } = {}
): ReceivableLifoReport {
  const allowedDays = normalizeAllowedDays(options.allowedDays);
  const asOf = options.asOf || new Date();
  const today = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const rows: ReceivableInvoiceRow[] = [];
  let unattributed = 0;
  const live = invoices.filter(isReceivableInvoice);
  if (ledgerBalances) {
    for (const account of accounts) {
      const view = resolveCustomerBalanceView(ledgerBalances, account);
      if (view.kind !== 'OK' || !(view.total > 0)) continue;
      const mine = live.filter(inv => inv.customerId === account.id || inv.accountId === account.id);
      const byId = new Map(mine.map(inv => [inv.id, inv]));
      const alloc = allocateLifo(view.total, mine.map(inv => ({ id: inv.id, total: Number(inv.totalAmount), date: inv.date, number: inv.invoiceNumber })));
      unattributed += alloc.unattributed;
      for (const part of alloc.rows) {
        if (!(part.covered > 0)) continue;
        const inv = byId.get(part.id) as ReceivableInvoiceRef;
        const d = parseFlexibleDate(inv.date);
        const explicitDue = parseFlexibleDate(inv.dueDate);
        const due = explicitDue !== null ? explicitDue : d !== null && allowedDays !== null ? d + allowedDays * DAY_MS : null;
        const ageDays = d === null ? null : Math.max(0, Math.floor((today - d) / DAY_MS));
        const seller = sellerOf(inv);
        rows.push({
          invoiceId: inv.id, invoiceNumber: String(inv.invoiceNumber || ''), customerId: account.id, customerName: String(account.name || ''),
          sellerKey: seller.key, sellerCode: seller.code, date: String(inv.date || ''), dueDate: String(inv.dueDate || ''),
          total: Number(inv.totalAmount), outstanding: part.covered, ageDays,
          overdueDays: due === null ? null : Math.max(0, Math.floor((today - due) / DAY_MS)),
          exceedsAllowed: allowedDays === null || ageDays === null ? null : ageDays > allowedDays,
        });
      }
    }
  }
  const known = rows.filter(r => r.overdueDays !== null);
  const aging = buildAgingBuckets(known.map(r => ({ days: r.overdueDays as number, amount: r.outstanding })), options.agingBounds);
  const groups = new Map<string, ReceivableInvoiceRow[]>();
  for (const r of rows) groups.set(r.sellerKey, [...(groups.get(r.sellerKey) || []), r]);
  const bySeller: SellerReceivableSummary[] = [...groups.entries()].map(([sellerKey, list]) => ({
    sellerKey, sellerCode: list[0].sellerCode, outstanding: list.reduce((s, r) => s + r.outstanding, 0), invoiceCount: list.length,
    avgAgeDays: wavg(list),
    overAllowedAmount: allowedDays === null ? null : list.filter(r => r.exceedsAllowed === true).reduce((s, r) => s + r.outstanding, 0),
  })).sort((a, b) => b.outstanding - a.outstanding);
  return {
    rows, totalOutstanding: rows.reduce((s, r) => s + r.outstanding, 0), invoiceCount: rows.length, avgAgeDays: wavg(rows),
    unattributed, unknownDueAmount: rows.filter(r => r.overdueDays === null).reduce((s, r) => s + r.outstanding, 0),
    aging, bySeller, allowedDays,
    overAllowed: rows.filter(r => r.exceedsAllowed === true).sort((a, b) => (b.ageDays || 0) - (a.ageDays || 0)),
  };
}

/**
 * نمای «اولویت وصول» (زون/جغرافیا/وظایف) بر پایهٔ همان گزارش LIFO؛ هم‌شکل با ReceivableReconciliation تا مصرف‌کنندگان قدیمی
 * (GeoIntelligenceWorkspace) بدون تغییر ساختار کار کنند، اما هیچ عددی از مانده/تخصیص فاکتور ساخته نمی‌شود.
 */
export interface ZoneReceivablePriority { customerId: string; outstandingAmount: number; invoiceCount: number; overdueAmount: number; maxDaysOverdue: number; score: number; rank: number }
export interface ZoneReceivableView {
  invoiceCount: number; allocationCount: number; validAllocationCount: number; creditNoteCount: number; validCreditNoteCount: number;
  totalInvoiceAmount: number; totalValidAllocated: number; totalValidCredits: number; totalOutstandingBeforeCredits: number; totalOutstanding: number;
  issues: Array<{ code: string; message: string }>; customerOutstandingBeforeCredits: Record<string, number>; customerOutstanding: Record<string, number>;
  creditSourceAvailable: boolean; authoritative: boolean; blockedReason: string; priorities: ZoneReceivablePriority[]; estimated: true;
}
export function buildZoneReceivableView(report: ReceivableLifoReport, ledgerReady: boolean): ZoneReceivableView {
  const per = new Map<string, ReceivableInvoiceRow[]>();
  for (const r of report.rows) per.set(r.customerId, [...(per.get(r.customerId) || []), r]);
  const priorities = [...per.entries()].map(([customerId, list]) => {
    const outstandingAmount = list.reduce((s, r) => s + r.outstanding, 0);
    const overdueAmount = list.filter(r => (r.overdueDays || 0) > 0).reduce((s, r) => s + r.outstanding, 0);
    const maxDaysOverdue = list.reduce((m, r) => Math.max(m, r.overdueDays || 0), 0);
    return { customerId, outstandingAmount, invoiceCount: list.length, overdueAmount, maxDaysOverdue, score: Math.round(outstandingAmount * (1 + maxDaysOverdue / 30)), rank: 0 };
  }).sort((a, b) => b.score - a.score || b.outstandingAmount - a.outstandingAmount).map((row, i) => ({ ...row, rank: i + 1 }));
  const outstanding: Record<string, number> = {};
  for (const p of priorities) outstanding[p.customerId] = p.outstandingAmount;
  return {
    invoiceCount: report.invoiceCount, allocationCount: 0, validAllocationCount: 0, creditNoteCount: 0, validCreditNoteCount: 0,
    totalInvoiceAmount: report.rows.reduce((s, r) => s + r.total, 0), totalValidAllocated: 0, totalValidCredits: 0,
    totalOutstandingBeforeCredits: report.totalOutstanding, totalOutstanding: report.totalOutstanding,
    issues: ledgerReady ? [] : [{ code: 'LEDGER_UNAVAILABLE', message: 'مانده دفتری در دسترس نیست؛ مانده و رتبهٔ وصول نامشخص است.' }],
    customerOutstandingBeforeCredits: outstanding, customerOutstanding: outstanding, creditSourceAvailable: false,
    authoritative: ledgerReady,
    blockedReason: ledgerReady ? 'مانده هر مشتری از دفتر (Σبدهکار−Σبستانکار) و پوشش فاکتورها از آخرین فاکتور به عقب (LIFO) «تخمینی» است.' : 'مانده دفتری در دسترس نیست؛ رتبه‌بندی مالی نامشخص است.',
    priorities, estimated: true,
  };
}
