import assert from 'node:assert/strict';
import test from 'node:test';
import {monitorCashDiscounts} from '../src/lib/cashDiscountMonitoring.ts';
const period={from:'2026-11-01',to:'2026-11-30',sourceComplete:true};
test('posted invoices aggregate once by invoice and distribution note',()=>{
 const out=monitorCashDiscounts([
  {id:'a',issuedOn:'2026-11-10',status:'POSTED',distributionNoteId:'D1',cashDiscountRials:120},
  {id:'a',issuedOn:'2026-11-10',status:'POSTED',distributionNoteId:'D1',cashDiscountRials:120},
  {id:'b',issuedOn:'2026-11-11',status:'FINAL',distributionNoteId:'D1',cashDiscountRials:80},
  {id:'c',issuedOn:'2026-11-12',status:'CONFIRMED',distributionNoteId:'D2',cashDiscountRials:0},
  {id:'draft',issuedOn:'2026-11-12',status:'DRAFT',distributionNoteId:'D1',cashDiscountRials:900},
  {id:'void',issuedOn:'2026-11-12',status:'POSTED',isVoided:true,cashDiscountRials:900}
 ],period);
 assert.equal(out.status,'AVAILABLE');
 if(out.status!=='AVAILABLE')return;
 assert.equal(out.invoiceCount,3);
 assert.equal(out.invoiceDiscountRials,200);
 assert.deepEqual(out.byDistribution.map(x=>[x.distributionNoteId,x.amountRials]),[['D1',200],['D2',0]]);
});
test('missing discount source must not become a reported zero',()=>{
 assert.equal(monitorCashDiscounts([{id:'a',issuedOn:'2026-11-10',status:'FINAL',cashDiscountRials:null}],period).status,'UNAVAILABLE');
 assert.equal(monitorCashDiscounts([],{...period,sourceComplete:false}).status,'UNAVAILABLE');
});
test('conflicting invoice duplicates are blocked, not double counted',()=>{
 const x=monitorCashDiscounts([
  {id:'a',issuedOn:'2026-11-10',status:'POSTED',distributionNoteId:'D1',cashDiscountRials:100},
  {id:'a',issuedOn:'2026-11-10',status:'POSTED',distributionNoteId:'D2',cashDiscountRials:100}
 ],period);
 assert.equal(x.status,'UNAVAILABLE');
});
test('invoice without distribution note remains in invoice total and unmatched count',()=>{
 const x=monitorCashDiscounts([{id:'a',issuedOn:'2026-11-10',status:'POSTED',cashDiscountRials:150}],period);
 assert.equal(x.status,'AVAILABLE');
 if(x.status==='AVAILABLE'){assert.equal(x.invoiceDiscountRials,150);assert.equal(x.unassignedInvoiceCount,1);assert.equal(x.distributionNoteCount,0);}
});
