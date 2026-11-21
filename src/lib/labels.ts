/** Centralized Persian labels for stable CRM enum values shown to end users. */
const STATUS_LABELS: Record<string, string> = {
  NEW: 'جدید', OPEN: 'باز', IN_PROGRESS: 'در حال انجام', PENDING: 'در انتظار',
  COMPLETED: 'تکمیل‌شده', APPROVED: 'تأییدشده', REJECTED: 'ردشده', CANCELLED: 'لغوشده',
  IN_REVIEW: 'در حال بررسی', SUBMITTED: 'ارسال‌شده', WAITING_FOR_INFORMATION: 'در انتظار اطلاعات',
  CONNECTED: 'متصل', DISCONNECTED: 'قطع اتصال', NOT_CONFIGURED: 'پیکربندی‌نشده', CONFIGURING: 'در حال پیکربندی', ERROR: 'خطا',
  DRAFT: 'پیش‌نویس', ACTIVE: 'فعال', INACTIVE: 'غیرفعال', WON: 'مذاکره موفق (عقد قرارداد)', LOST: 'مذاکره ناموفق (مختومه)',
  QUALIFIED: 'واجد شرایط', CONTACTED: 'تماس گرفته‌شده', CONVERTED: 'تبدیل‌شده',
  LOW: 'پایین', NORMAL: 'عادی', HIGH: 'بالا', URGENT: 'فوری',
  EXECUTED: 'اجراشده', QUEUED: 'در صف اجرا', AWAITING_APPROVAL: 'در انتظار تأیید',
  SENT: 'ارسال‌شده', FAILED: 'ناموفق', PAID: 'پرداخت‌شده', PARTIAL: 'پرداخت جزئی', OVERDUE: 'سررسیدگذشته',
  UNREAD: 'خوانده‌نشده', READ: 'خوانده‌شده', ON_TRACK: 'طبق برنامه', AT_RISK: 'در معرض تأخیر', BREACHED: 'از مهلت گذشته',
  FOLLOW_UP: 'پیگیری', COLLECTION: 'وصول مطالبات', ORDER_OFFER: 'پیشنهاد فروش', ONSITE_VISIT: 'ویزیت میدانی', FINANCIAL_RECON: 'تطبیق مالی',
  CASH: 'نقدی', BANK_TRANSFER: 'انتقال بانکی', CHEQUE: 'چک', CARD: 'کارت‌خوان', NEW_CASE: 'پرونده جدید',
  PENDING_APPROVAL: 'در انتظار تأیید', ACCEPTED: 'پذیرفته‌شده', HANDOFF_EXTERNAL: 'تحویل به سامانه بیرونی',
  PROSPECTING: 'شناسایی فرصت', NEGOTIATION: 'مذاکره', PROPOSAL: 'ارائه پیشنهاد', CLOSED_WON: 'موفق و نهایی‌شده', CLOSED_LOST: 'ناموفق و بسته‌شده',
  BOUNCED: 'برگشت‌خورده (نکول)', CLEARED: 'وصول‌شده (تسویه)', LOCAL_ONLY: 'فقط ثبت محلی (ارسال نشده)', ERP_PENDING: 'در انتظار اجرا در سامانه مالی', NEEDS_INFORMATION: 'نیازمند اطلاعات', NEEDS_CORRECTION: 'نیازمند اصلاح', UNDER_REVIEW: 'در حال بررسی', SUBMITTED_FOR_REVIEW: 'ارسال برای بررسی', INCOMPLETE: 'ناقص', DEAD_LETTER: 'عملیات ناموفق (بایگانی خطا)',
  ON_HOLD: 'متوقف موقت', ARCHIVED: 'بایگانی‌شده', SENT_FOR_APPROVAL: 'ارسال برای تأیید', NEEDS_REVIEW: 'نیازمند بررسی',
  CLOSED: 'بسته‌شده', RESOLVED: 'برطرف‌شده', UNASSIGNED: 'تخصیص‌نیافته', ASSIGNED: 'تخصیص‌یافته', WAITING: 'در انتظار', EXPIRED: 'منقضی‌شده', BLOCKED: 'مسدودشده'
};

/** Labels for approval roles, data sources, document types and ledger/SLA codes (kept separate so STATUS_LABELS stays unchanged). */
const SUPPLEMENTAL_LABELS: Record<string, string> = {
  CREATOR: 'ایجادکننده', MANAGER: 'مدیر', FINANCE: 'مالی', ERP: 'سامانه مالی', SYSTEM: 'سامانه', CRM: 'سامانه',
  LOCAL: 'محلی', HYBRID: 'ترکیبی', DERIVED: 'تحلیلی', LIVE: 'زنده', STALE: 'منقضی', UNAVAILABLE: 'در دسترس نیست',
  UNSCHEDULED: 'بدون مهلت', INVOICE: 'فاکتور فروش', QUOTE: 'پیش‌فاکتور', PAYMENT: 'رسید دریافت وجه', CREDIT_NOTE: 'اعلامیه بستانکاری', ORDER: 'سفارش فروش',
  RECEIVED: 'دریافتی', DELIVERED: 'تحویل‌شده', ISSUED: 'صادره', POSTED: 'ثبت‌شده', CONFIRMED: 'تأییدشده', FINAL: 'نهایی', MISMATCH: 'مغایرت', DEMO: 'آزمایشی', LOCAL_TEST: 'آزمایشی محلی',
};

export function getPersianStatusLabel(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  const text = String(value).trim();
  if (!text) return '—';
  const key = text.toUpperCase();
  return STATUS_LABELS[key] || SUPPLEMENTAL_LABELS[key] || (/[آ-ی]/u.test(text) ? text : 'وضعیت نامشخص');
}

/** عنوان فارسی رویدادهای کسب‌وکار (برای هر نمایش احتمالی در خط زمانی/گزارش). کد فنی رویداد بدون تغییر می‌ماند. */
const BUSINESS_EVENT_LABELS: Record<string, string> = {
  CAMPAIGN_CREATED: 'ایجاد کمپین', OPPORTUNITY_CREATED: 'ایجاد فرصت فروش', OPPORTUNITY_STAGE_CHANGED: 'تغییر مرحلهٔ فرصت فروش',
  QUOTE_APPROVED: 'تأیید پیش‌فاکتور', TASK_CREATED: 'ایجاد وظیفه',
};
const BUSINESS_ENTITY_LABELS: Record<string, string> = {
  CAMPAIGN: 'کمپین', OPPORTUNITY: 'فرصت فروش', QUOTE: 'پیش‌فاکتور', TASK: 'وظیفه', CUSTOMER: 'مشتری', PAYMENT: 'رسید دریافت وجه',
};
export function getPersianBusinessEventTitle(entityType: string, eventType: string): string {
  const e = BUSINESS_ENTITY_LABELS[String(entityType).toUpperCase()] || 'رویداد';
  const t = BUSINESS_EVENT_LABELS[String(eventType).toUpperCase()] || 'ثبت رویداد';
  return `${e}: ${t}`;
}
