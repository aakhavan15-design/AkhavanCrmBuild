/**
 * Financial Intelligence & Approval Center — موتور خالص (بدون وابستگی به UI/IndexedDB)
 *
 * سه قابلیت: Approval Intelligence، Financial 360، Smart Accounting Classification.
 * قواعد پروژه که این فایل رعایت می‌کند:
 *  - CRM جایگزین ERP/حسابداری نیست؛ هیچ مانده/سند رسمی ساخته نمی‌شود. داده ناموجود = null (نه صفر).
 *  - هر عدد با منبع، زمان به‌روزرسانی، کیفیت داده (ERP/CRM/DEMO/ناقص/نامشخص/محدود) و اسناد تشکیل‌دهنده برمی‌گردد.
 *  - تأیید مدیر به معنی پرداخت یا ثبت سند نیست؛ ارسال به حسابداری فقط با پاسخ ERP «قطعی» می‌شود.
 *  - همه مبالغ ریال هستند (واحد پایه CRM).
 */
import { computeDetailSubsidiaryBalances, customerDetailKeys } from './receivableReconciliation';
import type { AppState } from '../types';
import { OutboxManager } from './accountingMapping';

export const FI_CALC_VERSION = 'fi-1.0.0';
const DAY = 86_400_000;

/* ───────────── قراردادهای داده مشترک ───────────── */
export type FactQuality = 'ERP_MIRROR' | 'CRM_LOCAL' | 'DEMO' | 'PARTIAL' | 'UNAVAILABLE' | 'RESTRICTED';
export type FactUnit = 'IRR' | 'DAYS' | 'PERCENT' | 'COUNT' | 'TEXT';
export interface DocRef { type: string; id: string; label?: string; amount?: number; date?: string; status?: string }
export interface Fact<T = number | string> {
  key: string; label: string; value: T | null; unit: FactUnit; quality: FactQuality;
  source: string; asOf: string | null; basis?: string; note?: string; docRefs: DocRef[];
}
export interface ContextSection { id: string; title: string; facts: Fact[]; notes?: string[] }
export type SubjectKind = 'CUSTOMER' | 'EMPLOYEE' | 'SUPPLIER' | 'EXPENSE_SCOPE';
export interface SubjectRef { kind: SubjectKind; id: string }
export type ApprovalRefKind = 'ADVANCE_REQUEST' | 'INTERNAL_REQUEST' | 'FINANCE_REQUEST' | 'CREDIT_LIMIT_REQUEST';
export interface ApprovalRef { kind: ApprovalRefKind; id: string }
export interface ViewerAccess { userId?: string; finance: boolean; hr: boolean; sales: boolean; internal: boolean }
export interface ContextOptions { now?: Date; avgMethod?: 'SIMPLE' | 'WEIGHTED'; periodMonth?: string; hiddenCollections?: string[]; viewer?: ViewerAccess }
export interface ApprovalContext {
  id: string; kind: ApprovalRefKind; requestId: string; title: string; requesterId?: string; subject?: SubjectRef;
  amountRials: number | null; sections: ContextSection[]; policyNotes: string[]; suggestedAmountRials: number | null;
  generatedAt: string; calcVersion: string; qualitySummary: Record<FactQuality, number>;
}
export interface FinancialContext { subject: SubjectRef; title: string; sections: ContextSection[]; generatedAt: string; calcVersion: string; qualitySummary: Record<FactQuality, number> }

/* ───────────── ابزارهای پایه ───────────── */
interface Ctx { state: AppState; now: Date; viewer: ViewerAccess; hidden: Set<string>; opts: ContextOptions }
const arr = (c: Ctx, name: string): any[] | undefined => (c.hidden.has(name) ? undefined : Array.isArray((c.state as any)[name]) ? (c.state as any)[name] : undefined);
const live = (xs: any[] | undefined) => (xs || []).filter(x => !x?.deletedAt);
const num = (v: unknown): number | null => { const n = typeof v === 'string' ? Number(v.replace(/[,،٬\s]/g, '')) : Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n; };
const sum = (xs: Array<number | null | undefined>) => xs.reduce<number>((a, b) => a + (Number(b) || 0), 0);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const toMs = (s?: string | null) => { if (!s) return NaN; const t = Date.parse(String(s).length === 10 ? `${s}T00:00:00Z` : String(s)); return t; };
const monthOf = (now: Date) => ymd(now).slice(0, 7);

export function isDemoRecord(r: any): boolean {
  if (!r) return false;
  return r.source === 'LOCAL_TEST' || r.source === 'DEMO' || r.isDemo === true || (typeof r.id === 'string' && r.id.startsWith('demo-'));
}
function isDemoState(s: AppState): boolean {
  return (s as any)?.settings?.demoMode === true || (s as any)?.seedMetadata?.mode === 'DEMO' || (s as any)?.seedMetadata?.mode === 'LOCAL_TEST';
}
function isErpRecord(r: any): boolean { return !!(r && (r.sourceSystem || r.externalId || r.sourceSystemCode)); }
function latestSync(rs: any[]): string | null {
  const ts = rs.map(r => r?.lastSyncedAt || r?.syncedAt || r?.updatedAt).filter(Boolean).map(String).sort();
  return ts.length ? ts[ts.length - 1] : null;
}
/** کیفیت مجموعه رکوردها: DEMO > ERP > CRM؛ ناقص اگر ورودی‌ها ناقص باشند */
function qualityOf(c: Ctx, rs: any[], partial = false): FactQuality {
  if (isDemoState(c.state) || (rs.length > 0 && rs.every(isDemoRecord))) return 'DEMO';
  if (partial) return 'PARTIAL';
  if (rs.length > 0 && rs.every(isErpRecord)) return 'ERP_MIRROR';
  return 'CRM_LOCAL';
}
function fact(c: Ctx, p: Partial<Fact> & Pick<Fact, 'key' | 'label' | 'unit'>, rs: any[] = [], partial = false): Fact {
  const value = p.value === undefined ? null : p.value;
  return {
    key: p.key, label: p.label, unit: p.unit, value,
    quality: value === null ? (p.quality || 'UNAVAILABLE') : (p.quality || qualityOf(c, rs, partial)),
    source: p.source || 'CRM', asOf: p.asOf ?? latestSync(rs) ?? (value === null ? null : c.now.toISOString()),
    basis: p.basis, note: p.note, docRefs: p.docRefs || [],
  };
}
const restricted = (key: string, label: string, unit: FactUnit): Fact => ({ key, label, unit, value: null, quality: 'RESTRICTED', source: '—', asOf: null, note: 'دسترسی شما به این اطلاعات مجاز نیست.', docRefs: [] });
const unavailable = (c: Ctx, key: string, label: string, unit: FactUnit, source: string, hiddenName?: string, note?: string): Fact =>
  hiddenName && c.hidden.has(hiddenName) ? restricted(key, label, unit)
    : { key, label, unit, value: null, quality: 'UNAVAILABLE', source, asOf: null, note: note || 'اطلاعات در دسترس نیست (منبع معتبر دریافت نشده)', docRefs: [] };
const userName = (c: Ctx, id?: string) => (c.state.users || []).find(u => u.id === id)?.name || id || 'نامشخص';

/** پیش‌فرض امن: بدون viewer صریح هیچ دسترسی داده نمی‌شود (resolveViewerAccess در financialAccess.ts). */
export const NO_ACCESS: ViewerAccess = { finance: false, hr: false, sales: false, internal: false };
const mkCtx = (state: AppState, opts: ContextOptions = {}): Ctx => ({
  state, now: opts.now || new Date(), viewer: opts.viewer || NO_ACCESS, hidden: new Set(opts.hiddenCollections || []), opts,
});
export function summarizeQuality(sections: ContextSection[]): Record<FactQuality, number> {
  const out: Record<FactQuality, number> = { ERP_MIRROR: 0, CRM_LOCAL: 0, DEMO: 0, PARTIAL: 0, UNAVAILABLE: 0, RESTRICTED: 0 };
  for (const s of sections) for (const f of s.facts) out[f.quality]++;
  return out;
}
const toDocs = (type: string, rs: any[], pick: (r: any) => Partial<DocRef> = () => ({}), max = 50): DocRef[] =>
  rs.slice(0, max).map(r => ({ type, id: String(r.id), ...pick(r) }));

/* ───────────── ۱) پرونده مالی کارمند (مساعده/بدهی) ───────────── */
export function buildEmployeeFinancialSection(c: Ctx, userId: string, excludeRequestId?: string): ContextSection {
  const advAll = arr(c, 'advanceRequests');
  const facts: Fact[] = [];
  const notes: string[] = ['«تأییدشده» به معنی پرداخت قطعی نیست؛ پرداخت و سند رسمی فقط در حسابداری/سامانه مالی ثبت می‌شود.'];
  if (c.hidden.has('advanceRequests')) {
    facts.push(restricted('advance.outstanding', 'مانده مساعده قبلی', 'IRR'), restricted('advance.history', 'سوابق درخواست مساعده', 'COUNT'));
  } else {
    const mine = live(advAll).filter(a => a.userId === userId && a.id !== excludeRequestId);
    const amt = (a: any) => num(a.approvedAmountRials) ?? num(a.requestedAmountRials) ?? 0;
    const open = mine.filter(a => a.status === 'APPROVED');
    const settled = mine.filter(a => a.status === 'SETTLED');
    const refs = (xs: any[]) => toDocs('ADVANCE', xs, a => ({ label: a.reason, amount: amt(a), date: a.createdAt, status: a.status }));
    facts.push(
      fact(c, { key: 'advance.outstanding', label: 'مانده مساعده قبلی (تأییدشده و تسویه‌نشده)', unit: 'IRR', value: advAll ? sum(open.map(amt)) : null, source: 'CRM: advanceRequests', basis: 'مجموع مبلغ تأییدشده با وضعیت تأییدشده که هنوز در فیش حقوق تسویه نشده', docRefs: refs(open) }, open, false),
      fact(c, { key: 'advance.totalApproved', label: 'کل مساعده‌های تأییدشده (شامل تسویه‌شده)', unit: 'IRR', value: advAll ? sum([...open, ...settled].map(amt)) : null, source: 'CRM: advanceRequests', docRefs: refs([...open, ...settled]) }, [...open, ...settled]),
      fact(c, { key: 'advance.totalSettled', label: 'کل مساعده‌های تسویه‌شده', unit: 'IRR', value: advAll ? sum(settled.map(amt)) : null, source: 'CRM: advanceRequests', docRefs: refs(settled) }, settled),
      fact(c, { key: 'advance.history', label: 'سوابق درخواست‌های قبلی (تأیید/رد)', unit: 'TEXT', value: advAll ? `${mine.filter(a => ['APPROVED', 'SETTLED'].includes(a.status)).length} تأیید · ${mine.filter(a => a.status === 'REJECTED').length} رد · ${mine.filter(a => a.status === 'REQUESTED').length} در انتظار` : null, source: 'CRM: advanceRequests', docRefs: refs(mine) }, mine),
    );
  }
  // بدهی پرسنلی فقط از دفتر/آینه حسابداری (personnelLedgerEntries)؛ بدون آن «در دسترس نیست»، نه صفر.
  const led = arr(c, 'personnelLedgerEntries');
  if (c.hidden.has('personnelLedgerEntries')) facts.push(restricted('debt.personnel', 'مانده بدهی پرسنلی', 'IRR'));
  else if (!led || led.length === 0) facts.push(unavailable(c, 'debt.personnel', 'مانده بدهی پرسنلی', 'IRR', 'سامانه مالی: دفتر تفصیلی پرسنل'));
  else {
    const mine = live(led).filter(e => e.userId === userId);
    facts.push(fact(c, { key: 'debt.personnel', label: 'مانده بدهی پرسنلی', unit: 'IRR', value: sum(mine.map(e => num(e.amountRials))), source: 'سامانه مالی: دفتر تفصیلی پرسنل', basis: 'مثبت = طلب شرکت از کارمند', docRefs: toDocs('LEDGER', mine, e => ({ label: e.description, amount: num(e.amountRials) ?? undefined, date: e.date })) }, mine));
  }
  return { id: 'employee-financial', title: 'وضعیت مالی کارمند', facts, notes };
}

/* ───────────── ۲) عملکرد فروش کارمند ───────────── */
export function buildEmployeePerformanceSection(c: Ctx, userId: string, periodMonth?: string): ContextSection {
  const period = periodMonth || monthOf(c.now);
  const inv = arr(c, 'invoices'); const targets = arr(c, 'salesTargets');
  const facts: Fact[] = [];
  if (c.hidden.has('invoices')) facts.push(restricted('sales.realized', 'فروش تحقق‌یافته', 'IRR'), restricted('sales.collection', 'عملکرد وصول مطالبات', 'PERCENT'));
  else if (!inv || inv.length === 0) facts.push(unavailable(c, 'sales.realized', 'فروش تحقق‌یافته', 'IRR', 'سامانه مالی: فاکتورها'), unavailable(c, 'sales.collection', 'عملکرد وصول مطالبات', 'PERCENT', 'سامانه مالی: فاکتورها/پرداخت‌ها'));
  else {
    const mine = live(inv).filter(i => (i.ownerId === userId) && !['CANCELLED', 'DRAFT'].includes(String(i.status)) && String(i.date || '').startsWith(period));
    const realized = sum(mine.map(i => num(i.totalAmount)));
    const t = live(targets).find(x => x.userId === userId && x.periodMonth === period);
    const target = t ? num(t.revenueTargetRials) : null;
    const ach = target && target > 0 ? Math.round((realized / target) * 1000) / 10 : null;
    facts.push(
      fact(c, { key: 'sales.realized', label: `فروش ثبت‌شده دوره ${period}`, unit: 'IRR', value: realized, source: 'فاکتورهای متعلق به کارمند', basis: 'جمع مبلغ فاکتورهای غیرابطال/غیرپیش‌نویس؛ هم‌مبنا با موتور حقوق (برگشتی کسر نشده)', docRefs: toDocs('INVOICE', mine, i => ({ label: i.invoiceNumber, amount: num(i.totalAmount) ?? undefined, date: i.date, status: i.status })) }, mine, true),
      target === null ? unavailable(c, 'sales.target', 'هدف فروش', 'IRR', 'CRM: salesTargets', 'salesTargets', 'هدف فروش این دوره ثبت نشده است') : fact(c, { key: 'sales.target', label: 'هدف فروش', unit: 'IRR', value: target, source: 'CRM: salesTargets', asOf: null, docRefs: [{ type: 'TARGET', id: t.id, amount: target }] }, [t]),
      ach === null ? unavailable(c, 'sales.achievement', 'درصد تحقق هدف', 'PERCENT', 'محاسبه‌شده', undefined, 'بدون هدف معتبر قابل محاسبه نیست') : fact(c, { key: 'sales.achievement', label: 'درصد تحقق هدف', unit: 'PERCENT', value: ach, source: 'محاسبه‌شده', basis: 'فروش ثبت‌شده ÷ هدف' }, mine, true),
      ach === null ? unavailable(c, 'sales.gap', 'فاصله تا هدف', 'PERCENT', 'محاسبه‌شده') : fact(c, { key: 'sales.gap', label: 'فاصله تا هدف', unit: 'PERCENT', value: Math.max(0, Math.round((100 - ach) * 10) / 10), source: 'محاسبه‌شده' }, mine, true),
    );
    const billed = sum(mine.map(i => num(i.totalAmount))); const paid = sum(mine.map(i => num(i.paidAmount)));
    const hasPaid = mine.length > 0 && mine.every(i => num(i.paidAmount) !== null);
    facts.push(hasPaid && billed > 0
      ? fact(c, { key: 'sales.collection', label: 'عملکرد وصول فاکتورهای کارمند', unit: 'PERCENT', value: Math.round((paid / billed) * 1000) / 10, source: 'فاکتورها', basis: 'وصول‌شده ÷ مبلغ فاکتورهای همان دوره', docRefs: toDocs('INVOICE', mine, i => ({ label: i.invoiceNumber, amount: num(i.paidAmount) ?? undefined, date: i.date })) }, mine, true)
      : unavailable(c, 'sales.collection', 'عملکرد وصول فاکتورهای کارمند', 'PERCENT', 'فاکتورها', undefined, 'داده وصول معتبر برای این دوره موجود نیست'));
  }
  return { id: 'employee-performance', title: 'عملکرد فروش', facts, notes: ['فروش بالا خودکار به معنی استحقاق مساعده بیشتر نیست؛ تصمیم نهایی طبق سیاست شرکت است.'] };
}

/* ───────────── ۳) مانده مرخصی ───────────── */
export function leaveDays(startDate?: string, endDate?: string): number | null {
  const a = toMs(startDate), b = toMs(endDate || startDate);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / DAY) + 1;
}
export function buildLeaveSection(c: Ctx, userId: string, requestId?: string, range?: { startDate?: string; endDate?: string }): ContextSection {
  const year = Number(String(range?.startDate || ymd(c.now)).slice(0, 4));
  const ent = arr(c, 'leaveEntitlements'); const reqs = arr(c, 'internalRequests');
  const facts: Fact[] = [];
  const mineAll = live(reqs).filter(r => r.type === 'LEAVE' && r.creatorId === userId && r.id !== requestId && Number(String(r.data?.startDate || '').slice(0, 4)) === year);
  const dayOf = (r: any) => leaveDays(r.data?.startDate, r.data?.endDate) ?? 0;
  const approvedUncounted = mineAll.filter(r => r.status === 'APPROVED' && !r.data?.balanceAppliedAt);
  const pending = mineAll.filter(r => ['SUBMITTED', 'IN_REVIEW', 'WAITING_FOR_INFORMATION'].includes(r.status));
  const e = live(ent).find(x => x.userId === userId && Number(x.year) === year);
  const quota = e ? num(e.annualDays) : null; const consumed = e ? num(e.consumedDays) : null;
  const docsOf = (xs: any[]) => toDocs('LEAVE_REQUEST', xs, r => ({ label: `${r.data?.startDate} تا ${r.data?.endDate}`, amount: dayOf(r), date: r.data?.startDate, status: r.status }));
  const entUnavailable = (key: string, label: string) => c.hidden.has('leaveEntitlements') ? restricted(key, label, 'DAYS') : unavailable(c, key, label, 'DAYS', 'منابع انسانی: مانده مرخصی', undefined, 'سهمیه/مصرف رسمی مرخصی ثبت نشده است');
  facts.push(quota === null ? entUnavailable('leave.quota', `سهمیه مرخصی سالانه ${year}`) : fact(c, { key: 'leave.quota', label: `سهمیه مرخصی سالانه ${year}`, unit: 'DAYS', value: quota, source: 'منابع انسانی', asOf: e.lastSyncedAt || e.updatedAt || null }, [e]));
  facts.push(consumed === null ? entUnavailable('leave.consumed', 'مرخصی مصرف‌شده (رسمی)') : fact(c, { key: 'leave.consumed', label: 'مرخصی مصرف‌شده (رسمی)', unit: 'DAYS', value: consumed, source: 'منابع انسانی', asOf: e.lastSyncedAt || e.updatedAt || null }, [e]));
  facts.push(fact(c, { key: 'leave.approvedUncounted', label: 'تأییدشده و هنوز در مانده لحاظ‌نشده', unit: 'DAYS', value: reqs ? sum(approvedUncounted.map(dayOf)) : null, source: 'سامانه: درخواست‌های داخلی', docRefs: docsOf(approvedUncounted) }, approvedUncounted));
  const usable = quota !== null && consumed !== null ? quota - consumed - sum(approvedUncounted.map(dayOf)) : null;
  facts.push(usable === null ? unavailable(c, 'leave.usable', 'مانده قابل استفاده', 'DAYS', 'محاسبه‌شده', undefined, 'بدون سهمیه و مصرف رسمی قابل محاسبه نیست') : fact(c, { key: 'leave.usable', label: 'مانده قابل استفاده', unit: 'DAYS', value: usable, source: 'محاسبه‌شده', basis: 'سهمیه − مصرف رسمی − تأییدشده‌های لحاظ‌نشده (درخواست‌های در انتظار کسر نمی‌شوند)' }, [e], true));
  facts.push(fact(c, { key: 'leave.pending', label: 'درخواست‌های در انتظار تأیید (کسر نشده)', unit: 'DAYS', value: reqs ? sum(pending.map(dayOf)) : null, source: 'سامانه: درخواست‌های داخلی', docRefs: docsOf(pending) }, pending));
  facts.push(usable === null ? unavailable(c, 'leave.plannable', 'ظرفیت قابل برنامه‌ریزی', 'DAYS', 'محاسبه‌شده') : fact(c, { key: 'leave.plannable', label: 'ظرفیت قابل برنامه‌ریزی (پس از در نظر گرفتن در انتظارها)', unit: 'DAYS', value: usable - sum(pending.map(dayOf)), source: 'محاسبه‌شده' }, [e], true));
  const slips = live(arr(c, 'payslips')).filter(p => p.userId === userId && String(p.month || '').startsWith(String(year)));
  facts.push(arr(c, 'payslips') ? fact(c, { key: 'leave.absence', label: 'غیبت غیرموجه ثبت‌شده در فیش‌ها', unit: 'DAYS', value: sum(slips.map(p => num(p.unexcusedAbsenceDays))), source: 'فیش‌های حقوق', docRefs: toDocs('PAYSLIP', slips, p => ({ label: p.month, amount: num(p.unexcusedAbsenceDays) ?? undefined })) }, slips, true) : unavailable(c, 'leave.absence', 'غیبت غیرموجه', 'DAYS', 'فیش‌های حقوق', 'payslips'));
  // تداخل با تیم
  const me = (c.state.users || []).find(u => u.id === userId);
  const mgr = String((me as any)?.managerId || me?.parentId || '');
  const peers = mgr ? (c.state.users || []).filter(u => u.id !== userId && String((u as any).managerId || u.parentId || '') === mgr) : [];
  const s = toMs(range?.startDate), en = toMs(range?.endDate || range?.startDate);
  if (!reqs || !mgr || peers.length === 0 || !Number.isFinite(s)) facts.push(unavailable(c, 'leave.teamOverlap', 'تداخل با مرخصی هم‌تیمی‌ها', 'COUNT', 'سامانه: ساختار تیم و درخواست‌ها', 'internalRequests', 'ساختار تیم یا بازه درخواست برای بررسی تداخل کافی نیست'));
  else {
    const ids = new Set(peers.map(p => p.id));
    const clash = live(reqs).filter(r => r.type === 'LEAVE' && ids.has(r.creatorId) && ['APPROVED', 'SUBMITTED', 'IN_REVIEW'].includes(r.status) && toMs(r.data?.startDate) <= en && toMs(r.data?.endDate || r.data?.startDate) >= s);
    facts.push(fact(c, { key: 'leave.teamOverlap', label: 'هم‌تیمی‌های دارای مرخصی هم‌پوشان', unit: 'COUNT', value: new Set(clash.map(r => r.creatorId)).size, source: 'CRM', docRefs: toDocs('LEAVE_REQUEST', clash, r => ({ label: userName(c, r.creatorId), date: r.data?.startDate, status: r.status })) }, clash, true));
  }
  return { id: 'leave', title: 'مانده و سوابق مرخصی', facts };
}

/* ───────────── ۴) بودجه و هزینه ───────────── */
export interface ExpenseScope { category?: string; departmentId?: string; costCenterId?: string; vendor?: string; amountRials?: number | null; excludeRequestId?: string }
const COMMITTED = ['DUE', 'APPROVED', 'COMMITTED', 'PENDING_PAYMENT'];
export function buildExpenseBudgetSection(c: Ctx, sc: ExpenseScope): ContextSection {
  const budgets = live(arr(c, 'expenseBudgets')); const today = ymd(c.now);
  const specificity = (b: any) => (b.scopeType === 'COST_CENTER' && b.scopeId === sc.costCenterId ? 3 : b.scopeType === 'DEPARTMENT' && b.scopeId === sc.departmentId ? 2 : b.scopeType === 'CATEGORY' && b.scopeId === sc.category ? 1 : 0);
  const b = budgets.filter(x => (!x.periodStart || x.periodStart <= today) && (!x.periodEnd || x.periodEnd >= today)).sort((x, y) => specificity(y) - specificity(x)).find(x => specificity(x) > 0);
  const inScope = (e: any) => !!b && ((b.scopeType === 'COST_CENTER' && e.costCenterId === b.scopeId) || (b.scopeType === 'DEPARTMENT' && e.departmentId === b.scopeId) || (b.scopeType === 'CATEGORY' && e.category === b.scopeId));
  const inPeriod = (d?: string) => !!b && (!!d) && (!b.periodStart || d >= b.periodStart) && (!b.periodEnd || d <= b.periodEnd);
  const exp = live(arr(c, 'expenses'));
  const paid = b ? exp.filter(e => e.status === 'PAID' && inScope(e) && inPeriod(String(e.date || '').slice(0, 10))) : [];
  const commitExp = b ? exp.filter(e => COMMITTED.includes(String(e.status)) && inScope(e) && inPeriod(String(e.dueDate || e.date || '').slice(0, 10))) : [];
  // درخواست‌های داخلی تأییدشده‌ای که هنوز هزینه (expenses) متناظر ندارند؛ با linkedExpenseId از شمارش دوباره جلوگیری می‌شود.
  const commitReq = b ? live(arr(c, 'internalRequests')).filter(r => ['EXPENSE', 'PURCHASE'].includes(r.type) && r.status === 'APPROVED' && r.id !== sc.excludeRequestId && !r.data?.linkedExpenseId && inScope({ costCenterId: r.data?.costCenterId, departmentId: r.data?.departmentId, category: r.data?.category }) && num(r.data?.amount) !== null) : [];
  const committed = sum(commitExp.map(e => num(e.amount))) + sum(commitReq.map(r => num(r.data?.amount)));
  const finalCost = sum(paid.map(e => num(e.amount)));
  const budget = b ? num(b.approvedAmountRials) : null;
  const amount = sc.amountRials ?? null;
  const facts: Fact[] = [];
  const noBudget = (key: string, label: string, unit: FactUnit) => c.hidden.has('expenseBudgets') ? restricted(key, label, unit) : unavailable(c, key, label, unit, 'سامانه/سامانه مالی: بودجه مصوب', undefined, 'بودجه مصوب برای این بخش/دوره ثبت نشده است');
  facts.push(b && budget !== null ? fact(c, { key: 'budget.approved', label: 'بودجه مصوب', unit: 'IRR', value: budget, source: 'بودجه مصوب', docRefs: [{ type: 'BUDGET', id: b.id, label: `${b.scopeType}:${b.scopeId}`, amount: budget }] }, [b]) : noBudget('budget.approved', 'بودجه مصوب', 'IRR'));
  facts.push(b ? fact(c, { key: 'budget.final', label: 'هزینه قطعی‌شده (پرداخت‌شده)', unit: 'IRR', value: finalCost, source: 'هزینه‌ها', docRefs: toDocs('EXPENSE', paid, e => ({ label: e.title, amount: num(e.amount) ?? undefined, date: e.date })) }, paid) : noBudget('budget.final', 'هزینه قطعی‌شده (پرداخت‌شده)', 'IRR'));
  facts.push(b ? fact(c, { key: 'budget.committed', label: 'تعهدات تأییدشده و پرداخت‌نشده', unit: 'IRR', value: committed, source: 'هزینه‌های سررسید آتی + درخواست‌های تأییدشده', basis: 'درخواست‌های دارای هزینهٔ پیوندشده دوباره شمرده نمی‌شوند', docRefs: [...toDocs('EXPENSE', commitExp, e => ({ label: e.title, amount: num(e.amount) ?? undefined, date: e.dueDate })), ...toDocs('INTERNAL_REQUEST', commitReq, r => ({ label: r.title, amount: num(r.data?.amount) ?? undefined, date: r.createdAt }))] }, [...commitExp, ...commitReq], true) : noBudget('budget.committed', 'تعهدات تأییدشده و پرداخت‌نشده', 'IRR'));
  facts.push(fact(c, { key: 'budget.request', label: 'مبلغ درخواست جدید', unit: 'IRR', value: amount, source: 'درخواست' }, []));
  const remaining = b && budget !== null ? budget - finalCost - committed : null;
  facts.push(remaining === null ? noBudget('budget.remaining', 'باقی‌مانده پس از تعهدات', 'IRR') : fact(c, { key: 'budget.remaining', label: 'باقی‌مانده پس از تعهدات', unit: 'IRR', value: remaining, source: 'محاسبه‌شده', basis: 'بودجه − قطعی − تعهد', note: amount !== null && amount > remaining ? 'مبلغ درخواست از باقی‌مانده بیشتر است.' : undefined }, [b], true));
  const lim = b ? num(b.perRequestLimitRials) : null;
  facts.push(lim === null ? noBudget('budget.limit', 'سقف مجاز هر هزینه', 'IRR') : fact(c, { key: 'budget.limit', label: 'سقف مجاز هر هزینه', unit: 'IRR', value: lim, source: 'بودجه مصوب', note: amount !== null && amount > lim ? 'مبلغ درخواست از سقف مجاز بیشتر است.' : undefined }, [b]));
  const cutoff = c.now.getTime() - 90 * DAY;
  const similar = exp.filter(e => (sc.category && e.category === sc.category || sc.vendor && e.vendor === sc.vendor) && toMs(e.date) >= cutoff);
  facts.push(arr(c, 'expenses') ? fact(c, { key: 'budget.similar', label: 'درخواست/هزینه مشابه در ۹۰ روز اخیر', unit: 'COUNT', value: similar.length, source: 'هزینه‌ها', docRefs: toDocs('EXPENSE', similar, e => ({ label: e.title, amount: num(e.amount) ?? undefined, date: e.date, status: e.status })) }, similar, true) : unavailable(c, 'budget.similar', 'هزینه مشابه', 'COUNT', 'هزینه‌ها', 'expenses'));
  const att = live(arr(c, 'attachments')).filter(a => a.entityType === 'REQUEST' && a.entityId === sc.excludeRequestId);
  facts.push(fact(c, { key: 'budget.docs', label: 'مدارک/فاکتور پیوست‌شده', unit: 'COUNT', value: arr(c, 'attachments') && sc.excludeRequestId ? att.length : null, source: 'پیوست‌ها', docRefs: toDocs('ATTACHMENT', att, a => ({ label: a.fileName, date: a.uploadedAt })) }, att));
  return { id: 'expense-budget', title: 'بودجه، هزینه و تعهدات', facts };
}


/** مانده فقط از گردش مالی: Σبدهکار − Σبستانکار سطرهای سند به‌ازای (تفصیلی × معین)؛ هرگز از فاکتور/صورتحساب (قانون اساسی §C). مثبت=بدهکار، منفی=بستانکار. */
function ledgerBalanceFact(c: Ctx, key: string, label: string, entity: { id?: string; code?: string; detailAccountId?: string; externalDetailCode?: string } | undefined, fallbackId: string): Fact {
  const src = 'گردش مالی (سطرهای سند حسابداری ERP)';
  const lines = arr(c, 'journalLines');
  if (c.hidden.has('journalLines')) return restricted(key, label, 'IRR');
  if (!lines || lines.length === 0) return unavailable(c, key, label, 'IRR', src, undefined, 'گردش مالی این طرف‌حساب از ERP دریافت نشده است؛ مانده از فاکتور/صورتحساب ساخته نمی‌شود.');
  const keys = customerDetailKeys(entity || { id: fallbackId }); if (!keys.includes(fallbackId)) keys.push(fallbackId);
  const found = [...computeDetailSubsidiaryBalances(lines).values()].find(b => keys.includes(b.detailKey));
  if (!found) return unavailable(c, key, label, 'IRR', src, undefined, 'برای این طرف‌حساب گردش مالی ثبت نشده است.');
  const nat = found.total.nature === 'DEBIT' ? 'بدهکار' : found.total.nature === 'CREDIT' ? 'بستانکار' : 'تسویه‌شده';
  const mapped = found.subsidiaries.filter(x => x.subsidiaryCode !== null).length;
  const partial = found.status === 'HAS_UNMAPPED';
  return fact(c, { key, label, unit: 'IRR', value: found.total.balance, source: src, basis: `Σبدهکار − Σبستانکار = ${found.total.balance.toLocaleString('fa-IR')} (${nat})؛ ${mapped} معین${partial ? '؛ بخشی از سطرها فاقد نگاشت معین است' : ''}`, docRefs: [] }, [], partial);
}

/* ───────────── ۵) پرونده اعتباری مشتری ───────────── */
export function buildCustomerCreditSection(c: Ctx, accountId: string, method: 'SIMPLE' | 'WEIGHTED' = 'SIMPLE'): ContextSection {
  const invAll = arr(c, 'invoices'); const facts: Fact[] = [];
  const need = (key: string, label: string, unit: FactUnit) => unavailable(c, key, label, unit, 'سامانه مالی: فاکتورها/پرداخت‌ها', 'invoices');
  if (!invAll || invAll.length === 0) {
    facts.push(ledgerBalanceFact(c, 'credit.balance', 'مانده حساب مشتری (بدهکار − بستانکار)', (arr(c, 'accounts') || []).find((a: any) => a.id === accountId), accountId));
    for (const [k, l, u] of [['credit.overdue', 'مانده سررسیدگذشته', 'IRR'], ['credit.notDue', 'مانده سررسیدنرسیده', 'IRR'], ['credit.avgDays', 'میانگین زمان وصول', 'DAYS'], ['credit.settledPct', 'فاکتورهای تسویه‌شده', 'PERCENT'], ['credit.onTime', 'درصد خوش‌حسابی', 'PERCENT']] as const) facts.push(need(k, l, u));
  } else {
    const invs = live(invAll).filter(i => (i.accountId === accountId || i.customerId === accountId) && !['CANCELLED', 'DRAFT'].includes(String(i.status)));
    const today = ymd(c.now);
    const total = (i: any) => num(i.totalAmount) ?? 0;
    const bal = (i: any) => num(i.balance) ?? Math.max(0, total(i) - (num(i.paidAmount) ?? 0));
    const open = invs.filter(i => bal(i) > 0);
    const overdue = open.filter(i => i.dueDate && String(i.dueDate).slice(0, 10) < today);
    const notDue = open.filter(i => !overdue.includes(i));
    const settled = invs.filter(i => bal(i) <= 0);
    const alloc = live(arr(c, 'paymentAllocations')); const pays = live(arr(c, 'payments'));
    const settleMs = (i: any): number | null => {
      const rows = alloc.filter(a => a.invoiceId === i.id).map(a => ({ at: toMs(pays.find(p => p.id === a.paymentId)?.date || a.createdAt), amount: num(a.amount) ?? 0 })).filter(r => Number.isFinite(r.at)).sort((x, y) => x.at - y.at);
      let cum = 0; for (const r of rows) { cum += r.amount; if (cum >= total(i) - 1) return r.at; }
      return null;
    };
    const timed = settled.map(i => ({ i, days: (() => { const s = settleMs(i), d = toMs(i.date); return s !== null && Number.isFinite(d) && s >= d ? (s - d) / DAY : null; })(), s: settleMs(i) })).filter(x => x.days !== null) as Array<{ i: any; days: number; s: number }>;
    const excluded = settled.length - timed.length;
    const simple = timed.length ? timed.reduce((a, b) => a + b.days, 0) / timed.length : null;
    const w = timed.reduce((a, b) => a + total(b.i), 0);
    const weighted = timed.length && w > 0 ? timed.reduce((a, b) => a + b.days * total(b.i), 0) / w : null;
    const avg = method === 'WEIGHTED' ? weighted : simple;
    const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
    const docs = (xs: any[]) => toDocs('INVOICE', xs, i => ({ label: i.invoiceNumber, amount: bal(i), date: i.date, status: i.status }));
    facts.push(
      ledgerBalanceFact(c, 'credit.balance', 'مانده حساب مشتری (بدهکار − بستانکار)', (arr(c, 'accounts') || []).find((a: any) => a.id === accountId), accountId),
      unavailable(c, 'credit.overdue', 'مانده سررسیدگذشته', 'IRR', 'گردش مالی', undefined, 'مانده فقط از گردش مالی می‌آید؛ تفکیک سررسید نیازمند تخصیص اسناد در ERP است و از فاکتور ساخته نمی‌شود.'),
      unavailable(c, 'credit.notDue', 'مانده سررسیدنرسیده', 'IRR', 'گردش مالی', undefined, 'مانده فقط از گردش مالی می‌آید؛ تفکیک سررسید نیازمند تخصیص اسناد در ERP است و از فاکتور ساخته نمی‌شود.'),
      avg === null ? unavailable(c, 'credit.avgDays', 'میانگین زمان وصول', 'DAYS', 'فاکتور + تخصیص پرداخت', undefined, 'فاکتور تسویه‌شده‌ای با تاریخ تسویه قابل‌اثبات موجود نیست') : fact(c, { key: 'credit.avgDays', label: `میانگین زمان وصول (${method === 'WEIGHTED' ? 'موزون بر مبلغ' : 'ساده'})`, unit: 'DAYS', value: r1(avg), source: 'فاکتور + تخصیص پرداخت', basis: `فاصله صدور تا تسویه کامل؛ فاکتور باز خارج است. ${timed.length} نمونه${excluded ? `؛ ${excluded} فاکتور تسویه‌شده بدون تاریخ تسویه قابل‌اثبات کنار گذاشته شد` : ''}. ساده=${r1(simple)} · موزون=${r1(weighted)}`, docRefs: toDocs('INVOICE', timed.map(t => t.i), i => ({ label: i.invoiceNumber, amount: total(i), date: i.date })) }, invs, excluded > 0),
      invs.length ? fact(c, { key: 'credit.settledPct', label: 'فاکتورهای تسویه‌شده', unit: 'PERCENT', value: Math.round((settled.length / invs.length) * 1000) / 10, source: 'فاکتورها', basis: `${settled.length} از ${invs.length} فاکتور`, docRefs: docs(settled) }, invs) : unavailable(c, 'credit.settledPct', 'فاکتورهای تسویه‌شده', 'PERCENT', 'فاکتورها', undefined, 'فاکتوری برای این مشتری ثبت نشده است'),
    );
    const known = timed.filter(t => t.i.dueDate && Number.isFinite(toMs(t.i.dueDate)));
    const onTime = known.filter(t => t.s <= toMs(t.i.dueDate) + DAY - 1);
    facts.push(known.length ? fact(c, { key: 'credit.onTime', label: 'خوش‌حسابی (تسویه تا سررسید)', unit: 'PERCENT', value: Math.round((onTime.length / known.length) * 1000) / 10, source: 'فاکتور + تخصیص پرداخت', basis: `${onTime.length} از ${known.length} فاکتور دارای سررسید و تاریخ تسویه`, docRefs: toDocs('INVOICE', known.map(t => t.i), i => ({ label: i.invoiceNumber, date: i.dueDate })) }, invs, true) : unavailable(c, 'credit.onTime', 'خوش‌حسابی', 'PERCENT', 'فاکتور + تخصیص پرداخت'));
    facts.push(fact(c, { key: 'credit.purchases', label: 'کل خرید (فاکتورها)', unit: 'IRR', value: sum(invs.map(total)), source: 'فاکتورها', docRefs: docs(invs) }, invs));
    const myPays = pays.filter(p => p.accountId === accountId || p.customerId === accountId);
    facts.push(arr(c, 'payments') ? fact(c, { key: 'credit.payments', label: 'کل پرداخت‌های مشتری', unit: 'IRR', value: sum(myPays.map(p => num(p.amount))), source: 'پرداخت‌ها', docRefs: toDocs('PAYMENT', myPays, p => ({ label: p.method, amount: num(p.amount) ?? undefined, date: p.date, status: p.status })) }, myPays) : unavailable(c, 'credit.payments', 'کل پرداخت‌های مشتری', 'IRR', 'پرداخت‌ها', 'payments'));
  }
  const chq = arr(c, 'cheques');
  if (!chq) facts.push(unavailable(c, 'credit.bounced', 'سوابق برگشتی', 'COUNT', 'چک‌ها', 'cheques'));
  else {
    const bounced = live(chq).filter(q => (q.accountId === accountId || q.customerId === accountId) && q.direction !== 'PAYABLE' && String(q.status).toUpperCase() === 'BOUNCED');
    facts.push(fact(c, { key: 'credit.bounced', label: 'اسناد برگشتی (تعداد)', unit: 'COUNT', value: bounced.length, source: 'چک‌ها', note: `مبلغ کل: ${sum(bounced.map(q => num(q.amount))).toLocaleString('fa-IR')} ریال`, docRefs: toDocs('CHEQUE', bounced, q => ({ label: q.chequeNumber, amount: num(q.amount) ?? undefined, date: q.dueDate, status: q.status })) }, bounced));
  }
  const acct = (c.state.accounts || []).find(a => a.id === accountId);
  facts.push(acct && num((acct as any).creditLimit) ? fact(c, { key: 'credit.limit', label: 'سقف اعتبار فعلی', unit: 'IRR', value: num((acct as any).creditLimit), source: 'پرونده مشتری', docRefs: [] }, [acct]) : unavailable(c, 'credit.limit', 'سقف اعتبار فعلی', 'IRR', 'پرونده مشتری', undefined, 'سقف اعتبار ثبت نشده است'));
  const prior = live(arr(c, 'creditLimitRequests')).filter(r => r.accountId === accountId);
  facts.push(arr(c, 'creditLimitRequests') ? fact(c, { key: 'credit.priorRequests', label: 'درخواست‌های اعتبار قبلی', unit: 'COUNT', value: prior.length, source: 'CRM: creditLimitRequests', note: `مجموع مبالغ تأییدشده: ${sum(prior.filter(r => r.status === 'APPROVED').map(r => num(r.approvedLimitRials))).toLocaleString('fa-IR')} ریال`, docRefs: toDocs('CREDIT_REQUEST', prior, r => ({ amount: num(r.approvedLimitRials) ?? num(r.requestedLimitRials) ?? undefined, date: r.createdAt, status: r.status })) }, prior) : unavailable(c, 'credit.priorRequests', 'درخواست‌های اعتبار قبلی', 'COUNT', 'CRM', 'creditLimitRequests'));
  return { id: 'customer-credit', title: 'پرونده اعتباری مشتری', facts, notes: ['میانگین زمان وصول فقط از فاکتورهای تسویه‌کامل با تاریخ تسویه قابل‌اثبات محاسبه می‌شود. فاکتور باز در میانگین نیست.'] };
}

/* ───────────── ۶) تأمین‌کننده ───────────── */
export function buildSupplierSection(c: Ctx, supplierId: string): ContextSection {
  const bills = arr(c, 'supplierBills'); const pays = arr(c, 'supplierPayments'); const chq = arr(c, 'cheques');
  const mb = live(bills).filter(b => b.supplierId === supplierId); const mp = live(pays).filter(p => p.supplierId === supplierId);
  const billed = (b: any) => num(b.totalAmount) ?? num(b.amount) ?? 0;
  const out = (b: any) => num(b.balance) ?? Math.max(0, billed(b) - (num(b.paidAmount) ?? 0));
  const payable = live(chq).filter(q => q.direction === 'PAYABLE' && q.supplierId === supplierId && !['CLEARED', 'CANCELLED'].includes(String(q.status).toUpperCase()));
  const facts: Fact[] = [
    bills ? fact(c, { key: 'supplier.purchases', label: 'کل خرید (صورتحساب‌ها)', unit: 'IRR', value: sum(mb.map(billed)), source: 'صورتحساب تأمین‌کننده', docRefs: toDocs('SUPPLIER_BILL', mb, b => ({ label: b.billNumber, amount: billed(b), date: b.date, status: b.status })) }, mb) : unavailable(c, 'supplier.purchases', 'کل خرید', 'IRR', 'supplierBills', 'supplierBills'),
    ledgerBalanceFact(c, 'supplier.balance', 'مانده حساب تأمین‌کننده (بدهکار − بستانکار؛ منفی = بدهی ما)', (arr(c, 'suppliers') || []).find((x: any) => x.id === supplierId), supplierId),
    pays ? fact(c, { key: 'supplier.paid', label: 'کل پرداخت‌ها', unit: 'IRR', value: sum(mp.map(p => num(p.amount))), source: 'پرداخت تأمین‌کننده', docRefs: toDocs('SUPPLIER_PAYMENT', mp, p => ({ amount: num(p.amount) ?? undefined, date: p.date })) }, mp) : unavailable(c, 'supplier.paid', 'کل پرداخت‌ها', 'IRR', 'supplierPayments', 'supplierPayments'),
    chq ? fact(c, { key: 'supplier.cheques', label: 'چک‌های پرداختنیِ باز', unit: 'COUNT', value: payable.length, source: 'چک‌ها', docRefs: toDocs('CHEQUE', payable, q => ({ label: q.chequeNumber, amount: num(q.amount) ?? undefined, date: q.dueDate, status: q.status })) }, payable) : unavailable(c, 'supplier.cheques', 'چک‌های پرداختنی', 'COUNT', 'cheques', 'cheques'),
  ];
  return { id: 'supplier', title: 'پرونده تأمین‌کننده', facts };
}

/* ───────────── نمای ۳۶۰ درجه مشترک ───────────── */
function employeeSections(c: Ctx, userId: string, opts: { excludeRequestId?: string; periodMonth?: string } = {}): ContextSection[] {
  const self = c.viewer.userId === userId;
  if (!(c.viewer.hr || c.viewer.finance || self)) {
    return [{ id: 'employee-restricted', title: 'اطلاعات پرسنلی', facts: [restricted('employee.restricted', 'اطلاعات مالی و عملکردی کارمند', 'TEXT')] }];
  }
  return [buildEmployeeFinancialSection(c, userId, opts.excludeRequestId), buildEmployeePerformanceSection(c, userId, opts.periodMonth || c.opts.periodMonth)];
}
export function buildFinancial360(state: AppState, subject: SubjectRef, opts: ContextOptions = {}): FinancialContext {
  const c = mkCtx(state, opts); let sections: ContextSection[] = []; let title = '';
  if (subject.kind === 'CUSTOMER') {
    title = `پرونده مالی مشتری: ${(state.accounts || []).find(a => a.id === subject.id)?.name || subject.id}`;
    sections = c.viewer.finance || c.viewer.sales ? [buildCustomerCreditSection(c, subject.id, opts.avgMethod)] : [{ id: 'restricted', title: 'پرونده اعتباری', facts: [restricted('customer.restricted', 'اطلاعات مالی مشتری', 'TEXT')] }];
  } else if (subject.kind === 'EMPLOYEE') { title = `پرونده کارمند: ${userName(c, subject.id)}`; sections = [...employeeSections(c, subject.id), ...(c.viewer.hr || c.viewer.userId === subject.id ? [buildLeaveSection(c, subject.id)] : [])]; }
  else if (subject.kind === 'SUPPLIER') { title = `پرونده تأمین‌کننده: ${(live(arr(c, 'suppliers')).find(s => s.id === subject.id)?.name) || subject.id}`; sections = c.viewer.finance ? [buildSupplierSection(c, subject.id)] : [{ id: 'restricted', title: 'پرونده تأمین‌کننده', facts: [restricted('supplier.restricted', 'اطلاعات مالی تأمین‌کننده', 'TEXT')] }]; }
  else { title = `بودجه و هزینه: ${subject.id}`; sections = c.viewer.finance || c.viewer.internal ? [buildExpenseBudgetSection(c, { category: subject.id })] : []; }
  return { subject, title, sections, generatedAt: c.now.toISOString(), calcVersion: FI_CALC_VERSION, qualitySummary: summarizeQuality(sections) };
}

/* ───────────── Approval Intelligence: ساخت زمینه تصمیم برای هر درخواست ───────────── */
export function buildApprovalContext(state: AppState, ref: ApprovalRef, opts: ContextOptions = {}): ApprovalContext | null {
  const c = mkCtx(state, opts);
  const base = (p: Omit<ApprovalContext, 'id' | 'kind' | 'requestId' | 'generatedAt' | 'calcVersion' | 'qualitySummary'>): ApprovalContext => ({ ...p, id: `ctx:${ref.kind}:${ref.id}`, kind: ref.kind, requestId: ref.id, generatedAt: c.now.toISOString(), calcVersion: FI_CALC_VERSION, qualitySummary: summarizeQuality(p.sections) });
  if (ref.kind === 'ADVANCE_REQUEST') {
    const a = live(state.advanceRequests).find(x => x.id === ref.id); if (!a) return null;
    return base({ title: `درخواست مساعده ${a.requestNumber || ''}`.trim(), requesterId: a.userId, subject: { kind: 'EMPLOYEE', id: a.userId }, amountRials: num(a.requestedAmountRials), suggestedAmountRials: null,
      sections: employeeSections(c, a.userId, { excludeRequestId: a.id, periodMonth: a.targetMonth }), policyNotes: ['سیستم اطلاعات را ارائه می‌کند؛ ضوابط تأیید و مبلغ نهایی طبق سیاست شرکت و تصمیم مدیر است.'] });
  }
  if (ref.kind === 'INTERNAL_REQUEST') {
    const r = live(state.internalRequests).find(x => x.id === ref.id); if (!r) return null;
    const d = r.data || {}; const sections: ContextSection[] = []; let amount: number | null = num(d.amount); let subject: SubjectRef | undefined = { kind: 'EMPLOYEE', id: r.creatorId };
    if (r.type === 'LEAVE') { sections.push(...(c.viewer.hr || c.viewer.internal || c.viewer.userId === r.creatorId ? [buildLeaveSection(c, r.creatorId, r.id, d)] : [])); amount = leaveDays(d.startDate, d.endDate); }
    else if (r.type === 'ADVANCE') sections.push(...employeeSections(c, r.creatorId, { excludeRequestId: r.id }));
    else if (['EXPENSE', 'PURCHASE', 'PAYMENT', 'EQUIPMENT'].includes(r.type)) { subject = undefined; sections.push(...(c.viewer.finance || c.viewer.internal ? [buildExpenseBudgetSection(c, { category: d.category, departmentId: d.departmentId, costCenterId: d.costCenterId, vendor: d.vendor, amountRials: amount, excludeRequestId: r.id })] : [])); }
    else return base({ title: r.title, requesterId: r.creatorId, subject, amountRials: amount, suggestedAmountRials: null, sections: [], policyNotes: ['برای این نوع درخواست زمینه مالی تعریف نشده است.'] });
    return base({ title: r.title, requesterId: r.creatorId, subject, amountRials: amount, suggestedAmountRials: null, sections, policyNotes: [] });
  }
  if (ref.kind === 'CREDIT_LIMIT_REQUEST') {
    const q = live(arr(c, 'creditLimitRequests')).find(x => x.id === ref.id); if (!q) return null;
    return base({ title: `درخواست اعتبار برای ${(state.accounts || []).find(a => a.id === q.accountId)?.name || q.accountId}`, requesterId: q.requestedBy, subject: { kind: 'CUSTOMER', id: q.accountId }, amountRials: num(q.requestedLimitRials), suggestedAmountRials: null,
      sections: c.viewer.finance || c.viewer.sales ? [buildCustomerCreditSection(c, q.accountId, opts.avgMethod)] : [], policyNotes: ['تأیید اعتبار به معنی ثبت در سامانه مالی نیست؛ تغییر سقف رسمی باید در سامانه مرجع اعمال شود.'] });
  }
  const f = live(state.financeRequests).find(x => x.id === ref.id); if (!f) return null;
  const sections: ContextSection[] = [];
  if (f.nature) sections.push(classificationSection(c, f));
  if (f.accountId && (c.viewer.finance || c.viewer.sales)) sections.push(buildCustomerCreditSection(c, f.accountId, opts.avgMethod));
  if (f.classificationFields?.supplierId && c.viewer.finance) sections.push(buildSupplierSection(c, f.classificationFields.supplierId));
  if (f.classificationFields?.employeeId) sections.push(...employeeSections(c, f.classificationFields.employeeId));
  if (f.classificationFields?.costCenterId || f.classificationFields?.expenseType) sections.push(buildExpenseBudgetSection(c, { category: f.classificationFields.expenseType, costCenterId: f.classificationFields.costCenterId, amountRials: num(f.amount), excludeRequestId: f.id }));
  return base({ title: `${f.kind === 'PAYMENT_ORDER' ? 'دستور پرداخت' : 'مجوز واریز'}: ${f.payeeName}`, requesterId: f.requestedBy, subject: undefined, amountRials: num(f.amount), suggestedAmountRials: null, sections, policyNotes: ['تأیید این درخواست پرداخت قطعی یا سند حسابداری نیست؛ اجرا فقط در سامانه مالی/حسابداری انجام می‌شود.'] });
}

/* ───────────── Smart Accounting Classification ───────────── */
export type PaymentNature = 'PERSONNEL_ADVANCE' | 'SALARY' | 'OPERATING_EXPENSE' | 'GOODS_PURCHASE' | 'ASSET_PURCHASE' | 'FUEL' | 'SUPPLIER_PAYMENT' | 'DEBT_SETTLEMENT' | 'TAX' | 'OTHER';
export interface NatureDef { label: string; required: string[]; requiredAnyOf?: string[]; recommended?: string[]; fieldLabels: Record<string, string> }
const FL = { employeeId: 'کارمند', period: 'دوره', expenseType: 'نوع هزینه', costCenterId: 'مرکز هزینه', supplierId: 'تأمین‌کننده', invoiceRef: 'فاکتور/سند بدهی', assetType: 'نوع دارایی', location: 'محل استقرار', vehicleId: 'خودرو', unitId: 'واحد', counterpartyId: 'طرف حساب', referenceDocId: 'سند مرجع', taxType: 'نوع مالیات', otherAccountCode: 'حساب مجاز', natureNote: 'توضیح ماهیت' };
export const PAYMENT_NATURES: Record<PaymentNature, NatureDef> = {
  PERSONNEL_ADVANCE: { label: 'مساعده پرسنلی', required: ['employeeId'], fieldLabels: FL },
  SALARY: { label: 'حقوق و مزایا', required: ['employeeId', 'period'], fieldLabels: FL },
  OPERATING_EXPENSE: { label: 'هزینه جاری', required: ['expenseType', 'costCenterId'], fieldLabels: FL },
  GOODS_PURCHASE: { label: 'خرید کالا', required: ['supplierId'], fieldLabels: FL },
  ASSET_PURCHASE: { label: 'خرید دارایی', required: ['assetType', 'location'], fieldLabels: FL },
  FUEL: { label: 'سوخت', required: [], requiredAnyOf: ['vehicleId', 'unitId', 'costCenterId'], fieldLabels: FL },
  SUPPLIER_PAYMENT: { label: 'پرداخت به تأمین‌کننده', required: ['supplierId'], recommended: ['invoiceRef'], fieldLabels: FL },
  DEBT_SETTLEMENT: { label: 'تسویه بدهی', required: ['counterpartyId', 'referenceDocId'], fieldLabels: FL },
  TAX: { label: 'مالیات و عوارض', required: ['taxType', 'period'], fieldLabels: FL },
  OTHER: { label: 'سایر پرداخت‌ها', required: ['natureNote', 'otherAccountCode'], fieldLabels: FL },
};
export interface ClassificationInput { nature: string; fields?: Record<string, string | undefined>; scope?: { companyId?: string; branchId?: string; costCenterId?: string; documentType?: string }; at?: string }
export interface PaymentNatureMapping {
  id: string; nature: PaymentNature; version: number; status: 'ACTIVE' | 'DRAFT' | 'RETIRED'; effectiveFrom: string; effectiveTo?: string | null;
  scope?: { companyId?: string; branchId?: string; costCenterId?: string; documentType?: string };
  debitAccountCode: string; detailField?: string; creditAccountCode?: string; approvedBy?: string; note?: string;
}
export type MappingStatus = 'MAPPED' | 'UNMAPPED' | 'AMBIGUOUS' | 'INCOMPLETE' | 'INVALID_ACCOUNT' | 'UNKNOWN_NATURE';
export interface MappingResolution {
  status: MappingStatus; blocking: boolean; reasons: string[]; missingFields: string[]; recommendedMissing: string[];
  mappingId?: string; mappingVersion?: number; groupName?: string; groupCode?: string; accountCode?: string; accountName?: string; detail?: { field: string; id: string }; creditAccountCode?: string;
}
const blocked = (status: MappingStatus, reasons: string[], extra: Partial<MappingResolution> = {}): MappingResolution => ({ status, blocking: true, reasons, missingFields: [], recommendedMissing: [], ...extra });

export function resolveAccountingMapping(state: AppState, input: ClassificationInput): MappingResolution {
  const def = (PAYMENT_NATURES as Record<string, NatureDef>)[input.nature];
  if (!def) return blocked('UNKNOWN_NATURE', ['ماهیت پرداخت نامعتبر است.']);
  const f = input.fields || {}; const has = (k: string) => !!String(f[k] ?? '').trim();
  const missing = def.required.filter(k => !has(k));
  if (def.requiredAnyOf && !def.requiredAnyOf.some(has)) missing.push(def.requiredAnyOf.join(' | '));
  const recommendedMissing = (def.recommended || []).filter(k => !has(k));
  if (missing.length) return blocked('INCOMPLETE', [`فیلدهای لازم تکمیل نشده: ${missing.map(k => k.split(' | ').map(x => def.fieldLabels[x] || x).join(' یا ')).join('، ')}`], { missingFields: missing, recommendedMissing });
  const at = (input.at || new Date().toISOString()).slice(0, 10); const scope = input.scope || {};
  const cands = ((state as any).paymentNatureMappings || [] as PaymentNatureMapping[]).filter((m: PaymentNatureMapping) => !(m as any).deletedAt && m.nature === input.nature && m.status === 'ACTIVE' && m.effectiveFrom <= at && (!m.effectiveTo || m.effectiveTo >= at)
    && Object.entries(m.scope || {}).every(([k, v]) => !v || (scope as any)[k] === v));
  if (!cands.length) return blocked('UNMAPPED', ['برای این ماهیت نگاشت فعال و معتبر در تاریخ/محدوده درخواست تعریف نشده است؛ صدور نهایی مسدود است.'], { recommendedMissing });
  const spec = (m: PaymentNatureMapping) => Object.values(m.scope || {}).filter(Boolean).length;
  const top = Math.max(...cands.map(spec)); const best = cands.filter((m: PaymentNatureMapping) => spec(m) === top);
  const distinct = new Set(best.map((m: PaymentNatureMapping) => `${m.debitAccountCode}|${m.creditAccountCode || ''}|${m.detailField || ''}`));
  if (distinct.size > 1) return blocked('AMBIGUOUS', ['چند نگاشت هم‌اولویت با حساب‌های متفاوت وجود دارد؛ ابتدا نگاشت‌ها اصلاح شوند.'], { recommendedMissing });
  const m: PaymentNatureMapping = best.sort((a: PaymentNatureMapping, b: PaymentNatureMapping) => b.version - a.version)[0];
  const coa: any[] = (state as any).coaMirror || [];
  const acc = coa.find(a => a.code === m.debitAccountCode && a.isActive !== false);
  if (!acc) return blocked('INVALID_ACCOUNT', [`حساب ${m.debitAccountCode} در آینه سرفصل‌های سامانه مالی وجود ندارد یا غیرفعال است.`], { mappingId: m.id, mappingVersion: m.version, recommendedMissing });
  if (m.creditAccountCode && !coa.some(a => a.code === m.creditAccountCode && a.isActive !== false)) return blocked('INVALID_ACCOUNT', [`حساب طرف مقابل ${m.creditAccountCode} معتبر نیست.`], { mappingId: m.id, mappingVersion: m.version, recommendedMissing });
  let group = acc; const seen = new Set<string>(); while (group.parentCode && !seen.has(group.code)) { seen.add(group.code); const p = coa.find(a => a.code === group.parentCode); if (!p) break; group = p; }
  const detailField = m.detailField && has(m.detailField) ? { field: m.detailField, id: String(f[m.detailField]) } : undefined;
  return { status: 'MAPPED', blocking: false, reasons: [], missingFields: [], recommendedMissing, mappingId: m.id, mappingVersion: m.version, groupCode: group.code, groupName: group.name, accountCode: acc.code, accountName: acc.name, detail: detailField, creditAccountCode: m.creditAccountCode };
}
function classificationSection(c: Ctx, f: any): ContextSection {
  const r = resolveAccountingMapping(c.state, { nature: f.nature, fields: f.classificationFields, at: f.requestedAt });
  const nd = (PAYMENT_NATURES as Record<string, NatureDef>)[f.nature];
  const mk = (key: string, label: string, v: string | null) => fact(c, { key, label, unit: 'TEXT', value: v, source: 'نگاشت حسابداری مصوب' }, [], false);
  return { id: 'classification', title: 'طبقه‌بندی و تخصیص حسابداری', notes: r.reasons, facts: [
    mk('acc.nature', 'ماهیت پرداخت', nd?.label || f.nature), mk('acc.status', 'وضعیت نگاشت', r.status === 'MAPPED' ? 'نگاشت انجام شد' : `مسدود: ${r.status}`),
    mk('acc.group', 'گروه حساب', r.groupName || null), mk('acc.account', 'حساب معین', r.accountName ? `${r.accountName} (${r.accountCode})` : null),
    mk('acc.detail', 'تفصیلی', r.detail ? r.detail.id : null), mk('acc.version', 'نسخه نگاشت', r.mappingVersion ? String(r.mappingVersion) : null),
  ] };
}
/** ثبت ماهیت/نگاشت روی رکورد دستور پرداخت؛ نتیجه blocking تأیید نهایی را مسدود می‌کند (financeRequests.decideFinanceRequest). */
export function classifyFinanceRequestRecord(state: AppState, rec: any, now: Date): MappingResolution {
  const r = resolveAccountingMapping(state, { nature: rec.nature, fields: rec.classificationFields, at: now.toISOString() });
  rec.accounting = { status: r.status, blocking: r.blocking, mappingId: r.mappingId, mappingVersion: r.mappingVersion, accountCode: r.accountCode, resolvedAt: now.toISOString(), reasons: r.reasons };
  return r;
}

/* ───────────── Snapshot زمان تصمیم ───────────── */
function stable(v: any): string { return Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v ?? null); }
export function fnv1a(s: string): string { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
export interface ApprovalSnapshot {
  id: string; requestKind: ApprovalRefKind; requestId: string; decision: string; decidedBy: string; decidedAt: string; note?: string;
  requestedAmountRials: number | null; decidedAmountRials?: number | null; calcVersion: string; generatedAt: string; contentHash: string;
  facts: Array<{ key: string; label: string; value: number | string | null; unit: FactUnit; quality: FactQuality; source: string; asOf: string | null; docIds: string[] }>; qualitySummary: Record<FactQuality, number>;
}
export function buildApprovalSnapshot(ctx: ApprovalContext, d: { decision: string; actorId: string; note?: string; decidedAmountRials?: number | null }, now: Date): ApprovalSnapshot {
  const facts = ctx.sections.flatMap(s => s.facts).map(f => ({ key: f.key, label: f.label, value: f.value, unit: f.unit, quality: f.quality, source: f.source, asOf: f.asOf, docIds: f.docRefs.map(x => `${x.type}:${x.id}`) }));
  return { id: `snap:${ctx.kind}:${ctx.requestId}:${now.getTime()}`, requestKind: ctx.kind, requestId: ctx.requestId, decision: d.decision, decidedBy: d.actorId, decidedAt: now.toISOString(), note: d.note?.trim() || undefined,
    requestedAmountRials: ctx.amountRials, decidedAmountRials: d.decidedAmountRials ?? null, calcVersion: ctx.calcVersion, generatedAt: ctx.generatedAt, contentHash: fnv1a(stable(facts)), facts, qualitySummary: ctx.qualitySummary };
}
export function recordApprovalSnapshot(draft: Partial<AppState>, snap: ApprovalSnapshot): boolean {
  const list: ApprovalSnapshot[] = ((draft as any).approvalSnapshots ||= []);
  if (list.some(s => s.id === snap.id)) return false; list.unshift(snap); return true; // append-only: هیچ ویرایش/حذفی وجود ندارد
}

/* ───────────── تصمیم مساعده با زمینه و مبلغ پیشنهادی مدیر ───────────── */
export function decideAdvanceWithContext(draft: AppState, advanceId: string, p: { decision: 'APPROVED' | 'REJECTED'; approvedAmountRials?: number | null; note?: string; actorId?: string }, now: Date, opts: ContextOptions = {}): { ok: boolean; reason?: string; snapshotId?: string } {
  const a = live(draft.advanceRequests).find(x => x.id === advanceId);
  if (!a) return { ok: false, reason: 'درخواست مساعده یافت نشد.' };
  if (a.status !== 'REQUESTED') return { ok: false, reason: 'این درخواست قبلاً تصمیم‌گیری شده است.' };
  if (!p.actorId) return { ok: false, reason: 'کاربر نامعلوم.' };
  if (a.userId === p.actorId) return { ok: false, reason: 'تأیید/رد درخواست خود مجاز نیست.' };
  const note = (p.note || '').trim(); const req = num(a.requestedAmountRials) ?? 0; let approved: number | null = null;
  if (p.decision === 'REJECTED') { if (!note) return { ok: false, reason: 'یادداشت رد الزامی است.' }; }
  else {
    approved = num(p.approvedAmountRials) ?? req;
    if (!(approved > 0)) return { ok: false, reason: 'مبلغ تأیید باید بزرگ‌تر از صفر باشد.' };
    if (approved > req) return { ok: false, reason: 'مبلغ تأییدشده نمی‌تواند از مبلغ درخواستی بیشتر باشد.' };
    if (approved < req && !note) return { ok: false, reason: 'برای تأیید با مبلغ کمتر از درخواست، یادداشت الزامی است.' };
  }
  const ctx = buildApprovalContext(draft, { kind: 'ADVANCE_REQUEST', id: advanceId }, { ...opts, now });
  a.status = p.decision; a.decidedBy = p.actorId; a.decidedAt = now.toISOString(); a.managerNotes = note || a.managerNotes;
  if (approved !== null) a.approvedAmountRials = approved;
  let snapshotId: string | undefined;
  if (ctx) { const s = buildApprovalSnapshot(ctx, { decision: p.decision, actorId: p.actorId, note, decidedAmountRials: approved }, now); recordApprovalSnapshot(draft, s); snapshotId = s.id; }
  return { ok: true, snapshotId };
}
/** ثبت Snapshot برای تصمیم‌های سایر درخواست‌ها (مرخصی/هزینه/اعتبار/پرداخت) بدون تغییر منطق تصمیم موجود. */
export function snapshotRequestDecision(draft: AppState, ref: ApprovalRef, decision: string, actorId: string, note: string | undefined, now: Date, opts: ContextOptions = {}): string | null {
  const ctx = buildApprovalContext(draft, ref, { ...opts, now }); if (!ctx) return null;
  const s = buildApprovalSnapshot(ctx, { decision, actorId, note }, now); recordApprovalSnapshot(draft, s); return s.id;
}

/* ───────────── اتصال حسابداری بیرونی: صف، پاسخ، تطبیق ───────────── */
export type ExportStatus = 'QUEUED' | 'ACKNOWLEDGED' | 'REJECTED';
export type ReconcileStatus = 'PENDING' | 'RECONCILED' | 'MISMATCH';
export interface AccountingExportLog {
  id: string; outboxId: string; sourceType: string; sourceId: string; mappingId?: string; mappingVersion?: number; accountCode?: string; amountRials: number;
  status: ExportStatus; erpStatus: 'NOT_CONFIGURED' | 'CONNECTED'; erpDocumentId: string | null; errors: string[]; reconciliation: ReconcileStatus; erpAmountRials?: number | null;
  queuedAt: string; respondedAt?: string | null; queuedBy?: string; idempotencyKey: string;
}
export function enqueueAccountingExport(draft: AppState, p: { sourceType: string; sourceId: string; amountRials: number; resolution: MappingResolution; classification: ClassificationInput; actorId?: string; erpConnected?: boolean }, now: Date): { ok: boolean; reason?: string; log?: AccountingExportLog } {
  if (p.resolution.status !== 'MAPPED' || p.resolution.blocking) return { ok: false, reason: 'بدون نگاشت معتبر، ارسال به حسابداری مسدود است.' };
  if (!(p.amountRials > 0)) return { ok: false, reason: 'مبلغ نامعتبر است.' };
  const key = `${p.sourceType}-${p.sourceId}-v${p.resolution.mappingVersion}`;
  const logs: AccountingExportLog[] = ((draft as any).accountingExportLogs ||= []);
  const dup = logs.find(l => l.idempotencyKey === key); if (dup) return { ok: true, log: dup };
  const { nextOutbox, message } = OutboxManager.enqueue((draft as any).outbox || [], 'CLASSIFIED_POSTING_REQUEST', p.sourceType, p.sourceId, { amountRials: p.amountRials, classification: p.classification, mapping: { id: p.resolution.mappingId, version: p.resolution.mappingVersion, debitAccountCode: p.resolution.accountCode, creditAccountCode: p.resolution.creditAccountCode, detail: p.resolution.detail } }, { idempotencyKey: key });
  (draft as any).outbox = nextOutbox;
  const log: AccountingExportLog = { id: `axl:${key}`, outboxId: message.id, sourceType: p.sourceType, sourceId: p.sourceId, mappingId: p.resolution.mappingId, mappingVersion: p.resolution.mappingVersion, accountCode: p.resolution.accountCode, amountRials: p.amountRials,
    status: 'QUEUED', erpStatus: p.erpConnected ? 'CONNECTED' : 'NOT_CONFIGURED', erpDocumentId: null, errors: [], reconciliation: 'PENDING', queuedAt: now.toISOString(), queuedBy: p.actorId, idempotencyKey: key };
  logs.unshift(log); return { ok: true, log };
}
/** ارسال موفق ≠ ثبت قطعی؛ فقط پاسخ ERP دارای شناسه سند مقصد، وضعیت را ACKNOWLEDGED می‌کند. */
export function applyAccountingAcknowledgement(draft: AppState, logId: string, ack: { outcome: 'ACCEPTED' | 'REJECTED'; erpDocumentId?: string; errors?: string[]; erpAmountRials?: number | null }, now: Date): { ok: boolean; reason?: string } {
  const log = ((draft as any).accountingExportLogs as AccountingExportLog[] | undefined)?.find(l => l.id === logId);
  if (!log) return { ok: false, reason: 'سابقه ارسال یافت نشد.' };
  if (log.status !== 'QUEUED') return { ok: false, reason: 'برای این ارسال قبلاً پاسخ ثبت شده است.' };
  log.respondedAt = now.toISOString();
  if (ack.outcome === 'REJECTED') { log.status = 'REJECTED'; log.errors = ack.errors?.length ? ack.errors : ['رد شده توسط سیستم حسابداری']; (draft as any).outbox = OutboxManager.markFailed((draft as any).outbox || [], log.outboxId, log.errors.join('؛')); return { ok: true }; }
  if (!String(ack.erpDocumentId || '').trim()) return { ok: false, reason: 'پذیرش بدون شناسه سند مقصد معتبر نیست.' };
  log.status = 'ACKNOWLEDGED'; log.erpDocumentId = String(ack.erpDocumentId).trim(); log.erpAmountRials = ack.erpAmountRials ?? null;
  log.reconciliation = ack.erpAmountRials === undefined || ack.erpAmountRials === null ? 'PENDING' : ack.erpAmountRials === log.amountRials ? 'RECONCILED' : 'MISMATCH';
  if (log.reconciliation === 'MISMATCH') log.errors = [`مبلغ ثبت‌شده در سامانه مالی (${ack.erpAmountRials}) با مبلغ ارسالی (${log.amountRials}) برابر نیست.`];
  (draft as any).outbox = OutboxManager.markSent((draft as any).outbox || [], log.outboxId);
  return { ok: true };
}

/** ساخت AppState از اسنپ‌شات سرور (برای HttpBackendDataProvider)؛ کلکسیون‌های مخفی‌شده توسط سرور جدا برمی‌گردند. */
export function stateFromSnapshot(snapshot: { collections: Record<string, any[]>; singletons: Record<string, any>; hiddenCollections?: string[] }, local: Partial<AppState> = {}): { state: AppState; hidden: string[] } {
  return { state: { users: [], accounts: [], quotes: [], externalProducts: [], ...snapshot.singletons, ...snapshot.collections, currentUserId: local.currentUserId } as AppState, hidden: snapshot.hiddenCollections || [] };
}
