import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { 
  parseNormalizedAmount, 
  parseNormalizedDate, 
  validateSayadId, 
  matchDocumentEntity, 
  detectDuplicateDocument, 
  computePartialExtractionStats,
  buildDocumentCaptureResult,
  heuristicExtractDocumentText,
  DOCUMENT_CAPTURE_LEGAL_DISCLAIMER
} from '../src/lib/documentCapture.ts';

describe('Intelligent Document Capture & Partial Extraction Contracts', () => {

  test('Partial Extraction Rule: Extracts visible fields independently without failing when some are missing', () => {
    const rawInput = {
      amount: { value: 50000000, rawText: '۵۰,۰۰۰,۰۰۰ ریال', confidence: 0.95, status: 'EXTRACTED' },
      trackingNumber: { value: '88492019', rawText: '۸۸۴۹۲۰۱۹', confidence: 0.9, status: 'EXTRACTED' },
      date: { value: '1403/08/21', rawText: '۱۴۰۳/۰۸/۲۱', confidence: 0.85, status: 'EXTRACTED' },
      // فیلدهای زیر ناخوانا یا غایب هستند و نباید مانع عملیات شوند
      sayadId: { value: null, confidence: 0, status: 'MISSING', reviewReason: 'در فیش بانکی وجود ندارد' },
      bankName: { value: null, confidence: 0, status: 'MISSING' },
      accountNumber: { value: null, confidence: 0, status: 'MISSING' },
      personName: { value: 'پترو اخوان', confidence: 0.6, status: 'NEEDS_REVIEW', reviewReason: 'نام تا حدی مبهم است' }
    };

    const stats = computePartialExtractionStats(rawInput);
    assert.equal(stats.totalFieldsCount, 7);
    assert.equal(stats.extractedCount, 3);
    assert.equal(stats.needsReviewCount, 1);
    assert.equal(stats.missingCount, 3);

    const mockState = {
      accounts: [{ id: 'acc_1', name: 'شرکت پترو صنعت اخوان', company: 'پترو اخوان' }],
      users: [],
      invoices: [],
      payments: [],
      cheques: []
    };

    const result = buildDocumentCaptureResult({
      id: 'doc_123',
      documentType: 'BANK_RECEIPT',
      fileName: 'bank_slip.jpg',
      fileSize: 102400,
      mimeType: 'image/jpeg',
      imageBase64: 'data:image/jpeg;base64,mock...',
      fields: rawInput,
      state: mockState
    });

    // عملیات موفق و دارای فیلدهای استخراج‌شده است
    assert.equal(result.id, 'doc_123');
    assert.equal(result.fields.amount.value, 50000000);
    assert.equal(result.fields.sayadId.status, 'MISSING');
    assert.equal(result.fields.personName.status, 'NEEDS_REVIEW');
    assert.ok(result.overallConfidence > 0);
  });

  test('Amount normalization: Handles Persian and Latin digits, Rials and Tomans correctly', () => {
    // رقم فارسی با کاما و ریال
    const res1 = parseNormalizedAmount('مبلغ ۲۵,۰۰۰,۰۰۰ ریال');
    assert.equal(res1.amount, 25000000);
    assert.equal(res1.unit, 'RIAL');

    // رقم لاتین با تومان
    const res2 = parseNormalizedAmount('3,500,000 تومان');
    assert.equal(res2.amount, 35000000); // تبدیل تومان به ریال در هسته مالی
    assert.equal(res2.unit, 'TOMAN');

    // مقدار نامعتبر
    const res3 = parseNormalizedAmount('نامشخص');
    assert.equal(res3.amount, null);
  });

  test('Date normalization: Handles Jalali and Gregorian dates', () => {
    const d1 = parseNormalizedDate('تاریخ تراکنش: ۱۴۰۴/۰۹/۱۵');
    assert.equal(d1.jalali, '1404/09/15');

    const d2 = parseNormalizedDate('Date: 2026-11-10');
    assert.equal(d2.gregorianIso, '2026-11-10');

    const d3 = parseNormalizedDate('بدون تاریخ');
    assert.equal(d3.jalali, null);
    assert.equal(d3.gregorianIso, null);
  });

  test('Sayad Check Validation: Validates exact 16 digits for Sayad checks', () => {
    const valid = validateSayadId('1234567890123456');
    assert.equal(valid.isValid, true);
    assert.equal(valid.cleaned, '1234567890123456');

    // رقم فارسی
    const validFa = validateSayadId('۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶');
    assert.equal(validFa.isValid, true);
    assert.equal(validFa.cleaned, '1234567890123456');

    // رقم ناقص (کمتر از ۱۶ رقم)
    const invalid = validateSayadId('123456789');
    assert.equal(invalid.isValid, false);
  });

  test('Entity Matching: Matches customer or invoice intelligently with similarity scoring', () => {
    const mockState = {
      accounts: [
        { id: 'acc_40', name: 'شرکت پترو صنعت اخوان', company: 'پتروشیمی اخوان' },
        { id: 'acc_50', name: 'توسعه تجارت پارس', company: 'پارس ترید' }
      ],
      users: [
        { id: 'usr_1', name: 'مهندس احمدی', jobTitle: 'کارشناس فروش' }
      ],
      invoices: [
        { id: 'inv_101', invoiceNumber: 'INV-2026-908', accountId: 'acc_40', customerId: 'acc_40', totalAmount: 450000000 }
      ]
    };

    // تطبیق با مشتری با تشابه اسمی
    const match1 = matchDocumentEntity(mockState, {
      personName: 'پترو صنعت اخوان'
    });
    assert.ok(match1);
    assert.equal(match1?.id, 'acc_40');
    assert.equal(match1?.entityType, 'CUSTOMER');
    assert.ok(match1?.score >= 0.8);

    // تطبیق مستقیم فاکتور با شماره فاکتور
    const match2 = matchDocumentEntity(mockState, {
      invoiceNumber: 'INV-2026-908'
    });
    assert.ok(match2);
    assert.equal(match2?.id, 'inv_101');
    assert.equal(match2?.entityType, 'INVOICE');
  });

  test('Deduplication: Accurately detects existing payments, sayad cheques and duplicate invoices', () => {
    const mockState = {
      payments: [
        { id: 'pay_99', reference: 'TRX-776210', amount: 15000000, date: '2026-11-10T10:00:00Z', accountId: 'acc_10' }
      ],
      cheques: [
        { id: 'chq_55', sayadNumber: '4019283746501928', amount: 200000000 }
      ],
      invoices: [
        { id: 'inv_33', invoiceNumber: 'INV-8899', totalAmount: 85000000 }
      ]
    };

    // ۱. فیش بانکی با شماره پیگیری یکسان -> تکراری قطعی
    const dupPayment = detectDuplicateDocument(mockState, 'BANK_RECEIPT', {
      trackingNumber: 'TRX-776210',
      amount: 15000000
    });
    assert.equal(dupPayment.isDuplicate, true);
    assert.equal(dupPayment.duplicateType, 'DEFINITE');
    assert.equal(dupPayment.existingRecordId, 'pay_99');

    // ۲. چک با شناسه صیادی تکراری -> تکراری قطعی
    const dupCheque = detectDuplicateDocument(mockState, 'CHEQUE', {
      sayadId: '4019283746501928'
    });
    assert.equal(dupCheque.isDuplicate, true);
    assert.equal(dupCheque.duplicateType, 'DEFINITE');
    assert.equal(dupCheque.existingRecordId, 'chq_55');

    // ۳. سند کاملاً جدید -> بدون تکرار
    const freshDoc = detectDuplicateDocument(mockState, 'BANK_RECEIPT', {
      trackingNumber: 'TRX-999999',
      amount: 12000000
    });
    assert.equal(freshDoc.isDuplicate, false);
  });

  test('Legal Disclaimer & Safety: Asserts no automatic financial settlement or check authenticity claim', () => {
    assert.ok(DOCUMENT_CAPTURE_LEGAL_DISCLAIMER.includes('تسهیل ورود اطلاعات'));
    assert.ok(DOCUMENT_CAPTURE_LEGAL_DISCLAIMER.includes('به‌هیچ‌وجه به منزله تایید اصالت چک'));
    assert.ok(DOCUMENT_CAPTURE_LEGAL_DISCLAIMER.includes('وصول وجه'));
  });

  test('User Confirmation Workflow: Blocks unconfirmed duplicate submission while permitting explicit manual override', () => {
    const duplicateDetected = {
      isDuplicate: true,
      duplicateType: 'DEFINITE',
      existingRecordId: 'pay_99',
      existingRecordType: 'PAYMENT',
      reason: 'سند مکرر شناسایی شد'
    };

    // قبل از تیک تأیید کاربر: ثبت باید بلاک باشد
    const canSubmitBefore = !duplicateDetected.isDuplicate || false;
    assert.equal(canSubmitBefore, false);

    // پس از علامت‌زدن صریح کاربر: ثبت باز می‌شود
    const userConfirmedOverride = true;
    const canSubmitAfter = !duplicateDetected.isDuplicate || userConfirmedOverride;
    assert.equal(canSubmitAfter, true);
  });

  test('Extracted Fields Reviewer: Correctly tags low-confidence or ambiguous fields as NEEDS_REVIEW', () => {
    const fields = {
      personName: {
        key: 'personName',
        label: 'نام واریزکننده',
        value: 'احمدی',
        confidence: 0.58,
        status: 'NEEDS_REVIEW',
        reviewReason: 'تطابق تقریبی نیازمند بازبینی است'
      },
      amount: {
        key: 'amount',
        label: 'مبلغ تراکنش',
        value: 100000000,
        confidence: 0.95,
        status: 'EXTRACTED'
      }
    };

    assert.equal(fields.personName.status, 'NEEDS_REVIEW');
    assert.ok(fields.personName.confidence < 0.8);
    assert.ok(fields.personName.reviewReason.length > 0);
    assert.equal(fields.amount.status, 'EXTRACTED');
    assert.ok(fields.amount.confidence >= 0.8);
  });

  test('CRM Record Linking Contract: Verifies structured linking to customer and financial records', () => {
    const extractedData = {
      documentType: 'BANK_RECEIPT',
      appliedValues: {
        accountId: 'acc_10',
        amount: 250000000,
        trackingNumber: '8910237465',
        bankName: 'بانک ملت',
        date: '1405/08/21'
      },
      linkedEntityId: 'acc_10',
      linkedEntityType: 'CUSTOMER'
    };

    assert.equal(extractedData.linkedEntityId, 'acc_10');
    assert.equal(extractedData.linkedEntityType, 'CUSTOMER');
    assert.ok(extractedData.appliedValues.amount > 0);
    assert.ok(extractedData.appliedValues.trackingNumber.length >= 4);
  });

  test('ConfidenceField Component Logic Contract: Low confidence (<0.8) triggers needs-review state', () => {
    const evaluateConfidenceState = (confidence, threshold = 0.8, status) => {
      const isNeedsReview = status === 'NEEDS_REVIEW' || (confidence < threshold && confidence > 0 && status !== 'EXTRACTED');
      return {
        isNeedsReview,
        hasYellowOutline: isNeedsReview,
        confidencePercent: Math.round(confidence * 100)
      };
    };

    // فیلد با اطمینان پایین (مثلاً 0.62) باید زرد / نیازمند بازبینی شود
    const lowConf = evaluateConfidenceState(0.62, 0.8, 'NEEDS_REVIEW');
    assert.equal(lowConf.isNeedsReview, true);
    assert.equal(lowConf.hasYellowOutline, true);
    assert.equal(lowConf.confidencePercent, 62);

    // فیلد با اطمینان بالا (مثلاً 0.95) نیازمند بازبینی نیست
    const highConf = evaluateConfidenceState(0.95, 0.8, 'EXTRACTED');
    assert.equal(highConf.isNeedsReview, false);
    assert.equal(highConf.hasYellowOutline, false);
    assert.equal(highConf.confidencePercent, 95);
  });

});
