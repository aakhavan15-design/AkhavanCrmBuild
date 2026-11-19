/**
 * AKHAVAN CRM — Negotiation ↔ ERP lifecycle (spec §6.2/§6.3, report 9).
 * Extends the existing Quote/negotiation model (no parallel engine): pure transition rules + report-9 metrics.
 * Principle: a change is "applied" ONLY after a real ERP response. SENT_TO_ERP is never success.
 *   DRAFT → PENDING_APPROVAL → APPROVED → SENT_TO_ERP → ACCEPTED | REJECTED | ERROR
 * ERROR may be retried (→ SENT_TO_ERP). After an ERP invoice exists the negotiation is CLOSED.
 */
export type NegotiationErpStatus =
  | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT_TO_ERP' | 'ACCEPTED' | 'REJECTED' | 'ERROR' | 'CLOSED';

const TRANSITIONS: Record<NegotiationErpStatus, NegotiationErpStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CLOSED'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'CLOSED'],
  APPROVED: ['SENT_TO_ERP', 'DRAFT', 'CLOSED'],
  SENT_TO_ERP: ['ACCEPTED', 'REJECTED', 'ERROR'],
  ERROR: ['SENT_TO_ERP', 'DRAFT', 'CLOSED'],
  REJECTED: ['DRAFT', 'CLOSED'],
  ACCEPTED: ['CLOSED'],
  CLOSED: [],
};

export interface NegotiationErpRecord {
  id: string; orderRef: string; status: NegotiationErpStatus;
  baseAmount: number | null;        // مبلغ اولیه سفارش ERP
  proposedAmount: number | null;    // پیشنهاد CRM
  approvedAmount?: number | null;   // تأییدشده داخلی (هنوز ERP نیست)
  erpAppliedAmount?: number | null; // فقط پس از ACCEPTED
  invoiceAmount?: number | null;    // مبلغ فاکتور نهایی ERP
  invoiceRef?: string; erpRequestKey?: string; erpResponse?: { code: string; message?: string; at: string };
  failureReason?: string; sentAt?: string; history: { from: NegotiationErpStatus | null; to: NegotiationErpStatus; at: string; by?: string; note?: string }[];
}

export type TransitionResult = { ok: true; record: NegotiationErpRecord } | { ok: false; error: string };

export const canTransition = (from: NegotiationErpStatus, to: NegotiationErpStatus) => TRANSITIONS[from]?.includes(to) ?? false;

export function createNegotiation(input: { id: string; orderRef: string; baseAmount: number | null; proposedAmount: number | null; now: string; by?: string }): NegotiationErpRecord {
  if (!input.orderRef) throw new Error('هر مذاکره باید به سفارش مرجع سامانه مالی متصل باشد');
  return { id: input.id, orderRef: input.orderRef, status: 'DRAFT', baseAmount: input.baseAmount, proposedAmount: input.proposedAmount, history: [{ from: null, to: 'DRAFT', at: input.now, by: input.by }] };
}

function move(r: NegotiationErpRecord, to: NegotiationErpStatus, now: string, by?: string, note?: string): TransitionResult {
  if (!canTransition(r.status, to)) return { ok: false, error: `انتقال ${r.status} ← ${to} مجاز نیست` };
  return { ok: true, record: { ...r, status: to, history: [...r.history, { from: r.status, to, at: now, by, note }] } };
}

export const submitForApproval = (r: NegotiationErpRecord, now: string, by?: string) =>
  r.proposedAmount == null ? { ok: false, error: 'مبلغ پیشنهادی مشخص نیست' } as TransitionResult : move(r, 'PENDING_APPROVAL', now, by);

export function approve(r: NegotiationErpRecord, now: string, by: string, approvedAmount?: number): TransitionResult {
  const res = move(r, 'APPROVED', now, by); if (!res.ok) return res;
  return { ok: true, record: { ...res.record, approvedAmount: approvedAmount ?? r.proposedAmount } };
}

/** Outbox hand-off. Idempotent: same record+amount always yields the same key; this does NOT mark success. */
export function sendToErp(r: NegotiationErpRecord, now: string, by?: string): TransitionResult {
  const res = move(r, 'SENT_TO_ERP', now, by); if (!res.ok) return res;
  const key = `NEG:${r.orderRef}:${r.id}:${r.approvedAmount ?? r.proposedAmount}`;
  return { ok: true, record: { ...res.record, erpRequestKey: r.erpRequestKey ?? key, sentAt: now, erpAppliedAmount: null } };
}

/** Real ERP answer only. A response for a record that is not SENT_TO_ERP is refused (no fabricated success). */
export function recordErpResponse(r: NegotiationErpRecord, resp: { outcome: 'ACCEPTED' | 'REJECTED' | 'ERROR'; code: string; message?: string; at: string; appliedAmount?: number }): TransitionResult {
  if (r.status !== 'SENT_TO_ERP') return { ok: false, error: 'پاسخ سامانه مالی فقط برای رکورد ارسال‌شده پذیرفته می‌شود' };
  if (resp.outcome === 'ACCEPTED' && !Number.isFinite(resp.appliedAmount)) return { ok: false, error: 'پاسخ موفق سامانه مالی باید مبلغ اعمال‌شده را داشته باشد' };
  const res = move(r, resp.outcome, resp.at, 'ERP', resp.message); if (!res.ok) return res;
  return { ok: true, record: { ...res.record, erpResponse: { code: resp.code, message: resp.message, at: resp.at },
    erpAppliedAmount: resp.outcome === 'ACCEPTED' ? resp.appliedAmount! : null, failureReason: resp.outcome === 'ACCEPTED' ? undefined : (resp.message || resp.code) } };
}

/** ERP invoice exists → negotiation closes; the invoice itself is never created by CRM. */
export const closeOnInvoice = (r: NegotiationErpRecord, now: string, invoice: { ref: string; amount: number }): TransitionResult => {
  if (r.status === 'CLOSED') return { ok: false, error: 'مذاکره بسته شده است' };
  if (r.status !== 'ACCEPTED' && r.status !== 'DRAFT' && r.status !== 'REJECTED' && r.status !== 'ERROR' && r.status !== 'APPROVED' && r.status !== 'PENDING_APPROVAL') return { ok: false, error: `بستن از ${r.status} مجاز نیست` };
  const res = move(r, 'CLOSED', now, 'ERP', `invoice ${invoice.ref}`); if (!res.ok) return res;
  return { ok: true, record: { ...res.record, invoiceRef: invoice.ref, invoiceAmount: invoice.amount } };
};

/** Report 9 metrics. Unknown inputs stay null — never 0 (spec §10). */
export function negotiationEffectiveness(records: NegotiationErpRecord[]) {
  const sum = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  const everProposed = records.filter(r => r.status !== 'DRAFT');
  const sent = records.filter(r => r.history.some(h => h.to === 'SENT_TO_ERP'));
  const accepted = records.filter(r => r.history.some(h => h.to === 'ACCEPTED'));
  const rejected = records.filter(r => r.history.some(h => h.to === 'REJECTED'));
  const answered = accepted.length + rejected.length;
  const rate = (n: number, d: number) => (d > 0 ? n / d : null);
  const withBoth = accepted.filter(r => r.baseAmount != null && r.erpAppliedAmount != null);
  return {
    funnel: { negotiable: records.length, proposed: everProposed.length, approved: records.filter(r => r.history.some(h => h.to === 'APPROVED')).length, sentToErp: sent.length, appliedInErp: accepted.length, invoiced: records.filter(r => r.invoiceRef).length },
    open: records.filter(r => !['CLOSED', 'REJECTED'].includes(r.status) && !r.history.some(h => h.to === 'ACCEPTED' && r.status === 'CLOSED')).length,
    baseAmount: sum(records.map(r => r.baseAmount)), proposedAmount: sum(records.map(r => r.proposedAmount)),
    approvedAmount: sum(records.map(r => r.approvedAmount)), erpAppliedAmount: sum(accepted.map(r => r.erpAppliedAmount)), invoiceAmount: sum(records.map(r => r.invoiceAmount)),
    uplift: withBoth.length ? withBoth.reduce((a, r) => a + (r.erpAppliedAmount! - r.baseAmount!), 0) : null,
    successRate: rate(accepted.length, answered), rejectionRate: rate(rejected.length, answered), // فقط روی پاسخ‌های واقعی ERP
    pendingErpResponse: records.filter(r => r.status === 'SENT_TO_ERP').length,
    failureReasons: Object.entries(records.filter(r => r.failureReason).reduce<Record<string, number>>((m, r) => { m[r.failureReason!] = (m[r.failureReason!] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]),
  };
}
