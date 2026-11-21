import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { buildCashFlowProjection, evaluatePayability } from '../src/lib/cashFlowEngine.ts';
const base={asOf:'2026-11-19',horizonDays:7,cheques:[],supplierBills:[],expenses:[],treasuryAccounts:[],treasuryTransactions:[]};
const empty=buildCashFlowProjection(base);
assert.equal(empty.opening.balance,null);
assert.equal(empty.days.length,7);
assert.equal(evaluatePayability(empty,'2026-11-20',100,0).feasible,null);
const source=readFileSync('src/services/dataProvider.ts','utf8');
assert.equal((source.match(/async getCashFlowData\(\)/g)||[]).length,2);
assert.ok(readFileSync('src/components/PlannedModulePage.tsx','utf8').includes("item.id === 'fin-liquidity'"));
const partialCheque = buildCashFlowProjection({
  ...base,
  supplierBills: [{ id: 'bill', amount: 1000, paidAmount: 100, dueDate: '2026-11-20' }],
  cheques: [{ id: 'cheque', direction: 'PAYABLE', billId: 'bill', amount: 200, dueDate: '2026-11-21', status: 'PENDING' }],
});
assert.equal(partialCheque.totals.outflow, 900);
assert.equal(partialCheque.items.find(item => item.kind === 'SUPPLIER_BILL').amount, 700);
const partialOpening = buildCashFlowProjection({ ...base, treasuryAccounts: [{ id: 'known', openingBalance: 1000 }, { id: 'unknown' }] });
assert.equal(partialOpening.opening.status, 'PARTIAL');
assert.equal(partialOpening.days[0].projectedBalance, null);
assert.equal(evaluatePayability(partialOpening, '2026-11-20', 100, 0).feasible, null);
const unpriced = buildCashFlowProjection({
  ...base, treasuryAccounts: [{ id: 'treasury', openingBalance: 1000 }],
  supplierBills: [{ id: 'unknown-paid', amount: 1000, dueDate: '2026-11-21' }],
});
assert.equal(evaluatePayability(unpriced, '2026-11-20', 100, 0).reason, 'INCOMPLETE_INPUT');
console.log('cashFlowRecoveryContracts: PASS');
