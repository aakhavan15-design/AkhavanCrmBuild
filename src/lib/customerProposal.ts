/**
 * قرارداد پیشنهاد مشتری به ERP (F0-07).
 * CRM مشتری رسمی نمی‌سازد؛ رکورد محلی «پیش‌نویس» است و فقط پیشنهاد ثبت به ERP می‌رود
 * (server/index.mjs ← POST /api/v1/accounts ← Outbox `crm.customer.create-proposed`).
 * کد رسمی/تفصیلی فقط پس از تأیید ERP می‌آید؛ CRM کد اختراع نمی‌کند.
 */
export type CustomerProposalStatus = 'LOCAL_DRAFT' | 'PENDING_ERP_REVIEW' | 'ERP_CONFIRMED';

export const CUSTOMER_PROPOSAL_STATUS_LABEL: Record<CustomerProposalStatus, string> = {
  LOCAL_DRAFT: 'پیش‌نویس محلی — هنوز به ERP ارسال نشده',
  PENDING_ERP_REVIEW: 'در انتظار بررسی ERP',
  ERP_CONFIRMED: 'تأییدشده در ERP',
};

interface ProposalSource {
  id: string; name?: string; phone?: string; email?: string; ownerId?: string; code?: string;
  origin?: string; isLocalDraft?: boolean; erpProposalStatus?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** وضعیت از روی خود رکورد؛ بدون کد رسمی ERP هرگز «تأییدشده» نیست. */
export function proposalStatusOf(account: ProposalSource): CustomerProposalStatus | null {
  if (account.origin === 'CRM_LOCAL' || account.isLocalDraft) {
    if (account.erpProposalStatus === 'PENDING_ERP_REVIEW') return 'PENDING_ERP_REVIEW';
    return 'LOCAL_DRAFT';
  }
  if (account.code && account.origin !== 'CRM_LOCAL') return 'ERP_CONFIRMED';
  return null;
}

/** کلید تکرارناپذیر قطعی (همان رکورد = همان کلید) مطابق الگوی سرور: ^[A-Za-z0-9._:-]{8,128}$ */
export function customerProposalIdempotencyKey(accountId: string): string {
  const safe = String(accountId).replace(/[^A-Za-z0-9._:-]/g, '-');
  return `customer-proposal:${safe}`.padEnd(8, '-').slice(0, 128);
}

/** بدنهٔ دقیق قرارداد سرور؛ accountCode همیشه null (کد را ERP می‌دهد)، ownerUserId فقط اگر UUID معتبر باشد. */
export function buildCustomerProposalRequest(account: ProposalSource): { body: { name: string; accountCode: null; phone: string | null; email: string | null; ownerUserId: string | null }; idempotencyKey: string } | null {
  const name = String(account.name || '').trim();
  if (!name || name.length > 250) return null;
  const phone = account.phone ? String(account.phone).trim().slice(0, 40) : null;
  const email = account.email ? String(account.email).trim() : null;
  return {
    body: { name, accountCode: null, phone: phone || null, email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null, ownerUserId: account.ownerId && UUID.test(account.ownerId) ? account.ownerId : null },
    idempotencyKey: customerProposalIdempotencyKey(account.id),
  };
}
