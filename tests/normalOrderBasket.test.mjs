import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildNormalOrderDraftRecord, calculateNormalOrderLine, validateNormalOrderLines } from '../src/lib/normalOrderBasket.ts';

const carton = calculateNormalOrderLine({ enteredQuantity: 5, quantityMode: 'CARTON', unitsPerCarton: 12, unitPrice: 1000 });
assert.equal(carton.valid, true);
assert.equal(carton.baseQuantity, 60);
assert.equal(carton.cartonQuantity, 5);
assert.equal(carton.lineTotal, 60000);

const baseUnits = calculateNormalOrderLine({ enteredQuantity: 7, quantityMode: 'BASE_UNIT', unitsPerCarton: null, unitPrice: 250 });
assert.equal(baseUnits.valid, true);
assert.equal(baseUnits.baseQuantity, 7);
assert.equal(baseUnits.lineTotal, 1750);

const missingPack = calculateNormalOrderLine({ enteredQuantity: 5, quantityMode: 'CARTON', unitsPerCarton: null, unitPrice: 1000 });
assert.equal(missingPack.valid, false);
assert.equal(missingPack.reason, 'PACK_SIZE_UNKNOWN');

const overflow = calculateNormalOrderLine({ enteredQuantity: Number.MAX_SAFE_INTEGER, quantityMode: 'CARTON', unitsPerCarton: 2, unitPrice: 1 });
assert.equal(overflow.valid, false);
assert.equal(overflow.reason, 'QUANTITY_OVERFLOW');

const line = { id: 'line-1', productId: 'p-1', productName: 'کالای آزمون', quantity: 60, unitPrice: 1000, lineTotal: 60000, quantityMode: 'CARTON', cartonQuantity: 5, unitsPerCarton: 12, currencyCode: 'IRR' };
assert.deepEqual(validateNormalOrderLines([line]), []);
assert.ok(validateNormalOrderLines([{ ...line, currencyCode: 'USD' }]).includes('LINE_1_CURRENCY_NOT_IRR'));
assert.ok(validateNormalOrderLines([{ ...line, unitsPerCarton: null }]).includes('LINE_1_PACK_CONVERSION_INVALID'));

const created = buildNormalOrderDraftRecord({ id: 'crm-12345678', customerId: 'customer-1', customerName: 'مشتری آزمون', priceClassCode: 'PRICE_CLASS_1', lines: [line], ownerId: 'user-1' });
assert.equal(created.ok, true);
assert.equal(created.record.sourceSystemCode, 'CRM');
assert.equal(created.record.origin, 'CRM_ORDER');
assert.equal(created.record.status, 'DRAFT');
assert.equal(created.record.syncStatus, 'NOT_SENT');
assert.equal(created.record.currencyCode, 'IRR');
assert.equal(created.record.totalAmount, 60000);
assert.equal('externalOrderId' in created.record, false);

const amendment = buildNormalOrderDraftRecord({ id: 'crm-87654321', sourceOrderId: 'erp-42', sourceOrderNumber: 'ERP-42', customerId: 'customer-1', priceClassCode: 'PRICE_CLASS_1', lines: [line], ownerId: 'user-1' });
assert.equal(amendment.ok, true);
assert.equal(amendment.record.origin, 'ERP_AMENDMENT');
assert.equal(amendment.record.sourceOrderId, 'erp-42');
assert.equal(amendment.record.syncStatus, 'NOT_SENT');

const basket = readFileSync('src/components/operations/NormalOrderBasket.tsx', 'utf8');
const operations = readFileSync('src/components/OperationsControlWorkspace.tsx', 'utf8');
assert.match(operations, /<NormalOrderBasket/);
assert.match(operations, /sourceSystemCode \|\| ''\)\.toUpperCase\(\) !== 'CRM'/);
assert.match(operations, /پیش‌نویس‌های CRM در KPI و گزارش رسمی سفارش‌های ERP وارد نمی‌شوند/);
assert.match(basket, /پیش‌نویس اصلاح سفارش ERP/);
assert.match(basket, /ذخیره پیش‌نویس CRM/);
assert.match(basket, /ارسال‌نشده به ERP/);

console.log('PASS normal order basket quantity, rial, draft and ERP-boundary contracts');
