import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileRouteNetSales} from '../server/routeMapMoney.mjs';
import {calculateNetSalesCore} from '../shared/financialArithmetic.mjs';

const ready={invoiceSourceReady:true,returnSourceReady:true};
const ledger=(gross,returns)=>({verified:true,scopeMatches:true,gross,returns});

test('route net sales unavailable when only ERP feed existence is known',()=>{
 const x=reconcileRouteNetSales({...ready,invoicedAmount:10000000,returnedAmount:2500000});
 assert.equal(x.status,'UNVERIFIED');assert.equal(x.netSales,null);
 assert.equal(x.billedSales,10000000);
});
test('only scope-matched posted ledger validates route net sales',()=>{
 const args={...ready,invoicedAmount:'10000000',returnedAmount:'2500000'};
 const x=reconcileRouteNetSales({...args,ledgerEvidence:ledger(10000000,2500000)});
 assert.equal(x.status,'VERIFIED');
 assert.equal(x.netSales,7500000);
 assert.equal(x.netSales,calculateNetSalesCore(10000000,2500000));
 assert.equal(reconcileRouteNetSales({...args,ledgerEvidence:ledger(10000000,2000000)}).status,'MISMATCH');
 assert.equal(reconcileRouteNetSales({...args,ledgerEvidence:{...ledger(10000000,2500000),scopeMatches:false}}).netSales,null);
});
test('earlier-invoice return gives negative month only when zero gross and ledger both verified',()=>{
 const args={...ready,invoicedAmount:0,returnedAmount:150000,ledgerEvidence:ledger(0,150000)};
 assert.equal(reconcileRouteNetSales(args).netSales,-150000);
 assert.equal(reconcileRouteNetSales({...args,invoicedAmount:null}).netSales,null);
});
test('zero requires explicit data and matching ledger proof',()=>{
 assert.equal(reconcileRouteNetSales({...ready,ledgerEvidence:ledger(0,0)}).netSales,null);
 assert.equal(reconcileRouteNetSales({...ready,invoicedAmount:0,returnedAmount:0,ledgerEvidence:ledger(0,0)}).netSales,0);
});
test('missing returns, unsafe magnitude and malformed decimal cannot masquerade as evidence',()=>{
 assert.equal(reconcileRouteNetSales({...ready,returnSourceReady:false,invoicedAmount:100,returnedAmount:0}).netSales,null);
 assert.equal(reconcileRouteNetSales({...ready,invoicedAmount:'999999999999999999999',returnedAmount:0}).netSales,null);
 assert.equal(reconcileRouteNetSales({...ready,invoicedAmount:'',returnedAmount:0}).netSales,null);
 assert.equal(calculateNetSalesCore(null,0),null);
 assert.equal(calculateNetSalesCore(200,300),-100);
});
