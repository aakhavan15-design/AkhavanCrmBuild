import assert from 'node:assert/strict';
import { assessOrderRisk, calculateProfitability, buildOperationsMetrics, calculateCreditMetrics, analyzeReturns, evaluateDispatchPlan } from '../src/lib/operationsEngine.ts';

const order = { id: 'o1', orderNumber: 'O1', customerId: 'c1', totalAmount: 100, costAmount: 80, costKnown: true, status: 'DRAFT', createdAt: '2026-01-01T10:00:00Z' };
const risks = assessOrderRisk({ order, customer: { id: 'c1', balance: 90, creditLimit: 150 }, officialReceivableBalance: 90, ledgerVerified: true, orders: [{ ...order, id: 'o2', orderNumber: 'O2' }], policies: [{ id: 'p1', type: 'MIN_MARGIN', value: '25', enabled: true }], invoices: [], returns: [] });
assert.ok(risks.some(r => r.code === 'CREDIT_LIMIT'));
assert.ok(risks.some(r => r.code === 'LOW_MARGIN'));
assert.ok(risks.some(r => r.code === 'POSSIBLE_DUPLICATE'));
const policyRisks = assessOrderRisk({ order: { ...order, discountPercent: 15 }, customer: { id: 'c1', balance: 20, creditLimit: 1000 }, policies: [{ type: 'MAX_DISCOUNT', scope: 'COMPANY', value: '10', enabled: true }], invoices: [], returns: [] });
assert.ok(policyRisks.some(r => r.code === 'MAX_DISCOUNT' && r.blocking === true));
const scopedPolicyRisks = assessOrderRisk({ order, customer: { id: 'c1', balance: 0, creditLimit: 1000 }, policies: [{ type: 'NO_CREDIT', scope: 'CUSTOMER', value: 'another-customer', enabled: true }], invoices: [{ customerId: 'c1', balance: 50 }], returns: [] });
assert.ok(!scopedPolicyRisks.some(r => r.code === 'NO_CREDIT_POLICY'));
const unknown = assessOrderRisk({ order: { ...order, costKnown: false, costAmount: null }, customer: { id: 'c1' } });
assert.ok(unknown.some(r => r.code === 'COST_UNKNOWN'));
const profit = calculateProfitability({ invoices: [{ totalAmount: 1000, balance: 300 }], returns: [{ amount: 100, financialDocumentConfirmed: false }, { amount: 50, financialDocumentConfirmed: true }], payments: [{ amount: 400, status: 'CLEARED', method: 'TRANSFER' }, { amount: 200, status: 'PENDING', method: 'CASH' }], orders: [{ totalAmount: 100, costAmount: 60, costKnown: true }], dispatchPlans: [], expenses: [] });
assert.equal(profit.netSales, null, 'unreconciled ERP sales cannot be published as official net');
assert.equal(profit.unconfirmedReturns, 100);
assert.equal(profit.clearedPayments, 400);
assert.equal(profit.estimatedGrossProfit, 40);
assert.equal(profit.operationalProfit, null);
assert.equal(profit.operationalProfitStatus, 'UNAVAILABLE');
const metrics = buildOperationsMetrics({ orders: [{ ...order }, { ...order, id: 'o3', status: 'CANCELLED' }], invoices: [{ salesOrderId: 'o1' }], returns: [{ amount: 20, financialDocumentConfirmed: false }], dispatchPlans: [{ capacityKg: 100, plannedWeightKg: 50 }], payments: [{ amount: 5, status: 'CLEARED' }] });
assert.equal(metrics.orderCount, 2);
assert.equal(metrics.cancelledOrders, 1);
assert.equal(metrics.invoicedOrderCount, 1);
assert.equal(metrics.dispatchCapacityCoverage, 50);
assert.equal(metrics.unconfirmedReturnAmount, 20);
const credit = calculateCreditMetrics({ invoices: [{ id: 'i1', totalAmount: 100, balance: 0, status: 'PAID', date: '2026-01-01', dueDate: '2026-01-10' }], payments: [{ id: 'p1', status: 'CLEARED', date: '2026-01-11', amount: 100 }], allocations: [{ paymentId: 'p1', invoiceId: 'i1', amount: 100 }], cheques: [{ status: 'BOUNCED' }, { status: 'PENDING' }], asOf: new Date('2026-02-01T00:00:00Z') });
assert.equal(credit.averageSettlementDays, 10);
assert.equal(credit.medianSettlementDays, 10);
assert.equal(credit.settlementSampleSize, 1);
assert.equal(credit.bouncedChequeCount, 1);
assert.equal(credit.unresolvedChequeCount, 1);
assert.equal(credit.allocatedCollectionRatePercent, 100);
const causes = analyzeReturns([{ reasonCode: 'DAMAGE', amount: 20, financialDocumentConfirmed: false }, { reasonCode: 'DAMAGE', amount: 10, financialDocumentConfirmed: true }, { amount: 5 }]);
assert.equal(causes[0].reasonCode, 'DAMAGE');
assert.equal(causes[0].count, 2);
assert.equal(causes[0].unconfirmedAmount, 20);
const dispatch = evaluateDispatchPlan({ capacityKg: 100, plannedWeightKg: 120, zone: 'NORTH', orderIds: ['o1'] }, [{ id: 'o1', zone: 'SOUTH' }]);
assert.equal(dispatch.capacityUtilizationPercent, 120);
assert.ok(dispatch.signals.some(r => r.code === 'DISPATCH_OVER_CAPACITY' && r.blocking));
assert.ok(dispatch.signals.some(r => r.code === 'DISPATCH_ZONE_MISMATCH'));

const safeProfit = calculateProfitability({
  invoices: [
    { totalAmount: 1000, balance: 300, status: 'UNPAID' },
    { totalAmount: 9000, balance: 9000, status: 'CANCELLED' },
    { totalAmount: 8000, balance: 8000, isVoided: true },
    { totalAmount: 'bad', balance: 'bad', status: 'UNPAID' },
  ],
  returns: [
    { amount: 100, financialDocumentConfirmed: true, status: 'APPROVED' },
    { amount: 700, financialDocumentConfirmed: true, status: 'CANCELLED' },
  ],
  payments: [
    { amount: 250, status: 'CLEARED' },
    { amount: 5000, status: 'CLEARED', isVoided: true },
    { amount: 'invalid', status: 'CLEARED' },
  ],
});
assert.equal(safeProfit.invoiceGross, 1000, 'voided/cancelled/invalid invoices are excluded from realized gross');
assert.equal(safeProfit.receivableBalance, null, 'invoice.balance cannot replace verified ledger');
assert.equal(safeProfit.confirmedReturns, 100, 'cancelled returns are excluded');
assert.equal(safeProfit.clearedPayments, 250, 'voided and malformed payments are excluded');

const safeCredit = calculateCreditMetrics({
  invoices: [
    { id: 'valid', totalAmount: 100, balance: 50, status: 'UNPAID', date: '2026-01-01', dueDate: '2026-01-10' },
    { id: 'void', totalAmount: 1000, balance: 1000, status: 'VOID', date: '2026-01-01', dueDate: '2026-01-02' },
  ],
  payments: [
    { id: 'valid-payment', status: 'CLEARED', date: '2026-01-11' },
    { id: 'void-payment', status: 'CLEARED', date: '2026-01-11', isVoided: true },
  ],
  allocations: [
    { paymentId: 'valid-payment', invoiceId: 'valid', amount: 50 },
    { paymentId: 'void-payment', invoiceId: 'valid', amount: 100 },
    { paymentId: 'valid-payment', invoiceId: 'void', amount: 100 },
    { paymentId: 'valid-payment', invoiceId: 'valid', amount: 100, isReversed: true },
  ],
  asOf: new Date('2026-02-01T00:00:00Z'),
});
assert.equal(safeCredit.overdueInvoiceCount, null, 'overdue is unavailable without posted ledger invoice allocation');
assert.equal(safeCredit.overdueBalance, null, 'unverified invoice.balance is not overdue balance');
assert.equal(safeCredit.clearedAllocatedAmount, 50, 'only valid allocations against valid invoices/payments are included');
assert.equal(safeCredit.settlementSampleSize, 1, 'reversed and void-linked allocations are excluded');

const unknownCredit = assessOrderRisk({
  order: { id: 'unknown', customerId: 'c1', totalAmount: 100, costKnown: false },
  customer: { id: 'c1', balance: null, creditLimit: null },
  invoices: [{ customerId: 'c1', balance: 500, status: 'VOID' }],
});
assert.ok(unknownCredit.some(signal => signal.code === 'CREDIT_UNKNOWN'), 'null balance and limit are unknown, not coerced to zero');
assert.ok(!unknownCredit.some(signal => signal.code === 'NO_CREDIT_POLICY'), 'void invoices do not create receivable risk');

console.log('operationsEngine: PASS (39 assertions)');


const verifiedProfit=calculateProfitability({
  invoices:[{totalAmount:1000,status:'POSTED'}],
  returns:[{amount:50,financialDocumentConfirmed:true,status:'POSTED'}],
  officialLedgerGross:1000,officialLedgerReturns:50,
  verifiedLedgerScope:true,returnSourceComplete:true,
  officialReceivableBalance:300,receivableLedgerVerified:true,
});
assert.equal(verifiedProfit.netSales,950);
assert.equal(verifiedProfit.receivableBalance,300);
const verifiedRisk=assessOrderRisk({
  order,customer:{id:'c1',balance:0,creditLimit:150},
  officialReceivableBalance:90,ledgerVerified:true
});
assert.ok(verifiedRisk.some(r=>r.code==='CREDIT_LIMIT'));
const withheldRisk=assessOrderRisk({
  order,customer:{id:'c1',balance:200,creditLimit:150}
});
assert.ok(!withheldRisk.some(r=>r.code==='CREDIT_LIMIT'));
assert.ok(withheldRisk.some(r=>r.code==='CREDIT_UNKNOWN'));
const verifiedCredit=calculateCreditMetrics({
  invoices:[{id:'i1',totalAmount:100,status:'POSTED',balance:0,dueDate:'2026-01-10'}],
  ledgerVerified:true,invoiceOutstandingById:{i1:50},
  asOf:new Date('2026-02-01T00:00:00Z')
});
assert.equal(verifiedCredit.overdueInvoiceCount,1);
assert.equal(verifiedCredit.overdueBalance,50);
