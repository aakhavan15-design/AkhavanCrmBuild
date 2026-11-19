import type { AppState } from '../types';

/**
 * دستور پرداخت و مجوز واریز (درخواست به حسابدار). CRM فقط «درخواست و تصمیم» را ثبت می‌کند؛
 * صدور چک پرداختی، سند و اجرای پرداخت در ERP انجام می‌شود (erpStatus تا اتصال واقعی NOT_CONFIGURED).
 */
export type FinanceRequestKind = 'PAYMENT_ORDER' | 'DEPOSIT_AUTHORIZATION';
export type FinanceRequestStatus = 'SUBMITTED' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED' | 'ERP_PENDING' | 'CANCELLED';
export const FINANCE_KIND_LABEL: Record<FinanceRequestKind, string> = { PAYMENT_ORDER: 'دستور پرداخت', DEPOSIT_AUTHORIZATION: 'مجوز واریز' };
export const FINANCE_STATUS_LABEL: Record<FinanceRequestStatus, string> = { SUBMITTED: 'در انتظار حسابدار', NEEDS_INFO: 'نیازمند اطلاعات', APPROVED: 'تایید شد', REJECTED: 'رد شد', ERP_PENDING: 'تایید شد؛ در انتظار اجرا در سامانه مالی', CANCELLED: 'لغو شد' };

export type FinanceErpStatus = 'NOT_CONFIGURED';
export interface FinanceRequestRecord {
  id: string; kind: FinanceRequestKind; payeeName: string; amount: number; reason: string; dueDate?: string; accountId?: string;
  status: FinanceRequestStatus; requestedBy?: string; requestedAt: string; erpStatus: FinanceErpStatus; idempotencyKey: string;
  decidedBy?: string; decidedAt?: string; decisionNote?: string; resubmittedAt?: string; deletedAt?: string | null;
  /** طبقه‌بندی ساده ماهیت پرداخت (Smart Accounting Classification) — اختیاری برای سازگاری با رکوردهای قدیمی */
  nature?: string; classificationFields?: Record<string, string | undefined>;
  accounting?: { status: string; blocking: boolean; mappingId?: string; mappingVersion?: number; accountCode?: string; resolvedAt: string; reasons?: string[] };
}
export interface FinanceRequestStore { financeRequests?: FinanceRequestRecord[] }
export interface FinanceRequestInput { kind: FinanceRequestKind; payeeName?: string; amount: number; reason?: string; dueDate?: string; accountId?: string; requestedBy?: string; nature?: string; classificationFields?: Record<string, string | undefined> }
const norm = (s?: string) => (s || '').trim().toLowerCase();
const ACTIVE: FinanceRequestStatus[] = ['SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'ERP_PENDING'];
export const requestKey = (i: FinanceRequestInput) => `${i.kind}|${norm(i.payeeName)}|${Math.round(Number(i.amount) || 0)}|${i.dueDate || ''}`;
const list = (s: FinanceRequestStore): FinanceRequestRecord[] => (s.financeRequests || []);

export function checkFinanceRequest(state: Pick<AppState, 'accounts'> & FinanceRequestStore, i: FinanceRequestInput): { ok: boolean; errors: string[] } {
  const errors: string[] = []; const amount = Number(i.amount);
  if (!['PAYMENT_ORDER', 'DEPOSIT_AUTHORIZATION'].includes(i.kind)) errors.push('نوع درخواست نامعتبر است.');
  if (!norm(i.payeeName)) errors.push('نام ذی‌نفع/دریافت‌کننده الزامی است.');
  if (!Number.isFinite(amount) || amount <= 0) errors.push('مبلغ باید بزرگ‌تر از صفر باشد.');
  if (!norm(i.reason)) errors.push('شرح/علت درخواست الزامی است.');
  if (i.accountId && !(state.accounts || []).some(a => a.id === i.accountId)) errors.push('مشتری مرتبط معتبر نیست.');
  const key = requestKey(i);
  if (list(state).some(r => !r.deletedAt && ACTIVE.includes(r.status) && r.idempotencyKey === key)) errors.push('درخواست مشابه فعالی با همین ذی‌نفع، مبلغ و مهلت وجود دارد.');
  return { ok: errors.length === 0, errors };
}

export function buildFinanceRequest(i: FinanceRequestInput, id: string, now: Date): FinanceRequestRecord {
  return { id, kind: i.kind, payeeName: i.payeeName!.trim(), amount: Math.round(Number(i.amount)), reason: i.reason!.trim(), dueDate: i.dueDate, accountId: i.accountId,
    status: 'SUBMITTED' as FinanceRequestStatus, requestedBy: i.requestedBy, ...(i.nature ? { nature: i.nature, classificationFields: i.classificationFields || {} } : {}), requestedAt: now.toISOString(), erpStatus: 'NOT_CONFIGURED' as FinanceErpStatus, idempotencyKey: requestKey(i) };
}

/** تصمیم حسابدار. رد/نیازمند اطلاعات = یادداشت الزامی؛ درخواست‌کننده نمی‌تواند درخواست خودش را تایید کند (تفکیک وظایف). */
export function decideFinanceRequest(draft: FinanceRequestStore, id: string, decision: 'APPROVE' | 'REJECT' | 'NEEDS_INFO', note: string, actorId: string | undefined, now: Date): { ok: boolean; reason?: string } {
  const r = list(draft).find(x => x.id === id);
  if (!r || r.deletedAt) return { ok: false, reason: 'درخواست یافت نشد.' };
  if (!['SUBMITTED', 'NEEDS_INFO'].includes(r.status)) return { ok: false, reason: 'این درخواست قبلاً تصمیم‌گیری شده است.' };
  if (!actorId) return { ok: false, reason: 'کاربر نامعلوم.' };
  if (r.requestedBy === actorId) return { ok: false, reason: 'تایید/رد درخواست خود مجاز نیست.' };
  if (decision !== 'APPROVE' && !norm(note)) return { ok: false, reason: 'یادداشت تصمیم الزامی است.' };
  // نگاشت حسابداری نامعتبر/ناموجود مانع تأیید نهایی است (رکوردهای قدیمی بدون accounting تغییری نمی‌کنند)
  if (decision === 'APPROVE' && r.accounting?.blocking) return { ok: false, reason: `تأیید نهایی مسدود است: ${(r.accounting.reasons || []).join(' ') || 'نگاشت حسابداری معتبر وجود ندارد.'}` };
  r.status = decision === 'APPROVE' ? 'ERP_PENDING' : decision === 'REJECT' ? 'REJECTED' : 'NEEDS_INFO';
  r.decidedBy = actorId; r.decidedAt = now.toISOString(); r.decisionNote = note.trim() || undefined; r.erpStatus = 'NOT_CONFIGURED';
  return { ok: true };
}

/** اصلاح و ارسال مجدد توسط خود درخواست‌کننده پس از «نیازمند اطلاعات» */
export function resubmitFinanceRequest(draft: FinanceRequestStore, id: string, patch: Partial<FinanceRequestInput>, actorId: string | undefined, now: Date): { ok: boolean; reason?: string } {
  const r = list(draft).find(x => x.id === id);
  if (!r || r.status !== 'NEEDS_INFO') return { ok: false, reason: 'فقط درخواست «نیازمند اطلاعات» قابل ارسال مجدد است.' };
  if (r.requestedBy !== actorId) return { ok: false, reason: 'فقط ثبت‌کننده می‌تواند اصلاح کند.' };
  Object.assign(r, { payeeName: patch.payeeName ?? r.payeeName, amount: patch.amount ? Math.round(Number(patch.amount)) : r.amount, reason: patch.reason ?? r.reason, dueDate: patch.dueDate ?? r.dueDate });
  r.idempotencyKey = requestKey({ kind: r.kind, payeeName: r.payeeName, amount: r.amount, dueDate: r.dueDate }); r.status = 'SUBMITTED'; r.resubmittedAt = now.toISOString(); return { ok: true };
}
