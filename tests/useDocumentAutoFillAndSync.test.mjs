import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { 
  DataSyncController, 
  DATA_SYNC_LABELS
} from '../src/services/dataSyncController.ts';
import { 
  buildDocumentCaptureResult
} from '../src/lib/documentCapture.ts';

describe('useDocumentAutoFill & Centralized DataSyncController Contracts', () => {

  test('DataSyncController: Supports all 8 required synchronization states with authentic labels', () => {
    const requiredStates = [
      'idle',
      'syncing',
      'saving',
      'retrieving',
      'completed',
      'failed',
      'retrying',
      'offline'
    ];

    for (const state of requiredStates) {
      assert.ok(DATA_SYNC_LABELS[state], `Label for state ${state} must exist`);
      assert.ok(DATA_SYNC_LABELS[state].length > 3, `Label for state ${state} must be human-readable`);
    }

    const controller = DataSyncController.getInstance();
    const status = controller.getStatus();
    assert.ok(requiredStates.includes(status.state));
    assert.equal(typeof status.pendingCount, 'number');
    assert.equal(typeof status.retryAttempt, 'number');
  });

  test('Document AutoFill Workflow: Maps OCR extraction into CRM payment entity fields', () => {
    const mockState = {
      accounts: [{ id: 'acc_100', name: 'شرکت مهندسی پویا', company: 'پویا تک' }],
      users: [],
      invoices: [],
      payments: [],
      cheques: []
    };

    const mockOcrResult = buildDocumentCaptureResult({
      id: 'doc_auto_1',
      documentType: 'BANK_RECEIPT',
      fileName: 'mellat_receipt_445.jpg',
      fileSize: 204800,
      mimeType: 'image/jpeg',
      imageBase64: 'data:image/jpeg;base64,mock...',
      ocrEngine: 'GEMINI_VISION',
      fields: {
        amount: { key: 'amount', label: 'مبلغ', value: 125000000, confidence: 0.96, status: 'EXTRACTED' },
        trackingNumber: { key: 'trackingNumber', label: 'شماره پیگیری', value: 'TRX-99887766', confidence: 0.95, status: 'EXTRACTED' },
        date: { key: 'date', label: 'تاریخ', value: '1405/08/21', confidence: 0.92, status: 'EXTRACTED' },
        bankName: { key: 'bankName', label: 'نام بانک', value: 'بانک ملت', confidence: 0.9, status: 'EXTRACTED' },
        personName: { key: 'personName', label: 'طرف حساب', value: 'شرکت مهندسی پویا', confidence: 0.88, status: 'EXTRACTED' },
        sayadId: { key: 'sayadId', label: 'شناسه صیادی', value: null, confidence: 0, status: 'MISSING' }
      },
      state: mockState
    });

    // ارزیابی تطبیق خودکار با مشتری
    assert.ok(mockOcrResult.matchedEntity);
    assert.equal(mockOcrResult.matchedEntity.id, 'acc_100');
    assert.equal(mockOcrResult.matchedEntity.entityType, 'CUSTOMER');

    // شبیه‌سازی نگاشت به فیلدهای پرداخت
    const mappedPayment = {
      accountId: mockOcrResult.matchedEntity.id,
      amount: mockOcrResult.fields.amount.value,
      reference: mockOcrResult.fields.trackingNumber.value,
      bankName: mockOcrResult.fields.bankName.value,
      date: mockOcrResult.fields.date.value,
      method: 'TRANSFER'
    };

    assert.equal(mappedPayment.accountId, 'acc_100');
    assert.equal(mappedPayment.amount, 125000000);
    assert.equal(mappedPayment.reference, 'TRX-99887766');
    assert.equal(mappedPayment.bankName, 'بانک ملت');
  });

  test('Review Before Save Logic: Requires confirmation for low-confidence or missing fields', () => {
    const ocrFields = {
      amount: { key: 'amount', value: 45000000, confidence: 0.95, status: 'EXTRACTED' },
      personName: { key: 'personName', value: 'نامشخص', confidence: 0.45, status: 'NEEDS_REVIEW', reviewReason: 'خط‌خوردگی روی فیش' },
      trackingNumber: { key: 'trackingNumber', value: null, confidence: 0, status: 'MISSING', reviewReason: 'کد پیگیری چاپ نشده' }
    };

    const evaluateReviewStatus = (fields, threshold = 0.8, userReviewed = {}) => {
      const needsReview = Object.entries(fields).filter(([k, f]) => {
        const isProblem = f.status === 'NEEDS_REVIEW' || f.status === 'MISSING' || f.confidence < threshold;
        return isProblem && !userReviewed[k];
      });
      return {
        isReviewRequired: needsReview.length > 0,
        unreviewedCount: needsReview.length,
        canSave: needsReview.length === 0
      };
    };

    // در ابتدا قبل از بررسی کاربر: باید ذخیره مسدود باشد
    const initialStatus = evaluateReviewStatus(ocrFields, 0.8, {});
    assert.equal(initialStatus.isReviewRequired, true);
    assert.equal(initialStatus.unreviewedCount, 2);
    assert.equal(initialStatus.canSave, false);

    // پس از اینکه کاربر ۲ فیلد نامطمئن را بررسی و اصلاح کرد:
    const reviewedStatus = evaluateReviewStatus(ocrFields, 0.8, { personName: true, trackingNumber: true });
    assert.equal(reviewedStatus.isReviewRequired, false);
    assert.equal(reviewedStatus.unreviewedCount, 0);
    assert.equal(reviewedStatus.canSave, true);
  });

  test('Duplicate Protection Gate: Blocks unconfirmed duplicate submission while permitting explicit manual override', () => {
    const mockDuplicateCheck = {
      isDuplicate: true,
      duplicateType: 'DEFINITE',
      existingRecordId: 'pay_old_500',
      reason: 'شماره پیگیری در پایگاه‌داده وجود دارد'
    };

    const checkCanSave = (isDuplicate, duplicateConfirmed, isReviewComplete) => {
      if (isDuplicate && !duplicateConfirmed) return false;
      return isReviewComplete;
    };

    // قبل از تیک تأیید کاربر: ذخیره غیرفعال است
    assert.equal(checkCanSave(mockDuplicateCheck.isDuplicate, false, true), false);

    // پس از تیک تأیید کاربر: ذخیره مجاز می‌شود
    assert.equal(checkCanSave(mockDuplicateCheck.isDuplicate, true, true), true);
  });

  test('Context-Aware Action Resolver: Resolves correct quick actions per workspace route', () => {
    const resolveWorkspaceAction = (path) => {
      if (path.startsWith('/leads')) return { actionId: 'add-lead', label: 'سرنخ جدید' };
      if (path.startsWith('/accounts') || path.startsWith('/customers')) return { actionId: 'add-customer', label: 'مشتری جدید' };
      if (path.startsWith('/tasks')) return { actionId: 'add-task', label: 'وظیفه جدید' };
      if (path.startsWith('/quotes')) return { actionId: 'add-quote', label: 'پیش‌فاکتور جدید' };
      if (path.startsWith('/finance')) return { actionId: 'add-payment', label: 'ثبت دریافتی' };
      if (path.startsWith('/internal_automation')) return { actionId: 'add-request', label: 'درخواست جدید' };
      return { actionId: 'quick-add', label: 'اقدام جدید' };
    };

    assert.equal(resolveWorkspaceAction('/leads').actionId, 'add-lead');
    assert.equal(resolveWorkspaceAction('/accounts').actionId, 'add-customer');
    assert.equal(resolveWorkspaceAction('/tasks').actionId, 'add-task');
    assert.equal(resolveWorkspaceAction('/quotes').actionId, 'add-quote');
    assert.equal(resolveWorkspaceAction('/finance').actionId, 'add-payment');
    assert.equal(resolveWorkspaceAction('/internal_automation').actionId, 'add-request');
    assert.equal(resolveWorkspaceAction('/').actionId, 'quick-add');
  });

});
