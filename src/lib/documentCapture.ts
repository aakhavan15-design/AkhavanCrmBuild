import { toLatinDigits, toPersianDigits } from './digits.ts';
import type { AppState, Customer, UserAccount, Invoice, Payment, Cheque } from '../types';

export type CapturedDocumentType =
  | 'BANK_RECEIPT'      // فیش واریزی و رسید بانکی
  | 'CHEQUE'            // چک و اطلاعات صیادی
  | 'PAYMENT_RECEIPT'   // رسید پرداخت و دریافت
  | 'INVOICE'           // فاکتور خرید و فروش
  | 'EXPENSE'           // اسناد هزینه و تنخواه
  | 'PERSONNEL_ID'      // اسناد مالی و پرسنلی / هویتی
  | 'OTHER';

export const DOCUMENT_TYPE_LABELS: Record<CapturedDocumentType, string> = {
  BANK_RECEIPT: 'فیش واریزی و رسید بانکی',
  CHEQUE: 'چک و اطلاعات صیادی',
  PAYMENT_RECEIPT: 'رسید پرداخت و دریافت',
  INVOICE: 'فاکتور خرید و فروش',
  EXPENSE: 'اسناد هزینه و تنخواه',
  PERSONNEL_ID: 'اسناد مالی و پرسنلی',
  OTHER: 'سایر مدارک',
};

export type FieldStatus = 'EXTRACTED' | 'NEEDS_REVIEW' | 'MISSING';

export interface ExtractedField<T = string | number | null> {
  key: string;
  label: string;
  value: T;
  rawText?: string;
  confidence: number; // 0 to 1
  status: FieldStatus;
  evidence?: string; // متن یا برش استخراج‌شده از تصویر
  normalizedValue?: T;
  reviewReason?: string;
}

export interface MatchedEntity {
  entityType: 'CUSTOMER' | 'USER' | 'INVOICE' | 'EXPENSE_CATEGORY';
  id: string;
  name: string;
  secondaryInfo?: string;
  score: number; // 0 to 1
  matchReason: string;
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  duplicateType?: 'DEFINITE' | 'PROBABLE';
  existingRecordId?: string;
  existingRecordType?: 'PAYMENT' | 'CHEQUE' | 'INVOICE';
  reason?: string;
}

export interface DocumentCaptureResult {
  id: string;
  documentType: CapturedDocumentType;
  fileName: string;
  fileSize: number;
  mimeType: string;
  imageBase64: string;
  ocrEngine: 'GEMINI_VISION' | 'HEURISTIC_PARSER' | 'MANUAL';
  overallConfidence: number;
  extractedAt: string;
  fields: Record<string, ExtractedField<any>>;
  matchedEntity?: MatchedEntity;
  duplicateCheck: DuplicateDetectionResult;
  partialExtractionStats: {
    totalFieldsCount: number;
    extractedCount: number;
    needsReviewCount: number;
    missingCount: number;
  };
  disclaimer: string;
}

/**
 * قانون سلب مسئولیت حقوقی و مالی:
 * عدم ادعای اصالت چک، وصول وجه یا تأیید پرداخت صرفاً بر اساس تصویر
 */
export const DOCUMENT_CAPTURE_LEGAL_DISCLAIMER =
  'استخراج هوشمند تصویر سند صرفاً جهت تسهیل ورود اطلاعات به فرم‌های سامانه بوده و به‌هیچ‌وجه به منزله تایید اصالت چک، استعلام از سامانه صیاد بانک مرکزی، وصول وجه یا قطعیت تسویه مالی نمی‌باشد. ثبت نهایی سند مستلزم بررسی و تایید دستی کاربر مجاز است.';

/**
 * نرمال‌سازی متون فارسی (یکسان‌سازی ی و ک، حذف تنوین و کاراکترهای اضافه)
 */
export function normalizePersian(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u064B-\u065F\u0670]/g, '') // اعراب
    .replace(/[ـ\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * محاسبه فاصله لون‌اشتاین برای تطبیق نام افراد و شرکت‌ها
 */
export function calculateLevenshtein(a: string, b: string): number {
  const normA = normalizePersian(a).toLowerCase();
  const normB = normalizePersian(b).toLowerCase();
  if (normA === normB) return 0;
  if (!normA.length) return normB.length;
  if (!normB.length) return normA.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= normB.length; i++) matrix[i] = [i];
  for (let j = 0; j <= normA.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= normB.length; i++) {
    for (let j = 1; j <= normA.length; j++) {
      if (normB.charAt(i - 1) === normA.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // جایگزینی
          matrix[i][j - 1] + 1,     // درج
          matrix[i - 1][j] + 1      // حذف
        );
      }
    }
  }
  return matrix[normB.length][normA.length];
}

/**
 * محاسبه امتیاز شباهت دو رشته بین ۰ تا ۱
 */
export function calculateSimilarity(a: string, b: string): number {
  const normA = normalizePersian(a);
  const normB = normalizePersian(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  if (normA.includes(normB) || normB.includes(normA)) {
    const ratio = Math.min(normA.length, normB.length) / Math.max(normA.length, normB.length);
    return Math.max(0.8, ratio);
  }
  const maxLen = Math.max(normA.length, normB.length);
  const dist = calculateLevenshtein(normA, normB);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * نرمال‌سازی مبلغ (تشخیص ریال/تومان و حذف جداکننده‌ها)
 */
export function parseNormalizedAmount(raw: unknown): { amount: number | null; unit: 'RIAL' | 'TOMAN' | 'UNKNOWN'; rawCleaned: string } {
  if (raw === null || raw === undefined) return { amount: null, unit: 'UNKNOWN', rawCleaned: '' };
  const rawStr = toLatinDigits(String(raw)).replace(/,/g, '').replace(/،/g, '').trim();
  const isToman = /تومان|toman/i.test(String(raw));
  const isRial = /ریال|rial/i.test(String(raw));
  const numMatch = rawStr.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return { amount: null, unit: 'UNKNOWN', rawCleaned: rawStr };
  let val = Math.round(Number(numMatch[1]));
  let unit: 'RIAL' | 'TOMAN' | 'UNKNOWN' = 'UNKNOWN';
  if (isToman) {
    unit = 'TOMAN';
    val = val * 10; // استاندارد سیستم ریال است
  } else if (isRial) {
    unit = 'RIAL';
  } else {
    // طبق قاعده ایران: اگر کمتر از ۱۰۰،۰۰۰ و بدون ۳ صفر پایانی باشد ممکن است تومان باشد، ولی در غیاب علامت ریال پیش‌فرض است
    unit = 'RIAL';
  }
  return { amount: Number.isFinite(val) && val > 0 ? val : null, unit, rawCleaned: rawStr };
}

/**
 * نرمال‌سازی تاریخ شمسی به فرمت ISO جلالی و میلادی
 */
export function parseNormalizedDate(raw: unknown): { jalali: string | null; gregorianIso: string | null } {
  if (!raw) return { jalali: null, gregorianIso: null };
  const str = toLatinDigits(String(raw)).trim();
  // الگوهای ۱۴۰۳/۰۸/۲۲ یا 1403-08-22 یا 1403.08.22
  const jalaliMatch = str.match(/(1[34]\d{2})[\/\-\.](1[0-2]|0?[1-9])[\/\-\.]([12]\d|3[01]|0?[1-9])/);
  if (jalaliMatch) {
    const y = jalaliMatch[1];
    const m = jalaliMatch[2].padStart(2, '0');
    const d = jalaliMatch[3].padStart(2, '0');
    return {
      jalali: `${y}/${m}/${d}`,
      gregorianIso: null // در صورت نیاز با jalaliToGregorianISO پر می‌شود
    };
  }
  // الگوهای میلادی 2024-11-10
  const gregMatch = str.match(/(20\d{2})[\/\-\.](1[0-2]|0?[1-9])[\/\-\.]([12]\d|3[01]|0?[1-9])/);
  if (gregMatch) {
    const y = gregMatch[1];
    const m = gregMatch[2].padStart(2, '0');
    const d = gregMatch[3].padStart(2, '0');
    return {
      jalali: null,
      gregorianIso: `${y}-${m}-${d}`
    };
  }
  return { jalali: null, gregorianIso: null };
}

/**
 * اعتبارسنجی شناسه ۱۶ رقمی چک صیادی
 */
export function validateSayadId(idStr: unknown): { isValid: boolean; cleaned: string } {
  if (!idStr) return { isValid: false, cleaned: '' };
  const cleaned = toLatinDigits(String(idStr)).replace(/\D/g, '');
  return {
    isValid: cleaned.length === 16,
    cleaned
  };
}

/**
 * تطبیق نام یا اطلاعات استخراج‌شده با موجودیت‌های CRM
 */
export function matchDocumentEntity(
  state: Pick<AppState, 'accounts' | 'users' | 'invoices'>,
  extracted: {
    personName?: string;
    companyName?: string;
    accountNumber?: string;
    iban?: string;
    nationalId?: string;
    invoiceNumber?: string;
  }
): MatchedEntity | undefined {
  const accounts: Customer[] = state.accounts || [];
  const users: UserAccount[] = state.users || [];
  const invoices: Invoice[] = state.invoices || [];

  // ۱. تطبیق فاکتور در صورت وجود شماره فاکتور
  if (extracted.invoiceNumber) {
    const normInv = toLatinDigits(extracted.invoiceNumber).replace(/\D/g, '');
    const foundInv = invoices.find(inv => {
      const cur = toLatinDigits(inv.invoiceNumber || inv.id).replace(/\D/g, '');
      return cur && (cur === normInv || cur.endsWith(normInv));
    });
    if (foundInv) {
      const acc = accounts.find(a => a.id === foundInv.accountId || a.id === foundInv.customerId);
      return {
        entityType: 'INVOICE',
        id: foundInv.id,
        name: `فاکتور شماره ${foundInv.invoiceNumber || foundInv.id}`,
        secondaryInfo: acc ? `مشتری: ${acc.name}` : `مبلغ: ${foundInv.totalAmount?.toLocaleString('fa-IR')} ریال`,
        score: 0.95,
        matchReason: 'تطابق مستقیم شماره فاکتور با سیستم فروش'
      };
    }
  }

  // ۲. تطبیق مشتری با نام واریزکننده / صاحب حساب / طرف‌حساب
  const targetName = extracted.companyName || extracted.personName;
  if (targetName && targetName.trim().length >= 3) {
    let bestAcc: Customer | null = null;
    let maxScore = 0;

    for (const acc of accounts) {
      const sim = calculateSimilarity(acc.name, targetName);
      if (sim > maxScore) {
        maxScore = sim;
        bestAcc = acc;
      }
    }

    if (bestAcc && maxScore >= 0.55) {
      return {
        entityType: 'CUSTOMER',
        id: bestAcc.id,
        name: bestAcc.name,
        secondaryInfo: bestAcc.company ? `شرکت: ${bestAcc.company}` : `کد: ${bestAcc.code || bestAcc.id}`,
        score: Math.min(1, Math.round(maxScore * 100) / 100),
        matchReason: maxScore >= 0.85 ? 'تطابق کامل نام مشتری با بانک اطلاعاتی' : 'تشابه اسمی بالا با نام مشتری'
      };
    }
  }

  // ۳. تطبیق با کاربران سازمان (جهت اسناد هزینه و مدارک پرسنلی)
  if (extracted.personName && extracted.personName.trim().length >= 3) {
    let bestUser: UserAccount | null = null;
    let maxUserScore = 0;

    for (const u of users) {
      const sim = calculateSimilarity(u.name || '', extracted.personName);
      if (sim > maxUserScore) {
        maxUserScore = sim;
        bestUser = u;
      }
    }

    if (bestUser && maxUserScore >= 0.6) {
      return {
        entityType: 'USER',
        id: bestUser.id,
        name: bestUser.name,
        secondaryInfo: bestUser.jobTitle || 'کارشناس سازمان',
        score: Math.min(1, Math.round(maxUserScore * 100) / 100),
        matchReason: 'تطابق با نام پرسنل در چارت سازمانی'
      };
    }
  }

  return undefined;
}

/**
 * بررسی اسناد تکراری (ضدتکرار پیشگیرانه)
 */
export function detectDuplicateDocument(
  state: Pick<AppState, 'payments' | 'cheques' | 'invoices'>,
  docType: CapturedDocumentType,
  extracted: {
    trackingNumber?: string;
    sayadId?: string;
    amount?: number | null;
    date?: string | null;
    accountId?: string;
  }
): DuplicateDetectionResult {
  const normRef = (extracted.trackingNumber || '').trim().toLowerCase();
  const sayad = (extracted.sayadId || '').trim();

  // ۱. بررسی چک بر اساس شناسه صیادی ۱۶ رقمی
  if (docType === 'CHEQUE' && sayad && sayad.length >= 10) {
    const existingCheque = (state.cheques || []).find((c: Cheque) => {
      const cSayad = (c.sayadNumber || c.chequeNumber || '').toString().trim();
      return cSayad && cSayad === sayad;
    });
    if (existingCheque) {
      return {
        isDuplicate: true,
        duplicateType: 'DEFINITE',
        existingRecordId: existingCheque.id,
        existingRecordType: 'CHEQUE',
        reason: `چک دیگری با شناسه صیادی «${sayad}» قبلاً در سیستم ثبت شده است.`
      };
    }
  }

  // ۲. بررسی فیش بانکی بر اساس شماره پیگیری / کد ارجاع
  if ((docType === 'BANK_RECEIPT' || docType === 'PAYMENT_RECEIPT') && normRef && normRef.length >= 4) {
    const cleanRef = toLatinDigits(normRef).replace(/\D/g, '');
    const existingPayment = (state.payments || []).find((p: Payment) => {
      if (p.deletedAt) return false;
      const pRef = toLatinDigits(p.reference || '').replace(/\D/g, '');
      return pRef && (pRef === cleanRef || pRef.endsWith(cleanRef) || cleanRef.endsWith(pRef));
    });

    if (existingPayment) {
      return {
        isDuplicate: true,
        duplicateType: 'DEFINITE',
        existingRecordId: existingPayment.id,
        existingRecordType: 'PAYMENT',
        reason: `پرداختی با شماره پیگیری/ارجاع «${normRef}» قبلاً در سیستم ثبت شده است (شناسه: ${existingPayment.id}).`
      };
    }
  }

  // ۳. بررسی فاکتور
  if (docType === 'INVOICE' && normRef) {
    const cleanInv = toLatinDigits(normRef).replace(/\D/g, '');
    const existingInv = (state.invoices || []).find((inv: Invoice) => {
      if (inv.deletedAt) return false;
      const iNum = toLatinDigits(inv.invoiceNumber || '').replace(/\D/g, '');
      return iNum && iNum === cleanInv;
    });
    if (existingInv) {
      return {
        isDuplicate: true,
        duplicateType: 'DEFINITE',
        existingRecordId: existingInv.id,
        existingRecordType: 'INVOICE',
        reason: `فاکتوری با شماره «${normRef}» قبلاً در سیستم موجود است.`
      };
    }
  }

  // ۴. بررسی تکرار احتمالی بر مبنای (مبلغ یکسان + تاریخ یکسان + مشتری یکسان)
  if (extracted.amount && extracted.amount > 0 && extracted.date && extracted.accountId) {
    const probPayment = (state.payments || []).find((p: Payment) => {
      if (p.deletedAt) return false;
      const sameAcc = (p.accountId === extracted.accountId || p.customerId === extracted.accountId);
      const sameAmount = Math.abs(Number(p.amount) - extracted.amount!) < 1;
      const sameDate = String(p.date || '').slice(0, 10) === String(extracted.date || '').slice(0, 10);
      return sameAcc && sameAmount && sameDate;
    });
    if (probPayment) {
      return {
        isDuplicate: true,
        duplicateType: 'PROBABLE',
        existingRecordId: probPayment.id,
        existingRecordType: 'PAYMENT',
        reason: `رسید مشابهی با همین مبلغ و تاریخ برای این مشتری در سیستم ثبت شده است. لطفاً دقت فرمایید.`
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * قانون استخراج جزئی (Partial Extraction):
 * تجزیه و تحلیل فیلدها و ساخت آمار تفکیکی
 */
export function computePartialExtractionStats(fields: Record<string, ExtractedField<any>>) {
  const list = Object.values(fields);
  const total = list.length;
  const extracted = list.filter(f => f.status === 'EXTRACTED').length;
  const needsReview = list.filter(f => f.status === 'NEEDS_REVIEW').length;
  const missing = list.filter(f => f.status === 'MISSING').length;

  return {
    totalFieldsCount: total,
    extractedCount: extracted,
    needsReviewCount: needsReview,
    missingCount: missing,
  };
}

/**
 * ساخت شیء نتیجه استخراج کامل با رعایت قانون استخراج جزئی و شواهد
 */
export function buildDocumentCaptureResult(params: {
  id: string;
  documentType: CapturedDocumentType;
  fileName: string;
  fileSize: number;
  mimeType: string;
  imageBase64: string;
  ocrEngine?: 'GEMINI_VISION' | 'HEURISTIC_PARSER' | 'MANUAL';
  fields: Record<string, ExtractedField<any>>;
  state: Pick<AppState, 'accounts' | 'users' | 'invoices' | 'payments' | 'cheques'>;
}): DocumentCaptureResult {
  const fields = params.fields;
  const stats = computePartialExtractionStats(fields);

  // محاسبه میانگین اطمینان فیلدهای استخراج‌شده
  const extractedList = Object.values(fields).filter(f => f.status !== 'MISSING');
  const avgConf = extractedList.length > 0
    ? extractedList.reduce((sum, f) => sum + (f.confidence || 0), 0) / extractedList.length
    : 0;

  // تطبیق هوشمند با CRM
  const matchedEntity = matchDocumentEntity(params.state, {
    personName: fields.personName?.value || fields.senderName?.value || fields.payerName?.value || fields.beneficiaryName?.value || fields.fullName?.value,
    companyName: fields.companyName?.value || fields.sellerName?.value || fields.buyerName?.value,
    accountNumber: fields.accountNumber?.value,
    iban: fields.iban?.value,
    invoiceNumber: fields.invoiceNumber?.value,
  });

  // بررسی تکراری
  const duplicateCheck = detectDuplicateDocument(params.state, params.documentType, {
    trackingNumber: fields.trackingNumber?.value || fields.referenceNumber?.value || fields.invoiceNumber?.value,
    sayadId: fields.sayadId?.value,
    amount: typeof fields.amount?.value === 'number' ? fields.amount.value : null,
    date: fields.date?.value,
    accountId: matchedEntity?.entityType === 'CUSTOMER' ? matchedEntity.id : undefined,
  });

  return {
    id: params.id,
    documentType: params.documentType,
    fileName: params.fileName,
    fileSize: params.fileSize,
    mimeType: params.mimeType,
    imageBase64: params.imageBase64,
    ocrEngine: params.ocrEngine || 'GEMINI_VISION',
    overallConfidence: Math.round(avgConf * 100) / 100,
    extractedAt: new Date().toISOString(),
    fields,
    matchedEntity,
    duplicateCheck,
    partialExtractionStats: stats,
    disclaimer: DOCUMENT_CAPTURE_LEGAL_DISCLAIMER,
  };
}

/**
 * پردازشگر متنی برای شرایط آفلاین یا استخراج تکمیلی بر اساس قوانین Regex
 */
export function heuristicExtractDocumentText(
  rawText: string,
  fileName: string = 'document.jpg'
): { documentType: CapturedDocumentType; fields: Record<string, ExtractedField<any>> } {
  const latinText = toLatinDigits(rawText);
  const norm = normalizePersian(rawText);

  // ۱. حدس نوع سند
  let docType: CapturedDocumentType = 'BANK_RECEIPT';
  if (/صیاد|sayad|واگذار|عهده بانک|در وجه|چک شماره/i.test(norm)) {
    docType = 'CHEQUE';
  } else if (/صورتحساب|فاکتور|مالیات بر ارزش افزوده|شماره فاکتور|فروشنده|خریدار/i.test(norm)) {
    docType = 'INVOICE';
  } else if (/تنخواه|هزینه|فاکتور هزینه|پذیرنده|رسید پوز/i.test(norm)) {
    docType = 'EXPENSE';
  } else if (/کد ملی|شناسنامه|نام پدر|تاریخ تولد|کارت ملی/i.test(norm)) {
    docType = 'PERSONNEL_ID';
  } else if (/رسید انتقال|فیش واریز|واریز به حساب|کارت به کارت|انتقال وجه|شماره ارجاع|کد پیگیری/i.test(norm)) {
    docType = 'BANK_RECEIPT';
  }

  const fields: Record<string, ExtractedField<any>> = {};

  // الف) استخراج مبلغ (Amount)
  const amountMatch = latinText.match(/(\d{1,3}(?:[,\s]\d{3})+|\b\d{4,12}\b)\s*(?:ریال|تومان|IRR)?/);
  if (amountMatch) {
    const rawVal = amountMatch[1];
    const parsed = parseNormalizedAmount(rawVal);
    if (parsed.amount) {
      fields.amount = {
        key: 'amount',
        label: 'مبلغ تراکنش',
        value: parsed.amount,
        rawText: amountMatch[0],
        confidence: 0.85,
        status: 'EXTRACTED',
        evidence: amountMatch[0],
        normalizedValue: parsed.amount,
      };
    }
  } else {
    fields.amount = {
      key: 'amount',
      label: 'مبلغ تراکنش',
      value: null,
      confidence: 0,
      status: 'MISSING',
      reviewReason: 'مبلغ در تصویر سند شناسایی نشد',
    };
  }

  // ب) شماره پیگیری / ارجاع (Tracking Number)
  const trackingMatch = latinText.match(/(?:پیگیری|ارجاع|شماره رسید|کد پیگیری|مرجع|ref|rrn)[:\s]*([0-9]{4,24})/i);
  if (trackingMatch) {
    fields.trackingNumber = {
      key: 'trackingNumber',
      label: 'شماره پیگیری / ارجاع',
      value: trackingMatch[1].trim(),
      rawText: trackingMatch[0],
      confidence: 0.9,
      status: 'EXTRACTED',
      evidence: trackingMatch[0],
    };
  } else {
    fields.trackingNumber = {
      key: 'trackingNumber',
      label: 'شماره پیگیری / ارجاع',
      value: null,
      confidence: 0,
      status: 'MISSING',
      reviewReason: 'شماره پیگیری خوانا نبود یا در سند وجود ندارد',
    };
  }

  // ج) تاریخ سند (Date)
  const dateMatch = latinText.match(/(1[34]\d{2}[\/\-\.](?:0?[1-9]|1[0-2])[\/\-\.](?:0?[1-9]|[12]\d|3[01]))/);
  if (dateMatch) {
    const parsedDate = parseNormalizedDate(dateMatch[1]);
    fields.date = {
      key: 'date',
      label: 'تاریخ سند',
      value: parsedDate.jalali || dateMatch[1],
      rawText: dateMatch[0],
      confidence: 0.9,
      status: 'EXTRACTED',
      evidence: dateMatch[0],
    };
  } else {
    fields.date = {
      key: 'date',
      label: 'تاریخ سند',
      value: null,
      confidence: 0,
      status: 'MISSING',
      reviewReason: 'تاریخ در تصویر سند پیدا نشد',
    };
  }

  // د) شناسه صیادی (برای چک)
  if (docType === 'CHEQUE') {
    const sayadMatch = latinText.match(/\b(\d{16})\b/);
    if (sayadMatch) {
      fields.sayadId = {
        key: 'sayadId',
        label: 'شناسه ۱۶ رقمی صیادی',
        value: sayadMatch[1],
        confidence: 0.95,
        status: 'EXTRACTED',
        evidence: sayadMatch[0],
      };
    } else {
      fields.sayadId = {
        key: 'sayadId',
        label: 'شناسه ۱۶ رقمی صیادی',
        value: null,
        confidence: 0,
        status: 'MISSING',
        reviewReason: 'شناسه صیادی ۱۶ رقمی خوانا نبود',
      };
    }
  }

  // هـ) نام بانک
  const banks = ['ملی', 'صادرات', 'ملت', 'تجارت', 'سپه', 'پاسارگاد', 'سامان', 'پارسیان', 'کشاورزی', 'مسکن', 'رفاه', 'آینده', 'شهر', 'سینا', 'دی', 'کارآفرین', 'اقتصاد نوین', 'بلوبانک'];
  for (const b of banks) {
    if (norm.includes(b)) {
      fields.bankName = {
        key: 'bankName',
        label: 'نام بانک',
        value: `بانک ${b}`,
        confidence: 0.9,
        status: 'EXTRACTED',
        evidence: `بانک ${b}`,
      };
      break;
    }
  }
  if (!fields.bankName) {
    fields.bankName = {
      key: 'bankName',
      label: 'نام بانک',
      value: null,
      confidence: 0,
      status: 'MISSING',
    };
  }

  // و) طرف حساب / واریزکننده / گیرنده
  const personMatch = norm.match(/(?:از|واریزکننده|صاحب حساب|به نام|خریدار|مشتری)[:\s]*([^\d\n,،]{3,35})/);
  if (personMatch) {
    fields.personName = {
      key: 'personName',
      label: docType === 'CHEQUE' ? 'نام صادرکننده / صاحب حساب' : 'نام واریزکننده / مشتری',
      value: personMatch[1].trim(),
      confidence: 0.75,
      status: 'NEEDS_REVIEW',
      evidence: personMatch[0],
      reviewReason: 'لطفاً نام شخص یا شرکت را با سند تطبیق دهید',
    };
  } else {
    fields.personName = {
      key: 'personName',
      label: docType === 'CHEQUE' ? 'نام صادرکننده / صاحب حساب' : 'نام واریزکننده / مشتری',
      value: null,
      confidence: 0,
      status: 'MISSING',
    };
  }

  return { documentType: docType, fields };
}

/* ───────── مسیر ثبت پس از OCR (F0-06): OCR فقط فرم را پر می‌کند؛ ثبت مستقیم فقط با انتخاب صریح و هرگز هم‌زمان با ارسال به فرم ───────── */
export type IntakeTargetAction = 'AUTO_LINK' | 'TRANSFER_TO_FORM';
export type ChequeDirection = 'RECEIVABLE' | 'PAYABLE';
export interface IntakeCommitPlan { persistDirect: boolean; applyToForm: boolean; blockedReason?: 'NO_FORM_HANDLER' | 'CHEQUE_DIRECTION_REQUIRED' }

export function resolveIntakeCommit(input: { documentType: CapturedDocumentType; targetAction: IntakeTargetAction; hasFormHandler: boolean; direction?: unknown }): IntakeCommitPlan {
  if (input.documentType === 'CHEQUE' && input.direction !== 'RECEIVABLE' && input.direction !== 'PAYABLE') {
    return { persistDirect: false, applyToForm: false, blockedReason: 'CHEQUE_DIRECTION_REQUIRED' };
  }
  if (input.targetAction === 'TRANSFER_TO_FORM') {
    return input.hasFormHandler ? { persistDirect: false, applyToForm: true } : { persistDirect: false, applyToForm: false, blockedReason: 'NO_FORM_HANDLER' };
  }
  return { persistDirect: true, applyToForm: false };
}

/* ───────── پل انتقال OCR → فرم (F0-06): مقادیر استخراج‌شده هنگام ناوبری از Layout گم نشوند ───────── */
export interface IntakePrefillPayload { documentType: CapturedDocumentType; appliedValues: Record<string, unknown>; fileName?: string }
export interface PaymentFormPrefill { values: Record<string, unknown>; notice: string }

const prefillText = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** مقادیر پیش‌پر فرم دریافت/پرداخت؛ برای انواعی که فرم پرداخت مصرف‌کننده‌شان نیست null (هیچ مقداری حدس زده نمی‌شود). */
export function buildPaymentFormPrefill(payload: IntakePrefillPayload): PaymentFormPrefill | null {
  const v = payload.appliedValues || {};
  const file = payload.fileName ? ` ${payload.fileName}` : '';
  if (payload.documentType === 'BANK_RECEIPT' || payload.documentType === 'PAYMENT_RECEIPT') {
    return {
      values: {
        accountId: prefillText(v.accountId), amount: prefillText(v.amount), reference: prefillText(v.trackingNumber),
        bankName: prefillText(v.bankName), method: 'TRANSFER', notes: `استخراج خودکار از سند${file}`.trim(),
      },
      notice: 'اطلاعات فیش بانکی استخراج شد و در فرم دریافتی قرار گرفت. لطفاً بررسی و تأیید نهایی فرمایید.',
    };
  }
  if (payload.documentType === 'CHEQUE') {
    return {
      values: {
        accountId: prefillText(v.accountId), amount: prefillText(v.amount), reference: prefillText(v.sayadId || v.trackingNumber),
        sayadId: prefillText(v.sayadId), bankName: prefillText(v.bankName), method: 'CHEQUE',
        direction: v.direction === 'RECEIVABLE' || v.direction === 'PAYABLE' ? v.direction : undefined,
        notes: `استخراج خودکار چک صیادی: شناسه ${prefillText(v.sayadId)} - سررسید: ${prefillText(v.date)}`,
      },
      notice: 'اطلاعات چک صیادی استخراج شد و در فرم قرار گرفت. لطفاً بررسی و تأیید نهایی فرمایید.',
    };
  }
  return null;
}
