// F0-16: collection/task aging = ledger balance covered LIFO (newest invoice first); stored invoice balance/status ignored.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){ if(s==='jalaali-js') return {url:'data:text/javascript,'+encodeURIComponent('const f=()=>({});export default {toJalaali:f,toGregorian:f,jalaaliMonthLength:()=>30,isValidJalaaliDate:()=>true};export const toJalaali=f,toGregorian=f,jalaaliMonthLength=()=>30;'),shortCircuit:true}; return n(s,c);}`));
const { evaluateAllCustomerCollections } = await import('../src/services/collectionEngine.ts');
import { buildDetailBalancesResult } from '../src/lib/receivableReconciliation.ts';
const asOf = new Date('2026-11-08T00:00:00Z');
const state = {
  accounts: [{ id: 'c1', name: 'A' }],
  invoices: [
    { id: 'i1', accountId: 'c1', customerId: 'c1', status: 'PAID', totalAmount: 1000, balance: 0, paidAmount: 1000, date: '2026-09-01', dueDate: '2026-10-01', invoiceNumber: 'I1' },
    { id: 'i2', accountId: 'c1', customerId: 'c1', status: 'UNPAID', totalAmount: 500, balance: 500, date: '2026-10-20', dueDate: '2026-10-30', invoiceNumber: 'I2' },
    { id: 'i3', accountId: 'c1', customerId: 'c1', status: 'CANCELLED', totalAmount: 900, date: '2026-10-25', dueDate: '2026-09-01', invoiceNumber: 'I3' },
  ],
  payments: [], paymentAllocations: [], creditNotes: [], cheques: [],
};
const ledger = buildDetailBalancesResult([{ detailAccountId: 'c1', subsidiaryCode: '1101', debitAmount: 700, creditAmount: 0 }], 'CLIENT_INDEXEDDB');
const { summary } = evaluateAllCustomerCollections(state, asOf, ledger);
// بدهی ۷۰۰: I2=۵۰۰ کامل + ۲۰۰ از I1 (وضعیت PAID نادیده)؛ باطل نادیده
assert.equal(summary.totalUnpaidInvoicesCount, 2);
assert.equal(summary.totalOverdueAmount, 700);
assert.equal(summary.receivableSource.authoritative, true);
assert.equal(summary.receivableSource.estimated, true);
const none = evaluateAllCustomerCollections(state, asOf, null);
assert.equal(none.summary.totalOverdueAmount, 0, 'بدون مانده دفتری ⇒ نامشخص، نه عدد فاکتوری');
assert.equal(none.summary.receivableSource.authoritative, false);
assert.ok(none.summary.receivableSource.blockedReason.length > 0);
console.log('receivableSingleSourceContracts OK');
