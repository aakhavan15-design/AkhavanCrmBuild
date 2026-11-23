/**
 * AKHAVAN CRM — canonical accounting arithmetic.
 *
 * Monetary values are RIAL and MUST come from a scoped, validated provider.
 * This module does not read state, SQL or HTTP. Consumers may not substitute
 * invoice.paymentStatus for official ledger balances.
 */
export type FinancialAmount = number | null;

/** فروش خالص = فروش ناخالص - برگشت فروش (و تخفیفات ثبت شده در bucket متناظر).
 * Missing/untrusted operand is UNKNOWN (null), never silently zero. */
export function calculateNetSales(gross: FinancialAmount, returns: FinancialAmount): FinancialAmount {
  if (!Number.isFinite(gross) || !Number.isFinite(returns)
    || gross === null || returns === null || gross < 0 || returns < 0) return null;
  return gross - returns;
}

export type FinanceDocumentStatus = 'POSTED' | 'CONFIRMED' | 'FINAL' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'VOID' | 'CANCELLED' | string;
export interface LedgerArticle {
  debitAmount?: unknown;
  creditAmount?: unknown;
  status?: FinanceDocumentStatus;
  isVoided?: boolean;
  isDeleted?: boolean;
}

/** ماندهٔ دفتری فقط اسناد قطعی؛ ماندهٔ کلی شامل اسناد غیرقطعی معتبر هم می‌شود.
 * Null means an invalid article was encountered, NOT 0. */
export function calculateLedgerBalance(
  articles: LedgerArticle[],
  scope: 'POSTED_ONLY' | 'ALL_NON_VOID'
): FinancialAmount {
  let debit = 0;
  let credit = 0;
  for (const a of articles) {
    if (a.isDeleted || a.isVoided || ['VOID','VOIDED','CANCELLED','CANCELED','REJECTED'].includes(String(a.status || '').toUpperCase())) continue;
    if (scope === 'POSTED_ONLY' && !['POSTED','CONFIRMED','FINAL'].includes(String(a.status || '').toUpperCase())) continue;
    const d = Number(a.debitAmount), c = Number(a.creditAmount);
    if (!Number.isFinite(d) || !Number.isFinite(c) || d < 0 || c < 0) return null;
    debit += d;
    credit += c;
  }
  return debit - credit;
}

export interface SalesEvidenceInvoice { id: string; customerId?: string; accountId?: string; date: string; totalAmount: number }
export interface SalesEvidenceReturn {
  id: string;
  invoiceId?: string;
  customerId?: string;
  accountId?: string;
  amount: number;
  postedAt?: string;
  issuedAt?: string;
  status?: string;
  sourceType?: string;
  isVoided?: boolean;
}
export interface NetSalesFact { invoiceId: string; customerId: string; date: string; amount: number; gross: number; returns: number; isFinal: true }
export interface NetSalesEvidence {
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'PARTIAL';
  reason?: string;
  gross: number | null;
  returns: number | null;
  net: number | null;
  facts: NetSalesFact[];
  byCustomer: { key: string; value: number }[];
  invalidReturnIds: string[];
}

/**
 * One source for customer sales, RFM money, Pareto and target actual.
 * Unlinked returns are NOT arbitrarily assigned to a customer or invoice.
 * Source coverage must be explicitly verified; missing credit-note coverage
 * cannot be mistaken for zero returns.
 */
export function buildNetSalesEvidence(
  invoices: SalesEvidenceInvoice[],
  creditNotes: SalesEvidenceReturn[],
  options: { from?: string | null; to: string; returnsVerified: boolean }
): NetSalesEvidence {
  const bad = (reason: string, invalidReturnIds: string[] = []): NetSalesEvidence =>
    ({ status:'UNAVAILABLE', reason, gross:null, returns:null, net:null, facts:[], byCustomer:[], invalidReturnIds });
  if (!options.returnsVerified) return bad('پوشش قطعی برگشت فروش از ماژول مالی تأیید نشده است.');
  const from = options.from || '0000-00-00';
  const to = options.to;
  const validInvoices = invoices.filter(i => Number.isFinite(i.totalAmount)
    && i.totalAmount >= 0 && i.date.slice(0,10) >= from && i.date.slice(0,10) <= to);
  const byInvoice = new Map(invoices.map(i => [i.id, i]));
  const returnsByInvoice = new Map<string,number>();
  const returnsByCustomer = new Map<string,number>();
  const invalid: string[] = [];
  let sumReturns = 0;
  const seen = new Set<string>();
  for (const note of creditNotes) {
    if (note.isVoided || !['POSTED','CONFIRMED','FINAL'].includes(String(note.status || '').toUpperCase())) continue;
    const date = (note.postedAt || note.issuedAt || '').slice(0,10);
    if (!date || !Number.isFinite(Date.parse(date))) { invalid.push(note.id); continue; }
    if (date < from || date > to) continue;
    const amount = note.amount;
    const invoice = note.invoiceId && byInvoice.get(note.invoiceId);
    if (!note.id || seen.has(note.id) || !Number.isFinite(amount) || amount < 0
      || note.sourceType !== 'ERP_MIRROR' || !invoice
      || (note.customerId && note.customerId !== (invoice.customerId || invoice.accountId))) {
      invalid.push(note.id); continue;
    }
    seen.add(note.id);
    sumReturns += amount;
    returnsByCustomer.set(String(invoice.customerId||invoice.accountId), (returnsByCustomer.get(String(invoice.customerId||invoice.accountId))||0)+amount);
    if (invoice.date.slice(0,10) >= from && invoice.date.slice(0,10) <= to)
      returnsByInvoice.set(invoice.id,(returnsByInvoice.get(invoice.id)||0)+amount);
  }
  if (invalid.length) return bad('برگشتی قطعی نامعتبر یا فاقد اتصال به فاکتور وجود دارد؛ فروش خالص قابل اتکا نیست.', invalid);
  const gross = validInvoices.reduce((sum,i)=>sum+i.totalAmount,0);
  const net = calculateNetSales(gross,sumReturns);
  if (net === null) return bad('مقادیر فروش یا برگشت فروش نامعتبر است.');
  const facts: NetSalesFact[] = validInvoices.map(i=>({
    invoiceId:i.id, customerId:String(i.customerId||i.accountId||''),
    date:i.date.slice(0,10), gross:i.totalAmount,
    returns:returnsByInvoice.get(i.id)||0,
    amount:calculateNetSales(i.totalAmount,returnsByInvoice.get(i.id)||0)!,
    isFinal:true,
  }));
  if (facts.some(f=>!f.customerId || f.amount < 0)) return bad('سند فروش بدون مشتری یا برگشتی بزرگ‌تر از فاکتور نیازمند تطبیق مالی است.');
  const byCustomer = new Map<string,number>();
  for (const invoice of validInvoices) {
    const key=String(invoice.customerId||invoice.accountId||'');
    byCustomer.set(key,(byCustomer.get(key)||0)+invoice.totalAmount);
  }
  for (const [key,returns] of returnsByCustomer) byCustomer.set(key,(byCustomer.get(key)||0)-returns);
  return { status:'AVAILABLE',gross,returns:sumReturns,net,facts,
    byCustomer:[...byCustomer].map(([key,value])=>({key,value})),invalidReturnIds:[] };
}
