import assert from 'node:assert/strict';
import { planErpImport, erpCollectionFor } from '../src/lib/erpImportService.ts';
import { validateEtlRecord, runEtlBatch } from '../src/lib/etlPipeline.ts';

const base = { tenantId: 't1', sourceSystemCode: 'erp-main', sourceModifiedAtUtc: '2026-11-10T10:00:00Z' };
assert.equal(erpCollectionFor('PRODUCT'), 'externalProducts', 'کالا همان مجموعهٔ موجود است');

// نرخ ۰ (معاف) و ۱۰ پذیرفته؛ نبود نرخ = null و نه ۰
const state0 = { externalProducts: [] };
const planned = planErpImport(state0, 'PRODUCT', [
  { ...base, externalId: 'P-1', name: 'الف', taxRatePercent: 10 },
  { ...base, externalId: 'P-2', name: 'ب', taxRatePercent: 0 },
  { ...base, externalId: 'P-3', name: 'ج' },
  { ...base, externalId: 'P-4', name: 'د', taxRatePercent: '' },
]);
assert.equal(planned.summary.inserted, 4);
const by = id => planned.nextState.externalProducts.find(p => p.externalId === id);
assert.equal(by('P-1').taxRatePercent, 10);
assert.equal(by('P-2').taxRatePercent, 0);
assert.equal(by('P-3').taxRatePercent, null, 'نبود نرخ ⇒ null (نامشخص)');
assert.equal(by('P-4').taxRatePercent, null, 'رشتهٔ خالی ⇒ null');

// اعتبارسنجی ETL
const ok = r => validateEtlRecord('PRODUCT', { ...base, externalId: 'X', ...r });
assert.equal(ok({ taxRatePercent: 9 }).length, 0);
assert.equal(ok({}).length, 0);
assert.equal(ok({ taxRatePercent: -1 })[0].ruleCode, 'PRODUCT_TAX_RATE_INVALID');
assert.equal(ok({ taxRatePercent: 101 })[0].ruleCode, 'PRODUCT_TAX_RATE_INVALID');
assert.equal(ok({ taxRatePercent: 'abc' })[0].ruleCode, 'PRODUCT_TAX_RATE_INVALID');

// ETL کامل: رکورد نامعتبر رد می‌شود، معتبرها وارد؛ اجرای مجدد اثر تکراری ندارد
const batch = [
  { ...base, externalId: 'P-1', name: 'الف', taxRatePercent: 10 },
  { ...base, externalId: 'P-9', name: 'خراب', taxRatePercent: 500 },
];
const run1 = runEtlBatch(state0, 'PRODUCT', batch, { now: new Date('2026-11-17T00:00:00Z') });
assert.equal(run1.nextState.externalProducts.length, 1);
assert.ok(run1.rejections.some(x => x.ruleCode === 'PRODUCT_TAX_RATE_INVALID'));
const run2 = runEtlBatch(run1.nextState, 'PRODUCT', batch, { now: new Date('2026-11-17T00:05:00Z') });
assert.equal(run2.nextState.externalProducts.length, 1, 'replay idempotent');
console.log('productTaxEtl OK');
