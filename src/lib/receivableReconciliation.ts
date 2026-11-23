import type { CreditNote, Invoice, Payment, PaymentAllocation } from '../types';
import { calculateDebitCreditBalance, isLedgerArticleIncluded } from './financialMetricKernel.ts';

export type ReceivableIssueCode =
  | 'INVALID_ALLOCATION_AMOUNT' | 'DUPLICATE_ALLOCATION_ID' | 'PAYMENT_NOT_FOUND' | 'PAYMENT_NOT_CLEARED'
  | 'INVOICE_NOT_FOUND' | 'CUSTOMER_MISMATCH' | 'PAYMENT_OVERALLOCATED' | 'INVOICE_OVERALLOCATED'
  | 'INVOICE_BALANCE_MISMATCH' | 'CREDIT_NOTE_DUPLICATE_ID' | 'CREDIT_NOTE_INVALID_AMOUNT'
  | 'CREDIT_NOTE_NOT_POSTED' | 'CREDIT_NOTE_INVOICE_NOT_FOUND' | 'CREDIT_NOTE_CUSTOMER_MISMATCH'
  | 'CREDIT_NOTE_OVERALLOCATED' | 'CREDIT_NOTE_SOURCE_INVALID' | 'CREDIT_NOTE_EXTERNAL_ID_MISSING'
  | 'CREDIT_NOTE_EXTERNAL_ID_DUPLICATE';
export interface ReceivableIssue { code: ReceivableIssueCode; message: string; paymentId?: string; invoiceId?: string; allocationId?: string; creditNoteId?: string; }
export interface ReconciledInvoice { invoiceId: string; invoiceNumber: string; customerId: string; totalAmount: number; validAllocatedAmount: number; validCreditAmount: number; outstandingBeforeCredits: number; outstandingAmount: number; storedBalance: number; deltaFromStoredBalance: number; dueDate?: string; daysOverdue: number; }
export interface ReceivablePriority { customerId:string; outstandingAmount:number; invoiceCount:number; overdueAmount:number; maxDaysOverdue:number; score:number; rank:number; }
export interface ReceivableReconciliation {
  invoiceCount:number; allocationCount:number; validAllocationCount:number; creditNoteCount:number; validCreditNoteCount:number;
  totalInvoiceAmount:number; totalValidAllocated:number; totalValidCredits:number; totalOutstandingBeforeCredits:number; totalOutstanding:number;
  issues:ReceivableIssue[]; invoices:ReconciledInvoice[]; customerOutstandingBeforeCredits:Record<string,number>; customerOutstanding:Record<string,number>;
  creditSourceAvailable:boolean; authoritative:boolean; blockedReason:string; priorities:ReceivablePriority[];
}
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
type SoftDeletable = { deletedAt?: string | null; isDeleted?: boolean };
const isSoftDeleted = (record: object) => { const r = record as SoftDeletable; return !!(r.deletedAt || r.isDeleted); };
const customerId = (record: { customerId?: string; accountId?: string } | null | undefined) => String(record?.customerId || record?.accountId || '');
const isLiveInvoice = (invoice: Invoice) => !isSoftDeleted(invoice) && !['DRAFT','PENDING','CANCELLED','CANCELED','VOID','VOIDED','REJECTED'].includes(String(invoice.status||'').toUpperCase());
const dayMs=86400000;
function creditNoteSourceKey(note: CreditNote): string | undefined {
  const source = String(note.sourceSystemCode ?? '').trim().toUpperCase();
  const externalId = String(note.externalCreditNoteId ?? '').trim();
  if (source && externalId) return JSON.stringify([source, externalId]);
}
function daysOverdue(dueDate?:string,asOf=new Date()){if(!dueDate)return 0;const due=new Date(dueDate);if(!Number.isFinite(due.getTime()))return 0;return Math.max(0,Math.floor((new Date(asOf.toISOString().slice(0,10)).getTime()-new Date(due.toISOString().slice(0,10)).getTime())/dayMs));}

/** Reconciles cleared payment allocations and posted credit notes. The result is authoritative only when the credit-note source is explicitly supplied and there are no reconciliation issues. */
export function reconcileReceivables(invoices:Invoice[]=[],payments:Payment[]=[],allocations:PaymentAllocation[]=[],creditNotes?:CreditNote[],asOf=new Date()):ReceivableReconciliation{
 const creditSourceAvailable=Array.isArray(creditNotes);const credits=creditNotes||[];const liveInvoices=invoices.filter(isLiveInvoice);const invoiceById=new Map(liveInvoices.map(i=>[i.id,i]));const paymentById=new Map(payments.filter(p=>!isSoftDeleted(p)).map(p=>[p.id,p]));
 const invoiceAllocated=new Map<string,number>(),paymentAllocated=new Map<string,number>(),invoiceCredits=new Map<string,number>();const seenAllocationIds=new Set<string>(),seenCreditIds=new Set<string>();const issues:ReceivableIssue[]=[];let validAllocationCount=0,validCreditNoteCount=0;
 for(const a of allocations){if(a.id&&seenAllocationIds.has(a.id)){issues.push({code:'DUPLICATE_ALLOCATION_ID',message:'شناسهٔ تخصیص تکراری است؛ رکورد تکراری لحاظ نشد.',allocationId:a.id,invoiceId:a.invoiceId,paymentId:a.paymentId});continue;}if(a.id)seenAllocationIds.add(a.id);const v=Number(a.amount);if(!Number.isFinite(v)||v<=0){issues.push({code:'INVALID_ALLOCATION_AMOUNT',message:'مبلغ تخصیص باید عددی مثبت باشد.',allocationId:a.id,invoiceId:a.invoiceId,paymentId:a.paymentId});continue;}const inv=invoiceById.get(a.invoiceId);if(!inv){issues.push({code:'INVOICE_NOT_FOUND',message:'تخصیص به فاکتور معتبر/فعال متصل نیست.',allocationId:a.id,invoiceId:a.invoiceId,paymentId:a.paymentId});continue;}const pay=paymentById.get(a.paymentId);if(!pay){issues.push({code:'PAYMENT_NOT_FOUND',message:'تخصیص به پرداخت معتبر متصل نیست.',allocationId:a.id,invoiceId:a.invoiceId,paymentId:a.paymentId});continue;}if(pay.status!=='CLEARED'){issues.push({code:'PAYMENT_NOT_CLEARED',message:'پرداخت نهایی نشده است؛ تخصیص از مانده کسر نشد.',allocationId:a.id,invoiceId:a.invoiceId,paymentId:a.paymentId});continue;}if(!customerId(pay)||customerId(pay)!==customerId(inv)){issues.push({code:'CUSTOMER_MISMATCH',message:'مشتری پرداخت و فاکتور یکسان نیست؛ تخصیص کسر نشد.',allocationId:a.id,invoiceId:a.invoiceId,paymentId:a.paymentId});continue;}invoiceAllocated.set(inv.id,(invoiceAllocated.get(inv.id)||0)+Math.round(v));paymentAllocated.set(pay.id,(paymentAllocated.get(pay.id)||0)+Math.round(v));validAllocationCount++;}
 for(const [paymentId,allocated] of paymentAllocated){if(allocated>amount(paymentById.get(paymentId)?.amount))issues.push({code:'PAYMENT_OVERALLOCATED',message:'جمع تخصیص‌ها از مبلغ پرداخت بیشتر است.',paymentId});}
 const creditSourceCounts = new Map<string, number>();
 for (const note of credits) {
   if (note.sourceType !== 'ERP_MIRROR' || isSoftDeleted(note)) continue;
   const key = creditNoteSourceKey(note);
   if (key) creditSourceCounts.set(key, (creditSourceCounts.get(key) ?? 0) + 1);
 }
 for (const note of credits) {
   if (isSoftDeleted(note)) continue;
   const issueRef = { creditNoteId: note.id, invoiceId: note.invoiceId };
   if (note.sourceType !== 'ERP_MIRROR') {
     issues.push({ ...issueRef, code: 'CREDIT_NOTE_SOURCE_INVALID', message: 'بستانکاری از منبع آینه‌شدهٔ سامانه مالی نیست؛ در محاسبه لحاظ نشد.' });
     continue;
   }
   const sourceKey = creditNoteSourceKey(note);
   if (!sourceKey) {
     issues.push({ ...issueRef, code: 'CREDIT_NOTE_EXTERNAL_ID_MISSING', message: 'شناسهٔ خارجی یا سیستم مبدأ بستانکاری موجود نیست.' });
     continue;
   }
   if ((creditSourceCounts.get(sourceKey) ?? 0) > 1) {
     issues.push({ ...issueRef, code: 'CREDIT_NOTE_EXTERNAL_ID_DUPLICATE', message: 'چند رکورد برای همین شناسهٔ بستانکاری در سامانهٔ مبدأ وجود دارد؛ تا تطبیق نسخه، مبلغ کسر نشد.' });
     continue;
   }
   if (note.id && seenCreditIds.has(note.id)) {
     issues.push({ ...issueRef, code: 'CREDIT_NOTE_DUPLICATE_ID', message: 'شناسهٔ بستانکاری تکراری است؛ رکورد تکراری لحاظ نشد.' });
     continue;
   }
   if (note.id) seenCreditIds.add(note.id);
   if (note.isVoided || !['POSTED', 'APPROVED'].includes(String(note.status).toUpperCase())) continue;
   const value = Number(note.amount);
   if (!Number.isFinite(value) || value <= 0) {
     issues.push({ ...issueRef, code: 'CREDIT_NOTE_INVALID_AMOUNT', message: 'مبلغ بستانکاری باید عددی مثبت باشد.' });
     continue;
   }
   const invoice = note.invoiceId ? invoiceById.get(note.invoiceId) : undefined;
   if (!invoice) {
     issues.push({ ...issueRef, code: 'CREDIT_NOTE_INVOICE_NOT_FOUND', message: 'بستانکاری به فاکتور معتبر/فعال متصل نیست.' });
     continue;
   }
   if (!customerId(note) || customerId(note) !== customerId(invoice)) {
     issues.push({ ...issueRef, code: 'CREDIT_NOTE_CUSTOMER_MISMATCH', message: 'مشتری بستانکاری با مشتری فاکتور تطابق ندارد.' });
     continue;
   }
   invoiceCredits.set(invoice.id, (invoiceCredits.get(invoice.id) ?? 0) + Math.round(value));
   validCreditNoteCount++;
 }
 const reconciledInvoices:ReconciledInvoice[]=[];const customerOutstandingBeforeCredits:Record<string,number>={},customerOutstanding:Record<string,number>={};const invoiceTotals=new Map<string,number>();let totalInvoiceAmount=0,totalValidAllocated=0,totalValidCredits=0,totalOutstandingBeforeCredits=0,totalOutstanding=0;
 for(const inv of liveInvoices){const total=amount(inv.totalAmount),allocated=invoiceAllocated.get(inv.id)||0,credit=invoiceCredits.get(inv.id)||0,before=Math.max(0,total-allocated),outstanding=Math.max(0,before-credit),stored=amount(inv.balance),customer=customerId(inv),overdue=daysOverdue(inv.dueDate,asOf);if(allocated>total)issues.push({code:'INVOICE_OVERALLOCATED',message:'جمع تخصیص پرداخت از مبلغ فاکتور بیشتر است.',invoiceId:inv.id});if(credit>before)issues.push({code:'CREDIT_NOTE_OVERALLOCATED',message:'جمع بستانکاری از مانده پس از پرداخت‌های معتبر بیشتر است.',invoiceId:inv.id});if(Math.abs(outstanding-stored)>1)issues.push({code:'INVOICE_BALANCE_MISMATCH',message:'ماندهٔ ذخیره‌شده با فاکتور منهای پرداخت و بستانکاری معتبر تطابق ندارد.',invoiceId:inv.id});if(customer){customerOutstandingBeforeCredits[customer]=(customerOutstandingBeforeCredits[customer]||0)+before;customerOutstanding[customer]=(customerOutstanding[customer]||0)+outstanding;}invoiceTotals.set(inv.id,outstanding);totalInvoiceAmount+=total;totalValidAllocated+=allocated;totalValidCredits+=Math.min(credit,before);totalOutstandingBeforeCredits+=before;totalOutstanding+=outstanding;reconciledInvoices.push({invoiceId:inv.id,invoiceNumber:inv.invoiceNumber||inv.id,customerId:customer,totalAmount:total,validAllocatedAmount:allocated,validCreditAmount:Math.min(credit,before),outstandingBeforeCredits:before,outstandingAmount:outstanding,storedBalance:stored,deltaFromStoredBalance:stored-outstanding,dueDate:inv.dueDate,daysOverdue:overdue});}
 const priorities=Object.entries(customerOutstanding).map(([customer,bal])=>{const rows=reconciledInvoices.filter(i=>i.customerId===customer&&i.outstandingAmount>0);const overdueAmount=rows.filter(i=>i.daysOverdue>0).reduce((s,i)=>s+i.outstandingAmount,0);const maxDaysOverdue=rows.reduce((m,i)=>Math.max(m,i.daysOverdue),0);return{customerId:customer,outstandingAmount:bal,invoiceCount:rows.length,overdueAmount,maxDaysOverdue,score:bal};}).filter(x=>x.outstandingAmount>0).sort((a,b)=>b.outstandingAmount-a.outstandingAmount||b.overdueAmount-a.overdueAmount||b.maxDaysOverdue-a.maxDaysOverdue).map((x,i)=>({...x,rank:i+1}));
 const authoritative=creditSourceAvailable&&issues.length===0;const blockedReason=!creditSourceAvailable?'منبع اعلامیهٔ بستانکاری به موتور تطبیق ارائه نشده است؛ مانده و اولویت‌بندی غیرقطعی است.':issues.length?'تطبیق دارای مغایرت است؛ تا رفع همهٔ هشدارهای مالی، مانده و اولویت‌بندی قابل اتکا/رسمی نیست.':'';
 return{invoiceCount:liveInvoices.length,allocationCount:allocations.length,validAllocationCount,creditNoteCount:credits.length,validCreditNoteCount,totalInvoiceAmount,totalValidAllocated,totalValidCredits,totalOutstandingBeforeCredits,totalOutstanding,issues,invoices:reconciledInvoices,customerOutstandingBeforeCredits,customerOutstanding,creditSourceAvailable,authoritative,blockedReason,priorities:authoritative?priorities:[]};
}

/* ───────── مانده طرف‌حساب از دفتر کل: Σ بدهکار − Σ بستانکار (F0-05؛ مرجع یگانهٔ مانده مشتری) ───────── */
export interface CustomerLedgerBalance { customerId: string; debit: number; credit: number; /** بدهکار − بستانکار؛ مثبت = بدهکار، منفی = بستانکار */ balance: number; lineCount: number }

/**
 * سطرهای سند باطل/حذف‌شده/غیرقطعی کنار گذاشته می‌شوند. سطر با `accountId` (یا `customerId`) به مشتری نسبت داده می‌شود؛
 * مشتریِ بدون هیچ سطر سندی در نتیجه نیست (= مانده نامشخص، نه صفر).
 */
export function computeCustomerLedgerBalances(journalLines: unknown): Map<string, CustomerLedgerBalance> {
  const out = new Map<string, CustomerLedgerBalance>();
  if (!Array.isArray(journalLines)) return out;
  for (const raw of journalLines as Array<Record<string, unknown>>) {
    if (!raw || raw.isVoided === true || raw.isDeleted === true || raw.deletedAt) continue;
    if (!isLedgerArticleIncluded(raw,'POSTED_ONLY')) continue;
    const customerId = String(raw.accountId || raw.customerId || '');
    if (!customerId) continue;
    const debit = Number(raw.debitAmount) || 0, credit = Number(raw.creditAmount) || 0;
    const cur = out.get(customerId) ?? { customerId, debit: 0, credit: 0, balance: 0, lineCount: 0 };
    cur.debit += debit; cur.credit += credit; cur.balance = calculateDebitCreditBalance(cur.debit,cur.credit) ?? 0; cur.lineCount++;
    out.set(customerId, cur);
  }
  return out;
}

/* ───────── مانده تفکیکی «تفصیلی × معین (× دوره)» — اصل قانون اساسی §C (F0-13) ─────────
 * مانده هر ترکیب مستقل است؛ مانده کلِ تفصیلی فقط تجمیع همان ترکیب‌هاست و جایگزین آن‌ها نیست.
 * سطر بدون کد معین «فاقد نگاشت» است: در سطل جدا (`subsidiaryCode: null`) می‌آید و وضعیت کل `HAS_UNMAPPED` می‌شود
 * (نه مانده ساختگی و نه ادغام در یک معین). کد معین عیناً از ERP است؛ CRM کد اختراع نمی‌کند. */
export type BalanceNature = 'DEBIT' | 'CREDIT' | 'SETTLED';
export const balanceNature = (balance: number): BalanceNature => (balance > 0 ? 'DEBIT' : balance < 0 ? 'CREDIT' : 'SETTLED');
export interface SubsidiaryBalance { source?: string; currency?: string; role?: 'RECEIVABLE' | 'PAYABLE'; subsidiaryCode: string | null; periodCode: string | null; debit: number; credit: number; balance: number; nature: BalanceNature; lineCount: number }
export interface DetailBalance {
  detailKey: string;
  accountId?: string | null;
  subsidiaries: SubsidiaryBalance[];
  /** تجمیع همهٔ ترکیب‌ها (فقط نمایش جمع؛ جایگزین مانده‌های تفکیکی نیست) */
  total: { debit: number; credit: number; balance: number; nature: BalanceNature; lineCount: number };
  /** COMPLETE = همهٔ سطرها معین دارند؛ HAS_UNMAPPED = بخشی فاقد نگاشت (مانده کل «نامشخص/ناقص» است) */
  status: 'COMPLETE' | 'HAS_UNMAPPED';
}
const pick = (raw: Record<string, unknown>, keys: string[]): string => { for (const k of keys) { const v = raw[k]; if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim(); } return ''; };

export function computeDetailSubsidiaryBalances(journalLines: unknown, options: { byPeriod?: boolean } = {}): Map<string, DetailBalance> {
  const out = new Map<string, DetailBalance>();
  if (!Array.isArray(journalLines)) return out;
  const cells = new Map<string, SubsidiaryBalance>();
  for (const raw of journalLines as Array<Record<string, unknown>>) {
    if (!raw || raw.isVoided === true || raw.isDeleted === true || raw.deletedAt) continue;
    if (!isLedgerArticleIncluded(raw,'POSTED_ONLY')) continue;
    const detailKey = pick(raw, ['detailAccountId', 'externalDetailCode', 'detailCode', 'accountId', 'customerId']);
    if (!detailKey) continue;
    const subsidiaryCode = pick(raw, ['subsidiaryCode', 'externalAccountCode', 'ledgerAccountCode']) || null;
    const periodCode = options.byPeriod ? (pick(raw, ['fiscalPeriodCode', 'periodCode']) || null) : null;
    const key = `${detailKey}\u0000${subsidiaryCode ?? ''}\u0000${periodCode ?? ''}`;
    const cell = cells.get(key) ?? { subsidiaryCode, periodCode, debit: 0, credit: 0, balance: 0, nature: 'SETTLED' as BalanceNature, lineCount: 0, ...{ _d: detailKey } } as SubsidiaryBalance & { _d: string };
    cell.debit += Number(raw.debitAmount) || 0; cell.credit += Number(raw.creditAmount) || 0; cell.lineCount++;
    cell.balance = calculateDebitCreditBalance(cell.debit,cell.credit) ?? 0; cell.nature = balanceNature(cell.balance);
    cells.set(key, cell);
  }
  for (const c of cells.values()) {
    const { _d, ...cell } = c as SubsidiaryBalance & { _d: string };
    const cur = out.get(_d) ?? { detailKey: _d, subsidiaries: [], total: { debit: 0, credit: 0, balance: 0, nature: 'SETTLED' as BalanceNature, lineCount: 0 }, status: 'COMPLETE' as const };
    cur.subsidiaries.push(cell);
    cur.total.debit += cell.debit; cur.total.credit += cell.credit; cur.total.lineCount += cell.lineCount;
    cur.total.balance = calculateDebitCreditBalance(cur.total.debit,cur.total.credit) ?? 0; cur.total.nature = balanceNature(cur.total.balance);
    if (cell.subsidiaryCode === null) cur.status = 'HAS_UNMAPPED';
    out.set(_d, cur);
  }
  return out;
}

/* ───────── قرارداد خواندن گردش و مانده (مصرف‌شده توسط DataProvider؛ F0-14) ───────── */
export interface JournalLineFilter { journalId?: string; source?: string; currency?: string; withoutDetail?: boolean; role?: 'RECEIVABLE' | 'PAYABLE'; activityOnly?: boolean; balanceWindow?: boolean; detailKey?: string; subsidiaryCode?: string; /** فقط سطرهای فاقد کد معین (سطل «فاقد نگاشت») */ unmapped?: boolean; periodCode?: string; fromDate?: string; toDate?: string }
export interface JournalLinePage { items: Array<Record<string, unknown>>; total: number; page: number; pageSize: number; totalPages: number }
export type LedgerResultStatus = 'LIVE' | 'EMPTY' | 'UNAVAILABLE';
export interface DetailBalancesResult { status: LedgerResultStatus; source: 'CLIENT_INDEXEDDB' | 'SQLSERVER_BACKEND'; balances: DetailBalance[]; sourceSystem?: string; currency?: string; asOf?: string | null; reason?: string }

const lineVal = (r: Record<string, unknown>, keys: string[]) => { for (const k of keys) { const v = r[k]; if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim(); } return ''; };
export function queryJournalLines(lines: unknown, filter: JournalLineFilter = {}, pagination: { page?: number; pageSize?: number } = {}): JournalLinePage {
  const all = (Array.isArray(lines) ? lines : []).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .filter(r => {
      if (filter.withoutDetail && lineVal(r, ['detailAccountId','externalDetailCode','detailCode','accountId','customerId'])) return false;
      if (filter.journalId && lineVal(r, ['journalId','journalEntryMirrorId'])!==filter.journalId) return false;
      if (filter.detailKey && lineVal(r, ['detailAccountId', 'externalDetailCode', 'detailCode', 'accountId', 'customerId']) !== filter.detailKey) return false;
      if (filter.subsidiaryCode && lineVal(r, ['subsidiaryCode', 'externalAccountCode', 'ledgerAccountCode']) !== filter.subsidiaryCode) return false;
      if (filter.unmapped === true && lineVal(r, ['subsidiaryCode', 'externalAccountCode', 'ledgerAccountCode'])) return false;
      if (filter.unmapped === false && !lineVal(r, ['subsidiaryCode', 'externalAccountCode', 'ledgerAccountCode'])) return false;
      if (filter.periodCode && lineVal(r, ['fiscalPeriodCode', 'periodCode']) !== filter.periodCode) return false;
      const d = lineVal(r, ['documentDate', 'date']);
      // A dated query must never silently include undated rows.
      if ((filter.fromDate || filter.toDate) && !d) return false;
      if (filter.fromDate && d < filter.fromDate) return false;
      if (filter.toDate && d > filter.toDate) return false;
      return true;
    });
  // Keep the local adapter's paging contract identical to the SQL endpoint.
  const page = pagination.page ?? 1, pageSize = pagination.pageSize ?? 25;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    throw new RangeError('INVALID_PAGINATION');
  }
  return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize, totalPages: Math.ceil(all.length / pageSize) || 1 };
}
export function buildDetailBalancesResult(lines: unknown, source: DetailBalancesResult['source'], options: { detailKey?: string; byPeriod?: boolean } = {}): DetailBalancesResult {
  const map = computeDetailSubsidiaryBalances(lines, { byPeriod: options.byPeriod });
  const balances = [...map.values()].filter(b => !options.detailKey || b.detailKey === options.detailKey);
  return { status: balances.length ? 'LIVE' : 'EMPTY', source, balances };
}

/* ───────── نمای مانده یک مشتری از نتیجهٔ DataProvider (F0-13/F0-14): بدون حدس؛ وضعیت منبع شفاف ───────── */
export type CustomerBalanceView =
  | { kind: 'LOADING' }
  | { kind: 'UNAVAILABLE'; reason?: string }
  | { kind: 'NO_LEDGER' }
  | { kind: 'OK'; detailKey: string; total: number; nature: BalanceNature; subsidiaryCount: number; unmappedCount: number; incomplete: boolean; subsidiaries: SubsidiaryBalance[] };

/** کلیدهای ممکن تفصیلی یک مشتری، به ترتیب اولویت؛ مانده هیچ‌گاه با تطبیق نام/حدس به مشتری نسبت داده نمی‌شود. */
export function customerDetailKeys(account: { id?: string; code?: string; detailAccountId?: string; externalDetailCode?: string }): string[] {
  return [account.detailAccountId, account.externalDetailCode, account.code, account.id].filter((k): k is string => !!k && String(k).trim() !== '').map(String);
}

export function resolveCustomerBalanceView(result: DetailBalancesResult | null | undefined, account: { id?: string; code?: string; detailAccountId?: string; externalDetailCode?: string }): CustomerBalanceView {
  if (!result) return { kind: 'LOADING' };
  if (result.status === 'UNAVAILABLE') return { kind: 'UNAVAILABLE', reason: result.reason };
  const keys = customerDetailKeys(account);
  let found: DetailBalance | undefined;
  if (result.source === 'SQLSERVER_BACKEND' && result.sourceSystem) {
    const matches = result.balances.filter(balance => balance.accountId != null && balance.accountId === account.id);
    const explicit = account.externalDetailCode ? matches.find(balance => balance.detailKey === account.externalDetailCode) : undefined;
    found = explicit ?? (matches.length === 1 ? matches[0] : undefined);
  } else {
    for (const key of keys) {
      found = result.balances.find(balance => balance.detailKey === key);
      if (found) break;
    }
  }
  if (!found) return { kind: 'NO_LEDGER' };
  const unmappedCount = found.subsidiaries.filter(x => x.subsidiaryCode === null).length;
  return { kind: 'OK', detailKey: found.detailKey, total: found.total.balance, nature: found.total.nature, subsidiaryCount: found.subsidiaries.filter(x => x.subsidiaryCode !== null).length, unmappedCount, incomplete: found.status === 'HAS_UNMAPPED', subsidiaries: found.subsidiaries };
}

/* ───────── خلاصهٔ مطالبات دفتری مشتریان (F0-16): فقط Σبدهکار − Σبستانکار؛ نه فاکتور/صورتحساب باز ───────── */
export type LedgerReceivablesSummary =
  | { kind: 'LOADING' }
  | { kind: 'UNAVAILABLE'; reason?: string }
  | { kind: 'NO_LEDGER' }
  | {
      kind: 'OK';
      /** جمع مانده‌های با ماهیت بدهکار (مطالبات) */
      debtorTotal: number;
      /** جمع قدر مطلق مانده‌های با ماهیت بستانکار (جدا؛ با مطالبات خنثی نمی‌شود) */
      creditorTotal: number;
      debtorCount: number;
      creditorCount: number;
      settledCount: number;
      /** مشتریانی که هیچ گردشی برایشان نیست (نامشخص، نه صفر) */
      withoutLedgerCount: number;
      /** حداقل یک مشتری سطر فاقد معین دارد ⇒ جمع ناقص است */
      incomplete: boolean;
    };

export function summarizeCustomerLedgerReceivables(
  result: DetailBalancesResult | null | undefined,
  accounts: Array<{ id?: string; code?: string; detailAccountId?: string; externalDetailCode?: string }>
): LedgerReceivablesSummary {
  if (!result) return { kind: 'LOADING' };
  if (result.status === 'UNAVAILABLE') return { kind: 'UNAVAILABLE', reason: result.reason };
  let debtorTotal = 0, creditorTotal = 0, debtorCount = 0, creditorCount = 0, settledCount = 0, withoutLedgerCount = 0, incomplete = false;
  for (const account of accounts) {
    const view = resolveCustomerBalanceView(result, account);
    if (view.kind !== 'OK') { withoutLedgerCount += 1; continue; }
    if (view.incomplete) incomplete = true;
    if (view.nature === 'DEBIT') { debtorTotal += view.total; debtorCount += 1; }
    else if (view.nature === 'CREDIT') { creditorTotal += Math.abs(view.total); creditorCount += 1; }
    else settledCount += 1;
  }
  if (debtorCount + creditorCount + settledCount === 0) return { kind: 'NO_LEDGER' };
  return { kind: 'OK', debtorTotal, creditorTotal, debtorCount, creditorCount, settledCount, withoutLedgerCount, incomplete };
}
