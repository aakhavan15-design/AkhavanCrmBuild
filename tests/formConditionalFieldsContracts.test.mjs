import assert from 'node:assert/strict';
import { createInternalRequestFormSchema, createPaymentReceiptFormSchema, validateEntireForm, shouldFieldDisplay, INTERNAL_REQUEST_TYPE_FIELDS, RECEIPT_METHOD_FIELDS } from '../src/services/dynamicFormEngine.ts';

const types = Object.keys(INTERNAL_REQUEST_TYPE_FIELDS).map(value => ({ value, label: value }));
const schema = createInternalRequestFormSchema(types);
const visible = (vals) => schema.fields.filter(f => shouldFieldDisplay(f, vals)).map(f => f.id);
const ids = schema.fields.map(f => f.id);
assert.equal(new Set(ids).size, ids.length, 'شناسهٔ فیلدها یکتا باشد');

// مرخصی روزانه / ساعتی
assert.ok(visible({ type: 'LEAVE', leaveMode: 'DAILY' }).includes('request-endDate-leave'));
assert.ok(!visible({ type: 'LEAVE', leaveMode: 'DAILY' }).includes('request-fromTime-leave'));
assert.ok(visible({ type: 'LEAVE', leaveMode: 'HOURLY' }).includes('request-fromTime-leave'));
assert.ok(!visible({ type: 'LEAVE', leaveMode: 'HOURLY' }).includes('request-endDate-leave'));
// فیلد پنهان مانع ثبت نشود
const ok = validateEntireForm(schema, { type: 'GENERAL', priority: 'NORMAL', title: 'درخواست آزمایشی' });
assert.equal(ok.isValid, true, JSON.stringify(ok.errors));
const bad = validateEntireForm(schema, { type: 'LEAVE', priority: 'NORMAL', leaveMode: 'DAILY', title: 'مرخصی' });
assert.equal(bad.isValid, false);
assert.ok(bad.errors.startDate && bad.errors.endDate && !bad.errors.fromTime);
// هر نوع، فیلدهای خودش را دارد
for (const [type, names] of Object.entries(INTERNAL_REQUEST_TYPE_FIELDS)) {
  const shown = new Set(schema.fields.filter(f => shouldFieldDisplay(f, { type, leaveMode: 'DAILY', payMethod: 'IBAN' })).map(f => f.name));
  for (const n of names) if (n !== 'leaveDate' && n !== 'chequeDueDate' && n !== 'iban' && !(type === 'LEAVE' && ['fromTime', 'toTime'].includes(n))) assert.ok(shown.has(n), `${type}: ${n}`);
}
// فرم دریافت
const rs = createPaymentReceiptFormSchema([], [{ value: 'TRANSFER', label: 'a' }]);
const rv = (m) => rs.fields.filter(f => shouldFieldDisplay(f, { method: m })).map(f => f.name);
assert.ok(rv('CHEQUE').includes('sayadId') && rv('CHEQUE').includes('chequeDueDate'));
assert.ok(rv('CARD_READER').includes('terminalId') && !rv('CARD_READER').includes('sayadId'));
assert.ok(rv('TRANSFER').includes('sourceAccount'));
assert.ok(rv('CASH').includes('receiptNo') && !rv('CASH').includes('bankName'));
for (const [m, names] of Object.entries(RECEIPT_METHOD_FIELDS)) for (const n of names) assert.ok(rv(m).includes(n), `${m}:${n}`);
console.log('formConditionalFieldsContracts OK');
