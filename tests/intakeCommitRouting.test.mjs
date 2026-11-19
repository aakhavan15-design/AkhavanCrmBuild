// F0-06: OCR فقط فرم را پر کند؛ ثبت مضاعف نشود؛ targetAction استفاده شود؛ جهت چک از کاربر.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolveIntakeCommit } from '../src/lib/documentCapture.ts';

const plan = (o) => resolveIntakeCommit({ documentType: 'BANK_RECEIPT', targetAction: 'AUTO_LINK', hasFormHandler: false, ...o });
// هیچ‌گاه هر دو مسیر هم‌زمان
for (const t of ['AUTO_LINK', 'TRANSFER_TO_FORM']) for (const h of [true, false]) for (const d of ['BANK_RECEIPT', 'CHEQUE', 'INVOICE']) {
  const p = plan({ targetAction: t, hasFormHandler: h, documentType: d, direction: 'RECEIVABLE' });
  assert.ok(!(p.persistDirect && p.applyToForm), `double registration ${t}/${h}/${d}`);
}
assert.deepEqual(plan({ targetAction: 'TRANSFER_TO_FORM', hasFormHandler: true }), { persistDirect: false, applyToForm: true });
assert.equal(plan({ targetAction: 'TRANSFER_TO_FORM', hasFormHandler: false }).blockedReason, 'NO_FORM_HANDLER');
assert.deepEqual(plan({ targetAction: 'AUTO_LINK' }), { persistDirect: true, applyToForm: false });
// جهت چک: بدون انتخاب کاربر مسدود؛ هیچ پیش‌فرضی وجود ندارد
assert.equal(plan({ documentType: 'CHEQUE' }).blockedReason, 'CHEQUE_DIRECTION_REQUIRED');
assert.equal(plan({ documentType: 'CHEQUE', direction: 'bogus' }).blockedReason, 'CHEQUE_DIRECTION_REQUIRED');
assert.equal(plan({ documentType: 'CHEQUE', direction: 'PAYABLE' }).persistDirect, true);

const src = readFileSync('src/components/shared/GlobalFloatingIntakeDrawer.tsx', 'utf8');
assert.ok(!/direction:\s*'RECEIVABLE'/.test(src), 'جهت چک نباید ثابت RECEIVABLE باشد');
assert.ok(/direction: editableValues\.direction as ChequeDirection/.test(src));
assert.ok(/if \(plan\.persistDirect && updateState && imageFile\)/.test(src) && /if \(plan\.applyToForm && onApplyToForm\)/.test(src));
assert.ok(/setTargetAction\(val\)/.test(src) && /useState<IntakeTargetAction>\(onApplyToForm \?/.test(src), 'targetAction باید واقعاً استفاده شود');
console.log('intakeCommitRouting: PASS');
