import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDispatchEvidence,proposeDispatchPenaltyReviews } from '../src/lib/dispatchIntelligence.mjs';
const invoice=(id,sellerId,grossRials)=>({id,customerId:'c'+id,sellerId,dispatchNumber:'H100',grossRials,status:'POSTED'});
test('dispatch: linked return follows original invoice; unbased is separately visible',()=>{
 const data=buildDispatchEvidence({dispatchNumber:'H100',invoiceComplete:true,returnComplete:true,financeComplete:true,
 invoices:[invoice('1','X',100_000_000),invoice('2','Z',40_000_000)],
 returns:[{id:'R1',invoiceId:'1',customerId:'c1',amountRials:20_000_000,status:'FINAL'},
          {id:'R2',dispatchNumber:'H100',customerId:'other',sellerId:'X',amountRials:5_000_000,status:'POSTED'}],
 journalEntries:[{id:'J1',dispatchNumber:'H100',bucket:'CASH',amountRials:30_000_000,status:'POSTED'},
   {id:'J2',dispatchNumber:null,bucket:'CASH',amountRials:100_000_000,status:'POSTED'}]});
 assert.equal(data.status,'AVAILABLE');assert.equal(data.grossRials,140_000_000);
 assert.equal(data.linkedReturnsRials,20_000_000);assert.equal(data.unbasedReturnsRials,5_000_000);
 assert.equal(data.netLinkedSalesRials,120_000_000);assert.equal(data.journal.CASH,30_000_000);
 assert.equal(data.sellers.find(x=>x.sellerId==='X').returnInvoiceRate,1);
 const tasks=proposeDispatchPenaltyReviews(data,[{code:'RETURN_RATE',version:'v1',metric:'RETURN_INVOICE_RATE',maxRate:.5,enabled:true}]);
 assert.equal(tasks.length,1);assert.equal(tasks[0].sellerId,'X');
 assert.equal(tasks[0].status,'PENDING_HUMAN_REVIEW');
 assert.equal(proposeDispatchPenaltyReviews(data,[{code:'RETURN_RATE',version:'v1',metric:'RETURN_INVOICE_RATE',maxRate:.5,enabled:true}],[tasks[0].taskKey]).length,0);
});
test('dispatch: missing verified journal does not pretend cash zero',()=>{
 const data=buildDispatchEvidence({dispatchNumber:'H100',invoiceComplete:true,returnComplete:true,
  invoices:[invoice('1','X',10)],returns:[],journalEntries:[]});
 assert.equal(data.status,'PARTIAL');assert.equal(data.journal.CASH,null);
});
test('dispatch: unrelated later collection cannot become dispatch cash',()=>{
 const data=buildDispatchEvidence({dispatchNumber:'H100',invoiceComplete:true,returnComplete:true,financeComplete:true,
  invoices:[invoice('1','X',10)],returns:[],journalEntries:[{id:'late',dispatchNumber:'H999',amountRials:5,bucket:'CASH',status:'POSTED'}]});
 assert.equal(data.journal.CASH,0);
});
test('dispatch: invalid seller, duplicate invoice and cross-customer return fail closed',()=>{
 const a={dispatchNumber:'H100',invoiceComplete:true,returnComplete:true,financeComplete:true};
 assert.equal(buildDispatchEvidence({...a,invoices:[invoice('1','X',10),invoice('1','X',10)],returns:[]}).status,'UNAVAILABLE');
 assert.equal(buildDispatchEvidence({...a,invoices:[invoice('1','X',10)],returns:[{id:'r',invoiceId:'1',customerId:'WRONG',amountRials:1,status:'POSTED'}]}).status,'UNAVAILABLE');
});

test('receivables: seller 90m of 100m triggers review only with verified invoice-level balance',()=>{
 const base={dispatchNumber:'H100',invoiceComplete:true,returnComplete:true,financeComplete:true,
  invoices:[invoice('1','X',100_000_000),invoice('2','Z',40_000_000)],returns:[],journalEntries:[]};
 const absent=buildDispatchEvidence(base);
 assert.equal(absent.sellers.find(x=>x.sellerId==='X').receivableRate,null);
 const known=buildDispatchEvidence({...base,receivableComplete:true,asOf:'2026-11-24',
   invoiceOutstanding:[{invoiceId:'1',amountRials:90_000_000},{invoiceId:'2',amountRials:0}]});
 assert.equal(known.invoiceReceivableRials,90_000_000);
 assert.equal(known.sellers.find(x=>x.sellerId==='X').receivableRate,.9);
 const policy=[{enabled:true,code:'UNPAID',version:'2026-01',metric:'RECEIVABLE_RATE',maxRate:.7}];
 assert.equal(proposeDispatchPenaltyReviews(absent,policy).length,0);
 assert.equal(proposeDispatchPenaltyReviews(known,policy).length,1);
 const missing=buildDispatchEvidence({...base,receivableComplete:true,invoiceOutstanding:[{invoiceId:'1',amountRials:90_000_000}]});
 assert.equal(missing.status,'UNAVAILABLE');
});
