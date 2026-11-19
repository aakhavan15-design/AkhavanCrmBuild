import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSeedData, applyDemoSeed, DEMO_PREFIX } from '../src/lib/seed.ts';
import { reconcileReceivables } from '../src/lib/receivableReconciliation.ts';

test('report demo seed is relational, generated, isolated and suitable for receivable/cashflow reports', () => {
  const asOf = new Date('2026-11-08T12:00:00.000Z');
  const state = generateSeedData({ includeDemo: false });
  // Legacy sample rows from an earlier seed version: pending allocations and an
  // unlinked credit note must be repaired/ignored without touching real rows.
  state.invoices.push({ id:'demo-legacy-invoice', invoiceNumber:'LEGACY-SAMPLE', customerId:'demo-legacy-customer', accountId:'demo-legacy-customer', totalAmount:100000000, paidAmount:60000000, balance:40000000, status:'PARTIAL', date:'2026-10-01', dueDate:'2026-10-20' });
  state.payments.push({ id:'demo-legacy-pending-payment', customerId:'demo-legacy-customer', accountId:'demo-legacy-customer', amount:60000000, date:'2026-10-05', method:'CHEQUE', status:'PENDING' });
  state.paymentAllocations.push({ id:'demo-legacy-pending-allocation', paymentId:'demo-legacy-pending-payment', invoiceId:'demo-legacy-invoice', amount:60000000, createdAt:'2026-10-05T10:00:00Z' });
  state.creditNotes.push({ id:'demo-legacy-unlinked-credit', customerId:'demo-legacy-customer', amount:5000000, status:'POSTED' });
  state.invoices.push({ id:'real-invoice-preserved', invoiceNumber:'REAL-1', customerId:'real-customer', totalAmount:900, paidAmount:100, balance:800, status:'PARTIAL', date:'2026-10-01' });
  const first = applyDemoSeed(state, asOf);
  assert.ok(first.total > 0);
  assert.ok(state.seedMetadata?.mode === 'LOCAL_TEST');

  const demo = key => (state[key] || []).filter(row => String(row.id || '').startsWith(DEMO_PREFIX));
  const invoices = demo('invoices');
  const invoiceById = new Map(invoices.map(row => [row.id, row]));
  const payments = demo('payments');
  const allocations = demo('paymentAllocations');
  const credits = demo('creditNotes').filter(row => row.sourceType === 'ERP_MIRROR' && row.externalCreditNoteId && row.sourceSystemCode && row.invoiceId && invoiceById.has(row.invoiceId) && Number(row.amount) > 0 && ['POSTED','APPROVED'].includes(String(row.status).toUpperCase()) && !row.isVoided);
  const expenses = demo('expenses');
  const cheques = demo('cheques');

  assert.ok(invoices.length >= 20, 'generated invoices provide meaningful report volume');
  assert.equal(state.paymentAllocations.some(row => row.id === 'demo-legacy-pending-allocation'), false, 'legacy pending cheque allocation is removed from demo facts');
  assert.equal(state.invoices.find(row => row.id === 'demo-legacy-invoice').balance, 95000000, 'legacy invoice balance is rebuilt from cleared allocations and sample credit note only');
  assert.equal(state.invoices.find(row => row.id === 'real-invoice-preserved').balance, 800, 'non-demo records remain untouched');
  assert.ok(payments.length > 0 && allocations.length > 0);
  assert.ok(expenses.some(row => row.status === 'PAID'));
  assert.ok(cheques.some(row => row.direction === 'PAYABLE' && row.status !== 'CLEARED'));
  assert.ok([...invoices, ...payments, ...allocations, ...expenses].every(row => row.source === 'LOCAL_TEST'));

  const paymentById = new Map(payments.map(row => [row.id, row]));
  for (const allocation of allocations) {
    assert.equal(paymentById.get(allocation.paymentId)?.status, 'CLEARED', 'pending payment must never be allocated');
    assert.ok(invoiceById.has(allocation.invoiceId), 'allocation must reference generated invoice');
  }
  for (const credit of credits) {
    assert.equal(credit.sourceType, 'ERP_MIRROR');
    assert.ok(credit.externalCreditNoteId && credit.sourceSystemCode);
    assert.ok(invoiceById.has(credit.invoiceId), 'credit note must reference generated invoice');
    assert.equal(credit.customerId, invoiceById.get(credit.invoiceId).customerId);
  }

  const result = reconcileReceivables(invoices, payments, allocations, credits, asOf);
  assert.equal(result.issues.length, 0, `sample receivables must reconcile: ${JSON.stringify(result.issues)}`);
  assert.ok(result.totalInvoiceAmount > 0);
  assert.ok(result.totalValidAllocated > 0);
  assert.ok(result.totalValidCredits > 0);
  assert.ok(result.totalOutstanding > 0);

  const second = applyDemoSeed(state, asOf);
  assert.equal(second.total, 0, 're-running sample generation must not duplicate records');
  assert.ok(second.skipped > 0);
});
