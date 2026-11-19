// F0-06 (باقی‌مانده): مقادیر OCR هنگام ناوبری Layout گم نشوند و فرم دریافت/پرداخت پیش‌پر شود.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildPaymentFormPrefill } from '../src/lib/documentCapture.ts';

// فیش بانکی → فرم دریافتی با مقادیر واقعی
const r = buildPaymentFormPrefill({ documentType: 'BANK_RECEIPT', fileName: 'a.jpg', appliedValues: { amount: 5000, trackingNumber: 'T1', bankName: 'ملی', accountId: 'acc1' } });
assert.equal(r.values.method, 'TRANSFER');
assert.equal(r.values.amount, '5000');
assert.equal(r.values.reference, 'T1');
assert.equal(r.values.accountId, 'acc1');
// مقدار نامعلوم حدس زده نمی‌شود: رشتهٔ خالی، نه عدد/تاریخ ساختگی
const empty = buildPaymentFormPrefill({ documentType: 'PAYMENT_RECEIPT', appliedValues: {} });
assert.equal(empty.values.amount, '');
assert.equal(empty.values.reference, '');
// چک: جهت فقط از انتخاب کاربر؛ مقدار نامعتبر → undefined (نه پیش‌فرض RECEIVABLE)
const c1 = buildPaymentFormPrefill({ documentType: 'CHEQUE', appliedValues: { sayadId: 'S9', direction: 'PAYABLE' } });
assert.equal(c1.values.method, 'CHEQUE');
assert.equal(c1.values.direction, 'PAYABLE');
assert.equal(c1.values.reference, 'S9');
assert.equal(buildPaymentFormPrefill({ documentType: 'CHEQUE', appliedValues: { direction: 'bogus' } }).values.direction, undefined);
// انواعی که فرم پرداخت مصرف‌کننده‌شان نیست → null
for (const t of ['INVOICE', 'EXPENSE', 'PERSONNEL_ID']) assert.equal(buildPaymentFormPrefill({ documentType: t, appliedValues: { amount: 1 } }), null);

// سیم‌کشی: Layout مقادیر را در state ناوبری می‌برد و FinanceWorkspace آن را مصرف می‌کند
const layout = readFileSync('src/components/Layout.tsx', 'utf8');
assert.ok(/navigate\('\/finance\?tab=payments', \{ state: \{ intakePrefill \} \}\)/.test(layout), 'Layout باید intakePrefill را حمل کند');
assert.ok(/onApplyToForm=\{\(\{ documentType, result, appliedValues \}\)/.test(layout));
const fin = readFileSync('src/components/FinanceWorkspace.tsx', 'utf8');
assert.ok(/location\.state as \{ intakePrefill\?: IntakePrefillPayload \}/.test(fin), 'FinanceWorkspace باید state ناوبری را بخواند');
assert.ok(/replaceState\(/.test(fin), 'مصرف یک‌بار؛ Refresh فرم را دوباره باز نکند');
assert.ok(/import \{[^}]*DOCUMENT_TYPE_LABELS[^}]*\} from '..\/lib\/documentCapture'/.test(fin), 'DOCUMENT_TYPE_LABELS باید ایمپورت شود');
assert.ok(!/setPaymentFormInitialValues\(\{\s*accountId: appliedValues/.test(fin), 'منطق پیش‌پر تکراری در FinanceWorkspace نماند');
console.log('intakePrefillBridge: PASS');
