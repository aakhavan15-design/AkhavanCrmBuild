import { useState, useEffect, useMemo, useCallback } from 'react';
import type { 
  AppState, 
  Payment, 
  Cheque, 
  Invoice, 
  Customer, 
  Attachment 
} from '../types';
import type { 
  DocumentCaptureResult, 
  CapturedDocumentType, 
  ExtractedField, 
  FieldStatus 
} from '../lib/documentCapture';
import { generateId } from '../lib/utils';
import { useAppStore } from '../lib/storage';

export type TargetCrmEntityType = 'PAYMENT' | 'CHEQUE' | 'INVOICE' | 'EXPENSE' | 'CUSTOMER';

export interface FieldReviewState {
  key: string;
  label: string;
  value: unknown;
  originalValue: unknown;
  status: FieldStatus;
  confidence: number;
  reviewReason?: string;
  evidence?: string;
  isReviewed: boolean;
  isDirty: boolean;
}

export interface UseDocumentAutoFillOptions {
  targetEntityType?: TargetCrmEntityType;
  confidenceThreshold?: number;
  autoReviewConfidentFields?: boolean;
  updateState?: (updater: (draft: AppState) => AppState | void) => void;
  onSuccess?: (savedRecord: unknown, entityType: TargetCrmEntityType) => void;
}

export interface UseDocumentAutoFillReturn {
  // فرم فیلدهای نگاشت‌شده
  formData: Record<string, unknown>;
  targetEntityType: TargetCrmEntityType;
  setTargetEntityType: (type: TargetCrmEntityType) => void;
  
  // متدهای تغییر مقادیر فرم
  setFieldValue: (key: string, value: unknown) => void;
  setBulkValues: (values: Record<string, unknown>) => void;
  
  // وضعیت بازبینی فیلدها (Review Workflow)
  fieldReviews: Record<string, FieldReviewState>;
  markFieldReviewed: (key: string) => void;
  markAllReviewed: () => void;
  unreviewedFieldsCount: number;
  isReviewRequired: boolean;
  isReviewComplete: boolean;
  
  // مدیریت اسناد تکراری
  isDuplicate: boolean;
  duplicateInfo: DocumentCaptureResult['duplicateCheck'] | null;
  duplicateConfirmed: boolean;
  setDuplicateConfirmed: (confirmed: boolean) => void;
  
  // وضعیت ذخیره‌سازی
  canSave: boolean;
  isSaving: boolean;
  saveError: string | null;
  savedRecordId: string | null;
  saveRecord: (customPayload?: Record<string, unknown>) => Promise<{ ok: boolean; id?: string; error?: string }>;
  
  // اطلاعات کمکی سند اصلی
  documentType: CapturedDocumentType | null;
  overallConfidence: number;
  sourceFileName: string | null;
  disclaimer: string;
  reset: () => void;
}

/**
 * هوک جامع اتصال OCR به فرم‌های CRM با چرخه کار «بازبینی قبل از ثبت» (Review Before Save Workflow)
 */
export function useDocumentAutoFill(
  captureResult: DocumentCaptureResult | null,
  options: UseDocumentAutoFillOptions = {}
): UseDocumentAutoFillReturn {
  const {
    confidenceThreshold = 0.8,
    autoReviewConfidentFields = true,
    updateState: propUpdateState,
    onSuccess
  } = options;

  // انتخاب updateState از استور در صورت ارسال نشدن در پراپ‌ها
  const storeUpdateState = useAppStore(state => state.updateState);
  const updateState = propUpdateState || storeUpdateState;

  // تعیین نوع موجودیت هدف بر اساس نوع سند
  const resolveDefaultEntityType = useCallback((docType?: CapturedDocumentType): TargetCrmEntityType => {
    switch (docType) {
      case 'CHEQUE': return 'CHEQUE';
      case 'INVOICE': return 'INVOICE';
      case 'EXPENSE': return 'EXPENSE';
      case 'PERSONNEL_ID': return 'CUSTOMER';
      case 'BANK_RECEIPT':
      case 'PAYMENT_RECEIPT':
      default:
        return 'PAYMENT';
    }
  }, []);

  const [targetEntityType, setTargetEntityType] = useState<TargetCrmEntityType>(
    options.targetEntityType || resolveDefaultEntityType(captureResult?.documentType)
  );

  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [fieldReviews, setFieldReviews] = useState<Record<string, FieldReviewState>>({});
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null);

  // تغییر نوع سند ورودی
  useEffect(() => {
    if (captureResult?.documentType && !options.targetEntityType) {
      setTargetEntityType(resolveDefaultEntityType(captureResult.documentType));
    }
  }, [captureResult?.documentType, options.targetEntityType, resolveDefaultEntityType]);

  // نگاشت فیلدهای OCR به فیلدهای CRM
  const mapOcrToEntityFields = useCallback((
    result: DocumentCaptureResult,
    entityType: TargetCrmEntityType
  ): { values: Record<string, unknown>; reviews: Record<string, FieldReviewState> } => {
    const values: Record<string, unknown> = {};
    const reviews: Record<string, FieldReviewState> = {};
    const ocrFields = result.fields || {};

    const amountVal = ocrFields.amount?.value !== null && ocrFields.amount?.value !== undefined
      ? Number(ocrFields.amount.value)
      : 0;

    const dateVal = ocrFields.date?.value ? String(ocrFields.date.value) : new Date().toISOString().slice(0, 10);
    const trackingVal = String(ocrFields.trackingNumber?.value || ocrFields.referenceNumber?.value || '');
    const bankVal = String(ocrFields.bankName?.value || '');
    const personVal = String(ocrFields.personName?.value || ocrFields.payerName?.value || ocrFields.beneficiaryName?.value || '');
    const sayadVal = String(ocrFields.sayadId?.value || '');
    const accountNumVal = String(ocrFields.accountNumber?.value || ocrFields.iban?.value || '');
    const invoiceNumVal = String(ocrFields.invoiceNumber?.value || '');

    // تشخیص شناسه مشتری تطبیق داده شده
    const matchedCustomerId = result.matchedEntity?.entityType === 'CUSTOMER' ? result.matchedEntity.id : '';

    if (entityType === 'PAYMENT') {
      values.accountId = matchedCustomerId;
      values.customerId = matchedCustomerId;
      values.amount = amountVal;
      values.date = dateVal;
      values.reference = trackingVal;
      values.bankName = bankVal;
      values.method = 'TRANSFER';
      values.notes = `رسید واریزی ثبت شده با تشخیص متن (${result.fileName})`;
      values.payerName = personVal;
      values.accountNumber = accountNumVal;
    } else if (entityType === 'CHEQUE') {
      values.customerId = matchedCustomerId;
      values.amount = amountVal;
      values.dueDate = dateVal;
      values.sayadNumber = sayadVal;
      values.chequeNumber = sayadVal || trackingVal;
      values.bankName = bankVal;
      values.drawerName = personVal;
      values.direction = 'RECEIVABLE';
      values.status = 'PENDING';
      values.notes = `چک صیادی ثبت‌شده با تشخیص متن (${result.fileName})`;
    } else if (entityType === 'INVOICE') {
      values.customerId = matchedCustomerId;
      values.accountId = matchedCustomerId;
      values.invoiceNumber = invoiceNumVal || trackingVal;
      values.totalAmount = amountVal;
      values.date = dateVal;
      values.status = 'PENDING';
    } else if (entityType === 'EXPENSE') {
      values.amount = amountVal;
      values.date = dateVal;
      values.reference = trackingVal;
      values.beneficiary = personVal;
      values.bankName = bankVal;
      values.notes = `سند تنخواه / هزینه استخراج‌شده با تشخیص متن (${result.fileName})`;
    } else if (entityType === 'CUSTOMER') {
      values.name = personVal || result.fileName;
      values.accountNumber = accountNumVal;
      values.code = trackingVal;
    }

    // ایجاد وضعیت بازبینی هر فیلد
    for (const [key, field] of Object.entries(ocrFields)) {
      const isConfident = (field.confidence ?? 0) >= confidenceThreshold && field.status === 'EXTRACTED';
      const isAutoReviewed = autoReviewConfidentFields && isConfident;

      reviews[key] = {
        key,
        label: field.label || key,
        value: values[key] ?? field.value,
        originalValue: field.value,
        status: field.status,
        confidence: field.confidence ?? 0,
        reviewReason: field.reviewReason,
        evidence: field.evidence,
        isReviewed: isAutoReviewed,
        isDirty: false
      };
    }

    return { values, reviews };
  }, [confidenceThreshold, autoReviewConfidentFields]);

  // اعمال نتیجه OCR به وضعیت داخلی
  useEffect(() => {
    if (!captureResult) {
      setFormData({});
      setFieldReviews({});
      setDuplicateConfirmed(false);
      setSavedRecordId(null);
      setSaveError(null);
      return;
    }

    const { values, reviews } = mapOcrToEntityFields(captureResult, targetEntityType);
    setFormData(values);
    setFieldReviews(reviews);
    setDuplicateConfirmed(false);
    setSavedRecordId(null);
    setSaveError(null);
  }, [captureResult, targetEntityType, mapOcrToEntityFields]);

  // تغییر مقدار یک فیلد فرم
  const setFieldValue = useCallback((key: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setFieldReviews(prev => {
      const existing = prev[key];
      if (!existing) return prev;
      return {
        ...prev,
        [key]: {
          ...existing,
          value,
          isDirty: true,
          isReviewed: true, // تغییر دستی توسط کاربر به منزله بازبینی است
          status: value ? 'EXTRACTED' : 'MISSING'
        }
      };
    });
  }, []);

  const setBulkValues = useCallback((values: Record<string, unknown>) => {
    setFormData(prev => ({ ...prev, ...values }));
  }, []);

  // علامت‌گذاری فیلد به عنوان بازبینی‌شده
  const markFieldReviewed = useCallback((key: string) => {
    setFieldReviews(prev => {
      const existing = prev[key];
      if (!existing) return prev;
      return {
        ...prev,
        [key]: {
          ...existing,
          isReviewed: true
        }
      };
    });
  }, []);

  // علامت‌گذاری همه فیلدها به عنوان بازبینی‌شده
  const markAllReviewed = useCallback(() => {
    setFieldReviews(prev => {
      const next: Record<string, FieldReviewState> = {};
      for (const [k, v] of Object.entries(prev)) {
        next[k] = { ...v, isReviewed: true };
      }
      return next;
    });
  }, []);

  // محاسبه آماری بازبینی
  const unreviewedFieldsCount = useMemo(() => {
    return Object.values(fieldReviews).filter(f => {
      const isProblematic = f.status === 'NEEDS_REVIEW' || f.status === 'MISSING' || f.confidence < confidenceThreshold;
      return isProblematic && !f.isReviewed;
    }).length;
  }, [fieldReviews, confidenceThreshold]);

  const isReviewRequired = unreviewedFieldsCount > 0;
  const isReviewComplete = !isReviewRequired;

  const isDuplicate = Boolean(captureResult?.duplicateCheck?.isDuplicate);
  const duplicateInfo = captureResult?.duplicateCheck || null;

  // آیا امکان ذخیره‌سازی وجود دارد؟
  const canSave = useMemo(() => {
    if (!captureResult || isSaving) return false;
    // اگر سند تکراری باشد، باید کاربر تیک تأیید را زده باشد
    if (isDuplicate && !duplicateConfirmed) return false;
    // فیلدهای نیازمند بازبینی باید بازبینی شده باشند
    if (!isReviewComplete) return false;
    // فیلد مبلغ باید بزرگتر از صفر باشد برای اسناد مالی
    if (targetEntityType === 'PAYMENT' || targetEntityType === 'CHEQUE' || targetEntityType === 'EXPENSE') {
      const amt = Number(formData.amount);
      if (!amt || amt <= 0) return false;
    }
    return true;
  }, [captureResult, isSaving, isDuplicate, duplicateConfirmed, isReviewComplete, targetEntityType, formData.amount]);

  // متد نهایی ذخیره‌سازی رکورد در CRM و الصاق فایل اصلی
  const saveRecord = useCallback(async (
    customPayload?: Record<string, unknown>
  ): Promise<{ ok: boolean; id?: string; error?: string }> => {
    if (!captureResult) {
      return { ok: false, error: 'سندی برای ذخیره‌سازی موجود نیست.' };
    }

    if (isDuplicate && !duplicateConfirmed) {
      return { ok: false, error: 'سند تکراری شناسایی شده است. لطفاً کادر تأیید را علامت بزنید.' };
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const finalPayload = { ...formData, ...(customPayload || {}) };
      const newRecordId = generateId();

      updateState(draft => {
        // ۱. ایجاد موجودیت متناظر در CRM
        if (targetEntityType === 'PAYMENT') {
          if (!draft.payments) draft.payments = [];
          const newPayment: Payment = {
            id: newRecordId,
            accountId: String(finalPayload.accountId || finalPayload.customerId || 'UNLINKED'),
            customerId: String(finalPayload.customerId || finalPayload.accountId || 'UNLINKED'),
            amount: Number(finalPayload.amount) || 0,
            date: String(finalPayload.date || new Date().toISOString().slice(0, 10)),
            method: (finalPayload.method as 'CASH' | 'TRANSFER' | 'CHEQUE') || 'TRANSFER',
            reference: String(finalPayload.reference || ''),
            bankName: String(finalPayload.bankName || ''),
            status: 'CLEARED',
            notes: String(finalPayload.notes || `ثبت خودکار هوشمند تشخیص متن - ${captureResult.fileName}`)
          };
          draft.payments.unshift(newPayment);
        } else if (targetEntityType === 'CHEQUE') {
          if (!draft.cheques) draft.cheques = [];
          const newCheque: Cheque = {
            id: newRecordId,
            customerId: String(finalPayload.customerId || 'UNLINKED'),
            amount: Number(finalPayload.amount) || 0,
            sayadNumber: String(finalPayload.sayadNumber || ''),
            chequeNumber: String(finalPayload.chequeNumber || finalPayload.sayadNumber || ''),
            dueDate: String(finalPayload.dueDate || new Date().toISOString().slice(0, 10)),
            bankName: String(finalPayload.bankName || ''),
            direction: 'RECEIVABLE',
            status: 'PENDING',
            notes: String(finalPayload.notes || `چک صیادی ثبت‌شده با هوش مصنوعی - ${captureResult.fileName}`)
          };
          draft.cheques.unshift(newCheque);
        } else if (targetEntityType === 'INVOICE') {
          if (!draft.invoices) draft.invoices = [];
          const newInvoice: Invoice = {
            id: newRecordId,
            customerId: String(finalPayload.customerId || 'UNLINKED'),
            accountId: String(finalPayload.accountId || finalPayload.customerId || 'UNLINKED'),
            totalAmount: Number(finalPayload.totalAmount || finalPayload.amount) || 0,
            paidAmount: 0,
            balance: Number(finalPayload.totalAmount || finalPayload.amount) || 0,
            status: 'PENDING',
            date: String(finalPayload.date || new Date().toISOString().slice(0, 10)),
            invoiceNumber: String(finalPayload.invoiceNumber || '')
          };
          draft.invoices.unshift(newInvoice);
        }

        // ۲. بایگانی تصویر در پیوست‌های CRM همراه با شواهد OCR و دنباله حسابرسی
        if (!draft.attachments) draft.attachments = [];
        const attachment: Attachment = {
          id: generateId(),
          entityId: String(finalPayload.accountId || finalPayload.customerId || newRecordId),
          entityType: targetEntityType,
          fileName: captureResult.fileName,
          fileType: captureResult.mimeType,
          fileSize: captureResult.fileSize,
          base64Data: captureResult.imageBase64,
          uploadedAt: new Date().toISOString(),
          uploadedBy: draft.currentUserId || 'system',
          ocrAudit: {
            captureResultId: captureResult.id,
            documentType: captureResult.documentType,
            ocrEngine: captureResult.ocrEngine,
            overallConfidence: captureResult.overallConfidence,
            isDuplicateOverride: duplicateConfirmed,
            fieldReviews: Object.fromEntries(
              Object.entries(fieldReviews).map(([k, v]) => [k, {
                value: v.value,
                originalValue: v.originalValue,
                isReviewed: v.isReviewed,
                confidence: v.confidence
              }])
            )
          }
        };
        draft.attachments.unshift(attachment);
      });

      setSavedRecordId(newRecordId);
      setIsSaving(false);

      if (onSuccess) {
        onSuccess(finalPayload, targetEntityType);
      }

      return { ok: true, id: newRecordId };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطا در ثبت سند در پایگاه‌داده';
      setIsSaving(false);
      setSaveError(message);
      return { ok: false, error: message };
    }
  }, [
    captureResult, 
    isDuplicate, 
    duplicateConfirmed, 
    formData, 
    targetEntityType, 
    updateState, 
    fieldReviews, 
    onSuccess
  ]);

  const reset = useCallback(() => {
    setFormData({});
    setFieldReviews({});
    setDuplicateConfirmed(false);
    setIsSaving(false);
    setSaveError(null);
    setSavedRecordId(null);
  }, []);

  return {
    formData,
    targetEntityType,
    setTargetEntityType,
    setFieldValue,
    setBulkValues,
    fieldReviews,
    markFieldReviewed,
    markAllReviewed,
    unreviewedFieldsCount,
    isReviewRequired,
    isReviewComplete,
    isDuplicate,
    duplicateInfo,
    duplicateConfirmed,
    setDuplicateConfirmed,
    canSave,
    isSaving,
    saveError,
    savedRecordId,
    saveRecord,
    documentType: captureResult?.documentType || null,
    overallConfidence: captureResult?.overallConfidence || 0,
    sourceFileName: captureResult?.fileName || null,
    disclaimer: captureResult?.disclaimer || '',
    reset
  };
}
