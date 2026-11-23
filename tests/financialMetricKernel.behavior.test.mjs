import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNetSales, calculateLedgerBalance, buildNetSalesEvidence, reconcileNetSales } from '../src/lib/financialMetricKernel.ts';
import { queryLocalRecords } from '../src/services/localQuery.ts';
import { allocateLifo } from '../src/services/agingBuckets.ts';

const doc=(id,invoiceId,amount,postedAt='2026-11-15')=>({
  id,invoiceId,customerId:'C1',amount,postedAt,status:'POSTED',sourceType:'ERP_MIRROR',
});
const inv=(id,date,amount)=>({id,customerId:'C1',date,totalAmount:amount});

test('canonical net sales is gross less posted returns; missing data stays unknown',()=>{
  assert.equal(calculateNetSales(1000,200),800);
  assert.equal(calculateNetSales(1000,0),1000);
  assert.equal(calculateNetSales(1000,null),null);
  assert.equal(calculateNetSales(null,100),null);
  assert.equal(calculateNetSales(1000,Number.NaN),null);
});
test('customer and overall net sales use one posted ERP mirror evidence source',()=>{
  const result=buildNetSalesEvidence(
    [inv('i1','2026-11-10',100),inv('i2','2026-11-12',200)],
    [doc('r1','i1',25),{...doc('draft','i2',50),status:'DRAFT'}],
    {from:'2026-11-01',to:'2026-11-30',returnsVerified:true});
  assert.equal(result.status,'AVAILABLE');
  assert.equal(result.gross,300);
  assert.equal(result.returns,25);
  assert.equal(result.net,275);
  assert.equal(result.byCustomer[0].value,275);
  assert.deepEqual(result.facts.map(f=>f.amount),[75,200]);
});
test('return of last month invoice reduces this month net even with no current invoice',()=>{
  const report=buildNetSalesEvidence([inv('old','2026-10-12',300)],
    [doc('r1','old',60)],{from:'2026-11-01',to:'2026-11-30',returnsVerified:true});
  assert.equal(report.status,'AVAILABLE');
  assert.equal(report.net,-60);
  assert.equal(report.returns,60);
  assert.equal(report.byCustomer[0].value,-60);
  assert.equal(report.facts.length,0);
});
test('incomplete source, unlinked, duplicate and invalid returns never become confirmed zero',()=>{
  const inputs=[inv('i1','2026-11-10',100)];
  assert.equal(buildNetSalesEvidence(inputs,[],{to:'2026-11-30',returnsVerified:false}).net,null);
  assert.equal(buildNetSalesEvidence(inputs,[doc('r1','missing',40)],{to:'2026-11-30',returnsVerified:true}).status,'UNAVAILABLE');
  assert.equal(buildNetSalesEvidence(inputs,[doc('r1','i1',40),doc('r1','i1',40)],{to:'2026-11-30',returnsVerified:true}).status,'UNAVAILABLE');
});
test('posted balance excludes provisional journal; all-non-void includes it',()=>{
  const lines=[
    {debitAmount:100,creditAmount:0,status:'POSTED'},
    {debitAmount:0,creditAmount:20,status:'FINAL'},
    {debitAmount:0,creditAmount:30,status:'PENDING'},
    {debitAmount:900,creditAmount:0,status:'VOID',isVoided:true}
  ];
  assert.equal(calculateLedgerBalance(lines,'POSTED_ONLY'),80);
  assert.equal(calculateLedgerBalance(lines,'ALL_NON_VOID'),50);
  assert.equal(calculateLedgerBalance([{debitAmount:12,creditAmount:0}],'POSTED_ONLY'),0);
  assert.equal(calculateLedgerBalance([{debitAmount:12,creditAmount:0}],'ALL_NON_VOID'),12);
  assert.equal(calculateLedgerBalance([{debitAmount:null,creditAmount:0,status:'POSTED'}],'POSTED_ONLY'),null);
  assert.equal(calculateLedgerBalance([{debitAmount:'bad',creditAmount:0,status:'POSTED'}],'POSTED_ONLY'),null);
});
test('local query applies strict filters before paging and does not silently ignore unknown fields',()=>{
  const list=[
    {id:'1',customerId:'C1',date:'2026-11-01',status:'POSTED',invoiceNumber:'100'},
    {id:'2',customerId:'C2',date:'2026-11-02',status:'DRAFT',invoiceNumber:'101'},
    {id:'3',customerId:'C1',date:'2026-11-03',status:'POSTED',invoiceNumber:'102'},
  ];
  const result=queryLocalRecords(list,{customerId:'C1',status:'POSTED'}, {page:2,pageSize:1,sortBy:'invoiceNumber'},25);
  assert.equal(result.total,2);
  assert.equal(result.page,2);
  assert.equal(result.items[0].id,'3');
  assert.equal(queryLocalRecords(list,{unknownField:'x'},undefined,25).total,0);
  assert.equal(queryLocalRecords(list,{fromDate:'2026-11-02'},undefined,25).total,2);
});

test('official ledger and customer detail must reconcile before net-sales claims',()=>{
  const data=buildNetSalesEvidence([inv('i1','2026-11-12',200)],[doc('r1','i1',40)],
    {from:'2026-11-01',to:'2026-11-30',returnsVerified:true});
  assert.equal(reconcileNetSales(data,200,40,true).status,'RECONCILED');
  assert.equal(reconcileNetSales(data,200,10,true).status,'MISMATCH');
  assert.equal(reconcileNetSales(data,null,40,true).status,'UNAVAILABLE');
  assert.equal(reconcileNetSales(data,200,40,false).status,'UNAVAILABLE');
});

test('FIFO settlement leaves newest invoices outstanding via one LIFO financial display',()=>{
  const invoices=[3,7,8,12].map((amount,i)=>({
    id:String(i+1),total:amount,date:`2026-11-${String(i+1).padStart(2,'0')}`,number:String(i+1)
  }));
  const coverage=allocateLifo(25,invoices);
  const byInvoice=Object.fromEntries(coverage.rows.map(row=>[row.id,row.covered]));
  assert.deepEqual(byInvoice,{'1':0,'2':5,'3':8,'4':12});
  assert.equal(coverage.unattributed,0);
  assert.equal(coverage.rows.reduce((sum,row)=>sum+row.covered,0),25);
});
