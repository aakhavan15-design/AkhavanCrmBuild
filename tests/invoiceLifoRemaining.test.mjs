// F0-16: مانده هر فاکتور LIFO از مانده دفتری، مالیات به‌تفکیک کالا، گزارش‌های سنی/فروشنده، قرارداد ایستا.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDetailBalancesResult } from '../src/lib/receivableReconciliation.ts';
import { estimateInvoiceRemaining, allocateLifo } from '../src/services/agingBuckets.ts';
import { buildReceivableLifoReport } from '../src/services/receivableReports.ts';
import { computeQuoteTax } from '../src/lib/taxRate.ts';
import { parseFlexibleDate } from '../src/lib/dateParse.ts';

assert.equal(new Date(parseFlexibleDate('1405/08/01')).toISOString().slice(0, 10), '2026-10-23');
const res = buildDetailBalancesResult([{ detailAccountId: 'C1', subsidiaryCode: '1101', debitAmount: 25e6, creditAmount: 0, status:'POSTED' }], 'CLIENT_INDEXEDDB');
const inv = [['1', 3, '1405/08/01', 's1'], ['2', 7, '1405/08/02', 's2'], ['3', 8, '1405/08/07', 's1'], ['4', 12, '1405/08/23', 's2']]
  .map(([n, t, d, s]) => ({ id: 'i' + n, invoiceNumber: n, customerId: 'C1', totalAmount: t * 1e6, date: d, ownerId: s, status: 'CONFIRMED' }));
const m = estimateInvoiceRemaining(res, [{ id: 'C1' }, { id: 'C9' }], [...inv, { id: 'x', customerId: 'C9', totalAmount: 5, date: '1405/08/01', status: 'CONFIRMED' }, { id: 'v', customerId: 'C1', totalAmount: 9e6, date: '1405/08/30', status: 'CANCELLED' }]);
assert.deepEqual([...m], [['i1', 0], ['i2', 5e6], ['i3', 8e6], ['i4', 12e6], ['x', null]]);
assert.equal(estimateInvoiceRemaining(null, [{ id: 'C1' }], inv).get('i4'), null);
const al = allocateLifo(100, [{ id: 'a', total: 30, date: '2026-01-01' }, { id: 'b', total: 30, date: '2026-01-02' }]);
assert.equal(al.unattributed, 40);

const rep = buildReceivableLifoReport(res, [{ id: 'C1', name: 'م' }], inv, { asOf: new Date('2026-11-17'), allowedDays: 20 });
assert.equal(rep.totalOutstanding, 25e6); assert.equal(rep.invoiceCount, 3);
assert.equal(rep.avgAgeDays, 12.3);
assert.deepEqual(rep.overAllowed.map(r => r.invoiceNumber), ['2']);
assert.equal(rep.bySeller.find(s => s.sellerKey === 's2').outstanding, 17e6);
assert.equal(rep.aging.balanced, true);
assert.equal(buildReceivableLifoReport(res, [{ id: 'C1' }], inv, { asOf: new Date('2026-11-17') }).overAllowed.length, 0, 'بدون مهلت مجاز ⇒ نامشخص');

const P = new Map([['a', { taxRatePercent: 10 }], ['b', { taxRatePercent: 0 }], ['c', {}]]);
const t = computeQuoteTax([{ productId: 'a', lineTotal: 100 }, { productId: 'b', lineTotal: 100 }], 20, P, undefined);
assert.equal(t.amount, 9); assert.equal(t.byRate.length, 2);
assert.equal(computeQuoteTax([{ productId: 'c', lineTotal: 100 }], 0, P, undefined).amount, null);
assert.equal(computeQuoteTax([{ productId: 'c', lineTotal: 100 }], 0, P, 9).amount, 9);

const drawer = readFileSync('src/components/shared/OrderDetailsDrawer.tsx', 'utf8');
assert.ok(!drawer.includes('* 0.09') && !drawer.includes('(۹٪)'), 'نرخ ۹٪ هاردکد حذف شد');
assert.ok(drawer.includes('estimateInvoiceRemaining') && drawer.includes('computeQuoteTax'));
const catalog = readFileSync('src/components/OperationsSupplementalTabs.tsx', 'utf8');
assert.ok(catalog.includes('product-tax-rate'), 'نرخ مالیات کالا در فهرست کالا دیده می‌شود');
for (const f of ['FinanceWorkspace', 'ReportEnginePanels']) assert.ok(readFileSync(`src/components/${f}.tsx`, 'utf8').includes('ReceivablesLifoPanel'));
console.log('invoiceLifoRemaining OK');
assert.ok(catalog.includes('product-fifo-value') && !/function\s+\w*[Ff]ifo/.test(catalog), 'ارزش FIFO فقط نمایش از دیتابیس است');
console.log('fifoDisplay OK');
