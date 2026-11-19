// F0-13/F0-14: نمای مانده مشتری از نتیجهٔ DataProvider؛ منبع شفاف، بدون حدس.
import assert from 'node:assert/strict';
import { buildDetailBalancesResult, resolveCustomerBalanceView, customerDetailKeys } from '../src/lib/receivableReconciliation.ts';

const L = (d, s, debit, credit, extra = {}) => ({ detailAccountId: d, subsidiaryCode: s, debitAmount: debit, creditAmount: credit, ...extra });
const res = buildDetailBalancesResult([L('C1', '1101', 100, 0), L('C1', '1102', 0, 30), L('C2', undefined, 50, 0)], 'CLIENT_INDEXEDDB');

assert.deepEqual(resolveCustomerBalanceView(null, { id: 'C1' }), { kind: 'LOADING' });
assert.equal(resolveCustomerBalanceView({ status: 'UNAVAILABLE', source: 'SQLSERVER_BACKEND', balances: [], reason: 'x' }, { id: 'C1' }).kind, 'UNAVAILABLE');
// دو معین مستقل برای یک تفصیلی؛ جمع فقط تجمیع
const v1 = resolveCustomerBalanceView(res, { id: 'C1' });
assert.equal(v1.kind, 'OK'); assert.equal(v1.total, 70); assert.equal(v1.nature, 'DEBIT');
assert.equal(v1.subsidiaryCount, 2); assert.equal(v1.incomplete, false);
assert.deepEqual(v1.subsidiaries.map(x => x.balance).sort((a, b) => a - b), [-30, 100]);
// سطر بدون معین ⇒ ناقص/فاقد نگاشت (نه مانده ساختگی)
const v2 = resolveCustomerBalanceView(res, { id: 'C2' });
assert.equal(v2.incomplete, true); assert.equal(v2.unmappedCount, 1); assert.equal(v2.subsidiaryCount, 0);
// مشتری بدون گردش ⇒ NO_LEDGER؛ نام/حدس هرگز تطبیق داده نمی‌شود
assert.equal(resolveCustomerBalanceView(res, { id: 'C9', code: 'zzz' }).kind, 'NO_LEDGER');
// کلید ERP (کد تفصیلی) بر id برتری دارد
assert.deepEqual(customerDetailKeys({ id: 'a', code: 'c', detailAccountId: 'd' }), ['d', 'c', 'a']);
assert.equal(resolveCustomerBalanceView(res, { id: 'zzz', detailAccountId: 'C1' }).kind, 'OK');
// EMPTY ⇒ NO_LEDGER
assert.equal(resolveCustomerBalanceView(buildDetailBalancesResult([], 'CLIENT_INDEXEDDB'), { id: 'C1' }).kind, 'NO_LEDGER');
console.log('customerBalanceView: PASS');
