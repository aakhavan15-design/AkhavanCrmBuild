import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileRouteNetSales} from '../server/routeMapMoney.mjs';

test('do not present invoiced lines as net sales when return feed is not confirmed',()=>{
 assert.equal(reconcileRouteNetSales({
   invoicedAmount:'10000000',invoiceSourceReady:true,returnSourceReady:false
 }).netSales,null);
});
test('documented returns are subtracted for the selected period',()=>{
 const x=reconcileRouteNetSales({
   invoicedAmount:'10000000',returnedAmount:'2500000',invoiceSourceReady:true,returnSourceReady:true
 });
 assert.equal(x.status,'VERIFIED');assert.equal(x.netSales,7500000);
});
test('a return-only period can have negative net sales',()=>{
 const x=reconcileRouteNetSales({
   invoicedAmount:null,returnedAmount:'150000',invoiceSourceReady:true,returnSourceReady:true
 });
 assert.equal(x.netSales,-150000);
});
test('verified zero activity is zero, not unknown',()=>{
 const x=reconcileRouteNetSales({invoiceSourceReady:true,returnSourceReady:true});
 assert.equal(x.netSales,0);
});
test('dangerously large amounts fail closed instead of rounding financial evidence',()=>{
 const x=reconcileRouteNetSales({invoicedAmount:'999999999999999999999',returnedAmount:0,
   invoiceSourceReady:true,returnSourceReady:true});
 assert.equal(x.status,'UNSAFE_AMOUNT');assert.equal(x.netSales,null);
});
