import {strict as assert} from 'node:assert';
import {buildCashFlowProjection} from '../src/lib/cashFlowEngine.ts';

const seed={
  asOf:'2026-11-23',horizonDays:2,
  treasuryAccounts:[{id:'bank',openingBalance:1000}],
  treasuryTransactions:[],supplierBills:[],expenses:[],
  cheques:[
    {id:'out-overdue',direction:'PAYABLE',amount:300,status:'PENDING',dueDate:'2026-11-20'},
    {id:'in-overdue',direction:'RECEIVABLE',amount:200,status:'PENDING',dueDate:'2026-11-21'},
    {id:'out-future',direction:'PAYABLE',amount:100,status:'PENDING',dueDate:'2026-11-24'}
  ]
};
const base=buildCashFlowProjection(seed);
assert.equal(base.opening.balance,1000);
assert.equal(base.overdue.outflow,300);
assert.equal(base.overdue.inflow,200);
assert.equal(base.days[0].outflow,300,'past-due obligations are day-one cash requirements');
assert.equal(base.days[0].inflow,0,'past-due incoming cheque is not guaranteed');
assert.equal(base.days[0].projectedBalance,700);
assert.equal(base.totals.outflow,400);
assert.equal(base.days.at(-1).projectedBalance,base.opening.balance + base.totals.net);
const optimistic=buildCashFlowProjection({...seed,overdueTreatment:'FIRST_DAY'});
assert.equal(optimistic.days[0].outflow,300);
assert.equal(optimistic.days[0].inflow,200);
assert.equal(optimistic.days[0].projectedBalance,900);
assert.equal(optimistic.days.at(-1).projectedBalance,optimistic.opening.balance + optimistic.totals.net);
const conservative=buildCashFlowProjection({...seed,includeIncoming:false});
assert.equal(conservative.days[0].inflow,0);
assert.equal(conservative.days[0].outflow,300);
assert.equal(conservative.days.at(-1).projectedBalance,600);
console.log('cashFlowScenarioReconciliation: PASS');
