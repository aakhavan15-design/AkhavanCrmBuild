import React, { useState, useRef, useEffect } from 'react';
import { Select, InputControl } from '../ui/Input';
import { 
  Camera, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  Sparkles, 
  RefreshCw, 
  ShieldAlert, 
  Building, 
  Lock,
  Link as LinkIcon,
  Minimize2,
  Maximize2,
  FileCheck,
  Search
} from 'lucide-react';
import type { AppState, Customer, Payment, Cheque } from '../../types';
import { 
  CapturedDocumentType, 
  DOCUMENT_TYPE_LABELS, 
  DocumentCaptureResult, 
  ExtractedField, 
  FieldStatus, 
  buildDocumentCaptureResult,
  detectDuplicateDocument,
  parseNormalizedAmount,
  parseNormalizedDate,
  DOCUMENT_CAPTURE_LEGAL_DISCLAIMER,
  resolveIntakeCommit,
  type IntakeTargetAction,
  type ChequeDirection
} from '../../lib/documentCapture';
import { DuplicateDetectionBanner } from './DuplicateDetectionBanner';
import { ExtractedFieldsReviewer } from './ExtractedFieldsReviewer';
import { toLatinDigits } from '../../lib/digits';
import { generateId, cn, getJalaliMonthDays, jalaliToGregorianISO } from '../../lib/utils';
import { RBACService } from '../../lib/rbac';
import { AuthService } from '../../services/AuthService';
import { Button } from '../ui/Button';

export interface GlobalFloatingIntakeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  updateState?: (updater: (draft: AppState) => AppState | void) => void;
  initialType?: CapturedDocumentType;
  onApplyToForm?: (extractedData: {
    documentType: CapturedDocumentType;
    result: DocumentCaptureResult;
    appliedValues: Record<string, unknown>;
    linkedEntityId?: string;
    linkedEntityType?: string;
  }) => void;
}

type DocumentFile = { dataUrl: string; name: string; size: number; mimeType: string };

export type ProcessingStep = 'IDLE' | 'READING_FILE' | 'CALLING_GEMINI_VISION' | 'EXTRACTING_FIELDS' | 'COMPLETED' | 'ERROR';

export function GlobalFloatingIntakeDrawer({
  isOpen,
  onClose,
  state,
  updateState,
  initialType = 'BANK_RECEIPT',
  onApplyToForm,
}: GlobalFloatingIntakeDrawerProps) {
  const [docType, setDocType] = useState<CapturedDocumentType>(initialType);
  const [imageFile, setImageFile] = useState<DocumentFile | null>(null);

  const [processingStep, setProcessingStep] = useState<ProcessingStep>('IDLE');
  const [captureResult, setCaptureResult] = useState<DocumentCaptureResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // وضعیت تأیید دستی برای هشدارهای سند تکراری
  const [isDuplicateConfirmed, setIsDuplicateConfirmed] = useState(false);

  // حالت تمام صفحه یا فلوتینگ متراکم
  const [isMinimized, setIsMinimized] = useState(false);

  // تنظیمات پیش‌نمایش تصویر
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);

  // حالت ویرایش مقادیر استخراج‌شده
  const [editableValues, setEditableValues] = useState<Record<string, unknown>>({});

  // اتصال به رکوردهای CRM
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [targetAction, setTargetAction] = useState<IntakeTargetAction>(onApplyToForm ? 'TRANSFER_TO_FORM' : 'AUTO_LINK');

  // وضعیت کشیدن و رها کردن فایل روی دراپ‌زون
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialType) setDocType(initialType);
  }, [initialType]);

  // بازنشانی وضعیت‌ها با هر نتیجه جدید
  useEffect(() => {
    setIsDuplicateConfirmed(false);
    setSuccessNotice(null);
  }, [captureResult?.id]);

  if (!isOpen) return null;

  const handleFilePicked = async (file?: File) => {
    if (!file) return;
    setErrorMsg(null);
    setSuccessNotice(null);
    setCaptureResult(null);
    setIsDuplicateConfirmed(false);
    setZoomLevel(1);
    setRotation(0);

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';

    if (!isImage && !isPdf) {
      setErrorMsg('فرمت فایل پشتیبانی نمی‌شود. لطفاً تصویر یا فایل پی‌دی‌اف انتخاب نمایید.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('حجم فایل نباید بیش از ۱۰ مگابایت باشد.');
      return;
    }

    setProcessingStep('READING_FILE');

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      const picked = {
        dataUrl,
        name: file.name,
        size: file.size,
        mimeType: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
      };
      setImageFile(picked);

      // اجرای فوری فرایند پردازش با هوش مصنوعی بینایی
      await runOcrProcess(picked, docType);
    };
    reader.onerror = () => {
      setProcessingStep('ERROR');
      setErrorMsg('خطا در خواندن فایل انتخاب‌شده.');
    };
    reader.readAsDataURL(file);
  };

  const prepareReview = (
    file: DocumentFile,
    documentType: CapturedDocumentType,
    fields: Record<string, ExtractedField<unknown>>,
    engine: DocumentCaptureResult['ocrEngine'],
  ) => {
    ensureStandardFields(fields, documentType);
    const capture = buildDocumentCaptureResult({
      id: generateId(), documentType, fileName: file.name, fileSize: file.size,
      mimeType: file.mimeType, imageBase64: file.dataUrl, ocrEngine: engine, fields, state,
    });
    const values: Record<string, unknown> = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
    if (capture.matchedEntity?.entityType === 'CUSTOMER') {
      values.accountId = capture.matchedEntity.id;
      values.customerName = capture.matchedEntity.name;
    }
    setSelectedCustomerId(typeof values.accountId === 'string' ? values.accountId : '');
    setDocType(documentType);
    setEditableValues(values);
    setCaptureResult(capture);
    setErrorMsg(null);
    setProcessingStep('COMPLETED');
  };

  const runOcrProcess = async (file: DocumentFile, selectedType: CapturedDocumentType) => {
    setProcessingStep('CALLING_GEMINI_VISION');
    setErrorMsg(null);
    setIsDuplicateConfirmed(false);

    try {
      const token = AuthService.getAccessToken();
      const response = await fetch('/api/v1/documents/ocr-extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageBase64: file.dataUrl, mimeType: file.mimeType, expectedDocType: selectedType }),
      });
      if (!response.ok) throw new Error('OCR_UNAVAILABLE');
      const result = await response.json();
      if (result?.ok !== true || result.ocrEngine !== 'GEMINI_VISION' || !result.fields || typeof result.fields !== 'object' || Array.isArray(result.fields)) {
        throw new Error('INVALID_OCR_RESPONSE');
      }

      setProcessingStep('EXTRACTING_FIELDS');
      const detectedType: CapturedDocumentType = Object.hasOwn(DOCUMENT_TYPE_LABELS, result.documentType)
        ? result.documentType : selectedType;
      const fields: Record<string, ExtractedField<unknown>> = {};
      for (const [key, entry] of Object.entries(result.fields)) {
        if (!entry || typeof entry !== 'object' || ['__proto__', 'constructor', 'prototype'].includes(key)) continue;
        const raw = entry as Record<string, unknown>;
        const missing = raw.status === 'MISSING' || raw.value == null;
        const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
          ? Math.max(0, Math.min(1, raw.confidence)) : 0;
        const status: FieldStatus = missing ? 'MISSING' : raw.status === 'EXTRACTED' && confidence > 0 ? 'EXTRACTED' : 'NEEDS_REVIEW';
        fields[key] = {
          key, label: getFieldLabel(key, detectedType), value: missing ? null : raw.value,
          confidence: missing ? 0 : confidence, status,
          rawText: typeof raw.rawText === 'string' ? raw.rawText : undefined,
          evidence: typeof raw.evidence === 'string' ? raw.evidence : undefined,
          reviewReason: typeof raw.reviewReason === 'string' ? raw.reviewReason : undefined,
        };
      }
      prepareReview(file, detectedType, fields, 'GEMINI_VISION');
    } catch {
      setProcessingStep('ERROR');
      setErrorMsg('سرویس استخراج سند در دسترس نیست. فایل را برای ورود دستی نگه دارید یا دوباره تلاش کنید.');
    }
  };

  const ensureStandardFields = (fields: Record<string, ExtractedField<any>>, type: CapturedDocumentType) => {
    const requiredKeysForType: Record<CapturedDocumentType, string[]> = {
      BANK_RECEIPT: ['amount', 'trackingNumber', 'date', 'bankName', 'personName', 'accountNumber'],
      CHEQUE: ['sayadId', 'amount', 'date', 'bankName', 'personName', 'accountNumber'],
      PAYMENT_RECEIPT: ['amount', 'trackingNumber', 'date', 'personName', 'bankName'],
      INVOICE: ['invoiceNumber', 'amount', 'date', 'personName'],
      EXPENSE: ['amount', 'date', 'personName', 'trackingNumber'],
      PERSONNEL_ID: ['personName', 'accountNumber', 'date'],
      OTHER: ['amount', 'date', 'trackingNumber']
    };

    const keys = requiredKeysForType[type] || requiredKeysForType.BANK_RECEIPT;
    for (const k of keys) {
      if (!fields[k]) {
        fields[k] = {
          key: k,
          label: getFieldLabel(k, type),
          value: null,
          confidence: 0,
          status: 'MISSING',
          reviewReason: 'اطلاعات این فیلد در سند یافت نشد یا ناخوانا بود'
        };
      }
    }
  };

  const getFieldLabel = (key: string, type: CapturedDocumentType): string => {
    switch (key) {
      case 'amount': return 'مبلغ تراکنش (ریال)';
      case 'trackingNumber': return 'شماره پیگیری / کد ارجاع';
      case 'date': return type === 'CHEQUE' ? 'تاریخ سررسید چک' : 'تاریخ سند مالی';
      case 'sayadId': return 'شناسه ۱۶ رقمی صیادی';
      case 'bankName': return 'بانک عامل / مقصد';
      case 'personName':
        if (type === 'CHEQUE') return 'صاحب حساب / صادرکننده چک';
        if (type === 'INVOICE') return 'طرف حساب / خریدار';
        if (type === 'EXPENSE') return 'پذیرنده / شخص هزینه‌کننده';
        return 'نام واریزکننده / طرف حساب';
      case 'accountNumber': return 'شماره حساب / شبا / کارت';
      case 'invoiceNumber': return 'شماره صورتحساب / فاکتور';
      default: return key;
    }
  };

  const handleUpdateFieldValue = (key: string, val: unknown) => {
    setEditableValues(prev => ({ ...prev, [key]: val }));
    setIsDuplicateConfirmed(false);
  };

  const filteredCustomers = (state?.accounts || []).filter((acc: Customer) => {
    if (!customerSearchQuery.trim()) return true;
    const q = customerSearchQuery.toLowerCase();
    return (
      acc.name?.toLowerCase().includes(q) ||
      acc.company?.toLowerCase().includes(q) ||
      acc.code?.toLowerCase().includes(q)
    );
  }).slice(0, 15);

  const selectedCustomerObj = (state?.accounts || []).find((a: Customer) => a.id === selectedCustomerId);

  const rawAmount = toLatinDigits(String(editableValues.amount ?? '')).trim();
  const amount = /^[-−]/.test(rawAmount) ? null : parseNormalizedAmount(rawAmount).amount;
  const parsedDate = parseNormalizedDate(editableValues.date);
  const [year, month, day] = (parsedDate.jalali || '').split('/').map(Number);
  const dateCandidate = parsedDate.gregorianIso || (year && month && day && day <= getJalaliMonthDays(year, month)
    ? jalaliToGregorianISO(year, month, day) : null);
  const candidateUtc = dateCandidate ? new Date(`${dateCandidate}T00:00:00Z`) : null;
  const documentDate = candidateUtc && Number.isFinite(candidateUtc.getTime()) && candidateUtc.toISOString().slice(0, 10) === dateCandidate
    ? dateCandidate : null;
  const sayadId = toLatinDigits(String(editableValues.sayadId || '')).replace(/\s/g, '');
  const duplicateCheck = captureResult ? detectDuplicateDocument(state, docType, {
    amount, date: documentDate,
    trackingNumber: String(editableValues.trackingNumber || editableValues.invoiceNumber || ''),
    sayadId,
    accountId: selectedCustomerId || undefined,
  }) : { isDuplicate: false };

  const handleConfirmAndLinkToCrm = () => {
    if (!captureResult) return;
    if (duplicateCheck.isDuplicate && !isDuplicateConfirmed) return;

    const plan = resolveIntakeCommit({
      documentType: docType,
      targetAction,
      hasFormHandler: Boolean(onApplyToForm),
      direction: editableValues.direction,
    });
    if (plan.blockedReason) return;

    const linkedId = selectedCustomerId || (captureResult.matchedEntity?.entityType === 'CUSTOMER' ? captureResult.matchedEntity.id : 'UNLINKED');
    const isReceipt = docType === 'BANK_RECEIPT' || docType === 'PAYMENT_RECEIPT';
    const isCheque = docType === 'CHEQUE';

    if (plan.persistDirect && (!updateState || !imageFile)) {
      setErrorMsg('ثبت مستقیم سند در این صفحه در دسترس نیست.');
      return;
    }
    if (plan.persistDirect && updateState && imageFile) {
      const rbac = new RBACService(state);
      if ((isReceipt && !rbac.can('payments', 'CREATE')) || (isCheque && !rbac.can('finance', 'CREATE'))) {
        setErrorMsg('مجوز ثبت این سند مالی را ندارید.');
        return;
      }
      if ((isReceipt || isCheque) && (!(amount && amount > 0) || !documentDate || !selectedCustomerId)) {
        setErrorMsg('برای ثبت مستقیم سند مالی، مبلغ، تاریخ و طرف حساب را وارد کنید.');
        return;
      }
      if (isCheque && !/^\d{16}$/.test(sayadId)) {
        setErrorMsg('شناسهٔ صیادی باید ۱۶ رقم باشد.');
        return;
      }
      updateState(draft => {
        if (docType === 'BANK_RECEIPT' || docType === 'PAYMENT_RECEIPT') {
          if (!draft.payments) draft.payments = [];
          const newPayment: Payment = {
            id: generateId(),
            accountId: linkedId,
            customerId: linkedId,
            amount: amount!,
            date: documentDate!,
            method: 'TRANSFER',
            reference: String(editableValues.trackingNumber || ''),
            bankName: String(editableValues.bankName || ''),
            status: 'PENDING',
            notes: `ثبت رسید اعلامی برای بررسی حسابداری - سند: ${imageFile.name}`
          };
          draft.payments.unshift(newPayment);
        } else if (docType === 'CHEQUE') {
          if (!draft.cheques) draft.cheques = [];
          const newCheque: Cheque = {
            id: generateId(),
            amount: amount!,
            sayadNumber: sayadId,
            chequeNumber: sayadId,
            dueDate: documentDate!,
            bankName: String(editableValues.bankName || ''),
            status: 'PENDING',
            direction: editableValues.direction as ChequeDirection,
            customerId: linkedId,
            notes: `ثبت چک صیادی با تشخیص متن - صادرکننده: ${editableValues.personName || ''}`
          };
          draft.cheques.unshift(newCheque);
        }

        if (!draft.attachments) draft.attachments = [];
        draft.attachments.unshift({
          id: generateId(),
          entityId: linkedId,
          entityType: docType === 'INVOICE' ? 'QUOTE' : 'PAYMENT',
          fileName: imageFile.name,
          fileType: imageFile.mimeType,
          fileSize: imageFile.size,
          base64Data: imageFile.dataUrl,
          uploadedAt: new Date().toISOString(),
          uploadedBy: state.currentUserId,
          ocrMetadata: {
            captureId: captureResult.id,
            source: captureResult.ocrEngine,
            confidence: captureResult.ocrEngine === 'MANUAL' ? null : captureResult.overallConfidence,
            documentType: captureResult.documentType,
            isDuplicateOverride: isDuplicateConfirmed,
            linkedCustomerId: linkedId,
            extractedFields: editableValues
          }
        });
      });
    }

    if (plan.applyToForm && onApplyToForm) {
      onApplyToForm({
        documentType: docType,
        result: captureResult,
        appliedValues: { ...editableValues },
        linkedEntityId: linkedId,
        linkedEntityType: 'CUSTOMER'
      });
    }

    setSuccessNotice(
      plan.applyToForm
        ? 'مقادیر سند به فرم منتقل شد؛ ثبت نهایی از فرم انجام می‌شود.'
        : 'سند به پرونده پیوست شد. ثبت اثر مالی به بررسی حسابداری وابسته است.'
    );
    setTimeout(() => {
      onClose();
    }, 700);
  };

  const isProcessing =
    processingStep === 'CALLING_GEMINI_VISION' ||
    processingStep === 'EXTRACTING_FIELDS' ||
    processingStep === 'READING_FILE';
  const isSubmissionBlockedByDuplicate = duplicateCheck.isDuplicate && !isDuplicateConfirmed;
  const commitPlan = resolveIntakeCommit({
    documentType: docType,
    targetAction,
    hasFormHandler: Boolean(onApplyToForm),
    direction: editableValues.direction,
  });

  if (isMinimized) {
    return (
      <div
        dir="rtl"
        className="fixed top-18 left-6 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface/95 border border-primary/30 shadow-xl backdrop-blur-md animate-in slide-in-from-top-2"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-primary animate-ping" />
        <span className="text-xs font-bold text-text-main">
          {imageFile ? `سند: ${imageFile.name.slice(0, 16)}...` : 'درگاه هوشمند ورود سند'}
        </span>
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="p-1 rounded-md hover:bg-canvas text-primary transition-colors cursor-pointer"
          title="بزرگ‌نمایی پنجره"
          aria-label="بزرگ‌نمایی پنجره"
        >
          <Maximize2 size={14} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-canvas text-text-secondary transition-colors cursor-pointer"
          title="بستن"
          aria-label="بستن"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-ink-main/60 backdrop-blur-sm"
      dir="rtl"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-5xl h-(--vp-drawer) max-h-(--size-900) bg-surface rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-text-main truncate">
                  درگاه هوشمند ورود و استخراج اسناد
                </h2>
                <span className="hidden sm:inline-block text-micro font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  تشخیص متن سند
                </span>
              </div>
              <p className="text-caption text-text-secondary truncate mt-0.5">
                اسکن تصویر و پی‌دی‌اف، استخراج هوشمند و ارسال به فرم مالی سامانه
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 bg-canvas px-2.5 py-1 rounded-xl border border-border">
              <span className="text-caption text-text-secondary hidden sm:inline">نوع سند:</span>
              <Select
                aria-label="نوع سند"
                value={docType}
                onChange={e => {
                  const nextType = e.target.value as CapturedDocumentType;
                  setDocType(nextType);
                  if (imageFile) runOcrProcess(imageFile, nextType);
                }}
              >
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </Select>
            </div>

            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-text-secondary hover:bg-canvas hover:text-text-main transition-colors cursor-pointer"
              aria-label="شناور کردن پنجره"
              title="شناور کردن در نوار ابزار"
            >
              <Minimize2 size={15} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-text-secondary hover:bg-canvas hover:text-text-main transition-colors cursor-pointer"
              aria-label="بستن درگاه"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="shrink-0 bg-canvas/70 px-4 py-1.5 border-b border-border/70 flex items-center justify-between text-caption font-medium text-text-secondary overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-3">
            <span className={cn('flex items-center gap-1 font-bold', docType ? 'text-primary' : 'text-text-muted')}>
              <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-micro flex items-center justify-center font-mono">۱</span>
              <span>نوع سند</span>
            </span>
            <span className="text-text-muted">←</span>
            <span className={cn('flex items-center gap-1 font-bold', imageFile ? 'text-primary' : 'text-text-muted')}>
              <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-micro flex items-center justify-center font-mono">۲</span>
              <span>بارگذاری فایل/دوربین</span>
            </span>
            <span className="text-text-muted">←</span>
            <span className={cn('flex items-center gap-1 font-bold', isProcessing ? 'text-primary animate-pulse' : captureResult ? 'text-primary' : 'text-text-muted')}>
              <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-micro flex items-center justify-center font-mono">۳</span>
              <span>استخراج تشخیص متن</span>
            </span>
            <span className="text-text-muted">←</span>
            <span className={cn('flex items-center gap-1 font-bold', captureResult ? 'text-primary' : 'text-text-muted')}>
              <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-micro flex items-center justify-center font-mono">۴</span>
              <span>بازبینی و ثبت نهایی</span>
            </span>
          </div>
          {captureResult && captureResult.ocrEngine !== 'MANUAL' && (
            <span className="text-micro font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              ضریب اطمینان: {Math.round(captureResult.overallConfidence * 100)}٪
            </span>
          )}
        </div>

        {isProcessing && (
          <div className="shrink-0 bg-primary/10 border-b border-primary/20 px-4 py-2.5 flex items-center justify-between text-xs animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
              <div>
                <span className="font-bold text-primary">
                  {processingStep === 'READING_FILE' && 'در حال بارگذاری و تبدیل داده‌های سند...'}
                  {processingStep === 'CALLING_GEMINI_VISION' && 'در حال استخراج تصویر با سرویس بینایی هوشمند...'}
                  {processingStep === 'EXTRACTING_FIELDS' && 'تحلیل فیلدها، بررسی شناسه صیادی و تطابق پایگاه‌داده...'}
                </span>
              </div>
            </div>
            <span className="text-mini font-mono text-primary font-bold px-2 py-0.5 rounded-md bg-surface">
              در حال پردازش
            </span>
          </div>
        )}

        {successNotice && (
          <div className="shrink-0 bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 size={15} />
            <span>{successNotice}</span>
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          <div
            ref={dropZoneRef}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) handleFilePicked(dropped);
            }}
            className={`w-full md:w-1/2 h-1/2 md:h-full border-b md:border-b-0 md:border-l border-border transition-colors flex flex-col relative overflow-hidden ${
              isDraggingOver
                ? 'bg-primary/10 border-primary ring-2 ring-primary/40'
                : 'bg-canvas/60'
            }`}
          >
            {imageFile ? (
              <div className="flex-1 relative overflow-hidden flex items-center justify-center p-3 select-none">
                <div
                  className="transition-transform duration-150 ease-out flex items-center justify-center max-w-full max-h-full"
                  style={{ transform: `scale(${zoomLevel}) rotate(${rotation}deg)` }}
                >
                  {imageFile.mimeType === 'application/pdf' ? (
                    <div className="p-8 text-center bg-surface border border-border rounded-xl shadow-xs space-y-3 max-w-xs">
                      <FileText size={48} className="mx-auto text-primary opacity-80" />
                      <div>
                        <p className="text-xs font-bold text-text-main truncate">{imageFile.name}</p>
                        <p className="text-caption text-text-secondary mt-1">سند دیجیتال پی‌دی‌اف</p>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={imageFile.dataUrl}
                      alt={imageFile.name}
                      className="max-w-full max-h-(--vp-split-xs) md:max-h-(--vp-split-lg) object-contain rounded-lg shadow-sm border border-border"
                    />
                  )}
                </div>

                <div className="absolute bottom-3 start-3 flex items-center gap-1.5 p-1 bg-surface/90 backdrop-blur-md border border-border rounded-xl shadow-xs">
                  <button
                    type="button"
                    onClick={() => setZoomLevel(z => Math.min(2.5, z + 0.25))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-main hover:bg-canvas cursor-pointer"
                    title="بزرگ‌نمایی"
                    aria-label="بزرگ‌نمایی"
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomLevel(z => Math.max(0.75, z - 0.25))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-main hover:bg-canvas cursor-pointer"
                    title="کوچک‌نمایی"
                    aria-label="کوچک‌نمایی"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotation(r => (r + 90) % 360)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-main hover:bg-canvas cursor-pointer"
                    title="چرخش ۹۰ درجه"
                    aria-label="چرخش ۹۰ درجه"
                  >
                    <RotateCw size={14} />
                  </button>
                  <div className="w-px h-4 bg-border my-auto" />
                  <Button variant="soft" size="xs" type="button" onClick={() => { if (imageFile) runOcrProcess(imageFile, docType); }} disabled={isProcessing}>
                    <RefreshCw size={12} className={isProcessing ? 'animate-spin' : ''} />
                    <span>پردازش مجدد</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div className="w-full max-w-sm p-3.5 rounded-2xl bg-surface border border-primary/20 shadow-xs text-start space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-text-main flex items-center gap-1.5">
                      <Sparkles size={14} className="text-primary" />
                      <span>استخراج هوشمند فیلدهای سند</span>
                    </span>
                  </div>
                  <p className="text-caption text-text-secondary leading-relaxed">
                    تصویر فیش بانکی، چک صیادی یا فاکتور را بارگذاری کنید تا مقادیر آن استخراج و به فرم مربوط منتقل شود.
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap text-micro font-medium text-text-muted">
                    <span className="px-1.5 py-0.5 rounded bg-canvas border border-border">تشخیص ۱۶ رقم صیاد</span>
                    <span className="px-1.5 py-0.5 rounded bg-canvas border border-border">تبدیل خودکار ریال/تومان</span>
                    <span className="px-1.5 py-0.5 rounded bg-canvas border border-border">ضدتکرار پیشگیرانه</span>
                  </div>
                </div>

                <div
                  className={`w-full max-w-sm p-5 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center space-y-2 cursor-pointer ${
                    isDraggingOver
                      ? 'border-primary bg-primary/10 scale-(--scale-lift)'
                      : 'border-border/80 hover:border-primary/50 bg-surface/50'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Upload size={22} />
                  </div>
                  <h4 className="text-xs font-bold text-text-main">
                    {isDraggingOver ? 'فایل را اینجا رها کنید...' : 'سند را بکشید و اینجا رها کنید'}
                  </h4>
                  <p className="text-caption text-text-secondary">
                    پشتیبانی از تصاویر و پی‌دی‌اف تا ۱۰ مگابایت
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-sm">
                  <Button variant="primary" className="flex-1" type="button" onClick={() => cameraInputRef.current?.click()}>
                    <Camera size={16} />
                    <span>عکاسی با دوربین</span>
                  </Button>

                  <Button variant="outline" className="flex-1" type="button" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={16} />
                    <span>انتخاب از فایل‌ها</span>
                  </Button>
                </div>
              </div>
            )}

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={e => {
                handleFilePicked(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={e => {
                handleFilePicked(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>

          <div className="w-full md:w-1/2 h-1/2 md:h-full flex flex-col bg-surface overflow-hidden">
            {errorMsg && (
              <div className="space-y-2 border-b border-danger/20 bg-danger-soft p-3 text-xs text-danger">
                <div role="alert" className="flex items-center gap-2"><AlertTriangle size={15} className="shrink-0" />{errorMsg}</div>
                {processingStep === 'ERROR' && imageFile && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void runOcrProcess(imageFile, docType)}>تلاش دوباره</Button>
                    <Button type="button" variant="soft" size="sm" onClick={() => prepareReview(imageFile, docType, {}, 'MANUAL')}>ورود دستی اطلاعات سند</Button>
                  </div>
                )}
              </div>
            )}

            {captureResult && (
              <div className="shrink-0 p-3.5 border-b border-border bg-canvas/30 space-y-2.5">
                {duplicateCheck.isDuplicate && (
                  <DuplicateDetectionBanner
                    duplicateCheck={duplicateCheck}
                    isConfirmed={isDuplicateConfirmed}
                    onToggleConfirm={setIsDuplicateConfirmed}
                  />
                )}

                <div className="p-3 rounded-xl bg-surface border border-border space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-text-main flex items-center gap-1.5">
                      <LinkIcon size={14} className="text-primary" />
                      <span>اتصال سند به رکورد در سامانه:</span>
                    </span>
                    {captureResult.matchedEntity && (
                      <span className="text-micro font-bold text-primary px-1.5 py-0.2 rounded-md bg-primary/10 border border-primary/20">
                        تطبیق خودکار
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute start-2.5 top-2.5 text-text-muted" />
                      <InputControl
                        type="text"
                        placeholder="جستجوی نام مشتری یا شرکت..."
                        value={customerSearchQuery}
                        onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      />
                    </div>

                    <Select
                      aria-label="انتخاب طرف حساب"
                      value={selectedCustomerId}
                      onChange={(e) => {
                        setSelectedCustomerId(e.target.value);
                        setIsDuplicateConfirmed(false);
                        const acc = (state?.accounts || []).find((a: Customer) => a.id === e.target.value);
                        if (acc) {
                          setEditableValues(prev => ({ ...prev, accountId: acc.id, customerName: acc.name }));
                        }
                      }}
                      className="max-w-(--size-200)"
                    >
                      <option value="">-- انتخاب طرف حساب --</option>
                      {filteredCustomers.map((acc: Customer) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} {acc.company ? `(${acc.company})` : ''}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {selectedCustomerObj && (
                    <div className="flex items-center gap-2 text-caption text-text-secondary bg-canvas px-2.5 py-1.5 rounded-lg border border-border/70">
                      <Building size={13} className="text-primary" />
                      <span className="font-semibold text-text-main">{selectedCustomerObj.name}</span>
                      {selectedCustomerObj.company && (
                        <span className="text-text-muted">· {selectedCustomerObj.company}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {captureResult ? (
                <ExtractedFieldsReviewer
                  fields={captureResult.fields}
                  editableValues={editableValues}
                  onChangeField={handleUpdateFieldValue}
                  stats={captureResult.partialExtractionStats}
                  overallConfidence={captureResult.ocrEngine === 'MANUAL' ? undefined : captureResult.overallConfidence}
                />
              ) : isProcessing ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <p className="text-xs font-bold text-text-main">در حال فراخوانی تشخیص متن و استخراج سند...</p>
                  <p className="text-caption text-text-secondary">اعتبارسنجی مقادیر صیادی، مبالغ و تطابق با بانک داده</p>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-secondary space-y-2">
                  <FileText size={36} className="text-border-strong opacity-70" />
                  <p className="text-xs font-medium">سندی برای نمایش انتخاب نشده است.</p>
                  <p className="text-caption text-text-muted">تصویر فیش یا چک را از ستون مقابل انتخاب کنید.</p>
                </div>
              )}
            </div>

            <div className="shrink-0 p-3 border-t border-border bg-surface space-y-2.5">
              <div className="flex items-start gap-1.5 text-mini text-text-secondary leading-relaxed bg-canvas/70 p-2 rounded-xl border border-border">
                <ShieldAlert size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p>{DOCUMENT_CAPTURE_LEGAL_DISCLAIMER}</p>
              </div>

              {docType === 'CHEQUE' && (
                <div className="flex items-center gap-2" role="radiogroup" aria-label="جهت چک">
                  <span className="text-caption font-bold text-text-secondary">جهت چک:</span>
                  {([['RECEIVABLE', 'دریافتنی (از مشتری)'], ['PAYABLE', 'پرداختنی (به تأمین‌کننده)']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      role="radio"
                      aria-checked={editableValues.direction === val}
                      onClick={() => handleUpdateFieldValue('direction', val)}
                      className={`px-2.5 py-1 rounded-lg text-caption font-bold border cursor-pointer transition-colors ${editableValues.direction === val ? 'bg-primary text-on-primary border-primary' : 'bg-canvas text-text-secondary border-border'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2" role="radiogroup" aria-label="مقصد ثبت">
                <span className="text-caption font-bold text-text-secondary">مقصد:</span>
                {([['TRANSFER_TO_FORM', 'انتقال به فرم'], ['AUTO_LINK', 'ثبت مستقیم']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    role="radio"
                    aria-checked={targetAction === val}
                    onClick={() => setTargetAction(val)}
                    className={`px-2.5 py-1 rounded-lg text-caption font-bold border cursor-pointer transition-colors ${targetAction === val ? 'bg-primary text-on-primary border-primary' : 'bg-canvas text-text-secondary border-border'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {commitPlan.blockedReason === 'NO_FORM_HANDLER' && (
                <p className="text-caption text-amber-700">فرمی برای دریافت مقادیر باز نیست؛ «ثبت مستقیم» را انتخاب کنید یا سند را از داخل فرم مربوطه باز کنید.</p>
              )}
              {commitPlan.blockedReason === 'CHEQUE_DIRECTION_REQUIRED' && (
                <p className="text-caption text-amber-700">جهت چک (دریافتنی/پرداختنی) را مشخص کنید.</p>
              )}

              <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setCaptureResult(null);
                    setIsDuplicateConfirmed(false);
                  }}
                  className="px-3 py-2 text-xs font-bold text-text-secondary hover:bg-canvas rounded-xl transition-colors cursor-pointer shrink-0"
                >
                  تغییر مدرک
                </button>

                <div className="flex items-center gap-2 ms-auto">
                  {isSubmissionBlockedByDuplicate && (
                    <span className="text-caption text-rose-700 dark:text-rose-400 font-bold flex items-center gap-1 bg-rose-500/10 px-2 py-1 rounded-md border border-rose-500/20">
                      <Lock size={12} />
                      <span>تأیید تکراری بودن الزامی است</span>
                    </span>
                  )}

                  <Button
                    variant="primary"
                    type="button"
                    onClick={handleConfirmAndLinkToCrm}
                    disabled={!captureResult || isProcessing || isSubmissionBlockedByDuplicate || Boolean(commitPlan.blockedReason)}
                  >
                    <FileCheck size={16} />
                    <span>تأیید و الصاق به رکورد در سامانه</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
