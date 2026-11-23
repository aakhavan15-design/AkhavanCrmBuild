/**
 * AKHAVAN CRM — canonical accounting arithmetic.
 *
 * Monetary values are RIAL and MUST come from a scoped, validated provider.
 * This module does not read state, SQL or HTTP. Consumers may not substitute
 * invoice.paymentStatus for official ledger balances.
 */
import { calculateNetSalesCore } from '../../shared/financialArithmetic.mjs';

export type FinancialAmount = number | null;

/** Canonical cross-runtime calculation; missing/untrusted operand is UNKNOWN. */
export function calculateNetSales(gross: FinancialAmount, returns: FinancialAmount): FinancialAmount {
  return calculateNetSalesCore(gross, returns);
}

export type FinanceDocumentStatus = 'POSTED' | 'CONFIRMED' | 'FINAL' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'VOID' | 'CANCELLED' | string;
export interface LedgerArticle {
  debitAmount?: unknown;
  creditAmount?: unknown;
  status?: FinanceDocumentStatus;
  isVoided?: boolean;
  isDeleted?: boolean;
}

/** Shared debit/credit arithmetic for finance-only journal aggregates. */
export function calculateDebitCreditBalance(debit: number | null, credit: number | null): FinancialAmount {
  if (debit === null || credit === null || !Number.isFinite(debit) || !Number.isFinite(credit)
    || debit < 0 || credit < 0) return null;
  return debit - credit;
}
export function isLedgerArticleIncluded(article: LedgerArticle, scope: 'POSTED_ONLY' | 'ALL_NON_VOID'): boolean {
  if (article.isVoided || article.isDeleted
    || ['VOID','VOIDED','CANCELLED','CANCELED','REJECTED'].includes(String(article.status||'').toUpperCase())) return false;
  return scope === 'ALL_NON_VOID'
    || ['POSTED','CONFIRMED','FINAL'].includes(String(article.status||'').toUpperCase());
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
    if (!isLedgerArticleIncluded(a,scope)) continue;
    if (a.debitAmount === null || a.debitAmount === undefined || a.creditAmount === null || a.creditAmount === undefined) return null;
    const d = Number(a.debitAmount), c = Number(a.creditAmount);
    if (!Number.isFinite(d) || !Number.isFinite(c) || d < 0 || c < 0) return null;
    debit += d;
    credit += c;
  }
  return calculateDebitCreditBalance(debit,credit);
}

export interface SalesEvidenceInvoice { id: string; customerId?: string; accountId?: string; date: string; totalAmount: number }
export interface SalesEvidenceReturn {
  id: string;
  invoiceId?: string;
  customerId?: string;
  accountId?: string;
  sellerId?: string;
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
  returnsOutsideFacts: Array<{returnId:string;invoiceId:string|null;customerId:string;sellerId:string|null;amount:number}>;
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
    ({ status:'UNAVAILABLE', reason, gross:null, returns:null, net:null, facts:[], returnsOutsideFacts:[], byCustomer:[], invalidReturnIds });
  if (!options.returnsVerified) return bad('پوشش قطعی برگشت فروش از ماژول مالی تأیید نشده است.');
  const from = options.from || '0000-00-00';
  const to = options.to;
  const validInvoices = invoices.filter(i => Number.isFinite(i.totalAmount)
    && i.totalAmount >= 0 && i.date.slice(0,10) >= from && i.date.slice(0,10) <= to);
  const byInvoice = new Map(invoices.map(i => [i.id, i]));
  const returnsByInvoice = new Map<string,number>();
  const returnsByCustomer = new Map<string,number>();
  const returnsOutsideFacts: NetSalesEvidence['returnsOutsideFacts'] = [];
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
    // ERP may post an independent sales return with no original invoice number.
    // Its customer ID is authoritative for CUSTOMER and PERIOD sales, but no
    // invoice/seller attribution can be invented. A dangling explicit link
    // remains invalid instead of becoming an unbased return.
    const customer = invoice ? String(invoice.customerId||invoice.accountId||'')
      : !note.invoiceId ? String(note.customerId||note.accountId||'') : '';
    if (!note.id || seen.has(note.id) || !Number.isFinite(amount) || amount < 0
      || note.sourceType !== 'ERP_MIRROR' || !customer
      || (invoice && note.customerId && note.customerId !== customer)) {
      invalid.push(note.id); continue;
    }
    seen.add(note.id);
    sumReturns += amount;
    returnsByCustomer.set(customer,(returnsByCustomer.get(customer)||0)+amount);
    if (invoice && invoice.date.slice(0,10) >= from && invoice.date.slice(0,10) <= to)
      returnsByInvoice.set(invoice.id,(returnsByInvoice.get(invoice.id)||0)+amount);
    else returnsOutsideFacts.push({
      returnId:note.id,invoiceId:invoice?invoice.id:null,customerId:customer,
      sellerId:note.sellerId?String(note.sellerId):null,amount
    });
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
  return { status:'AVAILABLE',gross,returns:sumReturns,net,facts,returnsOutsideFacts,
    byCustomer:[...byCustomer].map(([key,value])=>({key,value})),invalidReturnIds:[] };
}

export interface NetSalesReconciliation {
  status: 'RECONCILED' | 'MISMATCH' | 'UNAVAILABLE';
  reason?: string;
  grossDifference: number | null;
  returnsDifference: number | null;
}

/** Financial journal controls the official company-wide total. Segmented
 * mirror facts may be called "net" only when both underlying operands match.
 * No silent fallback to invoice gross sales on missing/unequal evidence. */
export function reconcileNetSales(
  evidence: NetSalesEvidence,
  ledgerGross: number | null | undefined,
  ledgerReturns: number | null | undefined,
  ledgerTrusted: boolean
): NetSalesReconciliation {
  const unknown = (reason: string): NetSalesReconciliation =>
    ({status:'UNAVAILABLE',reason,grossDifference:null,returnsDifference:null});
  if (!ledgerTrusted) return unknown('منبع دفترکل مالی قطعی/کامل تأیید نشده است.');
  if (evidence.status !== 'AVAILABLE' || evidence.gross === null || evidence.returns === null)
    return unknown(evidence.reason || 'پوشش تفصیلی فروش/مرجوعی نامعتبر است.');
  if (ledgerGross === null || ledgerReturns === null
    || ledgerGross === undefined || ledgerReturns === undefined
    || !Number.isFinite(ledgerGross) || !Number.isFinite(ledgerReturns))
    return unknown('نگاشت یا پوشش حساب‌های فروش و برگشتی دفترکل کامل نیست.');
  const grossDifference=evidence.gross-ledgerGross;
  const returnsDifference=evidence.returns-ledgerReturns;
  if (Math.abs(grossDifference)>0.01 || Math.abs(returnsDifference)>0.01)
    return {status:'MISMATCH',reason:'جمع تفصیلی فروش/مرجوعی با دفترکل مالی یکسان نیست؛ تا رفع اختلاف، گزارش قطعی مجاز نیست.',
      grossDifference,returnsDifference};
  return {status:'RECONCILED',grossDifference,returnsDifference};
}

/**
 * Seller attribution is a VIEW of canonical net-sales facts, not a second
 * net-sales formula. Cross-period returns may have no current-period invoice
 * fact; in that case segment amounts must remain unavailable, even when the
 * company-wide ledger total reconciles.
 */
export function attributeReconciledSalesBySeller<T extends {id:string}>(
  evidence: NetSalesEvidence,
  reconciliation: NetSalesReconciliation,
  invoices: T[],
  sellerOf: (invoice:T)=>string
): {status:'AVAILABLE'|'UNAVAILABLE';reason?:string;rows:{key:string;value:number}[]} {
  const unavailable=(reason:string)=>({status:'UNAVAILABLE' as const,reason,rows:[]});
  if (reconciliation.status!=='RECONCILED' || evidence.status!=='AVAILABLE' || evidence.net===null)
    return unavailable(reconciliation.reason || evidence.reason || 'فروش خالص با دفتر تطبیق نشده است.');
  const index=new Map<string,T>();
  for(const invoice of invoices) {
    if(!invoice.id || index.has(invoice.id))
      return unavailable('شناسه فاکتور فروش تکراری یا نامعتبر است.');
    index.set(invoice.id,invoice);
  }
  const rows=new Map<string,number>();
  for(const fact of evidence.facts) {
    const invoice=index.get(fact.invoiceId);
    if(!invoice || !Number.isFinite(fact.amount))
      return unavailable('فاکتور یا مبلغ تفصیلی از منبع واحد فروش خالص ناقص است.');
    const seller=String(sellerOf(invoice)||'').trim()||'UNASSIGNED';
    rows.set(seller,(rows.get(seller)||0)+fact.amount);
  }
  // A return for an older invoice (or an ERP return without basis)
  // is not part of current invoice facts. Allocate to a seller only when
  // the original invoice or explicit verified return seller is available.
  for(const returned of evidence.returnsOutsideFacts){
    const original=returned.invoiceId?index.get(returned.invoiceId):undefined;
    const seller=original?String(sellerOf(original)||'').trim():
      String(returned.sellerId||'').trim();
    if(!seller || seller==='UNASSIGNED')
      return unavailable('برگشتی خارج‌دوره یا بدون مبنا فاقد کد فروشنده معتبر است.');
    rows.set(seller,(rows.get(seller)||0)-returned.amount);
  }
  const total=[...rows.values()].reduce((sum,amount)=>sum+amount,0);
  if(Math.abs(total-evidence.net)>0.01)
    return unavailable('برگشتی‌های خارج دوره به فروشنده قابل انتساب نیستند؛ نمودار سهم فروشنده قطعی نیست.');
  return {status:'AVAILABLE',rows:[...rows].map(([key,value])=>({key,value}))};
}
